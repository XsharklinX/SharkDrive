use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::State;

pub struct EncryptionState {
    pub key: Mutex<Option<Vec<u8>>>,
}

impl EncryptionState {
    pub fn new() -> Self {
        Self {
            key: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn cmd_set_encryption_key(
    password: String,
    state: State<'_, EncryptionState>,
) -> Result<(), String> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    let key = hasher.finalize().to_vec();
    *state.key.lock().unwrap() = Some(key);
    Ok(())
}

#[tauri::command]
pub async fn cmd_clear_encryption_key(state: State<'_, EncryptionState>) -> Result<(), String> {
    *state.key.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_encryption_status(state: State<'_, EncryptionState>) -> Result<bool, String> {
    Ok(state.key.lock().unwrap().is_some())
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
    use super::{decrypt_file, derive_folder_key, encrypt_file};
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
        let master = Sha256::digest(b"master-password").to_vec();
        assert_ne!(derive_folder_key(&master, 1), derive_folder_key(&master, 2));
    }

    #[test]
    fn encryption_round_trip_restores_original_bytes() {
        let input = temp_file("input.txt");
        let encrypted = temp_file("encrypted.bin");
        let output = temp_file("output.txt");
        let key = Sha256::digest(b"vault-password").to_vec();
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
        let key = Sha256::digest(b"right-password").to_vec();
        let wrong = Sha256::digest(b"wrong-password").to_vec();

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
