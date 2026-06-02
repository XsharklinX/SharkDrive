use std::sync::Arc;
use tauri::State;

use crate::commands::utils::resolve_peer;
use crate::TelegramState;

/// Forward an old file message to the same folder, making it the newest item.
/// This is how "restore version" works — the original message stays in history.
#[tauri::command]
pub async fn cmd_restore_version(
    message_id: i32,
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, folder_id, &state).await?;

    client
        .forward_messages(&peer, &[message_id], &peer)
        .await
        .map_err(|e| format!("Restore version failed: {}", e))?;

    Ok(true)
}

/// Expose Arc<SyncLog> for the state — needed because SyncLog is managed as Arc.
pub use crate::sync_log::SyncLog;
use crate::sync_log::SyncSession;

#[derive(serde::Deserialize)]
pub struct RecordSyncInput {
    pub folder_id: Option<i64>,
    pub folder_name: String,
    pub started_at_ms: i64,
    pub completed_at_ms: i64,
    pub files_total: u32,
    pub files_added: Vec<String>,
    pub files_removed: Vec<String>,
}

#[tauri::command]
pub fn cmd_record_sync_session(
    input: RecordSyncInput,
    sync_log: State<'_, Arc<SyncLog>>,
) {
    let id = make_session_id();
    sync_log.record_session(SyncSession {
        id,
        folder_id: input.folder_id,
        folder_name: input.folder_name,
        started_at_ms: input.started_at_ms,
        completed_at_ms: input.completed_at_ms,
        files_total: input.files_total,
        files_added: input.files_added,
        files_removed: input.files_removed,
    });
}

#[tauri::command]
pub fn cmd_get_sync_history(
    folder_id: Option<Option<i64>>,
    limit: Option<usize>,
    sync_log: State<'_, Arc<SyncLog>>,
) -> Vec<SyncSession> {
    let max = limit.unwrap_or(50).min(200);
    match folder_id {
        Some(fid) => sync_log.get_sessions_for_folder(fid, max),
        None => sync_log.get_sessions(max),
    }
}

fn make_session_id() -> String {
    use rand::Rng;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let jitter: u32 = rand::thread_rng().gen::<u32>() % 9999;
    format!("{}-{:04}", now, jitter)
}
