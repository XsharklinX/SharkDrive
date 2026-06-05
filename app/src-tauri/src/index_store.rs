use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

use crate::models::{FileMetadata, FolderMetadata};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct IndexedFolderFiles {
    items: Vec<FileMetadata>,
    synced_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PersistentIndexData {
    folders: Vec<FolderMetadata>,
    folders_synced_at_ms: i64,
    files_by_folder: HashMap<String, IndexedFolderFiles>,
    #[serde(default)]
    folder_size_cache: HashMap<String, (i64, u64)>,
}

pub struct PersistentIndexState {
    path: std::sync::Mutex<PathBuf>,
    inner: RwLock<PersistentIndexData>,
}

impl PersistentIndexState {
    pub fn new(path: PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<PersistentIndexData>(&raw).ok())
            .unwrap_or_default();

        Self {
            path: std::sync::Mutex::new(path),
            inner: RwLock::new(inner),
        }
    }

    /// Swap to a different account's index file, loading its data.
    pub fn swap_to_account(&self, new_path: PathBuf) {
        let new_data = std::fs::read_to_string(&new_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<PersistentIndexData>(&raw).ok())
            .unwrap_or_default();
        if let Ok(mut path) = self.path.lock() {
            *path = new_path;
        }
        if let Ok(mut inner) = self.inner.write() {
            *inner = new_data;
        }
    }

    pub fn folder_key(folder_id: Option<i64>) -> String {
        folder_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "home".to_string())
    }

    pub fn get_folders(&self) -> Vec<FolderMetadata> {
        self.inner.read().map(|g| g.folders.clone()).unwrap_or_default()
    }

    pub fn set_folders(&self, folders: Vec<FolderMetadata>) {
        if let Ok(mut inner) = self.inner.write() {
            inner.folders = folders;
            inner.folders_synced_at_ms = now_ms();
            self.persist_locked(&inner);
        }
    }

    pub fn upsert_folder(&self, folder: FolderMetadata) {
        let mut folders = self.get_folders();
        if let Some(existing) = folders.iter_mut().find(|existing| existing.id == folder.id) {
            *existing = folder;
        } else {
            folders.push(folder);
        }
        self.set_folders(folders);
    }

    pub fn remove_folder(&self, folder_id: i64) {
        if let Ok(mut inner) = self.inner.write() {
            inner.folders.retain(|folder| folder.id != folder_id);
            inner.files_by_folder.remove(&folder_id.to_string());
            inner.folder_size_cache.remove(&folder_id.to_string());
            self.persist_locked(&inner);
        }
    }

    pub fn folder_name_map(&self) -> HashMap<Option<i64>, String> {
        let mut map = HashMap::new();
        map.insert(None, "Saved Messages".to_string());
        if let Ok(inner) = self.inner.read() {
            for folder in &inner.folders {
                map.insert(Some(folder.id), folder.name.clone());
            }
        }
        map
    }

    pub fn get_files(&self, folder_id: Option<i64>) -> Vec<FileMetadata> {
        let key = Self::folder_key(folder_id);
        self.inner
            .read()
            .map(|g| g.files_by_folder.get(&key).map(|e| e.items.clone()).unwrap_or_default())
            .unwrap_or_default()
    }

    pub fn get_all_files(&self) -> Vec<FileMetadata> {
        self.inner
            .read()
            .map(|g| g.files_by_folder.values().flat_map(|e| e.items.clone()).collect())
            .unwrap_or_default()
    }

    /// Remove a single file from the index by message_id (called after deletion from Telegram).
    pub fn remove_file(&self, folder_id: Option<i64>, file_id: i64) {
        let key = Self::folder_key(folder_id);
        if let Ok(mut inner) = self.inner.write() {
            if let Some(entry) = inner.files_by_folder.get_mut(&key) {
                let before = entry.items.len();
                entry.items.retain(|f| f.id != file_id);
                if entry.items.len() != before {
                    self.persist_locked(&inner);
                }
            }
        }
    }

    /// Insert or update a single file in the index (used by paginated fetch).
    pub fn upsert_file(&self, file: FileMetadata) {
        let key = Self::folder_key(file.folder_id);
        if let Ok(mut inner) = self.inner.write() {
            let entry = inner.files_by_folder.entry(key).or_insert_with(|| IndexedFolderFiles {
                items: Vec::new(),
                synced_at_ms: now_ms(),
            });
            if let Some(existing) = entry.items.iter_mut().find(|f| f.id == file.id) {
                *existing = file;
            } else {
                entry.items.push(file);
            }
            self.persist_locked(&inner);
        }
    }

    pub fn set_files(&self, folder_id: Option<i64>, files: Vec<FileMetadata>) {
        let key = Self::folder_key(folder_id);
        if let Ok(mut inner) = self.inner.write() {
            inner.files_by_folder.insert(
                key,
                IndexedFolderFiles {
                    items: files,
                    synced_at_ms: now_ms(),
                },
            );
            self.persist_locked(&inner);
        }
    }

    pub fn get_folder_size_cache(&self, folder_id: i64) -> Option<(i64, u64)> {
        self.inner
            .read()
            .ok()?
            .folder_size_cache
            .get(&folder_id.to_string())
            .copied()
    }

    pub fn set_folder_size_cache(&self, folder_id: i64, count: i64, bytes: u64) {
        if let Ok(mut inner) = self.inner.write() {
            inner.folder_size_cache.insert(folder_id.to_string(), (count, bytes));
            self.persist_locked(&inner);
        }
    }

    fn persist_locked(&self, inner: &PersistentIndexData) {
        let path = match self.path.lock() {
            Ok(p) => p.clone(),
            Err(_) => return,
        };
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string(inner) {
            let _ = std::fs::write(&path, raw);
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_store() -> PersistentIndexState {
        PersistentIndexState::new(PathBuf::from("/tmp/test_index_store_unused.json"))
    }

    #[test]
    fn cache_miss_returns_none() {
        let store = make_store();
        assert!(store.get_folder_size_cache(999).is_none());
    }

    #[test]
    fn cache_round_trip() {
        let store = make_store();
        store.set_folder_size_cache(42, 17, 1024 * 1024);
        let result = store.get_folder_size_cache(42);
        assert_eq!(result, Some((17, 1024 * 1024)));
    }

    #[test]
    fn cache_overwrites_previous_value() {
        let store = make_store();
        store.set_folder_size_cache(10, 5, 500);
        store.set_folder_size_cache(10, 8, 800);
        assert_eq!(store.get_folder_size_cache(10), Some((8, 800)));
    }

    #[test]
    fn cache_independent_per_folder() {
        let store = make_store();
        store.set_folder_size_cache(1, 3, 300);
        store.set_folder_size_cache(2, 7, 700);
        assert_eq!(store.get_folder_size_cache(1), Some((3, 300)));
        assert_eq!(store.get_folder_size_cache(2), Some((7, 700)));
    }
}
