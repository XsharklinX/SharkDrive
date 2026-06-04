import { useEffect, useRef } from 'react';

/**
 * Silently retries a connection function with exponential backoff.
 * Replaces the blocking confirm() dialog with a non-disruptive retry loop.
 *
 * Schedule: 3s → 6s → 12s → 24s → 48s → 60s (capped) with ±1s jitter.
 * Gives up after MAX_ATTEMPTS and calls onGiveUp for manual intervention.
 */
export function useAutoReconnect({
    isConnected,
    isConnecting,
    enabled,
    onAttempt,
    onGiveUp,
    maxAttempts = 6,
}: {
    isConnected: boolean;
    isConnecting: boolean;
    enabled: boolean;
    onAttempt: () => Promise<void>;
    onGiveUp: () => void;
    maxAttempts?: number;
}) {
    const attemptsRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isConnected) {
            attemptsRef.current = 0;
            if (timerRef.current) clearTimeout(timerRef.current);
            return;
        }

        if (!enabled || isConnecting) return;
        if (attemptsRef.current >= maxAttempts) {
            onGiveUp();
            return;
        }

        const attempt = attemptsRef.current;
        const baseDelay = Math.min(3_000 * Math.pow(2, attempt), 60_000);
        const jitter = (Math.random() - 0.5) * 2_000;
        const delay = Math.max(1_000, baseDelay + jitter);

        timerRef.current = setTimeout(async () => {
            attemptsRef.current += 1;
            try {
                await onAttempt();
            } catch {
                // next effect trigger will schedule another attempt
            }
        }, delay);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, isConnecting, enabled]);
}
