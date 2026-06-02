use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::RwLock;

#[derive(Serialize, Deserialize, Default)]
struct WebAuthData {
    pin_sha256: Option<String>,
}

pub struct WebAuthState {
    inner: RwLock<WebAuthData>,
    path: PathBuf,
    tokens: RwLock<HashSet<String>>,
}

impl WebAuthState {
    pub fn new(path: PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<WebAuthData>(&raw).ok())
            .unwrap_or_default();
        Self {
            inner: RwLock::new(inner),
            path,
            tokens: RwLock::new(HashSet::new()),
        }
    }

    pub fn has_pin(&self) -> bool {
        self.inner
            .read()
            .ok()
            .and_then(|g| g.pin_sha256.as_ref().map(|_| true))
            .unwrap_or(false)
    }

    fn hash_pin(pin: &str) -> String {
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(b"SharkDriveWebPIN:");
        h.update(pin.as_bytes());
        format!("{:x}", h.finalize())
    }

    pub fn set_pin(&self, pin: &str) -> Result<(), String> {
        if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
            return Err("PIN must be exactly 6 digits".to_string());
        }
        let hash = Self::hash_pin(pin);
        if let Ok(mut inner) = self.inner.write() {
            inner.pin_sha256 = Some(hash);
            self.persist(&inner);
        }
        Ok(())
    }

    pub fn clear_pin(&self) {
        if let Ok(mut inner) = self.inner.write() {
            inner.pin_sha256 = None;
            self.persist(&inner);
        }
        if let Ok(mut tokens) = self.tokens.write() {
            tokens.clear();
        }
    }

    pub fn verify_pin(&self, pin: &str) -> bool {
        let hash = Self::hash_pin(pin);
        self.inner
            .read()
            .ok()
            .and_then(|g| g.pin_sha256.as_ref().map(|stored| stored == &hash))
            .unwrap_or(false)
    }

    pub fn generate_token(&self) -> String {
        use rand::Rng;
        let token: String = (0..32)
            .map(|_| format!("{:02x}", rand::thread_rng().gen::<u8>()))
            .collect();
        if let Ok(mut tokens) = self.tokens.write() {
            if tokens.len() > 50 {
                tokens.clear();
            }
            tokens.insert(token.clone());
        }
        token
    }

    /// Returns true if no PIN is set (open access) or if the token is valid.
    pub fn is_authorized(&self, token: &str) -> bool {
        if !self.has_pin() {
            return true;
        }
        if token.is_empty() {
            return false;
        }
        self.tokens
            .read()
            .ok()
            .map(|t| t.contains(token))
            .unwrap_or(false)
    }

    fn persist(&self, data: &WebAuthData) {
        if let Ok(raw) = serde_json::to_string(data) {
            let _ = std::fs::write(&self.path, raw);
        }
    }
}
