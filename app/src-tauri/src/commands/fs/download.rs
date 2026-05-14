use std::io::Write;

use grammers_client::types::Media;
use tauri::{Emitter, State};

use crate::bandwidth::BandwidthManager;
use crate::commands::encryption::{decrypt_file, derive_folder_key, EncryptionState};
use crate::commands::fs::caption::parse_caption_metadata;
use crate::commands::utils::resolve_peer;
use crate::TelegramState;

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    id: String,
    percent: u8,
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
    let messages = client
        .get_messages_by_id(&peer, &[message_id])
        .await
        .map_err(|e| e.to_string())?;

    let msg = messages
        .into_iter()
        .flatten()
        .next()
        .ok_or_else(|| "Message not found".to_string())?;

    let media = msg
        .media()
        .ok_or_else(|| "No media in message".to_string())?;

    let total_size = match &media {
        Media::Document(d) => d.size() as u64,
        Media::Photo(_) => 1024 * 1024,
        _ => 0,
    };

    bw_state.can_transfer(total_size)?;

    if !tid.is_empty() {
        let _ = app_handle.emit(
            "download-progress",
            ProgressPayload {
                id: tid.clone(),
                percent: 0,
            },
        );
    }

    let mut download_iter = client.iter_download(&media);
    let mut file = std::fs::File::create(&save_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;

    while let Some(chunk) = download_iter.next().await.transpose() {
        let bytes = chunk.map_err(|e| format!("Download chunk error: {}", e))?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        downloaded += bytes.len() as u64;

        if !tid.is_empty() && total_size > 0 {
            let percent = ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8;
            if percent != last_percent {
                last_percent = percent;
                let _ = app_handle.emit(
                    "download-progress",
                    ProgressPayload {
                        id: tid.clone(),
                        percent,
                    },
                );
            }
        }
    }

    bw_state.add_down(total_size);

    let metadata = parse_caption_metadata(msg.text());
    if metadata.encrypted {
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
        let _ = app_handle.emit(
            "download-progress",
            ProgressPayload {
                id: tid,
                percent: 100,
            },
        );
    }

    Ok("Download successful".to_string())
}
