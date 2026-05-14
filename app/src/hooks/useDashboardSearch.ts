import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { TelegramFile } from '../types';
import { buildRemoteFileKey, formatBytes, matchesAdvancedSearch } from '../utils';

type FolderNameResolver = (folderId: number | null) => string | undefined;

interface UseDashboardSearchOptions {
    activeFolderId: number | null;
    sourceFiles: TelegramFile[];
    localFileIndex: Record<string, TelegramFile[]>;
    showFavoritesOnly: boolean;
    favoriteIds: Set<number>;
    folderNameResolver: FolderNameResolver;
    handleGlobalSearch: (query: string) => Promise<TelegramFile[]>;
}

export function useDashboardSearch({
    activeFolderId,
    sourceFiles,
    localFileIndex,
    showFavoritesOnly,
    favoriteIds,
    folderNameResolver,
    handleGlobalSearch,
}: UseDashboardSearchOptions) {
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const deferredSearchTerm = useDeferredValue(searchQuery);

    const indexedFiles = useMemo(() => {
        const merged = new Map<string, TelegramFile>();

        const addFile = (file: TelegramFile) => {
            const key = buildRemoteFileKey(file, file.folder_id ?? activeFolderId);
            if (!merged.has(key)) {
                merged.set(key, file);
            }
        };

        sourceFiles.forEach(addFile);
        Object.values(localFileIndex).flat().forEach(addFile);

        return Array.from(merged.values());
    }, [activeFolderId, localFileIndex, sourceFiles]);

    useEffect(() => {
        if (deferredSearchTerm.length <= 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        const localMatches = indexedFiles.filter((file) => matchesAdvancedSearch(file, deferredSearchTerm, folderNameResolver));
        setSearchResults(localMatches);

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const remoteResults = (await handleGlobalSearch(deferredSearchTerm)).map((file) => ({
                    ...file,
                    sizeStr: formatBytes(file.size),
                    type: 'file' as const,
                }));

                const merged = new Map<string, TelegramFile>();
                for (const file of localMatches) {
                    merged.set(buildRemoteFileKey(file, file.folder_id ?? activeFolderId), file);
                }

                for (const result of remoteResults) {
                    const key = buildRemoteFileKey(result, result.folder_id ?? activeFolderId);
                    if (!merged.has(key) && matchesAdvancedSearch(result, deferredSearchTerm, folderNameResolver)) {
                        merged.set(key, result);
                    }
                }

                setSearchResults(Array.from(merged.values()));
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [activeFolderId, deferredSearchTerm, folderNameResolver, handleGlobalSearch, indexedFiles]);

    const baseFiles = useMemo(() => (
        deferredSearchTerm.length > 2
            ? searchResults
            : sourceFiles.filter((file) => matchesAdvancedSearch(file, deferredSearchTerm, folderNameResolver))
    ), [deferredSearchTerm, folderNameResolver, searchResults, sourceFiles]);

    const displayedFiles = useMemo(() => (
        showFavoritesOnly
            ? baseFiles.filter((file) => favoriteIds.has(file.id))
            : baseFiles
    ), [baseFiles, favoriteIds, showFavoritesOnly]);

    const setSearchTerm = useCallback((value: string) => {
        setSearchInput(value);
        startTransition(() => {
            setSearchQuery(value);
        });
    }, []);

    const resetSearch = useCallback(() => {
        setSearchInput('');
        setSearchQuery('');
        setSearchResults([]);
        setIsSearching(false);
    }, []);

    return {
        searchTerm: searchInput,
        setSearchTerm,
        displayedFiles,
        isSearching,
        resetSearch,
    };
}
