import { useCallback, useEffect, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';

export function useRecentSearches(store: Store | null) {
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    useEffect(() => {
        if (!store) return;
        store.get<string[]>('recentSearches').then((v) => {
            if (v) setRecentSearches(v);
        });
    }, [store]);

    const commitSearchTerm = useCallback((term: string) => {
        const normalized = term.trim();
        if (normalized.length < 2) return;
        setRecentSearches((prev) => {
            const next = [normalized, ...prev.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
            if (store) store.set('recentSearches', next).then(() => store.save());
            return next;
        });
    }, [store]);

    return { recentSearches, commitSearchTerm };
}
