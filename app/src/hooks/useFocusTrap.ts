import { useEffect, useRef } from 'react';

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Traps keyboard focus within `containerRef` while `active` is true.
 * - Focuses the first focusable element on activation.
 * - Tab/Shift+Tab cycles within the container.
 * - Returns focus to `returnTo` (default: previously-focused element) on deactivation.
 */
export function useFocusTrap(
    containerRef: React.RefObject<HTMLElement | null>,
    active: boolean,
    returnTo?: HTMLElement | null,
) {
    const savedFocusRef = useRef<Element | null>(null);

    useEffect(() => {
        if (!active || !containerRef.current) return;

        // Remember which element had focus before opening the modal
        savedFocusRef.current = document.activeElement;

        const container = containerRef.current;
        const getFocusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));

        // Focus the first focusable element (or the container itself)
        const first = getFocusable()[0] ?? container;
        first.focus();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const focusable = getFocusable();
            if (focusable.length === 0) return;

            const firstEl = focusable[0];
            const lastEl = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === firstEl) {
                    e.preventDefault();
                    lastEl.focus();
                }
            } else {
                if (document.activeElement === lastEl) {
                    e.preventDefault();
                    firstEl.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            // Restore focus on close
            const target = returnTo ?? (savedFocusRef.current as HTMLElement | null);
            target?.focus();
        };
    }, [active, containerRef, returnTo]);
}
