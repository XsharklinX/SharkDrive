use tauri::State;
use std::sync::Mutex;

pub struct AppSettings {
    pub close_to_tray: Mutex<bool>,
}

impl AppSettings {
    pub fn new() -> Self {
        Self { close_to_tray: Mutex::new(false) }
    }
}

#[tauri::command]
pub async fn cmd_set_close_to_tray(
    enabled: bool,
    state: State<'_, AppSettings>,
) -> Result<(), String> {
    *state.close_to_tray.lock().unwrap() = enabled;
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_close_to_tray(state: State<'_, AppSettings>) -> Result<bool, String> {
    Ok(*state.close_to_tray.lock().unwrap())
}

#[tauri::command]
pub async fn cmd_set_autostart(enabled: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe.to_string_lossy().to_string();

    if enabled {
        std::process::Command::new("reg")
            .args([
                "add",
                r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
                "/v", "SharkDrive",
                "/t", "REG_SZ",
                "/d", &exe_str,
                "/f",
            ])
            .output()
            .map_err(|e| e.to_string())?;
    } else {
        std::process::Command::new("reg")
            .args([
                "delete",
                r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
                "/v", "SharkDrive",
                "/f",
            ])
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_autostart() -> Result<bool, String> {
    let output = std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            "/v", "SharkDrive",
        ])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(output.status.success())
}
