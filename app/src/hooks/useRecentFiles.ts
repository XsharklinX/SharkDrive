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

    const addToRecent = useCallback((file: TelegramFile) => {
        setRecentFiles((prev) => {
            const key = buildRemoteFileKey(file, activeFolderId);
            const next = [file, ...prev.filter((c) => buildRemoteFileKey(c, activeFolderId) !== key)].slice(0, 20);
            if (store) store.set('recentFiles', next).then(() => store.save());
            return next;
        });
    }, [activeFolderId, store]);

    return { recentFiles, addToRecent };
}
