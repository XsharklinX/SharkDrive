use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AccountMeta {
    pub id: String,
    pub alias: String,
    pub phone: String,
    pub api_id: i32,
    pub accent_color: Option<String>,
    pub added_at_ms: i64,
    pub avatar_b64: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct AccountsData {
    accounts: Vec<AccountMeta>,
    active_id: Option<String>,
}

pub struct AccountManager {
    pub accounts_dir: PathBuf,
    meta_path: PathBuf,
    inner: RwLock<AccountsData>,
}

impl AccountManager {
    pub fn new(app_data_dir: &Path) -> Self {
        let accounts_dir = app_data_dir.join("accounts");
        let meta_path = app_data_dir.join("accounts.json");
        let _ = std::fs::create_dir_all(&accounts_dir);

        let inner = std::fs::read_to_string(&meta_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<AccountsData>(&raw).ok())
            .unwrap_or_default();

        Self { accounts_dir, meta_path, inner: RwLock::new(inner) }
    }

    pub fn active_data_dir(&self) -> Option<PathBuf> {
        self.inner
            .read()
            .ok()?
            .active_id
            .as_ref()
            .map(|id| self.accounts_dir.join(id))
    }

    pub fn active_session_path(&self) -> Option<PathBuf> {
        self.active_data_dir().map(|d| d.join("telegram.session"))
    }

    pub fn active_protected_session_path(&self) -> Option<PathBuf> {
        self.active_data_dir().map(|d| d.join("telegram.session.sdenc"))
    }

    pub fn session_path_for(&self, id: &str) -> PathBuf {
        self.accounts_dir.join(id).join("telegram.session")
    }

    pub fn data_dir_for(&self, id: &str) -> PathBuf {
        self.accounts_dir.join(id)
    }

    pub fn index_path(&self) -> PathBuf {
        self.active_data_dir()
            .map(|d| d.join("persistent_index.json"))
            .unwrap_or_else(|| self.accounts_dir.join("_fallback").join("persistent_index.json"))
    }

    pub fn sync_log_path(&self) -> PathBuf {
        self.active_data_dir()
            .map(|d| d.join("sync_log.json"))
            .unwrap_or_else(|| self.accounts_dir.join("_fallback").join("sync_log.json"))
    }

    pub fn list_accounts(&self) -> Vec<AccountMeta> {
        self.inner.read().map(|g| g.accounts.clone()).unwrap_or_default()
    }

    pub fn get_active_id(&self) -> Option<String> {
        self.inner.read().ok()?.active_id.clone()
    }

    pub fn get_account(&self, id: &str) -> Option<AccountMeta> {
        self.inner
            .read()
            .ok()?
            .accounts
            .iter()
            .find(|a| a.id == id)
            .cloned()
    }

    pub fn set_active(&self, id: &str) {
        if let Ok(mut inner) = self.inner.write() {
            inner.active_id = Some(id.to_string());
            self.persist(&inner);
        }
    }

    pub fn add_or_update(&self, meta: AccountMeta) {
        if let Ok(mut inner) = self.inner.write() {
            let _ = std::fs::create_dir_all(self.accounts_dir.join(&meta.id));
            if let Some(existing) = inner.accounts.iter_mut().find(|a| a.id == meta.id) {
                *existing = meta;
            } else {
                inner.accounts.push(meta);
            }
            self.persist(&inner);
        }
    }

    pub fn update_meta<F: FnOnce(&mut AccountMeta)>(&self, id: &str, f: F) {
        if let Ok(mut inner) = self.inner.write() {
            if let Some(account) = inner.accounts.iter_mut().find(|a| a.id == id) {
                f(account);
                self.persist(&inner);
            }
        }
    }

    pub fn remove(&self, id: &str) {
        if let Ok(mut inner) = self.inner.write() {
            inner.accounts.retain(|a| a.id != id);
            if inner.active_id.as_deref() == Some(id) {
                inner.active_id = inner.accounts.first().map(|a| a.id.clone());
            }
            self.persist(&inner);
        }
        let _ = std::fs::remove_dir_all(self.accounts_dir.join(id));
    }

    fn persist(&self, data: &AccountsData) {
        if let Ok(raw) = serde_json::to_string(data) {
            let _ = std::fs::write(&self.meta_path, raw);
        }
    }
}

pub fn make_account_id() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    use rand::Rng;
    let suffix: u32 = rand::thread_rng().gen::<u32>() % 9999;
    format!("acc_{ms}_{suffix:04}")
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
