# SharkDrive - Architecture and Handoff

> **Version:** 2.9.0
> **Last updated:** 2026-05-30
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
- browse local smart folders and inspect folder statistics without rescanning Telegram

The product goal is simple:

**Telegram Drive clarity + SharkDrive improvements**

That means the UI should stay direct and understandable, while advanced features remain available without dominating the main screen.

---

## 2. Tech Stack

| Layer             | Technology                                |
| ----------------- | ----------------------------------------- |
| Desktop shell     | Tauri v2                                  |
| Backend           | Rust                                      |
| Frontend          | React 18 + TypeScript + Vite              |
| Styling           | Tailwind CSS + `telegram-*` design tokens |
| Telegram API      | `grammers`                                |
| Data/querying     | `@tanstack/react-query`                   |
| Local persistence | `@tauri-apps/plugin-store`                |
| Local web server  | `actix-web`                               |
| Encryption        | AES-256-GCM                               |

### Security Boundaries

- Share passwords are stored as bcrypt hashes in `share_links.json`; legacy plaintext entries migrate on startup.
- Vault auto-lock clears encryption keys from memory and blocks the UI without logging out of Telegram.
- Secure delete rewrites the Telegram caption to `[SD-DELETED-<timestamp>]` before message deletion when enabled.
- Remote encryption conversion and key rotation replace one file at a time: upload replacement first, delete original second.
- Settings audits locally indexed encrypted/plain file counts folder by folder and exposes guided conversion and key-rotation flows.
- Share password forms submit through `POST`; successful bcrypt verification issues a scoped `HttpOnly`, `SameSite=Strict` cookie valid for 10 minutes.
- New encrypted uploads use the V3 chunked format: authenticated 1 MiB AES-GCM chunks, random nonces, ordered AAD and a mandatory authenticated footer.
- V1/V2 encrypted files remain readable through the legacy decryptor.

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
    |   |       |-- FolderStatsModal.tsx
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
    |   |   |-- useSmartCollections.ts
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
                |-- automation.rs
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
- `useSmartCollections`: index-only virtual folders for media, documents, large files, recent files and tags
- `FolderStatsModal`: instant per-folder summaries from the local index
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
- persisted watched folders and automation rules
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
- `download.rs`: individual downloads plus ZIP bulk export with decryption before archive packaging

> Reminder: if new commands are added, they must also be registered in `app/src-tauri/src/lib.rs` inside `invoke_handler!`.

#### Preview / media

- `preview.rs`: thumbnails, previews, PDF text indexing, and media-oriented fetches
- video thumbnails first use Telegram embedded thumbs; if missing, SharkDrive can use `ffmpeg` from PATH to extract and cache a PNG frame
- opened PDFs can be indexed locally with `pdf-extract`; the frontend stores searchable text snippets in localStorage for local search
- `streaming.rs`: streaming token flow
- `server.rs`: local HTTP endpoints for preview/stream/share access

#### Other domains

- `encryption.rs`: local encryption and key management
- `automation.rs`: persisted daily sync time and cleanup-candidate rules
- `backup.rs`: durable watched folders and auto-backup behavior
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
- encrypted captions use `[SD-KDF:PBKDF2][SD-ENC-V3]` for chunked files; legacy V1/V2 captions remain supported

### Encryption

- new encrypted uploads derive keys with PBKDF2-HMAC-SHA256, 100K iterations and encrypt authenticated 1 MiB chunks
- `EncryptionState` keeps both v2 and legacy keys in memory for backward-compatible decrypt
- auto-lock clears in-memory keys after configured inactivity
- optional session PIN encrypts `telegram.session` at rest and requires unlock before auto-login

### Sharing

- share links are no longer memory-only
- durable share state is stored locally and restored on restart
- share entries include creation time, expiration, and `download_count`
- Settings exposes active share links with copy/revoke actions
- file share links can be generated in bulk from selection and exported as QR PNG client-side
- protected LAN links authenticate via `POST` and receive a temporary scoped cookie; passwords do not appear in download URLs

### Downloads

- the frontend queue persists pending work and supports priority changes for pending items
- Settings stores optional download destinations by file category in localStorage
- completed downloads can optionally open through the system default application
- Vault Dashboard exports CSV and JSON manifest formats

### Automation

- watched local folders persist in `backup_folders.json` and resume after restart
- `automation_config.json` stores an optional daily sync time and per-folder cleanup rules
- cleanup rules only produce candidates from the local index; deletion always requires frontend confirmation
- upload naming rules remain client-side and only change the remote Telegram display name
- `backup_hashes.json` stores the last uploaded hash per watched path so automatic uploads distinguish local-only updates from real two-sided conflicts
- automatic uploads skip unchanged duplicates and surface two-sided same-name conflicts before uploading a new version

### Polish and localization

- `LanguageContext` owns the explicit `en` / `es` dictionary and a document-level fallback for legacy visible strings that have not yet migrated to `t(...)`
- the fallback localizes labels, placeholders and titles added by modals or toast portals without translating arbitrary file metadata
- `OnboardingWizard` runs once after the first authenticated dashboard load and reuses existing folder and encryption commands
- sidebar width and accent color are local UI preferences persisted in `localStorage`
- rename undo is a frontend-only buffer of the latest ten file or folder renames and calls the existing rename commands
- offline mode keeps cached indexed files visible, pauses queued uploads and relies on the existing connection hook for retry

### Updates and releases

- Tauri Updater checks the signed static feed at `https://github.com/XsharklinX/SharkDrive/releases/latest/download/latest.json`
- `bundle.createUpdaterArtifacts` is enabled so release builds create updater archives and `.sig` files in addition to installers
- `.github/workflows/release.yml` is the only tag-triggered release workflow and uploads `latest.json` through `tauri-apps/tauri-action`
- run `scripts/setup-updater.ps1` once per signing identity; it stores the private key outside the repository and patches the public key into `tauri.conf.json`
- keep the updater private key backed up securely and add it to GitHub Actions as `TAURI_SIGNING_PRIVATE_KEY`
- publish future versions with valid SemVer tags only, preferably through `scripts/publish-release.ps1 -Version <version> -Publish`

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
- verify the first signed GitHub release and test updater installation from the previous desktop version
- add more tests around caption parsing and encryption behavior as features evolve
