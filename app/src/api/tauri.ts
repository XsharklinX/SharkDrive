import { invoke } from '@tauri-apps/api/core';
import type { BandwidthStats, BookCardData, TelegramFile, TelegramFolder } from '../types';

type FileRecord = TelegramFile;
let streamTokenPromise: Promise<string> | null = null;

export const tauriApi = {
    connect(apiId: number) {
        return invoke<boolean>('cmd_connect', { apiId });
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
    softDeleteFolder(folderId: number, displayName: string) {
        return invoke('cmd_soft_delete_folder', { folderId, displayName });
    },
    restoreFolder(folderId: number, displayName: string) {
        return invoke('cmd_restore_folder', { folderId, displayName });
    },
    getTrashedFolders() {
        return invoke<{ id: number; name: string }[]>('cmd_get_trashed_folders');
    },
    getOrCreateTrash() {
        return invoke<number>('cmd_get_or_create_trash');
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
    deleteFile(messageId: number, folderId: number | null) {
        return invoke('cmd_delete_file', { messageId, folderId });
    },
    searchGlobal(query: string) {
        return invoke<TelegramFile[]>('cmd_search_global', { query });
    },
    downloadFile(messageId: number, savePath: string, folderId: number | null, transferId?: string) {
        return invoke('cmd_download_file', { messageId, savePath, folderId, transferId });
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
    getStreamToken() {
        if (!streamTokenPromise) {
            streamTokenPromise = invoke<string>('cmd_get_stream_token').catch((error) => {
                streamTokenPromise = null;
                throw error;
            });
        }
        return streamTokenPromise;
    },
    createShareLink(fileId: number, folderId: number | null, filename: string, expiresInMinutes?: number) {
        return invoke<string>('cmd_create_share_link', { fileId, folderId, filename, expiresInMinutes });
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
    saveClipboardImage(bytes: number[], filename: string) {
        return invoke<string>('cmd_save_clipboard_image', { bytes, filename });
    },
    updateBackupFolder(localPath: string, remoteFolderId: number | null) {
        return invoke<void>('cmd_update_backup_folder', { localPath, remoteFolderId });
    },
    setFolderParent(folderId: number, parentId: number | null) {
        return invoke<TelegramFolder>('cmd_set_folder_parent', { folderId, parentId });
    },
};
