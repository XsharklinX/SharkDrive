import { useCallback, useEffect, useRef, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';
import { ActivityEntry } from '../types';
import { tauriApi } from '../api/tauri';

export function useActivityLog(store: Store | null, encryptionEnabled = false) {
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    // Track whether we've successfully loaded from the encrypted file for THIS unlock session
    const encLoadedSessionRef = useRef(false);

    // Load activity when vault unlocks (encryptionEnabled changes true) or on mount
    useEffect(() => {
        if (!store) return;

        if (encryptionEnabled) {
            // Vault is open — try encrypted file first
            if (encLoadedSessionRef.current) return; // already loaded for this session
            tauriApi.loadEncryptedActivity()
                .then(json => {
                    if (json) {
                        try {
                            const entries = JSON.parse(json) as ActivityEntry[];
                            setActivity(entries);
                            encLoadedSessionRef.current = true;
                        } catch { /* corrupted — use in-memory */ }
                    } else {
                        // No encrypted file yet — load plaintext as seed then mark ready
                        store.get<ActivityEntry[]>('activityHistory').then(v => { if (v) setActivity(v); });
                        encLoadedSessionRef.current = true;
                    }
                })
                .catch(() => {
                    store.get<ActivityEntry[]>('activityHistory').then(v => { if (v) setActivity(v); });
                    encLoadedSessionRef.current = true;
                });
        } else {
            // Vault locked or encryption disabled — use plaintext store
            encLoadedSessionRef.current = false; // reset so next unlock re-loads
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
