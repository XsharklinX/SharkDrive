use crate::account_manager::AccountManager;
use crate::commands::share::ShareStore;
use crate::commands::utils::resolve_peer;
use crate::commands::TelegramState;
use crate::web_auth::WebAuthState;
use actix_cors::Cors;
use tauri::Emitter as _;
use actix_web::{
    cookie::{time::Duration as CookieDuration, Cookie, SameSite},
    get,
    http::header,
    middleware::DefaultHeaders,
    post, web, App, HttpRequest, HttpResponse, HttpServer, Responder,
};
use grammers_client::types::Media;

use std::sync::Arc;

const WEB_APP_HTML: &str = include_str!("web_app.html");

/// Holds the per-session streaming token for Actix validation
pub struct StreamTokenData {
    pub token: String,
}

#[derive(serde::Deserialize)]
struct StreamQuery {
    token: Option<String>,
}

#[derive(serde::Deserialize)]
struct SharePasswordForm {
    password: String,
}

fn password_form_html(filename: &str, wrong: bool) -> String {
    let error = if wrong {
        "<p style='color:#e55;margin:0 0 12px'>Incorrect password.</p>"
    } else {
        ""
    };
    format!(
        r#"<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Protected file</title>
<style>*{{box-sizing:border-box}}body{{font-family:system-ui,sans-serif;background:#0b1521;color:#c8d6e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
.card{{background:#0f1c2d;border:1px solid #1e3148;border-radius:12px;padding:32px;width:100%;max-width:380px}}
h2{{margin:0 0 6px;font-size:1.1rem;color:#e8f1fa}}p{{margin:0 0 18px;font-size:.85rem;color:#8899aa}}
input{{width:100%;padding:10px 14px;background:#07111b;border:1px solid #1e3148;border-radius:8px;color:#c8d6e5;font-size:.9rem;margin-bottom:14px;outline:none}}
button{{width:100%;padding:10px;background:#2aabee;color:#06111d;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-size:.9rem}}</style></head>
<body><div class="card"><h2>🔒 Protected file</h2><p>{}</p>{}
<form method="POST"><input type="password" name="password" placeholder="Password" autofocus required>
<button type="submit">Download</button></form></div></body></html>"#,
        html_escape(filename),
        error
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn parse_range_header(range_header: &str, size: i64) -> Option<(i64, i64)> {
    if size <= 0 || !range_header.starts_with("bytes=") {
        return None;
    }

    let range_value = &range_header[6..];
    let (start_raw, end_raw) = range_value.split_once('-')?;
    let start = start_raw.parse::<i64>().ok()?;
    let end = if end_raw.is_empty() {
        size - 1
    } else {
        end_raw.parse::<i64>().ok()?
    };

    if start < 0 || start >= size {
        return None;
    }

    Some((start, end.min(size - 1)))
}

#[get("/stream/{folder_id}/{message_id}")]
async fn stream_media(
    req: HttpRequest,
    path: web::Path<(String, i32)>,
    query: web::Query<StreamQuery>,
    data: web::Data<Arc<TelegramState>>,
    token_data: web::Data<StreamTokenData>,
) -> impl Responder {
    // Validate session token
    match &query.token {
        Some(t) if t == &token_data.token => {}
        _ => return HttpResponse::Forbidden().body("Invalid or missing stream token"),
    }

    let (folder_id_str, message_id) = path.into_inner();

    // Parse folder ID
    let folder_id = if folder_id_str == "me" || folder_id_str == "home" || folder_id_str == "null" {
        None
    } else {
        match folder_id_str.parse::<i64>() {
            Ok(id) => Some(id),
            Err(_) => return HttpResponse::BadRequest().body("Invalid folder ID"),
        }
    };

    let client_opt = { data.client.lock().await.clone() };

    if let Some(client) = client_opt {
        match resolve_peer(&client, folder_id, &data).await {
            Ok(peer) => {
                // Try to fetch message efficiently
                match client.get_messages_by_id(peer, &[message_id]).await {
                    Ok(messages) => {
                        if let Some(Some(msg)) = messages.first() {
                            if let Some(media) = msg.media() {
                                let size = match &media {
                                    Media::Document(d) => d.size(),
                                    Media::Photo(_) => 0,
                                    _ => 0,
                                };

                                let mime = mime_type_from_media(&media);
                                let range_header = req
                                    .headers()
                                    .get(header::RANGE)
                                    .and_then(|value| value.to_str().ok())
                                    .map(|value| value.to_string());

                                if let Some(range_header) = range_header {
                                    if let Some((start, end)) =
                                        parse_range_header(&range_header, size)
                                    {
                                        const STREAM_CHUNK_SIZE: i32 = 4 * 1024;
                                        let aligned_start = (start / STREAM_CHUNK_SIZE as i64)
                                            * STREAM_CHUNK_SIZE as i64;
                                        let skip_bytes = (start - aligned_start) as usize;
                                        let content_length = (end - start + 1) as usize;
                                        let mut sent = 0usize;
                                        let mut first_chunk = true;
                                        let mut download_iter = client
                                            .iter_download(&media)
                                            .chunk_size(STREAM_CHUNK_SIZE)
                                            .skip_chunks(
                                                (aligned_start / STREAM_CHUNK_SIZE as i64) as i32,
                                            );

                                        let stream = async_stream::stream! {
                                            while let Some(chunk) = download_iter.next().await.transpose() {
                                                match chunk {
                                                    Ok(bytes) => {
                                                        let bytes = if first_chunk {
                                                            first_chunk = false;
                                                            if skip_bytes >= bytes.len() {
                                                                continue;
                                                            }
                                                            bytes[skip_bytes..].to_vec()
                                                        } else {
                                                            bytes
                                                        };

                                                        if bytes.is_empty() {
                                                            continue;
                                                        }

                                                        let remaining = content_length.saturating_sub(sent);
                                                        if remaining == 0 {
                                                            break;
                                                        }

                                                        let slice = if bytes.len() > remaining {
                                                            bytes[..remaining].to_vec()
                                                        } else {
                                                            bytes
                                                        };

                                                        sent += slice.len();
                                                        yield Ok::<_, actix_web::Error>(web::Bytes::from(slice));

                                                        if sent >= content_length {
                                                            break;
                                                        }
                                                    }
                                                    Err(e) => {
                                                        log::error!("Range stream error: {}", e);
                                                        break;
                                                    }
                                                }
                                            }
                                        };

                                        return HttpResponse::PartialContent()
                                            .insert_header((header::CONTENT_TYPE, mime))
                                            .insert_header((
                                                header::CONTENT_LENGTH,
                                                content_length.to_string(),
                                            ))
                                            .insert_header((
                                                header::CONTENT_RANGE,
                                                format!("bytes {}-{}/{}", start, end, size),
                                            ))
                                            .insert_header((header::ACCEPT_RANGES, "bytes"))
                                            .insert_header((
                                                "Cache-Control",
                                                "private, max-age=120",
                                            ))
                                            .streaming(stream);
                                    }

                                    return HttpResponse::RangeNotSatisfiable()
                                        .insert_header((
                                            header::CONTENT_RANGE,
                                            format!("bytes */{}", size.max(0)),
                                        ))
                                        .finish();
                                }

                                let mut download_iter = client.iter_download(&media);
                                let stream = async_stream::stream! {
                                    while let Some(chunk) = download_iter.next().await.transpose() {
                                        match chunk {
                                            Ok(bytes) => yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes)),
                                            Err(e) => {
                                                log::error!("Stream error: {}", e);
                                                break;
                                            }
                                        }
                                    }
                                };

                                return HttpResponse::Ok()
                                    .insert_header((header::CONTENT_TYPE, mime))
                                    .insert_header((header::CONTENT_LENGTH, size.to_string()))
                                    .insert_header((header::ACCEPT_RANGES, "bytes"))
                                    .insert_header(("Cache-Control", "private, max-age=120"))
                                    .streaming(stream);
                            }
                        }
                        HttpResponse::NotFound().body("Message or media not found")
                    }
                    Err(e) => HttpResponse::InternalServerError()
                        .body(format!("Failed to fetch message: {}", e)),
                }
            }
            Err(e) => HttpResponse::BadRequest().body(format!("Peer resolution failed: {}", e)),
        }
    } else {
        HttpResponse::ServiceUnavailable().body("Telegram client not connected")
    }
}

#[get("/share/{token}/{filename}")]
async fn share_file(
    req: HttpRequest,
    path: web::Path<(String, String)>,
    data: web::Data<Arc<TelegramState>>,
    share_store: web::Data<Arc<ShareStore>>,
) -> impl Responder {
    let (token, _) = path.into_inner();
    share_store.purge_expired();
    let entry = {
        let Ok(shares) = share_store.shares.lock() else {
            return HttpResponse::InternalServerError().body("Server error");
        };
        shares.get(&token).cloned()
    };
    let entry = match entry {
        Some(e) => e,
        None => return HttpResponse::NotFound().body("Share link not found or expired"),
    };

    // Enforce download limit
    if let Some(max) = entry.max_downloads {
        if entry.download_count >= u64::from(max) {
            return HttpResponse::Gone()
                .content_type("text/plain")
                .body(format!(
                    "Download limit reached ({}/{}).",
                    entry.download_count, max
                ));
        }
    }

    // Enforce password
    if entry.password_hash.is_some() {
        let authorized = req
            .cookie("sd_share_auth")
            .map(|cookie| share_store.is_authorized(&token, cookie.value()))
            .unwrap_or(false);
        if !authorized {
            return HttpResponse::Ok()
                .content_type("text/html; charset=utf-8")
                .insert_header(("Cache-Control", "no-store"))
                .body(password_form_html(&entry.filename, false));
        }
    }

    let client_opt = { data.client.lock().await.clone() };
    let client = match client_opt {
        Some(c) => c,
        None => return HttpResponse::ServiceUnavailable().body("Telegram client not connected"),
    };

    let peer = match resolve_peer(&client, entry.folder_id, &data).await {
        Ok(p) => p,
        Err(e) => return HttpResponse::BadRequest().body(format!("Peer error: {}", e)),
    };

    let messages = match client.get_messages_by_id(&peer, &[entry.file_id]).await {
        Ok(m) => m,
        Err(e) => return HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    };

    if let Some(Some(msg)) = messages.first() {
        if let Some(media) = msg.media() {
            share_store.increment_download_count(&token);
            let (size, mime) = match &media {
                Media::Document(d) => (
                    d.size(),
                    d.mime_type()
                        .unwrap_or("application/octet-stream")
                        .to_string(),
                ),
                _ => (0, "application/octet-stream".to_string()),
            };
            let disposition = format!("attachment; filename=\"{}\"", entry.filename);
            let mut dl = client.iter_download(&media);
            let stream = async_stream::stream! {
                while let Some(chunk) = dl.next().await.transpose() {
                    match chunk {
                        Ok(bytes) => yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes)),
                        Err(_) => break,
                    }
                }
            };
            return HttpResponse::Ok()
                .insert_header(("Content-Type", mime))
                .insert_header(("Content-Disposition", disposition))
                .insert_header(("Content-Length", size.to_string()))
                .insert_header(("Cache-Control", "private, no-store"))
                .insert_header(("X-Content-Type-Options", "nosniff"))
                .insert_header(("Referrer-Policy", "no-referrer"))
                .insert_header(("Cross-Origin-Resource-Policy", "same-site"))
                .streaming(stream);
        }
    }
    HttpResponse::NotFound().body("File not found")
}

#[post("/share/{token}/{filename}")]
async fn authorize_share_file(
    path: web::Path<(String, String)>,
    form: web::Form<SharePasswordForm>,
    share_store: web::Data<Arc<ShareStore>>,
) -> impl Responder {
    let (token, filename) = path.into_inner();
    share_store.purge_expired();
    let entry = {
        let Ok(shares) = share_store.shares.lock() else {
            return HttpResponse::InternalServerError().body("Server error");
        };
        shares.get(&token).cloned()
    };
    let Some(entry) = entry else {
        return HttpResponse::NotFound().body("Share link not found or expired");
    };
    let Some(password_hash) = entry.password_hash else {
        return HttpResponse::SeeOther()
            .insert_header((
                header::LOCATION,
                format!("/share/{token}/{}", urlencoding::encode(&filename)),
            ))
            .finish();
    };
    if !bcrypt::verify(&form.password, &password_hash).unwrap_or(false) {
        return HttpResponse::Unauthorized()
            .content_type("text/html; charset=utf-8")
            .insert_header(("Cache-Control", "no-store"))
            .body(password_form_html(&entry.filename, true));
    }

    let authorization = share_store.issue_authorization(&token);
    let cookie = Cookie::build("sd_share_auth", authorization)
        .path(format!("/share/{token}/"))
        .http_only(true)
        .same_site(SameSite::Strict)
        .max_age(CookieDuration::minutes(10))
        .finish();
    HttpResponse::SeeOther()
        .cookie(cookie)
        .insert_header((
            header::LOCATION,
            format!("/share/{token}/{}", urlencoding::encode(&filename)),
        ))
        .finish()
}

fn mime_type_from_media(media: &Media) -> String {
    match media {
        Media::Document(d) => d
            .mime_type()
            .unwrap_or("application/octet-stream")
            .to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

// ── Web companion routes ──────────────────────────────────────────────────────

/// Extract the web token from the X-Web-Token header or `?t=` query param.
fn get_web_token(req: &HttpRequest) -> String {
    if let Some(h) = req.headers().get("X-Web-Token") {
        if let Ok(s) = h.to_str() {
            return s.to_string();
        }
    }
    // Fall back to query parameter ?t=
    if let Some(qs) = req.uri().query() {
        for pair in qs.split('&') {
            if let Some(v) = pair.strip_prefix("t=") {
                return v.to_string();
            }
        }
    }
    String::new()
}

/// GET /web  — serves the SPA (login + file browser)
#[get("/web")]
async fn serve_web_app() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .insert_header(("Cache-Control", "no-store"))
        .body(WEB_APP_HTML)
}

/// POST /web/auth  body: {"pin":"123456"}  → {"token":"..."}
#[post("/web/auth")]
async fn handle_web_auth(
    body: web::Bytes,
    auth_state: web::Data<Arc<WebAuthState>>,
) -> HttpResponse {
    #[derive(serde::Deserialize)]
    struct PinBody { pin: String }
    let parsed: PinBody = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(_) => return HttpResponse::BadRequest().body("Invalid JSON"),
    };
    if !auth_state.has_pin() {
        let token = auth_state.generate_token();
        return HttpResponse::Ok().json(serde_json::json!({ "token": token }));
    }
    if auth_state.verify_pin(&parsed.pin) {
        let token = auth_state.generate_token();
        HttpResponse::Ok().json(serde_json::json!({ "token": token }))
    } else {
        HttpResponse::Unauthorized().json(serde_json::json!({ "error": "Wrong PIN" }))
    }
}

/// GET /web/api/folders  — returns folders from the persisted index JSON
#[get("/web/api/folders")]
async fn web_api_folders(
    req: HttpRequest,
    auth_state: web::Data<Arc<WebAuthState>>,
    acct_mgr: web::Data<Arc<AccountManager>>,
) -> HttpResponse {
    if !auth_state.is_authorized(&get_web_token(&req)) {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error":"auth"}));
    }
    let folders = read_index_folders(&acct_mgr);
    HttpResponse::Ok().json(folders)
}

/// GET /web/api/files/{folder_key}  — returns files for a folder
#[get("/web/api/files/{folder_key}")]
async fn web_api_files(
    req: HttpRequest,
    path: web::Path<String>,
    auth_state: web::Data<Arc<WebAuthState>>,
    acct_mgr: web::Data<Arc<AccountManager>>,
) -> HttpResponse {
    if !auth_state.is_authorized(&get_web_token(&req)) {
        return HttpResponse::Unauthorized().json(serde_json::json!({"error":"auth"}));
    }
    let folder_key = path.into_inner();
    let files = read_index_files(&acct_mgr, &folder_key);
    HttpResponse::Ok().json(files)
}

/// GET /web/api/thumbnail/{folder_key}/{msg_id}?t=TOKEN
/// Serves the cached thumbnail PNG if available.
#[get("/web/api/thumbnail/{folder_key}/{msg_id}")]
async fn web_api_thumbnail(
    req: HttpRequest,
    path: web::Path<(String, i32)>,
    auth_state: web::Data<Arc<WebAuthState>>,
    acct_mgr: web::Data<Arc<AccountManager>>,
) -> HttpResponse {
    if !auth_state.is_authorized(&get_web_token(&req)) {
        return HttpResponse::Unauthorized().finish();
    }
    let (folder_key, msg_id) = path.into_inner();
    // Thumbnails are stored in app_data_dir/thumbnails/{folder_key}_{msg_id}.png
    // AccountManager gives us the accounts dir; thumbnails are in the parent app_data_dir
    if let Some(thumb_dir) = acct_mgr.accounts_dir.parent().map(|p| p.join("thumbnails")) {
        let thumb_path = thumb_dir.join(format!("{}_{}.png", folder_key, msg_id));
        if let Ok(bytes) = std::fs::read(&thumb_path) {
            return HttpResponse::Ok()
                .content_type("image/png")
                .insert_header(("Cache-Control", "private, max-age=3600"))
                .body(bytes);
        }
    }
    HttpResponse::NotFound().finish()
}

/// GET /web/api/stream/{folder_key}/{msg_id}?t=TOKEN  — authenticated stream proxy
#[get("/web/api/stream/{folder_key}/{msg_id}")]
async fn web_api_stream(
    req: HttpRequest,
    path: web::Path<(String, i32)>,
    auth_state: web::Data<Arc<WebAuthState>>,
    data: web::Data<Arc<TelegramState>>,
) -> HttpResponse {
    if !auth_state.is_authorized(&get_web_token(&req)) {
        return HttpResponse::Unauthorized().finish();
    }

    let (folder_key, message_id) = path.into_inner();
    let folder_id = parse_folder_key(&folder_key);

    let client_opt = { data.client.lock().await.clone() };
    let client = match client_opt {
        Some(c) => c,
        None => return HttpResponse::ServiceUnavailable().body("Not connected"),
    };

    let peer = match resolve_peer(&client, folder_id, &data).await {
        Ok(p) => p,
        Err(e) => return HttpResponse::BadRequest().body(e),
    };

    let messages = match client.get_messages_by_id(&peer, &[message_id]).await {
        Ok(m) => m,
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    if let Some(Some(msg)) = messages.first() {
        if let Some(media) = msg.media() {
            let size = match &media { Media::Document(d) => d.size(), _ => 0 };
            let mime = mime_type_from_media(&media);
            let filename = match &media {
                Media::Document(d) => d.name().to_string(),
                _ => "file".to_string(),
            };
            let disposition = format!("attachment; filename=\"{}\"", filename.replace('"', "'"));
            let mut dl = client.iter_download(&media);
            let stream = async_stream::stream! {
                while let Some(chunk) = dl.next().await.transpose() {
                    match chunk {
                        Ok(bytes) => yield Ok::<_, actix_web::Error>(web::Bytes::from(bytes)),
                        Err(_) => break,
                    }
                }
            };
            return HttpResponse::Ok()
                .content_type(mime)
                .insert_header(("Content-Disposition", disposition))
                .insert_header((header::CONTENT_LENGTH, size.to_string()))
                .insert_header(("Cache-Control", "private, max-age=60"))
                .streaming(stream);
        }
    }
    HttpResponse::NotFound().body("File not found")
}

/// POST /web/api/upload/{folder_key}?t=TOKEN
/// Receives file bytes in body, saves to temp, emits event to desktop for upload.
#[post("/web/api/upload/{folder_key}")]
async fn web_api_upload(
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Bytes,
    auth_state: web::Data<Arc<WebAuthState>>,
    app_handle: web::Data<tauri::AppHandle>,
) -> HttpResponse {
    if !auth_state.is_authorized(&get_web_token(&req)) {
        return HttpResponse::Unauthorized().finish();
    }

    let folder_key = path.into_inner();
    let folder_id: Option<i64> = if folder_key == "home" { None } else { folder_key.parse().ok() };

    let filename = req
        .headers()
        .get("X-Filename")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| urlencoding::decode(s).ok().map(|d| d.into_owned()))
        .unwrap_or_else(|| "upload.bin".to_string());

    // Sanitize filename
    let safe_name: String = filename.chars()
        .filter(|c| !matches!(c, '/' | '\\' | '\0'))
        .collect();
    let safe_name = if safe_name.is_empty() { "upload.bin".to_string() } else { safe_name };

    // Save to temp
    let ext = std::path::Path::new(&safe_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let tmp_name = format!("sdweb_{}_{}.{}", rand_u32(), chrono::Utc::now().timestamp_millis(), ext);
    let temp_path = std::env::temp_dir().join(&tmp_name);

    if let Err(e) = std::fs::write(&temp_path, &body) {
        return HttpResponse::InternalServerError().body(format!("Save failed: {}", e));
    }

    // Emit event to the Tauri frontend to pick up the file and queue it for upload
    let payload = serde_json::json!({
        "path": temp_path.to_string_lossy(),
        "filename": safe_name,
        "folderId": folder_id,
    });
    let _ = app_handle.get_ref().emit("web-upload-pending", payload);

    HttpResponse::Ok().json(serde_json::json!({ "status": "queued", "filename": safe_name }))
}

// ── Index JSON helpers ────────────────────────────────────────────────────────

fn read_index_folders(acct_mgr: &AccountManager) -> serde_json::Value {
    let raw = std::fs::read_to_string(acct_mgr.index_path()).unwrap_or_default();
    let data: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    data.get("folders").cloned().unwrap_or(serde_json::Value::Array(vec![]))
}

fn read_index_files(acct_mgr: &AccountManager, folder_key: &str) -> serde_json::Value {
    let raw = std::fs::read_to_string(acct_mgr.index_path()).unwrap_or_default();
    let data: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    let fmap = data.get("files_by_folder").and_then(|m| m.as_object()).cloned().unwrap_or_default();
    let entry = fmap.get(folder_key).cloned().unwrap_or_default();
    entry.get("items").cloned().unwrap_or(serde_json::Value::Array(vec![]))
}

fn parse_folder_key(key: &str) -> Option<i64> {
    if key == "home" || key == "null" || key == "me" { None } else { key.parse::<i64>().ok() }
}

fn rand_u32() -> u32 {
    use rand::Rng;
    rand::thread_rng().gen()
}

pub async fn start_server(
    state: Arc<TelegramState>,
    share_store: Arc<ShareStore>,
    web_auth: Arc<WebAuthState>,
    account_manager: Arc<AccountManager>,
    app_handle: tauri::AppHandle,
    port: u16,
    token: String,
) -> std::io::Result<actix_web::dev::Server> {
    let state_data = web::Data::new(state);
    let token_data = web::Data::new(StreamTokenData { token });
    let share_data = web::Data::new(share_store);
    let web_auth_data = web::Data::new(web_auth);
    let acct_data = web::Data::new(account_manager);
    let app_handle_data = web::Data::new(app_handle);

    log::info!("Starting Streaming + Web companion server on port {}", port);

    let server = HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("tauri://localhost")
            .allowed_origin("http://localhost:1420")
            .allowed_origin("https://tauri.localhost")
            .allowed_methods(vec!["GET", "POST"])
            .allow_any_header()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .wrap(
                DefaultHeaders::new()
                    .add(("X-Frame-Options", "SAMEORIGIN"))
                    .add(("X-Content-Type-Options", "nosniff"))
                    .add(("Referrer-Policy", "same-origin")),
            )
            .app_data(state_data.clone())
            .app_data(token_data.clone())
            .app_data(share_data.clone())
            .app_data(web_auth_data.clone())
            .app_data(acct_data.clone())
            .app_data(app_handle_data.clone())
            // Streaming
            .service(stream_media)
            // Share
            .service(share_file)
            .service(authorize_share_file)
            // Web companion
            .service(serve_web_app)
            .service(handle_web_auth)
            .service(web_api_folders)
            .service(web_api_files)
            .service(web_api_thumbnail)
            .service(web_api_stream)
            .service(web_api_upload)
    })
    .bind(("0.0.0.0", port))?
    .run();

    Ok(server)
}
