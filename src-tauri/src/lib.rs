pub mod commands;
pub mod filesystem;

use commands::{create_file, list_workspace, read_file, save_file};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            save_file,
            create_file,
            list_workspace
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkForge Markdown Studio");
}
