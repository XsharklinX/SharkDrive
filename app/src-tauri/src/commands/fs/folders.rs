use std::net::UdpSocket;

use grammers_client::types::Peer;
use grammers_tl_types as tl;
use rand::Rng;
use tauri::State;

use crate::commands::fs::caption::{
    build_folder_about, parse_folder_parent_id, update_folder_about_parent, FOLDER_MARKER,
    LEGACY_FOLDER_MARKER,
};
use crate::commands::utils::{map_error, resolve_peer};
use crate::models::FolderMetadata;
use crate::TelegramState;

const LEGACY_TITLE_MARKER: &str = "[TD]";
const CURRENT_TITLE_MARKER: &str = "[SD]";

fn has_title_marker(name: &str) -> bool {
    let lowered = name.to_lowercase();
    lowered.contains(&LEGACY_TITLE_MARKER.to_lowercase())
        || lowered.contains(&CURRENT_TITLE_MARKER.to_lowercase())
}

fn strip_title_markers(name: &str) -> String {
    name.replace(" [TD]", "")
        .replace(" [td]", "")
        .replace("[TD]", "")
        .replace("[td]", "")
        .replace(" [SD]", "")
        .replace(" [sd]", "")
        .replace("[SD]", "")
        .replace("[sd]", "")
        .trim()
        .to_string()
}

#[tauri::command]
pub async fn cmd_create_folder(
    name: String,
    parent_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<FolderMetadata, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    log::info!("Creating Telegram Channel: {}", name);

    let result = client
        .invoke(&tl::functions::channels::CreateChannel {
            broadcast: true,
            megagroup: false,
            title: format!("{} {}", name, CURRENT_TITLE_MARKER),
            about: build_folder_about(parent_id),
            geo_point: None,
            address: None,
            for_import: false,
            forum: false,
            ttl_period: None,
        })
        .await
        .map_err(map_error)?;

    let (chat_id, access_hash) = match result {
        tl::enums::Updates::Updates(u) => {
            let chat = u.chats.first().ok_or("No chat in updates")?;
            match chat {
                tl::enums::Chat::Channel(c) => (c.id, c.access_hash.unwrap_or(0)),
                _ => return Err("Created chat is not a channel".to_string()),
            }
        }
        _ => return Err("Unexpected response (not Updates::Updates)".to_string()),
    };

    let client_for_seed = client.clone();
    tauri::async_runtime::spawn(async move {
        let init_random_id: i64 = rand::thread_rng().gen();
        let _ = client_for_seed
            .invoke(&tl::functions::messages::SendMessage {
                no_webpage: true,
                silent: true,
                background: true,
                clear_draft: false,
                peer: tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                    channel_id: chat_id,
                    access_hash,
                }),
                reply_to: None,
                message: "SharkDrive folder initialized".to_string(),
                random_id: init_random_id,
                reply_markup: None,
                entities: None,
                schedule_date: None,
                schedule_repeat_period: None,
                send_as: None,
                noforwards: false,
                update_stickersets_order: false,
                invert_media: false,
                quick_reply_shortcut: None,
                effect: None,
                allow_paid_floodskip: false,
                allow_paid_stars: None,
                suggested_post: None,
            })
            .await;
    });
    let _ = client
        .invoke(&tl::functions::messages::SetHistoryTtl {
            peer: tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                channel_id: chat_id,
                access_hash,
            }),
            period: 0,
        })
        .await;

    Ok(FolderMetadata {
        id: chat_id,
        name,
        parent_id,
    })
}

#[tauri::command]
pub async fn cmd_delete_folder(
    folder_id: i64,
    state: State<'_, TelegramState>,
) -> Result<bool, String> {
    let client_opt = { state.client.lock().await.clone() };
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
        }
        _ => return Err("Only channels (folders) can be deleted.".to_string()),
    };

    client
        .invoke(&tl::functions::channels::DeleteChannel {
            channel: input_channel,
        })
        .await
        .map_err(|e| format!("Failed to delete channel: {}", e))?;

    Ok(true)
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

                log::debug!("[SCAN] Processing Channel: '{}' (ID: {})", name, id);

                if name.contains("[SD-TRASH]") || name.contains("[SD-DEL]") {
                    continue;
                }

                if !has_title_marker(&name) {
                    continue;
                }

                let access_hash = c.raw.access_hash.unwrap_or(0);

                let input_chan = tl::enums::InputChannel::Channel(tl::types::InputChannel {
                    channel_id: c.raw.id,
                    access_hash,
                });

                match client
                    .invoke(&tl::functions::channels::GetFullChannel {
                        channel: input_chan,
                    })
                    .await
                {
                    Ok(tl::enums::messages::ChatFull::Full(f)) => {
                        if let tl::enums::ChatFull::Full(cf) = f.full_chat {
                            if cf.about.contains(FOLDER_MARKER)
                                || cf.about.contains(LEGACY_FOLDER_MARKER)
                                || has_title_marker(&name)
                            {
                                let display_name = strip_title_markers(&name);
                                log::info!(" -> MATCH via Metadata: {}", name);
                                folders.push(FolderMetadata {
                                    id,
                                    name: display_name,
                                    parent_id: parse_folder_parent_id(&cf.about),
                                });
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!(" -> Failed to get full info: {}", e);
                        if has_title_marker(&name) {
                            folders.push(FolderMetadata {
                                id,
                                name: strip_title_markers(&name),
                                parent_id: None,
                            });
                        }
                    }
                }
            }
            peer => {
                log::debug!("[SCAN] Skipped Peer: {:?}", peer);
            }
        }
    }

    log::info!("Scan complete. Found {} folders.", folders.len());
    Ok(folders)
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

    client
        .invoke(&tl::functions::channels::EditTitle {
            channel: input_channel,
            title: format!("{} {}", new_name, CURRENT_TITLE_MARKER),
        })
        .await
        .map_err(map_error)?;

    Ok(true)
}

#[tauri::command]
pub async fn cmd_set_folder_parent(
    folder_id: i64,
    parent_id: Option<i64>,
    state: State<'_, TelegramState>,
) -> Result<FolderMetadata, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;
    let peer = resolve_peer(&client, Some(folder_id)).await?;

    let (input_channel, input_peer, current_name) = match peer {
        Peer::Channel(c) => (
            tl::enums::InputChannel::Channel(tl::types::InputChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash for channel")?,
            }),
            tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                channel_id: c.raw.id,
                access_hash: c.raw.access_hash.ok_or("No access hash for channel")?,
            }),
            c.raw.title.clone(),
        ),
        _ => return Err("Target is not a channel".to_string()),
    };

    let full = client
        .invoke(&tl::functions::channels::GetFullChannel {
            channel: input_channel,
        })
        .await
        .map_err(map_error)?;

    let current_about = match full {
        tl::enums::messages::ChatFull::Full(full) => match full.full_chat {
            tl::enums::ChatFull::Full(chat) => chat.about,
            _ => build_folder_about(parent_id),
        },
    };

    let updated_about = update_folder_about_parent(&current_about, parent_id);

    client
        .invoke(&tl::functions::messages::EditChatAbout {
            peer: input_peer,
            about: updated_about,
        })
        .await
        .map_err(map_error)?;

    let display_name = strip_title_markers(&current_name);

    Ok(FolderMetadata {
        id: folder_id,
        name: display_name,
        parent_id,
    })
}

#[tauri::command]
pub async fn cmd_get_or_create_trash(state: State<'_, TelegramState>) -> Result<i64, String> {
    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    let mut dialogs = client.iter_dialogs();
    while let Some(dialog) = dialogs.next().await.map_err(|e| e.to_string())? {
        if let Peer::Channel(c) = &dialog.peer {
            if c.raw.title.contains("[SD-TRASH]") {
                return Ok(c.raw.id);
            }
        }
    }

    let result = client
        .invoke(&tl::functions::channels::CreateChannel {
            broadcast: true,
            megagroup: false,
            title: "Trash [SD-TRASH]".to_string(),
            about: format!("SharkDrive Trash\n{FOLDER_MARKER}"),
            geo_point: None,
            address: None,
            for_import: false,
            forum: false,
            ttl_period: None,
        })
        .await
        .map_err(map_error)?;

    let (chat_id, access_hash) = match result {
        tl::enums::Updates::Updates(u) => {
            let chat = u.chats.first().ok_or("No chat in updates")?;
            match chat {
                tl::enums::Chat::Channel(c) => (c.id, c.access_hash.unwrap_or(0)),
                _ => return Err("Created chat is not a channel".to_string()),
            }
        }
        _ => return Err("Unexpected response".to_string()),
    };

    let client_for_seed = client.clone();
    tauri::async_runtime::spawn(async move {
        let trash_random_id: i64 = rand::thread_rng().gen();
        let _ = client_for_seed
            .invoke(&tl::functions::messages::SendMessage {
                no_webpage: true,
                silent: true,
                background: true,
                clear_draft: false,
                peer: tl::enums::InputPeer::Channel(tl::types::InputPeerChannel {
                    channel_id: chat_id,
                    access_hash,
                }),
                reply_to: None,
                message: "SharkDrive trash initialized".to_string(),
                random_id: trash_random_id,
                reply_markup: None,
                entities: None,
                schedule_date: None,
                schedule_repeat_period: None,
                send_as: None,
                noforwards: false,
                update_stickersets_order: false,
                invert_media: false,
                quick_reply_shortcut: None,
                effect: None,
                allow_paid_floodskip: false,
                allow_paid_stars: None,
                suggested_post: None,
            })
            .await;
    });

    Ok(chat_id)
}

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
    client
        .invoke(&tl::functions::channels::EditTitle {
            channel: input_channel,
            title: format!("{} [SD-DEL] {}", display_name, CURRENT_TITLE_MARKER),
        })
        .await
        .map_err(map_error)?;
    Ok(true)
}

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
    client
        .invoke(&tl::functions::channels::EditTitle {
            channel: input_channel,
            title: format!("{} {}", display_name, CURRENT_TITLE_MARKER),
        })
        .await
        .map_err(map_error)?;
    Ok(true)
}

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
                let raw = c
                    .raw
                    .title
                    .replace(" [SD-DEL]", "")
                    .replace("[SD-DEL]", "")
                    .trim()
                    .to_string();
                let raw = strip_title_markers(&raw);
                folders.push(FolderMetadata {
                    id: c.raw.id,
                    name: raw,
                    parent_id: None,
                });
            }
        }
    }
    Ok(folders)
}

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
    let result = client
        .invoke(&tl::functions::messages::ExportChatInvite {
            peer: input_peer,
            legacy_revoke_permanent: false,
            request_needed: false,
            expire_date: None,
            usage_limit: None,
            title: None,
            subscription_pricing: None,
        })
        .await
        .map_err(map_error)?;
    match result {
        tl::enums::ExportedChatInvite::ChatInviteExported(inv) => Ok(inv.link),
        _ => Err("Could not generate invite link".to_string()),
    }
}

#[tauri::command]
pub async fn cmd_get_local_ip() -> Result<String, String> {
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

#[tauri::command]
pub fn cmd_save_clipboard_image(bytes: Vec<u8>, filename: String) -> Result<String, String> {
    let tmp_path = std::env::temp_dir().join(format!("sharkdrive_paste_{}", filename));
    std::fs::write(&tmp_path, bytes)
        .map_err(|e| format!("Failed to save clipboard image: {}", e))?;
    Ok(tmp_path.to_string_lossy().into_owned())
}
