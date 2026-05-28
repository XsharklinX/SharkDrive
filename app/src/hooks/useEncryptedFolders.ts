import { useCallback, useEffect, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';
import { tauriApi } from '../api/tauri';

export function useEncryptedFolders(store: Store | null) {
    const [encryptedFolderIds, setEncryptedFolderIds] = useState<Set<number>>(new Set());
    const [encryptionEnabled, setEncryptionEnabled] = useState(false);

    useEffect(() => {
        if (!store) return;
        tauriApi.getEncryptionStatus().then(setEncryptionEnabled).catch(() => {});
        store.get<number[]>('encryptedFolderIds').then((v) => {
            if (v) setEncryptedFolderIds(new Set(v));
        });
    }, [store]);

    const handleToggleEncryption = useCallback((folderId: number) => {
        setEncryptedFolderIds((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) { next.delete(folderId); } else { next.add(folderId); }
            if (store) store.set('encryptedFolderIds', Array.from(next)).then(() => store.save());
            return next;
        });
    }, [store]);

    return { encryptedFolderIds, encryptionEnabled, setEncryptionEnabled, handleToggleEncryption };
}
