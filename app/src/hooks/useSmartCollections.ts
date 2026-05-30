import { useMemo } from 'react';
import type { TelegramFile } from '../types';
import { formatBytes, isDocumentFile, isImageFile, isVideoFile } from '../utils';

export type SmartCollectionKind = 'images' | 'videos' | 'documents' | 'large' | 'recent' | 'tag';
export type SmartCollectionId = 'images' | 'videos' | 'documents' | 'large' | 'recent-7d' | `tag:${string}`;

export interface SmartCollection {
    id: SmartCollectionId;
    label: string;
    count: number;
    kind: SmartCollectionKind;
}

const LARGE_FILE_BYTES = 100 * 1024 * 1024;
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isRecent = (createdAt?: string) => {
    if (!createdAt) return false;
    const timestamp = new Date(createdAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= Date.now() - RECENT_WINDOW_MS;
};

export const matchesSmartCollection = (file: TelegramFile, collectionId: SmartCollectionId) => {
    if (file.type === 'folder' || file.icon_type === 'folder') return false;
    if (collectionId === 'images') return isImageFile(file.name);
    if (collectionId === 'videos') return isVideoFile(file.name);
    if (collectionId === 'documents') return isDocumentFile(file.name);
    if (collectionId === 'large') return file.size >= LARGE_FILE_BYTES;
    if (collectionId === 'recent-7d') return isRecent(file.created_at);
    if (collectionId.startsWith('tag:')) return (file.tags ?? []).includes(collectionId.slice(4));
    return false;
};

export function useSmartCollections(
    indexedFiles: TelegramFile[],
    activeCollectionId: SmartCollectionId | null,
    decorateFile: (file: TelegramFile, fallbackFolderId: number | null) => TelegramFile,
) {
    const files = useMemo(() => indexedFiles
        .filter((file) => file.icon_type !== 'folder')
        .map((file) => decorateFile({
            ...file,
            sizeStr: file.sizeStr || formatBytes(file.size),
            type: 'file',
        }, file.folder_id ?? null)), [decorateFile, indexedFiles]);

    const collections = useMemo<SmartCollection[]>(() => {
        const base: SmartCollection[] = [
            { id: 'images', label: 'Images', kind: 'images', count: files.filter((file) => matchesSmartCollection(file, 'images')).length },
            { id: 'videos', label: 'Videos', kind: 'videos', count: files.filter((file) => matchesSmartCollection(file, 'videos')).length },
            { id: 'documents', label: 'Documents', kind: 'documents', count: files.filter((file) => matchesSmartCollection(file, 'documents')).length },
            { id: 'large', label: 'Large files', kind: 'large', count: files.filter((file) => matchesSmartCollection(file, 'large')).length },
            { id: 'recent-7d', label: 'Last 7 days', kind: 'recent', count: files.filter((file) => matchesSmartCollection(file, 'recent-7d')).length },
        ];
        const tagCounts = new Map<string, number>();
        files.forEach((file) => file.tags?.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)));
        const byTag = Array.from(tagCounts.entries())
            .sort(([left], [right]) => left.localeCompare(right))
            .map<SmartCollection>(([tag, count]) => ({ id: `tag:${tag}`, label: `Tag: ${tag}`, kind: 'tag', count }));
        return [...base, ...byTag];
    }, [files]);

    const activeFiles = useMemo(() => (
        activeCollectionId ? files.filter((file) => matchesSmartCollection(file, activeCollectionId)) : []
    ), [activeCollectionId, files]);

    return { collections, activeFiles };
}
