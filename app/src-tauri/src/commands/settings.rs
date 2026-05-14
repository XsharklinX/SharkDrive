use std::sync::Mutex;
use tauri::State;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct AppSettings {
    pub close_to_tray: Mutex<bool>,
}

impl AppSettings {
    pub fn new() -> Self {
        Self {
            close_to_tray: Mutex::new(false),
        }
    }
}

fn run_reg_command(args: &[&str]) -> Result<std::process::Output, String> {
    let mut command = std::process::Command::new("reg");
    command.args(args);

    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.output().map_err(|e| e.to_string())
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
        run_reg_command(&[
            "add",
            r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "SharkDrive",
            "/t",
            "REG_SZ",
            "/d",
            &exe_str,
            "/f",
        ])?;
    } else {
        run_reg_command(&[
            "delete",
            r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "SharkDrive",
            "/f",
        ])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn cmd_get_autostart() -> Result<bool, String> {
    let output = run_reg_command(&[
        "query",
        r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        "/v",
        "SharkDrive",
    ])?;
    Ok(output.status.success())
}
