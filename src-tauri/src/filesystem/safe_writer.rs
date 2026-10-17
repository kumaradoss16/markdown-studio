use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileMetadata {
    pub path: String,
    pub name: String,
    pub content: String,
    pub hash: String,
    pub mtime: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveResult {
    pub path: String,
    pub hash: String,
    pub mtime: u64,
}

pub struct SafeWriter;

impl SafeWriter {
    /// Computes a hex-encoded SHA-256 hash of the content.
    pub fn compute_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Validates that a path does not contain traversal attempts.
    pub fn validate_path(path_str: &str) -> Result<PathBuf, String> {
        let path = PathBuf::from(path_str);
        if path_str.contains("..") {
            return Err("Path traversal attempt detected.".to_string());
        }
        Ok(path)
    }

    /// Reads a file and returns its content, metadata, and hash.
    pub fn read_file(path_str: &str) -> Result<FileMetadata, String> {
        let path = Self::validate_path(path_str)?;
        if !path.exists() {
            return Err(format!("File does not exist: {}", path_str));
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let metadata = fs::metadata(&path)
            .map_err(|e| format!("Failed to inspect file metadata: {}", e))?;

        let mtime = metadata
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64)
            .unwrap_or(0);

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path_str)
            .to_string();

        let hash = Self::compute_hash(&content);

        Ok(FileMetadata {
            path: path_str.to_string(),
            name,
            content,
            hash,
            mtime,
        })
    }

    /// Safely writes content to target path using a temporary file and atomic rename.
    pub fn safe_save(
        path_str: &str,
        content: &str,
        expected_hash: Option<String>,
    ) -> Result<SaveResult, String> {
        let target_path = Self::validate_path(path_str)?;

        // Ensure parent directory exists
        if let Some(parent) = target_path.parent() {
            if !parent.as_os_str().is_empty() && !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
        }

        // Check for external modification if expected_hash was provided and file exists
        if target_path.exists() {
            if let Some(exp_hash) = expected_hash {
                let existing_content = fs::read_to_string(&target_path)
                    .map_err(|e| format!("Failed to read existing file: {}", e))?;
                let current_hash = Self::compute_hash(&existing_content);

                if current_hash != exp_hash {
                    return Err(
                        "File modified externally on disk. Save aborted to prevent data loss."
                            .to_string(),
                    );
                }
            }
        }

        // Create temporary file adjacent to the target
        let parent = target_path.parent().unwrap_or_else(|| Path::new("."));
        let temp_file_path = parent.join(format!(".tmp-save-{}", uuid_or_timestamp()));

        let mut temp_file = File::create(&temp_file_path)
            .map_err(|e| format!("Failed to create temporary file: {}", e))?;

        temp_file
            .write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write content to temporary file: {}", e))?;

        temp_file
            .flush()
            .map_err(|e| format!("Failed to flush temporary file: {}", e))?;

        // Safely rename/replace destination
        fs::rename(&temp_file_path, &target_path).map_err(|e| {
            let _ = fs::remove_file(&temp_file_path);
            format!("Failed to atomically replace destination file: {}", e)
        })?;

        let metadata = fs::metadata(&target_path)
            .map_err(|e| format!("Failed to read saved file metadata: {}", e))?;

        let mtime = metadata
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as u64)
            .unwrap_or(0);

        let hash = Self::compute_hash(content);

        Ok(SaveResult {
            path: path_str.to_string(),
            hash,
            mtime,
        })
    }
}

fn uuid_or_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_path_blocks_traversal() {
        assert!(SafeWriter::validate_path("../secret.txt").is_err());
        assert!(SafeWriter::validate_path("vault/../../passwords").is_err());
        assert!(SafeWriter::validate_path("vault/safe_doc.md").is_ok());
    }

    #[test]
    fn test_compute_hash_deterministic() {
        let hash1 = SafeWriter::compute_hash("DevspireHub Studio");
        let hash2 = SafeWriter::compute_hash("DevspireHub Studio");
        let hash3 = SafeWriter::compute_hash("Different Content");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
        assert_eq!(hash1.len(), 64);
    }
}
