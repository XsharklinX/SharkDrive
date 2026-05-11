import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ActivityEntry, QueueItem } from '../types';
import { useFileDrop } from './useFileDrop';
import type { Store } from '@tauri-apps/plugin-store';
import { buildQueuedUploadKey } from '../utils';

interface ProgressPayload {
    id: string;
    percent: number;
}

type QueueUploadCandidate = {
    path: string;
    folderId?: number | null;
    encrypt?: boolean;
};

const buildActivity = (type: ActivityEntry['type'], message: string, fileName?: string, folderId?: number | null): ActivityEntry => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    timestamp: new Date().toISOString(),
    fileName,
    folderId,
});

export function useFileUpload(
    activeFolderId: number | null,
    store: Store | null,
    encryptByDefault = false,
    onActivity?: (entry: ActivityEntry) => void,
) {
    const queryClient = useQueryClient();
    const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
    const [processing, setProcessing] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());

    // Listen for progress events from Rust
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('upload-progress', (event) => {
            setUploadQueue(q => q.map(i =>
                i.id === event.payload.id ? { ...i, progress: event.payload.percent } : i
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    useEffect(() => {
        if (!store || initialized) return;
        store.get<QueueItem[]>('uploadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setUploadQueue(pending);
                    toast.info(`Restored ${pending.length} pending uploads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    useEffect(() => {
        if (!store || !initialized) return;
        const pending = uploadQueue.filter(i => i.status === 'pending');
        store.set('uploadQueue', pending).then(() => store.save());
    }, [store, uploadQueue, initialized]);

    useEffect(() => {
        if (processing) return;
        const nextItem = uploadQueue.find(i => i.status === 'pending');
        if (nextItem) {
            processItem(nextItem);
        }
    }, [uploadQueue, processing]);

    const MAX_RETRIES = 2;
    const isNetworkError = (err: string) => {
        const keywords = ['timeout', 'connection', 'network', 'socket', 'disconnected', 'eof', 'refused'];
        return keywords.some(k => err.toLowerCase().includes(k));
    };

    const processItem = async (item: QueueItem) => {
        setProcessing(true);
        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i));

        let lastError = '';
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (cancelledRef.current.has(item.id)) break;

            if (attempt > 0) {
                const delay = 3000 * attempt;
                setUploadQueue(q => q.map(i => i.id === item.id
                    ? { ...i, status: 'pending' as const, error: `Retrying (${attempt}/${MAX_RETRIES})…`, progress: undefined }
                    : i));
                await new Promise(r => setTimeout(r, delay));
                if (cancelledRef.current.has(item.id)) break;
                setUploadQueue(q => q.map(i => i.id === item.id
                    ? { ...i, status: 'uploading', error: undefined, progress: 0 }
                    : i));
            }

            try {
                const result = await invoke<string>('cmd_upload_file', {
                    path: item.path,
                    folderId: item.folderId,
                    transferId: item.id,
                    encrypt: item.encrypt ?? false,
                });
                if (!cancelledRef.current.has(item.id)) {
                    const fileName = item.path.split(/[/\\]/).pop();
                    if (result === 'duplicate') {
                        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'skipped', progress: 100, error: 'Duplicate already exists in destination folder' } : i));
                        toast.info(`Skipped duplicate: ${fileName}`);
                        onActivity?.(buildActivity('upload', `Skipped duplicate upload for ${fileName}`, fileName, item.folderId));
                    } else {
                        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                        queryClient.invalidateQueries({ queryKey: ['files', item.folderId] });
                        if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification('Upload complete', {
                                body: fileName,
                                silent: true,
                            });
                        }
                        onActivity?.(buildActivity('upload', `Uploaded ${fileName}`, fileName, item.folderId));
                    }
                } else {
                    cancelledRef.current.delete(item.id);
                }
                setProcessing(false);
                return;
            } catch (e) {
                lastError = String(e);
                if (!isNetworkError(lastError) || attempt === MAX_RETRIES) break;
                // Network error → will retry after delay
            }
        }

        if (!cancelledRef.current.has(item.id)) {
            setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: lastError } : i));
            toast.error(`Upload failed: ${item.path.split(/[/\\]/).pop()}`);
            onActivity?.(buildActivity('upload', `Upload failed for ${item.path.split(/[/\\]/).pop()}: ${lastError}`, item.path.split(/[/\\]/).pop(), item.folderId));
        } else {
            cancelledRef.current.delete(item.id);
        }
        setProcessing(false);
    };

    const queueUploadCandidates = useCallback((candidates: QueueUploadCandidate[]) => {
        const existingKeys = new Set(
            uploadQueue
                .filter((item) => item.status === 'pending' || item.status === 'uploading')
                .map((item) => buildQueuedUploadKey(item.path, item.folderId)),
        );

        const queued: QueueItem[] = [];
        const skippedNames: string[] = [];

        for (const candidate of candidates) {
            const folderId = candidate.folderId ?? activeFolderId;
            const key = buildQueuedUploadKey(candidate.path, folderId);
            if (existingKeys.has(key)) {
                skippedNames.push(candidate.path.split(/[/\\]/).pop() || candidate.path);
                continue;
            }

            existingKeys.add(key);
            queued.push({
                id: Math.random().toString(36).slice(2, 11),
                path: candidate.path,
                folderId,
                status: 'pending',
                encrypt: candidate.encrypt ?? encryptByDefault,
            });
        }

        if (queued.length > 0) {
            setUploadQueue((prev) => [...prev, ...queued]);
        }

        if (skippedNames.length > 0) {
            toast.info(`Skipped ${skippedNames.length} duplicate upload${skippedNames.length > 1 ? 's' : ''}`);
            for (const name of skippedNames.slice(0, 5)) {
                onActivity?.(buildActivity('backup', `Skipped queued duplicate for ${name}`, name));
            }
        }

        return { queuedCount: queued.length, skippedCount: skippedNames.length };
    }, [activeFolderId, encryptByDefault, onActivity, uploadQueue]);

    const handleManualUpload = async () => {
        try {
            const selected = await open({ multiple: true, directory: false });
            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                const result = queueUploadCandidates(paths.map((path: string) => ({ path })));
                if (result.queuedCount > 0) {
                    toast.info(`Queued ${result.queuedCount} file${result.queuedCount > 1 ? 's' : ''} for upload`);
                }
            }
        } catch {
            toast.error("Failed to open file dialog");
        }
    };

    const cancelAll = () => {
        setUploadQueue(q => {
            const uploading = q.find(i => i.status === 'uploading');
            if (uploading) cancelledRef.current.add(uploading.id);
            return q
                .filter(i => i.status !== 'pending')
                .map(i => i.status === 'uploading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All uploads cancelled');
    };

    const handleDroppedFiles = (paths: string[]) => {
        const result = queueUploadCandidates(paths.map((path: string) => ({ path })));
        if (result.queuedCount > 0) {
            toast.info(`Queued ${result.queuedCount} file(s) for upload`);
        }
    };

    const handleFolderUpload = async () => {
        try {
            const selected = await open({ multiple: false, directory: true });
            if (selected) {
                const paths = await invoke<string[]>('cmd_list_dir_files', { path: selected as string });
                if (paths.length === 0) {
                    toast.info('No files found in selected folder');
                    return;
                }
                const result = queueUploadCandidates(paths.map((path: string) => ({ path })));
                if (result.queuedCount > 0) {
                    toast.info(`Queued ${result.queuedCount} file(s) from folder for upload`);
                }
            }
        } catch {
            toast.error("Failed to open folder dialog");
        }
    };

    const retryItem = useCallback((id: string) => {
        setUploadQueue(q => q.map(i =>
            i.id === id ? { ...i, status: 'pending' as const, error: undefined, progress: undefined } : i
        ));
    }, []);

    const clearFinished = useCallback(() => {
        setUploadQueue(q => q.filter(i => i.status !== 'success' && i.status !== 'cancelled' && i.status !== 'skipped'));
    }, []);

    const { isDragging } = useFileDrop();

    return {
        uploadQueue,
        setUploadQueue,
        handleManualUpload,
        handleFolderUpload,
        handleDroppedFiles,
        queueUploadCandidates,
        cancelAll,
        retryItem,
        clearFinished,
        isDragging
    };
}
