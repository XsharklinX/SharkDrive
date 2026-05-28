import { useState, useEffect, useRef, useCallback } from 'react';

export function useAutoSync(intervalMinutes: number, onSync: () => void) {
    const [nextSyncIn, setNextSyncIn] = useState<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startedAtRef = useRef<number>(0);
    const onSyncRef = useRef(onSync);
    onSyncRef.current = onSync;

    const clearTimers = useCallback(() => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
        setNextSyncIn(null);
    }, []);

    useEffect(() => {
        clearTimers();
        if (intervalMinutes <= 0) return;

        startedAtRef.current = Date.now();
        setNextSyncIn(intervalMinutes);

        timerRef.current = setInterval(() => {
            onSyncRef.current();
            startedAtRef.current = Date.now();
            setNextSyncIn(intervalMinutes);
        }, intervalMinutes * 60 * 1000);

        countdownRef.current = setInterval(() => {
            const elapsedMs = Date.now() - startedAtRef.current;
            const remaining = Math.max(0, intervalMinutes - elapsedMs / 60000);
            setNextSyncIn(Math.ceil(remaining));
        }, 1000);

        return clearTimers;
    }, [intervalMinutes, clearTimers]);

    return { nextSyncIn };
}
