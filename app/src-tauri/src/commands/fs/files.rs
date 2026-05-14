use grammers_client::types::Media;
use grammers_tl_types as tl;
use tauri::State;

use crate::commands::fs::caption::{
    build_caption, display_name_from_metadata, parse_caption_metadata,
};
use crate::commands::utils::{map_error, resolve_peer};
use crate::models::FileMetadata;
use crate::TelegramState;

#[derive(Default)]
struct SearchFilters {
    text: Vec<String>,
    file_type: Option<String>,
    ext: Option<String>,
    encrypted: Option<bool>,
    folder: Option<String>,
    min_bytes: Option<u64>,
    max_bytes: Option<u64>,
}

fn parse_byte_value(input: &str) -> Option<u64> {
    let lower = input.trim().to_lowercase();
    let mut number = String::new();
    let mut unit = String::new();

    for ch in lower.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            number.push(ch);
        } else {
            unit.push(ch);
        }
    }

    let value = number.parse::<f64>().ok()?;
    let multiplier = match unit.as_str() {
        "" | "b" => 1_f64,
        "kb" => 1024_f64,
        "mb" => 1024_f64.powi(2),
        "gb" => 1024_f64.powi(3),
        "tb" => 1024_f64.powi(4),
        _ => return None,
    };

    Some((value * multiplier).round() as u64)
}

fn parse_search_filters(query: &str) -> SearchFilters {
    let mut filters = SearchFilters::default();

    for token in query.split_whitespace() {
        let lower = token.trim().to_lowercase();
        if lower.is_empty() {
            continue;
        }

        if let Some(value) = lower.strip_prefix("type:") {
            filters.file_type = Some(value.to_string());
            continue;
        }

        if let Some(value) = lower.strip_prefix("ext:") {
            filters.ext = Some(value.trim_start_matches('.').to_string());
            continue;
        }

        if let Some(value) = lower
            .strip_prefix("encrypted:")
            .or_else(|| lower.strip_prefix("enc:"))
        {
            filters.encrypted = Some(matches!(value, "1" | "true" | "yes" | "y" | "on"));
            continue;
        }

        if let Some(value) = lower.strip_prefix("folder:") {
            filters.folder = Some(value.to_string());
            continue;
        }

        if let Some(value) = lower.strip_prefix("min:") {
            filters.min_bytes = parse_byte_value(value);
            continue;
        }

        if let Some(value) = lower.strip_prefix("max:") {
            filters.max_bytes = parse_byte_value(value);
            continue;
        }

        filters.text.push(lower);
    }

    filters
}

fn matches_type(name: &str, file_type: Option<&str>) -> bool {
    let lower = name.to_lowercase();
    match file_type {
        None | Some("all") => true,
        Some("image") => [
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif",
        ]
        .iter()
        .any(|ext| lower.ends_with(ext)),
        Some("video") => [".mp4", ".webm", ".ogg", ".mov", ".mkv", ".avi"]
            .iter()
            .any(|ext| lower.ends_with(ext)),
        Some("audio") => [".mp3", ".wav", ".aac", ".flac", ".m4a", ".opus"]
            .iter()
            .any(|ext| lower.ends_with(ext)),
        Some("doc") => [
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".csv",
            ".rtf", ".epub",
        ]
        .iter()
        .any(|ext| lower.ends_with(ext)),
        Some("media") => [
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif", ".mp4",
            ".webm", ".ogg", ".mov", ".mkv", ".avi", ".mp3", ".wav", ".aac", ".flac", ".m4a",
            ".opus",
        ]
        .iter()
        .any(|ext| lower.ends_with(ext)),
        Some("other") => {
            !matches_type(name, Some("image"))
                && !matches_type(name, Some("video"))
                && !matches_type(name, Some("audio"))
                && !lower.ends_with(".pdf")
        }
        Some(_) => true,
    }
}

fn build_file_metadata(
    message_id: i32,
    folder_id: Option<i64>,
    raw_name: String,
    size: u64,
    mime_type: Option<String>,
    created_at: String,
    msg_text: &str,
) -> FileMetadata {
    let (name, metadata) = display_name_from_metadata(raw_name, msg_text);
    let file_ext = std::path::Path::new(&name)
        .extension()
        .map(|os| os.to_str().unwrap_or("").to_string());

    FileMetadata {
        id: message_id as i64,
        folder_id,
        name,
        size: metadata.original_size.unwrap_or(size),
        mime_type,
        file_ext,
        created_at,
        icon_type: "file".into(),
        is_encrypted: metadata.encrypted,
    }
}

fn message_to_file_metadata(
    msg: &grammers_client::types::Message,
    folder_id: Option<i64>,
) -> Option<FileMetadata> {
    let media = msg.media()?;
    let (raw_name, size, mime) = match media {
        Media::Document(d) => (
            d.name().to_string(),
            d.size() as u64,
            d.mime_type().map(|value| value.to_string()),
        ),
        Media::Photo(_) => ("Photo.jpg".to_string(), 0, Some("image/jpeg".to_string())),
        _ => return None,
    };

    Some(build_file_metadata(
        msg.id(),
        folder_id,
        raw_name,
        size,
        mime,
        msg.date().to_string(),
        msg.text(),
    ))
}

fn raw_message_to_file_metadata(message: &tl::types::Message) -> Option<FileMetadata> {
    if let Some(tl::enums::MessageMedia::Document(d)) = &message.media {
        if let Some(tl::enums::Document::Document(doc)) = &d.document {
            let raw_name = doc
                .attributes
                .iter()
                .find_map(|attribute| match attribute {
                    tl::enums::DocumentAttribute::Filename(filename) => {
                        Some(filename.file_name.clone())
                    }
                    _ => None,
                })
                .unwrap_or_else(|| "Unknown".to_string());
            let folder_id = match &message.peer_id {
                tl::enums::Peer::Channel(c) => Some(c.channel_id),
                tl::enums::Peer::User(u) => Some(u.user_id),
                tl::enums::Peer::Chat(c) => Some(c.chat_id),
            };

            return Some(build_file_metadata(
                message.id,
                folder_id,
                raw_name,
                doc.size as u64,
                Some(doc.mime_type.clone()),
                message.date.to_string(),
                &message.message,
            ));
        }
    }

    None
}

fn matches_search(
    filters: &SearchFilters,
    file: &FileMetadata,
    folder_name: Option<&str>,
    raw_caption: &str,
) -> bool {
    let name_lower = file.name.to_lowercase();
    let folder_lower = folder_name.unwrap_or("saved messages").to_lowercase();
    let ext_lower = file.file_ext.clone().unwrap_or_default().to_lowercase();
    let mime_lower = file.mime_type.clone().unwrap_or_default().to_lowercase();
    let created_at_lower = file.created_at.to_lowercase();
    let haystack = format!(
        "{name_lower} {} {mime_lower} {folder_lower} {created_at_lower}",
        raw_caption.to_lowercase()
    );

    if !filters.text.iter().all(|token| haystack.contains(token)) {
        return false;
    }

    if !matches_type(&file.name, filters.file_type.as_deref()) {
        return false;
    }

    if let Some(ext) = &filters.ext {
        if ext_lower != *ext {
            return false;
        }
    }

    if let Some(encrypted) = filters.encrypted {
        if file.is_encrypted != encrypted {
            return false;
        }
    }

    if let Some(folder) = &filters.folder {
        let wants_home = matches!(folder.as_str(), "saved" | "saved-messages" | "home");
        if wants_home {
            if file.folder_id.is_some() {
                return false;
            }
        } else if !folder_lower.contains(folder) {
            return false;
        }
    }

    if let Some(min_bytes) = filters.min_bytes {
        if file.size < min_bytes {
            return false;
        }
    }

    if let Some(max_bytes) = filters.max_bytes {
        if file.size > max_bytes {
            return false;
        }
    }

    true
}

#[tauri::command]
pub async fn cmd_delete_file(
    message_id: i32,
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    let peer = resolve_peer(&client, folder_id).await?;
    client
        .delete_messages(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn cmd_move_files(
    message_ids: Vec<i32>,
    source_folder_id: Option<i64>,
    target_folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    if source_folder_id == target_folder_id {
        return Ok(true);
    }

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    let source_peer = resolve_peer(&client, source_folder_id).await?;
    let target_peer = resolve_peer(&client, target_folder_id).await?;

    client
        .forward_messages(&target_peer, &message_ids, &source_peer)
        .await
        .map_err(|e| format!("Forward failed: {}", e))?;

    client
        .delete_messages(&source_peer, &message_ids)
        .await
        .map_err(|e| format!("Delete original failed: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_copy_files(
    message_ids: Vec<i32>,
    source_folder_id: Option<i64>,
    target_folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    if message_ids.is_empty() || source_folder_id == target_folder_id {
        return Ok(true);
    }

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    let source_peer = resolve_peer(&client, source_folder_id).await?;
    let target_peer = resolve_peer(&client, target_folder_id).await?;

    client
        .forward_messages(&target_peer, &message_ids, &source_peer)
        .await
        .map_err(|e| format!("Copy failed: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_files(
    folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<Vec<FileMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let mut files = Vec::new();

    let peer = resolve_peer(&client, folder_id).await?;
    let mut msgs = client.iter_messages(&peer);
    while let Some(msg) = msgs.next().await.map_err(|e| e.to_string())? {
        if let Some(file) = message_to_file_metadata(&msg, folder_id) {
            files.push(file);
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_search_global(
    query: String,
    state: State<'_, TelegramState>,
) -> Result<Vec<FileMetadata>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let mut files = Vec::new();
    let filters = parse_search_filters(&query);

    log::info!("Searching global for: {}", query);

    let result = client
        .invoke(&tl::functions::messages::SearchGlobal {
            q: query,
            filter: tl::enums::MessagesFilter::InputMessagesFilterDocument,
            min_date: 0,
            max_date: 0,
            offset_rate: 0,
            offset_peer: tl::enums::InputPeer::Empty,
            offset_id: 0,
            limit: 50,
            folder_id: None,
            broadcasts_only: false,
            groups_only: false,
            users_only: false,
        })
        .await
        .map_err(map_error)?;

    let mut push_message = |message: tl::types::Message| {
        if let Some(file) = raw_message_to_file_metadata(&message) {
            if matches_search(&filters, &file, None, &message.message) {
                files.push(file);
            }
        }
    };

    match result {
        tl::enums::messages::Messages::Messages(msgs) => {
            for msg in msgs.messages {
                if let tl::enums::Message::Message(message) = msg {
                    push_message(message);
                }
            }
        }
        tl::enums::messages::Messages::Slice(msgs) => {
            for msg in msgs.messages {
                if let tl::enums::Message::Message(message) = msg {
                    push_message(message);
                }
            }
        }
        _ => {}
    }

    let mut dialogs = client.iter_dialogs();
    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        let (folder_id, folder_name) = match &dialog.peer {
            grammers_client::types::Peer::Channel(channel) => {
                if channel.raw.title.contains("[SD-TRASH]")
                    || channel.raw.title.contains("[SD-DEL]")
                {
                    continue;
                }
                (
                    Some(channel.raw.id),
                    channel
                        .raw
                        .title
                        .replace(" [TD]", "")
                        .replace("[TD]", "")
                        .replace(" [SD]", "")
                        .replace("[SD]", "")
                        .trim()
                        .to_string(),
                )
            }
            _ => continue,
        };

        let peer = resolve_peer(&client, folder_id).await?;
        let mut messages = client.iter_messages(&peer);
        while let Some(message) = messages.next().await.map_err(|e| e.to_string())? {
            let Some(file) = message_to_file_metadata(&message, folder_id) else {
                continue;
            };

            if matches_search(&filters, &file, Some(&folder_name), message.text())
                && !files.iter().any(|candidate| {
                    candidate.id == file.id && candidate.folder_id == file.folder_id
                })
            {
                files.push(file);
            }
        }
    }

    let home_peer = resolve_peer(&client, None).await?;
    let mut home_messages = client.iter_messages(&home_peer);
    while let Some(message) = home_messages.next().await.map_err(|e| e.to_string())? {
        let Some(file) = message_to_file_metadata(&message, None) else {
            continue;
        };

        if matches_search(&filters, &file, Some("Saved Messages"), message.text())
            && !files
                .iter()
                .any(|candidate| candidate.id == file.id && candidate.folder_id == file.folder_id)
        {
            files.push(file);
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_rename_file(
    message_id: i32,
    folder_id: Option<i64>,
    new_name: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, folder_id).await?;

    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(map_error)?;
    let msg = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or("Message not found".to_string())?;
    let media = msg.media().ok_or("No media in message".to_string())?;
    let raw_size = match media {
        Media::Document(d) => d.size() as u64,
        Media::Photo(_) => 0,
        _ => 0,
    };
    let metadata = parse_caption_metadata(msg.text());
    let size = metadata.original_size.unwrap_or(raw_size);
    let hash = metadata.sha256.unwrap_or_default();
    let caption = if hash.is_empty() {
        if metadata.encrypted {
            format!("[SD-ENC:{}][SD_SIZE:{}]", new_name, size)
        } else {
            format!("[SD_NAME:{}][SD_SIZE:{}]", new_name, size)
        }
    } else {
        build_caption(&new_name, metadata.encrypted, size, &hash)
    };

    client
        .edit_message(
            &peer,
            message_id,
            grammers_client::InputMessage::new().text(caption),
        )
        .await
        .map_err(map_error)?;

    Ok(true)
}
