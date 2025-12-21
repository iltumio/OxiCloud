use std::path::{Path, PathBuf};
use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;
use std::str::FromStr;

use crate::application::services::storage_mediator::{StorageMediator, StorageMediatorResult, StorageMediatorError};
use crate::domain::entities::folder::Folder;
use crate::domain::services::path_service::StoragePath;
use crate::domain::repositories::folder_repository::FolderRepository;
use crate::infrastructure::repositories::folder_db_repository::FolderDbRepository;

const DEFAULT_USER_ID: &str = "00000000-0000-0000-0000-000000000000";

pub struct DbStorageMediator {
    pool: PgPool,
    folder_repository: FolderDbRepository,
}

impl DbStorageMediator {
    pub fn new(pool: PgPool) -> Self {
        let folder_repository = FolderDbRepository::new(pool.clone());
        Self { pool, folder_repository }
    }
}

#[async_trait]
impl StorageMediator for DbStorageMediator {
    async fn get_folder_path(&self, folder_id: &str) -> StorageMediatorResult<PathBuf> {
        // In DB/CAS storage, folders don't have physical paths.
        // Return a virtual path.
        Ok(PathBuf::from(format!("/virtual/folders/{}", folder_id)))
    }
    
    async fn get_folder_storage_path(&self, folder_id: &str) -> StorageMediatorResult<StoragePath> {
        // Delegate to repository logic to rebuild path
        self.folder_repository.get_folder_storage_path(folder_id).await
            .map_err(StorageMediatorError::from)
    }
    
    async fn get_folder(&self, folder_id: &str) -> StorageMediatorResult<Folder> {
        self.folder_repository.get_folder_by_id(folder_id).await
            .map_err(StorageMediatorError::from)
    }
    
    async fn file_exists_at_path(&self, path: &Path) -> StorageMediatorResult<bool> {
        let s = path.to_string_lossy().to_string();
        self.file_exists_at_storage_path(&StoragePath::from_string(&s)).await
    }
    
    async fn file_exists_at_storage_path(&self, storage_path: &StoragePath) -> StorageMediatorResult<bool> {
        let path_str = storage_path.to_string();
        let parent = storage_path.parent();
        let name = storage_path.file_name().ok_or(StorageMediatorError::InvalidPath(path_str.clone()))?;
        
        let parent_id = if let Some(ref p) = parent {
            if p.is_empty() {
                None
            } else {
                match self.folder_repository.get_folder_by_storage_path(p).await {
                    Ok(f) => Some(f.id().to_string()),
                    Err(_) => return Ok(false),
                }
            }
        } else {
            None
        };
        
        let parent_uuid = match parent_id {
            Some(id) => Some(Uuid::from_str(&id).map_err(|_| StorageMediatorError::InvalidPath("Invalid UUID".to_string()))?),
            None => None,
        };
        
        let query = if let Some(pid) = parent_uuid {
            sqlx::query("SELECT 1 FROM storage.files WHERE name = $1 AND folder_id = $2 AND owner_id = $3")
                .bind(name)
                .bind(pid)
                .bind(DEFAULT_USER_ID)
        } else {
            sqlx::query("SELECT 1 FROM storage.files WHERE name = $1 AND folder_id IS NULL AND owner_id = $2")
                .bind(name)
                .bind(DEFAULT_USER_ID)
        };
        
        let result = query.fetch_optional(&self.pool).await
            .map_err(|e| StorageMediatorError::InternalError(e.to_string()))?;
            
        Ok(result.is_some())
    }
    
    async fn folder_exists_at_path(&self, path: &Path) -> StorageMediatorResult<bool> {
        let s = path.to_string_lossy().to_string();
        self.folder_exists_at_storage_path(&StoragePath::from_string(&s)).await
    }
    
    async fn folder_exists_at_storage_path(&self, storage_path: &StoragePath) -> StorageMediatorResult<bool> {
        self.folder_repository.folder_exists_at_storage_path(storage_path).await
            .map_err(StorageMediatorError::from)
    }
    
    fn resolve_path(&self, relative_path: &Path) -> PathBuf {
        PathBuf::from("/virtual").join(relative_path)
    }
    
    fn resolve_storage_path(&self, storage_path: &StoragePath) -> PathBuf {
        PathBuf::from("/virtual").join(storage_path.to_string().trim_start_matches('/'))
    }
    
    async fn ensure_directory(&self, _path: &Path) -> StorageMediatorResult<()> {
        Ok(())
    }
    
    async fn ensure_storage_directory(&self, _storage_path: &StoragePath) -> StorageMediatorResult<()> {
        Ok(())
    }
}
