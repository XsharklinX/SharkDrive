# Changelog

All notable changes to SharkDrive are documented here.

---

## [3.6.0] - 2026-06-03

### Seguridad Avanzada

**Verificación de integridad** — Tras cada descarga exitosa, se calcula el SHA-256 del archivo guardado en disco y se compara con `file.sha256` (del caption de Telegram). Si no coincide → toast de error `⚠️ Integrity mismatch`. La función `verifyIntegrity()` es async no-bloqueante — no retrasa la UI si falla. `DownloadItem` ahora tiene campo `sha256?: string`. `queueDownload()` acepta sha256 como parámetro opcional y lo pasa al item.

**Wipe remoto** — El usuario configura un "wipe secret" en Settings → Encryption. Desde otro dispositivo, envía `[SD-WIPE-secret]` a su propio Saved Messages. Al próximo connect de SharkDrive, `cmd_check_remote_wipe` escanea los últimos 10 mensajes, hace SHA-256 del texto y compara con el hash almacenado. Si coincide: borra el mensaje de Telegram (no se re-dispara) y emite `WipeConfirmModal` con countdown de 10 segundos. `cmd_execute_wipe` elimina `app_data_dir/` y `app_cache_dir/` completos y llama a `app_handle.exit(0)`.

**Audit log cifrado** — `useActivityLog` actualizado: cuando `encryptionEnabled=true`, la actividad se persiste en `activity_log.enc` vía `cmd_save_encrypted_activity` (AES-256-GCM, nonce prefijado con magic `SDACT1`). Al vault unlock, `cmd_load_encrypted_activity` desencripta y restaura el historial. Fallback al plugin-store plaintext cuando vault está bloqueado. `useActivityLog` ahora acepta `encryptionEnabled: boolean` como parámetro.

**2FA en VaultLock** — `TotpState`: secreto TOTP (20 bytes random) generado una vez, encriptado con la vault key y persistido en `totp_secret.enc`. `VaultLockScreen` detecta si TOTP está activo (onmount). Si activo: paso 1 = verificar password → paso 2 = verificar código TOTP. El código se verifica con `totp-rs` crate (SHA1, 6 dígitos, período 30s). Setup inline en Settings → Encryption: muestra QR (uri `otpauth://`) + input para confirmar. `TotpSetupModal.tsx` para el flujo desde Dashboard. Disable requiere un código actual válido.

**Compartir carpetas cifradas** — `cmd_export_folder_key(folder_id, share_password)`: deriva la folder key desde la master key, la encripta con `share_password` via PBKDF2+AES-256-GCM (100k iteraciones, salt dedicado), incluye `folder_id` como AAD para prevenir mix-up attacks. Retorna blob base64 `SDKV{folder_id_le}{nonce}{ciphertext}`. `cmd_import_folder_key(blob, share_password)`: invierte el proceso y guarda en `guest_folder_keys` de `EncryptionState`. `ExportKeyModal.tsx`: muestra QR + texto copiable + tab Import para pegar blob del otro usuario.

### Cambios técnicos
- `Cargo.toml` — `totp-rs = "5"`, `data-encoding = "2"`
- `commands/security.rs` — nuevo módulo con todos los comandos de v3.6 (15 nuevos comandos)
- `commands/encryption.rs` — `EncryptionState` +`guest_folder_keys: Mutex<HashMap<Option<i64>, Vec<u8>>>`, método `add_guest_folder_key`, método `get_folder_key`
- `lib.rs` — gestiona `Arc<WipeState>`, `Arc<TotpState>`, registra 15 nuevos comandos
- `hooks/useFileDownload.ts` — `verifyIntegrity()` post-download; `DownloadItem.sha256`; `queueDownload()` +sha256
- `hooks/useActivityLog.ts` — encryptionEnabled param; encrypted vs plaintext storage
- `components/dashboard/VaultLockScreen.tsx` — 2-step unlock (password → TOTP si activo)
- `components/dashboard/WipeConfirmModal.tsx` — countdown 10s antes de ejecutar wipe
- `components/dashboard/TotpSetupModal.tsx` — QR setup + confirmación
- `components/dashboard/ExportKeyModal.tsx` — export/import de folder keys con QR
- `components/dashboard/SettingsModal.tsx` — TotpSection + RemoteWipeSection inline; import `QRCode`
- `Dashboard.tsx` — wipe check on connect; 3 nuevos modales; `useActivityLog(store, encryptionEnabled)`

---

## [3.5.0] - 2026-06-02

### Automatización Avanzada

**Reglas de naming en upload** — Ya estaba funcionando. Fix: `applyUploadNamingPattern` ahora auto-añade la extensión original si el pattern no la incluye (ej. pattern `{date}_{name}` con `foto.jpg` → `2026-06-02_foto.jpg` en vez de `2026-06-02_foto`).

**Auto-cleanup ejecutado** — La lógica ya existía (se dispara post-sync). Añadido:
- Botón "Run cleanup now" en Settings → Auto Backup → Cleanup Review con badge del número de candidatos
- Respuesta inmediata mostrando cuántos archivos matchean las reglas actuales
- Rust: `cmd_count_cleanup_candidates` (reutiliza `cmd_get_due_cleanup_files`)

**Sync condicional (WiFi/LAN only)** — Nueva feature:
- Settings → Auto Backup: toggle "WiFi / LAN only sync"
- Persiste en `localStorage['sharkdrive.wifiOnlySync.v1']` y `AutomationConfig.wifi_only_sync`
- El scheduler emite `scheduled-sync-request` — Dashboard verifica WiFi antes de ejecutar
- Si está en datos móviles: toast "Scheduled sync skipped — not on WiFi / LAN"
- Rust: `cmd_is_wifi_connected` usa `netsh wlan show interfaces` (WiFi) + PowerShell `Get-NetAdapter` (Ethernet)
- `cmd_set_wifi_only_sync` persiste en `automation_config.json`

**Upload batch inteligente** — Refactoring completo del motor de uploads:
- De 1 upload secuencial a hasta 4 en paralelo cuando hay ≥4 archivos pendientes
- Eliminado el estado `processing` (boolean) — reemplazado por `activeUploadsRef` (ref sin re-render)
- El `useEffect` calcula `slots = targetConcurrency - activeUploadsRef.current` y lanza exactamente ese número
- Para <4 archivos: sigue siendo 1 en paralelo (evita rate limiting de Telegram en uploads pequeños)
- Sin cambios en la UI — la UploadQueue existente muestra múltiples items en `uploading` simultáneamente

**Reglas de auto-clasificación** — Nueva feature:
- Configurar en Settings → Auto Backup: tipo de archivo → carpeta destino
- Tipos soportados: `image`, `video`, `audio`, `doc`, `pdf` (específico), `other`
- Se aplica en `queueUploadCandidates` antes de encolar: si el archivo no tiene `folderId` explícito, se evalúan las reglas
- Persiste en `localStorage['sharkdrive.classificationRules.v1']` (sin backend)
- UI: selector de tipo + selector de carpeta + botón "Add rule"; lista con toggle enable/disable y delete
- Nuevas utilidades en `utils.ts`: `genericFileType()`, `matchesClassificationRule()`, `CLASSIFICATION_RULES_KEY`

### Cambios técnicos
- `automation.rs` — `AutomationConfig` +`wifi_only_sync` field; `cmd_set_wifi_only_sync`, `cmd_is_wifi_connected`, `cmd_count_cleanup_candidates`
- `utils.ts` — Fix `applyUploadNamingPattern` (auto-extension); `genericFileType`, `matchesClassificationRule`, `CLASSIFICATION_RULES_KEY`
- `types.ts` — `AutomationConfig.wifi_only_sync`, `ClassificationRule` interface
- `useFileUpload.ts` — parallelism refactor + auto-classification in `queueUploadCandidates`
- `SettingsModal.tsx` — WiFi toggle, "Run cleanup now" button, classification rules UI; import `RefreshCw`, `ClassificationRule`
- `Dashboard.tsx` — scheduled sync listener checks WiFi before proceeding
- `LanguageContext.tsx` — 9 nuevas claves EN+ES
- `api/tauri.ts` — `setWifiOnlySync`, `isWifiConnected`, `countCleanupCandidates`

---

## [3.4.0] - 2026-06-02

### Companion Móvil

**Web viewer LAN (`/web`)**
- SPA embebida en el binario de Rust via `include_str!("web_app.html")` — sin build step adicional
- Accesible desde cualquier dispositivo en la misma red en `http://IP:14200/web`
- Navegación por carpetas (lista con chips), lista de archivos con iconos por tipo
- Thumbnails automáticos: el servidor sirve el cache de `app_data_dir/thumbnails/` si ya existen
- Download de archivos directamente desde el browser móvil
- Tema oscuro Telegram, responsive, mobile-first (no pinch-zoom, taps grandes)
- Rutas actix nuevas: `GET /web`, `POST /web/auth`, `GET /web/api/folders`, `GET /web/api/files/{key}`, `GET /web/api/stream/{key}/{id}`, `GET /web/api/thumbnail/{key}/{id}`

**Autenticación web (PIN de 6 dígitos)**
- `web_auth.rs` — `WebAuthState`: hash SHA256 del PIN + tokens de sesión en memoria
- PIN separado del session PIN del escritorio (solo protege acceso web)
- Sin PIN configurado: acceso libre en la LAN (útil para uso doméstico)
- `POST /web/auth { pin }` → `{ token }`, token enviado en header `X-Web-Token` en requests siguientes
- Comandos Tauri: `cmd_set_web_pin`, `cmd_clear_web_pin`, `cmd_has_web_pin`

**QR de acceso rápido**
- `cmd_get_web_access_url()` → `http://{local_ip}:14200/web` (detecta IP local via UDP)
- `WebAccessModal.tsx`: genera QR con `qrcode` lib, muestra URL copiable, gestiona PIN
- Botón `Smartphone` en el TopBar para abrir el modal

**Upload desde móvil**
- Botón FAB (floating action button) en la web app → file picker nativo del teléfono
- `POST /web/api/upload/{folder_key}?t=TOKEN` con `Content-Type: application/octet-stream` y header `X-Filename`
- El servidor guarda bytes en temp, emite evento `web-upload-pending` al frontend de escritorio
- Dashboard.tsx escucha `web-upload-pending` → `queueUploadCandidates()` → procesado por upload queue existente
- Toast "Mobile upload received: {filename}" en el escritorio
- `cmd_cross_account_cleanup` elimina archivos temp tras upload

### Cambios técnicos
- `web_app.html` — SPA vanilla JS/CSS embebida, ~250 líneas minificadas
- `web_auth.rs` — nuevo módulo `WebAuthState`
- `commands/web.rs` — 4 comandos Tauri nuevos
- `server.rs` — signature de `start_server` extendida con `web_auth`, `account_manager`, `app_handle`; 7 nuevas rutas actix
- `lib.rs` — gestiona `Arc<WebAuthState>`, pasa a servidor en spawn thread
- `WebAccessModal.tsx` — QR + PIN setup/clear
- `TopBar.tsx` — botón Smartphone + `onOpenWebAccess` prop
- `Dashboard.tsx` — `showWebAccess` state + listener `web-upload-pending`
- CORS: `X-Frame-Options: SAMEORIGIN` (era DENY) para permitir iframe en web viewer

---

## [3.3.0] - 2026-06-02

### Multi-Cuenta

**Account switcher + Stores aislados**
- `AccountManager` persiste cuentas en `accounts.json` y sessions en `accounts/{id}/`
- Migración automática al primer arranque: sesión legacy movida a `accounts/acc_default/`
- `cmd_switch_account`: desconecta client actual, activa nueva cuenta en AccountManager, hace swap de `PersistentIndexState` y `SyncLog`, emite evento `account-switched`
- `cmd_prepare_new_account`: crea slot temporal, activa, retorna al frontend en modo auth
- `cmd_finalize_account`: tras login exitoso, fetchea phone/username y actualiza el meta del account
- `PersistentIndexState.path` y `SyncLog.path` cambiados a `Mutex<PathBuf>` con `swap_to_account()`
- Todos los comandos de auth ahora usan `account_manager: State<Arc<AccountManager>>` para rutas de sesión
- Migración limpia: ninguna sesión de usuario existente se pierde

**Account Switcher UI**
- `AccountSwitcher.tsx`: dropdown compacto en el sidebar con avatar generativo (iniciales + color acento)
- Soporte para avatar real de Telegram via `cmd_fetch_account_avatar` (GetUserPhotos + GetFile)
- Botones inline de rename, change color (8 presets), remove account (solo cuentas inactivas)
- Acciones en hover: sin popups ni modales extra
- `useAccounts.ts`: hook para listar cuentas + active ID
- `Sidebar.tsx`: AccountSwitcher aparece justo bajo el header cuando hay >1 cuenta o `onAddAccount` disponible

**Copiar entre cuentas**
- `cmd_cross_account_download`: descarga archivos desde cuenta activa a `tmp/sharkdrive_xcopy_{id}/`, emite eventos `cross-copy-progress`
- `cmd_cross_account_cleanup`: limpia directorio temp tras upload
- `CrossAccountCopyModal.tsx`: flujo en 3 fases:
  1. Seleccionar cuenta destino
  2. Descargar archivos con barra de progreso
  3. Confirmar switch → la app cambia a cuenta destino y encola archivos en upload queue
- Contexto menu: "Copy to account…" visible solo cuando hay múltiples cuentas
- `handleCrossCopyAndSwitch()`: cambia cuenta → encola archivos temp → toast de confirmación
- Los archivos temp se reutilizan con el upload queue existente — sin duplicar lógica

**Alias y avatar**
- `cmd_set_account_alias(account_id, alias)` — renombra cuenta sin reconectar
- `cmd_set_account_color(account_id, color)` — color de acento hex
- `cmd_fetch_account_avatar()` — GetUserPhotos + GetFile → base64 data URL cacheado en AccountMeta
- Avatar: muestra foto de Telegram si existe, sino iniciales sobre color de acento
- 13 nuevas claves i18n EN + ES

### Cambios técnicos
- `account_manager.rs` — nuevo módulo con `AccountManager`, `AccountMeta`, `make_account_id()`, `now_ms()`
- `commands/accounts.rs` — 11 nuevos comandos Tauri
- `lib.rs` — `migrate_legacy_account()` en setup, gestiona `Arc<AccountManager>`, usa AccountManager para paths
- `auth.rs` — `session_paths()` ahora toma `&AccountManager`, todos los comandos de sesión actualizados
- `index_store.rs` — `path: Mutex<PathBuf>` + `swap_to_account()`
- `sync_log.rs` — `path: Mutex<PathBuf>` + `swap_to_account()`
- Frontend: `useAccounts`, `AccountSwitcher`, `CrossAccountCopyModal` (nuevos)
- `Sidebar.tsx`, `Dashboard.tsx`, `ContextMenu.tsx`, `FileExplorer.tsx` — props nuevas para cuentas

---

## [3.2.0] - 2026-06-02

### Historial & Versiones

**Historial de versiones**
- Carpetas con múltiples archivos del mismo nombre ahora muestran "Version history" en el menú contextual
- `VersionHistoryModal`: vista cronológica de todas las versiones (v1, v2, v3...) con fecha, tamaño y botón de restaurar
- Restaurar una versión anterior la reenvía al frente del canal (nueva copia en top, original preservado)
- Versión actual marcada con badge "Current" — sin botón de restaurar
- Rust: `cmd_restore_version` — forward de mensaje a la misma carpeta vía `forward_messages`

**Historial de sync**
- `sync_log.rs` — nuevo store que persiste sesiones de sync en `sync_log.json` (max 200 sesiones)
- Cada refresh de archivos registra automáticamente: folder, timestamp inicio/fin, archivos añadidos/eliminados
- `SyncHistoryPanel`: lista de sesiones con badges `+N` / `-N`, expandible para ver archivos exactos
- Accesible desde el botón `RefreshCw` en el TopBar
- Rust: `cmd_record_sync_session`, `cmd_get_sync_history` con filtro por carpeta

**Comparar duplicados**
- `cmd_find_duplicates`: escanea el índice local agrupando por `(nombre_lower, tamaño_bytes)` — sin descargar archivos
- `DuplicatesPanel`: panel con total de bytes desperdiciados, grupos ordenados por mayor desperdicio
- Cada grupo es expandible — muestra en qué carpeta está cada copia y botón "Delete" para las copias extra
- La primera copia de cada grupo se marca como "keep" (sin botón eliminar)
- Accesible desde el botón `GitFork` en el TopBar

**Activity export**
- `cmd_export_activity_log(entries_json, format, save_path)` — recibe el log del frontend y escribe CSV o JSON
- En Settings → Activity: botones "CSV" y "JSON" junto a `t('exportActivity')`
- CSV incluye columnas: timestamp, type, message, filename, folder_id
- Solo aparece si hay entradas registradas

### Cambios técnicos
- `sync_log.rs` — nuevo módulo `SyncLog` con `RwLock<SyncLogData>`, persiste como JSON
- `commands/versions.rs` — `cmd_restore_version`, `cmd_record_sync_session`, `cmd_get_sync_history`
- `commands/duplicates.rs` — `cmd_find_duplicates` puro (sin red, desde índice local)
- `commands/fs/files.rs` — `cmd_export_activity_log`
- `VersionHistoryModal.tsx`, `SyncHistoryPanel.tsx`, `DuplicatesPanel.tsx` — nuevos componentes
- `ContextMenu.tsx` — prop `onVersionHistory` + icono `History` de lucide-react; `t('extractZip')` para ZIP
- `FileExplorer.tsx` — prop `onVersionHistory` pasada al ContextMenu
- `TopBar.tsx` — botones `onOpenSyncHistory` y `onOpenDuplicates`
- `SettingsModal.tsx` — prop `onExportActivity`, botones CSV/JSON en tab Activity
- `Dashboard.tsx` — `allFilesRef`/`preSyncInfoRef` para sync recording; `handleVersionHistory`, `handleExportActivity`; renderiza 3 nuevos panels
- i18n: 11 nuevas claves en EN + ES (`versionHistory`, `current`, `restore`, `versionHistoryHint`, `syncHistory`, `noSyncHistory`, `duplicates`, `noDuplicates`, `rescan`, `exportActivity`, `extractZip`)

---

## [3.1.0] - 2026-05-31

### Archivos & Contenido

- **Preview de tipos adicionales** — `isTextPreviewFile` ahora cubre 20+ extensiones: `.log/.xml/.yaml/.yml/.toml/.ini/.env/.sh/.bat/.py/.js/.ts/.html/.css/.sql` + `Dockerfile` y `Makefile` sin extensión. SVGs se muestran inline con DOMPurify-lite (scripts y event handlers eliminados). XMLs/HTML en verde monoespaciado.

- **Nota rápida inline** — Botón `StickyNote` en el hover overlay de cada FileCard. Click abre un mini `<textarea>` flotante sobre la tarjeta (3 filas). Ctrl+Enter guarda, Escape cancela. Si el archivo tiene nota: el ícono aparece en azul y un punto naranja confirma que hay contenido. Usa `useOrganization.setFileNote` — persiste en el store local.

- **Extracción de ZIP** — `cmd_extract_zip(message_id, folder_id, dest_dir)` en Rust: descarga el ZIP a temp, extrae con `zip::ZipArchive`, crea subdirectorios, ignora entradas `__MACOSX` y archivos ocultos. Retorna lista de rutas extraídas. "Extract here" aparece en el context menu solo para archivos `.zip`. El usuario elige la carpeta destino con un directory picker.

- **Compresión de imágenes** — `cmd_compress_image(path, quality, max_dimension)` en Rust (crate `image`): redimensiona si el lado más largo supera `max_dimension`, re-codifica como JPEG con `JpegEncoder::new_with_quality` o PNG. `ImageCompressDialog`: modal con 3 presets (High 90%, Medium 75%, Low 50%) + sliders manuales de calidad y dimensión máxima. Se muestra automáticamente al subir imágenes. Puede subir el original sin comprimir.

- **Búsqueda en contenido** — Checkbox "Search in content" debajo del campo de búsqueda (visible cuando `searchTerm.length >= 3`). `useContentSearch` hook: fetch paralelo del contenido de hasta 30 archivos de texto visibles vía LAN stream (timeout 5s por archivo, máximo 500 KB por archivo). Files con matches muestran badge "content" en la tarjeta. Contador de matches junto al checkbox. Spinner mientras escanea.

- **Vista de árbol de carpetas** ✅ ya existía — Sidebar renderiza jerarquía con indentación.

---

## [3.0.0] - 2026-05-31

### Pulido & Estabilidad

- **Light mode completo** — Fijados los últimos componentes con colores hardcodeados: `VaultLockScreen` (`bg-[#07111b]` → `bg-telegram-bg/95`), `GalleryView` (hover overlay y texto de nombre ahora usan `drop-shadow` para ser legibles sobre cualquier foto), `MediaPlayer` fondo (ahora usa `bg-telegram-bg/85` + CSS variable radial para el player de audio).

- **i18n cobertura completa** — `ContextMenu` ahora usa `t()` para todos sus textos: preview/playMedia/openPDF/openFolder, download, copyToFolder, duplicate, rename, shareFile/shareFolder, fileInfo, delete. Junto con TopBar, FileExplorer, EmptyState, y Sidebar, el 100% de la UI visible está traducido en EN/ES.

- **Formateo de errores amigable** — Nueva función `formatError(raw)` en `utils.ts`. Convierte errores técnicos de Rust en mensajes comprensibles: `FLOOD_WAIT_60` → "Telegram rate limit — wait 60s", "not connected" → "Not connected to Telegram. Check your internet connection.", `AUTH_KEY_UNREGISTERED` → "Your Telegram session expired.", etc. Aplicado en `useFileUpload` y `useFileDownload`.

- **Keyboard shortcuts** ✅ ya implementado — Panel en Settings > Shortcuts con rebinding visual.

- **Reconexión automática** ✅ ya implementada — `useTelegramConnection` escucha eventos de red y reconecta automáticamente.

- **Paginación desde Telegram** — `cmd_get_files_paged(folder_id, offset_id, limit)` en Rust: usa `iter_messages().offset_id(n).limit(50)` para cargar páginas de 50 archivos en lugar de todos a la vez. Hook `usePagedFiles` gestiona la acumulación de páginas, muestra los archivos del índice instantáneamente, y carga el primer chunk de Telegram en background. Botón "Load more files" aparece cuando `has_more = true`. `PersistentIndexState::upsert_file()` actualiza el índice incrementalmente por cada mensaje recibido. Las mutaciones (upload/delete/rename) incrementan un `fileVersion` counter que dispara un reload desde página 1.

---

## [2.9.0] - 2026-05-30

### Polish and Completeness

- **Keyboard shortcuts overlay** - Pressing `?` opens a categorized reference overlay backed by the configured shortcut map.
- **Resizable sidebar** - The sidebar width can be dragged between 180 px and 320 px and persists locally.
- **Custom accent color** - Settings exposes eight presets plus a custom hex/color picker applied through the shared CSS variable.
- **Offline explorer** - Cached indexed files remain visible while Telegram is unavailable, uploads pause in queue, and reconnect retries automatically.
- **First-run onboarding** - A four-step post-login wizard explains the product, confirms credentials, offers initial folder creation, and optionally enables encryption.
- **Rename undo** - `Ctrl+Z` restores the latest file or folder rename outside text inputs with a ten-entry local action buffer.
- **Improved previews** - Preview headers include filename, size, and date; text-compatible files can open in the text viewer.
- **Complete Spanish fallback** - The language provider localizes legacy visible labels, titles, placeholders, overlays, and newly mounted modal content while older components are migrated to translation keys.

---

## [2.8.1] - 2026-05-30

### Automation 2.0

- **Durable watched folders** - Auto-backup folders and Telegram destinations persist in `backup_folders.json` and resume watching after restart.
- **Remote naming rules** - Settings supports optional upload patterns with `{date}`, `{name}`, `{folder}`, `{n}` and `{ext}` plus a live preview; local filenames remain unchanged.
- **Safe cleanup review** - Persisted per-folder age rules detect old indexed Telegram files after startup and sync, then require explicit confirmation before deletion.
- **Daily scheduled sync** - Rust persists an optional local `HH:MM` sync time and emits one sync request per configured day.
- **Backup conflict dialog** - `backup_hashes.json` records the last uploaded hash per watched path so unchanged remote versions upload normally, unchanged backups skip automatically, and real two-sided changes require an explicit keep-or-upload decision.
- **Global upload progress** - The top bar shows a compact aggregate progress bar while uploads are active.
- **Version lock sync** - `scripts/sync-version.ps1` now updates both root entries in `package-lock.json` alongside the existing manifests.

---

## [2.8.0] - 2026-05-30

### Advanced Organization

- **Smart folders** - Sidebar exposes local virtual views for images, videos, documents, files larger than 100 MB, files from the last 7 days and locally assigned tags.
- **Local smart search** - Searches performed inside smart folders remain index-only and do not rescan Telegram.
- **Folder-scoped search** - Real folders expose a compact `Search only in this folder` toggle under the search field.
- **Folder statistics** - Folder context menus open an instant local-index summary with file count, total size, type breakdown and oldest/newest dates.
- **Organization verification** - Existing tag pills, folder colors, pinned-folder ordering and editable keyboard-shortcut Settings UI remain connected.
- **Virtual drag safety** - Moving files from smart folders resolves each real Telegram source folder before invoking the move command.

---

## [2.7.0] - 2026-05-30

### Security Suite Completion

- **Folder encryption audit** - Settings reports encrypted and plain indexed files per folder without rescanning Telegram.
- **Plain-file conversion wizard** - Existing plain files can be encrypted sequentially while originals remain until replacement uploads succeed.
- **Guided key rotation** - Rotation now separates current password, new password and per-file progress into an explicit three-step flow.
- **Timestamped secure delete** - Optional remote deletion rewrites captions as `[SD-DELETED-<timestamp>]` before deleting the Telegram message.
- **Session PIN feedback** - Startup PIN unlock handles invalid attempts inline and disables repeated submits while connecting.
- **Password strength reuse** - The dependency-free entropy estimate is visible when enabling encryption and when choosing a rotated password.

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

## [2.8.2] - 2026-05-30

### Windows Integration

- **Context menu Explorer** — Al iniciar, registra `HKCU\Software\Classes\*\shell\SharkDrive` (no requiere admin). Right-click en cualquier archivo en Explorer muestra "Upload to SharkDrive". El ejecutable se lanza con `sharkdrive://upload?path=<file>`, que el frontend parsea y encola.
- **Protocol handler** — Registra el esquema `sharkdrive://` en `HKCU\Software\Classes\sharkdrive`. Soporta `sharkdrive://open/{folder_id}` (navega a la carpeta) y `sharkdrive://upload?path=<file>` (encola upload). El argumento de startup se guarda en `StartupArgs` state y se consume una vez por el frontend via `cmd_get_startup_args`.
- **System tray mejorado** — Menu extendido: "Upload File…" → abre el file dialog (emite `tray-upload-file` al frontend), "Sync Now" → emite `tray-sync-now` al frontend, separador, "Open SharkDrive", separador, "Quit". Left-click sigue mostrando la ventana.
- **Rich notifications** — Añadido `tauri-plugin-notification` (Cargo + npm). `showNativeNotification(title, body)` reemplaza `new Notification()` en `useFileUpload.ts` y `useFileDownload.ts`. Muestra toast notifications nativas de Windows con ícono de la app y persistencia en el Action Center.
- **Jump List** — Skip por ahora (requiere COM interfaces via windows-rs crate, complejidad alta).
- **Startup speed** — Ya optimizado en v2.0 (splash screen + cached-files stale-while-revalidate).

---

## [2.3.0] - 2026-05-30

### Download Suite

- **ZIP bulk download** ✅ — Ya implementado: `cmd_download_files_zip` en Rust (crate `zip` v2.4.2), API `downloadFilesZip`, botón "ZIP" en TopBar toolbar de selección, dialog de save path.
- **Open after download** ✅ — Ya implementado: setting en SettingsModal, campo `openAfter` en `DownloadItem`, `openPath()` de `tauri-plugin-shell` llamado tras éxito.
- **Custom download folder** ✅ — Ya implementado: carpeta por tipo (images/videos/audio/docs/other) en Settings → Downloads, `configuredSavePath()` en el hook, `localStorage` como store.
- **Reordenar queue** ✅ — Ya implementado: drag & drop en `DownloadQueue`, `reorderDownloadQueue()` y `moveDownloadToFront()` en el hook.
- **Download folder tree** — `handleDownloadFolderTree(rootFolderId)` en Dashboard: traversa la jerarquía de carpetas del `folders` array, construye un `Map<folderId → relativePath>`, filtra `allIndexedRaw` para todos los archivos en ese árbol, encola cada uno con `savePath = basePath\relPath\filename`. Rust: añadido `create_dir_all` en `download_message_to_path` para crear subdirectorios automáticamente. Botón "With Subfolders" aparece en TopBar cuando `activeFolderId !== null` (no en Saved Messages). Usa el índice local — sin llamadas Telegram adicionales.

---

## [2.2.0] - 2026-05-29

### Media Suite

- **Custom audio controls** — Reemplaza el `<audio controls>` nativo del browser (que varía entre OS/browsers y no coincide con el diseño dark) con controles completamente custom: botón play/pause central, barra de progreso con seek drag, display de tiempo `0:00 / 3:42`, control de volumen con botón mute/unmute, botones SkipBack/SkipForward conectados a `onPrev`/`onNext`. Space bar funciona como play/pause. El `<audio>` element está oculto (`hidden`) y se controla via `useRef<HTMLAudioElement>`.
- **Scroll-to-zoom sin modificador** — PreviewModal ahora hace zoom con scroll simple (sin Ctrl). Scroll normal usa factor `deltaY * 0.002` (suave), Ctrl+scroll usa `deltaY * 0.008` (pinch-to-zoom en trackpad). Rango expandido: 0.5x–8x (antes 1x–5x). Al llegar a 1x el pan se resetea automáticamente.
- **Keyboard shortcuts de zoom** — En PreviewModal con imagen: `+` / `=` zoom in, `-` zoom out, `0` reset a 100%. Los títulos de los botones de zoom muestran el shortcut correspondiente.
- **Audio player** ✅ — Ya estaba completo con queue, shuffle, `onSelectTrack`, stream LAN.
- **Slideshow en galería** ✅ — Ya estaba completo con start/pause y delay configurable.
- **Image zoom & pan** ✅ — Ya estaba completo con drag, zoom buttons, double-click toggle.

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
