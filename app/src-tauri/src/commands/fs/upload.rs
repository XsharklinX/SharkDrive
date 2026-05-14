use std::io::Read;
use std::path::{Path, PathBuf};

use grammers_client::types::media::Uploaded;
use grammers_client::InputMessage;
use grammers_tl_types as tl;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};

use crate::bandwidth::BandwidthManager;
use crate::commands::encryption::{derive_folder_key, encrypt_file, EncryptionState};
use crate::commands::fs::caption::{build_caption, compute_file_sha256, find_duplicate_message};
use crate::commands::utils::{map_error, resolve_peer};
use crate::TelegramState;

const CHUNK_SIZE: usize = 512 * 1024;
const BIG_FILE_THRESHOLD: u64 = 10 * 1024 * 1024;

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    id: String,
    percent: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct UploadCheckpoint {
    transfer_id: String,
    file_id: i64,
    folder_id: Option<i64>,
    path: String,
    upload_path: String,
    file_name: String,
    upload_size: u64,
    original_size: u64,
    encrypt: bool,
    total_parts: i32,
    completed_parts: i32,
    is_big_file: bool,
}

fn checkpoints_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?
        .join("upload_checkpoints");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create checkpoint dir: {}", e))?;
    Ok(dir)
}

fn checkpoint_path(app_handle: &tauri::AppHandle, transfer_id: &str) -> Result<PathBuf, String> {
    Ok(checkpoints_dir(app_handle)?.join(format!("{transfer_id}.json")))
}

fn load_checkpoint(
    app_handle: &tauri::AppHandle,
    transfer_id: &str,
) -> Result<Option<UploadCheckpoint>, String> {
    if transfer_id.is_empty() {
        return Ok(None);
    }
    let path = checkpoint_path(app_handle, transfer_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw =
        std::fs::read_to_string(&path).map_err(|e| format!("Cannot read checkpoint: {}", e))?;
    let checkpoint = serde_json::from_str::<UploadCheckpoint>(&raw)
        .map_err(|e| format!("Cannot parse checkpoint: {}", e))?;
    Ok(Some(checkpoint))
}

fn save_checkpoint(
    app_handle: &tauri::AppHandle,
    checkpoint: &UploadCheckpoint,
) -> Result<(), String> {
    if checkpoint.transfer_id.is_empty() {
        return Ok(());
    }
    let path = checkpoint_path(app_handle, &checkpoint.transfer_id)?;
    let json = serde_json::to_string_pretty(checkpoint)
        .map_err(|e| format!("Cannot encode checkpoint: {}", e))?;
    std::fs::write(path, json).map_err(|e| format!("Cannot save checkpoint: {}", e))?;
    Ok(())
}

fn remove_checkpoint(app_handle: &tauri::AppHandle, transfer_id: &str) {
    if transfer_id.is_empty() {
        return;
    }
    if let Ok(path) = checkpoint_path(app_handle, transfer_id) {
        let _ = std::fs::remove_file(path);
    }
}

fn compute_md5_hex(path: &str) -> Result<String, String> {
    let mut file =
        std::fs::File::open(path).map_err(|e| format!("Cannot read file for md5: {}", e))?;
    let mut context = md5::Context::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("Cannot stream file for md5: {}", e))?;
        if read == 0 {
            break;
        }
        context.consume(&buffer[..read]);
    }
    Ok(format!("{:x}", context.compute()))
}

async fn upload_with_resume(
    client: &grammers_client::Client,
    upload_path: &str,
    transfer_id: &str,
    folder_id: Option<i64>,
    original_path: &str,
    encrypt: bool,
    original_size: u64,
    app_handle: &tauri::AppHandle,
) -> Result<Uploaded, String> {
    let file_name = Path::new(upload_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let upload_size = std::fs::metadata(upload_path)
        .map_err(|e| format!("Cannot stat upload file: {}", e))?
        .len();
    let total_parts = upload_size.div_ceil(CHUNK_SIZE as u64) as i32;
    let is_big_file = upload_size > BIG_FILE_THRESHOLD;

    let mut checkpoint = match load_checkpoint(app_handle, transfer_id)? {
        Some(existing)
            if existing.path == original_path
                && existing.upload_path == upload_path
                && existing.upload_size == upload_size
                && existing.folder_id == folder_id
                && existing.encrypt == encrypt =>
        {
            existing
        }
        Some(_) | None => UploadCheckpoint {
            transfer_id: transfer_id.to_string(),
            file_id: rand::thread_rng().gen(),
            folder_id,
            path: original_path.to_string(),
            upload_path: upload_path.to_string(),
            file_name: file_name.clone(),
            upload_size,
            original_size,
            encrypt,
            total_parts,
            completed_parts: 0,
            is_big_file,
        },
    };

    if checkpoint.total_parts != total_parts {
        checkpoint.total_parts = total_parts;
        checkpoint.completed_parts = 0;
        checkpoint.upload_size = upload_size;
        checkpoint.is_big_file = is_big_file;
    }

    save_checkpoint(app_handle, &checkpoint)?;

    let md5_checksum = if checkpoint.is_big_file {
        None
    } else {
        Some(compute_md5_hex(upload_path)?)
    };

    let mut file = File::open(upload_path)
        .await
        .map_err(|e| format!("Cannot open upload file: {}", e))?;
    let start_offset = checkpoint.completed_parts.max(0) as u64 * CHUNK_SIZE as u64;
    if start_offset > 0 {
        file.seek(SeekFrom::Start(start_offset))
            .await
            .map_err(|e| format!("Cannot seek upload file: {}", e))?;
    }

    let mut part = checkpoint.completed_parts.max(0);
    while part < checkpoint.total_parts {
        let mut buffer = vec![0_u8; CHUNK_SIZE];
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|e| format!("Cannot read upload chunk: {}", e))?;
        if read == 0 {
            break;
        }
        buffer.truncate(read);

        let stored = if checkpoint.is_big_file {
            client
                .invoke(&tl::functions::upload::SaveBigFilePart {
                    file_id: checkpoint.file_id,
                    file_part: part,
                    file_total_parts: checkpoint.total_parts,
                    bytes: buffer,
                })
                .await
                .map_err(map_error)?
        } else {
            client
                .invoke(&tl::functions::upload::SaveFilePart {
                    file_id: checkpoint.file_id,
                    file_part: part,
                    bytes: buffer,
                })
                .await
                .map_err(map_error)?
        };

        if !stored {
            return Err("Telegram failed to store uploaded chunk".to_string());
        }

        part += 1;
        checkpoint.completed_parts = part;
        save_checkpoint(app_handle, &checkpoint)?;

        if !transfer_id.is_empty() {
            let percent = ((checkpoint.completed_parts as f64 / checkpoint.total_parts as f64)
                * 100.0)
                .round()
                .clamp(0.0, 100.0) as u8;
            let _ = app_handle.emit(
                "upload-progress",
                ProgressPayload {
                    id: transfer_id.to_string(),
                    percent,
                },
            );
        }
    }

    Ok(if checkpoint.is_big_file {
        Uploaded::from_raw(
            tl::types::InputFileBig {
                id: checkpoint.file_id,
                parts: checkpoint.total_parts,
                name: checkpoint.file_name,
            }
            .into(),
        )
    } else {
        Uploaded::from_raw(
            tl::types::InputFile {
                id: checkpoint.file_id,
                parts: checkpoint.total_parts,
                name: checkpoint.file_name,
                md5_checksum: md5_checksum.unwrap_or_default(),
            }
            .into(),
        )
    })
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
    let size = std::fs::metadata(&path)
        .map_err(|e| format!("Cannot read file: {}", e))?
        .len();
    const MAX_FILE_SIZE: u64 = 2 * 1024 * 1024 * 1024;
    if size > MAX_FILE_SIZE {
        return Err(format!(
            "File too large ({:.1} GB). Telegram supports a maximum of 2 GB per file.",
            size as f64 / (1024.0 * 1024.0 * 1024.0)
        ));
    }
    bw_state.can_transfer(size)?;

    let original_name = std::path::Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let file_hash = compute_file_sha256(&path)?;

    let tid = transfer_id.unwrap_or_default();

    let should_encrypt = encrypt.unwrap_or(false);
    let enc_key = if should_encrypt {
        enc_state.key.lock().unwrap().clone()
    } else {
        None
    };

    let caption = build_caption(
        &original_name,
        should_encrypt && enc_key.is_some(),
        size,
        &file_hash,
    );

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

    if find_duplicate_message(&client, folder_id, &original_name, size, &file_hash)
        .await?
        .is_some()
    {
        remove_checkpoint(&app_handle, &tid);
        if let Some(tmp) = temp_path {
            let _ = std::fs::remove_file(tmp);
        }
        return Ok("duplicate".to_string());
    }

    if !tid.is_empty() {
        let _ = app_handle.emit(
            "upload-progress",
            ProgressPayload {
                id: tid.clone(),
                percent: 0,
            },
        );
    }

    let uploaded_file = upload_with_resume(
        &client,
        &upload_path,
        &tid,
        folder_id,
        &path,
        should_encrypt && enc_key.is_some(),
        size,
        &app_handle,
    )
    .await?;

    let message = InputMessage::new().text(caption).file(uploaded_file);
    let peer = resolve_peer(&client, folder_id).await?;
    client
        .send_message(&peer, message)
        .await
        .map_err(map_error)?;

    bw_state.add_up(size);
    remove_checkpoint(&app_handle, &tid);

    if let Some(tmp) = temp_path {
        let _ = std::fs::remove_file(tmp);
    }

    if !tid.is_empty() {
        let _ = app_handle.emit(
            "upload-progress",
            ProgressPayload {
                id: tid,
                percent: 100,
            },
        );
    }

    Ok("File uploaded successfully".to_string())
}
