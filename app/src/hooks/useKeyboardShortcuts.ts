import { useEffect, useCallback } from 'react';

export type ShortcutAction = 'selectAll' | 'delete' | 'rename' | 'escape' | 'search' | 'open';

export type KeyboardShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: KeyboardShortcutMap = {
    selectAll: 'Ctrl+A',
    delete: 'Delete',
    rename: 'F2',
    escape: 'Escape',
    search: 'Ctrl+F',
    open: 'Enter',
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
    selectAll: 'Select all',
    delete: 'Delete selected',
    rename: 'Rename selected',
    escape: 'Close or clear',
    search: 'Focus search',
    open: 'Open or preview',
};

interface UseKeyboardShortcutsProps {
    onSelectAll: () => void;
    onDelete: () => void;
    onEscape: () => void;
    onSearch: () => void;
    onRename?: () => void;
    onEnter?: () => void;
    shortcuts?: Partial<KeyboardShortcutMap>;
    enabled?: boolean;
}

export function normalizeShortcut(input: string) {
    return input
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const lower = part.toLowerCase();
            if (lower === 'cmd' || lower === 'meta' || lower === 'control' || lower === 'ctrl') return 'Ctrl';
            if (lower === 'alt' || lower === 'option') return 'Alt';
            if (lower === 'shift') return 'Shift';
            if (lower === 'esc') return 'Escape';
            if (lower === 'space') return 'Space';
            if (part.length === 1) return part.toUpperCase();
            return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('+');
}

export function shortcutFromEvent(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>) {
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey && e.key !== 'Shift') parts.push('Shift');

    const rawKey = e.key === ' ' ? 'Space' : e.key;
    const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
    if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key)) {
        parts.push(key);
    }

    return parts.join('+');
}

export function useKeyboardShortcuts({
    onSelectAll,
    onDelete,
    onEscape,
    onSearch,
    onRename,
    onEnter,
    shortcuts,
    enabled = true
}: UseKeyboardShortcutsProps) {

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled) return;
        const effectiveShortcuts: KeyboardShortcutMap = {
            ...DEFAULT_SHORTCUTS,
            ...shortcuts,
        };
        const combo = shortcutFromEvent(e);

        // Don't trigger shortcuts when typing in inputs
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            if (combo === normalizeShortcut(effectiveShortcuts.escape)) {
                (target as HTMLInputElement).blur();
                onEscape();
            }
            return;
        }

        if (combo === normalizeShortcut(effectiveShortcuts.selectAll)) {
            e.preventDefault();
            onSelectAll();
            return;
        }

        if (combo === normalizeShortcut(effectiveShortcuts.search)) {
            e.preventDefault();
            onSearch();
            return;
        }

        if (combo === normalizeShortcut(effectiveShortcuts.delete) || (effectiveShortcuts.delete === 'Delete' && combo === 'Backspace')) {
            e.preventDefault();
            onDelete();
            return;
        }

        if (combo === normalizeShortcut(effectiveShortcuts.rename)) {
            e.preventDefault();
            onRename?.();
            return;
        }

        if (combo === normalizeShortcut(effectiveShortcuts.escape)) {
            e.preventDefault();
            onEscape();
            return;
        }

        if (combo === normalizeShortcut(effectiveShortcuts.open)) {
            e.preventDefault();
            onEnter?.();
            return;
        }
    }, [enabled, shortcuts, onSelectAll, onDelete, onEscape, onSearch, onRename, onEnter]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
