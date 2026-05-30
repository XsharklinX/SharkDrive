use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{Emitter, State};

#[derive(Clone, Serialize, Deserialize)]
pub struct BackupFolder {
    pub local_path: String,
    pub remote_folder_id: Option<i64>,
    pub enabled: bool,
}

pub struct BackupState {
    path: PathBuf,
    hashes_path: PathBuf,
    pub folders: Mutex<Vec<BackupFolder>>,
    uploaded_hashes: Mutex<HashMap<String, String>>,
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    pub path_map: Mutex<HashMap<String, Option<i64>>>,
    pub recent_events: Arc<Mutex<HashMap<String, std::time::Instant>>>,
}

impl BackupState {
    pub fn new(path: PathBuf) -> Self {
        let hashes_path = path.with_file_name("backup_hashes.json");
        let folders = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Vec<BackupFolder>>(&raw).ok())
            .unwrap_or_default();
        let path_map = folders
            .iter()
            .filter(|folder| folder.enabled)
            .map(|folder| (folder.local_path.clone(), folder.remote_folder_id))
            .collect();
        let uploaded_hashes = std::fs::read_to_string(&hashes_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<HashMap<String, String>>(&raw).ok())
            .unwrap_or_default();

        Self {
            path,
            hashes_path,
            folders: Mutex::new(folders),
            uploaded_hashes: Mutex::new(uploaded_hashes),
            watcher: Mutex::new(None),
            path_map: Mutex::new(path_map),
            recent_events: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn last_uploaded_hash(&self, path: &str) -> Option<String> {
        self.uploaded_hashes
            .lock()
            .ok()?
            .get(&path.to_lowercase())
            .cloned()
    }

    pub fn record_uploaded_hash(&self, path: &str, sha256: &str) -> Result<(), String> {
        let mut hashes = self.uploaded_hashes.lock().map_err(|e| e.to_string())?;
        hashes.insert(path.to_lowercase(), sha256.to_lowercase());
        if let Some(parent) = self.hashes_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let raw = serde_json::to_string_pretty(&*hashes).map_err(|e| e.to_string())?;
        std::fs::write(&self.hashes_path, raw).map_err(|e| e.to_string())
    }
}

fn persist_folders(state: &BackupState) -> Result<(), String> {
    let folders = state.folders.lock().map_err(|e| e.to_string())?;
    if let Some(parent) = state.path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&*folders).map_err(|e| e.to_string())?;
    std::fs::write(&state.path, raw).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
struct BackupFileEvent {
    path: String,
    remote_folder_id: Option<i64>,
}

pub fn start_watching(backup: &BackupState, app_handle: tauri::AppHandle) {
    let path_map_clone: HashMap<String, Option<i64>> = match backup.path_map.lock() {
        Ok(m) => m.clone(),
        Err(_) => return,
    };
    let recent_events = backup.recent_events.clone();
    let app = app_handle.clone();

    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<Event>>();

    let mut watcher = match notify::recommended_watcher(tx) {
        Ok(w) => w,
        Err(e) => {
            log::error!("Failed to create file watcher: {}", e);
            return;
        }
    };

    for (path, _) in &path_map_clone {
        if let Err(e) = watcher.watch(Path::new(path), RecursiveMode::Recursive) {
            log::warn!("Could not watch path {}: {}", path, e);
        }
    }

    if let Ok(mut w) = backup.watcher.lock() {
        *w = Some(watcher);
    }

    // Spawn blocking thread to relay events
    std::thread::spawn(move || {
        for result in rx {
            if let Ok(event) = result {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {
                        for event_path in &event.paths {
                            if !event_path.is_file() {
                                continue;
                            }
                            let path_str = event_path.to_string_lossy().to_string();
                            let file_name = event_path
                                .file_name()
                                .and_then(|name| name.to_str())
                                .unwrap_or_default()
                                .to_lowercase();
                            if file_name.starts_with("~$")
                                || file_name.ends_with(".tmp")
                                || file_name.ends_with(".part")
                                || file_name.ends_with(".crdownload")
                            {
                                continue;
                            }

                            {
                                let Ok(mut recent) = recent_events.lock() else {
                                    continue;
                                };
                                let now = std::time::Instant::now();
                                if let Some(last_seen) = recent.get(&path_str) {
                                    if now.duration_since(*last_seen).as_secs() < 10 {
                                        continue;
                                    }
                                }
                                recent.insert(path_str.clone(), now);
                                recent.retain(|_, instant| {
                                    now.duration_since(*instant).as_secs() < 120
                                });
                            }

                            // Find which backup folder this belongs to
                            let remote_folder_id = path_map_clone
                                .iter()
                                .find(|(base, _)| {
                                    Path::new(path_str.as_str())
                                        .starts_with(Path::new(base.as_str()))
                                })
                                .map(|(_, fid)| *fid)
                                .unwrap_or(None);
                            let _ = app.emit(
                                "backup-file-detected",
                                BackupFileEvent {
                                    path: path_str,
                                    remote_folder_id,
                                },
                            );
                        }
                    }
                    _ => {}
                }
            }
        }
    });
}

#[tauri::command]
pub async fn cmd_add_backup_folder(
    local_path: String,
    remote_folder_id: Option<i64>,
    state: State<'_, BackupState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    {
        let mut folders = state.folders.lock().map_err(|e| e.to_string())?;
        folders.retain(|f| f.local_path != local_path);
        folders.push(BackupFolder {
            local_path: local_path.clone(),
            remote_folder_id,
            enabled: true,
        });
        let mut map = state.path_map.lock().map_err(|e| e.to_string())?;
        map.insert(local_path, remote_folder_id);
    }
    persist_folders(&state)?;
    // Restart watcher with updated folders
    start_watching(&state, app_handle);
    Ok(())
}

#[tauri::command]
pub async fn cmd_update_backup_folder(
    local_path: String,
    remote_folder_id: Option<i64>,
    state: State<'_, BackupState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    {
        let mut folders = state.folders.lock().map_err(|e| e.to_string())?;
        if let Some(folder) = folders
            .iter_mut()
            .find(|folder| folder.local_path == local_path)
        {
            folder.remote_folder_id = remote_folder_id;
            folder.enabled = true;
        }
        let mut map = state.path_map.lock().map_err(|e| e.to_string())?;
        map.insert(local_path, remote_folder_id);
    }
    persist_folders(&state)?;
    start_watching(&state, app_handle);
    Ok(())
}

#[tauri::command]
pub async fn cmd_remove_backup_folder(
    local_path: String,
    state: State<'_, BackupState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    {
        let mut folders = state.folders.lock().map_err(|e| e.to_string())?;
        folders.retain(|f| f.local_path != local_path);
        let mut map = state.path_map.lock().map_err(|e| e.to_string())?;
        map.remove(&local_path);
    }
    persist_folders(&state)?;
    start_watching(&state, app_handle);
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_backup_folders(
    state: State<'_, BackupState>,
) -> Result<Vec<BackupFolder>, String> {
    Ok(state.folders.lock().map_err(|e| e.to_string())?.clone())
}

#[cfg(test)]
mod tests {
    use super::BackupState;

    #[test]
    fn persists_last_uploaded_hash() {
        let root =
            std::env::temp_dir().join(format!("sharkdrive-backup-test-{}", std::process::id()));
        let folders_path = root.join("backup_folders.json");
        let state = BackupState::new(folders_path.clone());
        state
            .record_uploaded_hash("C:\\Books\\Example.epub", "ABC123")
            .expect("hash should persist");

        let reloaded = BackupState::new(folders_path);
        assert_eq!(
            reloaded.last_uploaded_hash("c:\\books\\example.epub"),
            Some("abc123".to_string())
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
