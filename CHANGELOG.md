# Changelog

All notable changes to SharkDrive are documented here.

---

## [2.6.0] - 2026-05-29

### Share Authentication and Chunked Encryption

- **LAN share POST auth** - Password-protected links submit credentials through `POST`; the password no longer appears in the download URL.
- **Temporary share authorization** - Actix issues a scoped `HttpOnly`, `SameSite=Strict` cookie valid for 10 minutes after successful bcrypt verification.
- **Chunked AES-GCM V3** - New encrypted files use authenticated 1 MiB chunks with random nonces, ordered AAD and a mandatory authenticated footer.
- **Legacy compatibility** - Existing V1/V2 encrypted files remain readable through the legacy decryptor.
- **Safe encrypted resume** - Interrupted encrypted uploads reuse checkpoint ciphertext instead of regenerating incompatible chunks.
- **Encrypted preview support** - Image, video, PDF and EPUB preview helpers decrypt cache files locally after vault unlock.

---

## [2.5.0] - 2026-05-29

### Sharing 2.0 and Security Suite

- **Share dashboard** - Lists active links, visual expiry, download counters, limits, password badges and bulk revocation.
- **Passwords with bcrypt** - `share_links.json` persists `password_hash`; legacy plaintext entries migrate automatically on startup.
- **Limits and QR** - LAN links support download limits, configurable expiry and downloadable QR codes.
- **Visible auto-lock** - Locking the vault clears the in-memory key and displays an unlock screen without disconnecting Telegram.
- **Secure delete** - Optional caption replacement with `[SD-DELETED]` before remote message deletion.
- **Encryption audit** - Settings summarizes encrypted versus plain files and can convert existing indexed files safely.
- **Key rotation** - Sequential wizard downloads, decrypts, re-encrypts, uploads the replacement and only then deletes the original.
- **Password strength** - Settings estimates entropy and an indicative brute-force time for new passwords.

### Security Notes

- The current LAN password form authenticates through a query string. The hash is never exposed or stored as plaintext, but POST plus a temporary authorization token remains a hardening task to prevent browser-history leakage.
- The current AES-GCM helper buffers a complete file in memory. Chunked authenticated encryption remains required before describing the system as enterprise-grade for large files.

---

## [2.1.0] - 2026-05-29

### Sharing Suite

- **Share Links Dashboard** — Nuevo modal accesible desde el botón `Link2` en TopBar. Muestra todos los links activos y expirados con: tiempo restante (barra visual), contador de descargas, badge de password protegido. Filtros: Active / All / Expired. Revocar individual, "Clear expired" en bulk, "Revoke all active" desde footer. Refresca automáticamente cada 30s.
- **Password en links** — Campo opcional en ShareModal. El servidor actix verifica la contraseña antes de servir el archivo: si falta, devuelve una página HTML mínima con formulario de contraseña; si es incorrecta, muestra error en el mismo formulario. Almacenada en texto plano en `share_links.json` (uso LAN local).
- **Límite de descargas** — Campo "Max downloads (0 = unlimited)" en ShareModal. Rust enforza el límite en el actix handler: si `download_count >= max_downloads` devuelve HTTP 410 Gone. `ShareLinkInfo` expone `max_downloads` e `is_password_protected` al frontend.
- **QR Code** ✅ ya estaba implementado con `qrcode` npm, generación automática cuando el link está listo, descarga como PNG.
- **Bulk share** ✅ ya estaba implementado: ShareModal acepta array `files[]`, muestra una URL por archivo con copy/revoke individual.

---

## [2.4.0] - 2026-05-29

### Download & Export Suite

- **ZIP bulk download** - La selección múltiple agrega descarga ZIP. Rust descarga, descifra cuando corresponde, sanitiza nombres duplicados y escribe un archivo `.zip` local.
- **Destinos por tipo** - Settings agrega una sección Downloads para configurar carpetas por categoría: imágenes, videos, audio, documentos y otros.
- **Prioridad de descargas** - La cola permite arrastrar descargas pendientes para reordenarlas y subir un item al frente.
- **Open after download** - Settings permite abrir automáticamente el archivo terminado con la aplicación predeterminada del sistema.
- **Manifest JSON** - Vault Dashboard exporta árbol de carpetas y archivos con ids, tamaño, hash, fecha, MIME y estado de cifrado.
- **Video thumbnail fallback reparado** - El helper `ffmpeg` de v2.3 vuelve a estar conectado al flujo real cuando Telegram no ofrece thumbnail embebido.

---

## [2.3.0] - 2026-05-28

### Media Avanzado

- **Thumbnails de video** - `cmd_get_thumbnail` ahora intenta usar miniatura embebida de Telegram y, si no existe, extrae un frame con `ffmpeg` y lo cachea como PNG en `app_data_dir/thumbnails`.
- **Zoom en imágenes** - `PreviewModal` agrega zoom con botones, doble click, Ctrl+scroll y paneo cuando la imagen está ampliada.
- **Slideshow en galería** - `GalleryView` agrega autoplay discreto con velocidades 2s / 5s / 10s y pausa sin convertir la pantalla principal en un panel pesado.
- **Playlist de audio** - `MediaPlayer` muestra lista de pistas del contexto actual, permite saltar a una pista y agrega shuffle para carpetas de audio.
- **Búsqueda en PDF vistos** - Nuevo `cmd_index_pdf_text` descarga/indexa texto de PDFs abiertos con `pdf-extract`, lo persiste localmente y lo incorpora a la búsqueda local.

---

## [2.2.0] - 2026-05-28

### Seguridad Avanzada

- **PBKDF2 v2** - La clave maestra nueva usa PBKDF2-HMAC-SHA256 con 100K iteraciones. Los captions cifrados nuevos incluyen `[SD-KDF:PBKDF2]`; archivos legacy `[SD-ENC]` siguen descifrando con fallback SHA-256.
- **Auto-lock por inactividad** - `EncryptionState` guarda última actividad y limpia la clave en memoria tras el tiempo configurado. Frontend renueva actividad por interacción y verifica estado periódicamente.
- **Lock Vault** - Sidebar footer agrega botón para limpiar la clave de cifrado sin cerrar sesión de Telegram.
- **Upload cifrado por archivo** - TopBar agrega `Add Encrypted`, que fuerza cifrado para esa selección aunque la carpeta no tenga auto-encrypt.
- **Sesión protegida con PIN** - Nuevo flujo opcional para cifrar `telegram.session` con PIN de 6 dígitos y desbloquear antes del auto-login.

---

## [2.1.0] - 2026-05-28

### Compartir Mejorado

- **QR para share links** - `ShareModal` genera QR client-side con `qrcode` para links individuales y permite descargarlo como PNG.
- **Panel de links activos** - Settings agrega pestaña Sharing con lista de links activos, archivo, expiración, contador de descargas, copiar y revocar.
- **Compartir múltiples archivos** - Bulk action "Share All" genera un link por archivo seleccionado y permite copiar toda la lista.
- **Expiry personalizado** - `ShareModal` incluye presets 1h / 24h / 7d / Never más input libre en minutos.
- **Download count durable** - `share_links.json` persiste `download_count`; el servidor incrementa el contador al servir un link.
- **Versión sincronizada** - `VERSION`, `package.json`, `tauri.conf.json`, `Cargo.toml`, README y arquitectura pasan a `2.1.0`.

---

## [1.9.0] - 2026-05-28

### Operaciones de Archivos

- **Batch rename** — Select N files → modal with pattern editor supporting `{n}` (zero-padded index), `{name}` (base name), `{ext}` (extension), `{date}` (YYYY-MM-DD). Live preview table shows all renames before applying. Warns on duplicate names or missing extension. Toolbar "Rename N" button appears when ≥ 2 files are selected. Calls `cmd_batch_rename` which rewrites captions preserving SHA-256 and size metadata.
- **Deduplicación UI** — When upload hash-matches an existing file, status transitions to `'duplicate'` instead of silently skipping. A `DuplicateDialog` intercepts the first pending duplicate and presents "Upload Anyway" (retriggers with `skip_dedup: true`) or "Skip". Rust `cmd_upload_file` gains `skip_dedup: Option<bool>` to bypass the check on force.
- **Duplicate file** — "Duplicate" in context menu (`CopyPlus` icon). Forwards the message to the same Telegram channel (zero re-upload), fetches the new top message, renames its caption to `"filename (2).ext"`. Folder is refreshed via React Query invalidation.
- **Preview texto** — `.txt`, `.md`, `.csv`, `.json` files open in `TextPreviewModal` instead of download. Content is streamed from the LAN actix server (`/stream/{folder}/{id}?token=…`) via `fetch()`. Renderers: plain `<pre>` for text, `JSON.stringify` with indent for JSON, RFC-4180 table for CSV, basic header/bold/code rendering for Markdown.
- **Panel de info** — `FileInfoPanel` (fixed right panel, 288 px wide) shows name, extension badge, encrypted indicator, size, date, folder, MIME type, SHA-256 (with one-click copy). Triggered by "i" hover button on `FileCard` or "File Info" in context menu. SHA-256 is now propagated from `CaptionMetadata` through `FileMetadata` → `TelegramFile`.

---

## [1.8.0] - 2026-05-28

### Vault Dashboard

- **Storage statistics modal** — `VaultModal` accessible via the BarChart icon in the sidebar header. Shows total file count, total size, and a donut chart breakdown by type (Images / Videos / Audio / Docs / Other) with per-category counts and sizes. Pure SVG, zero extra dependencies.
- **Top 5 folders** — Relative progress bars showing the heaviest folders by byte total.
- **Upload trend chart** — SVG polyline over the last 30 days, built from activity log upload events. Includes gradient fill and axis labels.
- **Sidebar badge** — "X files · Y GB" replaces the "Telegram cloud drive" subtitle in the sidebar header once the index has data.
- **Export CSV** — Uses `tauri-plugin-dialog` save dialog to pick a path, then `cmd_export_csv` (Rust) writes name, size_bytes, date, and folder for every indexed file. Fields containing commas are RFC 4180 quoted.

---

## [1.7.0] - 2026-05-28

### Rendimiento & Estabilidad

- **Granular error boundaries** — `ErrorBoundary` extended with `onDismiss?: () => void`. PreviewModal, MediaPlayer, and PdfViewer are each wrapped; a crash closes only that modal instead of taking down the whole app.
- **View-aware skeleton screens** — List-view loading state now shows 16 rows matching the `grid-cols-[2.5rem_1fr_6rem_7rem]` layout. Grid/gallery keep the existing card pulse skeleton.
- **Rust retry logic** — `is_retryable_error()` and `with_retry()` added to `commands/utils.rs`. `cmd_get_files` and `cmd_search_global` retry up to 3 times (1 s / 2 s backoff) on connection, timeout, reset, and pipe errors.
- **Rust unit tests** — 7 tests for `parse_search_filters` and 4 tests for `PersistentIndexState` folder-size cache. **18 tests passing total.**

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
