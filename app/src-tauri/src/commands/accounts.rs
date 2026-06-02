use std::sync::Arc;
use tauri::{Emitter, State};
use grammers_client::Client;
use grammers_client::types::Media;
use grammers_mtsender::SenderPool;
use grammers_session::storages::SqliteSession;

use crate::account_manager::{make_account_id, now_ms, AccountManager, AccountMeta};
use crate::commands::utils::resolve_peer;
use crate::index_store::PersistentIndexState;
use crate::sync_log::SyncLog;
use crate::TelegramState;

// ── List / introspect ────────────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_list_accounts(
    account_manager: State<'_, Arc<AccountManager>>,
) -> Vec<AccountMeta> {
    account_manager.list_accounts()
}

#[tauri::command]
pub fn cmd_get_active_account_id(
    account_manager: State<'_, Arc<AccountManager>>,
) -> Option<String> {
    account_manager.get_active_id()
}

// ── Switch account ────────────────────────────────────────────────────────────

/// Disconnect the current client, swap all per-account stores, emit an event.
/// The frontend must call cmd_connect() again after this returns.
#[tauri::command]
pub async fn cmd_switch_account(
    account_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    account_manager: State<'_, Arc<AccountManager>>,
    index_state: State<'_, PersistentIndexState>,
    sync_log: State<'_, Arc<SyncLog>>,
) -> Result<(), String> {
    if account_manager.get_account(&account_id).is_none() {
        return Err(format!("Account '{}' not found", account_id));
    }

    // 1. Shutdown current network runner
    {
        let mut guard = state.runner_shutdown.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = guard.take() { let _ = tx.send(()); }
    }
    tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

    // 2. Clear per-connection state
    *state.client.lock().await = None;
    *state.login_token.lock().await = None;
    *state.password_token.lock().await = None;
    *state.api_id.lock().await = None;
    { state.peer_cache.lock().await.clear(); }

    // 3. Activate the new account in AccountManager
    account_manager.set_active(&account_id);

    // 4. Swap per-account stores
    index_state.swap_to_account(account_manager.index_path());
    sync_log.swap_to_account(account_manager.sync_log_path());

    // 5. Notify frontend — it will call cmd_connect next
    let _ = app_handle.emit("account-switched", &account_id);

    Ok(())
}

// ── Prepare new account slot ─────────────────────────────────────────────────

/// Creates a new account slot and activates it. The frontend then goes through
/// the normal auth flow. After sign_in, call cmd_finalize_account().
#[tauri::command]
pub async fn cmd_prepare_new_account(
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    account_manager: State<'_, Arc<AccountManager>>,
    index_state: State<'_, PersistentIndexState>,
    sync_log: State<'_, Arc<SyncLog>>,
) -> Result<String, String> {
    let new_id = make_account_id();
    let count = account_manager.list_accounts().len() + 1;

    let data_dir = account_manager.data_dir_for(&new_id);
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    account_manager.add_or_update(AccountMeta {
        id: new_id.clone(),
        alias: format!("Account {}", count),
        phone: String::new(),
        api_id: 0,
        accent_color: None,
        added_at_ms: now_ms(),
        avatar_b64: None,
    });

    // Switch to this empty slot so auth commands use its session path
    cmd_switch_account(
        new_id.clone(),
        app_handle,
        state,
        account_manager,
        index_state,
        sync_log,
    ).await?;

    Ok(new_id)
}

// ── Finalize (called right after sign_in succeeds) ────────────────────────────

#[tauri::command]
pub async fn cmd_finalize_account(
    alias: Option<String>,
    state: State<'_, TelegramState>,
    account_manager: State<'_, Arc<AccountManager>>,
) -> Result<AccountMeta, String> {
    let client = {
        let guard = state.client.lock().await;
        guard.as_ref().ok_or("Not connected")?.clone()
    };

    let me = client.get_me().await.map_err(|e| e.to_string())?;
    let phone = me.phone().unwrap_or("").to_string();
    let display_name = alias
        .filter(|a| !a.trim().is_empty())
        .or_else(|| me.username().map(|u| format!("@{}", u)))
        .unwrap_or_else(|| phone.clone());
    let api_id = state.api_id.lock().await.unwrap_or(0);

    let active_id = account_manager.get_active_id().ok_or("No active account")?;
    account_manager.update_meta(&active_id, |meta| {
        meta.alias = display_name;
        meta.phone = phone;
        meta.api_id = api_id;
    });

    account_manager.get_account(&active_id).ok_or("Account not found".to_string())
}

// ── Remove account ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_remove_account(
    account_id: String,
    account_manager: State<'_, Arc<AccountManager>>,
    index_state: State<'_, PersistentIndexState>,
    sync_log: State<'_, Arc<SyncLog>>,
) -> Result<(), String> {
    let was_active = account_manager.get_active_id().as_deref() == Some(&account_id);
    account_manager.remove(&account_id);
    if was_active {
        index_state.swap_to_account(account_manager.index_path());
        sync_log.swap_to_account(account_manager.sync_log_path());
    }
    Ok(())
}

// ── Alias / color / avatar ───────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_set_account_alias(
    account_id: String,
    alias: String,
    account_manager: State<'_, Arc<AccountManager>>,
) {
    account_manager.update_meta(&account_id, |meta| meta.alias = alias);
}

#[tauri::command]
pub fn cmd_set_account_color(
    account_id: String,
    color: Option<String>,
    account_manager: State<'_, Arc<AccountManager>>,
) {
    account_manager.update_meta(&account_id, |meta| meta.accent_color = color);
}

/// Fetch the active account's Telegram profile photo and cache it as a data URL.
/// Uses iter_download on the user's profile photo media.
#[tauri::command]
pub async fn cmd_fetch_account_avatar(
    state: State<'_, TelegramState>,
    account_manager: State<'_, Arc<AccountManager>>,
) -> Result<Option<String>, String> {
    use grammers_tl_types as tl;
    use base64::Engine as _;

    let client = {
        let guard = state.client.lock().await;
        guard.as_ref().ok_or("Not connected")?.clone()
    };

    let result = client
        .invoke(&tl::functions::photos::GetUserPhotos {
            user_id: tl::enums::InputUser::UserSelf,
            offset: 0,
            max_id: 0,
            limit: 1,
        })
        .await
        .map_err(|e| e.to_string())?;

    let photos = match result {
        tl::enums::photos::Photos::Photos(p) => p.photos,
        tl::enums::photos::Photos::Slice(p) => p.photos,
    };

    let photo = match photos.into_iter().next() {
        Some(tl::enums::Photo::Photo(p)) => p,
        _ => return Ok(None),
    };

    // Find a small thumb type string
    let thumb_type = photo.sizes.iter().find_map(|s| match s {
        tl::enums::PhotoSize::Size(ps) if ps.r#type == "s" || ps.r#type == "m" => Some(ps.r#type.clone()),
        _ => None,
    });
    let Some(thumb_type) = thumb_type else { return Ok(None); };

    // Download via GetFile
    let download_result = client
        .invoke(&tl::functions::upload::GetFile {
            precise: false,
            cdn_supported: false,
            location: tl::enums::InputFileLocation::InputPhotoFileLocation(
                tl::types::InputPhotoFileLocation {
                    id: photo.id,
                    access_hash: photo.access_hash,
                    file_reference: photo.file_reference,
                    thumb_size: thumb_type,
                }
            ),
            offset: 0,
            limit: 256 * 1024,
        })
        .await
        .map_err(|e| e.to_string())?;

    let bytes = match download_result {
        tl::enums::upload::File::File(f) => f.bytes,
        _ => return Ok(None),
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:image/jpeg;base64,{}", b64);

    if let Some(active_id) = account_manager.get_active_id() {
        account_manager.update_meta(&active_id, |meta| {
            meta.avatar_b64 = Some(data_url.clone());
        });
    }

    Ok(Some(data_url))
}

// ── Cross-account copy (2-phase: download to temp → upload from temp) ────────

#[derive(serde::Deserialize)]
pub struct CrossCopyEntry {
    pub message_id: i32,
    pub folder_id: Option<i64>,
    pub filename: String,
}

#[derive(serde::Serialize)]
pub struct CrossCopyResult {
    pub transfer_id: String,
    pub temp_paths: Vec<(String, String)>, // (filename, absolute_path)
    pub failed: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
struct CrossCopyProgress {
    transfer_id: String,
    done: usize,
    total: usize,
    filename: String,
}

/// Phase 1: Download files from the active account into a temp dir.
/// The frontend then switches accounts and uploads the temp files.
#[tauri::command]
pub async fn cmd_cross_account_download(
    files: Vec<CrossCopyEntry>,
    transfer_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<CrossCopyResult, String> {
    let client = {
        let guard = state.client.lock().await;
        guard.as_ref().ok_or("Source account not connected")?.clone()
    };

    let temp_dir = std::env::temp_dir().join(format!("sharkdrive_xcopy_{}", &transfer_id));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let total = files.len();
    let mut temp_paths: Vec<(String, String)> = Vec::new();
    let mut failed: Vec<String> = Vec::new();

    for (idx, entry) in files.iter().enumerate() {
        let _ = app_handle.emit("cross-copy-progress", CrossCopyProgress {
            transfer_id: transfer_id.clone(),
            done: idx,
            total,
            filename: entry.filename.clone(),
        });

        let temp_path = temp_dir.join(&entry.filename);
        let temp_str = temp_path.to_string_lossy().to_string();

        match download_to_temp(&client, entry.message_id, entry.folder_id, &temp_str, &state).await {
            Ok(()) => temp_paths.push((entry.filename.clone(), temp_str)),
            Err(e) => {
                log::error!("Cross-copy download failed for {}: {}", entry.filename, e);
                failed.push(entry.filename.clone());
            }
        }
    }

    let _ = app_handle.emit("cross-copy-progress", CrossCopyProgress {
        transfer_id: transfer_id.clone(),
        done: total,
        total,
        filename: String::new(),
    });

    Ok(CrossCopyResult { transfer_id, temp_paths, failed })
}

/// Phase 2: Cleanup temp files after the upload is done.
#[tauri::command]
pub fn cmd_cross_account_cleanup(transfer_id: String) {
    let temp_dir = std::env::temp_dir().join(format!("sharkdrive_xcopy_{}", &transfer_id));
    let _ = std::fs::remove_dir_all(temp_dir);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async fn download_to_temp(
    client: &Client,
    message_id: i32,
    folder_id: Option<i64>,
    save_path: &str,
    state: &TelegramState,
) -> Result<(), String> {
    let peer = resolve_peer(client, folder_id, state).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;

    let msg = messages.into_iter().flatten().next().ok_or("Message not found")?;
    let media = msg.media().ok_or("No media in message")?;

    match &media {
        Media::Document(_) | Media::Photo(_) => {}
        _ => return Err("Unsupported media type".to_string()),
    }

    if let Some(parent) = std::path::Path::new(save_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut file = std::fs::File::create(save_path).map_err(|e| e.to_string())?;
    let mut iter = client.iter_download(&media);

    while let Some(chunk) = iter.next().await.transpose() {
        let bytes = chunk.map_err(|e| e.to_string())?;
        use std::io::Write;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    Ok(())
}
