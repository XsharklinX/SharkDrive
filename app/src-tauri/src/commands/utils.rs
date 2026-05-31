use tokio::time::{sleep, Duration};
use crate::bandwidth::BandwidthManager;
use crate::commands::TelegramState;
use crate::StartupArgs;
use grammers_client::types::Peer;
use grammers_client::Client;
use tauri::State;

fn peer_cache_key(folder_id: Option<i64>) -> String {
    folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string())
}

pub async fn resolve_peer(
    client: &Client,
    folder_id: Option<i64>,
    telegram_state: &TelegramState,
) -> Result<Peer, String> {
    let cache_key = peer_cache_key(folder_id);
    if let Some(cached) = telegram_state
        .peer_cache
        .lock()
        .await
        .get(&cache_key)
        .cloned()
    {
        return Ok(cached);
    }

    if let Some(fid) = folder_id {
        let mut dialogs = client.iter_dialogs();
        while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
            // We use .raw.id() based on compiler suggestions that .id() might be missing on wrapper types in this version
            match &dialog.peer {
                Peer::Channel(c) => {
                    if c.raw.id == fid {
                        telegram_state
                            .peer_cache
                            .lock()
                            .await
                            .insert(cache_key.clone(), dialog.peer.clone());
                        return Ok(dialog.peer.clone());
                    }
                }
                Peer::User(u) => {
                    if u.raw.id() == fid {
                        telegram_state
                            .peer_cache
                            .lock()
                            .await
                            .insert(cache_key.clone(), dialog.peer.clone());
                        return Ok(dialog.peer.clone());
                    }
                }
                _ => {}
            }
        }
        Err(format!("Folder/Chat {} not found", fid))
    } else {
        match client.get_me().await {
            Ok(me) => {
                let peer = Peer::User(me);
                telegram_state
                    .peer_cache
                    .lock()
                    .await
                    .insert(cache_key, peer.clone());
                Ok(peer)
            }
            Err(e) => Err(e.to_string()),
        }
    }
}

#[tauri::command]
pub fn cmd_log(message: String) {
    log::info!("[FRONTEND] {}", message);
}

#[tauri::command]
pub fn cmd_get_bandwidth(
    bw_state: State<'_, BandwidthManager>,
) -> crate::bandwidth::BandwidthStats {
    bw_state.get_stats()
}

#[tauri::command]
pub fn cmd_get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to read file size: {}", e))
}

pub fn is_retryable_error(err: &str) -> bool {
    err.contains("connection")
        || err.contains("timed out")
        || err.contains("reset by peer")
        || err.contains("broken pipe")
        || err.contains("temporarily unavailable")
}

pub async fn with_retry<F, Fut, T>(mut f: F) -> Result<T, String>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let delays = [1u64, 2];
    let mut last_err = String::new();
    for (attempt, &delay) in std::iter::once(&0u64).chain(delays.iter()).enumerate() {
        if attempt > 0 {
            sleep(Duration::from_secs(delay)).await;
        }
        match f().await {
            Ok(v) => return Ok(v),
            Err(e) if is_retryable_error(&e) => last_err = e,
            Err(e) => return Err(e),
        }
    }
    Err(last_err)
}

/// Returns the startup argument (protocol URL or file path) once, then clears it.
/// The frontend calls this on mount to detect context-menu uploads or deep links.
#[tauri::command]
pub fn cmd_get_startup_args(state: State<'_, StartupArgs>) -> Option<String> {
    state.0.lock().ok()?.take()
}

pub fn map_error(e: impl std::fmt::Display) -> String {
    let err_str = e.to_string();
    if err_str.contains("FLOOD_WAIT") {
        // Expected format: ... (value: 1234)
        if let Some(start) = err_str.find("(value: ") {
            let rest = &err_str[start + 8..];
            if let Some(end) = rest.find(')') {
                if let Ok(seconds) = rest[..end].parse::<i64>() {
                    return format!("FLOOD_WAIT_{}", seconds);
                }
            }
        }
        // Fallback if parsing fails but we know it's a flood wait
        return "FLOOD_WAIT_60".to_string();
    }
    err_str
}
