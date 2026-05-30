export interface TelegramFile {
    id: number;
    folder_id?: number | null;
    name: string;
    size: number;
    sizeStr: string;
    created_at?: string;
    icon_type?: string;
    type?: 'folder' | 'file';
    is_encrypted?: boolean;
    sha256?: string;
    mime_type?: string;
    file_ext?: string;
    tags?: string[];
    quick_note?: string;
    pdf_text?: string;
}

export interface TelegramFolder {
    id: number;
    name: string;
    parent_id?: number;
}

export interface BookCardData {
    title?: string | null;
    author?: string | null;
    thumbnail?: string | null;
}

export interface QueueItem {
    id: string;
    path: string;
    batchId?: string;
    remoteName?: string;
    folderId: number | null;
    status: 'pending' | 'uploading' | 'success' | 'error' | 'cancelled' | 'skipped' | 'duplicate' | 'conflict';
    error?: string;
    progress?: number;
    encrypt?: boolean;
    size?: number;
    startedAt?: number;
    skipDedup?: boolean;
    source?: 'manual' | 'backup';
}

export interface BandwidthStats {
    up_bytes: number;
    down_bytes: number;
    date?: string;
}

export interface DownloadItem {
    id: string;
    messageId: number;
    filename: string;
    folderId: number | null;
    savePath?: string;
    openAfter?: boolean;
    status: 'pending' | 'downloading' | 'success' | 'error' | 'cancelled';
    error?: string;
    progress?: number;
}

export interface BackupFolder {
    local_path: string;
    remote_folder_id: number | null;
    enabled: boolean;
}

export interface CleanupRule {
    folder_id: number | null;
    max_age_days: number;
}

export interface AutomationConfig {
    scheduled_sync_time: string | null;
    cleanup_rules: CleanupRule[];
}

export interface AppConfig {
    autoSyncInterval: number; // minutes, 0 = disabled
    encryptionEnabled: boolean;
    closeToTray: boolean;
    autostart: boolean;
}

export interface ActivityEntry {
    id: string;
    type: 'upload' | 'download' | 'preview' | 'share' | 'rename' | 'move' | 'copy' | 'delete' | 'backup' | 'security';
    message: string;
    timestamp: string;
    fileName?: string;
    folderId?: number | null;
}

export interface ShareLinkInfo {
    token: string;
    file_id: number;
    folder_id?: number | null;
    filename: string;
    expires_at_epoch_ms?: number | null;
    created_at_epoch_ms: number;
    download_count: number;
    max_downloads?: number | null;
    is_password_protected: boolean;
    url: string;
}
