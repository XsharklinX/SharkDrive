use grammers_client::types::Peer;
use grammers_client::types::{LoginToken, PasswordToken};
use grammers_client::Client;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Tracks the lifecycle of the Telegram connection
///
/// IMPORTANT: The `runner_shutdown` field is critical for preventing stack overflow.
/// When reconnecting, we MUST shutdown the old runner before spawning a new one.
/// Without this, runner tasks accumulate and exhaust the thread stack.
#[derive(Clone)]
pub struct TelegramState {
    pub client: Arc<Mutex<Option<Client>>>,
    pub login_token: Arc<Mutex<Option<LoginToken>>>,
    pub password_token: Arc<Mutex<Option<PasswordToken>>>,
    pub api_id: Arc<Mutex<Option<i32>>>,
    pub peer_cache: Arc<Mutex<HashMap<String, Peer>>>,
    /// Send to this channel to request runner shutdown.
    /// Uses std::sync::Mutex (not tokio) so it can be locked from synchronous
    /// contexts like the RunEvent::Exit handler.
    pub runner_shutdown: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    /// Counter for debugging runner lifecycle
    pub runner_count: Arc<std::sync::atomic::AtomicU32>,
}

pub mod accounts;
pub mod auth;
pub mod automation;
pub mod backup;
pub mod duplicates;
pub mod encryption;
pub mod encryption_rotation;
pub mod fs;
pub mod network;
pub mod preview;
pub mod settings;
pub mod share;
pub mod streaming;
pub mod utils;
pub mod versions;
pub mod web;

pub use accounts::*;
pub use auth::*;
pub use automation::*;
pub use backup::*;
pub use duplicates::*;
pub use encryption::*;
pub use encryption_rotation::*;
pub use fs::*;
pub use network::*;
pub use preview::*;
pub use settings::*;
pub use share::*;
pub use streaming::*;
pub use utils::*;
pub use versions::*;
pub use web::*;
