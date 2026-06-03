import { invoke } from '@tauri-apps/api/core';
import type { AccountMeta, ActivityEntry, AutomationConfig, BandwidthStats, BookCardData, CleanupRule, CrossCopyResult, DuplicateGroup, ShareLinkInfo, SyncSession, TelegramFile, TelegramFolder } from '../types';

type FileRecord = TelegramFile;
let streamTokenPromise: Promise<string> | null = null;

export const tauriApi = {
    connect(apiId: number) {
        return invoke<boolean>('cmd_connect', { apiId });
    },
    isSessionProtected() {
        return invoke<boolean>('cmd_is_session_protected');
    },
    unlockSessionPin(pin: string) {
        return invoke<void>('cmd_unlock_session_pin', { pin });
    },
    setSessionPin(pin: string) {
        return invoke<void>('cmd_set_session_pin', { pin });
    },
    clearSessionPin(pin: string) {
        return invoke<void>('cmd_clear_session_pin', { pin });
    },
    logout() {
        return invoke<boolean>('cmd_logout');
    },
    cleanCache() {
        return invoke<void>('cmd_clean_cache');
    },
    getFiles(folderId: number | null) {
        return invoke<FileRecord[]>('cmd_get_files', { folderId });
    },
    getBandwidth() {
        return invoke<BandwidthStats>('cmd_get_bandwidth');
    },
    scanFolders() {
        return invoke<TelegramFolder[]>('cmd_scan_folders');
    },
    createFolder(name: string, parentId?: number | null) {
        return invoke<TelegramFolder>('cmd_create_folder', { name, parentId });
    },
    deleteFolder(folderId: number) {
        return invoke<boolean>('cmd_delete_folder', { folderId });
    },
    renameFolder(folderId: number, newName: string) {
        return invoke('cmd_rename_folder', { folderId, newName });
    },
    getFolderSize(folderId: number) {
        return invoke<[number, number]>('cmd_get_folder_size', { folderId });
    },
    getAllIndexedFiles() {
        return invoke<FileRecord[]>('cmd_get_all_indexed_files');
    },
    moveFiles(messageIds: number[], sourceFolderId: number | null, targetFolderId: number | null) {
        return invoke('cmd_move_files', { messageIds, sourceFolderId, targetFolderId });
    },
    copyFiles(messageIds: number[], sourceFolderId: number | null, targetFolderId: number | null) {
        return invoke('cmd_copy_files', { messageIds, sourceFolderId, targetFolderId });
    },
    renameFile(messageId: number, folderId: number | null, newName: string) {
        return invoke('cmd_rename_file', { messageId, folderId, newName });
    },
    deleteFile(messageId: number, folderId: number | null, secureDelete = false) {
        return invoke('cmd_delete_file', { messageId, folderId, secureDelete });
    },
    searchGlobal(query: string) {
        return invoke<TelegramFile[]>('cmd_search_global', { query });
    },
    downloadFile(messageId: number, savePath: string, folderId: number | null, transferId?: string) {
        return invoke('cmd_download_file', { messageId, savePath, folderId, transferId });
    },
    downloadFilesZip(files: { messageId: number; folderId: number | null; filename: string }[], savePath: string) {
        return invoke<string>('cmd_download_files_zip', { files, savePath });
    },
    getPreview(messageId: number, folderId: number | null) {
        return invoke<string>('cmd_get_preview', { messageId, folderId });
    },
    getThumbnail(messageId: number, folderId: number | null) {
        return invoke<string>('cmd_get_thumbnail', { messageId, folderId });
    },
    getBookCardData(messageId: number, folderId: number | null) {
        return invoke<BookCardData>('cmd_get_book_card_data', { messageId, folderId });
    },
    indexPdfText(messageId: number, folderId: number | null) {
        return invoke<string>('cmd_index_pdf_text', { messageId, folderId });
    },
    getStreamToken() {
        if (!streamTokenPromise) {
            streamTokenPromise = invoke<string>('cmd_get_stream_token').catch((error) => {
                streamTokenPromise = null;
                throw error;
            });
        }
        return streamTokenPromise;
    },
    createShareLink(fileId: number, folderId: number | null, filename: string, expiresInMinutes?: number, maxDownloads?: number, password?: string) {
        return invoke<string>('cmd_create_share_link', { fileId, folderId, filename, expiresInMinutes, maxDownloads, password });
    },
    revokeShareLink(token: string) {
        return invoke<void>('cmd_revoke_share_link', { token });
    },
    revokeShareLinks(tokens: string[]) {
        return invoke<number>('cmd_revoke_share_links', { tokens });
    },
    listShareLinks() {
        return invoke<ShareLinkInfo[]>('cmd_list_share_links');
    },
    getFolderInviteLink(folderId: number) {
        return invoke<string>('cmd_get_folder_invite_link', { folderId });
    },
    getLocalIp() {
        return invoke<string>('cmd_get_local_ip');
    },
    getEncryptionStatus() {
        return invoke<boolean>('cmd_get_encryption_status');
    },
    clearEncryptionKey() {
        return invoke<void>('cmd_clear_encryption_key');
    },
    setEncryptionKey(password: string) {
        return invoke<void>('cmd_set_encryption_key', { password });
    },
    unlockEncryptionKey(password: string) {
        return invoke<void>('cmd_unlock_encryption_key', { password });
    },
    touchEncryptionActivity() {
        return invoke<boolean>('cmd_touch_encryption_activity');
    },
    setEncryptionAutoLock(minutes: number | null) {
        return invoke<void>('cmd_set_encryption_auto_lock', { minutes });
    },
    rotateEncryptionKey(files: { messageId: number; folderId: number | null; filename: string }[], oldPassword: string, newPassword: string) {
        return invoke<number>('cmd_rotate_encryption_key', { files, oldPassword, newPassword });
    },
    encryptRemoteFiles(files: { messageId: number; folderId: number | null; filename: string }[], password: string) {
        return invoke<number>('cmd_encrypt_remote_files', { files, password });
    },
    saveClipboardImage(bytes: number[], filename: string) {
        return invoke<string>('cmd_save_clipboard_image', { bytes, filename });
    },
    getFileSize(path: string) {
        return invoke<number>('cmd_get_file_size', { path });
    },
    updateBackupFolder(localPath: string, remoteFolderId: number | null) {
        return invoke<void>('cmd_update_backup_folder', { localPath, remoteFolderId });
    },
    setFolderParent(folderId: number, parentId: number | null) {
        return invoke<TelegramFolder>('cmd_set_folder_parent', { folderId, parentId });
    },
    getStartupArgs() {
        return invoke<string | null>('cmd_get_startup_args');
    },
    exportCsv(savePath: string) {
        return invoke<void>('cmd_export_csv', { savePath });
    },
    exportManifestJson(savePath: string, manifestJson: string) {
        return invoke<void>('cmd_export_manifest_json', { savePath, manifestJson });
    },
    getCachedFiles(folderId: number | null) {
        return invoke<TelegramFile[]>('cmd_get_cached_files', { folderId });
    },
    extractZip(messageId: number, folderId: number | null, destDir: string) {
        return invoke<string[]>('cmd_extract_zip', { messageId, folderId, destDir });
    },
    compressImage(path: string, quality: number, maxDimension: number) {
        return invoke<string>('cmd_compress_image', { path, quality, maxDimension });
    },
    getFilesPaged(folderId: number | null, offsetId: number, limit: number) {
        return invoke<{ files: TelegramFile[]; next_offset_id: number | null; has_more: boolean }>(
            'cmd_get_files_paged', { folderId, offsetId, limit }
        );
    },
    getCachedFolders() {
        return invoke<TelegramFolder[]>('cmd_get_cached_folders');
    },
    duplicateFile(messageId: number, folderId: number | null, newName: string) {
        return invoke<boolean>('cmd_duplicate_file', { messageId, folderId, newName });
    },
    batchRename(renames: { messageId: number; folderId: number | null; newName: string }[]) {
        return invoke<number>('cmd_batch_rename', { renames });
    },
    getAutomationConfig() {
        return invoke<AutomationConfig>('cmd_get_automation_config');
    },
    setScheduledSyncTime(time: string | null) {
        return invoke<void>('cmd_set_scheduled_sync_time', { time });
    },
    setCleanupRules(rules: CleanupRule[]) {
        return invoke<void>('cmd_set_cleanup_rules', { rules });
    },
    getDueCleanupFiles() {
        return invoke<TelegramFile[]>('cmd_get_due_cleanup_files');
    },

    // ── v3.2 — Historial & Versiones ────────────────────────────────────────
    restoreVersion(messageId: number, folderId: number | null) {
        return invoke<boolean>('cmd_restore_version', { messageId, folderId });
    },
    recordSyncSession(input: {
        folderId: number | null;
        folderName: string;
        startedAtMs: number;
        completedAtMs: number;
        filesTotal: number;
        filesAdded: string[];
        filesRemoved: string[];
    }) {
        return invoke<void>('cmd_record_sync_session', {
            input: {
                folder_id: input.folderId,
                folder_name: input.folderName,
                started_at_ms: input.startedAtMs,
                completed_at_ms: input.completedAtMs,
                files_total: input.filesTotal,
                files_added: input.filesAdded,
                files_removed: input.filesRemoved,
            },
        });
    },
    getSyncHistory(limit?: number) {
        return invoke<SyncSession[]>('cmd_get_sync_history', { limit });
    },
    findDuplicates() {
        return invoke<DuplicateGroup[]>('cmd_find_duplicates');
    },
    exportActivityLog(entries: ActivityEntry[], format: 'csv' | 'json', savePath: string) {
        return invoke<void>('cmd_export_activity_log', {
            entriesJson: JSON.stringify(entries),
            format,
            savePath,
        });
    },

    // ── v3.3 — Multi-Cuenta ──────────────────────────────────────────────────
    listAccounts() {
        return invoke<AccountMeta[]>('cmd_list_accounts');
    },
    getActiveAccountId() {
        return invoke<string | null>('cmd_get_active_account_id');
    },
    switchAccount(accountId: string) {
        return invoke<void>('cmd_switch_account', { accountId });
    },
    prepareNewAccount() {
        return invoke<string>('cmd_prepare_new_account');
    },
    finalizeAccount(alias?: string) {
        return invoke<AccountMeta>('cmd_finalize_account', { alias });
    },
    removeAccount(accountId: string) {
        return invoke<void>('cmd_remove_account', { accountId });
    },
    setAccountAlias(accountId: string, alias: string) {
        return invoke<void>('cmd_set_account_alias', { accountId, alias });
    },
    setAccountColor(accountId: string, color: string | null) {
        return invoke<void>('cmd_set_account_color', { accountId, color });
    },
    fetchAccountAvatar() {
        return invoke<string | null>('cmd_fetch_account_avatar');
    },
    crossAccountDownload(
        files: { messageId: number; folderId: number | null; filename: string }[],
        transferId: string,
    ) {
        return invoke<CrossCopyResult>('cmd_cross_account_download', {
            files: files.map(f => ({ message_id: f.messageId, folder_id: f.folderId, filename: f.filename })),
            transferId,
        });
    },
    crossAccountCleanup(transferId: string) {
        return invoke<void>('cmd_cross_account_cleanup', { transferId });
    },

    // ── v3.6 — Seguridad Avanzada ────────────────────────────────────────────
    verifyFileIntegrity(path: string, expectedSha256: string) {
        return invoke<boolean>('cmd_verify_file_integrity', { path, expectedSha256 });
    },
    setWipeSecret(secret: string) {
        return invoke<void>('cmd_set_wipe_secret', { secret });
    },
    clearWipeSecret() {
        return invoke<void>('cmd_clear_wipe_secret');
    },
    hasWipeSecret() {
        return invoke<boolean>('cmd_has_wipe_secret');
    },
    checkRemoteWipe() {
        return invoke<boolean>('cmd_check_remote_wipe');
    },
    executeWipe() {
        return invoke<void>('cmd_execute_wipe');
    },
    saveEncryptedActivity(entriesJson: string) {
        return invoke<void>('cmd_save_encrypted_activity', { entriesJson });
    },
    loadEncryptedActivity() {
        return invoke<string | null>('cmd_load_encrypted_activity');
    },
    isTotpEnabled() {
        return invoke<boolean>('cmd_is_totp_enabled');
    },
    setupTotp() {
        return invoke<string>('cmd_setup_totp');
    },
    confirmTotpSetup(code: string) {
        return invoke<boolean>('cmd_confirm_totp_setup', { code });
    },
    verifyTotp(code: string) {
        return invoke<boolean>('cmd_verify_totp', { code });
    },
    disableTotp(code: string) {
        return invoke<void>('cmd_disable_totp', { code });
    },
    exportFolderKey(folderId: number, sharePassword: string) {
        return invoke<string>('cmd_export_folder_key', { folderId, sharePassword });
    },
    importFolderKey(blob: string, sharePassword: string) {
        return invoke<number>('cmd_import_folder_key', { blob, sharePassword });
    },

    // ── v3.5 — Automatización Avanzada ──────────────────────────────────────
    setWifiOnlySync(enabled: boolean) {
        return invoke<void>('cmd_set_wifi_only_sync', { enabled });
    },
    isWifiConnected() {
        return invoke<boolean>('cmd_is_wifi_connected');
    },
    countCleanupCandidates() {
        return invoke<number>('cmd_count_cleanup_candidates');
    },

    // ── v3.4 — Companion Móvil ───────────────────────────────────────────────
    setWebPin(pin: string) {
        return invoke<void>('cmd_set_web_pin', { pin });
    },
    clearWebPin() {
        return invoke<void>('cmd_clear_web_pin');
    },
    hasWebPin() {
        return invoke<boolean>('cmd_has_web_pin');
    },
    getWebAccessUrl() {
        return invoke<string>('cmd_get_web_access_url');
    },
};
