use std::str::FromStr;
use async_trait::async_trait;
use sqlx::{PgPool, Row};
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::domain::entities::folder::Folder;
use crate::domain::repositories::folder_repository::{
    FolderRepository, FolderRepositoryError, FolderRepositoryResult
};
use crate::domain::services::path_service::StoragePath;

const DEFAULT_USER_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Clone)]
pub struct FolderDbRepository {
    pool: PgPool,
}

impl FolderDbRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    // Helper to build full path for a folder by traversing up
    async fn build_storage_path(&self, folder_id: Uuid) -> FolderRepositoryResult<StoragePath> {
        // Recursive CTE to get path
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
            .bind(folder_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        if rows.is_empty() {
             return Err(FolderRepositoryError::NotFound(folder_id.to_string()));
        }

        let mut path_string = String::new();
        for row in rows {
            let name: String = row.get("name");
            path_string.push('/');
            path_string.push_str(&name);
        }

        Ok(StoragePath::from_string(&path_string))
    }
}

#[async_trait]
impl FolderRepository for FolderDbRepository {
    async fn create_folder(&self, name: String, parent_id: Option<String>) -> FolderRepositoryResult<Folder> {
        let parent_uuid = match parent_id {
            Some(ref id) => Some(Uuid::from_str(id).map_err(|_| FolderRepositoryError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };

        // Check if exists
        // Unique constraint on (parent_id, name, owner_id) handles this, but we want custom error
        
        let row = sqlx::query(
            r#"
            INSERT INTO storage.folders (name, parent_id, owner_id)
            VALUES ($1, $2, $3)
            RETURNING id, created_at, modified_at
            "#
        )
        .bind(&name)
        .bind(parent_uuid)
        .bind(DEFAULT_USER_ID)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("unique constraint") {
                FolderRepositoryError::AlreadyExists(name.clone())
            } else {
                FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            }
        })?;

        let id: Uuid = row.get("id");
        let created_at: DateTime<Utc> = row.get("created_at");
        let modified_at: DateTime<Utc> = row.get("modified_at");

        // Calculate storage path
        let storage_path = if let Some(pid) = parent_uuid {
             let parent_path = self.build_storage_path(pid).await?;
             parent_path.join(&name)
        } else {
             StoragePath::from_string(&format!("/{}", name))
        };

        Folder::with_timestamps(
            id.to_string(),
            name,
            storage_path,
            parent_id,
            created_at.timestamp() as u64,
            modified_at.timestamp() as u64,
        ).map_err(|e| FolderRepositoryError::ValidationError(e.to_string()))
    }

    async fn get_folder_by_id(&self, id: &str) -> FolderRepositoryResult<Folder> {
        let uuid = Uuid::from_str(id).map_err(|_| FolderRepositoryError::NotFound(id.to_string()))?;

        let row = sqlx::query(
            "SELECT id, name, parent_id, created_at, modified_at FROM storage.folders WHERE id = $1"
        )
        .bind(uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        let row = row.ok_or_else(|| FolderRepositoryError::NotFound(id.to_string()))?;

        let name: String = row.get("name");
        let parent_id_uuid: Option<Uuid> = row.get("parent_id");
        let created_at: DateTime<Utc> = row.get("created_at");
        let modified_at: DateTime<Utc> = row.get("modified_at");

        let storage_path = self.build_storage_path(uuid).await?;

        Folder::with_timestamps(
            uuid.to_string(),
            name,
            storage_path,
            parent_id_uuid.map(|u| u.to_string()),
            created_at.timestamp() as u64,
            modified_at.timestamp() as u64,
        ).map_err(|e| FolderRepositoryError::ValidationError(e.to_string()))
    }

    async fn get_folder_by_storage_path(&self, storage_path: &StoragePath) -> FolderRepositoryResult<Folder> {
        // This is tricky with pure SQL if we don't store the full path.
        // We have to resolve it part by part or assume unique names globally which is not true.
        // Or traverse down.
        
        let path_string = storage_path.to_string();
        let components: Vec<&str> = path_string.split('/').filter(|s| !s.is_empty()).collect();
        
        if components.is_empty() {
             // Root folder? The domain seems to treat folders as entities. 
             // If requesting root, maybe return a virtual root?
             // But existing impl returns NotFound or Root.
             return Err(FolderRepositoryError::NotFound("Root path".to_string()));
        }

        let mut current_parent_id: Option<Uuid> = None;
        let mut found_folder = None;

        for (i, name) in components.iter().enumerate() {
            let query = if current_parent_id.is_none() {
                // Find root folder with this name
                 sqlx::query("SELECT id, name, parent_id, created_at, modified_at FROM storage.folders WHERE name = $1 AND parent_id IS NULL AND owner_id = $2")
                 .bind(name)
                 .bind(DEFAULT_USER_ID)
            } else {
                 sqlx::query("SELECT id, name, parent_id, created_at, modified_at FROM storage.folders WHERE name = $1 AND parent_id = $2 AND owner_id = $3")
                 .bind(name)
                 .bind(current_parent_id)
                 .bind(DEFAULT_USER_ID)
            };

            let row = query.fetch_optional(&self.pool)
                .await
                .map_err(|e| FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

            if let Some(r) = row {
                let id: Uuid = r.get("id");
                current_parent_id = Some(id);
                
                if i == components.len() - 1 {
                    // Found the target
                    let name: String = r.get("name");
                    let parent_id_uuid: Option<Uuid> = r.get("parent_id");
                    let created_at: DateTime<Utc> = r.get("created_at");
                    let modified_at: DateTime<Utc> = r.get("modified_at");

                    found_folder = Some(Folder::with_timestamps(
                        id.to_string(),
                        name,
                        storage_path.clone(),
                        parent_id_uuid.map(|u| u.to_string()),
                        created_at.timestamp() as u64,
                        modified_at.timestamp() as u64,
                    ).map_err(|e| FolderRepositoryError::ValidationError(e.to_string()))?);
                }
            } else {
                return Err(FolderRepositoryError::NotFound(storage_path.to_string()));
            }
        }

        found_folder.ok_or_else(|| FolderRepositoryError::NotFound(storage_path.to_string()))
    }

    async fn list_folders(&self, parent_id: Option<&str>) -> FolderRepositoryResult<Vec<Folder>> {
        let parent_uuid = match parent_id {
            Some(id) => Some(Uuid::from_str(id).map_err(|_| FolderRepositoryError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };

        let query = if let Some(pid) = parent_uuid {
            sqlx::query("SELECT id, name, parent_id, created_at, modified_at FROM storage.folders WHERE parent_id = $1 AND owner_id = $2")
                .bind(pid)
                .bind(DEFAULT_USER_ID)
        } else {
            sqlx::query("SELECT id, name, parent_id, created_at, modified_at FROM storage.folders WHERE parent_id IS NULL AND owner_id = $1")
                .bind(DEFAULT_USER_ID)
        };

        let rows = query.fetch_all(&self.pool)
            .await
            .map_err(|e| FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        let mut folders = Vec::new();
        for row in rows {
            let id: Uuid = row.get("id");
            let name: String = row.get("name");
            let parent_id_uuid: Option<Uuid> = row.get("parent_id");
            let created_at: DateTime<Utc> = row.get("created_at");
            let modified_at: DateTime<Utc> = row.get("modified_at");

            let storage_path = self.build_storage_path(id).await?;

            folders.push(Folder::with_timestamps(
                id.to_string(),
                name,
                storage_path,
                parent_id_uuid.map(|u| u.to_string()),
                created_at.timestamp() as u64,
                modified_at.timestamp() as u64,
            ).map_err(|e| FolderRepositoryError::ValidationError(e.to_string()))?);
        }

        Ok(folders)
    }

    async fn list_folders_paginated(
        &self, 
        parent_id: Option<&str>, 
        offset: usize, 
        limit: usize,
        include_total: bool
    ) -> FolderRepositoryResult<(Vec<Folder>, Option<usize>)> {
        let parent_uuid = match parent_id {
            Some(id) => Some(Uuid::from_str(id).map_err(|_| FolderRepositoryError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };

        // Get total if requested
        let total = if include_total {
            let count_query = if let Some(pid) = parent_uuid {
                sqlx::query_scalar("SELECT COUNT(*) FROM storage.folders WHERE parent_id = $1 AND owner_id = $2")
                    .bind(pid)
                    .bind(DEFAULT_USER_ID)
            } else {
                sqlx::query_scalar("SELECT COUNT(*) FROM storage.folders WHERE parent_id IS NULL AND owner_id = $1")
                    .bind(DEFAULT_USER_ID)
            };
            
            let count: i64 = count_query.fetch_one(&self.pool)
                .await
                .map_err(|e| FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
            Some(count as usize)
        } else {
            None
        };

        // Get folders
        let query = if let Some(pid) = parent_uuid {
            sqlx::query("SELECT id, name, parent_id, created_at, modified_at FROM storage.folders WHERE parent_id = $1 AND owner_id = $2 LIMIT $3 OFFSET $4")
                .bind(pid)
                .bind(DEFAULT_USER_ID)
                .bind(limit as i64)
                .bind(offset as i64)
        } else {
            sqlx::query("SELECT id, name, parent_id, created_at, modified_at FROM storage.folders WHERE parent_id IS NULL AND owner_id = $1 LIMIT $2 OFFSET $3")
                .bind(DEFAULT_USER_ID)
                .bind(limit as i64)
                .bind(offset as i64)
        };

        let rows = query.fetch_all(&self.pool)
            .await
            .map_err(|e| FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        let mut folders = Vec::new();
        for row in rows {
            let id: Uuid = row.get("id");
            let name: String = row.get("name");
            let parent_id_uuid: Option<Uuid> = row.get("parent_id");
            let created_at: DateTime<Utc> = row.get("created_at");
            let modified_at: DateTime<Utc> = row.get("modified_at");

            let storage_path = self.build_storage_path(id).await?;

            folders.push(Folder::with_timestamps(
                id.to_string(),
                name,
                storage_path,
                parent_id_uuid.map(|u| u.to_string()),
                created_at.timestamp() as u64,
                modified_at.timestamp() as u64,
            ).map_err(|e| FolderRepositoryError::ValidationError(e.to_string()))?);
        }

        Ok((folders, total))
    }

    async fn rename_folder(&self, id: &str, new_name: String) -> FolderRepositoryResult<Folder> {
        let uuid = Uuid::from_str(id).map_err(|_| FolderRepositoryError::NotFound(id.to_string()))?;

        let row = sqlx::query(
            "UPDATE storage.folders SET name = $1, modified_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, parent_id, created_at, modified_at"
        )
        .bind(&new_name)
        .bind(uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("unique constraint") {
                FolderRepositoryError::AlreadyExists(new_name.clone())
            } else {
                FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            }
        })?;

        let row = row.ok_or_else(|| FolderRepositoryError::NotFound(id.to_string()))?;

        let id: Uuid = row.get("id");
        let name: String = row.get("name");
        let parent_id_uuid: Option<Uuid> = row.get("parent_id");
        let created_at: DateTime<Utc> = row.get("created_at");
        let modified_at: DateTime<Utc> = row.get("modified_at");

        let storage_path = self.build_storage_path(id).await?;

        Folder::with_timestamps(
            id.to_string(),
            name,
            storage_path,
            parent_id_uuid.map(|u| u.to_string()),
            created_at.timestamp() as u64,
            modified_at.timestamp() as u64,
        ).map_err(|e| FolderRepositoryError::ValidationError(e.to_string()))
    }

    async fn move_folder(&self, id: &str, new_parent_id: Option<&str>) -> FolderRepositoryResult<Folder> {
        let uuid = Uuid::from_str(id).map_err(|_| FolderRepositoryError::NotFound(id.to_string()))?;
        let parent_uuid = match new_parent_id {
            Some(id) => Some(Uuid::from_str(id).map_err(|_| FolderRepositoryError::InvalidPath("Invalid Parent UUID".to_string()))?),
            None => None,
        };

        // Prevent moving into self (cycle check is harder but simple check is necessary)
        if let Some(pid) = parent_uuid {
            if pid == uuid {
                return Err(FolderRepositoryError::InvalidPath("Cannot move folder into itself".to_string()));
            }
        }

        let row = sqlx::query(
            "UPDATE storage.folders SET parent_id = $1, modified_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, name, parent_id, created_at, modified_at"
        )
        .bind(parent_uuid)
        .bind(uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
             if e.to_string().contains("unique constraint") {
                FolderRepositoryError::AlreadyExists("Folder with same name already exists in destination".to_string())
            } else {
                FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
            }
        })?;

        let row = row.ok_or_else(|| FolderRepositoryError::NotFound(id.to_string()))?;
        
        let id: Uuid = row.get("id");
        let name: String = row.get("name");
        let parent_id_uuid: Option<Uuid> = row.get("parent_id");
        let created_at: DateTime<Utc> = row.get("created_at");
        let modified_at: DateTime<Utc> = row.get("modified_at");

        let storage_path = self.build_storage_path(id).await?;

        Folder::with_timestamps(
            id.to_string(),
            name,
            storage_path,
            parent_id_uuid.map(|u| u.to_string()),
            created_at.timestamp() as u64,
            modified_at.timestamp() as u64,
        ).map_err(|e| FolderRepositoryError::ValidationError(e.to_string()))
    }

    async fn delete_folder(&self, id: &str) -> FolderRepositoryResult<()> {
        let uuid = Uuid::from_str(id).map_err(|_| FolderRepositoryError::NotFound(id.to_string()))?;

        // CASCADE delete will handle children (due to DB schema)
        let result = sqlx::query("DELETE FROM storage.folders WHERE id = $1")
            .bind(uuid)
            .execute(&self.pool)
            .await
            .map_err(|e| FolderRepositoryError::IoError(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

        if result.rows_affected() == 0 {
            return Err(FolderRepositoryError::NotFound(id.to_string()));
        }

        Ok(())
    }

    async fn folder_exists_at_storage_path(&self, storage_path: &StoragePath) -> FolderRepositoryResult<bool> {
         match self.get_folder_by_storage_path(storage_path).await {
             Ok(_) => Ok(true),
             Err(FolderRepositoryError::NotFound(_)) => Ok(false),
             Err(e) => Err(e),
         }
    }

    async fn get_folder_storage_path(&self, id: &str) -> FolderRepositoryResult<StoragePath> {
        let uuid = Uuid::from_str(id).map_err(|_| FolderRepositoryError::NotFound(id.to_string()))?;
        self.build_storage_path(uuid).await
    }

    // Legacy / Trash methods
    #[allow(deprecated)]
    async fn folder_exists(&self, path: &std::path::PathBuf) -> FolderRepositoryResult<bool> {
         // Legacy support could attempt to map pathbuf to string
         let s = path.to_string_lossy().to_string();
         self.folder_exists_at_storage_path(&StoragePath::from_string(&s)).await
    }

    #[allow(deprecated)]
    async fn get_folder_by_path(&self, path: &std::path::PathBuf) -> FolderRepositoryResult<Folder> {
         let s = path.to_string_lossy().to_string();
         self.get_folder_by_storage_path(&StoragePath::from_string(&s)).await
    }

    async fn move_to_trash(&self, _folder_id: &str) -> FolderRepositoryResult<()> {
        // Not implemented in DB repository yet, assuming separate trash service or DB field
        // For now, return NotSupported or implement if schema supported it.
        // Schema doesn't have deleted_at or similar.
        Err(FolderRepositoryError::OperationNotSupported("Trash not implemented in DB repo".to_string()))
    }

    async fn restore_from_trash(&self, _folder_id: &str, _original_path: &str) -> FolderRepositoryResult<()> {
        Err(FolderRepositoryError::OperationNotSupported("Trash not implemented in DB repo".to_string()))
    }

    async fn delete_folder_permanently(&self, folder_id: &str) -> FolderRepositoryResult<()> {
        self.delete_folder(folder_id).await
    }
}

// Helper function for error conversion
fn folder_repo_err_to_domain(err: FolderRepositoryError) -> crate::common::errors::DomainError {
    use crate::common::errors::{DomainError, ErrorKind};
    match err {
        FolderRepositoryError::NotFound(id) => DomainError::not_found("Folder", id),
        FolderRepositoryError::AlreadyExists(id) => DomainError::already_exists("Folder", id),
        FolderRepositoryError::InvalidPath(p) => DomainError::new(ErrorKind::InvalidInput, "Folder", format!("Invalid path: {}", p)),
        FolderRepositoryError::IoError(e) => DomainError::internal_error("Folder", format!("IO error: {}", e)),
        FolderRepositoryError::ValidationError(e) => DomainError::new(ErrorKind::InvalidInput, "Folder", e),
        FolderRepositoryError::DomainError(e) => e,
        _ => DomainError::internal_error("Folder", format!("{}", err)),
    }
}

#[async_trait]
impl crate::application::ports::outbound::FolderStoragePort for FolderDbRepository {
    async fn create_folder(&self, name: String, parent_id: Option<String>) -> Result<crate::domain::entities::folder::Folder, crate::common::errors::DomainError> {
        FolderRepository::create_folder(self, name, parent_id).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn get_folder(&self, id: &str) -> Result<crate::domain::entities::folder::Folder, crate::common::errors::DomainError> {
        FolderRepository::get_folder_by_id(self, id).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn get_folder_by_path(&self, storage_path: &StoragePath) -> Result<crate::domain::entities::folder::Folder, crate::common::errors::DomainError> {
        FolderRepository::get_folder_by_storage_path(self, storage_path).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn list_folders(&self, parent_id: Option<&str>) -> Result<Vec<crate::domain::entities::folder::Folder>, crate::common::errors::DomainError> {
        FolderRepository::list_folders(self, parent_id).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn list_folders_paginated(
        &self, 
        parent_id: Option<&str>,
        offset: usize,
        limit: usize,
        include_total: bool
    ) -> Result<(Vec<crate::domain::entities::folder::Folder>, Option<usize>), crate::common::errors::DomainError> {
        FolderRepository::list_folders_paginated(self, parent_id, offset, limit, include_total).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn rename_folder(&self, id: &str, new_name: String) -> Result<crate::domain::entities::folder::Folder, crate::common::errors::DomainError> {
        FolderRepository::rename_folder(self, id, new_name).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn move_folder(&self, id: &str, new_parent_id: Option<&str>) -> Result<crate::domain::entities::folder::Folder, crate::common::errors::DomainError> {
        FolderRepository::move_folder(self, id, new_parent_id).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn delete_folder(&self, id: &str) -> Result<(), crate::common::errors::DomainError> {
        FolderRepository::delete_folder(self, id).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn folder_exists(&self, storage_path: &StoragePath) -> Result<bool, crate::common::errors::DomainError> {
        FolderRepository::folder_exists_at_storage_path(self, storage_path).await
            .map_err(folder_repo_err_to_domain)
    }
    
    async fn get_folder_path(&self, id: &str) -> Result<StoragePath, crate::common::errors::DomainError> {
        FolderRepository::get_folder_storage_path(self, id).await
            .map_err(folder_repo_err_to_domain)
    }
}

