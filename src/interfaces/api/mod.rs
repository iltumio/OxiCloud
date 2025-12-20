pub mod handlers;
pub mod routes;

pub use routes::create_api_routes;

use utoipa::OpenApi;
use crate::interfaces::api::handlers::{folder_handler, file_handler};
use crate::application::dtos::folder_dto::{FolderDto, CreateFolderDto, RenameFolderDto, MoveFolderDto};
use crate::application::dtos::file_dto::FileDto;
use crate::interfaces::api::handlers::file_handler::{MoveFilePayload, FileUploadDto};
use crate::application::dtos::pagination::{PaginationRequestDto, PaginatedResponseDto, PaginationDto};

#[derive(OpenApi)]
#[openapi(
    paths(
        folder_handler::create_folder,
        folder_handler::get_folder,
        folder_handler::list_root_folders,
        folder_handler::list_folder_contents,
        folder_handler::list_root_folders_paginated,
        folder_handler::list_folder_contents_paginated,
        folder_handler::rename_folder,
        folder_handler::move_folder,
        folder_handler::delete_folder_with_trash,
        file_handler::upload_file,
        file_handler::download_file,
        file_handler::list_files,
        file_handler::delete_file,
        file_handler::move_file
    ),
    components(
        schemas(
            FolderDto, 
            CreateFolderDto, 
            RenameFolderDto, 
            MoveFolderDto,
            FileDto,
            MoveFilePayload,
            FileUploadDto,
            PaginationRequestDto,
            PaginatedResponseDto<FolderDto>,
            PaginationDto
        )
    ),
    tags(
        (name = "folders", description = "Folder management endpoints"),
        (name = "files", description = "File management endpoints")
    )
)]
pub struct ApiDoc;
