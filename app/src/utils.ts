import type { TelegramFile } from './types';

export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// ── File type classification ────────────────────────────────────────────

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'] as const;
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'aac', 'flac', 'm4a', 'opus'] as const;
const MEDIA_EXTENSIONS: readonly string[] = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif'] as const;

const endsWithAny = (name: string, exts: readonly string[]) => {
    const lower = name.toLowerCase();
    return exts.some(ext => lower.endsWith(ext));
};

export const isTextPreviewFile = (name: string) =>
    /\.(txt|md|markdown|csv|json|log|xml|yaml|yml|toml|ini|env|sh|bat|py|js|ts|html|css|sql|gitignore|editorconfig|htaccess)$/i.test(name)
    || name.toLowerCase() === 'dockerfile'
    || name.toLowerCase() === 'makefile'
    || name.toLowerCase() === 'readme';

export const isSvgFile = (name: string) => /\.svg$/i.test(name);
export const isMediaFile   = (name: string) => endsWithAny(name, MEDIA_EXTENSIONS);
export const isVideoFile   = (name: string) => endsWithAny(name, VIDEO_EXTENSIONS);
export const isAudioFile   = (name: string) => endsWithAny(name, AUDIO_EXTENSIONS);
export const isImageFile   = (name: string) => endsWithAny(name, IMAGE_EXTENSIONS);
export const isPdfFile     = (name: string) => name.toLowerCase().endsWith('.pdf');
export const isDocumentFile = (name: string) => (
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|markdown|csv|rtf|epub)$/i.test(name)
);

// RECENT_FOLDER_ID (-1) is a UI sentinel, not a real Telegram folder.
// When used as fallback it must be converted to null (= Saved Messages).
export const resolveFileFolderId = (file: TelegramFile, fallbackFolderId: number | null): number | null => {
    if (typeof file.folder_id === 'number') {
        return file.folder_id;
    }
    return fallbackFolderId === -1 ? null : fallbackFolderId;
};

export const buildRemoteFileKey = (file: Pick<TelegramFile, 'id' | 'folder_id'>, fallbackFolderId: number | null) =>
    `${resolveFileFolderId(file as TelegramFile, fallbackFolderId) ?? 'home'}:${file.id}`;

export const buildQueuedUploadKey = (path: string, folderId: number | null) =>
    `${folderId ?? 'home'}:${path.toLowerCase()}`;

export const UPLOAD_NAMING_PATTERN_KEY = 'sharkdrive.uploadNamingPattern.v1';

export const applyUploadNamingPattern = (
    path: string,
    pattern: string,
    folderName = 'Saved Messages',
    sequence = 1,
) => {
    const localName = path.split(/[/\\]/).pop() || path;
    const extensionIndex = localName.lastIndexOf('.');
    const extension = extensionIndex > 0 ? localName.slice(extensionIndex + 1) : '';
    const stem = extensionIndex > 0 ? localName.slice(0, extensionIndex) : localName;
    const date = new Date().toISOString().slice(0, 10);
    const replacements: Record<string, string> = {
        '{date}': date,
        '{fecha}': date,
        '{name}': stem,
        '{nombre}': stem,
        '{folder}': folderName,
        '{carpeta}': folderName,
        '{n}': String(sequence),
        '{ext}': extension,
    };
    let result = pattern.trim();
    for (const [token, value] of Object.entries(replacements)) {
        result = result.split(token).join(value);
    }
    return result.replace(/[<>:"/\\|?*]/g, '_').replace(/\.+$/, '').trim() || localName;
};

type SearchFilters = {
    text: string[];
    type?: string;
    ext?: string;
    encrypted?: boolean;
    folder?: string;
    tag?: string;
    minBytes?: number;
    maxBytes?: number;
};

const parseByteValue = (input: string): number | null => {
    const match = input.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)?$/);
    if (!match) return null;

    const value = Number(match[1]);
    const unit = match[2] ?? 'b';
    const multiplier = {
        b: 1,
        kb: 1024,
        mb: 1024 ** 2,
        gb: 1024 ** 3,
        tb: 1024 ** 4,
    }[unit];

    if (typeof multiplier !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return Math.round(value * multiplier);
};

export const parseAdvancedSearch = (query: string): SearchFilters => {
    const filters: SearchFilters = { text: [] };

    for (const rawToken of query.trim().split(/\s+/)) {
        if (!rawToken) continue;
        const token = rawToken.trim();
        const lower = token.toLowerCase();

        if (lower.startsWith('type:')) {
            filters.type = lower.slice(5);
            continue;
        }

        if (lower.startsWith('ext:')) {
            filters.ext = lower.slice(4).replace(/^\./, '');
            continue;
        }

        if (lower.startsWith('encrypted:') || lower.startsWith('enc:')) {
            const value = lower.includes(':') ? lower.split(':')[1] : '';
            filters.encrypted = ['1', 'true', 'yes', 'y', 'on'].includes(value);
            continue;
        }

        if (lower.startsWith('folder:')) {
            filters.folder = lower.slice(7);
            continue;
        }

        if (lower.startsWith('tag:')) {
            filters.tag = lower.slice(4).replace(/^#/, '');
            continue;
        }

        if (lower.startsWith('#') && lower.length > 1) {
            filters.tag = lower.slice(1);
            continue;
        }

        if (lower.startsWith('min:')) {
            filters.minBytes = parseByteValue(lower.slice(4)) ?? undefined;
            continue;
        }

        if (lower.startsWith('max:')) {
            filters.maxBytes = parseByteValue(lower.slice(4)) ?? undefined;
            continue;
        }

        filters.text.push(lower);
    }

    return filters;
};

const matchesType = (name: string, type?: string) => {
    if (!type || type === 'all') return true;
    if (type === 'image') return isImageFile(name);
    if (type === 'video') return isVideoFile(name);
    if (type === 'audio') return isAudioFile(name);
    if (type === 'doc') return isDocumentFile(name);
    if (type === 'media') return isMediaFile(name);
    if (type === 'other') return !isImageFile(name) && !isVideoFile(name) && !isAudioFile(name) && !isPdfFile(name);
    return true;
};

export const matchesAdvancedSearch = (
    file: TelegramFile,
    query: string,
    folderNameResolver?: (folderId: number | null) => string | undefined,
) => {
    const filters = parseAdvancedSearch(query);
    const name = file.name.toLowerCase();
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const folderName = folderNameResolver?.(typeof file.folder_id === 'number' ? file.folder_id : null)?.toLowerCase() ?? '';
    const tags = (file.tags ?? []).map((tag) => tag.toLowerCase());
    const note = file.quick_note?.toLowerCase() ?? '';
    const pdfText = file.pdf_text?.toLowerCase() ?? '';
    const textHaystack = `${name} ${tags.join(' ')} ${note} ${pdfText}`;

    if (filters.text.length > 0 && !filters.text.every((token) => textHaystack.includes(token))) {
        return false;
    }

    if (!matchesType(file.name, filters.type)) {
        return false;
    }

    if (filters.ext && filters.ext !== ext) {
        return false;
    }

    if (typeof filters.encrypted === 'boolean' && Boolean(file.is_encrypted) !== filters.encrypted) {
        return false;
    }

    if (filters.folder) {
        const isSavedMessages = filters.folder === 'saved' || filters.folder === 'saved-messages' || filters.folder === 'home';
        if (isSavedMessages && file.folder_id != null) {
            return false;
        }
        if (!isSavedMessages && !folderName.includes(filters.folder)) {
            return false;
        }
    }

    if (filters.tag) {
        const requestedTag = filters.tag;
        if (!tags.some((tag) => tag === requestedTag || tag.includes(requestedTag))) {
            return false;
        }
    }

    if (typeof filters.minBytes === 'number' && file.size < filters.minBytes) {
        return false;
    }

    if (typeof filters.maxBytes === 'number' && file.size > filters.maxBytes) {
        return false;
    }

    return true;
};

/**
 * Converts raw Rust error strings into human-readable messages.
 * Handles FLOOD_WAIT_N, "not connected", network errors, etc.
 */
export function formatError(raw: unknown): string {
    const msg = String(raw);

    // FLOOD_WAIT_60 → "Telegram rate limit — wait 60 seconds"
    const floodMatch = msg.match(/FLOOD_WAIT_(\d+)/);
    if (floodMatch) {
        const secs = parseInt(floodMatch[1], 10);
        if (secs >= 3600) return `Telegram rate limit — wait ${Math.ceil(secs / 3600)}h`;
        if (secs >= 60)   return `Telegram rate limit — wait ${Math.ceil(secs / 60)} min`;
        return `Telegram rate limit — wait ${secs}s`;
    }

    if (msg.includes('not connected') || msg.includes('client not connected'))
        return 'Not connected to Telegram. Check your internet connection.';

    if (msg.includes('timeout') || msg.includes('timed out'))
        return 'Connection timed out. Try again.';

    if (msg.includes('File too large') || msg.includes('too large'))
        return msg; // already formatted

    if (msg.includes('Bandwidth limit'))
        return 'Daily bandwidth limit reached (250 GB). Try again tomorrow.';

    if (msg.includes('Encryption key not loaded') || msg.includes('encryption password'))
        return 'Load your encryption password in Settings before downloading this file.';

    if (msg.includes('PEER_ID_INVALID') || msg.includes('not found'))
        return 'File or folder not found. It may have been deleted from Telegram.';

    if (msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('session'))
        return 'Your Telegram session expired. Please sign in again.';

    // Trim very long technical strings
    return msg.length > 120 ? msg.slice(0, 117) + '…' : msg;
}
