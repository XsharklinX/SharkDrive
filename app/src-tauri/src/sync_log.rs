use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSession {
    pub id: String,
    pub folder_id: Option<i64>,
    pub folder_name: String,
    pub started_at_ms: i64,
    pub completed_at_ms: i64,
    pub files_total: u32,
    pub files_added: Vec<String>,
    pub files_removed: Vec<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct SyncLogData {
    sessions: Vec<SyncSession>,
}

pub struct SyncLog {
    path: std::sync::Mutex<PathBuf>,
    inner: RwLock<SyncLogData>,
}

const MAX_SESSIONS: usize = 200;

impl SyncLog {
    pub fn new(path: PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<SyncLogData>(&raw).ok())
            .unwrap_or_default();
        Self {
            path: std::sync::Mutex::new(path),
            inner: RwLock::new(inner),
        }
    }

    pub fn swap_to_account(&self, new_path: PathBuf) {
        let new_data = std::fs::read_to_string(&new_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<SyncLogData>(&raw).ok())
            .unwrap_or_default();
        if let Ok(mut path) = self.path.lock() {
            *path = new_path;
        }
        if let Ok(mut inner) = self.inner.write() {
            *inner = new_data;
        }
    }

    pub fn record_session(&self, session: SyncSession) {
        if let Ok(mut inner) = self.inner.write() {
            inner.sessions.push(session);
            if inner.sessions.len() > MAX_SESSIONS {
                let excess = inner.sessions.len() - MAX_SESSIONS;
                inner.sessions.drain(0..excess);
            }
            self.persist(&inner);
        }
    }

    pub fn get_sessions(&self, limit: usize) -> Vec<SyncSession> {
        self.inner
            .read()
            .map(|g| {
                let mut sessions: Vec<_> = g.sessions.clone();
                sessions.sort_by(|a, b| b.started_at_ms.cmp(&a.started_at_ms));
                sessions.truncate(limit);
                sessions
            })
            .unwrap_or_default()
    }

    pub fn get_sessions_for_folder(&self, folder_id: Option<i64>, limit: usize) -> Vec<SyncSession> {
        self.inner
            .read()
            .map(|g| {
                let mut sessions: Vec<_> = g
                    .sessions
                    .iter()
                    .filter(|s| s.folder_id == folder_id)
                    .cloned()
                    .collect();
                sessions.sort_by(|a, b| b.started_at_ms.cmp(&a.started_at_ms));
                sessions.truncate(limit);
                sessions
            })
            .unwrap_or_default()
    }

    fn persist(&self, data: &SyncLogData) {
        let path = match self.path.lock() {
            Ok(p) => p.clone(),
            Err(_) => return,
        };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string(data) {
            let _ = std::fs::write(&path, raw);
        }
    }
}
