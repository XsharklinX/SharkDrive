use crate::bandwidth::BandwidthManager;
use crate::commands::utils::resolve_peer;
use crate::models::BookCardData;
use crate::TelegramState;
use base64::{engine::general_purpose, Engine as _};
use grammers_client::types::media::Document;
use grammers_client::types::photo_sizes::PhotoSize;
use grammers_client::types::Media;
use image::ImageFormat;
use std::io::Read;
use tauri::Manager;
use tauri::State;
use zip::ZipArchive;

const PREVIEW_CACHE_MAX_FILES: usize = 30;
const PREVIEW_CACHE_MAX_TOTAL_BYTES: u64 = 80 * 1024 * 1024;

fn prune_preview_cache(cache_dir: &std::path::Path) {
    let read_dir = match std::fs::read_dir(cache_dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut files: Vec<(std::path::PathBuf, std::time::SystemTime, u64)> = Vec::new();
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            files.push((path, modified, meta.len()));
        }
    }
    files.sort_by_key(|(_, modified, _)| *modified);
    let mut total_bytes: u64 = files.iter().map(|(_, _, len)| *len).sum();
    while files.len() > PREVIEW_CACHE_MAX_FILES || total_bytes > PREVIEW_CACHE_MAX_TOTAL_BYTES {
        if let Some((path, _, len)) = files.first().cloned() {
            let _ = std::fs::remove_file(&path);
            total_bytes = total_bytes.saturating_sub(len);
            files.remove(0);
        } else {
            break;
        }
    }
}

#[tauri::command]
pub async fn cmd_get_preview(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
) -> Result<String, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }
    prune_preview_cache(&cache_dir);
    log::info!("Using preview cache dir: {:?}", cache_dir);
    log::info!("Preview Request: msg_id={}", message_id);
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Ok("".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;
    let target_message = messages.into_iter().flatten().next();

    if let Some(msg) = target_message {
        if let Some(media) = msg.media() {
            let ext = match &media {
                Media::Document(d) => {
                    let mut e = std::path::Path::new(d.name())
                        .extension()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if e.is_empty() {
                        if let Some(mime) = d.mime_type() {
                            e = match mime {
                                "image/jpeg" => "jpg".to_string(),
                                "image/png" => "png".to_string(),
                                "video/mp4" => "mp4".to_string(),
                                _ => "bin".to_string(),
                            };
                        } else {
                            e = "bin".to_string();
                        }
                    }
                    e
                }
                Media::Photo(_) => "jpg".to_string(),
                _ => "bin".to_string(),
            };
            let folder_key = folder_cache_key(folder_id);
            let save_path = cache_dir.join(format!("{}_{}.{}", folder_key, message_id, ext));
            let save_path_str = save_path.to_string_lossy().to_string();

            let file_ready = if save_path.exists() {
                log::info!("File ({}) exists in cache.", message_id);
                true
            } else {
                let size = match &media {
                    Media::Document(d) => d.size() as u64,
                    Media::Photo(_) => 1024 * 1024,
                    _ => 0,
                };
                log::info!("Downloading preview... Size: {}", size);
                if let Err(e) = bw_state.can_transfer(size) {
                    log::warn!("Bandwidth limit hit for preview: {}", e);
                    false
                } else {
                    match client.download_media(&media, &save_path_str).await {
                        Ok(_) => {
                            log::info!("Preview download complete.");
                            bw_state.add_down(size);
                            prune_preview_cache(&cache_dir);
                            true
                        }
                        Err(e) => {
                            log::error!("Preview Download Error: {}", e);
                            false
                        }
                    }
                }
            };
            if file_ready {
                let lower_ext = ext.to_lowercase();
                if ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].contains(&lower_ext.as_str())
                {
                    log::info!("Converting image to Base64...");
                    match std::fs::read(&save_path) {
                        Ok(bytes) => {
                            let b64 = general_purpose::STANDARD.encode(&bytes);
                            let mime = match lower_ext.as_str() {
                                "png" => "image/png",
                                "gif" => "image/gif",
                                "webp" => "image/webp",
                                "bmp" => "image/bmp",
                                "svg" => "image/svg+xml",
                                _ => "image/jpeg",
                            };
                            return Ok(format!("data:{};base64,{}", mime, b64));
                        }
                        Err(e) => {
                            log::error!("Failed to read file for base64: {}", e);
                            return Ok(save_path_str);
                        }
                    }
                }
                log::info!("Returning path preview: {}", save_path_str);
                return Ok(save_path_str);
            }
        }
    }
    Err("File not found or failed to download".to_string())
}

#[tauri::command]
pub async fn cmd_clean_cache(app_handle: tauri::AppHandle) -> Result<(), String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("previews");
    if cache_dir.exists() {
        let _ = std::fs::remove_dir_all(&cache_dir);
    }

    let thumbnail_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("thumbnails");
    if thumbnail_dir.exists() {
        let _ = std::fs::remove_dir_all(thumbnail_dir);
    }
    let book_card_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("book_cards");
    if book_card_dir.exists() {
        let _ = std::fs::remove_dir_all(book_card_dir);
    }
    Ok(())
}

fn resize_image_thumbnail(
    input_path: &std::path::Path,
    output_path: &std::path::Path,
) -> Result<(), String> {
    let image =
        image::open(input_path).map_err(|e| format!("Failed to decode image thumbnail: {}", e))?;
    let thumbnail = image.thumbnail(320, 320);
    let mut output = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create thumbnail: {}", e))?;
    thumbnail
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))
}

fn resize_cover_thumbnail_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory(bytes)
        .map_err(|e| format!("Failed to decode book cover: {}", e))?;
    let thumbnail = image.thumbnail(320, 460);
    let mut cursor = std::io::Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode book cover thumbnail: {}", e))?;
    Ok(cursor.into_inner())
}

fn normalize_zip_path(base_path: &str, href: &str) -> String {
    let href = href.split('#').next().unwrap_or(href);
    let base = std::path::Path::new(base_path);
    let parent = base.parent().unwrap_or_else(|| std::path::Path::new(""));
    parent
        .join(href)
        .components()
        .fold(std::path::PathBuf::new(), |mut acc, component| {
            match component {
                std::path::Component::CurDir => {}
                std::path::Component::ParentDir => {
                    acc.pop();
                }
                other => acc.push(other.as_os_str()),
            }
            acc
        })
        .to_string_lossy()
        .replace('\\', "/")
}

fn read_zip_entry_string(
    archive: &mut ZipArchive<std::fs::File>,
    name: &str,
) -> Result<String, String> {
    let mut file = archive
        .by_name(name)
        .map_err(|e| format!("Missing EPUB entry {name}: {e}"))?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .map_err(|e| format!("Failed to read EPUB text entry {name}: {e}"))?;
    Ok(text)
}

fn read_zip_entry_bytes(
    archive: &mut ZipArchive<std::fs::File>,
    name: &str,
) -> Result<Vec<u8>, String> {
    let mut file = archive
        .by_name(name)
        .map_err(|e| format!("Missing EPUB asset {name}: {e}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("Failed to read EPUB asset {name}: {e}"))?;
    Ok(bytes)
}

fn extract_epub_card_data(
    epub_path: &std::path::Path,
) -> Result<(Option<String>, Option<String>, Option<Vec<u8>>), String> {
    let file = std::fs::File::open(epub_path).map_err(|e| format!("Failed to open EPUB: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to open EPUB archive: {}", e))?;

    let container_xml = read_zip_entry_string(&mut archive, "META-INF/container.xml")?;
    let container_doc = roxmltree::Document::parse(&container_xml)
        .map_err(|e| format!("Failed to parse EPUB container: {}", e))?;
    let opf_path = container_doc
        .descendants()
        .find(|node| node.has_tag_name("rootfile"))
        .and_then(|node| node.attribute("full-path"))
        .ok_or("EPUB missing package path".to_string())?
        .to_string();

    let opf_xml = read_zip_entry_string(&mut archive, &opf_path)?;
    let opf_doc = roxmltree::Document::parse(&opf_xml)
        .map_err(|e| format!("Failed to parse EPUB package: {}", e))?;

    let title = opf_doc
        .descendants()
        .find(|node| node.tag_name().name() == "title")
        .and_then(|node| node.text())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());

    let author = opf_doc
        .descendants()
        .find(|node| node.tag_name().name() == "creator")
        .and_then(|node| node.text())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());

    let cover_href = opf_doc
        .descendants()
        .find(|node| {
            node.has_tag_name("item")
                && node
                    .attribute("properties")
                    .map(|value| value.split_whitespace().any(|item| item == "cover-image"))
                    .unwrap_or(false)
        })
        .and_then(|node| node.attribute("href"))
        .map(|href| href.to_string())
        .or_else(|| {
            let cover_id = opf_doc
                .descendants()
                .find(|node| node.has_tag_name("meta") && node.attribute("name") == Some("cover"))
                .and_then(|node| node.attribute("content"))?;

            opf_doc
                .descendants()
                .find(|node| node.has_tag_name("item") && node.attribute("id") == Some(cover_id))
                .and_then(|node| node.attribute("href"))
                .map(|href| href.to_string())
        })
        .or_else(|| {
            opf_doc
                .descendants()
                .find(|node| {
                    node.has_tag_name("item")
                        && node
                            .attribute("id")
                            .map(|id| id.to_lowercase().contains("cover"))
                            .unwrap_or(false)
                })
                .and_then(|node| node.attribute("href"))
                .map(|href| href.to_string())
        })
        .or_else(|| {
            opf_doc
                .descendants()
                .find(|node| {
                    node.has_tag_name("item")
                        && node
                            .attribute("href")
                            .map(|href| href.to_lowercase().contains("cover"))
                            .unwrap_or(false)
                })
                .and_then(|node| node.attribute("href"))
                .map(|href| href.to_string())
        })
        .or_else(|| {
            opf_doc
                .descendants()
                .find(|node| {
                    node.has_tag_name("item")
                        && node
                            .attribute("media-type")
                            .map(|value| value.starts_with("image/"))
                            .unwrap_or(false)
                })
                .and_then(|node| node.attribute("href"))
                .map(|href| href.to_string())
        });

    let cover_bytes = cover_href
        .map(|href| normalize_zip_path(&opf_path, &href))
        .and_then(|cover_path| read_zip_entry_bytes(&mut archive, &cover_path).ok());

    Ok((title, author, cover_bytes))
}

fn encode_png_data_url(bytes: &[u8]) -> String {
    let b64 = general_purpose::STANDARD.encode(bytes);
    format!("data:image/png;base64,{b64}")
}

async fn try_download_document_thumb(
    client: &grammers_client::Client,
    document: &Document,
    target_path: &std::path::Path,
) -> Result<bool, String> {
    let thumb = document
        .thumbs()
        .into_iter()
        .max_by_key(|thumb: &PhotoSize| thumb.size());

    if let Some(thumb) = thumb {
        let target = target_path.to_string_lossy().to_string();
        client
            .download_media(&thumb, &target)
            .await
            .map_err(|e| format!("Failed to download document thumbnail: {}", e))?;
        return Ok(true);
    }

    Ok(false)
}

/// Get a small thumbnail for inline display in file cards.
/// Returns base64 data URL for images, empty string for non-image files.
/// Uses same cache as cmd_get_preview for consistency.
#[tauri::command]
pub async fn cmd_get_thumbnail(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    // Check if thumbnail already in cache
    let cache_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("thumbnails");
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }

    let folder_key = folder_cache_key(folder_id);
    let cache_prefix = format!("{}_{}.", folder_key, message_id);

    // Check for any cached thumbnail for this message
    // Look for existing cached file
    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&cache_prefix) {
                // Found cached thumbnail, return as base64
                if let Ok(bytes) = std::fs::read(entry.path()) {
                    let ext = name.rsplit('.').next().unwrap_or("jpg");
                    let mime = match ext {
                        "png" => "image/png",
                        "gif" => "image/gif",
                        "webp" => "image/webp",
                        _ => "image/jpeg",
                    };
                    let b64 = general_purpose::STANDARD.encode(&bytes);
                    return Ok(format!("data:{};base64,{}", mime, b64));
                }
            }
        }
    }

    // No cache, need to fetch from Telegram
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Ok("".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;
    if let Some(m) = messages.into_iter().flatten().next() {
        if let Some(media) = m.media() {
            // Only get thumbnails for photos and media documents with embedded thumbs.
            let fallback_mime = match &media {
                Media::Photo(_) => "image/jpeg",
                Media::Document(d) => {
                    let mime = d.mime_type().unwrap_or("");
                    if mime.starts_with("image/") || mime.starts_with("video/") {
                        mime
                    } else {
                        // Not visual media, return empty - FileCard will show icon.
                        return Ok("".to_string());
                    }
                }
                _ => "",
            };

            if !fallback_mime.is_empty() {
                let save_path = cache_dir.join(format!("{}_{}.png", folder_key, message_id));
                let temp_path = cache_dir.join(format!("{}_{}.orig", folder_key, message_id));
                let temp_path_str = temp_path.to_string_lossy().to_string();

                let download_ok = match &media {
                    Media::Document(d) if fallback_mime.starts_with("video/") => {
                        try_download_document_thumb(&client, d, &temp_path).await?
                    }
                    Media::Document(d) if fallback_mime.starts_with("image/") => {
                        if try_download_document_thumb(&client, d, &temp_path).await? {
                            true
                        } else {
                            client.download_media(&media, &temp_path_str).await.is_ok()
                        }
                    }
                    _ => client.download_media(&media, &temp_path_str).await.is_ok(),
                };

                if download_ok {
                    let _ = resize_image_thumbnail(&temp_path, &save_path);
                    let final_path = if save_path.exists() {
                        &save_path
                    } else {
                        &temp_path
                    };
                    if let Ok(bytes) = std::fs::read(final_path) {
                        let _ = std::fs::remove_file(&temp_path);
                        let mime = if final_path == &save_path {
                            "image/png"
                        } else {
                            fallback_mime
                        };
                        let b64 = general_purpose::STANDARD.encode(&bytes);
                        return Ok(format!("data:{};base64,{}", mime, b64));
                    }
                }
            }
        }
    }

    Ok("".to_string())
}

#[tauri::command]
pub async fn cmd_get_book_card_data(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<BookCardData, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?
        .join("book_cards");
    if !cache_dir.exists() {
        let _ = std::fs::create_dir_all(&cache_dir);
    }

    let folder_key = folder_cache_key(folder_id);
    let meta_path = cache_dir.join(format!("{}_{}.json", folder_key, message_id));
    if meta_path.exists() {
        let cached = std::fs::read_to_string(&meta_path)
            .map_err(|e| format!("Failed to read cached book data: {}", e))?;
        let data = serde_json::from_str::<BookCardData>(&cached)
            .map_err(|e| format!("Failed to parse cached book data: {}", e))?;
        if data.thumbnail.is_some() || data.title.is_some() || data.author.is_some() {
            return Ok(data);
        }
    }

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, folder_id).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;
    let message = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or("Book message not found".to_string())?;
    let media = message.media().ok_or("Message has no media".to_string())?;

    let document = match media {
        Media::Document(ref document) => document,
        _ => return Ok(BookCardData::default()),
    };

    if !document.name().to_lowercase().ends_with(".epub") {
        return Ok(BookCardData::default());
    }

    let temp_path = cache_dir.join(format!("{}_{}.epub", folder_key, message_id));
    let temp_path_str = temp_path.to_string_lossy().to_string();
    client
        .download_media(&media, &temp_path_str)
        .await
        .map_err(|e| format!("Failed to download EPUB for metadata: {}", e))?;

    let (title, author, cover_bytes) = extract_epub_card_data(&temp_path)?;
    let _ = std::fs::remove_file(&temp_path);

    let thumbnail = cover_bytes
        .and_then(|bytes| resize_cover_thumbnail_bytes(&bytes).ok())
        .map(|bytes| encode_png_data_url(&bytes));

    let data = BookCardData {
        title,
        author,
        thumbnail,
    };

    let serialized =
        serde_json::to_string(&data).map_err(|e| format!("Failed to cache book data: {}", e))?;
    let _ = std::fs::write(&meta_path, serialized);

    Ok(data)
}

fn folder_cache_key(folder_id: Option<i64>) -> String {
    folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string())
}
