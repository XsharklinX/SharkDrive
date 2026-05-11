use tauri::{State, Emitter};
use grammers_client::types::{Media, Peer};
use grammers_client::InputMessage;
use grammers_tl_types as tl;
use crate::TelegramState;
use crate::models::{FolderMetadata, FileMetadata};
use crate::bandwidth::BandwidthManager;
use crate::commands::utils::{resolve_peer, map_error};
use crate::commands::encryption::{EncryptionState, encrypt_file, decrypt_file, derive_folder_key};
use sha2::{Digest, Sha256};

#[derive(Default, Clone)]
struct CaptionMetadata {
    display_name: Option<String>,
    original_size: Option<u64>,
    sha256: Option<String>,
    encrypted: bool,
}

fn parse_caption_metadata(text: &str) -> CaptionMetadata {
    let mut metadata = CaptionMetadata::default();

    for segment in text.split('[').skip(1) {
        let token = format!("[{}", segment);
        if let Some(value) = token.strip_prefix("[SD-ENC:").and_then(|v| v.strip_suffix(']')) {
            metadata.display_name = Some(value.to_string());
            metadata.encrypted = true;
            continue;
        }
        if let Some(value) = token.strip_prefix("[SD_NAME:").and_then(|v| v.strip_suffix(']')) {
            metadata.display_name = Some(value.to_string());
            continue;
        }
        if let Some(value) = token.strip_prefix("[SD_SIZE:").and_then(|v| v.strip_suffix(']')) {
            metadata.original_size = value.parse::<u64>().ok();
            continue;
        }
        if let Some(value) = token.strip_prefix("[SD_HASH:").and_then(|v| v.strip_suffix(']')) {
            metadata.sha256 = Some(value.to_lowercase());
        }
    }

    metadata
}

fn build_caption(name: &str, encrypted: bool, original_size: u64, sha256: &str) -> String {
    let name_marker = if encrypted {
        format!("[SD-ENC:{}]", name)
    } else {
        format!("[SD_NAME:{}]", name)
    };

    format!("{name_marker}[SD_SIZE:{original_size}][SD_HASH:{sha256}]")
}

fn compute_file_sha256(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Cannot read file for hash: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

fn display_name_from_metadata(raw_name: String, msg_text: &str) -> (String, CaptionMetadata) {
    let metadata = parse_caption_metadata(msg_text);
    let display_name = metadata.display_name.clone().unwrap_or(raw_name);
    (display_name, metadata)
}

async fn find_duplicate_message(
    client: &grammers_client::Client,
    folder_id: Option<i64>,
    display_name: &str,
    original_size: u64,
    sha256: &str,
) -> Result<Option<i32>, String> {
    let peer = resolve_peer(client, folder_id).await?;
    let mut messages = client.iter_messages(&peer);

    while let Some(msg) = messages.next().await.map_err(|e| e.to_string())? {
        let media = match msg.media() {
            Some(media) => media,
            None => continue,
        };

        let raw_name = match &media {
            Media::Document(d) => d.name().to_string(),
            Media::Photo(_) => "Photo.jpg".to_string(),
            _ => continue,
        };

        let (existing_name, existing_meta) = display_name_from_metadata(raw_name, msg.text());
        if !existing_name.eq_ignore_ascii_case(display_name) {
            continue;
        }

        if let Some(existing_hash) = existing_meta.sha256 {
            if existing_hash.eq_ignore_ascii_case(sha256) {
                return Ok(Some(msg.id()));
            }
            continue;
        }

        let existing_size = existing_meta.original_size.unwrap_or_else(|| match &media {
            Media::Document(d) => d.size() as u64,
            Media::Photo(_) => 0,
            _ => 0,
        });

        if existing_size == original_size {
            return Ok(Some(msg.id()));
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn cmd_create_folder(
    name: String,
    state: State<'_, TelegramState>,
) -> Result<FolderMetadata, String> {
    let client_opt = {
        state.client.lock().await.clone()
    };
    
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    log::info!("Creating Telegram Channel: {}", name);
    
    let result = client.invoke(&tl::functions::channels::CreateChannel {
        broadcast: true,
        megagroup: false,
        title: format!("{} [TD]", name),
        about: "Telegram Drive Storage Folder\n[telegram-drive-folder]".to_string(),
        geo_point: None,
        address: None,
        for_import: false,
        forum: false,
        ttl_period: None, // Initial creation TTL
    }).await.map_err(map_error)?;
    
    let (chat_id, access_hash) = match result {
        tl::enums::Updates::Updates(u) => {
             let chat = u.chats.first().ok_or("No chat in updates")?;
             match chat {
                 tl::enums::Chat::Channel(c) => (c.id, c.access_hash.unwrap_or(0)),
                 _ => return Err("Created chat is not a channel".to_string()),
             }
        },
        _ => return Err("Unexpected response (not Updates::Updates)".to_string()), 
    };

    // Explicitly Disable TTL
    let _input_channel = tl::enums::InputChannel::Channel(tl::types::InputChannel {
         channel_id: chat_id,
         access_hash,
    });

    let _ = client.invoke(&tl::functions::messages::SetHistoryTtl {
        peer: tl::enums::InputPeer::Channel(tl::types::InputPeerChannel { channel_id: chat_id, access_hash }),
        period: 0, 
    }).await;

    Ok(FolderMetadata {
        id: chat_id,
        name,
        parent_id: None,
    })
}

#[tauri::command]
pub async fn cmd_delete_folder(
    folder_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = {
        state.client.lock().await.clone()
    };
    
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    log::info!("Deleting folder/channel: {}", folder_id);

    let peer = resolve_peer(&client, Some(folder_id)).await?;
    
    let input_channel = match peer {
        Peer::Channel(c) => {
             let chan = &c.raw;
             tl::enums::InputChannel::Channel(tl::types::InputChannel {
                 channel_id: chan.id,
                 access_hash: chan.access_hash.ok_or("No access hash for channel")?,
             })
        },
        _ => return Err("Only channels (folders) can be deleted.".to_string()),
    };
    
    client.invoke(&tl::functions::channels::DeleteChannel {
        channel: input_channel,
    }).await.map_err(|e| format!("Failed to delete channel: {}", e))?;
    
    Ok(true)
}


#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    id: String,
    percent: u8,
}

#[tauri::command]
pub async fn cmd_upload_file(
    path: String,
    folder_id: Option<i64>,
    transfer_id: Option<String>,
    encrypt: Option<bool>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
    enc_state: State<'_, EncryptionState>,
) -> Result<String, String> {
    let size = std::fs::metadata(&path).map_err(|e| format!("Cannot read file: {}", e))?.len();
    const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024 * 1024;
    if size > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({:.1} GB). Telegram supports a maximum of 2 GB per file.",
            size as f64 / (1024.0 * 1024.0 * 1024.0)
        ));
    }
    bw_state.can_transfer(size)?;

    let original_name = std::path::Path::new(&path)
        .file_name().unwrap_or_default().to_string_lossy().to_string();
    let file_hash = compute_file_sha256(&path)?;

    let tid = transfer_id.unwrap_or_default();

    // Encryption setup
    let should_encrypt = encrypt.unwrap_or(false);
    let enc_key = if should_encrypt {
        enc_state.key.lock().unwrap().clone()
    } else {
        None
    };

    // If encrypting, write to a temp file first.
    // Use a folder-specific derived key so each folder's files need
    // both the master password AND the folder ID to decrypt.
    let caption = build_caption(&original_name, should_encrypt && enc_key.is_some(), size, &file_hash);

    let (upload_path, temp_path) = if should_encrypt && enc_key.is_some() {
        let master = enc_key.as_ref().unwrap();
        let active_key = match folder_id {
            Some(id) => derive_folder_key(master, id),
            None => master.clone(),
        };
        let tmp = std::env::temp_dir().join(format!("sharkdrive_{}.enc", tid));
        let tmp_str = tmp.to_string_lossy().to_string();
        encrypt_file(&active_key, &path, &tmp_str)?;
        (tmp_str.clone(), Some(tmp_str))
    } else {
        (path.clone(), None)
    };

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    if find_duplicate_message(&client, folder_id, &original_name, size, &file_hash).await?.is_some() {
        if let Some(tmp) = temp_path {
            let _ = std::fs::remove_file(tmp);
        }
        return Ok("duplicate".to_string());
    }

    if !tid.is_empty() {
        let _ = app_handle.emit("upload-progress", ProgressPayload { id: tid.clone(), percent: 0 });
    }

    let upload_path_clone = upload_path.clone();
    let client_clone = client.clone();

    let uploaded_file = tauri::async_runtime::spawn(async move {
        client_clone.upload_file(&upload_path_clone).await
    }).await.map_err(|e| format!("Task join error: {}", e))?
      .map_err(map_error)?;

    let message = InputMessage::new().text(caption).file(uploaded_file);
    let peer = resolve_peer(&client, folder_id).await?;
    client.send_message(&peer, message).await.map_err(map_error)?;

    bw_state.add_up(size);

    if let Some(tmp) = temp_path { let _ = std::fs::remove_file(tmp); }

    if !tid.is_empty() {
        let _ = app_handle.emit("upload-progress", ProgressPayload { id: tid, percent: 100 });
    }

    Ok("File uploaded successfully".to_string())
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
    client.delete_messages(&peer, &[message_id]).await.map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn cmd_download_file(
    message_id: i32,
    save_path: String,
    folder_id: Option<i64>,
    transfer_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
    enc_state: State<'_, EncryptionState>,
) -> Result<String, String> {
    let tid = transfer_id.unwrap_or_default();

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    
    let peer = resolve_peer(&client, folder_id).await?;

    // Use get_messages_by_id for efficient message lookup (same as server.rs)
    let messages = client.get_messages_by_id(&peer, &[message_id]).await.map_err(|e| e.to_string())?;
    
    let msg = messages.into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Message not found".to_string())?;

    let media = msg.media()
        .ok_or_else(|| "No media in message".to_string())?;

    let total_size = match &media {
        Media::Document(d) => d.size() as u64,
        Media::Photo(_) => 1024 * 1024,
        _ => 0,
    };
    
    bw_state.can_transfer(total_size)?;

    // Emit start
    if !tid.is_empty() {
        let _ = app_handle.emit("download-progress", ProgressPayload { id: tid.clone(), percent: 0 });
    }

    // Stream download with per-chunk progress
    let mut download_iter = client.iter_download(&media);
    let mut file = std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;

    while let Some(chunk) = download_iter.next().await.transpose() {
        let bytes = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
        std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
        downloaded += bytes.len() as u64;
        
        if !tid.is_empty() && total_size > 0 {
            let percent = ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8;
            // Only emit when percent actually changes to avoid event spam
            if percent != last_percent {
                last_percent = percent;
                let _ = app_handle.emit("download-progress", ProgressPayload { id: tid.clone(), percent });
            }
        }
    }

    bw_state.add_down(total_size);

    // Auto-decrypt if the message caption marks it as encrypted.
    // Derive the same folder-specific key that was used during upload.
    let caption = msg.text().to_string();
    if caption.contains("[SD-ENC:") {
        let enc_key = enc_state.key.lock().unwrap().clone();
        if let Some(master) = enc_key {
            let active_key = match folder_id {
                Some(id) => derive_folder_key(&master, id),
                None => master,
            };
            let tmp = format!("{}.enc_tmp", save_path);
            std::fs::rename(&save_path, &tmp).map_err(|e| e.to_string())?;
            if let Err(e) = decrypt_file(&active_key, &tmp, &save_path) {
                let _ = std::fs::rename(&tmp, &save_path);
                return Err(format!("Decryption failed: {}", e));
            }
            let _ = std::fs::remove_file(tmp);
        } else {
            let _ = std::fs::remove_file(&save_path);
            return Err("This file is encrypted. Load your SharkDrive encryption password before downloading it.".to_string());
        }
    }

    if !tid.is_empty() {
        let _ = app_handle.emit("download-progress", ProgressPayload { id: tid, percent: 100 });
    }

    Ok("Download successful".to_string())
}

#[tauri::command]
pub async fn cmd_move_files(
    message_ids: Vec<i32>,
    source_folder_id: Option<i64>,
    target_folder_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    if source_folder_id == target_folder_id { return Ok(true); }
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    let source_peer = resolve_peer(&client, source_folder_id).await?;
    let target_peer = resolve_peer(&client, target_folder_id).await?;

    match client.forward_messages(&target_peer, &message_ids, &source_peer).await {
        Ok(_) => {},
        Err(e) => return Err(format!("Forward failed: {}", e)),
    }
    
    match client.delete_messages(&source_peer, &message_ids).await {
        Ok(_) => {},
        Err(e) => return Err(format!("Delete original failed: {}", e)),
    }

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
        if let Some(doc) = msg.media() {
            let (raw_name, size, mime, ext) = match doc {
                Media::Document(d) => {
                    let n = d.name().to_string();
                    let s = d.size();
                    let m = d.mime_type().map(|s| s.to_string());
                    let e = std::path::Path::new(&n).extension().map(|os| os.to_str().unwrap_or("").to_string());
                    (n, s, m, e)
                },
                Media::Photo(_) => ("Photo.jpg".to_string(), 0, Some("image/jpeg".into()), Some("jpg".into())),
                _ => ("Unknown".to_string(), 0, None, None),
            };
            let msg_text = msg.text();
            let (name, metadata) = display_name_from_metadata(raw_name, msg_text);
            let file_ext = std::path::Path::new(&name).extension()
                .map(|os| os.to_str().unwrap_or("").to_string())
                .or(ext);
            files.push(FileMetadata {
                id: msg.id() as i64, folder_id, name, size: metadata.original_size.unwrap_or(size as u64),
                mime_type: mime, file_ext, created_at: msg.date().to_string(),
                icon_type: "file".into(), is_encrypted: metadata.encrypted,
            });
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_search_global(
    query: String,
    state: State<'_, TelegramState>,
) -> Result<Vec<FileMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let mut files = Vec::new();
    
    log::info!("Searching global for: {}", query);

    let result = client.invoke(&tl::functions::messages::SearchGlobal {
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
    }).await.map_err(map_error)?;

    if let tl::enums::messages::Messages::Messages(msgs) = result {
        for msg in msgs.messages {
            if let tl::enums::Message::Message(m) = msg {
                if let Some(tl::enums::MessageMedia::Document(d)) = m.media {
                    if let tl::enums::Document::Document(doc) = d.document.unwrap() {
                        let raw_name = doc.attributes.iter().find_map(|a| match a {
                            tl::enums::DocumentAttribute::Filename(f) => Some(f.file_name.clone()),
                            _ => None
                        }).unwrap_or("Unknown".to_string());
                        let metadata = parse_caption_metadata(&m.message);
                        let name = metadata.display_name.clone().unwrap_or(raw_name);
                        let size = metadata.original_size.unwrap_or(doc.size as u64);
                        let mime = doc.mime_type.clone();
                        let ext = std::path::Path::new(&name).extension().map(|os| os.to_str().unwrap_or("").to_string());
                        let folder_id = match m.peer_id {
                            tl::enums::Peer::Channel(c) => Some(c.channel_id),
                            tl::enums::Peer::User(u) => Some(u.user_id),
                            tl::enums::Peer::Chat(c) => Some(c.chat_id),
                        };
                        files.push(FileMetadata {
                            id: m.id as i64, folder_id, name, size,
                            mime_type: Some(mime), file_ext: ext,
                            created_at: m.date.to_string(), icon_type: "file".into(), is_encrypted: metadata.encrypted
                        });
                    }
                }
            }
        }
    } else if let tl::enums::messages::Messages::Slice(msgs) = result {
        for msg in msgs.messages {
            if let tl::enums::Message::Message(m) = msg {
                if let Some(tl::enums::MessageMedia::Document(d)) = m.media {
                    if let tl::enums::Document::Document(doc) = d.document.unwrap() {
                        let raw_name = doc.attributes.iter().find_map(|a| match a {
                            tl::enums::DocumentAttribute::Filename(f) => Some(f.file_name.clone()),
                            _ => None
                        }).unwrap_or("Unknown".to_string());
                        let metadata = parse_caption_metadata(&m.message);
                        let name = metadata.display_name.clone().unwrap_or(raw_name);
                        let size = metadata.original_size.unwrap_or(doc.size as u64);
                        let mime = doc.mime_type.clone();
                        let ext = std::path::Path::new(&name).extension().map(|os| os.to_str().unwrap_or("").to_string());
                        let folder_id = match m.peer_id {
                            tl::enums::Peer::Channel(c) => Some(c.channel_id),
                            tl::enums::Peer::User(u) => Some(u.user_id),
                            tl::enums::Peer::Chat(c) => Some(c.chat_id),
                        };
                        files.push(FileMetadata {
                            id: m.id as i64, folder_id, name, size,
                            mime_type: Some(mime), file_ext: ext,
                            created_at: m.date.to_string(), icon_type: "file".into(), is_encrypted: metadata.encrypted
                        });
                    }
                }
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn cmd_scan_folders(
    state: State<'_, TelegramState>,
) -> Result<Vec<FolderMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    
    let mut folders = Vec::new();
    let mut dialogs = client.iter_dialogs();
    
    log::info!("Starting Folder Scan...");

    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        match &dialog.peer {
            Peer::Channel(c) => {
                let id = c.raw.id;
                let name = c.raw.title.clone();
                let access_hash = c.raw.access_hash.unwrap_or(0);
                
                log::debug!("[SCAN] Processing Channel: '{}' (ID: {})", name, id);

                // Skip the trash channel and soft-deleted folders
                if name.contains("[SD-TRASH]") || name.contains("[SD-DEL]") {
                    continue;
                }

                // Strategy 1: Title
                if name.to_lowercase().contains("[td]") {
                    log::info!(" -> MATCH via Title: {}", name);
                    let display_name = name.replace(" [TD]", "").replace(" [td]", "").replace("[TD]", "").replace("[td]", "").trim().to_string();
                    folders.push(FolderMetadata { id, name: display_name, parent_id: None });
                    continue; 
                }

                // Strategy 2: About
                let input_chan = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                    channel_id: c.raw.id,
                    access_hash,
                });
                
                match client.invoke(&tl::functions::channels::GetFullChannel {
                    channel: input_chan,
                }).await {
                    Ok(tl::enums::messages::ChatFull::Full(f)) => {
                        if let tl::enums::ChatFull::Full(cf) = f.full_chat {
                             if cf.about.contains("[telegram-drive-folder]") {
                                 log::info!(" -> MATCH via About: {}", name);
                                 folders.push(FolderMetadata { id, name: name.clone(), parent_id: None });
                             }
                        }
                    },
                    Err(e) => log::warn!(" -> Failed to get full info: {}", e),
                }
            },
            peer => {
                log::debug!("[SCAN] Skipped Peer: {:?}", peer);
            }
        }
    }
    
    log::info!("Scan complete. Found {} folders.", folders.len());
    Ok(folders)
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

    let messages = client.get_messages_by_id(&peer, &[message_id]).await.map_err(map_error)?;
    let msg = messages.into_iter().flatten().next().ok_or("Message not found".to_string())?;
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

    client.edit_message(&peer, message_id, InputMessage::new().text(caption))
        .await
        .map_err(map_error)?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_rename_folder(
    folder_id: i64,
    new_name: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, Some(folder_id)).await?;

    let input_channel = match peer {
        Peer::Channel(c) => tl::enums::InputChannel::Channel(tl::types::InputChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.ok_or("No access hash for channel")?,
        }),
        _ => return Err("Target is not a channel".to_string()),
    };

    client.invoke(&tl::functions::channels::EditTitle {
        channel: input_channel,
        title: format!("{} [TD]", new_name),
    }).await.map_err(map_error)?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_get_or_create_trash(
    state: State<'_, TelegramState>,
) -> Result<i64, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    // Search for existing trash channel
    let mut dialogs = client.iter_dialogs();
    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        if let Peer::Channel(c) = &dialog.peer {
            if c.raw.title.contains("[SD-TRASH]") {
                return Ok(c.raw.id);
            }
        }
    }

    // Create trash channel
    let result = client.invoke(&tl::functions::channels::CreateChannel {
        broadcast: true,
        megagroup: false,
        title: "Trash [SD-TRASH]".to_string(),
        about: "SharkDrive Trash\n[telegram-drive-folder]".to_string(),
        geo_point: None,
        address: None,
        for_import: false,
        forum: false,
        ttl_period: None,
    }).await.map_err(map_error)?;

    let chat_id = match result {
        tl::enums::Updates::Updates(u) => {
            let chat = u.chats.first().ok_or("No chat in updates")?;
            match chat {
                tl::enums::Chat::Channel(c) => c.id,
                _ => return Err("Created chat is not a channel".to_string()),
            }
        }
        _ => return Err("Unexpected response".to_string()),
    };

    Ok(chat_id)
}

/// Soft-delete a folder by renaming it with [SD-DEL] marker (reversible)
#[tauri::command]
pub async fn cmd_soft_delete_folder(
    folder_id: i64,
    display_name: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, Some(folder_id)).await?;
    let input_channel = match peer {
        Peer::Channel(c) => tl::enums::InputChannel::Channel(tl::types::InputChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.ok_or("No access hash")?,
        }),
        _ => return Err("Not a channel".to_string()),
    };
    client.invoke(&tl::functions::channels::EditTitle {
        channel: input_channel,
        title: format!("{} [SD-DEL] [TD]", display_name),
    }).await.map_err(map_error)?;
    Ok(true)
}

/// Restore a soft-deleted folder
#[tauri::command]
pub async fn cmd_restore_folder(
    folder_id: i64,
    display_name: String,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, Some(folder_id)).await?;
    let input_channel = match peer {
        Peer::Channel(c) => tl::enums::InputChannel::Channel(tl::types::InputChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.ok_or("No access hash")?,
        }),
        _ => return Err("Not a channel".to_string()),
    };
    client.invoke(&tl::functions::channels::EditTitle {
        channel: input_channel,
        title: format!("{} [TD]", display_name),
    }).await.map_err(map_error)?;
    Ok(true)
}

/// List soft-deleted folders (those with [SD-DEL] in title)
#[tauri::command]
pub async fn cmd_get_trashed_folders(
    state: State<'_, TelegramState>,
) -> Result<Vec<FolderMetadata>, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let mut folders = Vec::new();
    let mut dialogs = client.iter_dialogs();
    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        if let Peer::Channel(c) = &dialog.peer {
            if c.raw.title.contains("[SD-DEL]") {
                let raw = c.raw.title
                    .replace(" [SD-DEL]", "").replace("[SD-DEL]", "")
                    .replace(" [TD]", "").replace("[TD]", "")
                    .trim().to_string();
                folders.push(FolderMetadata { id: c.raw.id, name: raw, parent_id: None });
            }
        }
    }
    Ok(folders)
}

/// Generate a Telegram invite link for a folder (channel)
#[tauri::command]
pub async fn cmd_get_folder_invite_link(
    folder_id: i64,
    state: State<'_, TelegramState>,
) -> Result<String, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Not connected")?;
    let peer = resolve_peer(&client, Some(folder_id)).await?;
    let input_peer = match &peer {
        Peer::Channel(c) => tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
            channel_id: c.raw.id,
            access_hash: c.raw.access_hash.ok_or("No access hash")?,
        }),
        _ => return Err("Not a channel".to_string()),
    };
    let result = client.invoke(&tl::functions::messages::ExportChatInvite {
        peer: input_peer,
        legacy_revoke_permanent: false,
        request_needed: false,
        expire_date: None,
        usage_limit: None,
        title: None,
        subscription_pricing: None,
    }).await.map_err(map_error)?;
    match result {
        tl::enums::ExportedChatInvite::ChatInviteExported(inv) => Ok(inv.link),
        _ => Err("Could not generate invite link".to_string()),
    }
}

/// Get local network IP address
#[tauri::command]
pub async fn cmd_get_local_ip() -> Result<String, String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    let addr = socket.local_addr().map_err(|e| e.to_string())?;
    Ok(addr.ip().to_string())
}

#[tauri::command]
pub async fn cmd_list_dir_files(path: String) -> Result<Vec<String>, String> {
    fn collect(dir: &std::path::Path, out: &mut Vec<String>) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let p = entry.path();
            if p.is_file() {
                out.push(p.to_string_lossy().into_owned());
            } else if p.is_dir() {
                collect(&p, out)?;
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    collect(std::path::Path::new(&path), &mut files)
        .map_err(|e| format!("Failed to list directory: {}", e))?;
    Ok(files)
}

/// Saves raw bytes (e.g. from clipboard paste) to a temp file and returns the path.
/// The frontend queues the returned path as a normal upload.
#[tauri::command]
pub fn cmd_save_clipboard_image(bytes: Vec<u8>, filename: String) -> Result<String, String> {
    let tmp_path = std::env::temp_dir().join(format!("sharkdrive_paste_{}", filename));
    std::fs::write(&tmp_path, bytes).map_err(|e| format!("Failed to save clipboard image: {}", e))?;
    Ok(tmp_path.to_string_lossy().into_owned())
}
