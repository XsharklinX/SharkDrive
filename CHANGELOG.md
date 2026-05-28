# Changelog

All notable changes to SharkDrive are documented here.

---

## [1.6.0] - 2026-05-28

### UX Refinements

- **Search debounce** — 200ms debounce added to `useDashboardSearch`. Previously triggered a re-render on every keypress; now waits for the user to pause before computing results.
- **Differentiated empty states** — Empty views now show context-aware messages and icons: folder is empty / no search results (shows the search term) / no starred files.
- **File count badges in sidebar** — Each folder in the sidebar displays the number of indexed files as a small badge. Sourced from a background query to `cmd_get_all_indexed_files`.
- **Move folder from context menu** — Right-clicking any sidebar folder now shows "Move to Folder…" which opens a destination picker modal. Previously only possible via drag & drop.
- **Activity panel in sidebar** — Collapsible panel at the bottom of the sidebar navigation showing the last 8 actions with relative timestamps (e.g. "2m ago", "1h ago").
- **Sort & filter confirmed** — Sort by name/size/date with direction toggle and file-type filter tabs were already implemented and persisted to localStorage; verified working.

---

## [1.5.0] - 2026-05-24

### Architecture

- **Dashboard split into domain hooks** — `Dashboard.tsx` extracted into 5 hooks: `useFavorites`, `useRecentFiles`, `useActivityLog`, `useEncryptedFolders`, `useRecentSearches`. Component went from ~840 to ~580 lines.
- **Eliminated `localFileIndex`** — React state that duplicated Rust's index store removed. `useDashboardSearch` now fetches directly from `cmd_get_all_indexed_files` when search activates.
- **`index_store` migrated from `Mutex` to `RwLock`** — Multiple concurrent reads (e.g. folder sizes computing in parallel) no longer block each other.
- **3-level cache for `cmd_get_folder_size`** — Level 1: live index (O(n) local); Level 2: persistent cache from `persistent_index.json`; Level 3: Telegram API fetch (only for unvisited folders). Results persisted across app restarts.
- **`cmd_get_all_indexed_files`** — New Rust command exposing the full local index without touching Telegram.
- **`isImageFile` unified** — Duplicate definition removed from `GalleryView.tsx`, canonical version in `utils.ts` with `avif` added.

---

## [1.4.0] - 2026-05-23

### New Features

- **Breadcrumb navigation** — TopBar shows the full folder path (Saved Messages > Work > Q2) with clickable ancestors.
- **Inline rename** — Double-click on any file name in grid or list view activates an in-place input.
- **Cancel individual queue items** — ✕ button per item in UploadQueue and DownloadQueue (pending or active).
- **Gallery keyboard navigation** — Arrow keys navigate between images, Enter opens preview, Space toggles selection. Visible focus ring.
- **Folder size in list view** — `cmd_get_folder_size` command in Rust. FileListItem shows "12 files · 340 MB" instead of "—".
- **Improved drag & drop visual feedback** — Folder cards show a semi-transparent "Move here" overlay with FolderOpen icon during drag. Sidebar items show FolderInput icon.

### Removals

- **Trash system removed completely** — 4 Rust commands deleted (`cmd_get_or_create_trash`, `cmd_soft_delete_folder`, `cmd_restore_folder`, `cmd_get_trashed_folders`). UI removed from sidebar. Delete is now permanent and irreversible. A scan filter still ignores legacy `[SD-TRASH]` / `[SD-DEL]` channels.

---

## [1.3.0] - 2026-05-22

### New Features

- **File context menu** — Right-click shows: Preview / Download / Copy to Folder / Rename / Share / Delete.
- **Shift+Click range selection** — Click a file, Shift+Click another to select the range.
- **Nested subfolder sidebar** — Visual hierarchy with `depth * 14px` indentation per level.
- **Drag folders to reorder** — Drag any sidebar folder onto another to set it as a child.
- **Auto backup** — Configure a local folder; changed files are auto-uploaded using `notify` v6 with 5s debounce.
- **Clipboard paste upload** — Ctrl+V with an image in the clipboard uploads it directly to the active folder.
- **Bandwidth widget** — Sidebar widget showing daily upload/download usage against a 250 GB reference.

---

## [1.2.0] - 2026-05 (prior history)

Base functionality inherited and extended:

- MTProto authentication (phone → code → 2FA)
- Upload/download with chunked transfer and progress events
- AES-256-GCM encryption per folder
- LAN streaming server (actix-web, port 14200, Range requests)
- Share links with expiry
- Advanced search with filter syntax
- Grid, List, Gallery views
- Favorites and recent files
- Lazy-loaded thumbnails
- Auto-sync on configurable interval
