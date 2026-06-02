use std::io::{Read as _, Write};

use grammers_client::types::Media;
use tauri::{Emitter, State};

use crate::bandwidth::BandwidthManager;
use crate::commands::encryption::{decrypt_file, derive_folder_key, EncryptionState};
use crate::commands::fs::caption::parse_caption_metadata;
use crate::commands::utils::resolve_peer;
use crate::TelegramState;
use zip::write::SimpleFileOptions;

#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    id: String,
    percent: u8,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipDownloadEntry {
    pub message_id: i32,
    pub folder_id: Option<i64>,
    pub filename: String,
}

fn safe_zip_name(filename: &str) -> String {
    let clean = filename
        .replace('\\', "_")
        .replace('/', "_")
        .replace(':', "_")
        .replace('*', "_")
        .replace('?', "_")
        .replace('"', "_")
        .replace('<', "_")
        .replace('>', "_")
        .replace('|', "_");
    if clean.trim().is_empty() {
        "file.bin".to_string()
    } else {
        clean
    }
}

fn unique_zip_name(name: &str, used: &mut std::collections::HashSet<String>) -> String {
    if used.insert(name.to_string()) {
        return name.to_string();
    }

    let path = std::path::Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("file");
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");

    for index in 2.. {
        let candidate = if ext.is_empty() {
            format!("{stem} ({index})")
        } else {
            format!("{stem} ({index}).{ext}")
        };
        if used.insert(candidate.clone()) {
            return candidate;
        }
    }

    name.to_string()
}

async fn download_message_to_path(
    message_id: i32,
    save_path: &str,
    folder_id: Option<i64>,
    app_handle: &tauri::AppHandle,
    state: &TelegramState,
    bw_state: &BandwidthManager,
    enc_state: &EncryptionState,
    transfer_id: Option<&str>,
) -> Result<(), String> {
    let tid = transfer_id.unwrap_or_default().to_string();

    let client_opt = { state.client.lock().await.clone() };
    let client = client_opt.ok_or("Telegram client not connected".to_string())?;

    let peer = resolve_peer(&client, folder_id, state).await?;
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

    let part_path = format!("{}.part", save_path);
    // Create parent directories if needed (e.g. folder-tree downloads)
    if let Some(parent) = std::path::Path::new(&part_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut download_iter = client.iter_download(&media);
    let mut file = std::fs::File::create(&part_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_percent: u8 = 0;

    let chunk_result = async {
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
        Ok::<(), String>(())
    }
    .await;

    if let Err(e) = chunk_result {
        let _ = std::fs::remove_file(&part_path);
        return Err(e);
    }

    std::fs::rename(&part_path, save_path).map_err(|e| {
        let _ = std::fs::remove_file(&part_path);
        e.to_string()
    })?;

    bw_state.add_down(total_size);

    let metadata = parse_caption_metadata(msg.text());
    if metadata.encrypted {
        let enc_key = enc_state.active_key(metadata.encryption_version)?;
        if let Some(master) = enc_key {
            let active_key = match folder_id {
                Some(id) => derive_folder_key(&master, id),
                None => master,
            };
            let tmp = format!("{}.enc_tmp", save_path);
            std::fs::rename(save_path, &tmp).map_err(|e| e.to_string())?;
            if let Err(e) = decrypt_file(&active_key, &tmp, save_path) {
                let _ = std::fs::rename(&tmp, save_path);
                return Err(format!("Decryption failed: {}", e));
            }
            let _ = std::fs::remove_file(tmp);
        } else {
            let _ = std::fs::remove_file(save_path);
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

    Ok(())
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
    download_message_to_path(
        message_id,
        &save_path,
        folder_id,
        &app_handle,
        &state,
        &bw_state,
        &enc_state,
        transfer_id.as_deref(),
    )
    .await?;
    Ok("Download successful".to_string())
}

#[tauri::command]
pub async fn cmd_download_files_zip(
    files: Vec<ZipDownloadEntry>,
    save_path: String,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
    enc_state: State<'_, EncryptionState>,
) -> Result<String, String> {
    if files.is_empty() {
        return Err("No files selected".to_string());
    }

    let parent = std::path::Path::new(&save_path)
        .parent()
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(std::env::temp_dir);
    let temp_dir = parent.join(format!(
        "sharkdrive_zip_{}",
        chrono::Utc::now().timestamp_millis()
    ));
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let part_zip = format!("{}.part", save_path);
    let zip_result = async {
        let mut downloaded_paths = Vec::new();
        for entry in &files {
            let safe_name = safe_zip_name(&entry.filename);
            let temp_file = temp_dir.join(format!("{}_{}", entry.message_id, safe_name));
            let temp_file_str = temp_file.to_string_lossy().to_string();
            download_message_to_path(
                entry.message_id,
                &temp_file_str,
                entry.folder_id,
                &app_handle,
                &state,
                &bw_state,
                &enc_state,
                None,
            )
            .await?;
            downloaded_paths.push((safe_name, temp_file));
        }

        let zip_file = std::fs::File::create(&part_zip).map_err(|e| e.to_string())?;
        let mut writer = zip::ZipWriter::new(zip_file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        let mut used_names = std::collections::HashSet::new();

        for (name, path) in downloaded_paths {
            let zip_name = unique_zip_name(&name, &mut used_names);
            writer
                .start_file(zip_name, options)
                .map_err(|e| e.to_string())?;
            let mut source = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut source, &mut writer).map_err(|e| e.to_string())?;
        }

        writer.finish().map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    }
    .await;

    let _ = std::fs::remove_dir_all(&temp_dir);

    if let Err(error) = zip_result {
        let _ = std::fs::remove_file(&part_zip);
        return Err(error);
    }

    std::fs::rename(&part_zip, &save_path).map_err(|e| {
        let _ = std::fs::remove_file(&part_zip);
        e.to_string()
    })?;

    Ok(save_path)
}

/// Download a .zip file from Telegram and extract its contents to `dest_dir`.
/// Returns the list of extracted file paths.
#[tauri::command]
pub async fn cmd_extract_zip(
    message_id: i32,
    folder_id: Option<i64>,
    dest_dir: String,
    app_handle: tauri::AppHandle,
    state: State<'_, TelegramState>,
    bw_state: State<'_, BandwidthManager>,
    enc_state: State<'_, EncryptionState>,
) -> Result<Vec<String>, String> {
    // Download the zip to a temp file
    let temp_dir = std::env::temp_dir();
    let temp_zip = temp_dir.join(format!("sharkdrive_extract_{}.zip", message_id));
    let temp_zip_str = temp_zip.to_string_lossy().to_string();

    download_message_to_path(
        message_id,
        &temp_zip_str,
        folder_id,
        &app_handle,
        &state,
        &bw_state,
        &enc_state,
        None,
    )
    .await?;

    // Extract
    let dest = std::path::Path::new(&dest_dir);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    let zip_file = std::fs::File::open(&temp_zip).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| e.to_string())?;
    let mut extracted: Vec<String> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_name = entry.name().replace('\\', "/");
        // Skip macOS metadata entries
        if entry_name.starts_with("__MACOSX") || entry_name.contains("/.") {
            continue;
        }
        let out_path = dest.join(&entry_name);
        if entry_name.ends_with('/') {
            std::fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            out_file.write_all(&buf).map_err(|e| e.to_string())?;
            extracted.push(out_path.to_string_lossy().to_string());
        }
    }

    let _ = std::fs::remove_file(temp_zip);
    Ok(extracted)
}
