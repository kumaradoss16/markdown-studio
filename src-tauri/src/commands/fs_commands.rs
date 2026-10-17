use crate::filesystem::{FileMetadata, SafeWriter, SaveResult};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub ext: String,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<FileMetadata, String> {
    SafeWriter::read_file(&path)
}

#[tauri::command]
pub fn save_file(
    path: String,
    content: String,
    expected_hash: Option<String>,
) -> Result<SaveResult, String> {
    SafeWriter::safe_save(&path, &content, expected_hash)
}

#[tauri::command]
pub fn create_file(path: String, content: Option<String>) -> Result<SaveResult, String> {
    let initial_content = content.unwrap_or_default();
    SafeWriter::safe_save(&path, &initial_content, None)
}

#[tauri::command]
pub fn list_workspace(root: String) -> Result<Vec<WorkspaceEntry>, String> {
    let root_path = SafeWriter::validate_path(&root)?;
    if !root_path.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(&root_path)
        .map_err(|e| format!("Failed to read workspace directory: {}", e))?;

    for item in read_dir.flatten() {
        let p = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        let is_dir = p.is_dir();
        let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        let path_str = p.to_string_lossy().to_string();

        entries.push(WorkspaceEntry {
            path: path_str,
            name,
            is_dir,
            ext,
        });
    }

    Ok(entries)
}
