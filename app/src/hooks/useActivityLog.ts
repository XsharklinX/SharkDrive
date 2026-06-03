import { useCallback, useEffect, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';
import { ActivityEntry } from '../types';
import { tauriApi } from '../api/tauri';

export function useActivityLog(store: Store | null, encryptionEnabled = false) {
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const [encryptedLoaded, setEncryptedLoaded] = useState(false);

    // Load activity: encrypted (when vault open) or plaintext store
    useEffect(() => {
        if (!store) return;

        if (encryptionEnabled && !encryptedLoaded) {
            tauriApi.loadEncryptedActivity()
                .then(json => {
                    if (json) {
                        try {
                            const entries = JSON.parse(json) as ActivityEntry[];
                            setActivity(entries);
                        } catch { /* ignore parse errors */ }
                    } else {
                        // Encrypted file not found — try loading from plaintext store
                        store.get<ActivityEntry[]>('activityHistory').then(v => { if (v) setActivity(v); });
                    }
                    setEncryptedLoaded(true);
                })
                .catch(() => {
                    // Fallback to plaintext
                    store.get<ActivityEntry[]>('activityHistory').then(v => { if (v) setActivity(v); });
                    setEncryptedLoaded(true);
                });
        } else if (!encryptionEnabled) {
            store.get<ActivityEntry[]>('activityHistory').then(v => { if (v) setActivity(v); });
        }
    }, [store, encryptionEnabled]);

    const recordActivity = useCallback((entry: ActivityEntry) => {
        setActivity((prev) => {
            const next = [entry, ...prev].slice(0, 60);

            if (encryptionEnabled) {
                // Persist encrypted (best-effort, no await)
                tauriApi.saveEncryptedActivity(JSON.stringify(next)).catch(() => {
                    // Fallback to plaintext store
                    if (store) store.set('activityHistory', next).then(() => store.save());
                });
            } else {
                if (store) store.set('activityHistory', next).then(() => store.save());
            }

            return next;
        });
    }, [store, encryptionEnabled]);

    return { activity, recordActivity };
}
