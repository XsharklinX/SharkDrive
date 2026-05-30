use crate::commands::share::ShareStore;
use crate::commands::utils::resolve_peer;
use crate::commands::TelegramState;
use actix_cors::Cors;
use actix_web::{
    cookie::{time::Duration as CookieDuration, Cookie, SameSite},
    get,
    http::header,
    middleware::DefaultHeaders,
    post, web, App, HttpRequest, HttpResponse, HttpServer, Responder,
};
use grammers_client::types::Media;

use std::sync::Arc;

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

pub async fn start_server(
    state: Arc<TelegramState>,
    share_store: Arc<ShareStore>,
    port: u16,
    token: String,
) -> std::io::Result<actix_web::dev::Server> {
    let state_data = web::Data::new(state);
    let token_data = web::Data::new(StreamTokenData { token });
    let share_data = web::Data::new(share_store);

    log::info!("Starting Streaming Server on port {}", port);

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
                    .add(("X-Frame-Options", "DENY"))
                    .add(("X-Content-Type-Options", "nosniff"))
                    .add(("Referrer-Policy", "no-referrer")),
            )
            .app_data(state_data.clone())
            .app_data(token_data.clone())
            .app_data(share_data.clone())
            .service(stream_media)
            .service(share_file)
            .service(authorize_share_file)
    })
    .bind(("0.0.0.0", port))?
    .run();

    Ok(server)
}
