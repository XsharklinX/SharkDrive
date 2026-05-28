import { useCallback, useEffect, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';

export function useFavorites(store: Store | null) {
    const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    useEffect(() => {
        if (!store) return;
        store.get<number[]>('favorites').then((saved) => {
            if (saved) setFavoriteIds(new Set(saved));
        });
    }, [store]);

    const handleToggleFavorite = useCallback(async (id: number) => {
        setFavoriteIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            if (store) store.set('favorites', Array.from(next)).then(() => store.save());
            return next;
        });
    }, [store]);

    return { favoriteIds, showFavoritesOnly, setShowFavoritesOnly, handleToggleFavorite };
}
