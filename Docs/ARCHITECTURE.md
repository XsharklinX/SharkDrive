# SharkDrive - Architecture and Handoff

> **Version:** 1.5.0  
> **Last updated:** 2026-05-12  
> **Purpose:** Quick handoff for continuing development without dragging old fork details forward.

---

## 1. Product Summary

**SharkDrive** is a Tauri desktop app that uses Telegram as the storage backend.

Users can:

- authenticate with their Telegram account
- use **Saved Messages** or private Telegram channels as folders
- upload, download, preview, move, copy, rename, and share files
- optionally encrypt files locally before upload
- use nested folders through stored `parent_id` metadata

The product goal is simple:

**Telegram Drive clarity + SharkDrive improvements**

That means the UI should stay direct and understandable, while advanced features remain available without dominating the main screen.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Backend | Rust |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + `telegram-*` design tokens |
| Telegram API | `grammers` |
| Data/querying | `@tanstack/react-query` |
| Local persistence | `@tauri-apps/plugin-store` |
| Local web server | `actix-web` |
| Encryption | AES-256-GCM |

---

## 3. Repository Structure

```text
Shark-Drive/
|-- Docs/
|   `-- ARCHITECTURE.md
|-- README.md
|-- VERSION
|-- .gitattributes
|-- scripts/
|   `-- sync-version.ps1
`-- app/
    |-- package.json
    |-- vite.config.ts
    |-- src/
    |   |-- App.tsx
    |   |-- App.css
    |   |-- types.ts
    |   |-- utils.ts
    |   |-- api/
    |   |   `-- tauri.ts
    |   |-- components/
    |   |   |-- AuthWizard.tsx
    |   |   |-- Dashboard.tsx
    |   |   |-- UpdateBanner.tsx
    |   |   `-- dashboard/
    |   |       |-- Sidebar.tsx
    |   |       |-- SidebarItem.tsx
    |   |       |-- TopBar.tsx
    |   |       |-- FileExplorer.tsx
    |   |       |-- FileCard.tsx
    |   |       |-- FileListItem.tsx
    |   |       |-- GalleryView.tsx
    |   |       |-- ContextMenu.tsx
    |   |       |-- PreviewModal.tsx
    |   |       |-- MediaPlayer.tsx
    |   |       |-- PdfViewer.tsx
    |   |       |-- RenameModal.tsx
    |   |       |-- MoveToFolderModal.tsx
    |   |       |-- ShareModal.tsx
    |   |       |-- SettingsModal.tsx
    |   |       |-- UploadQueue.tsx
    |   |       |-- DownloadQueue.tsx
    |   |       |-- BandwidthWidget.tsx
    |   |       `-- EmptyState.tsx
    |   |-- hooks/
    |   |   |-- useTelegramConnection.ts
    |   |   |-- useFileUpload.ts
    |   |   |-- useFileDownload.ts
    |   |   |-- useFileOperations.ts
    |   |   |-- useDashboardSearch.ts
    |   |   |-- usePreviewNavigation.ts
    |   |   `-- useUpdateCheck.ts
    |   `-- context/
    `-- src-tauri/
        |-- Cargo.toml
        |-- tauri.conf.json
        `-- src/
            |-- lib.rs
            |-- main.rs
            |-- models.rs
            |-- server.rs
            |-- bandwidth.rs
            `-- commands/
                |-- mod.rs
                |-- auth.rs
                |-- preview.rs
                |-- encryption.rs
                |-- backup.rs
                |-- network.rs
                |-- settings.rs
                |-- share.rs
                |-- streaming.rs
                `-- fs/
                    |-- mod.rs
                    |-- caption.rs
                    |-- upload.rs
                    |-- download.rs
                    |-- files.rs
                    `-- folders.rs
```

---

## 4. Frontend Architecture

### App flow

- `App.tsx` decides between login and dashboard
- `AuthWizard.tsx` handles Telegram auth flow
- `Dashboard.tsx` is still the main orchestrator, but some logic has already been moved into hooks

### Main UI pieces

- `Sidebar`: navigation, folders tree, sync/logout entry points
- `TopBar`: search and main actions
- `FileExplorer`: view mode, filters, sorting, list/grid/gallery rendering
- `PreviewModal`, `MediaPlayer`, `PdfViewer`: file preview surfaces
- `UploadQueue`, `DownloadQueue`: transfer status
- `SettingsModal`: advanced controls that should not clutter the main explorer

### Current UI direction

The UI is intentionally being moved away from the previous heavy "vault / cyberpunk" styling and back toward a simpler Telegram Drive-like structure:

- simple top bar
- simple sidebar
- compact file grid
- one-line filters
- advanced features hidden until needed

---

## 5. Backend Architecture

### Core state

Rust state is initialized in `lib.rs` and shared through Tauri managed state.

Important pieces include:

- Telegram session/client state
- local server state for streaming and sharing
- bandwidth tracking
- persisted share links
- settings and queue persistence

### Commands

#### Auth

- login/session lifecycle lives in `auth.rs`

#### File system domain

The old monolithic `fs.rs` has been split into:

- `caption.rs`: Telegram caption parsing/formatting
- `upload.rs`: uploads, queue recovery, dedupe checks
- `download.rs`: downloads and related helpers
- `files.rs`: rename, move, copy, delete, list
- `folders.rs`: create folders, nested folder metadata, parent updates

> Reminder: if new commands are added, they must also be registered in `app/src-tauri/src/lib.rs` inside `invoke_handler!`.

#### Preview / media

- `preview.rs`: thumbnails, previews, and media-oriented fetches
- `streaming.rs`: streaming token flow
- `server.rs`: local HTTP endpoints for preview/stream/share access

#### Other domains

- `encryption.rs`: local encryption and key management
- `backup.rs`: watched folders and auto-backup behavior
- `share.rs`: persistent share link store
- `settings.rs`: startup/tray preferences
- `network.rs`: connectivity and LAN helpers

---

## 6. Important Data Model Notes

### Folders

- folders map to Telegram channels
- nested folders are represented with `parent_id`
- older folders may still exist without parent metadata and appear at root until reassigned

### Files

- files map to Telegram messages with attachments
- extra metadata is carried in captions
- markers such as rename, encryption, trash, and app ownership are derived from caption parsing

### Sharing

- share links are no longer memory-only
- durable share state is stored locally and restored on restart

---

## 7. Current Priorities

These are the active product and engineering priorities:

1. keep the UI simple and closer to Telegram Drive clarity
2. preserve SharkDrive-specific improvements without crowding the main explorer
3. continue reducing `Dashboard.tsx` complexity by extracting hooks/components
4. keep backend features modular under `commands/fs/`
5. avoid reintroducing visual noise into the primary file browser

---

## 8. Practical Rules for Continuing Work

- Read this document before large changes.
- Keep the main explorer simple; put advanced controls in settings, modals, or context menus.
- Do not put `cmd_get_thumbnail` back into the old `fs.rs` layout; preview-specific behavior belongs in `preview.rs`.
- Always run `npx tsc --noEmit` before any build.
- If you add a Tauri command, register it in `app/src-tauri/src/lib.rs`.
- Prefer improving reliability and clarity over adding more visual chrome.

---

## 9. Recommended Next Areas

- continue simplifying secondary UI components for consistency
- finish extracting dashboard state into hooks
- revisit updater only when SharkDrive has its own real release feed
- add more tests around caption parsing and encryption behavior as features evolve
