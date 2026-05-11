# SharkDrive — Complete Architecture & Handoff Document

> **Version:** 1.5.0  
> **Last updated:** 2026-05-10  
> **For:** Any AI assistant (Codex, GPT, Gemini, etc.) continuing development.  
> This document is the single source of truth for the full project.

---

## 1. What This App Is

**SharkDrive** is a desktop application that uses Telegram as a cloud storage backend. The user authenticates with their Telegram account and can upload/download files to their Saved Messages or to Telegram Channels that act as folders. Files can be optionally encrypted with AES-256-GCM before upload.

**Think of it as:** A self-hosted Google Drive where Telegram is the storage layer.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | **Tauri v2** (Rust backend + Webview frontend) |
| Frontend | **React 18** + **TypeScript** + **Vite** |
| Styling | **Tailwind CSS v4** with custom `telegram-*` color tokens |
| Telegram API | **grammers** (Rust MTProto library) |
| State / Data | **@tanstack/react-query v5** + **@tauri-apps/plugin-store** |
| Streaming Server | **actix-web** (embedded HTTP server on port 14200) |
| Encryption | **AES-256-GCM** via `aes-gcm` crate, key derived with `SHA-256` |
| Notifications | Web Notifications API (available in Tauri webview) |
| Toasts | `sonner` |
| Icons | `lucide-react` |

---

## 3. Repository Structure

```
Telegram-Drive/
├── Docs/                          ← You are here
│   └── ARCHITECTURE.md
├── README.md                      ← User-facing readme
├── CHANGELOG.md
└── app/                           ← Main application
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── src/                       ← Frontend (React/TS)
    │   ├── main.tsx               ← Entry point, QueryClientProvider, ThemeProvider
    │   ├── App.tsx                ← Auth routing (AuthWizard ↔ Dashboard)
    │   ├── types.ts               ← All shared TypeScript interfaces
    │   ├── utils.ts               ← formatBytes, formatDate helpers
    │   ├── components/
    │   │   ├── AuthWizard.tsx     ← Multi-step Telegram login flow
    │   │   ├── Dashboard.tsx      ← Main app shell, all state orchestration
    │   │   ├── ErrorBoundary.tsx
    │   │   ├── FileTypeIcon.tsx   ← Extension → icon mapping
    │   │   ├── ThemeToggle.tsx
    │   │   ├── UpdateBanner.tsx   ← Auto-updater notification
    │   │   └── dashboard/
    │   │       ├── Sidebar.tsx         ← Folder list, create folder, sync/logout
    │   │       ├── SidebarItem.tsx     ← Single folder row + context menu
    │   │       ├── TopBar.tsx          ← Search, view toggle, upload buttons
    │   │       ├── FileExplorer.tsx    ← Grid/List view with virtualization
    │   │       ├── FileCard.tsx        ← Grid card component
    │   │       ├── FileListItem.tsx    ← List row component
    │   │       ├── GalleryView.tsx     ← Photo-only masonry gallery
    │   │       ├── ContextMenu.tsx     ← Right-click menu for files
    │   │       ├── PreviewModal.tsx    ← File preview overlay
    │   │       ├── MediaPlayer.tsx     ← Video/audio player (streams via local server)
    │   │       ├── PdfViewer.tsx       ← PDF renderer (react-pdf)
    │   │       ├── RenameModal.tsx     ← Rename file/folder dialog
    │   │       ├── MoveToFolderModal.tsx ← Move files between folders
    │   │       ├── ShareModal.tsx      ← Create/revoke share links
    │   │       ├── SettingsModal.tsx   ← App settings (encryption key, backup, etc.)
    │   │       ├── UploadQueue.tsx     ← Upload progress panel
    │   │       ├── DownloadQueue.tsx   ← Download progress panel
    │   │       ├── BandwidthWidget.tsx ← Upload/download stats display
    │   │       ├── DragDropOverlay.tsx ← Full-screen drag target overlay
    │   │       ├── ExternalDropBlocker.tsx
    │   │       └── EmptyState.tsx
    │   ├── hooks/
    │   │   ├── useTelegramConnection.ts ← Folders, auth, sync, reconnect
    │   │   ├── useFileUpload.ts         ← Upload queue, retry, clipboard paste
    │   │   ├── useFileDownload.ts       ← Download queue, notifications
    │   │   ├── useFileOperations.ts     ← Delete, move, rename, share
    │   │   ├── useFileDrop.ts           ← Drag-and-drop state
    │   │   ├── useAutoSync.ts           ← Periodic sync timer
    │   │   ├── useKeyboardShortcuts.ts  ← Ctrl+A, Delete, Escape, Ctrl+V
    │   │   ├── useNetworkStatus.ts      ← Online/offline detection
    │   │   └── useUpdateCheck.ts        ← Tauri updater plugin
    │   ├── context/
    │   │   ├── ConfirmContext.tsx   ← Custom confirm dialog (replaces window.confirm)
    │   │   └── ThemeContext.tsx     ← Dark/Light/System theme
    │   └── contexts/
    │       └── DropZoneContext.tsx  ← Global drag-over state
    └── src-tauri/                  ← Rust backend
        ├── Cargo.toml
        ├── tauri.conf.json         ← App ID, version, bundle config
        └── src/
            ├── main.rs             ← Tauri entry (calls lib.rs::run())
            ├── lib.rs              ← App setup, state management, tray, server start
            ├── models.rs           ← Serde structs: FileMetadata, FolderMetadata, etc.
            ├── bandwidth.rs        ← BandwidthManager, tracks bytes in/out per day
            ├── server.rs           ← Actix HTTP server (streaming + share endpoints)
            └── commands/
                ├── mod.rs          ← TelegramState struct, re-exports all commands
                ├── auth.rs         ← Login flow (phone → code → password → session)
                ├── fs.rs           ← Files: upload, download, delete, move, rename, list
                ├── preview.rs      ← Thumbnails, file preview bytes
                ├── encryption.rs   ← AES-256-GCM encrypt/decrypt, key management
                ├── backup.rs       ← Local folder watcher, auto-backup
                ├── network.rs      ← Connection check, IP
                ├── settings.rs     ← close_to_tray, autostart
                ├── share.rs        ← In-memory share token store
                ├── streaming.rs    ← Stream token command
                └── utils.rs        ← resolve_peer, map_error helpers
```

---

## 4. Data Model

### TypeScript (frontend — `src/types.ts`)

```typescript
interface TelegramFile {
  id: number;          // Telegram message ID
  name: string;
  size: number;        // bytes
  sizeStr: string;     // human-readable
  created_at?: string;
  type?: 'folder' | 'file';
  is_encrypted?: boolean;
}

interface TelegramFolder {
  id: number;          // Telegram channel ID
  name: string;
  parent_id?: number;
}

interface QueueItem {
  id: string;          // random client-side UUID
  path: string;        // absolute local path
  folderId: number | null;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'cancelled';
  error?: string;
  progress?: number;   // 0–100
  encrypt?: boolean;
}

interface BandwidthStats {
  up_bytes: number;
  down_bytes: number;
  date?: string;
}

interface DownloadItem {
  id: string;
  messageId: number;
  filename: string;
  folderId: number | null;
  status: 'pending' | 'downloading' | 'success' | 'error' | 'cancelled';
  error?: string;
  progress?: number;
}

interface BackupFolder {
  local_path: string;
  remote_folder_id: number | null;
  enabled: boolean;
}

interface AppConfig {
  autoSyncInterval: number;    // minutes; 0 = disabled
  encryptionEnabled: boolean;
  closeToTray: boolean;
  autostart: boolean;
}
```

### Rust (backend — `src-tauri/src/models.rs`)

```rust
pub struct FileMetadata {
  pub id: i64,
  pub folder_id: Option<i64>,
  pub name: String,
  pub size: u64,
  pub mime_type: Option<String>,
  pub file_ext: Option<String>,
  pub created_at: String,
  pub icon_type: String,
  pub is_encrypted: bool,
}

pub struct FolderMetadata {
  pub id: i64,
  pub parent_id: Option<i64>,
  pub name: String,
}
```

---

## 5. How Telegram Storage Works

### Folders = Telegram Channels
Each "folder" in SharkDrive is a Telegram Broadcast Channel created via `channels.CreateChannel`. The channel title is formatted as: `FolderName [TD]` (the `[TD]` tag lets the sync scanner identify SharkDrive folders).

**Saved Messages** (the `null` folder) = the user's own Telegram saved messages chat. This is the default storage location.

### Files = Telegram Messages with Documents
Each file upload creates a Telegram message with the file attached as a document. Metadata is stored in the message caption using custom markers.

### Caption Markers (the "protocol")

| Marker | Meaning |
|---|---|
| `[SD_NAME:filename.ext]` | The actual file name (overrides Telegram's sanitized name) |
| `[SD-ENC:filename.ext]` | File is AES-256-GCM encrypted; original name inside marker |
| `[SD-DEL]` | File is soft-deleted (hidden from listing but message still exists) |
| `[SD-TRASH]` | Folder is in the trash (added to channel description) |
| `[TD]` | In channel title — marks it as a SharkDrive folder |
| `[telegram-drive-folder]` | In channel description — additional folder marker |

### Peer Resolution (`commands/utils.rs`)
- `folder_id = None` → `InputPeer::PeerSelf` (Saved Messages)
- `folder_id = Some(id)` → `InputPeer::Channel` (requires access_hash lookup via `client.resolve_username` or cached from channel list)

---

## 6. Encryption System

### How it works

1. User sets a **master password** in Settings → calls `cmd_set_encryption_key(password)`
2. Rust hashes it: `SHA-256(password_bytes)` → 32-byte master key stored in `EncryptionState { key: Mutex<Option<Vec<u8>>> }`
3. **Per-folder key derivation**: `SHA-256(master_key || folder_id.to_le_bytes())` — each folder uses a unique encryption key, preventing cross-folder decryption attacks
4. For Saved Messages (folder_id = None): uses master key directly
5. On upload with `encrypt: true`:
   - File is encrypted to a temp path using `encrypt_file(key, input_path, output_path)`
   - Temp encrypted file is uploaded to Telegram
   - Caption uses `[SD-ENC:original_filename]` marker
6. On download, `[SD-ENC:...]` detected → decrypt after download using `decrypt_file(key, ...)`

### Encryption format (AES-256-GCM)
```
[ 12 bytes nonce ][ ciphertext + 16 bytes GCM tag ]
```

### Per-folder auto-encrypt (frontend)
- `encryptedFolderIds: Set<number>` persisted in plugin-store as `number[]`
- Key: `'encryptedFolderIds'` in store
- When user uploads to a folder in this Set, `encrypt: true` is passed automatically
- Toggle via sidebar context menu → "Enable/Disable Auto-Encrypt"

---

## 7. All Tauri Commands (IPC API)

These are invoked from the frontend via `invoke('cmd_name', { ...args })`.

### Authentication (`auth.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_auth_request_code` | `phone: String, api_id: i32, api_hash: String` | `()` | Sends SMS/Telegram code |
| `cmd_auth_sign_in` | `code: String` | `String` ("password" or "done") | Submits verification code |
| `cmd_auth_check_password` | `password: String` | `()` | 2FA password |
| `cmd_connect` | `api_id: i32` | `()` | Restores session from saved credentials |
| `cmd_logout` | — | `()` | Signs out from Telegram |

### File System (`fs.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_get_files` | `folder_id: Option<i64>` | `Vec<FileMetadata>` | List files in folder or Saved Messages |
| `cmd_upload_file` | `path: String, folder_id: Option<i64>, transfer_id: String, encrypt: bool` | `()` | Upload file; emits `upload-progress` events |
| `cmd_download_file` | `message_id: i32, folder_id: Option<i64>, filename: String, transfer_id: String` | `()` | Download file; emits `download-progress` events |
| `cmd_delete_file` | `message_id: i32, folder_id: Option<i64>` | `()` | Hard-delete a message/file |
| `cmd_move_files` | `message_ids: Vec<i32>, source_folder_id: Option<i64>, target_folder_id: Option<i64>` | `()` | Move files between folders |
| `cmd_rename_file` | `message_id: i32, folder_id: Option<i64>, new_name: String` | `()` | Edit caption to update `[SD_NAME:]` marker |
| `cmd_create_folder` | `name: String` | `FolderMetadata` | Create Telegram channel |
| `cmd_delete_folder` | `folder_id: i64` | `bool` | Delete Telegram channel |
| `cmd_scan_folders` | — | `Vec<TelegramFolder>` | Scan all channels for `[TD]` tag |
| `cmd_get_or_create_trash` | — | `i64` | Find or create the trash channel |
| `cmd_soft_delete_folder` | `folder_id: i64, display_name: String` | `()` | Mark folder as trashed |
| `cmd_restore_folder` | `folder_id: i64, display_name: String` | `()` | Remove trash marker from folder |
| `cmd_get_trashed_folders` | — | `Vec<FolderMetadata>` | List folders with `[SD-TRASH]` in description |
| `cmd_rename_folder` | `folder_id: i64, new_name: String` | `()` | Rename Telegram channel |
| `cmd_list_dir_files` | `path: String` | `Vec<String>` | Recursively list local dir files |
| `cmd_save_clipboard_image` | `bytes: Vec<u8>, filename: String` | `String` | Save clipboard image bytes to temp file, returns path |

### Preview & Thumbnails (`preview.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_get_preview` | `message_id: i32, folder_id: Option<i64>` | `Vec<u8>` | Download full file bytes for preview |
| `cmd_get_thumbnail` | `message_id: i32, folder_id: Option<i64>` | `String` | Returns base64 JPEG thumbnail (cached in app_data_dir) |

### Encryption (`encryption.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_set_encryption_key` | `password: String` | `()` | Hash password → store as master key |
| `cmd_clear_encryption_key` | — | `()` | Clear key from memory |
| `cmd_get_encryption_status` | — | `bool` | Whether key is currently set |

### Network & Utilities (`network.rs`, `utils.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_check_connection` | — | `bool` | Ping Telegram to verify connection |
| `cmd_is_network_available` | — | `bool` | OS-level network check |
| `cmd_clean_cache` | — | `()` | Delete local session/cache files |
| `cmd_search_global` | `query: String` | `Vec<FileMetadata>` | Search across all folders |
| `cmd_get_bandwidth` | — | `BandwidthStats` | Today's up/down bytes |
| `cmd_log` | `message: String` | `()` | Log from frontend to Rust logger |

### Streaming (`streaming.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_get_stream_token` | — | `String` | Get the session streaming token |
| `cmd_get_local_ip` | — | `String` | Get LAN IP for external share access |

### Backup (`backup.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_add_backup_folder` | `local_path: String, remote_folder_id: Option<i64>` | `()` | Watch local folder and emit events on changes |
| `cmd_remove_backup_folder` | `local_path: String` | `()` | Stop watching a folder |
| `cmd_get_backup_folders` | — | `Vec<BackupFolder>` | List configured backup folders |

### Settings (`settings.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_set_close_to_tray` | `value: bool` | `()` | |
| `cmd_get_close_to_tray` | — | `bool` | |
| `cmd_set_autostart` | `value: bool` | `()` | |
| `cmd_get_autostart` | — | `bool` | |

### Share Links (`share.rs`)
| Command | Args | Returns | Description |
|---|---|---|---|
| `cmd_create_share_link` | `file_id: i32, folder_id: Option<i64>, filename: String` | `String` | Returns `http://localhost:14200/share/{token}/{filename}` |
| `cmd_revoke_share_link` | `token: String` | `()` | Remove share token from memory |

---

## 8. Tauri Events (Rust → Frontend)

| Event | Payload | Description |
|---|---|---|
| `upload-progress` | `{ id: string, percent: number }` | Upload progress per file |
| `download-progress` | `{ id: string, percent: number }` | Download progress per file |
| `backup-file-detected` | `{ path: string, remote_folder_id: number \| null }` | File changed in watched backup folder |

---

## 9. Local HTTP Server (port 14200)

An **actix-web** server runs embedded in the Tauri process at `http://localhost:14200`. It exists for two purposes:

### Media Streaming
```
GET /stream/{folder_id}/{message_id}?token={stream_token}
```
- Streams file directly from Telegram without saving to disk
- Used by `MediaPlayer.tsx` for video/audio playback
- Requires the `stream_token` (generated at app startup, fetched via `cmd_get_stream_token`)
- `folder_id` can be `"null"`, `"me"`, or a numeric channel ID

### File Sharing
```
GET /share/{token}/{filename}
```
- Serves a file for download with `Content-Disposition: attachment`
- Token is a 32-char random alphanumeric string
- Tokens are stored in-memory in `ShareStore` — they are lost on app restart
- Server binds to `0.0.0.0` so LAN access works for sharing

---

## 10. Persistent Store (plugin-store)

All persistent frontend state lives in `@tauri-apps/plugin-store`. The store is loaded as `config.json` (or falls back to `settings.json` for legacy sessions). Keys:

| Key | Type | Description |
|---|---|---|
| `api_id` | `string` | Telegram API ID |
| `api_hash` | `string` | Telegram API Hash |
| `folders` | `TelegramFolder[]` | User's folder list |
| `activeFolderId` | `number \| null` | Currently selected folder |
| `encryptedFolderIds` | `number[]` | Folders with auto-encrypt enabled |
| `recentFiles` | `TelegramFile[]` | Last 20 accessed files |
| `uploadQueue` | `QueueItem[]` | Persisted pending uploads (restored on restart) |
| `encryptionEnabled` | `boolean` | Global encryption toggle |
| `autoSyncInterval` | `number` | Auto-sync interval in minutes |
| `closeToTray` | `boolean` | Close to system tray |
| `autostart` | `boolean` | Launch on system startup |

---

## 11. Frontend State Architecture (`Dashboard.tsx`)

`Dashboard.tsx` is the main orchestrator. It composes all hooks and passes down props. Key state:

```typescript
// From useTelegramConnection:
folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete,
handleRenameFolder, store

// From useFileUpload:
uploadQueue, handleManualUpload, handleFolderUpload,
handleDroppedFiles, cancelAll, retryItem, clearFinished, isDragging

// From useFileDownload:
downloadQueue, handleDownload

// From useFileOperations:
handleDelete, handleMove, handleRename (file), handleShareLink

// Local state:
viewMode: 'grid' | 'list' | 'gallery'
selectedIds: number[]          // multi-select
previewFile: TelegramFile | null
encryptedFolderIds: Set<number>
encryptionEnabled: boolean
trashFolderId: number | null
trashedFolders: { id, name }[]
recentFiles: TelegramFile[]

// React Query:
const { data: allFiles } = useQuery({
  queryKey: ['files', activeFolderId],
  queryFn: () => invoke('cmd_get_files', { folderId: activeFolderId }),
  enabled: !!store && activeFolderId !== RECENT_FOLDER_ID,
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: false,
  retry: 2,
});

// Source files for FileExplorer:
const sourceFiles = activeFolderId === RECENT_FOLDER_ID ? recentFiles : (allFiles ?? []);
```

### Special Folder IDs

| Value | Meaning |
|---|---|
| `null` | Saved Messages (Telegram's own saved messages) |
| `-1` (RECENT_FOLDER_ID) | Virtual "Recent" view — shows `recentFiles` state, no API call |
| `trashFolderId` (positive number) | The "Trash" channel, found/created via `cmd_get_or_create_trash` |
| Any other positive number | A user-created folder channel |

---

## 12. Key Hooks Reference

### `useTelegramConnection`
- On mount: loads store, calls `cmd_connect`, restores `folders` and `activeFolderId`
- On network restore (offline → online): auto-calls `cmd_connect` and invalidates React Query cache
- Exposes: `handleFolderDelete` (soft-delete), `handleRenameFolder`, `handleSyncFolders`

### `useFileUpload`
- Sequential queue: only one file uploads at a time
- **Auto-retry**: on network errors, retries up to 2 times with 3s/6s delays
- **Desktop notification** on upload success (if permission granted)
- **Clipboard paste**: `Dashboard.tsx` listens for `paste` events, extracts image blobs, calls `cmd_save_clipboard_image` to get a temp path, then calls `handleDroppedFiles([path])`
- `encryptByDefault` param: auto-sets `encrypt: true` on all queued items when true
- Queue persisted in store (`uploadQueue` key), pending items restored on restart

### `useFileDownload`
- Parallel downloads (no sequential limit)
- **Desktop notification** on download success
- Calls `cmd_download_file` with progress events

### `useAutoSync`
- Polls `cmd_get_files` at `autoSyncInterval` minutes interval
- Calls `queryClient.invalidateQueries` to refresh file list

### `useNetworkStatus`
- Uses `navigator.onLine` + `online`/`offline` DOM events
- Returns `boolean` — consumed by `useTelegramConnection` for auto-reconnect

---

## 13. Sidebar Behavior

### Sidebar items in order:
1. **Saved Messages** (icon: HardDrive) — `folderId = null`
2. **Recent** (icon: Clock) — `folderId = RECENT_FOLDER_ID (-1)` — shows last 20 previewed/downloaded files
3. **Trash** (icon: Trash2) — shown only when `trashFolderId !== null`; shows sub-list of trashed folders when active
4. **User folders** (icon: Folder) — with right-click context menu

### Folder right-click context menu options:
- Open
- Rename
- Share Folder Link (generates Telegram join link via `cmd_get_folder_invite_link`)
- Enable/Disable Auto-Encrypt (toggles folder in `encryptedFolderIds`)
- Move to Trash

### Lock icon:
A small `Lock` icon overlays the folder icon when `encryptedFolderIds.has(folder.id)`.

---

## 14. File Explorer Views

Controlled by `viewMode` in `Dashboard.tsx`, toggled from `TopBar.tsx`:

| Mode | Component | Description |
|---|---|---|
| `grid` | `FileExplorer` → `FileCard` | Responsive grid with virtualization (react-virtual) |
| `list` | `FileExplorer` → `FileListItem` | Table-style list with sort headers |
| `gallery` | `GalleryView` | Images-only masonry grid |

### File filtering (grid mode):
Buttons: All / Images / Videos / Audio / Docs / Other
Implemented via extension sets in `FileExplorer.tsx`:
```typescript
const IMAGE_EXT = new Set(['jpg','jpeg','png','gif','webp','bmp','tiff','svg','heic']);
const VIDEO_EXT = new Set(['mp4','mkv','avi','mov','wmv','flv','webm','m4v']);
const AUDIO_EXT = new Set(['mp3','wav','flac','aac','ogg','m4a','wma','opus']);
const DOC_EXT   = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv','rtf']);
```

### Virtualization:
Both grid and list use `@tanstack/react-virtual` (`useVirtualizer`) for performance with large file sets.

---

## 15. Auth Flow

`App.tsx` renders either `<AuthWizard>` or `<Dashboard>` based on auth state.

`AuthWizard.tsx` steps:
1. **API Credentials** — User enters `api_id` + `api_hash` (obtained from my.telegram.org)
2. **Phone Number** — calls `cmd_auth_request_code`
3. **Verification Code** — calls `cmd_auth_sign_in`; if returns `"password"` → go to step 4
4. **2FA Password** — calls `cmd_auth_check_password`
5. On success → credentials saved to store → App shows Dashboard

---

## 16. Rust State Managed by Tauri

All states are registered in `lib.rs::run()` via `app.manage(...)`:

| State type | Purpose |
|---|---|
| `TelegramState` | Holds `Arc<Mutex<Option<Client>>>` + login tokens + runner shutdown channel |
| `BandwidthManager` | Tracks bytes transferred today, saves to disk |
| `StreamToken` | Random 16-byte hex token for streaming server auth |
| `ActixServerHandle` | Handle to stop actix server on app exit |
| `EncryptionState` | Holds master key in memory (`Mutex<Option<Vec<u8>>>`) |
| `BackupState` | File watcher + backup folder list |
| `AppSettings` | close_to_tray + autostart flags |
| `Arc<ShareStore>` | In-memory token → file mapping for share links |

### TelegramState — critical note:
```rust
// runner_shutdown is std::sync::Mutex (NOT tokio) so it can be used
// in the synchronous RunEvent::Exit handler.
// When reconnecting, ALWAYS send shutdown before spawning new runner
// to avoid stack overflow from accumulated runner tasks.
pub runner_shutdown: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
```

---

## 17. Build & Dev Commands

```bash
# Install dependencies
cd app && npm install

# Development (hot-reload frontend + Rust rebuild)
npm run tauri dev

# TypeScript check only
npx tsc --noEmit

# Production build (outputs MSI + NSIS installer)
npm run tauri build

# Output locations:
# app/src-tauri/target/release/bundle/msi/SharkDrive_1.5.0_x64_en-US.msi
# app/src-tauri/target/release/bundle/nsis/SharkDrive_1.5.0_x64-setup.exe
```

**Requirements:** Rust (stable), Node.js 18+, Windows SDK (for NSIS/MSI bundling on Windows)

---

## 18. Known Gotchas & Non-obvious Decisions

1. **`cmd_get_thumbnail` lives in `preview.rs` only.** There was a duplicate added to `fs.rs` that caused a build error. Never add it again to `fs.rs`.

2. **`RECENT_FOLDER_ID = -1`** is a sentinel, not a real Telegram ID. When it's active, the React Query `enabled` flag is `false` — no API call is made. `sourceFiles` switches to the `recentFiles` local state array instead.

3. **Clipboard paste flow:** The browser `paste` event gives a `Blob`, not a file path. Since Rust commands need file paths, the blob bytes are sent as `Vec<u8>` to `cmd_save_clipboard_image` which saves them to `%TEMP%/sharkdrive_paste_{filename}` and returns the path. That path is then queued normally.

4. **grammers access_hash:** Telegram's MTProto requires an `access_hash` to reference channels. This is resolved in `utils.rs::resolve_peer` by calling `client.resolve_username` or iterating dialogs. This can fail for channels not in the dialog list — always handle the error.

5. **Share links are in-memory only.** `ShareStore` is not persisted. Links die on app restart. This is intentional for security.

6. **Per-folder encryption key isolation:** Even if two folders use the same master password, they produce different encryption keys (`SHA-256(master || folder_id_bytes)`). A file from folder A cannot be decrypted with the key for folder B.

7. **Close-to-tray behavior:** Handled in `lib.rs::RunEvent::WindowEvent::CloseRequested`. If `AppSettings.close_to_tray` is true, the window is hidden and close is prevented. Actual exit only from tray menu → Quit.

8. **Auto-retry in uploads:** Only triggers on network-class errors (timeout, connection, socket, EOF, refused). Logic errors (file not found, permission denied, 2GB limit exceeded) fail immediately without retry.

9. **2GB file size limit:** Enforced in `cmd_upload_file` before any upload attempt. Telegram's actual limit is 2GB. Error message includes the file's actual size in GB.

10. **The actix server starts even if Telegram isn't connected.** It just returns 503 until a client is available.

---

## 19. Planned / Missing Features (for future reference)

These were identified as future work but not yet implemented:

- [ ] **Testing**: No unit or integration tests exist yet
- [ ] **Telemetry / crash reporting**: Not implemented
- [ ] **Chunked upload resume**: If upload fails mid-way, it restarts from 0 (grammers handles chunking internally but no resume token is saved)
- [ ] **Folder nesting**: All folders are flat (no sub-folders in the UI, even though `parent_id` exists in the model)
- [ ] **Search UI**: `cmd_search_global` exists in Rust but there's no search UI connected to it in TopBar
- [ ] **E2E encryption key export/import**: Users can't backup their key; if they forget the password all encrypted files are lost
- [ ] **Windows notifications for backup events**: `backup-file-detected` event exists but the frontend doesn't auto-upload in response yet (only shows in Settings)

---

## 20. Version History

| Version | Key additions |
|---|---|
| 1.1.x | Initial release: upload, download, folders, basic encryption |
| 1.2.0 | Rename, move, drag-and-drop between folders |
| 1.3.0 | Trash system, soft-delete, restore folders |
| 1.4.0 | Share links, LAN streaming server, GalleryView, sidebar context menu |
| 1.5.0 | Per-folder encryption keys, clipboard paste upload, recent files panel, file type filter, auto-retry on network errors, desktop notifications, 2GB size check, network auto-reconnect |
