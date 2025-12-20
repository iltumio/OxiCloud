use cid::Cid;
use multihash::Multihash;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::fs::{self, File};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::instrument;

use crate::common::errors::DomainError;

// Multihash code for SHA2-256 (0x12)
const SHA2_256_CODE: u64 = 0x12;
// CID codec for raw binary (0x55)
const RAW_CODEC: u64 = 0x55;

#[derive(Clone)]
pub struct BlobStorageRepository {
    root_path: PathBuf,
}

impl BlobStorageRepository {
    pub fn new(root_path: PathBuf) -> Self {
        Self { root_path }
    }

    /// Generates a CID v1 for the content using SHA2-256 and raw codec.
    /// This produces an IPFS-compatible content identifier.
    pub fn generate_cid(content: &[u8]) -> String {
        // Compute SHA2-256 hash
        let mut hasher = Sha256::new();
        hasher.update(content);
        let digest = hasher.finalize();

        // Create multihash: wrap the digest with SHA2-256 code
        // Multihash format: <hash-func-code><digest-size><digest-value>
        let multihash = Multihash::<64>::wrap(SHA2_256_CODE, &digest)
            .expect("SHA2-256 digest should fit in 64-byte multihash");

        // Create CID v1 with raw codec
        let cid = Cid::new_v1(RAW_CODEC, multihash);

        // Return base32 encoded CID (default for CIDv1)
        cid.to_string()
    }

    #[instrument(skip(self, content))]
    pub async fn save_blob(&self, content: &[u8]) -> Result<(String, u64), DomainError> {
        let cid_string = Self::generate_cid(content);
        let file_path = self.root_path.join(&cid_string);

        // Deduplication: Check if file already exists (content-addressable)
        if file_path.exists() {
            tracing::info!("Blob already exists (deduplication): {}", cid_string);
            return Ok((cid_string, content.len() as u64));
        }

        // Ensure root directory exists
        if !self.root_path.exists() {
            fs::create_dir_all(&self.root_path).await.map_err(|e| {
                DomainError::internal_error(
                    "BlobStorage",
                    format!("Failed to create blob storage directory: {}", e),
                )
            })?;
        }

        // Write file atomically: write to temp file, then rename
        let temp_path = self.root_path.join(format!(".tmp.{}", &cid_string));

        let mut file = File::create(&temp_path).await.map_err(|e| {
            DomainError::internal_error(
                "BlobStorage",
                format!("Failed to create temp blob file: {}", e),
            )
        })?;

        file.write_all(content).await.map_err(|e| {
            DomainError::internal_error(
                "BlobStorage",
                format!("Failed to write blob content: {}", e),
            )
        })?;

        file.flush().await.map_err(|e| {
            DomainError::internal_error("BlobStorage", format!("Failed to flush blob file: {}", e))
        })?;

        // Sync to disk
        file.sync_all().await.map_err(|e| {
            DomainError::internal_error("BlobStorage", format!("Failed to sync blob file: {}", e))
        })?;

        drop(file);

        // Atomic rename
        fs::rename(&temp_path, &file_path).await.map_err(|e| {
            DomainError::internal_error(
                "BlobStorage",
                format!("Failed to rename temp blob file: {}", e),
            )
        })?;

        tracing::info!("Saved new blob: {} ({} bytes)", cid_string, content.len());
        Ok((cid_string, content.len() as u64))
    }

    #[instrument(skip(self))]
    pub async fn get_blob(&self, cid: &str) -> Result<Vec<u8>, DomainError> {
        let file_path = self.root_path.join(cid);

        if !file_path.exists() {
            return Err(DomainError::not_found("Blob", cid.to_string()));
        }

        let mut file = File::open(&file_path).await.map_err(|e| {
            DomainError::internal_error("BlobStorage", format!("Failed to open blob file: {}", e))
        })?;

        let mut content = Vec::new();
        file.read_to_end(&mut content).await.map_err(|e| {
            DomainError::internal_error(
                "BlobStorage",
                format!("Failed to read blob content: {}", e),
            )
        })?;

        Ok(content)
    }

    /// Returns the filesystem path for a given CID
    pub fn get_blob_path(&self, cid: &str) -> PathBuf {
        self.root_path.join(cid)
    }

    /// Check if a blob exists
    pub fn blob_exists(&self, cid: &str) -> bool {
        self.root_path.join(cid).exists()
    }

    /// Delete a blob by its CID
    /// Note: Only call this when reference count reaches 0
    pub async fn delete_blob(&self, cid: &str) -> Result<(), DomainError> {
        let file_path = self.root_path.join(cid);

        if file_path.exists() {
            fs::remove_file(&file_path).await.map_err(|e| {
                DomainError::internal_error(
                    "BlobStorage",
                    format!("Failed to delete blob file: {}", e),
                )
            })?;
            tracing::info!("Deleted blob: {}", cid);
        }

        Ok(())
    }

    /// Verify blob integrity by recomputing its CID
    pub async fn verify_blob(&self, cid: &str) -> Result<bool, DomainError> {
        let content = self.get_blob(cid).await?;
        let computed_cid = Self::generate_cid(&content);
        Ok(computed_cid == cid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_cid_deterministic() {
        let content = b"Hello, IPFS!";
        let cid1 = BlobStorageRepository::generate_cid(content);
        let cid2 = BlobStorageRepository::generate_cid(content);
        assert_eq!(cid1, cid2);
    }

    #[test]
    fn test_generate_cid_different_content() {
        let content1 = b"Hello, IPFS!";
        let content2 = b"Hello, World!";
        let cid1 = BlobStorageRepository::generate_cid(content1);
        let cid2 = BlobStorageRepository::generate_cid(content2);
        assert_ne!(cid1, cid2);
    }

    #[test]
    fn test_cid_format() {
        let content = b"test content";
        let cid = BlobStorageRepository::generate_cid(content);
        // CIDv1 base32 starts with 'b'
        assert!(
            cid.starts_with('b'),
            "CIDv1 should use base32 encoding starting with 'b'"
        );
    }
}
