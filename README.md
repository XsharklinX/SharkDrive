# SharkDrive

**SharkDrive** is an open-source desktop application that turns your Telegram account into a private, unlimited cloud storage drive. Built with **Tauri v2**, **Rust**, and **React**.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Version](https://img.shields.io/badge/version-2.6.0-brightgreen)

---

## What is SharkDrive?

SharkDrive uses the Telegram MTProto API to store, organize, and manage your files directly on Telegram's servers — with no storage limits beyond Telegram's own 2 GB per-file cap. Private Telegram channels act as folders, messages act as files. Everything stays under your Telegram account.

---

## Features

### File Management

- Upload and download files with progress tracking
- Chunked upload (512 KB parts) with resume support for interrupted transfers
- SHA-256 deduplication — files already in the folder are not re-uploaded
- Drag and drop from Windows Explorer
- Clipboard paste: Ctrl+V with an image uploads it directly
- Multi-select with Shift+Click, Ctrl+A, or checkboxes
- Inline rename (double-click on any file name)
- Batch rename with pattern (e.g. `photo_{n}.jpg`)
- Move files between folders (drag & drop or modal)
- Copy files to another folder
- Download multiple selected files as a ZIP archive
- Configure default download destinations by file category
- Reorder pending downloads and optionally open files when completed
- Permanent delete (no trash — delete means delete)
- Global search across all folders with advanced filters: `type:`, `ext:`, `min:`, `max:`, `folder:`, `encrypted:`

### Views and Navigation

- Grid, List, and Gallery view modes (persisted between sessions)
- Sort by name / size / date, ascending or descending
- Filter by type: Images / Videos / Audio / Docs / Other
- Breadcrumb navigation in the top bar (clickable ancestors)
- Favorites / starred files (persisted)
- Recent files (last 20 accessed)
- Sidebar with nested folder hierarchy and file count badges
- Activity panel in the sidebar (last 8 actions with relative timestamps)

### Folders

- Create and delete private Telegram channels as folders
- Nested subfolder hierarchy (parent stored in channel `about`)
- Move folders via drag & drop in the sidebar or context menu ("Move to Folder…")
- Right-click context menu: Open / Rename / Create Subfolder / Move to Root / Move to Folder / Share / Auto-encrypt / Delete

### Security and Encryption

- AES-256-GCM encryption before upload, auto-decrypted on download
- PBKDF2-HMAC-SHA256 key derivation for new encrypted uploads
- Encryption is optional, configurable per-folder or globally
- Key derived from a user-set password — never stored on disk
- Auto-lock clears the in-memory encryption key after inactivity
- Optional 6-digit PIN protection for the saved Telegram session file
- Encrypted files clearly marked in the UI (badge, icon)
- Share links protected by a 64-char random token

### Sharing

- LAN share links via local `actix-web` server on port 14200
- Real LAN IP detection so links work across your network
- Telegram folder invite links via `messages.ExportChatInvite`
- Configurable expiry with presets, custom minutes, or never
- QR code generation for single file links, downloadable as PNG
- Multi-file "Share All" flow that generates one link per selected file
- Active links panel in Settings with copy, revoke, expiry, and download count

### Auto Backup

- Watch local folders for changes using the `notify` crate (v6)
- Changed files automatically queued for upload
- Per-folder backup configuration in Settings
- Debounced 5s to avoid partial-file uploads

### Auto Sync

- Configurable auto-sync timer: 5 / 15 / 30 / 60 min, or off
- Countdown shown in the top bar
- Scans Telegram channels for new or changed files

### Media and Preview

- Stream video and audio files without downloading (via LAN server with Range requests)
- Built-in PDF viewer with local text indexing for PDFs already opened
- Image preview with navigation, keyboard arrows, zoom, and drag-to-pan
- Gallery view with keyboard navigation and configurable slideshow mode
- Thumbnail support for images and video files (lazy-loaded; video frame extraction uses `ffmpeg` when Telegram has no embedded thumbnail)
- Audio playback with folder playlist and shuffle controls

### System Integration

- Minimize to system tray
- Run at Windows startup
- Bandwidth widget: daily upload/download usage with progress bar (250 GB/day reference)
- Vault dashboard export: CSV or JSON manifest with folder tree and file metadata

### Settings

- General: auto-sync interval, minimize-to-tray, run at startup
- Downloads: category destinations and open-after-download behavior
- Encryption: set or clear AES-256 password, global enable/disable
- Backup: configure watched local folders and their Telegram targets
- Activity: full history of the last 60 actions with type filters

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, TailwindCSS, Framer Motion |
| Backend | Rust, Tauri v2 |
| Telegram | grammers (MTProto, git rev d07f96f) |
| Local server | actix-web 4 |
| Encryption | aes-gcm (AES-256-GCM), sha2 |
| PDF text index | pdf-extract |
| State | tauri-plugin-store (JSON KV) |
| Virtualization | @tanstack/react-virtual |
| Build | Vite, cargo |

---

## Getting Started

### Prerequisites

- Node.js v18+
- Rust (latest stable via rustup)
- A Telegram account
- API ID and Hash from [my.telegram.org](https://my.telegram.org)

### Setup

```bash
# Clone
git clone https://github.com/XsharklinX/SharkDrive.git
cd SharkDrive/app

# Install frontend dependencies
npm install

# Dev mode (hot reload)
npm run tauri dev

# Production build
npm run tauri build
```

The Windows installer will be at:

```
app/src-tauri/target/release/bundle/nsis/SharkDrive_x.x.x_x64-setup.exe
```

---

## How It Works

| Concept | Implementation |
|---|---|
| Folders | Private Telegram channels |
| Files | Messages with document attachments |
| Subfolders | `parent_id` stored in channel `about` field |
| Encrypted files | Caption: `[SD-ENC:original_name][SD_SIZE:n][SD_HASH:h]` |
| Renamed files | Caption: `[SD_NAME:new_name]` |
| SharkDrive marker | Caption: `[TD]` |
| Folder size cache | Persisted in `app_data_dir/persistent_index.json` |
| Share links | Stored in `app_data_dir/share_links.json` with expiry and download count |

---

## License

MIT — free to use, modify, and distribute.

---

*SharkDrive is not affiliated with Telegram FZ-LLC. Use in accordance with Telegram's Terms of Service.*
