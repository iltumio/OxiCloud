-- Create schema for storage-related tables
CREATE SCHEMA IF NOT EXISTS storage;

-- Storage Blobs (Physical Files / Content Addressable)
-- Stores the actual content addressable via multihash
CREATE TABLE IF NOT EXISTS storage.blobs (
    multihash TEXT PRIMARY KEY,
    size_bytes BIGINT NOT NULL,
    mime_type TEXT,
    ref_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Storage Folders (Logical Structure)
CREATE TABLE IF NOT EXISTS storage.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES storage.folders(id) ON DELETE CASCADE,
    owner_id VARCHAR(36) REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ensure unique names within a parent folder for a specific owner
    UNIQUE(parent_id, name, owner_id)
);

-- Partial index for unique root folders per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_root_folders 
ON storage.folders(name, owner_id) 
WHERE parent_id IS NULL;

-- Storage Files (Logical Files)
CREATE TABLE IF NOT EXISTS storage.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES storage.folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    multihash TEXT NOT NULL REFERENCES storage.blobs(multihash),
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    owner_id VARCHAR(36) REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    modified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Ensure unique file names within a folder for a specific owner
    UNIQUE(folder_id, name, owner_id)
);

-- Partial index for unique root files per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_root_files 
ON storage.files(name, owner_id) 
WHERE folder_id IS NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_storage_files_folder_id ON storage.files(folder_id);
CREATE INDEX IF NOT EXISTS idx_storage_files_owner_id ON storage.files(owner_id);
CREATE INDEX IF NOT EXISTS idx_storage_folders_parent_id ON storage.folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_storage_folders_owner_id ON storage.folders(owner_id);

-- Drop legacy table if it exists (since we are resetting storage)
-- Note: Depending on system coupling, we might need to recreate a view or keep this synced.
-- For now, we assume we are replacing the storage subsystem.
DROP TABLE IF EXISTS auth.user_files;

