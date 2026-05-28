import { useCallback, useEffect, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';
import { ActivityEntry } from '../types';

export function useActivityLog(store: Store | null) {
    const [activity, setActivity] = useState<ActivityEntry[]>([]);

    useEffect(() => {
        if (!store) return;
        store.get<ActivityEntry[]>('activityHistory').then((v) => {
            if (v) setActivity(v);
        });
    }, [store]);

    const recordActivity = useCallback((entry: ActivityEntry) => {
        setActivity((prev) => {
            const next = [entry, ...prev].slice(0, 60);
            if (store) store.set('activityHistory', next).then(() => store.save());
            return next;
        });
    }, [store]);

    return { activity, recordActivity };
}
