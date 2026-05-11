use actix_web::{get, web, App, HttpServer, HttpResponse, Responder, middleware::DefaultHeaders};
use actix_cors::Cors;
use crate::commands::TelegramState;
use crate::commands::utils::resolve_peer;
use crate::commands::share::ShareStore;
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

#[get("/stream/{folder_id}/{message_id}")]
async fn stream_media(
    path: web::Path<(String, i32)>,
    query: web::Query<StreamQuery>,
    data: web::Data<Arc<TelegramState>>,
    token_data: web::Data<StreamTokenData>,
) -> impl Responder {
    // Validate session token
    match &query.token {
        Some(t) if t == &token_data.token => {},
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

    let client_opt = {
        data.client.lock().await.clone()
    };

    if let Some(client) = client_opt {
        match resolve_peer(&client, folder_id).await {
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
                                
                                // Create chunk-streaming response
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
                                    .insert_header(("Content-Type", mime)) 
                                    .insert_header(("Content-Length", size.to_string()))
                                    .insert_header(("Cache-Control", "private, max-age=120"))
                                    .streaming(stream);
                            }
                        }
                        HttpResponse::NotFound().body("Message or media not found")
                    },
                    Err(e) => HttpResponse::InternalServerError().body(format!("Failed to fetch message: {}", e)),
                 }
            },
            Err(e) => HttpResponse::BadRequest().body(format!("Peer resolution failed: {}", e)),
        }
    } else {
        HttpResponse::ServiceUnavailable().body("Telegram client not connected")
    }
}

#[get("/share/{token}/{filename}")]
async fn share_file(
    path: web::Path<(String, String)>,
    data: web::Data<Arc<TelegramState>>,
    share_store: web::Data<Arc<ShareStore>>,
) -> impl Responder {
    let (token, _) = path.into_inner();
    share_store.purge_expired();
    let entry = {
        let shares = share_store.shares.lock().unwrap();
        shares.get(&token).cloned()
    };
    let entry = match entry {
        Some(e) => e,
        None => return HttpResponse::NotFound().body("Share link not found or expired"),
    };

    let client_opt = { data.client.lock().await.clone() };
    let client = match client_opt {
        Some(c) => c,
        None => return HttpResponse::ServiceUnavailable().body("Telegram client not connected"),
    };

    let peer = match resolve_peer(&client, entry.folder_id).await {
        Ok(p) => p,
        Err(e) => return HttpResponse::BadRequest().body(format!("Peer error: {}", e)),
    };

    let messages = match client.get_messages_by_id(&peer, &[entry.file_id]).await {
        Ok(m) => m,
        Err(e) => return HttpResponse::InternalServerError().body(format!("Error: {}", e)),
    };

    if let Some(Some(msg)) = messages.first() {
        if let Some(media) = msg.media() {
            let (size, mime) = match &media {
                Media::Document(d) => (d.size(), d.mime_type().unwrap_or("application/octet-stream").to_string()),
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

fn mime_type_from_media(media: &Media) -> String {
    match media {
        Media::Document(d) => d.mime_type().unwrap_or("application/octet-stream").to_string(),
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
            .allowed_methods(vec!["GET"])
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
    })
    .bind(("0.0.0.0", port))?
    .run();

    Ok(server)
}
