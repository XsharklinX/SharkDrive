import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Store } from '@tauri-apps/plugin-store';
import type { TelegramFile } from '../types';
import { buildRemoteFileKey } from '../utils';
import { DEFAULT_SHORTCUTS, type KeyboardShortcutMap } from './useKeyboardShortcuts';

export const FOLDER_COLOR_PALETTE = [
    '#4fd1c5',
    '#60a5fa',
    '#a78bfa',
    '#f472b6',
    '#fb7185',
    '#f59e0b',
    '#facc15',
    '#34d399',
    '#22d3ee',
    '#cbd5e1',
] as const;

type FileOrganization = {
    tags?: string[];
    note?: string;
};

type OrganizationConfig = {
    files: Record<string, FileOrganization>;
    folderColors: Record<string, string>;
    pinnedFolderIds: number[];
    shortcuts: Partial<KeyboardShortcutMap>;
};

const STORE_KEY = 'organizationConfig';

const emptyConfig: OrganizationConfig = {
    files: {},
    folderColors: {},
    pinnedFolderIds: [],
    shortcuts: DEFAULT_SHORTCUTS,
};

const normalizeTag = (tag: string) => tag.trim().replace(/\s+/g, '-').toLowerCase().slice(0, 32);

const normalizeTags = (tags: string[]) => Array.from(new Set(
    tags.map(normalizeTag).filter(Boolean)
)).slice(0, 12);

export function useOrganization(store: Store | null) {
    const [config, setConfig] = useState<OrganizationConfig>(emptyConfig);

    useEffect(() => {
        if (!store) return;
        let cancelled = false;
        store.get<Partial<OrganizationConfig>>(STORE_KEY).then((saved) => {
            if (cancelled || !saved) return;
            setConfig({
                files: saved.files ?? {},
                folderColors: saved.folderColors ?? {},
                pinnedFolderIds: saved.pinnedFolderIds ?? [],
                shortcuts: { ...DEFAULT_SHORTCUTS, ...(saved.shortcuts ?? {}) },
            });
        });
        return () => { cancelled = true; };
    }, [store]);

    const persist = useCallback((next: OrganizationConfig) => {
        if (!store) return;
        void store.set(STORE_KEY, next).then(() => store.save());
    }, [store]);

    const updateConfig = useCallback((updater: (current: OrganizationConfig) => OrganizationConfig) => {
        setConfig((current) => {
            const next = updater(current);
            persist(next);
            return next;
        });
    }, [persist]);

    const getFileKey = useCallback((file: TelegramFile, fallbackFolderId: number | null) => (
        buildRemoteFileKey(file, fallbackFolderId)
    ), []);

    const getFileTags = useCallback((file: TelegramFile, fallbackFolderId: number | null) => {
        const key = getFileKey(file, fallbackFolderId);
        return config.files[key]?.tags ?? [];
    }, [config.files, getFileKey]);

    const setFileTags = useCallback((file: TelegramFile, fallbackFolderId: number | null, tags: string[]) => {
        const key = getFileKey(file, fallbackFolderId);
        updateConfig((current) => ({
            ...current,
            files: {
                ...current.files,
                [key]: {
                    ...current.files[key],
                    tags: normalizeTags(tags),
                },
            },
        }));
    }, [getFileKey, updateConfig]);

    const getFileNote = useCallback((file: TelegramFile, fallbackFolderId: number | null) => {
        const key = getFileKey(file, fallbackFolderId);
        return config.files[key]?.note ?? '';
    }, [config.files, getFileKey]);

    const setFileNote = useCallback((file: TelegramFile, fallbackFolderId: number | null, note: string) => {
        const key = getFileKey(file, fallbackFolderId);
        updateConfig((current) => ({
            ...current,
            files: {
                ...current.files,
                [key]: {
                    ...current.files[key],
                    note: note.slice(0, 500),
                },
            },
        }));
    }, [getFileKey, updateConfig]);

    const decorateFile = useCallback((file: TelegramFile, fallbackFolderId: number | null): TelegramFile => {
        if (file.type === 'folder') return file;
        const key = getFileKey(file, fallbackFolderId);
        const data = config.files[key];
        if (!data) return file;
        return {
            ...file,
            tags: data.tags ?? [],
            quick_note: data.note ?? '',
        };
    }, [config.files, getFileKey]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        Object.values(config.files).forEach((entry) => {
            entry.tags?.forEach((tag) => tags.add(tag));
        });
        return Array.from(tags).sort((a, b) => a.localeCompare(b));
    }, [config.files]);

    const shortcuts = useMemo(() => ({ ...DEFAULT_SHORTCUTS, ...config.shortcuts }), [config.shortcuts]);

    const getFolderColor = useCallback((folderId: number) => config.folderColors[String(folderId)], [config.folderColors]);

    const setFolderColor = useCallback((folderId: number, color: string | null) => {
        updateConfig((current) => {
            const folderColors = { ...current.folderColors };
            if (color) folderColors[String(folderId)] = color;
            else delete folderColors[String(folderId)];
            return { ...current, folderColors };
        });
    }, [updateConfig]);

    const togglePinnedFolder = useCallback((folderId: number) => {
        updateConfig((current) => {
            const isPinned = current.pinnedFolderIds.includes(folderId);
            return {
                ...current,
                pinnedFolderIds: isPinned
                    ? current.pinnedFolderIds.filter((id) => id !== folderId)
                    : [...current.pinnedFolderIds, folderId],
            };
        });
    }, [updateConfig]);

    const setShortcuts = useCallback((shortcuts: Partial<KeyboardShortcutMap>) => {
        updateConfig((current) => ({
            ...current,
            shortcuts: { ...DEFAULT_SHORTCUTS, ...shortcuts },
        }));
    }, [updateConfig]);

    return {
        allTags,
        decorateFile,
        folderColors: config.folderColors,
        getFileNote,
        getFileTags,
        getFolderColor,
        pinnedFolderIds: config.pinnedFolderIds,
        setFileNote,
        setFileTags,
        setFolderColor,
        setShortcuts,
        shortcuts,
        togglePinnedFolder,
    };
}
