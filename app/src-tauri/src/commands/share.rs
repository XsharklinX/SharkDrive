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
    #[serde(default)]
    pub created_at_epoch_ms: u128,
    #[serde(default)]
    pub download_count: u64,
    #[serde(default)]
    pub max_downloads: Option<u32>,
    #[serde(default)]
    pub password_hash: Option<String>,
    #[serde(default, skip_serializing)]
    pub password: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct ShareLinkInfo {
    pub token: String,
    pub file_id: i32,
    pub folder_id: Option<i64>,
    pub filename: String,
    pub expires_at_epoch_ms: Option<u128>,
    pub created_at_epoch_ms: u128,
    pub download_count: u64,
    pub max_downloads: Option<u32>,
    pub is_password_protected: bool,
    pub url: String,
}

pub struct ShareStore {
    pub shares: Mutex<HashMap<String, ShareEntry>>,
    authorizations: Mutex<HashMap<String, ShareAuthorization>>,
    store_path: PathBuf,
}

struct ShareAuthorization {
    share_token: String,
    expires_at_epoch_ms: u128,
}

impl ShareStore {
    pub fn new(store_path: PathBuf) -> Self {
        let mut shares = std::fs::read_to_string(&store_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<HashMap<String, ShareEntry>>(&raw).ok())
            .unwrap_or_default();
        let mut migrated = false;
        for entry in shares.values_mut() {
            if entry.password_hash.is_none() {
                if let Some(password) = entry.password.take() {
                    if let Ok(password_hash) = bcrypt::hash(password, bcrypt::DEFAULT_COST) {
                        entry.password_hash = Some(password_hash);
                        migrated = true;
                    }
                }
            }
        }

        let store = Self {
            shares: Mutex::new(shares),
            authorizations: Mutex::new(HashMap::new()),
            store_path,
        };
        if migrated {
            store.persist();
        }
        store
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
        if let Ok(mut shares) = self.shares.lock() {
            shares.retain(|_, entry| {
                let keep = entry
                    .expires_at_epoch_ms
                    .map(|expires_at| expires_at > now)
                    .unwrap_or(true);
                if !keep {
                    changed = true;
                }
                keep
            });
        }

        if changed {
            self.persist();
        }
        if let Ok(mut authorizations) = self.authorizations.lock() {
            authorizations.retain(|_, authorization| authorization.expires_at_epoch_ms > now);
        }
    }

    pub fn increment_download_count(&self, token: &str) {
        if let Ok(mut shares) = self.shares.lock() {
            if let Some(entry) = shares.get_mut(token) {
                entry.download_count = entry.download_count.saturating_add(1);
            }
        }
        self.persist();
    }

    pub fn issue_authorization(&self, share_token: &str) -> String {
        let authorization_token: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(48)
            .map(char::from)
            .collect();
        let expires_at_epoch_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() + 10 * 60_000)
            .unwrap_or(10 * 60_000);
        if let Ok(mut authorizations) = self.authorizations.lock() {
            authorizations.insert(
                authorization_token.clone(),
                ShareAuthorization {
                    share_token: share_token.to_string(),
                    expires_at_epoch_ms,
                },
            );
        }
        authorization_token
    }

    pub fn is_authorized(&self, share_token: &str, authorization_token: &str) -> bool {
        self.purge_expired();
        self.authorizations
            .lock()
            .ok()
            .and_then(|authorizations| {
                authorizations
                    .get(authorization_token)
                    .map(|authorization| authorization.share_token == share_token)
            })
            .unwrap_or(false)
    }

    fn revoke_authorizations(&self, share_token: &str) {
        if let Ok(mut authorizations) = self.authorizations.lock() {
            authorizations.retain(|_, authorization| authorization.share_token != share_token);
        }
    }
}

#[tauri::command]
pub async fn cmd_create_share_link(
    file_id: i32,
    folder_id: Option<i64>,
    filename: String,
    expires_in_minutes: Option<u64>,
    max_downloads: Option<u32>,
    password: Option<String>,
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
    let created_at_epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let password_hash = password
        .and_then(|password| {
            let password = password.trim().to_string();
            (!password.is_empty()).then_some(password)
        })
        .map(|password| bcrypt::hash(password, bcrypt::DEFAULT_COST))
        .transpose()
        .map_err(|error| format!("Cannot protect share link: {error}"))?;
    let clean_max = max_downloads.filter(|&n| n > 0);
    state.shares.lock().map_err(|e| e.to_string())?.insert(
        token.clone(),
        ShareEntry {
            file_id,
            folder_id,
            filename: filename.clone(),
            expires_at_epoch_ms,
            created_at_epoch_ms,
            download_count: 0,
            max_downloads: clean_max,
            password_hash,
            password: None,
        },
    );
    state.persist();
    Ok(format!(
        "http://localhost:14200/share/{}/{}",
        token,
        urlencoding::encode(&filename)
    ))
}

#[tauri::command]
pub async fn cmd_revoke_share_link(
    token: String,
    state: State<'_, ShareStore>,
) -> Result<(), String> {
    state.purge_expired();
    state
        .shares
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&token);
    state.revoke_authorizations(&token);
    state.persist();
    Ok(())
}

#[tauri::command]
pub async fn cmd_revoke_share_links(
    tokens: Vec<String>,
    state: State<'_, ShareStore>,
) -> Result<u32, String> {
    let mut removed = 0_u32;
    {
        let mut shares = state.shares.lock().map_err(|e| e.to_string())?;
        for token in tokens {
            if shares.remove(&token).is_some() {
                removed = removed.saturating_add(1);
            }
            state.revoke_authorizations(&token);
        }
    }
    state.persist();
    Ok(removed)
}

#[tauri::command]
pub async fn cmd_list_share_links(
    state: State<'_, ShareStore>,
) -> Result<Vec<ShareLinkInfo>, String> {
    state.purge_expired();
    let shares = state.shares.lock().map_err(|e| e.to_string())?;
    let mut links: Vec<ShareLinkInfo> = shares
        .iter()
        .map(|(token, entry)| ShareLinkInfo {
            token: token.clone(),
            file_id: entry.file_id,
            folder_id: entry.folder_id,
            filename: entry.filename.clone(),
            expires_at_epoch_ms: entry.expires_at_epoch_ms,
            created_at_epoch_ms: entry.created_at_epoch_ms,
            download_count: entry.download_count,
            max_downloads: entry.max_downloads,
            is_password_protected: entry.password_hash.is_some() || entry.password.is_some(),
            url: format!(
                "http://localhost:14200/share/{}/{}",
                token,
                urlencoding::encode(&entry.filename)
            ),
        })
        .collect();
    links.sort_by(|a, b| b.created_at_epoch_ms.cmp(&a.created_at_epoch_ms));
    Ok(links)
}

#[cfg(test)]
mod tests {
    use super::ShareStore;

    #[test]
    fn temporary_authorization_is_scoped_to_one_share_token() {
        let store = ShareStore::new(std::env::temp_dir().join("sharkdrive_share_auth_test.json"));
        let authorization = store.issue_authorization("share-a");

        assert!(store.is_authorized("share-a", &authorization));
        assert!(!store.is_authorized("share-b", &authorization));
    }
}
