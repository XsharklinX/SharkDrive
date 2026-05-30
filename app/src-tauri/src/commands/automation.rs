use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{DateTime, Local, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::index_store::PersistentIndexState;
use crate::models::FileMetadata;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct CleanupRule {
    pub folder_id: Option<i64>,
    pub max_age_days: u32,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct AutomationConfig {
    pub scheduled_sync_time: Option<String>,
    #[serde(default)]
    pub cleanup_rules: Vec<CleanupRule>,
    #[serde(default)]
    last_scheduled_sync_date: Option<String>,
}

pub struct AutomationState {
    path: PathBuf,
    inner: Mutex<AutomationConfig>,
}

impl AutomationState {
    pub fn new(path: PathBuf) -> Self {
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<AutomationConfig>(&raw).ok())
            .unwrap_or_default();

        Self {
            path,
            inner: Mutex::new(inner),
        }
    }

    pub fn take_due_scheduled_sync(&self) -> bool {
        let now = Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        let Ok(mut config) = self.inner.lock() else {
            return false;
        };
        let Some(scheduled_time) = config
            .scheduled_sync_time
            .as_deref()
            .and_then(|value| chrono::NaiveTime::parse_from_str(value, "%H:%M").ok())
        else {
            return false;
        };

        if now.time() < scheduled_time
            || config.last_scheduled_sync_date.as_deref() == Some(today.as_str())
        {
            return false;
        }

        config.last_scheduled_sync_date = Some(today);
        self.persist_locked(&config);
        true
    }

    fn persist_locked(&self, config: &AutomationConfig) {
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(config) {
            let _ = std::fs::write(&self.path, raw);
        }
    }
}

fn is_valid_time(value: &str) -> bool {
    chrono::NaiveTime::parse_from_str(value, "%H:%M").is_ok()
}

fn parse_created_at(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            NaiveDateTime::parse_from_str(value.trim_end_matches(" UTC"), "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|date| date.and_utc())
        })
}

#[tauri::command]
pub fn cmd_get_automation_config(
    state: State<'_, AutomationState>,
) -> Result<AutomationConfig, String> {
    state
        .inner
        .lock()
        .map(|value| value.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_set_scheduled_sync_time(
    time: Option<String>,
    state: State<'_, AutomationState>,
) -> Result<(), String> {
    let normalized = time
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(value) = normalized.as_deref() {
        if !is_valid_time(value) {
            return Err("Scheduled sync time must use HH:MM format".to_string());
        }
    }

    let mut config = state.inner.lock().map_err(|e| e.to_string())?;
    config.scheduled_sync_time = normalized;
    config.last_scheduled_sync_date = None;
    state.persist_locked(&config);
    Ok(())
}

#[tauri::command]
pub fn cmd_set_cleanup_rules(
    rules: Vec<CleanupRule>,
    state: State<'_, AutomationState>,
) -> Result<(), String> {
    if rules.iter().any(|rule| rule.max_age_days == 0) {
        return Err("Cleanup age must be at least one day".to_string());
    }

    let mut config = state.inner.lock().map_err(|e| e.to_string())?;
    config.cleanup_rules = rules;
    state.persist_locked(&config);
    Ok(())
}

#[tauri::command]
pub fn cmd_get_due_cleanup_files(
    automation_state: State<'_, AutomationState>,
    index_state: State<'_, PersistentIndexState>,
) -> Result<Vec<FileMetadata>, String> {
    let rules = automation_state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .cleanup_rules
        .clone();
    let now = Utc::now();

    Ok(index_state
        .get_all_files()
        .into_iter()
        .filter(|file| {
            let Some(rule) = rules.iter().find(|rule| rule.folder_id == file.folder_id) else {
                return false;
            };
            let Some(created_at) = parse_created_at(&file.created_at) else {
                return false;
            };
            now.signed_duration_since(created_at).num_days() >= i64::from(rule.max_age_days)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{is_valid_time, parse_created_at};

    #[test]
    fn validates_daily_sync_time() {
        assert!(is_valid_time("08:30"));
        assert!(is_valid_time("23:59"));
        assert!(!is_valid_time("24:00"));
        assert!(!is_valid_time("8:30"));
    }

    #[test]
    fn parses_telegram_timestamp() {
        assert!(parse_created_at("2026-05-30 10:15:20 UTC").is_some());
        assert!(parse_created_at("2026-05-30T10:15:20+00:00").is_some());
    }
}
