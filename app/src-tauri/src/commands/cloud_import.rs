/// Dropbox OAuth2 import wizard — backend support.
use std::sync::Mutex;
use tauri::{Emitter, State};

pub struct DropboxState {
    pub app_key: Mutex<String>,
    pub access_token: Mutex<Option<String>>,
}

impl DropboxState {
    pub fn new() -> Self {
        Self {
            app_key: Mutex::new(String::new()),
            access_token: Mutex::new(None),
        }
    }
}

// ── Config ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn cmd_set_dropbox_app_key(
    app_key: String,
    dropbox: State<'_, DropboxState>,
) {
    if let Ok(mut k) = dropbox.app_key.lock() {
        *k = app_key;
    }
}

/// Returns the Dropbox OAuth2 authorization URL to open in the browser.
#[tauri::command]
pub fn cmd_get_dropbox_auth_url(
    dropbox: State<'_, DropboxState>,
) -> Result<String, String> {
    let app_key = dropbox.app_key.lock().map_err(|e| e.to_string())?.clone();
    if app_key.is_empty() { return Err("Dropbox App Key not configured".to_string()); }
    let url = format!(
        "https://www.dropbox.com/oauth2/authorize?client_id={}&redirect_uri=http%3A%2F%2Flocalhost%3A14200%2Foauth%2Fdropbox%2Fcallback&response_type=code&token_access_type=legacy",
        urlencoding::encode(&app_key)
    );
    Ok(url)
}

/// Exchange the OAuth2 authorization code for an access token.
/// Called internally by the actix callback route.
pub async fn exchange_dropbox_code(
    code: &str,
    app_key: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let params = [
        ("code", code),
        ("grant_type", "authorization_code"),
        ("client_id", app_key),
        ("redirect_uri", "http://localhost:14200/oauth/dropbox/callback"),
    ];
    let resp = client
        .post("https://api.dropboxapi.com/oauth2/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {e}"))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json["access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No access_token in response: {}", json))
}

/// Set the access token (called after OAuth2 callback completes).
#[tauri::command]
pub fn cmd_set_dropbox_token(
    token: String,
    dropbox: State<'_, DropboxState>,
) {
    if let Ok(mut t) = dropbox.access_token.lock() {
        *t = Some(token);
    }
}

#[tauri::command]
pub fn cmd_get_dropbox_token_status(
    dropbox: State<'_, DropboxState>,
) -> bool {
    dropbox.access_token.lock().ok().and_then(|t| t.clone()).is_some()
}

// ── File listing ──────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct DropboxEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub is_folder: bool,
    pub size: u64,
}

/// List files in a Dropbox folder (path = "" for root).
#[tauri::command]
pub async fn cmd_dropbox_list_folder(
    path: String,
    dropbox: State<'_, DropboxState>,
) -> Result<Vec<DropboxEntry>, String> {
    let token = dropbox.access_token.lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Not authenticated with Dropbox")?;

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "path": if path.is_empty() { "".to_string() } else { path },
        "recursive": false,
        "include_media_info": false,
    });

    let resp = client
        .post("https://api.dropboxapi.com/2/files/list_folder")
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(err) = json["error_summary"].as_str() {
        return Err(format!("Dropbox error: {err}"));
    }

    let entries = json["entries"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|e| DropboxEntry {
            id: e["id"].as_str().unwrap_or("").to_string(),
            name: e["name"].as_str().unwrap_or("").to_string(),
            path: e["path_display"].as_str().unwrap_or("").to_string(),
            is_folder: e[".tag"].as_str() == Some("folder"),
            size: e["size"].as_u64().unwrap_or(0),
        })
        .collect();

    Ok(entries)
}

// ── Download + queue for upload ───────────────────────────────────────────────

#[derive(serde::Serialize, Clone)]
struct ImportProgress {
    done: usize,
    total: usize,
    filename: String,
}

/// Download Dropbox files to temp and emit events so the frontend uploads them.
#[tauri::command]
pub async fn cmd_dropbox_import_files(
    file_paths: Vec<String>,
    app_handle: tauri::AppHandle,
    dropbox: State<'_, DropboxState>,
) -> Result<Vec<String>, String> {
    let token = dropbox.access_token.lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Not authenticated with Dropbox")?;

    let client = reqwest::Client::new();
    let total = file_paths.len();
    let mut local_paths: Vec<String> = Vec::new();

    for (idx, db_path) in file_paths.iter().enumerate() {
        let filename = db_path.split('/').last().unwrap_or("file").to_string();

        let _ = app_handle.emit("dropbox-import-progress", ImportProgress {
            done: idx,
            total,
            filename: filename.clone(),
        });

        let body = serde_json::json!({ "path": db_path });
        let resp = client
            .post("https://content.dropboxapi.com/2/files/download")
            .bearer_auth(&token)
            .header("Dropbox-API-Arg", body.to_string())
            .send()
            .await
            .map_err(|e| format!("Download failed for {filename}: {e}"))?;

        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let temp_path = std::env::temp_dir().join(format!("sddropbox_{filename}"));
        std::fs::write(&temp_path, &bytes).map_err(|e| e.to_string())?;

        local_paths.push(temp_path.to_string_lossy().to_string());
    }

    let _ = app_handle.emit("dropbox-import-progress", ImportProgress {
        done: total, total, filename: String::new(),
    });

    Ok(local_paths)
}

/// Disconnect Dropbox (clear token).
#[tauri::command]
pub fn cmd_dropbox_disconnect(dropbox: State<'_, DropboxState>) {
    if let Ok(mut t) = dropbox.access_token.lock() { *t = None; }
}
