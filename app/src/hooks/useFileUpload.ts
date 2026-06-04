import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { tauriApi } from '../api/tauri';
import { open } from '@tauri-apps/plugin-dialog';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { ActivityEntry, QueueItem } from '../types';
import { useFileDrop } from './useFileDrop';

async function showNativeNotification(title: string, body: string) {
    try {
        let granted = await isPermissionGranted();
        if (!granted) {
            const permission = await requestPermission();
            granted = permission === 'granted';
        }
        if (granted) sendNotification({ title, body });
    } catch {
        // Fallback silently — notification is non-critical
    }
}
import type { Store } from '@tauri-apps/plugin-store';
import { applyUploadNamingPattern, buildQueuedUploadKey, formatError, UPLOAD_NAMING_PATTERN_KEY, CLASSIFICATION_RULES_KEY, matchesClassificationRule } from '../utils';
import { ClassificationRule } from '../types';

const WEBHOOK_URL_KEY = 'sharkdrive.webhookUrl.v1';
const WEBHOOK_ENABLED_KEY = 'sharkdrive.webhookEnabled.v1';

function fireWebhook(item: { path: string; remoteName?: string; folderId: number | null; size?: number }) {
    const url = localStorage.getItem(WEBHOOK_URL_KEY) || '';
    const enabled = localStorage.getItem(WEBHOOK_ENABLED_KEY) === 'true';
    if (!enabled || !url) return;
    const filename = item.remoteName || item.path.split(/[/\\]/).pop() || 'unknown';
    const payload = JSON.stringify({
        event: 'upload_complete',
        filename,
        folder_id: item.folderId,
        size: item.size ?? 0,
        timestamp: new Date().toISOString(),
    });
    tauriApi.callWebhook(url, payload).catch(() => {});
}

interface ProgressPayload {
    id: string;
    percent: number;
}

type QueueUploadCandidate = {
    path: string;
    folderId?: number | null;
    encrypt?: boolean;
    remoteName?: string;
    source?: 'manual' | 'backup';
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
    folderNameResolver?: (folderId: number | null) => string | undefined,
    isConnected = true,
) {
    const queryClient = useQueryClient();
    const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());
    // Tracks active concurrent uploads (ref = no re-render on change)
    const activeUploadsRef = useRef(0);
    // Items we've called processItem for but whose state hasn't flipped to 'uploading' yet
    const startingRef = useRef<Set<string>>(new Set());
    // Concurrency: 1 for small batches, up to 4 for large batches
    const getTargetConcurrency = (pendingCount: number) => pendingCount >= 4 ? 4 : 1;

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
                const resumable = saved
                    .filter(i => i.status === 'pending' || i.status === 'uploading')
                    .map((item) => ({
                        ...item,
                        status: 'pending' as const,
                        progress: item.status === 'uploading' ? item.progress : undefined,
                        error: undefined,
                    }));
                if (resumable.length > 0) {
                    setUploadQueue(resumable);
                    toast.info(`Restored ${resumable.length} pending upload${resumable.length > 1 ? 's' : ''}`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    useEffect(() => {
        if (!store || !initialized) return;
        const resumable = uploadQueue.filter(i => i.status === 'pending' || i.status === 'uploading');
        store.set('uploadQueue', resumable).then(() => store.save());
    }, [store, uploadQueue, initialized]);

    // Start as many concurrent uploads as the current batch size allows
    useEffect(() => {
        if (!isConnected) return;
        // Exclude items that are already in-flight (state hasn't flipped yet)
        const pending = uploadQueue.filter(i => i.status === 'pending' && !startingRef.current.has(i.id));
        if (pending.length === 0) return;
        const target = getTargetConcurrency(pending.length + activeUploadsRef.current);
        const slots = target - activeUploadsRef.current;
        if (slots <= 0) return;
        pending.slice(0, slots).forEach(item => {
            startingRef.current.add(item.id);
            processItem(item);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uploadQueue, isConnected]);

    const MAX_RETRIES = 2;
    const isNetworkError = (err: string) => {
        const keywords = ['timeout', 'connection', 'network', 'socket', 'disconnected', 'eof', 'refused'];
        return keywords.some(k => err.toLowerCase().includes(k));
    };

    const processItem = async (item: QueueItem) => {
        activeUploadsRef.current += 1;
        startingRef.current.delete(item.id); // ensure removed from guard even if state already updated

        let fileSize: number | undefined;
        try {
            const size = await invoke<number>('cmd_get_file_size', { path: item.path });
            const MAX_SIZE = 2 * 1024 * 1024 * 1024;
            if (size > MAX_SIZE) {
                const mb = Math.round(size / 1024 / 1024);
                setUploadQueue(q => q.map(i => i.id === item.id ? {
                    ...i, status: 'error', error: `File too large (${mb} MB). Maximum is 2 GB.`
                } : i));
                toast.error(`Too large to upload: ${item.path.split(/[/\\]/).pop()}`);
                activeUploadsRef.current -= 1;
                return;
            }
            fileSize = size;
        } catch {
            // stat failed — proceed without size, let backend handle it
        }

        startingRef.current.delete(item.id); // now officially 'uploading' — remove from guard
        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0, size: fileSize, startedAt: Date.now() } : i));

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
                    skipDedup: item.skipDedup ?? false,
                    remoteName: item.remoteName,
                    backupUpload: item.source === 'backup',
                });
                if (!cancelledRef.current.has(item.id)) {
                    const fileName = item.remoteName || item.path.split(/[/\\]/).pop();
                    if (result === 'duplicate') {
                        if (item.source === 'backup') {
                            setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'skipped', progress: 100 } : i));
                            onActivity?.(buildActivity('backup', `Skipped unchanged backup ${fileName}`, fileName, item.folderId));
                        } else {
                            setUploadQueue(q => q.map(i => i.id === item.id ? {
                                ...i, status: 'duplicate', progress: 0,
                                error: 'File already exists in this folder',
                            } : i));
                        }
                    } else if (result === 'conflict') {
                        setUploadQueue(q => q.map(i => i.id === item.id ? {
                            ...i, status: 'conflict', progress: 0,
                            error: 'Local and Telegram versions both changed',
                        } : i));
                    } else {
                        setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                        queryClient.invalidateQueries({ queryKey: ['files', item.folderId] });
                        void showNativeNotification('Upload complete', fileName ?? '');
                        onActivity?.(buildActivity('upload', `Uploaded ${fileName}`, fileName, item.folderId));
                        fireWebhook({ path: item.path, remoteName: item.remoteName, folderId: item.folderId, size: item.size });
                    }
                } else {
                    cancelledRef.current.delete(item.id);
                }
                activeUploadsRef.current -= 1;
                return;
            } catch (e) {
                lastError = formatError(e);
                if (!isNetworkError(String(e)) || attempt === MAX_RETRIES) break;
                // Network error → will retry after delay
            }
        }

        if (!cancelledRef.current.has(item.id)) {
            setUploadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: lastError } : i));
            toast.error(`${item.path.split(/[/\\]/).pop()}: ${lastError}`);
            onActivity?.(buildActivity('upload', `Upload failed for ${item.path.split(/[/\\]/).pop()}: ${lastError}`, item.path.split(/[/\\]/).pop(), item.folderId));
        } else {
            cancelledRef.current.delete(item.id);
        }
        activeUploadsRef.current -= 1;
    };

    const queueUploadCandidates = useCallback((candidates: QueueUploadCandidate[]) => {
        const existingKeys = new Set(
            uploadQueue
                .filter((item) => item.status === 'pending' || item.status === 'uploading')
                .map((item) => buildQueuedUploadKey(item.path, item.folderId)),
        );

        const queued: QueueItem[] = [];
        const skippedNames: string[] = [];
        const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Load classification rules once per batch
        let classificationRules: ClassificationRule[] = [];
        try {
            const raw = localStorage.getItem(CLASSIFICATION_RULES_KEY);
            if (raw) classificationRules = JSON.parse(raw) as ClassificationRule[];
        } catch { /* ignore */ }

        for (const [candidateIndex, candidate] of candidates.entries()) {
            // Resolve folder: explicit > auto-classification rule > active folder
            let folderId = candidate.folderId ?? activeFolderId;
            if (candidate.folderId === undefined && classificationRules.length > 0) {
                const rule = classificationRules.find(r =>
                    r.enabled && matchesClassificationRule(candidate.path, r.fileTypes)
                );
                if (rule) folderId = rule.folderId;
            }
            const key = buildQueuedUploadKey(candidate.path, folderId);
            if (existingKeys.has(key)) {
                skippedNames.push(candidate.path.split(/[/\\]/).pop() || candidate.path);
                continue;
            }

            existingKeys.add(key);
            const namingPattern = localStorage.getItem(UPLOAD_NAMING_PATTERN_KEY)?.trim() ?? '';
            const remoteName = candidate.remoteName || (namingPattern
                ? applyUploadNamingPattern(
                    candidate.path,
                    namingPattern,
                    folderNameResolver?.(folderId) || 'Saved Messages',
                    candidateIndex + 1,
                )
                : undefined);
            queued.push({
                id: Math.random().toString(36).slice(2, 11),
                path: candidate.path,
                batchId,
                remoteName,
                folderId,
                status: 'pending',
                encrypt: candidate.encrypt ?? encryptByDefault,
                source: candidate.source ?? 'manual',
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
    }, [activeFolderId, encryptByDefault, folderNameResolver, onActivity, uploadQueue]);

    /** Open file dialog and return selected paths without queuing — caller decides what to do. */
    const selectFilesOnly = async (): Promise<string[]> => {
        try {
            const selected = await open({ multiple: true, directory: false });
            if (!selected) return [];
            return Array.isArray(selected) ? selected : [selected];
        } catch {
            toast.error("Failed to open file dialog");
            return [];
        }
    };

    const handleManualUpload = async (encryptOverride?: boolean) => {
        const paths = await selectFilesOnly();
        if (paths.length === 0) return;
        const result = queueUploadCandidates(paths.map((path: string) => ({ path, encrypt: encryptOverride })));
        if (result.queuedCount > 0) {
            toast.info(`Queued ${result.queuedCount} file${result.queuedCount > 1 ? 's' : ''} for upload`);
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

    const cancelItem = useCallback((id: string) => {
        setUploadQueue(q => {
            const item = q.find(i => i.id === id);
            if (!item) return q;
            if (item.status === 'uploading') {
                cancelledRef.current.add(id);
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            return q.filter(i => i.id !== id);
        });
    }, []);

    const clearFinished = useCallback(() => {
        setUploadQueue(q => q.filter(i => i.status !== 'success' && i.status !== 'cancelled' && i.status !== 'skipped'));
    }, []);

    // Force-upload a 'duplicate' item by setting skipDedup and re-queueing it as pending
    const forceUpload = useCallback((id: string) => {
        setUploadQueue(q => q.map(i =>
            i.id === id ? { ...i, status: 'pending' as const, skipDedup: true, error: undefined, progress: undefined } : i
        ));
    }, []);

    // Skip a 'duplicate' item — mark as skipped without uploading
    const skipDuplicate = useCallback((id: string) => {
        setUploadQueue(q => q.map(i =>
            i.id === id ? { ...i, status: 'skipped' as const, progress: 100 } : i
        ));
    }, []);

    // Items waiting for the user's dedup decision
    const duplicateItems = uploadQueue.filter(i => i.status === 'duplicate');
    const conflictItems = uploadQueue.filter(i => i.status === 'conflict');

    const { isDragging } = useFileDrop();

    return {
        uploadQueue,
        setUploadQueue,
        selectFilesOnly,
        handleManualUpload,
        handleFolderUpload,
        handleDroppedFiles,
        queueUploadCandidates,
        cancelAll,
        cancelItem,
        retryItem,
        clearFinished,
        forceUpload,
        skipDuplicate,
        duplicateItems,
        conflictItems,
        isDragging
    };
}
