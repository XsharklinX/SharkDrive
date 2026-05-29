use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const PBKDF2_ITERATIONS: u32 = 100_000;
const PBKDF2_SALT: &[u8] = b"SharkDrive encryption v2";

pub struct EncryptionState {
    key_v2: Mutex<Option<Vec<u8>>>,
    legacy_key: Mutex<Option<Vec<u8>>>,
    last_activity_epoch_ms: Mutex<Option<u128>>,
    auto_lock_minutes: Mutex<Option<u64>>,
}

impl EncryptionState {
    pub fn new() -> Self {
        Self {
            key_v2: Mutex::new(None),
            legacy_key: Mutex::new(None),
            last_activity_epoch_ms: Mutex::new(None),
            auto_lock_minutes: Mutex::new(None),
        }
    }

    fn now_ms() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    }

    pub fn touch(&self) {
        if let Ok(mut last_activity) = self.last_activity_epoch_ms.lock() {
            *last_activity = Some(Self::now_ms());
        }
    }

    pub fn clear(&self) -> Result<(), String> {
        *self.key_v2.lock().map_err(|e| e.to_string())? = None;
        *self.legacy_key.lock().map_err(|e| e.to_string())? = None;
        *self.last_activity_epoch_ms.lock().map_err(|e| e.to_string())? = None;
        Ok(())
    }

    pub fn purge_if_idle(&self) -> Result<bool, String> {
        let minutes = *self.auto_lock_minutes.lock().map_err(|e| e.to_string())?;
        let Some(minutes) = minutes.filter(|value| *value > 0) else {
            return Ok(false);
        };
        let last_activity = *self.last_activity_epoch_ms.lock().map_err(|e| e.to_string())?;
        let Some(last_activity) = last_activity else {
            return Ok(false);
        };
        let idle_ms = Self::now_ms().saturating_sub(last_activity);
        if idle_ms >= minutes as u128 * 60_000 {
            self.clear()?;
            return Ok(true);
        }
        Ok(false)
    }

    pub fn is_unlocked(&self) -> Result<bool, String> {
        self.purge_if_idle()?;
        Ok(self.key_v2.lock().map_err(|e| e.to_string())?.is_some())
    }

    pub fn active_key(&self, version: u8) -> Result<Option<Vec<u8>>, String> {
        self.purge_if_idle()?;
        self.touch();
        if version >= 2 {
            return Ok(self.key_v2.lock().map_err(|e| e.to_string())?.clone());
        }
        Ok(self
            .legacy_key
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .or_else(|| self.key_v2.lock().ok().and_then(|key| key.clone())))
    }
}

fn derive_master_key_v2(password: &str) -> Vec<u8> {
    let mut key = [0_u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), PBKDF2_SALT, PBKDF2_ITERATIONS, &mut key);
    key.to_vec()
}

fn derive_legacy_key(password: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.finalize().to_vec()
}

#[tauri::command]
pub async fn cmd_set_encryption_key(
    password: String,
    state: State<'_, EncryptionState>,
) -> Result<(), String> {
    *state.key_v2.lock().map_err(|e| e.to_string())? = Some(derive_master_key_v2(&password));
    *state.legacy_key.lock().map_err(|e| e.to_string())? = Some(derive_legacy_key(&password));
    state.touch();
    Ok(())
}

#[tauri::command]
pub async fn cmd_clear_encryption_key(state: State<'_, EncryptionState>) -> Result<(), String> {
    state.clear()
}

#[tauri::command]
pub async fn cmd_get_encryption_status(state: State<'_, EncryptionState>) -> Result<bool, String> {
    state.is_unlocked()
}

#[tauri::command]
pub async fn cmd_touch_encryption_activity(state: State<'_, EncryptionState>) -> Result<bool, String> {
    if state.is_unlocked()? {
        state.touch();
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub async fn cmd_set_encryption_auto_lock(
    minutes: Option<u64>,
    state: State<'_, EncryptionState>,
) -> Result<(), String> {
    *state.auto_lock_minutes.lock().map_err(|e| e.to_string())? = minutes;
    state.touch();
    Ok(())
}

/// Derives a folder-specific key so each folder uses a unique encryption key
/// derived from the master key + folder_id, preventing cross-folder decryption.
pub fn derive_folder_key(master_key: &[u8], folder_id: i64) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(master_key);
    hasher.update(folder_id.to_le_bytes());
    hasher.finalize().to_vec()
}

pub fn encrypt_file(key_bytes: &[u8], input_path: &str, output_path: &str) -> Result<(), String> {
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let plaintext = std::fs::read(input_path).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_ref())
        .map_err(|e| format!("Encryption error: {}", e))?;
    let mut out = nonce.to_vec();
    out.extend_from_slice(&ciphertext);
    std::fs::write(output_path, out).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn decrypt_file(key_bytes: &[u8], input_path: &str, output_path: &str) -> Result<(), String> {
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let data = std::fs::read(input_path).map_err(|e| e.to_string())?;
    if data.len() < 12 {
        return Err("File too short to be encrypted by SharkDrive".to_string());
    }
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong password?".to_string())?;
    std::fs::write(output_path, plaintext).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{decrypt_file, derive_folder_key, derive_master_key_v2, encrypt_file};
    use sha2::{Digest, Sha256};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_file(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("sharkdrive_test_{name}_{nonce}"))
    }

    #[test]
    fn folder_keys_change_per_folder() {
        let master = derive_master_key_v2("master-password");
        assert_ne!(derive_folder_key(&master, 1), derive_folder_key(&master, 2));
    }

    #[test]
    fn encryption_round_trip_restores_original_bytes() {
        let input = temp_file("input.txt");
        let encrypted = temp_file("encrypted.bin");
        let output = temp_file("output.txt");
        let key = derive_master_key_v2("vault-password");
        let payload = b"SharkDrive encryption test payload";

        std::fs::write(&input, payload).unwrap();
        encrypt_file(&key, &input.to_string_lossy(), &encrypted.to_string_lossy()).unwrap();
        decrypt_file(
            &key,
            &encrypted.to_string_lossy(),
            &output.to_string_lossy(),
        )
        .unwrap();

        assert_eq!(std::fs::read(&output).unwrap(), payload);

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_file(encrypted);
        let _ = std::fs::remove_file(output);
    }

    #[test]
    fn decrypt_with_wrong_key_fails() {
        let input = temp_file("wrong_key_input.txt");
        let encrypted = temp_file("wrong_key_encrypted.bin");
        let output = temp_file("wrong_key_output.txt");
        let key = derive_master_key_v2("right-password");
        let wrong = derive_master_key_v2("wrong-password");

        std::fs::write(&input, b"secret").unwrap();
        encrypt_file(&key, &input.to_string_lossy(), &encrypted.to_string_lossy()).unwrap();

        let error = decrypt_file(
            &wrong,
            &encrypted.to_string_lossy(),
            &output.to_string_lossy(),
        )
        .unwrap_err();
        assert!(
            error.to_lowercase().contains("wrong password")
                || error.to_lowercase().contains("decryption failed")
        );

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_file(encrypted);
        let _ = std::fs::remove_file(output);
    }
}
