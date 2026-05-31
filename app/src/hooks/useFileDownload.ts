import { useState, useEffect, useRef } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { open as openPath } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { ActivityEntry, DownloadItem, TelegramFile } from '../types';
import type { Store } from '@tauri-apps/plugin-store';
import { tauriApi } from '../api/tauri';
import { buildRemoteFileKey, isAudioFile, isImageFile, isPdfFile, isVideoFile, resolveFileFolderId } from '../utils';

async function showNativeNotification(title: string, body: string) {
    try {
        let granted = await isPermissionGranted();
        if (!granted) {
            const permission = await requestPermission();
            granted = permission === 'granted';
        }
        if (granted) sendNotification({ title, body });
    } catch { /* non-critical */ }
}

interface ProgressPayload {
    id: string;
    percent: number;
}

const DOWNLOAD_DESTINATIONS_KEY = 'sharkdrive.downloadDestinations.v1';
const OPEN_AFTER_DOWNLOAD_KEY = 'sharkdrive.openAfterDownload.v1';

type DownloadDestinationMap = Partial<Record<'images' | 'videos' | 'audio' | 'docs' | 'other', string>>;

const buildActivity = (type: ActivityEntry['type'], message: string, fileName?: string, folderId?: number | null): ActivityEntry => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
    fileName,
    folderId,
});

export function useFileDownload(store: Store | null, onActivity?: (entry: ActivityEntry) => void) {
    const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
    const [processing, setProcessing] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());

    const downloadCategory = (filename: string): keyof DownloadDestinationMap => {
        if (isImageFile(filename)) return 'images';
        if (isVideoFile(filename)) return 'videos';
        if (isAudioFile(filename)) return 'audio';
        if (isPdfFile(filename) || /\.(doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|json|rtf|epub)$/i.test(filename)) return 'docs';
        return 'other';
    };

    const configuredSavePath = (filename: string) => {
        try {
            const destinations = JSON.parse(localStorage.getItem(DOWNLOAD_DESTINATIONS_KEY) || '{}') as DownloadDestinationMap;
            const directory = destinations[downloadCategory(filename)];
            if (!directory) return undefined;
            return `${directory.replace(/[\\/]$/, '')}\\${filename}`;
        } catch {
            return undefined;
        }
    };

    const shouldOpenAfterDownload = () => localStorage.getItem(OPEN_AFTER_DOWNLOAD_KEY) === 'true';

    // Listen for progress events from Rust
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('download-progress', (event) => {
            setDownloadQueue(q => q.map(i =>
                i.id === event.payload.id ? { ...i, progress: event.payload.percent } : i
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Load saved queue on mount
    useEffect(() => {
        if (!store || initialized) return;
        store.get<DownloadItem[]>('downloadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setDownloadQueue(pending);
                    toast.info(`Restored ${pending.length} pending downloads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    // Save queue when it changes (only pending items)
    useEffect(() => {
        if (!store || !initialized) return;
        const pending = downloadQueue.filter(i => i.status === 'pending');
        store.set('downloadQueue', pending).then(() => store.save());
    }, [store, downloadQueue, initialized]);

    // Queue Processor
    useEffect(() => {
        if (processing) return;
        const nextItem = downloadQueue.find(i => i.status === 'pending');
        if (nextItem) {
            processItem(nextItem);
        }
    }, [downloadQueue, processing]);

    const processItem = async (item: DownloadItem) => {
        setProcessing(true);

        try {
            const savePath = item.savePath ?? configuredSavePath(item.filename) ?? await save({ defaultPath: item.filename });
            if (!savePath) {
                setDownloadQueue(q => q.filter(i => i.id !== item.id));
                setProcessing(false);
                return;
            }

            setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'downloading', progress: 0 } : i));
            await tauriApi.downloadFile(item.messageId, savePath, item.folderId, item.id);

            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                toast.success(`Downloaded: ${item.filename}`);
                if (item.openAfter ?? shouldOpenAfterDownload()) {
                    openPath(savePath).catch(() => toast.error(`Could not open: ${item.filename}`));
                }
                void showNativeNotification('Download complete', item.filename);
                onActivity?.(buildActivity('download', `Downloaded ${item.filename}`, item.filename, item.folderId));
            }
        } catch (e) {
            if (!cancelledRef.current.has(item.id)) {
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: String(e) } : i));
                toast.error(`Download failed: ${item.filename}`);
                onActivity?.(buildActivity('download', `Download failed for ${item.filename}: ${String(e)}`, item.filename, item.folderId));
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            setProcessing(false);
        }
    };

    const queueDownload = (messageId: number, filename: string, folderId: number | null, savePath?: string, openAfter?: boolean) => {
        const duplicateExists = downloadQueue.some((item) =>
            (item.status === 'pending' || item.status === 'downloading') &&
            item.messageId === messageId &&
            item.folderId === folderId,
        );
        if (duplicateExists) {
            toast.info(`Download already queued: ${filename}`);
            return;
        }
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename,
            folderId,
            savePath,
            openAfter,
            status: 'pending'
        };
        setDownloadQueue(prev => [...prev, newItem]);
    };

    const queueBulkDownload = async (files: TelegramFile[], fallbackFolderId: number | null) => {
        const dirPath = await open({
            directory: true,
            multiple: false,
            title: "Select Download Destination"
        });
        if (!dirPath) return;

        const existingKeys = new Set(
            downloadQueue
                .filter((item) => item.status === 'pending' || item.status === 'downloading')
                .map((item) => `${item.folderId ?? 'home'}:${item.messageId}`),
        );

        let queuedCount = 0;
        for (const file of files) {
            const folderId = resolveFileFolderId(file, fallbackFolderId);
            const key = buildRemoteFileKey(file, fallbackFolderId);
            if (existingKeys.has(key)) {
                continue;
            }
            existingKeys.add(key);
            const newItem: DownloadItem = {
                id: Math.random().toString(36).substr(2, 9),
                messageId: file.id,
                filename: file.name,
                folderId,
                savePath: `${dirPath}\\${file.name}`,
                openAfter: shouldOpenAfterDownload(),
                status: 'pending'
            };
            setDownloadQueue(prev => [...prev, newItem]);
            queuedCount += 1;
        }

        if (queuedCount > 0) {
            toast.info(`Queued ${queuedCount} files for download`);
        }
    };

    const clearFinished = () => {
        setDownloadQueue(q => q.filter(i => i.status !== 'success' && i.status !== 'cancelled'));
    };

    const retryDownload = (id: string) => {
        setDownloadQueue(q => q.map(i =>
            i.id === id && i.status === 'error'
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined }
                : i
        ));
    };

    const moveDownloadToFront = (id: string) => {
        setDownloadQueue((queue) => {
            const index = queue.findIndex((item) => item.id === id);
            if (index <= 0 || queue[index]?.status !== 'pending') return queue;
            const next = [...queue];
            const [item] = next.splice(index, 1);
            const firstPendingIndex = next.findIndex((candidate) => candidate.status === 'pending');
            next.splice(firstPendingIndex === -1 ? next.length : firstPendingIndex, 0, item);
            return next;
        });
    };

    const reorderDownloadQueue = (fromId: string, toId: string) => {
        setDownloadQueue((queue) => {
            const fromIndex = queue.findIndex((item) => item.id === fromId);
            const toIndex = queue.findIndex((item) => item.id === toId);
            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return queue;
            if (queue[fromIndex].status !== 'pending' || queue[toIndex].status !== 'pending') return queue;
            const next = [...queue];
            const [item] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, item);
            return next;
        });
    };

    const cancelDownloadItem = (id: string) => {
        setDownloadQueue(q => {
            const item = q.find(i => i.id === id);
            if (!item) return q;
            if (item.status === 'downloading') {
                cancelledRef.current.add(id);
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            return q.filter(i => i.id !== id);
        });
    };

    const cancelAll = () => {
        setDownloadQueue(q => {
            const downloading = q.find(i => i.status === 'downloading');
            if (downloading) cancelledRef.current.add(downloading.id);
            return q
                .filter(i => i.status !== 'pending')
                .map(i => i.status === 'downloading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All downloads cancelled');
    };

    return {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        clearFinished,
        retryDownload,
        moveDownloadToFront,
        reorderDownloadQueue,
        cancelDownloadItem,
        cancelAll
    };
}
