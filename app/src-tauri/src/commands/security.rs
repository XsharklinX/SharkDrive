/// v3.6 — Seguridad Avanzada
/// Contains: integrity verification, remote wipe, encrypted audit log, TOTP 2FA,
/// and encrypted folder key export/import.
use std::io::{Read, Write};
use std::sync::Mutex;

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager, State};

use crate::commands::encryption::{derive_folder_key, EncryptionState};
use crate::TelegramState;

// ── Integrity verification ────────────────────────────────────────────────────

/// Compute SHA-256 of a local file and compare to expected. Returns Ok(true) on match.
#[tauri::command]
pub async fn cmd_verify_file_integrity(
    path: String,
    expected_sha256: String,
) -> Result<bool, String> {
    let actual = tokio::task::spawn_blocking(move || {
        let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = f.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            hasher.update(&buf[..n]);
        }
        Ok::<String, String>(format!("{:x}", hasher.finalize()))
    }).await.map_err(|e| e.to_string())??;

    Ok(actual.eq_ignore_ascii_case(&expected_sha256))
}

// ── Remote wipe ───────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct WipeConfig {
    secret_sha256: Option<String>,
}

pub struct WipeState {
    path: std::path::PathBuf,
    inner: Mutex<WipeConfig>,
}

impl WipeState {
    pub fn new(path: std::path::PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<WipeConfig>(&raw).ok())
            .unwrap_or_default();
        Self { path, inner: Mutex::new(inner) }
    }

    fn hash_secret(secret: &str) -> String {
        let mut h = Sha256::new();
        h.update(b"SharkDriveWipe:");
        h.update(secret.as_bytes());
        format!("{:x}", h.finalize())
    }

    pub fn set_secret(&self, secret: &str) -> Result<(), String> {
        let hash = Self::hash_secret(secret);
        if let Ok(mut inner) = self.inner.lock() {
            inner.secret_sha256 = Some(hash);
            self.persist(&inner);
        }
        Ok(())
    }

    pub fn clear_secret(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.secret_sha256 = None;
            self.persist(&inner);
        }
    }

    pub fn has_secret(&self) -> bool {
        self.inner.lock().ok().and_then(|g| g.secret_sha256.as_ref().map(|_| true)).unwrap_or(false)
    }

    pub fn matches(&self, secret: &str) -> bool {
        let hash = Self::hash_secret(secret);
        self.inner.lock().ok()
            .and_then(|g| g.secret_sha256.as_ref().map(|stored| stored == &hash))
            .unwrap_or(false)
    }

    fn persist(&self, data: &WipeConfig) {
        if let Ok(raw) = serde_json::to_string(data) {
            let _ = std::fs::write(&self.path, raw);
        }
    }
}


#[tauri::command]
pub fn cmd_set_wipe_secret(
    secret: String,
    wipe: State<'_, std::sync::Arc<WipeState>>,
) -> Result<(), String> {
    if secret.trim().is_empty() {
        return Err("Secret cannot be empty".to_string());
    }
    wipe.set_secret(secret.trim())
}

#[tauri::command]
pub fn cmd_clear_wipe_secret(
    wipe: State<'_, std::sync::Arc<WipeState>>,
) {
    wipe.clear_secret();
}

#[tauri::command]
pub fn cmd_has_wipe_secret(
    wipe: State<'_, std::sync::Arc<WipeState>>,
) -> bool {
    wipe.has_secret()
}

/// Check the latest messages in Saved Messages for a remote wipe command.
/// Returns true if a valid wipe command was found.
#[tauri::command]
pub async fn cmd_check_remote_wipe(
    state: State<'_, TelegramState>,
    wipe: State<'_, std::sync::Arc<WipeState>>,
) -> Result<bool, String> {
    if !wipe.has_secret() { return Ok(false); }

    let client_opt = { state.client.lock().await.clone() };
    let client = match client_opt {
        Some(c) => c,
        None => return Ok(false),
    };

    // Saved Messages = folder_id None
    let peer = crate::commands::utils::resolve_peer(&client, None, &state).await?;
    let mut msgs = client.iter_messages(&peer);
    let mut checked = 0;

    while let Some(msg) = msgs.next().await.map_err(|e| e.to_string())? {
        let text = msg.text();
        if text.starts_with("[SD-WIPE-") && text.ends_with(']') {
            let secret = &text[9..text.len()-1];
            if wipe.matches(secret) {
                let _ = client.delete_messages(&peer, &[msg.id()]).await;
                return Ok(true);
            }
        }
        checked += 1;
        if checked >= 10 { break; }
    }

    Ok(false)
}

/// Execute local wipe: delete all app data and exit.
#[tauri::command]
pub async fn cmd_execute_wipe(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_cache_dir = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?;

    // Remove everything in app data and cache
    for dir in &[&app_data_dir, &app_cache_dir] {
        if dir.exists() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    log::warn!("Remote wipe executed. All local data deleted.");
    app_handle.exit(0);
    Ok(())
}

// ── Encrypted audit log ───────────────────────────────────────────────────────

const ACTIVITY_ENC_MAGIC: &[u8] = b"SDACT1";

#[tauri::command]
pub async fn cmd_save_encrypted_activity(
    entries_json: String,
    app_handle: tauri::AppHandle,
    enc_state: State<'_, EncryptionState>,
) -> Result<(), String> {
    let key = enc_state.active_key(2)?.ok_or("Vault not unlocked")?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, entries_json.as_bytes())
        .map_err(|e| format!("Encrypt failed: {e}"))?;

    let mut out = ACTIVITY_ENC_MAGIC.to_vec();
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);

    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?.join("activity_log.enc");
    std::fs::write(&path, out).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cmd_load_encrypted_activity(
    app_handle: tauri::AppHandle,
    enc_state: State<'_, EncryptionState>,
) -> Result<Option<String>, String> {
    let key = enc_state.active_key(2)?.ok_or("Vault not unlocked")?;
    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?.join("activity_log.enc");
    if !path.exists() { return Ok(None); }

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let magic_len = ACTIVITY_ENC_MAGIC.len();
    if data.len() < magic_len + 12 || &data[..magic_len] != ACTIVITY_ENC_MAGIC {
        return Ok(None);
    }
    let nonce = Nonce::from_slice(&data[magic_len..magic_len+12]);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plaintext = cipher
        .decrypt(nonce, &data[magic_len+12..])
        .map_err(|_| "Decrypt failed — wrong key or corrupted file")?;

    String::from_utf8(plaintext).map(Some).map_err(|e| e.to_string())
}

// ── TOTP 2FA ─────────────────────────────────────────────────────────────────

pub struct TotpState {
    path: std::path::PathBuf,
    secret_enc: Mutex<Option<Vec<u8>>>, // encrypted secret bytes stored on disk
    active_secret: Mutex<Option<Vec<u8>>>, // decrypted secret, in-memory only
}

impl TotpState {
    pub fn new(path: std::path::PathBuf) -> Self {
        let secret_enc = std::fs::read(&path).ok();
        Self {
            path,
            secret_enc: Mutex::new(secret_enc),
            active_secret: Mutex::new(None),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.secret_enc.lock().ok().map(|g| g.is_some()).unwrap_or(false)
    }

    pub fn is_unlocked(&self) -> bool {
        self.active_secret.lock().ok().map(|g| g.is_some()).unwrap_or(false)
    }

    fn generate_code(secret: &[u8]) -> Result<String, String> {
        use totp_rs::{Algorithm, TOTP};
        let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.to_vec(), None, "SharkDrive".to_string())
            .map_err(|e| e.to_string())?;
        totp.generate_current().map_err(|e| e.to_string())
    }

    pub fn verify_code(&self, code: &str) -> Result<bool, String> {
        let secret = self.active_secret.lock().map_err(|e| e.to_string())?;
        let secret = secret.as_ref().ok_or("TOTP secret not loaded")?;
        use totp_rs::{Algorithm, TOTP};
        let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret.clone(), None, "SharkDrive".to_string())
            .map_err(|e| e.to_string())?;
        totp.check_current(code).map_err(|e| e.to_string())
    }

    /// Decrypt the stored secret using the vault key and keep it in memory.
    pub fn unlock(&self, vault_key: &[u8]) -> Result<(), String> {
        let enc = {
            let guard = self.secret_enc.lock().map_err(|e| e.to_string())?;
            guard.clone().ok_or("TOTP not configured")?
        };
        if enc.len() < 12 { return Err("Invalid TOTP data".to_string()); }
        let nonce = Nonce::from_slice(&enc[..12]);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(vault_key));
        let secret = cipher.decrypt(nonce, &enc[12..]).map_err(|_| "Failed to decrypt TOTP secret")?;
        *self.active_secret.lock().map_err(|e| e.to_string())? = Some(secret);
        Ok(())
    }

    pub fn lock(&self) {
        if let Ok(mut s) = self.active_secret.lock() { *s = None; }
    }

    /// Generate a new random secret, encrypt it, and store to disk. Returns the OTP auth URI.
    pub fn setup(&self, vault_key: &[u8]) -> Result<String, String> {
        use rand::RngCore;
        let mut secret = vec![0u8; 20];
        rand::thread_rng().fill_bytes(&mut secret);

        // Encrypt secret
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(vault_key));
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = cipher.encrypt(&nonce, secret.as_slice()).map_err(|e| e.to_string())?;
        let mut enc = nonce.to_vec();
        enc.extend_from_slice(&ciphertext);

        // Store encrypted secret
        std::fs::write(&self.path, &enc).map_err(|e| e.to_string())?;
        *self.secret_enc.lock().map_err(|e| e.to_string())? = Some(enc);
        *self.active_secret.lock().map_err(|e| e.to_string())? = Some(secret.clone());

        // Build OTP auth URI
        let base32_secret = data_encoding::BASE32.encode(&secret);
        let uri = format!(
            "otpauth://totp/SharkDrive?secret={}&issuer=SharkDrive&algorithm=SHA1&digits=6&period=30",
            base32_secret
        );
        Ok(uri)
    }

    pub fn disable(&self) -> Result<(), String> {
        let _ = std::fs::remove_file(&self.path);
        *self.secret_enc.lock().map_err(|e| e.to_string())? = None;
        *self.active_secret.lock().map_err(|e| e.to_string())? = None;
        Ok(())
    }
}

use std::sync::Arc;

#[tauri::command]
pub fn cmd_is_totp_enabled(totp: State<'_, Arc<TotpState>>) -> bool {
    totp.is_enabled()
}

/// Begin TOTP setup: generates a new secret, returns the OTP auth URI.
/// Call cmd_confirm_totp_setup with the first code to activate.
#[tauri::command]
pub async fn cmd_setup_totp(
    enc_state: State<'_, EncryptionState>,
    totp: State<'_, Arc<TotpState>>,
) -> Result<String, String> {
    let key = enc_state.active_key(2)?.ok_or("Vault must be unlocked to set up 2FA")?;
    totp.setup(&key)
}

/// Confirm TOTP setup by verifying the first code from the authenticator app.
#[tauri::command]
pub fn cmd_confirm_totp_setup(
    code: String,
    totp: State<'_, Arc<TotpState>>,
) -> Result<bool, String> {
    totp.verify_code(&code)
}

/// Verify a TOTP code during vault unlock. Returns true if valid.
#[tauri::command]
pub fn cmd_verify_totp(
    code: String,
    totp: State<'_, Arc<TotpState>>,
) -> Result<bool, String> {
    totp.verify_code(&code)
}

/// Disable TOTP 2FA (requires a valid current code).
#[tauri::command]
pub fn cmd_disable_totp(
    code: String,
    totp: State<'_, Arc<TotpState>>,
) -> Result<(), String> {
    let valid = totp.verify_code(&code)?;
    if !valid { return Err("Invalid TOTP code".to_string()); }
    totp.disable()
}

// ── Compartir carpetas cifradas ───────────────────────────────────────────────

/// Export the derived key for a specific folder, encrypted with a share password.
/// Returns a base64 blob that the recipient imports with cmd_import_folder_key.
#[tauri::command]
pub async fn cmd_export_folder_key(
    folder_id: i64,
    share_password: String,
    enc_state: State<'_, EncryptionState>,
) -> Result<String, String> {
    let master = enc_state.active_key(2)?.ok_or("Vault not unlocked")?;
    let folder_key = derive_folder_key(&master, folder_id);

    // Derive a key from the share password
    use pbkdf2::pbkdf2_hmac;
    let mut share_key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(
        share_password.as_bytes(),
        b"SharkDriveShareKey:",
        100_000,
        &mut share_key,
    );

    // Encrypt folder key with the share key
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&share_key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    // Include folder_id in payload as AAD to prevent mix-up attacks
    let folder_id_bytes = folder_id.to_le_bytes();
    let ciphertext = cipher
        .encrypt(&nonce, aes_gcm::aead::Payload {
            msg: &folder_key,
            aad: &folder_id_bytes,
        })
        .map_err(|e| format!("Encrypt failed: {e}"))?;

    // Assemble: magic(4) + folder_id(8) + nonce(12) + ciphertext
    let mut blob = b"SDKV".to_vec();
    blob.extend_from_slice(&folder_id_bytes);
    blob.extend_from_slice(&nonce);
    blob.extend_from_slice(&ciphertext);

    use base64::Engine as _;
    Ok(base64::engine::general_purpose::STANDARD.encode(&blob))
}

/// Import a folder key blob exported by cmd_export_folder_key.
/// Decrypts the folder key and stores it as a guest key in EncryptionState.
#[tauri::command]
pub async fn cmd_import_folder_key(
    blob: String,
    share_password: String,
    enc_state: State<'_, EncryptionState>,
) -> Result<i64, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&blob)
        .map_err(|_| "Invalid blob encoding")?;

    if bytes.len() < 4 + 8 + 12 || &bytes[..4] != b"SDKV" {
        return Err("Invalid folder key blob".to_string());
    }

    let folder_id = i64::from_le_bytes(bytes[4..12].try_into().unwrap());
    let nonce = Nonce::from_slice(&bytes[12..24]);
    let ciphertext = &bytes[24..];

    use pbkdf2::pbkdf2_hmac;
    let mut share_key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(
        share_password.as_bytes(),
        b"SharkDriveShareKey:",
        100_000,
        &mut share_key,
    );

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&share_key));
    let folder_id_bytes = folder_id.to_le_bytes();
    let folder_key = cipher
        .decrypt(nonce, aes_gcm::aead::Payload {
            msg: ciphertext,
            aad: &folder_id_bytes,
        })
        .map_err(|_| "Decryption failed — wrong password or corrupted blob")?;

    // Store as guest key in EncryptionState
    enc_state.add_guest_folder_key(Some(folder_id), folder_key)?;
    Ok(folder_id)
}
