pub mod account_manager;
pub mod bandwidth;
pub mod commands;
pub mod index_store;
pub mod models;
pub mod server;
pub mod sync_log;
pub mod web_auth;

use commands::automation::AutomationState;
use commands::backup::{start_watching, BackupState};
use commands::encryption::EncryptionState;
use commands::settings::AppSettings;
use commands::share::ShareStore;
use commands::streaming::StreamToken;
use commands::TelegramState;
use account_manager::AccountManager;
use commands::security::{TotpState, WipeState};
use index_store::PersistentIndexState;
use sync_log::SyncLog;
use web_auth::WebAuthState;
use rand::Rng;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

fn generate_stream_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub struct ActixServerHandle(pub Arc<std::sync::Mutex<Option<actix_web::dev::ServerHandle>>>);

/// Move a single-account installation into the multi-account accounts/ directory.
fn migrate_legacy_account(app_data_dir: &std::path::Path, manager: &AccountManager) {
    if !manager.list_accounts().is_empty() { return; }

    let legacy_session = app_data_dir.join("telegram.session");
    if !legacy_session.exists() { return; }

    let account_id = "acc_default".to_string();
    let account_dir = manager.data_dir_for(&account_id);
    let _ = std::fs::create_dir_all(&account_dir);

    // Move session files
    for suffix in &["", "-wal", "-shm"] {
        let src = app_data_dir.join(format!("telegram.session{}", suffix));
        let dst = account_dir.join(format!("telegram.session{}", suffix));
        if src.exists() { let _ = std::fs::rename(src, dst); }
    }
    let src_enc = app_data_dir.join("telegram.session.sdenc");
    if src_enc.exists() { let _ = std::fs::rename(src_enc, account_dir.join("telegram.session.sdenc")); }

    // Copy index + sync log
    for filename in &["persistent_index.json", "sync_log.json"] {
        let src = app_data_dir.join(filename);
        if src.exists() { let _ = std::fs::copy(&src, account_dir.join(filename)); }
    }

    manager.add_or_update(account_manager::AccountMeta {
        id: account_id.clone(),
        alias: "Account 1".to_string(),
        phone: String::new(),
        api_id: 0,
        accent_color: None,
        added_at_ms: account_manager::now_ms(),
        avatar_b64: None,
    });
    manager.set_active(&account_id);
    log::info!("Migrated legacy account to accounts/{}", account_id);
}

/// Startup arguments (protocol URL or file path) consumed once by the frontend.
pub struct StartupArgs(pub std::sync::Mutex<Option<String>>);

/// Register context-menu entry and sharkdrive:// protocol handler in HKCU (no admin required).
#[cfg(target_os = "windows")]
fn register_windows_integration(exe_path: &str) {
    use winreg::RegKey;
    use winreg::enums::*;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // sharkdrive:// URL scheme
    if let Ok((proto, _)) = hkcu.create_subkey(r"Software\Classes\sharkdrive") {
        let _ = proto.set_value("", &"URL:SharkDrive Protocol");
        let _ = proto.set_value("URL Protocol", &"");
        if let Ok((cmd, _)) = hkcu.create_subkey(r"Software\Classes\sharkdrive\shell\open\command") {
            let _ = cmd.set_value("", &format!("\"{}\" \"%1\"", exe_path));
        }
        if let Ok((icon, _)) = hkcu.create_subkey(r"Software\Classes\sharkdrive\DefaultIcon") {
            let _ = icon.set_value("", &format!("{},0", exe_path));
        }
    }

    // Right-click context menu on all files
    if let Ok((shell, _)) = hkcu.create_subkey(r"Software\Classes\*\shell\SharkDrive") {
        let _ = shell.set_value("", &"Upload to SharkDrive");
        let _ = shell.set_value("Icon", &format!("{},0", exe_path));
        if let Ok((cmd, _)) = hkcu.create_subkey(r"Software\Classes\*\shell\SharkDrive\command") {
            // Launch app with sharkdrive://upload?path=<file> so it's handled as a protocol URL
            let _ = cmd.set_value(
                "",
                &format!("\"{}\" \"sharkdrive://upload?path=%1\"", exe_path),
            );
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let stream_token = generate_stream_token();
    let server_handle: Arc<std::sync::Mutex<Option<actix_web::dev::ServerHandle>>> =
        Arc::new(std::sync::Mutex::new(None));
    let server_handle_for_setup = server_handle.clone();

    // Capture any startup argument (protocol URL or file path from context menu)
    let startup_arg: Option<String> = std::env::args()
        .nth(1)
        .filter(|a| !a.starts_with("--") && !a.is_empty());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            app.manage(StartupArgs(std::sync::Mutex::new(startup_arg.clone())));
            // Manage all states
            app.manage(TelegramState {
                client: Arc::new(Mutex::new(None)),
                login_token: Arc::new(Mutex::new(None)),
                password_token: Arc::new(Mutex::new(None)),
                api_id: Arc::new(Mutex::new(None)),
                peer_cache: Arc::new(Mutex::new(std::collections::HashMap::new())),
                runner_shutdown: Arc::new(std::sync::Mutex::new(None)),
                runner_count: Arc::new(std::sync::atomic::AtomicU32::new(0)),
            });
            app.manage(bandwidth::BandwidthManager::new(app.handle()));
            app.manage(StreamToken(stream_token.clone()));
            app.manage(ActixServerHandle(server_handle_for_setup.clone()));
            app.manage(EncryptionState::new());
            app.manage(AppSettings::new());

            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let backup_state = BackupState::new(app_data_dir.join("backup_folders.json"));
            start_watching(&backup_state, app.handle().clone());
            app.manage(backup_state);
            app.manage(AutomationState::new(
                app_data_dir.join("automation_config.json"),
            ));
            let share_store = Arc::new(ShareStore::new(app_data_dir.join("share_links.json")));
            app.manage(share_store.clone());

            // ── Multi-account setup ───────────────────────────────────────────
            let account_manager = Arc::new(AccountManager::new(&app_data_dir));

            // Migrate single-account users: move legacy session + index into accounts/
            migrate_legacy_account(&app_data_dir, &account_manager);

            // Per-account stores — use the active account's paths
            app.manage(PersistentIndexState::new(account_manager.index_path()));
            let sync_log = Arc::new(SyncLog::new(account_manager.sync_log_path()));
            app.manage(sync_log);
            let web_auth = Arc::new(WebAuthState::new(app_data_dir.join("web_auth.json")));
            app.manage(web_auth.clone());
            app.manage(Arc::new(WipeState::new(app_data_dir.join("wipe_config.json"))));
            app.manage(Arc::new(TotpState::new(app_data_dir.join("totp_secret.enc"))));
            app.manage(account_manager.clone());

            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            // System tray — improved menu
            let upload_item = MenuItem::with_id(app, "tray-upload", "Upload File…", true, None::<&str>)?;
            let sync_item   = MenuItem::with_id(app, "tray-sync",   "Sync Now",      true, None::<&str>)?;
            let sep1        = PredefinedMenuItem::separator(app)?;
            let show_item   = MenuItem::with_id(app, "show",        "Open SharkDrive", true, None::<&str>)?;
            let sep2        = PredefinedMenuItem::separator(app)?;
            let quit_item   = MenuItem::with_id(app, "quit",        "Quit",          true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&upload_item, &sync_item, &sep1, &show_item, &sep2, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("SharkDrive")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "tray-upload" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            let _ = app.emit("tray-upload-file", ());
                        }
                        "tray-sync" => {
                            let _ = app.emit("tray-sync-now", ());
                        }
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
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

            // Register Windows shell integration (HKCU — no admin needed)
            #[cfg(target_os = "windows")]
            if let Ok(exe) = std::env::current_exe() {
                let exe_str = exe.to_string_lossy().to_string();
                register_windows_integration(&exe_str);
                log::info!("Registered Windows integration for: {}", exe_str);
            }

            // Start Streaming + Share + Web companion Server
            let state = Arc::new(app.state::<TelegramState>().inner().clone());
            let token_for_server = stream_token.clone();
            let handle_for_thread = server_handle_for_setup.clone();
            let web_auth_for_server = web_auth.clone();
            let account_manager_for_server = account_manager.clone();
            let app_handle_for_server = app.handle().clone();
            std::thread::spawn(move || {
                let sys = actix_rt::System::new();
                sys.block_on(async move {
                    match server::start_server(
                        state,
                        share_store,
                        web_auth_for_server,
                        account_manager_for_server,
                        app_handle_for_server,
                        14200,
                        token_for_server,
                    ).await {
                        Ok(server) => {
                            if let Ok(mut h) = handle_for_thread.lock() {
                                *h = Some(server.handle());
                            }
                            server.await.ok();
                        }
                        Err(e) => log::error!("Streaming server failed: {}", e),
                    }
                });
            });

            let automation_app = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(30));
                if automation_app
                    .state::<AutomationState>()
                    .take_due_scheduled_sync()
                {
                    let _ = automation_app.emit("scheduled-sync-request", ());
                }
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
            commands::cmd_is_session_protected,
            commands::cmd_unlock_session_pin,
            commands::cmd_set_session_pin,
            commands::cmd_clear_session_pin,
            commands::cmd_log,
            commands::cmd_delete_file,
            commands::cmd_download_file,
            commands::cmd_download_files_zip,
            commands::cmd_move_files,
            commands::cmd_copy_files,
            commands::cmd_create_folder,
            commands::cmd_delete_folder,
            commands::cmd_get_bandwidth,
            commands::cmd_get_preview,
            commands::cmd_get_book_card_data,
            commands::cmd_index_pdf_text,
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
            commands::cmd_list_dir_files,
            commands::cmd_get_folder_size,
            commands::cmd_get_all_indexed_files,
            commands::cmd_get_folder_invite_link,
            commands::cmd_get_local_ip,
            // Encryption
            commands::cmd_set_encryption_key,
            commands::cmd_unlock_encryption_key,
            commands::cmd_clear_encryption_key,
            commands::cmd_get_encryption_status,
            commands::cmd_touch_encryption_activity,
            commands::cmd_set_encryption_auto_lock,
            commands::cmd_rotate_encryption_key,
            commands::cmd_encrypt_remote_files,
            // Backup
            commands::cmd_add_backup_folder,
            commands::cmd_remove_backup_folder,
            commands::cmd_get_backup_folders,
            commands::cmd_update_backup_folder,
            commands::cmd_get_automation_config,
            commands::cmd_set_scheduled_sync_time,
            commands::cmd_set_cleanup_rules,
            commands::cmd_get_due_cleanup_files,
            // Settings
            commands::cmd_set_close_to_tray,
            commands::cmd_get_close_to_tray,
            commands::cmd_set_autostart,
            commands::cmd_get_autostart,
            // Share links
            commands::cmd_create_share_link,
            commands::cmd_revoke_share_link,
            commands::cmd_revoke_share_links,
            commands::cmd_list_share_links,
            // Clipboard
            commands::cmd_save_clipboard_image,
            commands::cmd_get_file_size,
            commands::cmd_export_csv,
            commands::cmd_get_startup_args,
            commands::cmd_export_manifest_json,
            commands::cmd_duplicate_file,
            commands::cmd_batch_rename,
            commands::cmd_get_cached_files,
            commands::cmd_get_cached_folders,
            commands::cmd_get_files_paged,
            commands::cmd_extract_zip,
            commands::cmd_compress_image,
            // v3.2 — Historial & Versiones
            commands::cmd_restore_version,
            commands::cmd_record_sync_session,
            commands::cmd_get_sync_history,
            commands::cmd_find_duplicates,
            commands::cmd_export_activity_log,
            // v3.3 — Multi-Cuenta
            commands::cmd_list_accounts,
            commands::cmd_get_active_account_id,
            commands::cmd_switch_account,
            commands::cmd_prepare_new_account,
            commands::cmd_finalize_account,
            commands::cmd_remove_account,
            commands::cmd_set_account_alias,
            commands::cmd_set_account_color,
            commands::cmd_fetch_account_avatar,
            commands::cmd_cross_account_download,
            commands::cmd_cross_account_cleanup,
            // v3.6 — Seguridad Avanzada
            commands::cmd_verify_file_integrity,
            commands::cmd_set_wipe_secret,
            commands::cmd_clear_wipe_secret,
            commands::cmd_has_wipe_secret,
            commands::cmd_check_remote_wipe,
            commands::cmd_execute_wipe,
            commands::cmd_save_encrypted_activity,
            commands::cmd_load_encrypted_activity,
            commands::cmd_is_totp_enabled,
            commands::cmd_setup_totp,
            commands::cmd_confirm_totp_setup,
            commands::cmd_verify_totp,
            commands::cmd_disable_totp,
            commands::cmd_export_folder_key,
            commands::cmd_import_folder_key,
            // v3.5 — Automatización Avanzada
            commands::cmd_set_wifi_only_sync,
            commands::cmd_is_wifi_connected,
            commands::cmd_count_cleanup_candidates,
            // v3.4 — Companion Móvil
            commands::cmd_set_web_pin,
            commands::cmd_clear_web_pin,
            commands::cmd_has_web_pin,
            commands::cmd_get_web_access_url,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::WindowEvent {
            event: tauri::WindowEvent::CloseRequested { api, .. },
            ..
        } => {
            let settings = app_handle.state::<AppSettings>();
            if settings.close_to_tray.lock().map(|v| *v).unwrap_or(false) {
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
