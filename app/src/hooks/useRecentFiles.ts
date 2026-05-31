import { useCallback, useEffect, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';
import { TelegramFile } from '../types';
import { buildRemoteFileKey } from '../utils';

export function useRecentFiles(store: Store | null, activeFolderId: number | null) {
    const [recentFiles, setRecentFiles] = useState<TelegramFile[]>([]);

    useEffect(() => {
        if (!store) return;
        store.get<TelegramFile[]>('recentFiles').then((v) => {
            if (v) setRecentFiles(v);
        });
    }, [store]);

    const persist = useCallback((next: TelegramFile[]) => {
        if (store) store.set('recentFiles', next).then(() => store.save());
    }, [store]);

    const addToRecent = useCallback((file: TelegramFile) => {
        setRecentFiles((prev) => {
            const key = buildRemoteFileKey(file, activeFolderId);
            const next = [file, ...prev.filter((c) => buildRemoteFileKey(c, activeFolderId) !== key)].slice(0, 20);
            persist(next);
            return next;
        });
    }, [activeFolderId, persist]);

    /** Remove a single file from the recent list after it's deleted. */
    const removeFromRecent = useCallback((fileId: number) => {
        setRecentFiles((prev) => {
            const next = prev.filter((f) => f.id !== fileId);
            if (next.length !== prev.length) persist(next);
            return next;
        });
    }, [persist]);

    /**
     * Drop any entries whose (folder_id, id) pair is not present in the
     * indexed files set. Call this after the index is loaded to evict
     * files that were deleted outside the app or in a previous session.
     * @param indexedKeys Set of "folderId:messageId" strings from the index.
     */
    const pruneStaleRecent = useCallback((indexedKeys: Set<string>) => {
        if (indexedKeys.size === 0) return; // don't prune when index is empty
        setRecentFiles((prev) => {
            const next = prev.filter((f) => {
                const key = `${f.folder_id ?? 'home'}:${f.id}`;
                return indexedKeys.has(key);
            });
            if (next.length !== prev.length) persist(next);
            return next;
        });
    }, [persist]);

    return { recentFiles, addToRecent, removeFromRecent, pruneStaleRecent };
}
