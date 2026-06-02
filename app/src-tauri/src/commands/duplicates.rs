use std::collections::HashMap;
use tauri::State;

use crate::index_store::PersistentIndexState;
use crate::models::FileMetadata;
use serde::Serialize;

#[derive(Serialize)]
pub struct DuplicateGroup {
    /// Human-readable key shown in the UI
    pub display_key: String,
    /// All files (across different folders) sharing this name+size
    pub files: Vec<FileMetadata>,
    /// Bytes wasted = size × (count − 1)
    pub wasted_bytes: u64,
}

/// Scan the persistent index for files that share the same filename (case-insensitive)
/// and exact byte size — a strong heuristic for identical content without downloading.
/// Groups with only one file are excluded. Results are sorted by most wasted bytes.
#[tauri::command]
pub fn cmd_find_duplicates(
    index_state: State<'_, PersistentIndexState>,
) -> Vec<DuplicateGroup> {
    let all_files = index_state.get_all_files();

    let mut groups: HashMap<String, Vec<FileMetadata>> = HashMap::new();
    for file in all_files {
        let key = format!("{}::{}", file.name.to_lowercase(), file.size);
        groups.entry(key).or_default().push(file);
    }

    let mut result: Vec<DuplicateGroup> = groups
        .into_values()
        .filter(|files| files.len() > 1)
        .map(|files| {
            let size = files[0].size;
            let count = files.len() as u64;
            let wasted_bytes = size.saturating_mul(count - 1);
            let display_key = format!("{} ({})", files[0].name, format_bytes(size));
            DuplicateGroup {
                display_key,
                files,
                wasted_bytes,
            }
        })
        .collect();

    result.sort_by(|a, b| b.wasted_bytes.cmp(&a.wasted_bytes));
    result
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.0} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}
