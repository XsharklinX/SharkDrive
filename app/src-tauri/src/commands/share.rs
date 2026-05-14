use rand::Rng;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ShareEntry {
    pub file_id: i32,
    pub folder_id: Option<i64>,
    pub filename: String,
    pub expires_at_epoch_ms: Option<u128>,
}

pub struct ShareStore {
    pub shares: Mutex<HashMap<String, ShareEntry>>,
    store_path: PathBuf,
}

impl ShareStore {
    pub fn new(store_path: PathBuf) -> Self {
        let shares = std::fs::read_to_string(&store_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<HashMap<String, ShareEntry>>(&raw).ok())
            .unwrap_or_default();

        Self {
            shares: Mutex::new(shares),
            store_path,
        }
    }

    fn persist(&self) {
        if let Some(parent) = self.store_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        if let Ok(shares) = self.shares.lock() {
            if let Ok(serialized) = serde_json::to_string_pretty(&*shares) {
                let _ = std::fs::write(&self.store_path, serialized);
            }
        }
    }

    pub fn purge_expired(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);

        let mut changed = false;
        self.shares.lock().unwrap().retain(|_, entry| {
            let keep = entry
                .expires_at_epoch_ms
                .map(|expires_at| expires_at > now)
                .unwrap_or(true);
            if !keep {
                changed = true;
            }
            keep
        });

        if changed {
            self.persist();
        }
    }
}

#[tauri::command]
pub async fn cmd_create_share_link(
    file_id: i32,
    folder_id: Option<i64>,
    filename: String,
    expires_in_minutes: Option<u64>,
    state: State<'_, ShareStore>,
) -> Result<String, String> {
    state.purge_expired();
    let token: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    let expires_at_epoch_ms = expires_in_minutes
        .filter(|minutes| *minutes > 0)
        .map(|minutes| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis() + (minutes as u128 * 60_000))
                .unwrap_or(minutes as u128 * 60_000)
        });
    state.shares.lock().unwrap().insert(
        token.clone(),
        ShareEntry {
            file_id,
            folder_id,
            filename: filename.clone(),
            expires_at_epoch_ms,
        },
    );
    state.persist();
    Ok(format!(
        "http://localhost:14200/share/{}/{}",
        token, filename
    ))
}

#[tauri::command]
pub async fn cmd_revoke_share_link(
    token: String,
    state: State<'_, ShareStore>,
) -> Result<(), String> {
    state.purge_expired();
    state.shares.lock().unwrap().remove(&token);
    state.persist();
    Ok(())
}
