use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
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
    pub folders: Mutex<Vec<BackupFolder>>,
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    pub path_map: Mutex<HashMap<String, Option<i64>>>,
    pub recent_events: Arc<Mutex<HashMap<String, std::time::Instant>>>,
}

impl BackupState {
    pub fn new() -> Self {
        Self {
            folders: Mutex::new(Vec::new()),
            watcher: Mutex::new(None),
            path_map: Mutex::new(HashMap::new()),
            recent_events: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, Serialize)]
struct BackupFileEvent {
    path: String,
    remote_folder_id: Option<i64>,
}

pub fn start_watching(backup: &BackupState, app_handle: tauri::AppHandle) {
    let path_map_clone: HashMap<String, Option<i64>> = backup.path_map.lock().unwrap().clone();
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

    *backup.watcher.lock().unwrap() = Some(watcher);

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
                                let mut recent = recent_events.lock().unwrap();
                                let now = std::time::Instant::now();
                                if let Some(last_seen) = recent.get(&path_str) {
                                    if now.duration_since(*last_seen).as_secs() < 5 {
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
                                .find(|(base, _)| path_str.starts_with(base.as_str()))
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
        let mut folders = state.folders.lock().unwrap();
        folders.retain(|f| f.local_path != local_path);
        folders.push(BackupFolder {
            local_path: local_path.clone(),
            remote_folder_id,
            enabled: true,
        });
        let mut map = state.path_map.lock().unwrap();
        map.insert(local_path, remote_folder_id);
    }
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
        let mut folders = state.folders.lock().unwrap();
        if let Some(folder) = folders
            .iter_mut()
            .find(|folder| folder.local_path == local_path)
        {
            folder.remote_folder_id = remote_folder_id;
            folder.enabled = true;
        }
        let mut map = state.path_map.lock().unwrap();
        map.insert(local_path, remote_folder_id);
    }
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
        let mut folders = state.folders.lock().unwrap();
        folders.retain(|f| f.local_path != local_path);
        let mut map = state.path_map.lock().unwrap();
        map.remove(&local_path);
    }
    start_watching(&state, app_handle);
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_backup_folders(
    state: State<'_, BackupState>,
) -> Result<Vec<BackupFolder>, String> {
    Ok(state.folders.lock().unwrap().clone())
}
