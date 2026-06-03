/// v3.7 — Export & Interoperabilidad
/// Config export/import, URL download for clipboard, webhook delivery, Jump List.
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::commands::encryption::EncryptionState;

const CONFIG_MAGIC: &[u8] = b"SDCFG1";

// ── Config export / import ─────────────────────────────────────────────────

/// Write a config JSON (optionally AES-encrypted) to disk.
/// If password is provided, encrypts with PBKDF2 + AES-256-GCM.
#[tauri::command]
pub async fn cmd_export_config(
    config_json: String,
    password: Option<String>,
    save_path: String,
) -> Result<(), String> {
    let content = if let Some(pwd) = password.filter(|p| !p.is_empty()) {
        let key = derive_config_key(&pwd);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ct = cipher.encrypt(&nonce, config_json.as_bytes()).map_err(|e| e.to_string())?;
        let mut out = CONFIG_MAGIC.to_vec();
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ct);
        out
    } else {
        config_json.into_bytes()
    };
    std::fs::write(&save_path, content).map_err(|e| e.to_string())
}

/// Read a config file, decrypting if needed. Returns the JSON string.
#[tauri::command]
pub async fn cmd_import_config(
    file_path: String,
    password: Option<String>,
) -> Result<String, String> {
    let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;

    if bytes.starts_with(CONFIG_MAGIC) {
        let offset = CONFIG_MAGIC.len();
        if bytes.len() < offset + 12 {
            return Err("Corrupted config file".to_string());
        }
        let pwd = password.filter(|p| !p.is_empty()).ok_or("Password required for encrypted config")?;
        let key = derive_config_key(&pwd);
        let nonce = Nonce::from_slice(&bytes[offset..offset + 12]);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let plaintext = cipher
            .decrypt(nonce, &bytes[offset + 12..])
            .map_err(|_| "Wrong password or corrupted config")?;
        String::from_utf8(plaintext).map_err(|e| e.to_string())
    } else {
        // Plaintext JSON
        String::from_utf8(bytes).map_err(|e| e.to_string())
    }
}

fn derive_config_key(password: &str) -> Vec<u8> {
    use pbkdf2::pbkdf2_hmac;
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), b"SharkDriveConfig:", 100_000, &mut key);
    key.to_vec()
}

// ── URL download to temp (clipboard extended) ──────────────────────────────

/// Download a file from a URL to a temp directory. Returns the local path.
#[tauri::command]
pub async fn cmd_download_url_to_temp(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only HTTP/HTTPS URLs are supported".to_string());
    }

    // Extract a reasonable filename from the URL
    let raw_name = url.split('?').next().unwrap_or(&url)
        .split('/').last().unwrap_or("download.bin");
    let filename = if raw_name.is_empty() || raw_name == "/" { "download.bin" } else { raw_name };
    let safe_filename: String = filename.chars()
        .filter(|c| !matches!(c, '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let safe_filename = if safe_filename.is_empty() { "download.bin".to_string() } else { safe_filename };

    let temp_path = std::env::temp_dir().join(format!("sdclip_{}", safe_filename));

    let response = reqwest::get(&url).await.map_err(|e| format!("Download failed: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status} — download failed"));
    }
    let bytes = response.bytes().await.map_err(|e| format!("Download body error: {e}"))?;
    std::fs::write(&temp_path, &bytes).map_err(|e| e.to_string())?;

    Ok(temp_path.to_string_lossy().to_string())
}

/// Save plain text to a temp file. Returns the path.
#[tauri::command]
pub fn cmd_save_temp_text(content: String, filename: String) -> Result<String, String> {
    let safe: String = filename.chars()
        .filter(|c| !matches!(c, '/' | '\\' | '\0' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let safe = if safe.is_empty() { "text.txt".to_string() } else { safe };
    let path = std::env::temp_dir().join(format!("sdclip_{safe}"));
    std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ── Webhook delivery (also callable from Rust for reliability) ─────────────

/// POST JSON payload to a webhook URL. Non-blocking, errors are logged.
#[tauri::command]
pub async fn cmd_call_webhook(url: String, payload_json: String) -> Result<(), String> {
    if url.is_empty() { return Ok(()); }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let payload: serde_json::Value = serde_json::from_str(&payload_json)
        .unwrap_or(serde_json::json!({"raw": payload_json}));
    let _ = client.post(&url).json(&payload).send().await; // errors silently ignored
    Ok(())
}

// ── Windows Jump List ──────────────────────────────────────────────────────

/// Update the Windows taskbar Jump List with recent folders.
/// On non-Windows platforms this is a no-op.
#[tauri::command]
pub fn cmd_update_jump_list(folders: Vec<(i64, String)>) {
    #[cfg(target_os = "windows")]
    windows_jump_list(&folders);
    let _ = folders; // suppress unused warning on non-Windows
}

/// Build and commit the Windows taskbar Jump List using a PowerShell one-liner.
/// Each folder opens SharkDrive to that folder via the sharkdrive:// protocol.
#[cfg(target_os = "windows")]
fn windows_jump_list(folders: &[(i64, String)]) {
    let exe = match std::env::current_exe() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => return,
    };

    // Build PS tasks array
    let tasks: Vec<String> = folders
        .iter()
        .take(8)
        .map(|(id, name)| {
            let safe_name = name.replace("'", "''").replace('"', "'");
            let safe_exe  = exe.replace("'", "''");
            format!(
                "@{{Name=\"{safe_name}\";Target=\"{safe_exe}\";Args=\"sharkdrive://open/{id}\"}}",
            )
        })
        .collect();

    if tasks.is_empty() { return; }

    let tasks_literal = format!("@({})", tasks.join(","));

    // PowerShell script: create JumpList via COM
    let script = format!(r#"
try {{
  Add-Type -AssemblyName System.Windows.Forms | Out-Null
  $jl=[Microsoft.WindowsAPICodePack.Taskbar.JumpList]::CreateJumpListForIndividualWindow()
}} catch {{}}
$shell = New-Object -ComObject 'WScript.Shell'
foreach($t in {tasks_literal}) {{
  $lnk_path = [System.IO.Path]::GetTempPath() + 'sd_jl_' + ($t.Args -replace '[^a-z0-9]','') + '.lnk'
  $lnk = $shell.CreateShortcut($lnk_path)
  $lnk.TargetPath  = $t.Target
  $lnk.Arguments   = $t.Args
  $lnk.Description = $t.Name
  $lnk.IconLocation= $t.Target + ',0'
  $lnk.Save()
}}
"#);

    // Fire-and-forget — errors are non-critical
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
        .spawn();

    log::info!("Jump list update: {} folders", folders.len());
}
