use crate::bandwidth::BandwidthManager;
use crate::commands::encryption::{decrypt_file, derive_folder_key, EncryptionState};
use crate::commands::fs::caption::{display_name_from_metadata, parse_caption_metadata};
use crate::commands::utils::resolve_peer;
use crate::models::BookCardData;
use crate::performance::PerformanceMetrics;
use crate::TelegramState;
use base64::{engine::general_purpose, Engine as _};
use grammers_client::types::media::Document;
use grammers_client::types::photo_sizes::PhotoSize;
use grammers_client::types::Media;
use image::ImageFormat;
use std::io::Read;
use std::process::Command;
use tauri::Manager;
use tauri::State;
use zip::ZipArchive;

const PREVIEW_CACHE_MAX_FILES: usize = 30;
const PREVIEW_CACHE_MAX_TOTAL_BYTES: u64 = 80 * 1024 * 1024;
const VIDEO_THUMB_MAX_BYTES: i64 = 120 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStats {
    pub preview_files: usize,
    pub preview_bytes: u64,
    pub thumbnail_files: usize,
    pub thumbnail_bytes: u64,
    pub book_card_files: usize,
    pub book_card_bytes: u64,
}

fn directory_stats(path: &std::path::Path) -> (usize, u64) {
    let mut files = 0usize;
    let mut bytes = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    files += 1;
                    bytes += meta.len();
                }
            }
        }
    }
    (files, bytes)
}

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

fn decrypt_cached_media(
    metadata: &crate::commands::fs::caption::CaptionMetadata,
    folder_id: Option<i64>,
    enc_state: &EncryptionState,
    encrypted_path: &std::path::Path,
    decrypted_path: &std::path::Path,
) -> Result<(), String> {
    let master = enc_state
        .active_key(metadata.encryption_version)?
        .ok_or("This file is encrypted. Unlock the vault before previewing it.".to_string())?;
    let key = folder_id
        .map(|id| derive_folder_key(&master, id))
        .unwrap_or(master);
    decrypt_file(
        &key,
        &encrypted_path.to_string_lossy(),
        &decrypted_path.to_string_lossy(),
    )
}

#[tauri::command]
pub async fn cmd_get_preview(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
    enc_state: State<'_, EncryptionState>,
    metrics: State<'_, PerformanceMetrics>,
) -> Result<String, String> {
    let started = std::time::Instant::now();
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

    let peer = resolve_peer(&client, folder_id, &state).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;
    let target_message = messages.into_iter().flatten().next();

    if let Some(msg) = target_message {
        if let Some(media) = msg.media() {
            let ext = match &media {
                Media::Document(d) => {
                    let display_name =
                        display_name_from_metadata(d.name().to_string(), msg.text()).0;
                    let mut e = std::path::Path::new(&display_name)
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
            let metadata = parse_caption_metadata(msg.text());
            let encrypted_path = cache_dir.join(format!("{}_{}.encrypted", folder_key, message_id));
            let download_path = if metadata.encrypted {
                encrypted_path.to_string_lossy().to_string()
            } else {
                save_path_str.clone()
            };

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
                    return Err(format!("Bandwidth limit reached: {}", e));
                }
                match tokio::time::timeout(
                    std::time::Duration::from_secs(60),
                    client.download_media(&media, &download_path),
                )
                .await
                {
                    Ok(Ok(_)) => {
                        if metadata.encrypted {
                            decrypt_cached_media(
                                &metadata,
                                folder_id,
                                &enc_state,
                                &encrypted_path,
                                &save_path,
                            )?;
                            let _ = std::fs::remove_file(&encrypted_path);
                        }
                        log::info!("Preview download complete.");
                        bw_state.add_down(size);
                        prune_preview_cache(&cache_dir);
                        true
                    }
                    Ok(Err(e)) => {
                        log::error!("Preview Download Error: {}", e);
                        return Err(format!("Download failed: {}", e));
                    }
                    Err(_) => {
                        log::warn!("Preview download timed out for msg_id={}", message_id);
                        return Err(
                            "Preview download timed out (60 s). Check your connection and retry."
                                .to_string(),
                        );
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
                metrics.record(
                    "preview.get_preview",
                    started.elapsed().as_millis(),
                    true,
                    Some(1),
                    None,
                    Some(if save_path.exists() { "cache_or_download" } else { "telegram" }),
                );
                return Ok(save_path_str);
            }
        }
    }
    metrics.record(
        "preview.get_preview",
        started.elapsed().as_millis(),
        false,
        None,
        None,
        Some("telegram"),
    );
    Err("File or media not found in Telegram".to_string())
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
    let thumbnail = image.thumbnail(640, 420);
    let mut output = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create thumbnail: {}", e))?;
    thumbnail
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))
}

fn resize_cover_thumbnail_bytes(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory(bytes)
        .map_err(|e| format!("Failed to decode book cover: {}", e))?;
    let thumbnail = image.thumbnail(420, 560);
    let mut cursor = std::io::Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode book cover thumbnail: {}", e))?;
    Ok(cursor.into_inner())
}

fn run_ffmpeg_video_thumbnail(
    input_path: &std::path::Path,
    output_path: &std::path::Path,
) -> Result<(), String> {
    let mut command = Command::new("ffmpeg");
    command
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-y")
        .arg("-ss")
        .arg("00:00:01")
        .arg("-i")
        .arg(input_path)
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg("scale=640:-2:force_original_aspect_ratio=decrease")
        .arg(output_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let output = command
        .output()
        .map_err(|e| format!("ffmpeg is not available: {}", e))?;

    if output.status.success() && output_path.exists() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "ffmpeg thumbnail extraction failed: {}",
        stderr.trim()
    ))
}

async fn download_media_to_path(
    client: &grammers_client::Client,
    media: &Media,
    target_path: &std::path::Path,
) -> Result<(), String> {
    let target = target_path.to_string_lossy().to_string();
    client
        .download_media(media, &target)
        .await
        .map_err(|e| format!("Failed to download media: {}", e))
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
    enc_state: State<'_, EncryptionState>,
    metrics: State<'_, PerformanceMetrics>,
) -> Result<String, String> {
    let started = std::time::Instant::now();
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

    // O(1) direct path check — resized thumbnails are always stored as .png
    let cached_path = cache_dir.join(format!("{}_{}.png", folder_key, message_id));
    if cached_path.exists() {
        if let Ok(bytes) = std::fs::read(&cached_path) {
            let b64 = general_purpose::STANDARD.encode(&bytes);
            metrics.record(
                "preview.get_thumbnail",
                started.elapsed().as_millis(),
                true,
                Some(1),
                Some(bytes.len() as u64),
                Some("cache"),
            );
            return Ok(format!("data:image/png;base64,{}", b64));
        }
    }

    // No cache — fetch from Telegram
    let client_opt = { state.client.lock().await.clone() };
    if client_opt.is_none() {
        return Ok("".to_string());
    }
    let client = client_opt.unwrap();

    let peer = resolve_peer(&client, folder_id, &state).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;

    if let Some(m) = messages.into_iter().flatten().next() {
        if let Some(media) = m.media() {
            let raw_name = match &media {
                Media::Document(document) => document.name().to_string(),
                Media::Photo(_) => "Photo.jpg".to_string(),
                _ => String::new(),
            };
            let (display_name, metadata) = display_name_from_metadata(raw_name, m.text());
            let display_name = display_name.to_lowercase();
            let is_image = match &media {
                Media::Photo(_) => true,
                Media::Document(d) => d
                    .mime_type()
                    .map(|m| m.starts_with("image/"))
                    .unwrap_or(false),
                _ => false,
            } || [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]
                .iter()
                .any(|extension| display_name.ends_with(extension));
            let is_video = match &media {
                Media::Document(d) => d
                    .mime_type()
                    .map(|m| m.starts_with("video/"))
                    .unwrap_or(false),
                _ => false,
            } || [".mp4", ".webm", ".mov", ".mkv", ".avi"]
                .iter()
                .any(|extension| display_name.ends_with(extension));

            if !is_image && !is_video {
                return Ok("".to_string());
            }
            if metadata.encrypted {
                let within_thumbnail_limit = match &media {
                    Media::Document(document) if is_video => {
                        (document.size() as i64) <= VIDEO_THUMB_MAX_BYTES
                    }
                    Media::Document(document) if is_image => document.size() <= 20 * 1024 * 1024,
                    _ => true,
                };
                if !within_thumbnail_limit {
                    return Ok("".to_string());
                }
            }

            let save_path = cache_dir.join(format!("{}_{}.png", folder_key, message_id));
            let temp_path = cache_dir.join(format!("{}_{}.orig", folder_key, message_id));

            let download_ok = if metadata.encrypted {
                let encrypted_temp_path =
                    cache_dir.join(format!("{}_{}.encrypted", folder_key, message_id));
                let encrypted_temp = encrypted_temp_path.to_string_lossy().to_string();
                let downloaded = client.download_media(&media, &encrypted_temp).await.is_ok();
                if downloaded {
                    decrypt_cached_media(
                        &metadata,
                        folder_id,
                        &enc_state,
                        &encrypted_temp_path,
                        &temp_path,
                    )?;
                }
                let _ = std::fs::remove_file(encrypted_temp_path);
                if downloaded && is_video {
                    let extracted = run_ffmpeg_video_thumbnail(&temp_path, &save_path).is_ok();
                    let _ = std::fs::remove_file(&temp_path);
                    if extracted {
                        if let Ok(bytes) = std::fs::read(&save_path) {
                            return Ok(format!(
                                "data:image/png;base64,{}",
                                general_purpose::STANDARD.encode(bytes)
                            ));
                        }
                    }
                    false
                } else {
                    downloaded
                }
            } else {
                match &media {
                    Media::Document(d) if is_video => {
                        // Prefer Telegram's embedded thumbnail; use ffmpeg as a bounded fallback.
                        let has_thumb = match tokio::time::timeout(
                            std::time::Duration::from_secs(5),
                            try_download_document_thumb(&client, d, &temp_path),
                        )
                        .await
                        {
                            Ok(Ok(found)) => found,
                            _ => false,
                        };
                        if has_thumb {
                            true
                        } else if (d.size() as i64) <= VIDEO_THUMB_MAX_BYTES {
                            let video_path =
                                cache_dir.join(format!("{}_{}.video", folder_key, message_id));
                            let downloaded = tokio::time::timeout(
                                std::time::Duration::from_secs(90),
                                download_media_to_path(&client, &media, &video_path),
                            )
                            .await;
                            let extracted = matches!(downloaded, Ok(Ok(())))
                                && run_ffmpeg_video_thumbnail(&video_path, &save_path).is_ok();
                            let _ = std::fs::remove_file(&video_path);
                            if extracted {
                                if let Ok(bytes) = std::fs::read(&save_path) {
                                    return Ok(format!(
                                        "data:image/png;base64,{}",
                                        general_purpose::STANDARD.encode(bytes)
                                    ));
                                }
                            }
                            false
                        } else {
                            false
                        }
                    }
                    Media::Document(d) if is_image => {
                        // Try embedded thumb first (fast), fall back to full download (small images)
                        let has_thumb = match tokio::time::timeout(
                            std::time::Duration::from_secs(5),
                            try_download_document_thumb(&client, d, &temp_path),
                        )
                        .await
                        {
                            Ok(Ok(v)) => v,
                            _ => false,
                        };
                        if has_thumb {
                            true
                        } else if d.size() <= 5 * 1024 * 1024 {
                            // Full download only for images ≤ 5 MB
                            let path_str = temp_path.to_string_lossy().to_string();
                            client.download_media(&media, &path_str).await.is_ok()
                        } else {
                            false
                        }
                    }
                    // Photo
                    _ => {
                        let path_str = temp_path.to_string_lossy().to_string();
                        client.download_media(&media, &path_str).await.is_ok()
                    }
                }
            };

            if download_ok {
                let _ = resize_image_thumbnail(&temp_path, &save_path);
                let (read_path, mime) = if save_path.exists() {
                    (&save_path, "image/png")
                } else {
                    (&temp_path, "image/jpeg")
                };
                if let Ok(bytes) = std::fs::read(read_path) {
                    let _ = std::fs::remove_file(&temp_path);
                    let b64 = general_purpose::STANDARD.encode(&bytes);
                    return Ok(format!("data:{};base64,{}", mime, b64));
                }
            }
        }
    }

    metrics.record(
        "preview.get_thumbnail",
        started.elapsed().as_millis(),
        false,
        None,
        None,
        Some("telegram_or_generated"),
    );
    Ok("".to_string())
}

#[tauri::command]
pub fn cmd_get_cache_stats(app_handle: tauri::AppHandle) -> Result<CacheStats, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    let (preview_files, preview_bytes) = directory_stats(&cache_dir.join("previews"));
    let (thumbnail_files, thumbnail_bytes) = directory_stats(&data_dir.join("thumbnails"));
    let (book_card_files, book_card_bytes) = directory_stats(&cache_dir.join("book_cards"));

    Ok(CacheStats {
        preview_files,
        preview_bytes,
        thumbnail_files,
        thumbnail_bytes,
        book_card_files,
        book_card_bytes,
    })
}

#[tauri::command]
pub async fn cmd_index_pdf_text(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    enc_state: State<'_, EncryptionState>,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;
    let text_dir = app_data_dir.join("pdf_text_index");
    let source_dir = app_data_dir.join("pdf_sources");
    let _ = std::fs::create_dir_all(&text_dir);
    let _ = std::fs::create_dir_all(&source_dir);

    let folder_key = folder_cache_key(folder_id);
    let text_path = text_dir.join(format!("{}_{}.txt", folder_key, message_id));
    if text_path.exists() {
        return std::fs::read_to_string(&text_path)
            .map_err(|e| format!("Failed to read cached PDF text: {}", e));
    }

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, folder_id, &state).await?;
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;
    let message = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or("PDF message not found".to_string())?;
    let media = message.media().ok_or("Message has no media".to_string())?;
    let metadata = parse_caption_metadata(message.text());
    let display_name = match &media {
        Media::Document(document) => {
            display_name_from_metadata(document.name().to_string(), message.text()).0
        }
        _ => String::new(),
    };

    let is_pdf = match &media {
        Media::Document(document) => {
            document
                .mime_type()
                .map(|mime| mime.eq_ignore_ascii_case("application/pdf"))
                .unwrap_or(false)
                || display_name.to_lowercase().ends_with(".pdf")
        }
        _ => false,
    };

    if !is_pdf {
        return Err("Selected file is not a PDF".to_string());
    }

    let source_path = source_dir.join(format!("{}_{}.pdf", folder_key, message_id));
    if !source_path.exists() {
        if metadata.encrypted {
            let encrypted_path =
                source_dir.join(format!("{}_{}.encrypted", folder_key, message_id));
            download_media_to_path(&client, &media, &encrypted_path).await?;
            decrypt_cached_media(
                &metadata,
                folder_id,
                &enc_state,
                &encrypted_path,
                &source_path,
            )?;
            let _ = std::fs::remove_file(encrypted_path);
        } else {
            download_media_to_path(&client, &media, &source_path).await?;
        }
    }

    let extract_path = source_path.clone();
    let text = tokio::task::spawn_blocking(move || {
        pdf_extract::extract_text(&extract_path)
            .map_err(|e| format!("Failed to extract PDF text: {}", e))
    })
    .await
    .map_err(|e| format!("PDF text worker failed: {}", e))??;

    let normalized = text.trim().to_string();
    let _ = std::fs::write(&text_path, &normalized);
    Ok(normalized)
}

#[tauri::command]
pub async fn cmd_get_book_card_data(
    message_id: i32,
    folder_id: Option<i64>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    enc_state: State<'_, EncryptionState>,
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
    let peer = resolve_peer(&client, folder_id, &state).await?;
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

    let (display_name, metadata) =
        display_name_from_metadata(document.name().to_string(), message.text());
    if !display_name.to_lowercase().ends_with(".epub") {
        return Ok(BookCardData::default());
    }

    let temp_path = cache_dir.join(format!("{}_{}.epub", folder_key, message_id));
    if metadata.encrypted {
        let encrypted_path = cache_dir.join(format!("{}_{}.encrypted", folder_key, message_id));
        download_media_to_path(&client, &media, &encrypted_path).await?;
        decrypt_cached_media(
            &metadata,
            folder_id,
            &enc_state,
            &encrypted_path,
            &temp_path,
        )?;
        let _ = std::fs::remove_file(encrypted_path);
    } else {
        download_media_to_path(&client, &media, &temp_path).await?;
    }

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

/// Resize and compress a local image file.
/// Returns the path to the compressed file (a temp file the caller must clean up).
/// `quality` is 1–100 for JPEG; for PNG the image is losslessly resized only.
/// `max_dimension` caps the largest side in pixels (0 = no resize, only re-encode).
#[tauri::command]
pub fn cmd_compress_image(
    path: String,
    quality: u8,
    max_dimension: u32,
) -> Result<String, String> {
    let src = std::path::Path::new(&path);
    let img = image::open(src).map_err(|e| format!("Cannot open image: {}", e))?;

    let img = if max_dimension > 0 {
        let (w, h) = (img.width(), img.height());
        if w > max_dimension || h > max_dimension {
            img.thumbnail(max_dimension, max_dimension)
        } else {
            img
        }
    } else {
        img
    };

    // Determine output format from extension; default to JPEG for compression
    let lower = path.to_lowercase();
    let is_png = lower.ends_with(".png");
    let ext = if is_png { "png" } else { "jpg" };

    let temp_path = std::env::temp_dir().join(format!(
        "sharkdrive_compressed_{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        ext
    ));

    if is_png {
        img.save_with_format(&temp_path, ImageFormat::Png)
            .map_err(|e| format!("PNG save failed: {}", e))?;
    } else {
        let mut output = std::fs::File::create(&temp_path)
            .map_err(|e| format!("Cannot create temp file: {}", e))?;
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality);
        img.write_with_encoder(encoder)
            .map_err(|e| format!("JPEG encode failed: {}", e))?;
    }

    Ok(temp_path.to_string_lossy().to_string())
}

fn folder_cache_key(folder_id: Option<i64>) -> String {
    folder_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "home".to_string())
}
