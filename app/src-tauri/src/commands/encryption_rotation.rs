use grammers_client::{types::Media, InputMessage};
use rand::Rng;
use serde::Deserialize;
use tauri::{Emitter, State};
use tokio::{fs::File, io::AsyncWriteExt};

use crate::{
    commands::{
        encryption::{
            decrypt_file, derive_folder_key, derive_legacy_key, derive_master_key_v2, encrypt_file,
        },
        fs::caption::{build_caption, compute_file_sha256, parse_caption_metadata},
        utils::{map_error, resolve_peer},
    },
    TelegramState,
};

#[derive(Deserialize)]
pub struct RotationEntry {
    pub message_id: i32,
    pub folder_id: Option<i64>,
    pub filename: String,
}

#[derive(Clone, serde::Serialize)]
struct RotationProgress {
    completed: usize,
    total: usize,
    filename: String,
}

fn folder_key(master: &[u8], folder_id: Option<i64>) -> Vec<u8> {
    folder_id
        .map(|id| derive_folder_key(master, id))
        .unwrap_or_else(|| master.to_vec())
}

#[tauri::command]
pub async fn cmd_rotate_encryption_key(
    files: Vec<RotationEntry>,
    old_password: String,
    new_password: String,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<u32, String> {
    if old_password.is_empty() || new_password.len() < 8 {
        return Err(
            "Both passwords are required and the new password must have at least 8 characters."
                .to_string(),
        );
    }

    let client = state
        .client
        .lock()
        .await
        .clone()
        .ok_or("Telegram client not connected".to_string())?;
    let new_master = derive_master_key_v2(&new_password);
    let total = files.len();
    let mut completed = 0_u32;

    for entry in files {
        let peer = resolve_peer(&client, entry.folder_id, &state).await?;
        let message = client
            .get_messages_by_id(&peer, &[entry.message_id])
            .await
            .map_err(map_error)?
            .into_iter()
            .flatten()
            .next()
            .ok_or_else(|| format!("{} is no longer available.", entry.filename))?;
        let media = message
            .media()
            .ok_or_else(|| format!("{} has no downloadable media.", entry.filename))?;
        if !matches!(&media, Media::Document(_)) {
            return Err(format!(
                "{} is not a supported encrypted document.",
                entry.filename
            ));
        }

        let nonce: u64 = rand::thread_rng().gen();
        let temp_dir = std::env::temp_dir();
        let encrypted_old = temp_dir.join(format!("sharkdrive_rotate_{nonce}.old"));
        let plaintext = temp_dir.join(format!("sharkdrive_rotate_{nonce}.plain"));
        let encrypted_new = temp_dir.join(format!("sharkdrive_rotate_{nonce}.new"));
        let encrypted_old_str = encrypted_old.to_string_lossy().to_string();
        let plaintext_str = plaintext.to_string_lossy().to_string();
        let encrypted_new_str = encrypted_new.to_string_lossy().to_string();

        let result = async {
            let mut output = File::create(&encrypted_old)
                .await
                .map_err(|error| format!("Cannot prepare rotation temp file: {error}"))?;
            let mut download = client.iter_download(&media);
            while let Some(chunk) = download.next().await.map_err(map_error)? {
                output
                    .write_all(&chunk)
                    .await
                    .map_err(|error| format!("Cannot cache encrypted file: {error}"))?;
            }
            output.flush().await.map_err(|error| error.to_string())?;

            let old_master = if parse_caption_metadata(message.text()).encryption_version >= 2 {
                derive_master_key_v2(&old_password)
            } else {
                derive_legacy_key(&old_password)
            };
            decrypt_file(
                &folder_key(&old_master, entry.folder_id),
                &encrypted_old_str,
                &plaintext_str,
            )?;
            encrypt_file(
                &folder_key(&new_master, entry.folder_id),
                &plaintext_str,
                &encrypted_new_str,
            )?;
            let size = std::fs::metadata(&plaintext)
                .map_err(|error| error.to_string())?
                .len();
            let hash = compute_file_sha256(&plaintext_str)?;
            let uploaded = client
                .upload_file(&encrypted_new)
                .await
                .map_err(map_error)?;
            client
                .send_message(
                    &peer,
                    InputMessage::new()
                        .text(build_caption(&entry.filename, true, size, &hash))
                        .file(uploaded),
                )
                .await
                .map_err(map_error)?;
            client
                .delete_messages(&peer, &[entry.message_id])
                .await
                .map_err(map_error)?;
            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(encrypted_old);
        let _ = std::fs::remove_file(plaintext);
        let _ = std::fs::remove_file(encrypted_new);
        result?;

        completed = completed.saturating_add(1);
        let _ = app_handle.emit(
            "encryption-rotation-progress",
            RotationProgress {
                completed: completed as usize,
                total,
                filename: entry.filename,
            },
        );
    }

    Ok(completed)
}

#[tauri::command]
pub async fn cmd_encrypt_remote_files(
    files: Vec<RotationEntry>,
    password: String,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
) -> Result<u32, String> {
    if password.len() < 8 {
        return Err("Encryption password must have at least 8 characters.".to_string());
    }

    let client = state
        .client
        .lock()
        .await
        .clone()
        .ok_or("Telegram client not connected".to_string())?;
    let master = derive_master_key_v2(&password);
    let total = files.len();
    let mut completed = 0_u32;

    for entry in files {
        let peer = resolve_peer(&client, entry.folder_id, &state).await?;
        let message = client
            .get_messages_by_id(&peer, &[entry.message_id])
            .await
            .map_err(map_error)?
            .into_iter()
            .flatten()
            .next()
            .ok_or_else(|| format!("{} is no longer available.", entry.filename))?;
        if parse_caption_metadata(message.text()).encrypted {
            continue;
        }
        let media = message
            .media()
            .ok_or_else(|| format!("{} has no downloadable media.", entry.filename))?;
        if !matches!(&media, Media::Document(_)) {
            return Err(format!("{} is not a supported document.", entry.filename));
        }

        let nonce: u64 = rand::thread_rng().gen();
        let plaintext = std::env::temp_dir().join(format!("sharkdrive_encrypt_{nonce}.plain"));
        let encrypted = std::env::temp_dir().join(format!("sharkdrive_encrypt_{nonce}.enc"));
        let plaintext_str = plaintext.to_string_lossy().to_string();
        let encrypted_str = encrypted.to_string_lossy().to_string();

        let result = async {
            let mut output = File::create(&plaintext)
                .await
                .map_err(|error| format!("Cannot prepare encryption temp file: {error}"))?;
            let mut download = client.iter_download(&media);
            while let Some(chunk) = download.next().await.map_err(map_error)? {
                output
                    .write_all(&chunk)
                    .await
                    .map_err(|error| format!("Cannot cache source file: {error}"))?;
            }
            output.flush().await.map_err(|error| error.to_string())?;
            encrypt_file(
                &folder_key(&master, entry.folder_id),
                &plaintext_str,
                &encrypted_str,
            )?;
            let size = std::fs::metadata(&plaintext)
                .map_err(|error| error.to_string())?
                .len();
            let hash = compute_file_sha256(&plaintext_str)?;
            let uploaded = client.upload_file(&encrypted).await.map_err(map_error)?;
            client
                .send_message(
                    &peer,
                    InputMessage::new()
                        .text(build_caption(&entry.filename, true, size, &hash))
                        .file(uploaded),
                )
                .await
                .map_err(map_error)?;
            client
                .delete_messages(&peer, &[entry.message_id])
                .await
                .map_err(map_error)?;
            Ok::<(), String>(())
        }
        .await;

        let _ = std::fs::remove_file(plaintext);
        let _ = std::fs::remove_file(encrypted);
        result?;

        completed = completed.saturating_add(1);
        let _ = app_handle.emit(
            "encryption-rotation-progress",
            RotationProgress {
                completed: completed as usize,
                total,
                filename: entry.filename,
            },
        );
    }

    Ok(completed)
}
