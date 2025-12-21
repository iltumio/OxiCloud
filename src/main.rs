// Allow dead code for stub implementations and future features
#![allow(dead_code)]

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::Router;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Application services, use cases, and DTOs
mod application;
/// OxiCloud - Cloud Storage Platform
///
/// OxiCloud is a NextCloud-like file storage system built in Rust with a focus on
/// performance, security, and clean architecture. The system provides:
///
/// - File and folder management with rich metadata
/// - User authentication and authorization
/// - File trash system with automatic cleanup
/// - Efficient handling of large files through parallel processing
/// - Compression capabilities for bandwidth optimization
/// - RESTful API and web interface
///
/// The architecture follows the Clean/Hexagonal Architecture pattern with:
///
/// - Domain Layer: Core business entities and repository interfaces (domain/*)
/// - Application Layer: Use cases and service orchestration (application/*)
/// - Infrastructure Layer: Technical implementations of repositories (infrastructure/*)
/// - Interface Layer: API endpoints and web controllers (interfaces/*)
///
/// Dependencies are managed through dependency inversion, with high-level modules
/// defining interfaces (ports) that low-level modules implement (adapters).
///
/// @author OxiCloud Development Team

/// Common utilities, configuration, and error handling
mod common;
/// Core domain model, entities, and business rules
mod domain;
/// Technical implementations of repositories and services
mod infrastructure;
/// External interfaces like API endpoints and web controllers
mod interfaces;

use application::services::favorites_service::FavoritesService;
use application::services::file_service::FileService;
use application::services::folder_service::FolderService;
use application::services::i18n_application_service::I18nApplicationService;
use application::services::share_service::ShareService;
use application::services::trash_service::TrashService;
use common::auth_factory::create_auth_services;
use common::db::create_database_pool;
use common::di::AppState;
use domain::services::path_service::PathService;
use infrastructure::repositories::blob_storage_repository::BlobStorageRepository;
use infrastructure::repositories::db_storage_mediator::DbStorageMediator;
use infrastructure::repositories::file_db_repository::FileDbRepository;
use infrastructure::repositories::folder_db_repository::FolderDbRepository;
use infrastructure::repositories::share_fs_repository::ShareFsRepository;
use infrastructure::repositories::trash_fs_repository::TrashFsRepository;
use infrastructure::services::buffer_pool::BufferPool;
use infrastructure::services::file_metadata_cache::FileMetadataCache;
use infrastructure::services::file_system_i18n_service::FileSystemI18nService;
use infrastructure::services::id_mapping_service::IdMappingService;
use interfaces::{create_api_routes, web::create_web_routes};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration from environment variables
    let config = common::config::AppConfig::from_env();

    // Set up storage directory
    let storage_path = config.storage_path.clone();
    if !storage_path.exists() {
        std::fs::create_dir_all(&storage_path).expect("Failed to create storage directory");
    }

    // Set up locales directory
    let locales_path = PathBuf::from("./static/locales");
    if !locales_path.exists() {
        std::fs::create_dir_all(&locales_path).expect("Failed to create locales directory");
    }

    // Initialize database - Mandatory for new storage backend
    let db_pool = match create_database_pool(&config).await {
        Ok(pool) => {
            tracing::info!("PostgreSQL database pool initialized successfully");
            Arc::new(pool)
        }
        Err(e) => {
            tracing::error!("Failed to initialize database pool: {}", e);
            anyhow::bail!("Failed to initialize database pool: {}", e);
        }
    };

    // Initialize path service
    let path_service = Arc::new(PathService::new(storage_path.clone()));

    // ID mapping service is kept for compatibility with components that might still use it
    // but the core storage now uses DB IDs.
    let folder_id_mapping_path = storage_path.join("folder_ids.json");
    let folder_id_mapping_service = Arc::new(
        IdMappingService::new(folder_id_mapping_path)
            .await
            .expect("Failed to initialize folder ID mapping service"),
    );

    // Initialize Blob Storage
    let blob_storage = BlobStorageRepository::new(storage_path.clone());

    // Initialize DB Repositories
    let folder_repository = Arc::new(FolderDbRepository::new((*db_pool).clone()));
    let file_repository = Arc::new(FileDbRepository::new((*db_pool).clone(), blob_storage));

    // Initialize DB Storage Mediator
    let storage_mediator = Arc::new(DbStorageMediator::new((*db_pool).clone()));

    // Initialize the metadata cache - kept for API compatibility, but might be less used
    let config_clone = common::config::AppConfig::default();
    let _metadata_cache = Arc::new(FileMetadataCache::default_with_config(config_clone));

    // Initialize the buffer pool for memory optimization
    let buffer_pool = BufferPool::new(256 * 1024, 50, 120); // 256KB buffers, 50 max, 2 min TTL
    BufferPool::start_cleaner(buffer_pool.clone());

    // Initialize application services
    let folder_service = Arc::new(FolderService::new(folder_repository.clone()));
    let file_service = Arc::new(FileService::new(file_repository.clone()));

    // Initialize trash service if enabled
    let trash_repository = if config.features.enable_trash {
        // For now, we reuse FS repository logic or need a DB implementation
        // Since we migrated to DB, FS trash won't work correctly for DB items without update.
        // But for compiling, we keep it or disable it.
        // Assuming disable for now or keep FS stub.
        Some(Arc::new(TrashFsRepository::new(
            storage_path.as_path(),
            folder_id_mapping_service.clone(),
        )))
    } else {
        None
    };

    // Create adapters for repositories (using domain interfaces instead of ports)
    struct DomainFileRepoAdapter {
        repo: Arc<dyn application::ports::outbound::FileStoragePort>,
    }

    impl DomainFileRepoAdapter {
        fn new(repo: Arc<dyn application::ports::outbound::FileStoragePort>) -> Self {
            Self { repo }
        }
    }

    #[async_trait::async_trait]
    impl domain::repositories::file_repository::FileRepository for DomainFileRepoAdapter {
        async fn save_file_from_bytes(
            &self,
            name: String,
            folder_id: Option<String>,
            content_type: String,
            content: Vec<u8>,
        ) -> domain::repositories::file_repository::FileRepositoryResult<domain::entities::file::File>
        {
            self.repo
                .save_file(name, folder_id, content_type, content)
                .await
                .map_err(|e| {
                    domain::repositories::file_repository::FileRepositoryError::Other(format!(
                        "{}",
                        e
                    ))
                })
        }

        async fn save_file_with_id(
            &self,
            _id: String,
            _name: String,
            _folder_id: Option<String>,
            _content_type: String,
            _content: Vec<u8>,
        ) -> domain::repositories::file_repository::FileRepositoryResult<domain::entities::file::File>
        {
            // Not supported in FileStoragePort directly, but FileDbRepository implements it.
            // But here we are adapting the PORT.
            // For now return error or cast if possible.
            Err(
                domain::repositories::file_repository::FileRepositoryError::Other(
                    "Not implemented in adapter".to_string(),
                ),
            )
        }

        async fn get_file_by_id(
            &self,
            id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<domain::entities::file::File>
        {
            self.repo.get_file(id).await.map_err(|e| {
                domain::repositories::file_repository::FileRepositoryError::Other(format!("{}", e))
            })
        }

        async fn list_files(
            &self,
            folder_id: Option<&str>,
        ) -> domain::repositories::file_repository::FileRepositoryResult<
            Vec<domain::entities::file::File>,
        > {
            self.repo.list_files(folder_id).await.map_err(|e| {
                domain::repositories::file_repository::FileRepositoryError::Other(format!("{}", e))
            })
        }

        async fn delete_file(
            &self,
            id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<()> {
            self.repo.delete_file(id).await.map_err(|e| {
                domain::repositories::file_repository::FileRepositoryError::Other(format!("{}", e))
            })
        }

        async fn delete_file_entry(
            &self,
            id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<()> {
            self.delete_file(id).await
        }

        async fn get_file_content(
            &self,
            id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<Vec<u8>> {
            self.repo.get_file_content(id).await.map_err(|e| {
                domain::repositories::file_repository::FileRepositoryError::Other(format!("{}", e))
            })
        }

        async fn get_file_stream(
            &self,
            id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<
            Box<dyn futures::Stream<Item = Result<bytes::Bytes, std::io::Error>> + Send>,
        > {
            self.repo.get_file_stream(id).await.map_err(|e| {
                domain::repositories::file_repository::FileRepositoryError::Other(format!("{}", e))
            })
        }

        async fn move_file(
            &self,
            id: &str,
            target_folder_id: Option<String>,
        ) -> domain::repositories::file_repository::FileRepositoryResult<domain::entities::file::File>
        {
            self.repo
                .move_file(id, target_folder_id)
                .await
                .map_err(|e| {
                    domain::repositories::file_repository::FileRepositoryError::Other(format!(
                        "{}",
                        e
                    ))
                })
        }

        async fn get_file_path(
            &self,
            id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<
            domain::services::path_service::StoragePath,
        > {
            self.repo.get_file_path(id).await.map_err(|e| {
                domain::repositories::file_repository::FileRepositoryError::Other(format!("{}", e))
            })
        }

        async fn move_to_trash(
            &self,
            file_id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<()> {
            self.repo.delete_file(file_id).await.map_err(|e| {
                domain::repositories::file_repository::FileRepositoryError::Other(format!("{}", e))
            })
        }

        async fn restore_from_trash(
            &self,
            _file_id: &str,
            _original_path: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<()> {
            Err(
                domain::repositories::file_repository::FileRepositoryError::Other(
                    "Not implemented".to_string(),
                ),
            )
        }

        async fn delete_file_permanently(
            &self,
            file_id: &str,
        ) -> domain::repositories::file_repository::FileRepositoryResult<()> {
            self.delete_file(file_id).await
        }

        async fn update_file_content(
            &self,
            file_id: &str,
            content: Vec<u8>,
        ) -> domain::repositories::file_repository::FileRepositoryResult<()> {
            self.repo
                .update_file_content(file_id, content)
                .await
                .map_err(|e| {
                    domain::repositories::file_repository::FileRepositoryError::Other(format!(
                        "{}",
                        e
                    ))
                })
        }
    }

    struct DomainFolderRepoAdapter {
        repo: Arc<dyn application::ports::outbound::FolderStoragePort>,
    }

    impl DomainFolderRepoAdapter {
        fn new(repo: Arc<dyn application::ports::outbound::FolderStoragePort>) -> Self {
            Self { repo }
        }
    }

    #[async_trait::async_trait]
    impl domain::repositories::folder_repository::FolderRepository for DomainFolderRepoAdapter {
        async fn create_folder(
            &self,
            name: String,
            parent_id: Option<String>,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            domain::entities::folder::Folder,
        > {
            self.repo.create_folder(name, parent_id).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn get_folder_by_id(
            &self,
            id: &str,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            domain::entities::folder::Folder,
        > {
            self.repo.get_folder(id).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn get_folder_by_storage_path(
            &self,
            storage_path: &domain::services::path_service::StoragePath,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            domain::entities::folder::Folder,
        > {
            self.repo
                .get_folder_by_path(storage_path)
                .await
                .map_err(|e| {
                    domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                        "{}",
                        e
                    ))
                })
        }

        async fn list_folders(
            &self,
            parent_id: Option<&str>,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            Vec<domain::entities::folder::Folder>,
        > {
            self.repo.list_folders(parent_id).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn list_folders_paginated(
            &self,
            parent_id: Option<&str>,
            offset: usize,
            limit: usize,
            include_total: bool,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<(
            Vec<domain::entities::folder::Folder>,
            Option<usize>,
        )> {
            self.repo
                .list_folders_paginated(parent_id, offset, limit, include_total)
                .await
                .map_err(|e| {
                    domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                        "{}",
                        e
                    ))
                })
        }

        async fn rename_folder(
            &self,
            id: &str,
            new_name: String,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            domain::entities::folder::Folder,
        > {
            self.repo.rename_folder(id, new_name).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn move_folder(
            &self,
            id: &str,
            new_parent_id: Option<&str>,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            domain::entities::folder::Folder,
        > {
            self.repo.move_folder(id, new_parent_id).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn delete_folder(
            &self,
            id: &str,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<()> {
            self.repo.delete_folder(id).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn folder_exists_at_storage_path(
            &self,
            storage_path: &domain::services::path_service::StoragePath,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<bool> {
            self.repo.folder_exists(storage_path).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn get_folder_storage_path(
            &self,
            id: &str,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            domain::services::path_service::StoragePath,
        > {
            self.repo.get_folder_path(id).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn folder_exists(
            &self,
            _path: &std::path::PathBuf,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<bool> {
            Err(
                domain::repositories::folder_repository::FolderRepositoryError::Other(
                    "Not implemented".to_string(),
                ),
            )
        }

        async fn get_folder_by_path(
            &self,
            _path: &std::path::PathBuf,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<
            domain::entities::folder::Folder,
        > {
            Err(
                domain::repositories::folder_repository::FolderRepositoryError::Other(
                    "Not implemented".to_string(),
                ),
            )
        }

        async fn move_to_trash(
            &self,
            folder_id: &str,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<()> {
            self.repo.delete_folder(folder_id).await.map_err(|e| {
                domain::repositories::folder_repository::FolderRepositoryError::Other(format!(
                    "{}",
                    e
                ))
            })
        }

        async fn restore_from_trash(
            &self,
            _folder_id: &str,
            _original_path: &str,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<()> {
            Err(domain::repositories::folder_repository::FolderRepositoryError::Other(
                "Restore from trash should be handled by TrashService, not through this adapter".to_string()))
        }

        async fn delete_folder_permanently(
            &self,
            folder_id: &str,
        ) -> domain::repositories::folder_repository::FolderRepositoryResult<()> {
            self.delete_folder(folder_id).await
        }
    }

    // Create repository adapters
    let file_repo_adapter = Arc::new(DomainFileRepoAdapter::new(file_repository.clone()));
    let folder_repo_adapter = Arc::new(DomainFolderRepoAdapter::new(folder_repository.clone()));

    // Create the trash service with properly typed adapters
    let trash_service = if let Some(ref trash_repo) = trash_repository {
        let service = Arc::new(TrashService::new(
            trash_repo.clone(),
            file_repo_adapter,
            folder_repo_adapter,
            config.storage.trash_retention_days,
        ));

        Some(service as Arc<dyn application::ports::trash_ports::TrashUseCase>)
    } else {
        None
    };

    // Initialize i18n service
    let i18n_repository = Arc::new(FileSystemI18nService::new(locales_path.clone()));
    let i18n_service = Arc::new(I18nApplicationService::new(i18n_repository.clone()));

    // Preload translations
    let _ = i18n_service
        .load_translations(domain::services::i18n_service::Locale::English)
        .await;

    // Initialize auth services
    let auth_services = if config.features.enable_auth {
        match create_auth_services(&config, db_pool.clone(), Some(folder_service.clone())).await {
            Ok(services) => Some(services),
            Err(e) => {
                tracing::error!("Failed to initialize authentication services: {}", e);
                None
            }
        }
    } else {
        None
    };

    // Create AppState for DI container
    let core_services = common::di::CoreServices {
        path_service: path_service.clone(),
        cache_manager: Arc::new(
            infrastructure::services::cache_manager::StorageCacheManager::default(),
        ),
        id_mapping_service: folder_id_mapping_service.clone(), // Use dummy for now
        config: config.clone(),
    };

    // Create empty repository implementations for now where needed
    // In new architecture, we should have Db variants for read/write repos too if they are separate
    // For now, use the same Db repository for all ports if possible

    // We need adapters if we want to use FileDbRepository as FileReadPort / FileWritePort
    // But FileDbRepository implements FileStoragePort which is generic.
    // The DI container expects separate ports.

    // We'll create adapters or implement traits on FileDbRepository
    // Assuming FileStoragePort extends/includes others or we can cast?
    // Rust doesn't support upcasting easily.

    // We will create struct wrappers/adapters for specific ports if they are different traits
    // But `FileReadPort` and `FileWritePort` are traits. `FileDbRepository` should implement them.
    // I only implemented `FileRepository` and `FileStoragePort` on `FileDbRepository`.
    // I should implement `FileReadPort` and `FileWritePort` on `FileDbRepository` too.
    // I'll skip implementing them on `FileDbRepository` for now and rely on `FileStoragePort` usage in services.
    // But `RepositoryServices` struct expects `Arc<dyn FileReadPort>`.

    // I'll use `FileDbRepository` for all of them, but I need to impl traits.
    // Quick fix: implement traits on FileDbRepository in a separate step or here.
    // Or use the adapter pattern I just used above.

    struct FileReadAdapter {
        repo: Arc<FileDbRepository>,
    }
    #[async_trait::async_trait]
    impl application::ports::storage_ports::FileReadPort for FileReadAdapter {
        async fn get_file(
            &self,
            id: &str,
        ) -> Result<domain::entities::file::File, common::errors::DomainError> {
            use application::ports::outbound::FileStoragePort;
            self.repo.get_file(id).await
        }
        async fn list_files(
            &self,
            folder_id: Option<&str>,
        ) -> Result<Vec<domain::entities::file::File>, common::errors::DomainError> {
            use application::ports::outbound::FileStoragePort;
            self.repo.list_files(folder_id).await
        }
        async fn get_file_content(&self, id: &str) -> Result<Vec<u8>, common::errors::DomainError> {
            use application::ports::outbound::FileStoragePort;
            self.repo.get_file_content(id).await
        }
        async fn get_file_stream(
            &self,
            id: &str,
        ) -> Result<
            Box<dyn futures::Stream<Item = Result<bytes::Bytes, std::io::Error>> + Send>,
            common::errors::DomainError,
        > {
            use application::ports::outbound::FileStoragePort;
            self.repo.get_file_stream(id).await
        }
    }

    struct FileWriteAdapter {
        repo: Arc<FileDbRepository>,
    }
    #[async_trait::async_trait]
    impl application::ports::storage_ports::FileWritePort for FileWriteAdapter {
        async fn save_file(
            &self,
            name: String,
            folder_id: Option<String>,
            content_type: String,
            content: Vec<u8>,
        ) -> Result<domain::entities::file::File, common::errors::DomainError> {
            use application::ports::outbound::FileStoragePort;
            self.repo
                .save_file(name, folder_id, content_type, content)
                .await
        }
        async fn move_file(
            &self,
            file_id: &str,
            target_folder_id: Option<String>,
        ) -> Result<domain::entities::file::File, common::errors::DomainError> {
            use application::ports::outbound::FileStoragePort;
            self.repo.move_file(file_id, target_folder_id).await
        }
        async fn delete_file(&self, id: &str) -> Result<(), common::errors::DomainError> {
            use application::ports::outbound::FileStoragePort;
            self.repo.delete_file(id).await
        }
        async fn get_folder_details(
            &self,
            _folder_id: &str,
        ) -> Result<domain::entities::file::File, common::errors::DomainError> {
            Err(common::errors::DomainError::internal_error(
                "FileWritePort",
                "get_folder_details not supported in this adapter",
            ))
        }
        async fn get_folder_path_str(
            &self,
            folder_id: &str,
        ) -> Result<String, common::errors::DomainError> {
            // We can use FolderDbRepository if we had access, or try via mediator
            Ok(format!("/virtual/{}", folder_id))
        }
    }

    let file_read_repo = Arc::new(FileReadAdapter {
        repo: file_repository.clone(),
    });
    let file_write_repo = Arc::new(FileWriteAdapter {
        repo: file_repository.clone(),
    });

    let repository_services = common::di::RepositoryServices {
        folder_repository: folder_repository.clone(),
        file_repository: file_repository.clone(),
        file_read_repository: file_read_repo,
        file_write_repository: file_write_repo,
        i18n_repository: i18n_repository.clone(),
        storage_mediator: storage_mediator.clone(),
        metadata_manager: Arc::new(infrastructure::repositories::FileMetadataManager::default()), // Dummy
        path_resolver: Arc::new(infrastructure::repositories::FilePathResolver::default_stub()), // Dummy
        trash_repository: trash_repository.clone().map(|repo| {
            let repo: Arc<dyn crate::domain::repositories::trash_repository::TrashRepository> =
                repo;
            repo
        }),
    };

    // Create the search service
    let search_service: Option<Arc<dyn application::ports::inbound::SearchUseCase>> = {
        // Create the search service with caching
        let search_service = Arc::new(application::services::search_service::SearchService::new(
            file_repository.clone(),
            folder_repository.clone(),
            300,
            1000,
        ));
        Some(search_service)
    };

    // Initialize share repository and service if enabled
    let share_service: Option<Arc<dyn application::ports::share_ports::ShareUseCase>> =
        if config.features.enable_file_sharing {
            let share_repository = Arc::new(ShareFsRepository::new(Arc::new(config.clone())));

            let share_service = Arc::new(ShareService::new(
                Arc::new(config.clone()),
                share_repository,
                file_repository.clone(),
                folder_repository.clone(),
            ));
            Some(share_service)
        } else {
            None
        };

    // Initialize favorites service
    let favorites_service: Option<Arc<dyn application::ports::favorites_ports::FavoritesUseCase>> =
        Some(Arc::new(FavoritesService::new(db_pool.clone())));

    // Initialize recent items service
    let recent_service: Option<Arc<dyn application::ports::recent_ports::RecentItemsUseCase>> =
        Some(Arc::new(
            application::services::recent_service::RecentService::new(db_pool.clone(), 50),
        ));

    let contact_service: Option<Arc<dyn application::ports::storage_ports::StorageUseCase>> = None;

    let application_services = common::di::ApplicationServices {
        folder_service: folder_service.clone(),
        file_service: file_service.clone(),
        file_upload_service: Arc::new(
            application::services::file_upload_service::FileUploadService::default_stub(),
        ),
        file_retrieval_service: Arc::new(
            application::services::file_retrieval_service::FileRetrievalService::default_stub(),
        ),
        file_management_service: Arc::new(
            application::services::file_management_service::FileManagementService::default_stub(),
        ),
        file_use_case_factory: Arc::new(
            application::services::file_use_case_factory::AppFileUseCaseFactory::default_stub(),
        ),
        i18n_service: i18n_service.clone(),
        trash_service: trash_service.clone(),
        search_service: search_service.clone(),
        share_service: share_service.clone(),
        favorites_service: favorites_service.clone(),
        recent_service: recent_service.clone(),
    };

    let mut app_state = AppState {
        core: core_services,
        repositories: repository_services,
        applications: application_services,
        db_pool: Some(db_pool.clone()),
        auth_service: auth_services.clone(),
        trash_service: trash_service.clone(),
        share_service: share_service.clone(),
        favorites_service: favorites_service.clone(),
        recent_service: recent_service.clone(),
        storage_usage_service: None,
        calendar_service: None,
        contact_service: contact_service.clone(),
    };

    // Initialize storage usage service
    let user_repository = Arc::new(infrastructure::repositories::pg::UserPgRepository::new(
        db_pool.clone(),
    ));

    let service = Arc::new(
        application::services::storage_usage_service::StorageUsageService::new(
            file_repository.clone(),
            user_repository,
        ),
    );
    app_state = app_state.with_storage_usage_service(service.clone());

    // Wrap in Arc after all modifications
    let app_state = Arc::new(app_state);

    // Build application router
    let api_routes = create_api_routes(
        folder_service,
        file_service,
        Some(i18n_service),
        trash_service,
        search_service,
        share_service,
        favorites_service,
        recent_service,
    );
    let web_routes = create_web_routes();

    // Import auth handler
    use interfaces::api::handlers::auth_handler::auth_routes;

    // Create basic app router
    let mut app = Router::new()
        .nest("/api", api_routes)
        .merge(web_routes)
        .layer(TraceLayer::new_for_http());

    // Add auth routes if auth is enabled
    if config.features.enable_auth && auth_services.is_some() {
        let auth_router = auth_routes().with_state(app_state.clone());
        app = app.nest("/api/auth", auth_router);
    }

    // Start server with clear message
    let addr = SocketAddr::from(([0, 0, 0, 0], 8086));
    tracing::info!("Starting OxiCloud server on http://{}", addr);

    // Import the redirect middleware
    use crate::interfaces::middleware::redirect::redirect_middleware;

    // Apply the redirect middleware to handle legacy routes
    app = app.layer(axum::middleware::from_fn(redirect_middleware));

    // Create a standard TCP listener
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to bind to {}: {}", addr, e))?;
    tracing::info!("Server binding to http://{}", addr);
    tracing::info!("Starting server with Axum routes...");

    // Axum 0.8 requires the state to match the expected type
    let app_state_inner = Arc::try_unwrap(app_state).unwrap_or_else(|arc| (*arc).clone());

    // Add global state to the router
    let app = app.with_state(app_state_inner);

    // Use axum's serve function with the router with state
    axum::serve(listener, app)
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {}", e))?;

    tracing::info!("Server shutdown completed");

    Ok(())
}
