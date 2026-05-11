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
}

export interface TelegramFolder {
    id: number;
    name: string;
    parent_id?: number;
}

export interface QueueItem {
    id: string;
    path: string;
    folderId: number | null;
    status: 'pending' | 'uploading' | 'success' | 'error' | 'cancelled' | 'skipped';
    error?: string;
    progress?: number;
    encrypt?: boolean;
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
    status: 'pending' | 'downloading' | 'success' | 'error' | 'cancelled';
    error?: string;
    progress?: number;
}

export interface BackupFolder {
    local_path: string;
    remote_folder_id: number | null;
    enabled: boolean;
}

export interface AppConfig {
    autoSyncInterval: number; // minutes, 0 = disabled
    encryptionEnabled: boolean;
    closeToTray: boolean;
    autostart: boolean;
}

export interface ActivityEntry {
    id: string;
    type: 'upload' | 'download' | 'preview' | 'share' | 'rename' | 'move' | 'delete' | 'backup' | 'security';
    message: string;
    timestamp: string;
    fileName?: string;
    folderId?: number | null;
}
