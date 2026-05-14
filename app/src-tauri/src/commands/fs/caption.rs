use grammers_client::types::Media;
use sha2::{Digest, Sha256};

use crate::commands::utils::resolve_peer;

#[derive(Default, Clone)]
pub(crate) struct CaptionMetadata {
    pub display_name: Option<String>,
    pub original_size: Option<u64>,
    pub sha256: Option<String>,
    pub encrypted: bool,
}

pub(crate) const FOLDER_MARKER: &str = "[sharkdrive-folder]";
pub(crate) const LEGACY_FOLDER_MARKER: &str = "[telegram-drive-folder]";
const FOLDER_PARENT_PREFIX: &str = "[SD_PARENT:";

pub(crate) fn parse_caption_metadata(text: &str) -> CaptionMetadata {
    let mut metadata = CaptionMetadata::default();

    for segment in text.split('[').skip(1) {
        let token = format!("[{}", segment);
        if let Some(value) = token
            .strip_prefix("[SD-ENC:")
            .and_then(|v| v.strip_suffix(']'))
        {
            metadata.display_name = Some(value.to_string());
            metadata.encrypted = true;
            continue;
        }
        if let Some(value) = token
            .strip_prefix("[SD_NAME:")
            .and_then(|v| v.strip_suffix(']'))
        {
            metadata.display_name = Some(value.to_string());
            continue;
        }
        if let Some(value) = token
            .strip_prefix("[SD_SIZE:")
            .and_then(|v| v.strip_suffix(']'))
        {
            metadata.original_size = value.parse::<u64>().ok();
            continue;
        }
        if let Some(value) = token
            .strip_prefix("[SD_HASH:")
            .and_then(|v| v.strip_suffix(']'))
        {
            metadata.sha256 = Some(value.to_lowercase());
        }
    }

    metadata
}

pub(crate) fn build_caption(
    name: &str,
    encrypted: bool,
    original_size: u64,
    sha256: &str,
) -> String {
    let name_marker = if encrypted {
        format!("[SD-ENC:{}]", name)
    } else {
        format!("[SD_NAME:{}]", name)
    };

    format!("{name_marker}[SD_SIZE:{original_size}][SD_HASH:{sha256}]")
}

pub(crate) fn build_folder_about(parent_id: Option<i64>) -> String {
    match parent_id {
        Some(parent_id) => format!(
            "SharkDrive Storage Folder\n{FOLDER_MARKER}\n{FOLDER_PARENT_PREFIX}{parent_id}]"
        ),
        None => format!("SharkDrive Storage Folder\n{FOLDER_MARKER}"),
    }
}

pub(crate) fn update_folder_about_parent(about: &str, parent_id: Option<i64>) -> String {
    let mut lines: Vec<String> = about
        .lines()
        .filter(|line| !line.contains(FOLDER_PARENT_PREFIX))
        .filter(|line| !line.contains(LEGACY_FOLDER_MARKER))
        .map(|line| line.trim_end().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    if !lines.iter().any(|line| line.contains(FOLDER_MARKER)) {
        lines.push(FOLDER_MARKER.to_string());
    }

    if let Some(parent_id) = parent_id {
        lines.push(format!("{FOLDER_PARENT_PREFIX}{parent_id}]"));
    }

    lines.join("\n")
}

pub(crate) fn parse_folder_parent_id(about: &str) -> Option<i64> {
    about.split('[').skip(1).find_map(|segment| {
        let token = format!("[{}", segment);
        token
            .strip_prefix(FOLDER_PARENT_PREFIX)
            .and_then(|value| value.strip_suffix(']'))
            .and_then(|value| value.parse::<i64>().ok())
    })
}

pub(crate) fn compute_file_sha256(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Cannot read file for hash: {}", e))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

pub(crate) fn display_name_from_metadata(
    raw_name: String,
    msg_text: &str,
) -> (String, CaptionMetadata) {
    let metadata = parse_caption_metadata(msg_text);
    let display_name = metadata.display_name.clone().unwrap_or(raw_name);
    (display_name, metadata)
}

pub(crate) async fn find_duplicate_message(
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

#[cfg(test)]
mod tests {
    use super::{
        build_caption, build_folder_about, display_name_from_metadata, parse_caption_metadata,
        parse_folder_parent_id, update_folder_about_parent, FOLDER_MARKER,
    };

    #[test]
    fn parses_caption_metadata_round_trip() {
        let caption = build_caption("book.epub", true, 12345, "ABCDEF123");
        let metadata = parse_caption_metadata(&caption);

        assert_eq!(metadata.display_name.as_deref(), Some("book.epub"));
        assert_eq!(metadata.original_size, Some(12345));
        assert_eq!(metadata.sha256.as_deref(), Some("abcdef123"));
        assert!(metadata.encrypted);
    }

    #[test]
    fn display_name_falls_back_to_raw_name() {
        let (name, metadata) = display_name_from_metadata("raw.pdf".to_string(), "plain caption");
        assert_eq!(name, "raw.pdf");
        assert!(!metadata.encrypted);
        assert!(metadata.sha256.is_none());
    }

    #[test]
    fn parses_folder_parent_marker() {
        let about = build_folder_about(Some(42));
        assert!(about.contains(FOLDER_MARKER));
        assert_eq!(parse_folder_parent_id(&about), Some(42));
    }

    #[test]
    fn updates_folder_about_without_losing_marker() {
        let initial = build_folder_about(None);
        let updated = update_folder_about_parent(&initial, Some(99));
        let reset = update_folder_about_parent(&updated, None);

        assert!(updated.contains(FOLDER_MARKER));
        assert_eq!(parse_folder_parent_id(&updated), Some(99));
        assert_eq!(parse_folder_parent_id(&reset), None);
        assert!(reset.contains(FOLDER_MARKER));
    }
}
