use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng, Payload},
    Aes256Gcm, Key, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const PBKDF2_ITERATIONS: u32 = 100_000;
const PBKDF2_SALT: &[u8] = b"SharkDrive encryption v2";
const CHUNKED_MAGIC: &[u8; 8] = b"SDENC3\0\0";
const CHUNK_SIZE: usize = 1024 * 1024;
const FINAL_CHUNK_MARKER: u32 = u32::MAX;

pub struct EncryptionState {
    key_v2: Mutex<Option<Vec<u8>>>,
    legacy_key: Mutex<Option<Vec<u8>>>,
    password_verifier: Mutex<Option<String>>,
    last_activity_epoch_ms: Mutex<Option<u128>>,
    auto_lock_minutes: Mutex<Option<u64>>,
    /// Keys imported from other users via cmd_import_folder_key
    guest_folder_keys: Mutex<std::collections::HashMap<Option<i64>, Vec<u8>>>,
}

impl EncryptionState {
    pub fn new() -> Self {
        Self {
            key_v2: Mutex::new(None),
            legacy_key: Mutex::new(None),
            password_verifier: Mutex::new(None),
            last_activity_epoch_ms: Mutex::new(None),
            auto_lock_minutes: Mutex::new(None),
            guest_folder_keys: Mutex::new(std::collections::HashMap::new()),
        }
    }

    /// Store an imported folder key for a specific folder (from another user).
    pub fn add_guest_folder_key(&self, folder_id: Option<i64>, key: Vec<u8>) -> Result<(), String> {
        self.guest_folder_keys.lock().map_err(|e| e.to_string())?.insert(folder_id, key);
        Ok(())
    }

    /// Get the effective folder key: guest key if available, otherwise derived from master.
    pub fn get_folder_key(&self, folder_id: Option<i64>) -> Option<Vec<u8>> {
        // Check guest keys first (for shared access)
        if let Ok(guests) = self.guest_folder_keys.lock() {
            if let Some(key) = guests.get(&folder_id) {
                return Some(key.clone());
            }
        }
        // Fall back to master-derived key
        let master = self.key_v2.lock().ok()?.clone()?;
        match folder_id {
            Some(id) => Some(crate::commands::encryption::derive_folder_key(&master, id)),
            None => Some(master),
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
        *self
            .last_activity_epoch_ms
            .lock()
            .map_err(|e| e.to_string())? = None;
        Ok(())
    }

    pub fn purge_if_idle(&self) -> Result<bool, String> {
        let minutes = *self.auto_lock_minutes.lock().map_err(|e| e.to_string())?;
        let Some(minutes) = minutes.filter(|value| *value > 0) else {
            return Ok(false);
        };
        let last_activity = *self
            .last_activity_epoch_ms
            .lock()
            .map_err(|e| e.to_string())?;
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

pub(crate) fn derive_master_key_v2(password: &str) -> Vec<u8> {
    let mut key = [0_u8; 32];
    pbkdf2_hmac::<Sha256>(
        password.as_bytes(),
        PBKDF2_SALT,
        PBKDF2_ITERATIONS,
        &mut key,
    );
    key.to_vec()
}

pub(crate) fn derive_legacy_key(password: &str) -> Vec<u8> {
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
    *state.password_verifier.lock().map_err(|e| e.to_string())? = Some(
        bcrypt::hash(&password, bcrypt::DEFAULT_COST)
            .map_err(|error| format!("Cannot prepare vault verifier: {error}"))?,
    );
    state.touch();
    Ok(())
}

#[tauri::command]
pub async fn cmd_unlock_encryption_key(
    password: String,
    state: State<'_, EncryptionState>,
) -> Result<(), String> {
    let verifier = state
        .password_verifier
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Vault verifier is not available. Load the key from Settings.".to_string())?;
    if !bcrypt::verify(&password, &verifier).map_err(|error| error.to_string())? {
        return Err("Incorrect encryption password.".to_string());
    }
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
pub async fn cmd_touch_encryption_activity(
    state: State<'_, EncryptionState>,
) -> Result<bool, String> {
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

#[cfg(test)]
fn encrypt_file_legacy(
    key_bytes: &[u8],
    input_path: &str,
    output_path: &str,
) -> Result<(), String> {
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

fn decrypt_file_legacy_path(
    key_bytes: &[u8],
    input_path: &str,
    output_path: &str,
) -> Result<(), String> {
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

pub fn encrypt_file(key_bytes: &[u8], input_path: &str, output_path: &str) -> Result<(), String> {
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let mut input = std::fs::File::open(input_path).map_err(|e| e.to_string())?;
    let temp_path = format!("{output_path}.encrypting");
    let mut output = std::fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    let result = (|| {
        output.write_all(CHUNKED_MAGIC).map_err(|e| e.to_string())?;
        let mut index = 0_u64;
        loop {
            let mut plaintext = vec![0_u8; CHUNK_SIZE];
            let read = input.read(&mut plaintext).map_err(|e| e.to_string())?;
            if read == 0 {
                break;
            }
            plaintext.truncate(read);
            let plaintext_len = read as u32;
            let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
            let aad = chunk_aad(index, plaintext_len, false);
            let ciphertext = cipher
                .encrypt(
                    &nonce,
                    Payload {
                        msg: &plaintext,
                        aad: &aad,
                    },
                )
                .map_err(|e| format!("Encryption error: {e}"))?;
            output
                .write_all(&plaintext_len.to_le_bytes())
                .map_err(|e| e.to_string())?;
            output.write_all(&nonce).map_err(|e| e.to_string())?;
            output.write_all(&ciphertext).map_err(|e| e.to_string())?;
            index = index.saturating_add(1);
        }

        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let aad = chunk_aad(index, FINAL_CHUNK_MARKER, true);
        let footer = cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: &[],
                    aad: &aad,
                },
            )
            .map_err(|e| format!("Encryption footer error: {e}"))?;
        output
            .write_all(&FINAL_CHUNK_MARKER.to_le_bytes())
            .map_err(|e| e.to_string())?;
        output.write_all(&nonce).map_err(|e| e.to_string())?;
        output.write_all(&footer).map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error);
    }
    replace_file(&temp_path, output_path)
}

pub fn decrypt_file(key_bytes: &[u8], input_path: &str, output_path: &str) -> Result<(), String> {
    let mut input = std::fs::File::open(input_path).map_err(|e| e.to_string())?;
    let mut magic = [0_u8; CHUNKED_MAGIC.len()];
    if input.read_exact(&mut magic).is_ok() && &magic == CHUNKED_MAGIC {
        return decrypt_chunked_file(key_bytes, input, output_path);
    }
    decrypt_file_legacy_path(key_bytes, input_path, output_path)
}

fn chunk_aad(index: u64, plaintext_len: u32, final_chunk: bool) -> Vec<u8> {
    let mut aad = Vec::with_capacity(CHUNKED_MAGIC.len() + 8 + 4 + 1);
    aad.extend_from_slice(CHUNKED_MAGIC);
    aad.extend_from_slice(&index.to_le_bytes());
    aad.extend_from_slice(&plaintext_len.to_le_bytes());
    aad.push(u8::from(final_chunk));
    aad
}

fn decrypt_chunked_file(
    key_bytes: &[u8],
    mut input: std::fs::File,
    output_path: &str,
) -> Result<(), String> {
    let key = Key::<Aes256Gcm>::from_slice(key_bytes);
    let cipher = Aes256Gcm::new(key);
    let temp_path = format!("{output_path}.decrypting");
    let mut output = std::fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut index = 0_u64;
        loop {
            let mut len_bytes = [0_u8; 4];
            input.read_exact(&mut len_bytes).map_err(|_| {
                "Encrypted file is truncated before its authenticated footer.".to_string()
            })?;
            let plaintext_len = u32::from_le_bytes(len_bytes);
            let mut nonce_bytes = [0_u8; 12];
            input
                .read_exact(&mut nonce_bytes)
                .map_err(|_| "Encrypted file is truncated inside a chunk nonce.".to_string())?;
            let nonce = Nonce::from_slice(&nonce_bytes);

            if plaintext_len == FINAL_CHUNK_MARKER {
                let mut footer = vec![0_u8; 16];
                input
                    .read_exact(&mut footer)
                    .map_err(|_| "Encrypted file is truncated inside its footer.".to_string())?;
                let aad = chunk_aad(index, plaintext_len, true);
                cipher
                    .decrypt(
                        nonce,
                        Payload {
                            msg: &footer,
                            aad: &aad,
                        },
                    )
                    .map_err(|_| "Encrypted footer authentication failed.".to_string())?;
                let mut trailing = [0_u8; 1];
                if input.read(&mut trailing).map_err(|e| e.to_string())? != 0 {
                    return Err("Encrypted file has unexpected trailing bytes.".to_string());
                }
                output.flush().map_err(|e| e.to_string())?;
                break;
            }
            if plaintext_len == 0 || plaintext_len as usize > CHUNK_SIZE {
                return Err("Encrypted file contains an invalid chunk size.".to_string());
            }

            let mut ciphertext = vec![0_u8; plaintext_len as usize + 16];
            input
                .read_exact(&mut ciphertext)
                .map_err(|_| "Encrypted file is truncated inside a chunk.".to_string())?;
            let aad = chunk_aad(index, plaintext_len, false);
            let plaintext = cipher
                .decrypt(
                    nonce,
                    Payload {
                        msg: &ciphertext,
                        aad: &aad,
                    },
                )
                .map_err(|_| {
                    "Chunk authentication failed - wrong password or corrupted file.".to_string()
                })?;
            output.write_all(&plaintext).map_err(|e| e.to_string())?;
            index = index.saturating_add(1);
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temp_path);
        return Err(error);
    }
    replace_file(&temp_path, output_path)
}

fn replace_file(temp_path: &str, output_path: &str) -> Result<(), String> {
    if std::path::Path::new(output_path).exists() {
        std::fs::remove_file(output_path).map_err(|e| e.to_string())?;
    }
    std::fs::rename(temp_path, output_path).map_err(|e| {
        let _ = std::fs::remove_file(temp_path);
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::{
        decrypt_file, derive_folder_key, derive_master_key_v2, encrypt_file, encrypt_file_legacy,
        CHUNK_SIZE,
    };
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

    #[test]
    fn chunked_encryption_round_trip_handles_multiple_chunks() {
        let input = temp_file("large_input.bin");
        let encrypted = temp_file("large_encrypted.bin");
        let output = temp_file("large_output.bin");
        let key = derive_master_key_v2("vault-password");
        let payload = vec![0x5a; CHUNK_SIZE * 2 + 137];

        std::fs::write(&input, &payload).unwrap();
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
    fn chunked_decryption_rejects_truncated_footer() {
        let input = temp_file("truncated_input.bin");
        let encrypted = temp_file("truncated_encrypted.bin");
        let output = temp_file("truncated_output.bin");
        let key = derive_master_key_v2("vault-password");

        std::fs::write(&input, b"authenticated payload").unwrap();
        encrypt_file(&key, &input.to_string_lossy(), &encrypted.to_string_lossy()).unwrap();
        let mut bytes = std::fs::read(&encrypted).unwrap();
        bytes.truncate(bytes.len() - 5);
        std::fs::write(&encrypted, bytes).unwrap();

        assert!(decrypt_file(
            &key,
            &encrypted.to_string_lossy(),
            &output.to_string_lossy(),
        )
        .is_err());
        assert!(!output.exists());

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_file(encrypted);
        let _ = std::fs::remove_file(output);
    }

    #[test]
    fn legacy_encryption_format_remains_readable() {
        let input = temp_file("legacy_input.bin");
        let encrypted = temp_file("legacy_encrypted.bin");
        let output = temp_file("legacy_output.bin");
        let key = derive_master_key_v2("vault-password");
        let payload = b"legacy SharkDrive payload";

        std::fs::write(&input, payload).unwrap();
        encrypt_file_legacy(&key, &input.to_string_lossy(), &encrypted.to_string_lossy()).unwrap();
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
}
