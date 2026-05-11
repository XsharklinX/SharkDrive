use tauri::State;
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Sha256, Digest};
use std::sync::Mutex;

pub struct EncryptionState {
    pub key: Mutex<Option<Vec<u8>>>,
}

impl EncryptionState {
    pub fn new() -> Self {
        Self { key: Mutex::new(None) }
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
    let ciphertext = cipher.encrypt(&nonce, plaintext.as_ref())
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
    let plaintext = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong password?".to_string())?;
    std::fs::write(output_path, plaintext).map_err(|e| e.to_string())?;
    Ok(())
}
