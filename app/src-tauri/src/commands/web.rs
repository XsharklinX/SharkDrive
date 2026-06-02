use std::sync::Arc;
use tauri::State;

use crate::web_auth::WebAuthState;

#[tauri::command]
pub fn cmd_set_web_pin(
    pin: String,
    web_auth: State<'_, Arc<WebAuthState>>,
) -> Result<(), String> {
    web_auth.set_pin(&pin)
}

#[tauri::command]
pub fn cmd_clear_web_pin(
    web_auth: State<'_, Arc<WebAuthState>>,
) {
    web_auth.clear_pin();
}

#[tauri::command]
pub fn cmd_has_web_pin(
    web_auth: State<'_, Arc<WebAuthState>>,
) -> bool {
    web_auth.has_pin()
}

#[tauri::command]
pub async fn cmd_get_web_access_url() -> String {
    let ip = detect_local_ip();
    format!("http://{}:14200/web", ip)
}

fn detect_local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .ok()
        .and_then(|s| s.connect("8.8.8.8:80").ok().map(|_| s))
        .and_then(|s| s.local_addr().ok())
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string())
}
