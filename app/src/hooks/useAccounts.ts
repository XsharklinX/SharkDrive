import { useState, useEffect, useCallback } from 'react';
import { AccountMeta } from '../types';
import { tauriApi } from '../api/tauri';

export function useAccounts() {
    const [accounts, setAccounts] = useState<AccountMeta[]>([]);
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const [list, activeId] = await Promise.all([
                tauriApi.listAccounts(),
                tauriApi.getActiveAccountId(),
            ]);
            setAccounts(list);
            setActiveAccountId(activeId);
        } catch {
            // Ignore — not yet connected
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    return { accounts, activeAccountId, loading, refresh };
}
