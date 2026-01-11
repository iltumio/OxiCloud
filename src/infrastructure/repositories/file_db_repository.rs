use std::str::FromStr;
use async_trait::async_trait;
use sqlx::{PgPool, Row, Postgres, Transaction};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use futures::{Stream, StreamExt};
use bytes::Bytes;
use tokio::fs::File as TokioFile;
use tokio_util::codec::{BytesCodec, FramedRead};

use crate::domain::entities::file::File;
use crate::domain::repositories::file_repository::{
    FileRepository, FileRepositoryError, FileRepositoryResult
};
use crate::application::ports::outbound::FileStoragePort;
use crate::domain::services::path_service::StoragePath;
use crate::infrastructure::repositories::blob_storage_repository::BlobStorageRepository;
use crate::common::errors::{DomainError, ErrorKind};

const DEFAULT_USER_ID: &str = "00000000-0000-0000-0000-000000000000";

fn file_repo_err_to_domain(err: FileRepositoryError) -> DomainError {
    match err {
        FileRepositoryError::NotFound(id) => DomainError::not_found("File", id),
        FileRepositoryError::AlreadyExists(id) => DomainError::already_exists("File", id),
        FileRepositoryError::InvalidPath(p) => DomainError::new(ErrorKind::InvalidInput, "File", format!("Invalid path: {}", p)),
        FileRepositoryError::IoError(e) => DomainError::internal_error("File", format!("IO error: {}", e)),
        FileRepositoryError::DomainError(e) => e,
        _ => DomainError::internal_error("File", format!("{}", err)),
    }
}

#[derive(Clone)]
pub struct FileDbRepository {
    pool: PgPool,
    blob_storage: BlobStorageRepository,
}

impl FileDbRepository {
    pub fn new(pool: PgPool, blob_storage: BlobStorageRepository) -> Self {
        Self { pool, blob_storage }
    }

    // Helper to build full path for a file
    async fn build_file_path(&self, folder_id: Option<Uuid>, name: &str) -> FileRepositoryResult<StoragePath> {
        if let Some(fid) = folder_id {
            // Recursive CTE to get folder path
            let query = r#"
                WITH RECURSIVE folder_path AS (
                    SELECT id, name, parent_id, 0 as level
                    FROM storage.folders
                    WHERE id = $1
                    UNION ALL
                    SELECT f.id, f.name, f.parent_id, fp.level + 1
                    FROM storage.folders f
                    JOIN folder_path fp ON f.id = fp.parent_id
                )
                SELECT name FROM folder_path ORDER BY level DESC;
            "#;

            let rows = sqlx::query(query)
                .bind(fid)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            let mut path_string = String::new();
            for row in rows {
                let fname: String = row.get("name");
                path_string.push('/');
                path_string.push_str(&fname);
            }
            path_string.push('/');
            path_string.push_str(name);
            
            Ok(StoragePath::from_string(&path_string))
        } else {
            Ok(StoragePath::from_string(&format!("/{}", name)))
        }
    }
    
    // Manage blob reference counting
    async fn increment_blob_ref<'a>(&self, tx: &mut Transaction<'a, Postgres>, multihash: &str, size: i64, mime_type: &str) -> Result<(), FileRepositoryError> {
        // Upsert blob and increment ref_count
        let query = r#"
            INSERT INTO storage.blobs (multihash, size_bytes, mime_type, ref_count)
            VALUES ($1, $2, $3, 1)
            ON CONFLICT (multihash) 
            DO UPDATE SET ref_count = storage.blobs.ref_count + 1, last_accessed_at = CURRENT_TIMESTAMP
        "#;
        
        sqlx::query(query)
            .bind(multihash)
            .bind(size)
            .bind(mime_type)
            .execute(&mut **tx)
            .await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            
        Ok(())
    }
    
    async fn decrement_blob_ref<'a>(&self, tx: &mut Transaction<'a, Postgres>, multihash: &str) -> Result<bool, FileRepositoryError> {
        // Decrement ref_count
        let query = r#"
            UPDATE storage.blobs 
            SET ref_count = ref_count - 1 
            WHERE multihash = $1
            RETURNING ref_count
        "#;
        
        let row = sqlx::query(query)
            .bind(multihash)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            
        if let Some(r) = row {
            let count: i32 = r.get("ref_count");
            if count <= 0 {
                // Delete blob record
                sqlx::query("DELETE FROM storage.blobs WHERE multihash = $1")
                    .bind(multihash)
                    .execute(&mut **tx)
                    .await
                    .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
                return Ok(true); // Should delete physical file
            }
        }
        
        Ok(false)
    }
    
    // Internal implementations that return FileRepositoryResult
    async fn internal_delete_file(&self, id: &str) -> FileRepositoryResult<()> {
        let uuid = Uuid::from_str(id).map_err(|_| FileRepositoryError::NotFound(id.to_string()))?;

        let row = sqlx::query("SELECT multihash FROM storage.files WHERE id = $1")
            .bind(uuid)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        if let Some(r) = row {
            let multihash: String = r.get("multihash");
            
            let mut tx = self.pool.begin().await
                .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            sqlx::query("DELETE FROM storage.files WHERE id = $1")
                .bind(uuid)
                .execute(&mut *tx)
                .await
                .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            let should_delete_blob = self.decrement_blob_ref(&mut tx, &multihash).await?;
            
            tx.commit().await.map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            
            if should_delete_blob {
                let _ = self.blob_storage.delete_blob(&multihash).await;
            }
            
            Ok(())
        } else {
             Err(FileRepositoryError::NotFound(id.to_string()))
        }
    }
    
    async fn internal_list_files(&self, folder_id: Option<&str>) -> FileRepositoryResult<Vec<File>> {
        let folder_uuid = match folder_id {
            Some(id) => Some(Uuid::from_str(id).map_err(|_| FileRepositoryError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };

        let query = if let Some(fid) = folder_uuid {
            sqlx::query("SELECT id, name, folder_id, mime_type, multihash, size_bytes, created_at, modified_at FROM storage.files WHERE folder_id = $1 AND owner_id = $2")
                .bind(fid)
                .bind(DEFAULT_USER_ID)
        } else {
            sqlx::query("SELECT id, name, folder_id, mime_type, multihash, size_bytes, created_at, modified_at FROM storage.files WHERE folder_id IS NULL AND owner_id = $1")
                .bind(DEFAULT_USER_ID)
        };

        let rows = query.fetch_all(&self.pool)
            .await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        let mut files = Vec::new();
        for row in rows {
            let id: Uuid = row.get("id");
            let name: String = row.get("name");
            let f_uuid: Option<Uuid> = row.get("folder_id");
            let mime_type: String = row.get("mime_type");
            let multihash: Option<String> = row.get("multihash");
            let size: i64 = row.get("size_bytes");
            let created_at: DateTime<Utc> = row.get("created_at");
            let modified_at: DateTime<Utc> = row.get("modified_at");

            let storage_path = self.build_file_path(f_uuid, &name).await?;

            files.push(File::with_timestamps(
                id.to_string(),
                name,
                storage_path,
                size as u64,
                mime_type,
                multihash,
                f_uuid.map(|u| u.to_string()),
                created_at.timestamp() as u64,
                modified_at.timestamp() as u64,
            ).map_err(|e| FileRepositoryError::Other(e.to_string()))?);
        }

        Ok(files)
    }
    
    async fn internal_get_file_content(&self, id: &str) -> FileRepositoryResult<Vec<u8>> {
        let uuid = Uuid::from_str(id).map_err(|_| FileRepositoryError::NotFound(id.to_string()))?;

        let row = sqlx::query("SELECT multihash FROM storage.files WHERE id = $1")
            .bind(uuid)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        if let Some(r) = row {
            let multihash: String = r.get("multihash");
            self.blob_storage.get_blob(&multihash).await
                .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))
        } else {
            Err(FileRepositoryError::NotFound(id.to_string()))
        }
    }
    
    async fn internal_get_file_stream(&self, id: &str) -> FileRepositoryResult<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>> {
        let uuid = Uuid::from_str(id).map_err(|_| FileRepositoryError::NotFound(id.to_string()))?;

        let row = sqlx::query("SELECT multihash FROM storage.files WHERE id = $1")
            .bind(uuid)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        if let Some(r) = row {
            let multihash: String = r.get("multihash");
            let path = self.blob_storage.get_blob_path(&multihash);
            
            let file = TokioFile::open(path).await.map_err(FileRepositoryError::IoError)?;
            let stream = FramedRead::new(file, BytesCodec::new())
                .map(|res: Result<bytes::BytesMut, std::io::Error>| res.map(|b| b.freeze()));
                
            Ok(Box::new(stream))
        } else {
            Err(FileRepositoryError::NotFound(id.to_string()))
        }
    }
    
    async fn internal_move_file(&self, id: &str, target_folder_id: Option<String>) -> FileRepositoryResult<File> {
        let uuid = Uuid::from_str(id).map_err(|_| FileRepositoryError::NotFound(id.to_string()))?;
        let target_uuid = match target_folder_id {
            Some(ref tid) => Some(Uuid::from_str(tid).map_err(|_| FileRepositoryError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };

        let row = sqlx::query(
            "UPDATE storage.files SET folder_id = $1, modified_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING name, mime_type, multihash, size_bytes, created_at, modified_at"
        )
        .bind(target_uuid)
        .bind(uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("unique constraint") {
                FileRepositoryError::AlreadyExists("File with same name already exists in destination".to_string())
            } else {
                FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            }
        })?;

        let row = row.ok_or_else(|| FileRepositoryError::NotFound(id.to_string()))?;

        let name: String = row.get("name");
        let mime_type: String = row.get("mime_type");
        let multihash: Option<String> = row.get("multihash");
        let size: i64 = row.get("size_bytes");
        let created_at: DateTime<Utc> = row.get("created_at");
        let modified_at: DateTime<Utc> = row.get("modified_at");

        let storage_path = self.build_file_path(target_uuid, &name).await?;

        File::with_timestamps(
            id.to_string(),
            name,
            storage_path,
            size as u64,
            mime_type,
            multihash,
            target_folder_id,
            created_at.timestamp() as u64,
            modified_at.timestamp() as u64,
        ).map_err(|e| FileRepositoryError::Other(e.to_string()))
    }
    
    async fn internal_get_file_path(&self, id: &str) -> FileRepositoryResult<StoragePath> {
        let file = self.get_file_by_id(id).await?;
        Ok(file.storage_path().clone())
    }
    
    async fn internal_update_file_content(&self, file_id: &str, content: Vec<u8>) -> FileRepositoryResult<()> {
        let uuid = Uuid::from_str(file_id).map_err(|_| FileRepositoryError::NotFound(file_id.to_string()))?;
        
        let (new_multihash, new_size) = self.blob_storage.save_blob(&content).await
            .map_err(FileRepositoryError::DomainError)?;

         let row = sqlx::query("SELECT multihash, mime_type FROM storage.files WHERE id = $1")
            .bind(uuid)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        if let Some(r) = row {
            let old_multihash: String = r.get("multihash");
            let mime_type: String = r.get("mime_type");
            
            if old_multihash == new_multihash {
                return Ok(());
            }

            let mut tx = self.pool.begin().await
                .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            self.increment_blob_ref(&mut tx, &new_multihash, new_size as i64, &mime_type).await?;

            sqlx::query("UPDATE storage.files SET multihash = $1, size_bytes = $2, modified_at = CURRENT_TIMESTAMP WHERE id = $3")
                .bind(&new_multihash)
                .bind(new_size as i64)
                .bind(uuid)
                .execute(&mut *tx)
                .await
                .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            let should_delete_old = self.decrement_blob_ref(&mut tx, &old_multihash).await?;
            
            tx.commit().await.map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            
            if should_delete_old {
                 let _ = self.blob_storage.delete_blob(&old_multihash).await;
            }
            
            Ok(())
        } else {
            Err(FileRepositoryError::NotFound(file_id.to_string()))
        }
    }
}

#[async_trait]
impl FileRepository for FileDbRepository {
    async fn save_file_from_bytes(
        &self,
        name: String,
        folder_id: Option<String>,
        content_type: String,
        content: Vec<u8>,
    ) -> FileRepositoryResult<File> {
        let (multihash, size) = self.blob_storage.save_blob(&content).await
            .map_err(FileRepositoryError::DomainError)?;

        let folder_uuid = match folder_id {
            Some(ref id) => Some(Uuid::from_str(id).map_err(|_| FileRepositoryError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };

        let mut tx = self.pool.begin().await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        self.increment_blob_ref(&mut tx, &multihash, size as i64, &content_type).await?;
        
        let row = sqlx::query(
            r#"
            INSERT INTO storage.files (name, folder_id, multihash, mime_type, size_bytes, owner_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, created_at, modified_at
            "#
        )
        .bind(&name)
        .bind(folder_uuid)
        .bind(&multihash)
        .bind(&content_type)
        .bind(size as i64)
        .bind(DEFAULT_USER_ID)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            if e.to_string().contains("unique constraint") {
                FileRepositoryError::AlreadyExists(name.clone())
            } else {
                FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            }
        });

        match row {
            Ok(r) => {
                tx.commit().await.map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
                
                let id: Uuid = r.get("id");
                let created_at: DateTime<Utc> = r.get("created_at");
                let modified_at: DateTime<Utc> = r.get("modified_at");
                
                let storage_path = self.build_file_path(folder_uuid, &name).await?;
                
                File::with_timestamps(
                    id.to_string(),
                    name,
                    storage_path,
                    size,
                    content_type,
                    Some(multihash),
                    folder_id,
                    created_at.timestamp() as u64,
                    modified_at.timestamp() as u64,
                ).map_err(|e| FileRepositoryError::Other(e.to_string()))
            },
            Err(e) => {
                tx.rollback().await.ok();
                Err(e)
            }
        }
    }

    async fn save_file_with_id(
        &self,
        id: String,
        name: String,
        folder_id: Option<String>,
        content_type: String,
        content: Vec<u8>,
    ) -> FileRepositoryResult<File> {
        let file_uuid = Uuid::from_str(&id).map_err(|_| FileRepositoryError::InvalidPath("Invalid UUID".to_string()))?;
        
        let (multihash, size) = self.blob_storage.save_blob(&content).await
            .map_err(FileRepositoryError::DomainError)?;

        let folder_uuid = match folder_id {
            Some(ref fid) => Some(Uuid::from_str(fid).map_err(|_| FileRepositoryError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };

        let mut tx = self.pool.begin().await
            .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        self.increment_blob_ref(&mut tx, &multihash, size as i64, &content_type).await?;

        let row = sqlx::query(
            r#"
            INSERT INTO storage.files (id, name, folder_id, multihash, mime_type, size_bytes, owner_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING created_at, modified_at
            "#
        )
        .bind(file_uuid)
        .bind(&name)
        .bind(folder_uuid)
        .bind(&multihash)
        .bind(&content_type)
        .bind(size as i64)
        .bind(DEFAULT_USER_ID)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            if e.to_string().contains("unique constraint") {
                FileRepositoryError::AlreadyExists(name.clone())
            } else {
                FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            }
        });

        match row {
            Ok(r) => {
                tx.commit().await.map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
                
                let created_at: DateTime<Utc> = r.get("created_at");
                let modified_at: DateTime<Utc> = r.get("modified_at");
                
                let storage_path = self.build_file_path(folder_uuid, &name).await?;
                
                File::with_timestamps(
                    id,
                    name,
                    storage_path,
                    size,
                    content_type,
                    Some(multihash),
                    folder_id,
                    created_at.timestamp() as u64,
                    modified_at.timestamp() as u64,
                ).map_err(|e| FileRepositoryError::Other(e.to_string()))
            },
            Err(e) => {
                tx.rollback().await.ok();
                Err(e)
            }
        }
    }

    async fn get_file_by_id(&self, id: &str) -> FileRepositoryResult<File> {
        let uuid = Uuid::from_str(id).map_err(|_| FileRepositoryError::NotFound(id.to_string()))?;

        let row = sqlx::query(
            "SELECT name, folder_id, mime_type, multihash, size_bytes, created_at, modified_at FROM storage.files WHERE id = $1"
        )
        .bind(uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| FileRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        let row = row.ok_or_else(|| FileRepositoryError::NotFound(id.to_string()))?;

        let name: String = row.get("name");
        let folder_uuid: Option<Uuid> = row.get("folder_id");
        let mime_type: String = row.get("mime_type");
        let multihash: Option<String> = row.get("multihash");
        let size: i64 = row.get("size_bytes");
        let created_at: DateTime<Utc> = row.get("created_at");
        let modified_at: DateTime<Utc> = row.get("modified_at");

        let storage_path = self.build_file_path(folder_uuid, &name).await?;

        File::with_timestamps(
            id.to_string(),
            name,
            storage_path,
            size as u64,
            mime_type,
            multihash,
            folder_uuid.map(|u| u.to_string()),
            created_at.timestamp() as u64,
            modified_at.timestamp() as u64,
        ).map_err(|e| FileRepositoryError::Other(e.to_string()))
    }

    async fn list_files(&self, folder_id: Option<&str>) -> FileRepositoryResult<Vec<File>> {
        self.internal_list_files(folder_id).await
    }

    async fn delete_file(&self, id: &str) -> FileRepositoryResult<()> {
        self.internal_delete_file(id).await
    }

    async fn delete_file_entry(&self, id: &str) -> FileRepositoryResult<()> {
        self.internal_delete_file(id).await
    }

    async fn get_file_content(&self, id: &str) -> FileRepositoryResult<Vec<u8>> {
        self.internal_get_file_content(id).await
    }

    async fn get_file_stream(&self, id: &str) -> FileRepositoryResult<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>> {
        self.internal_get_file_stream(id).await
    }

    async fn move_file(&self, id: &str, target_folder_id: Option<String>) -> FileRepositoryResult<File> {
        self.internal_move_file(id, target_folder_id).await
    }

    async fn get_file_path(&self, id: &str) -> FileRepositoryResult<StoragePath> {
        self.internal_get_file_path(id).await
    }

    async fn move_to_trash(&self, _file_id: &str) -> FileRepositoryResult<()> {
        Err(FileRepositoryError::OperationNotSupported("Trash not implemented in DB repo".to_string()))
    }

    async fn restore_from_trash(&self, _file_id: &str, _original_path: &str) -> FileRepositoryResult<()> {
         Err(FileRepositoryError::OperationNotSupported("Trash not implemented in DB repo".to_string()))
    }

    async fn delete_file_permanently(&self, file_id: &str) -> FileRepositoryResult<()> {
        self.internal_delete_file(file_id).await
    }

    async fn update_file_content(&self, file_id: &str, content: Vec<u8>) -> FileRepositoryResult<()> {
        self.internal_update_file_content(file_id, content).await
    }
}

#[async_trait]
impl FileStoragePort for FileDbRepository {
    async fn save_file(
        &self,
        name: String,
        folder_id: Option<String>,
        content_type: String,
        content: Vec<u8>,
    ) -> Result<File, DomainError> {
        self.save_file_from_bytes(name, folder_id, content_type, content).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn get_file(&self, id: &str) -> Result<File, DomainError> {
        self.get_file_by_id(id).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn list_files(&self, folder_id: Option<&str>) -> Result<Vec<File>, DomainError> {
        self.internal_list_files(folder_id).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn delete_file(&self, id: &str) -> Result<(), DomainError> {
        self.internal_delete_file(id).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn get_file_content(&self, id: &str) -> Result<Vec<u8>, DomainError> {
        self.internal_get_file_content(id).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn get_file_stream(&self, id: &str) -> Result<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>, DomainError> {
        self.internal_get_file_stream(id).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn move_file(&self, file_id: &str, target_folder_id: Option<String>) -> Result<File, DomainError> {
        self.internal_move_file(file_id, target_folder_id).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn get_file_path(&self, id: &str) -> Result<StoragePath, DomainError> {
        self.internal_get_file_path(id).await
            .map_err(file_repo_err_to_domain)
    }
    
    async fn get_parent_folder_id(&self, path: &str) -> Result<String, DomainError> {
        let path_obj = StoragePath::from_string(path);
        let parent_path = path_obj.parent().ok_or_else(|| DomainError::not_found("Parent", path))?;
        
        if parent_path.is_empty() {
            return Ok("root".to_string());
        }
        
        Err(DomainError::internal_error("FileStorage", "get_parent_folder_id not implemented in FileDbRepository"))
    }
    
    async fn update_file_content(&self, file_id: &str, content: Vec<u8>) -> Result<(), DomainError> {
        self.internal_update_file_content(file_id, content).await
            .map_err(file_repo_err_to_domain)
    }
}
