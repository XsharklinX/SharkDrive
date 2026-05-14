# SharkDrive

**SharkDrive** is an open-source desktop application that turns your Telegram account into a simple personal cloud drive. Built with **Tauri v2**, **Rust**, and **React**.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Version](https://img.shields.io/badge/version-1.5.0-brightgreen)

---

## What is SharkDrive?

SharkDrive uses the Telegram MTProto API to store, organize, and manage your files directly on Telegram's servers, with no file size limits beyond Telegram's own 2 GB per file cap. Private Telegram channels act as folders, and messages act as files. Everything stays under your Telegram account, on Telegram's infrastructure.

---

## Features

### File Management

- Upload and download files with progress tracking
- Drag and drop from Windows Explorer
- Multi-select with Shift+Click
- Rename files and folders
- Move files between folders
- Global search across all folders
- Grid, List, and Gallery view modes
- Favorites / starred files

### Folders

- Create and delete private Telegram channels as folders
- Soft-delete folders to Trash with `[SD-DEL]` markers
- Restore folders from Trash
- Right-click context menu on folders: Open / Rename / Share / Move to Trash
- Sync Telegram to discover existing folders

### Trash and Recovery

- Files moved to a dedicated Trash channel
- Restore individual files or empty trash
- Trashed folders listed and restorable from the sidebar

### Security and Encryption

- AES-256-GCM local encryption before upload
- Key derived from a user-set password via SHA-256
- Encrypted files auto-decrypted on download
- Encryption marker stored in Telegram caption (`[SD-ENC:filename]`)

### Sharing

- LAN download links via local `actix-web` server (port 14200)
- Real LAN IP detection so links work on your network
- Telegram folder invite links (`t.me/+...`) via `messages.ExportChatInvite`

### Auto Backup

- Watch local folders for changes with the `notify` crate
- Changed files automatically added to the upload queue
- Per-folder backup configuration

### Auto Sync

- Configurable auto-sync timer (5 / 15 / 30 / 60 min or off)
- Countdown shown in the top bar
- Scans Telegram for new or changed files

### Media and Preview

- Stream video and audio files without downloading
- Built-in PDF viewer with infinite scroll
- Image preview with navigation between files
- Thumbnail support for media files

### System Integration

- Minimize to system tray
- Run at Windows startup (Registry-based)
- Bandwidth widget with real-time upload/download speeds

### Settings Panel

- General: auto-sync interval, minimize-to-tray, run at startup
- Encryption: set or clear AES-256 password
- Auto Backup: add or remove watched local folders

---

## Tech Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| Frontend     | React 18, TypeScript, TailwindCSS, Framer Motion |
| Backend      | Rust, Tauri v2                                   |
| Telegram     | grammers (MTProto client)                        |
| Local server | actix-web 4                                      |
| Storage      | tauri-plugin-store (JSON)                        |
| Build        | Vite, cargo                                      |

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
git clone <your-repo-url>
cd Shark-Drive/app

# Install frontend dependencies
npm install

# Dev mode
npm run tauri dev

# Production build
npm run tauri build
```

The installer will be at:

```text
src-tauri/target/release/bundle/nsis/SharkDrive_x.x.x_x64-setup.exe
```

---

## How It Works

| Concept          | Implementation                            |
| ---------------- | ----------------------------------------- |
| Folders          | Private Telegram channels                 |
| Files            | Messages with document attachments        |
| Trash folder     | Channel named with `[SD-TRASH]` marker    |
| Deleted folders  | Channel renamed with `[SD-DEL]` marker    |
| Encrypted files  | Caption contains `[SD-ENC:original_name]` |
| Renamed files    | Caption contains `[SD_NAME:new_name]`     |
| SharkDrive files | Caption contains `[TD]` marker            |

---

## Changelog

### v1.4.0

- AES-256-GCM encryption before upload, auto-decrypt on download
- Auto backup: watch local folders, auto-upload changed files
- LAN share links with real IP + Telegram folder invite links
- Bandwidth widget: real-time speeds, expandable
- Auto-sync configurable timer (5/15/30/60 min)
- Settings panel: tray, startup, encryption, backup
- Right-click context menu on sidebar folders (Rename, Share, Trash)

### v1.3.0

- Rename files and folders
- Bulk folder upload
- Trash / Recycle Bin (soft-delete, restorable)
- Trashed folders listed in the sidebar with restore button

### v1.2.0

- Drag and drop from Windows Explorer
- Shift+Click multi-select
- Gallery view mode
- Favorites / starred files

### v1.1.x (original Telegram Drive fork)

- Base file upload/download
- Folder management
- Media streaming
- PDF viewer
- Grid/List views
- Global search

---

## License

MIT - free to use, modify, and distribute.

---

*SharkDrive is not affiliated with Telegram FZ-LLC. Use in accordance with Telegram's Terms of Service.*
