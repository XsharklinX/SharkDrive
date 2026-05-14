pub mod bandwidth;
pub mod commands;
pub mod models;
pub mod server;

use commands::backup::BackupState;
use commands::encryption::EncryptionState;
use commands::settings::AppSettings;
use commands::share::ShareStore;
use commands::streaming::StreamToken;
use commands::TelegramState;
use rand::Rng;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tokio::sync::Mutex;

fn generate_stream_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub struct ActixServerHandle(pub Arc<std::sync::Mutex<Option<actix_web::dev::ServerHandle>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let stream_token = generate_stream_token();
    let server_handle: Arc<std::sync::Mutex<Option<actix_web::dev::ServerHandle>>> =
        Arc::new(std::sync::Mutex::new(None));
    let server_handle_for_setup = server_handle.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(move |app| {
            // Manage all states
            app.manage(TelegramState {
                client: Arc::new(Mutex::new(None)),
                login_token: Arc::new(Mutex::new(None)),
                password_token: Arc::new(Mutex::new(None)),
                api_id: Arc::new(Mutex::new(None)),
                runner_shutdown: Arc::new(std::sync::Mutex::new(None)),
                runner_count: Arc::new(std::sync::atomic::AtomicU32::new(0)),
            });
            app.manage(bandwidth::BandwidthManager::new(app.handle()));
            app.manage(StreamToken(stream_token.clone()));
            app.manage(ActixServerHandle(server_handle_for_setup.clone()));
            app.manage(EncryptionState::new());
            app.manage(BackupState::new());
            app.manage(AppSettings::new());

            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let share_store = Arc::new(ShareStore::new(app_data_dir.join("share_links.json")));
            app.manage(share_store.clone());

            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            // System tray
            let show_item = MenuItem::with_id(app, "show", "Open SharkDrive", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("SharkDrive")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Start Streaming + Share Server
            let state = Arc::new(app.state::<TelegramState>().inner().clone());
            let token_for_server = stream_token.clone();
            let handle_for_thread = server_handle_for_setup.clone();
            std::thread::spawn(move || {
                let sys = actix_rt::System::new();
                sys.block_on(async move {
                    match server::start_server(state, share_store, 14200, token_for_server).await {
                        Ok(server) => {
                            *handle_for_thread.lock().unwrap() = Some(server.handle());
                            server.await.ok();
                        }
                        Err(e) => log::error!("Streaming server failed: {}", e),
                    }
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cmd_auth_request_code,
            commands::cmd_auth_sign_in,
            commands::cmd_auth_check_password,
            commands::cmd_get_files,
            commands::cmd_upload_file,
            commands::cmd_connect,
            commands::cmd_log,
            commands::cmd_delete_file,
            commands::cmd_download_file,
            commands::cmd_move_files,
            commands::cmd_copy_files,
            commands::cmd_create_folder,
            commands::cmd_delete_folder,
            commands::cmd_get_bandwidth,
            commands::cmd_get_preview,
            commands::cmd_get_book_card_data,
            commands::cmd_logout,
            commands::cmd_scan_folders,
            commands::cmd_search_global,
            commands::cmd_check_connection,
            commands::cmd_is_network_available,
            commands::cmd_clean_cache,
            commands::cmd_get_thumbnail,
            commands::cmd_get_stream_token,
            commands::cmd_rename_file,
            commands::cmd_rename_folder,
            commands::cmd_set_folder_parent,
            commands::cmd_get_or_create_trash,
            commands::cmd_list_dir_files,
            commands::cmd_soft_delete_folder,
            commands::cmd_restore_folder,
            commands::cmd_get_trashed_folders,
            commands::cmd_get_folder_invite_link,
            commands::cmd_get_local_ip,
            // Encryption
            commands::cmd_set_encryption_key,
            commands::cmd_clear_encryption_key,
            commands::cmd_get_encryption_status,
            // Backup
            commands::cmd_add_backup_folder,
            commands::cmd_remove_backup_folder,
            commands::cmd_get_backup_folders,
            commands::cmd_update_backup_folder,
            // Settings
            commands::cmd_set_close_to_tray,
            commands::cmd_get_close_to_tray,
            commands::cmd_set_autostart,
            commands::cmd_get_autostart,
            // Share links
            commands::cmd_create_share_link,
            commands::cmd_revoke_share_link,
            // Clipboard
            commands::cmd_save_clipboard_image,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } => {
            let settings = app_handle.state::<AppSettings>();
            if *settings.close_to_tray.lock().unwrap() {
                if let Some(win) = app_handle.get_webview_window("main") {
                    let _ = win.hide();
                    api.prevent_close();
                }
            }
        }
        tauri::RunEvent::Exit => {
            log::info!("Application exiting — shutting down background services...");
            let shutdown_arc = app_handle.state::<TelegramState>().runner_shutdown.clone();
            let runner_tx = shutdown_arc.lock().ok().and_then(|mut g| g.take());
            if let Some(tx) = runner_tx {
                let _ = tx.send(());
            }

            let server_arc = app_handle.state::<ActixServerHandle>().0.clone();
            let server_handle = server_arc.lock().ok().and_then(|mut g| g.take());
            if let Some(handle) = server_handle {
                drop(handle.stop(true));
            }
        }
        _ => {}
    });
}
