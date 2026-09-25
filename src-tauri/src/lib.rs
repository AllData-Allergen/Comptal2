mod commands;
mod paths;

use commands::Session;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Session::new());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .setup(|app| {
            // Crée l'arborescence de données au premier lancement
            let root = paths::data_root(&app.handle().clone());
            for sub in ["logs", "profils", "parameter", "plugins"] {
                let _ = std::fs::create_dir_all(root.join(sub));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_session_info,
            commands::read_text_file,
            commands::write_text_file,
            commands::append_text_line,
            commands::read_dir,
            commands::path_exists,
            commands::mkdirs,
            commands::delete_file,
            commands::delete_dir,
            commands::copy_dir,
            commands::rename_dir,
            commands::write_binary_file,
            commands::resolve_data_path,
            commands::zip_dir,
            commands::unzip_to,
            commands::read_external_text_file,
            commands::write_external_text_file,
            commands::write_external_binary_file,
            commands::read_external_dir,
            commands::external_exists,
            commands::open_path,
            commands::seal_profile_mode,
            commands::verify_profile_mode,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au lancement de Comptal2.1");
}
