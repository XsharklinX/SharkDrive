import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { TelegramFile } from '../types';
import { buildRemoteFileKey, formatBytes, matchesAdvancedSearch, resolveFileFolderId } from '../utils';
import { tauriApi } from '../api/tauri';

type FolderNameResolver = (folderId: number | null) => string | undefined;
const PDF_TEXT_INDEX_STORAGE_KEY = 'sharkdrive.pdfTextIndex.v1';
const PDF_TEXT_INDEX_EVENT = 'sharkdrive:pdf-text-index-updated';

interface UseDashboardSearchOptions {
    activeFolderId: number | null;
    sourceFiles: TelegramFile[];
    showFavoritesOnly: boolean;
    favoriteIds: Set<number>;
    searchCurrentFolderOnly: boolean;
    allowRemoteSearch?: boolean;
    folderNameResolver: FolderNameResolver;
    handleGlobalSearch: (query: string) => Promise<TelegramFile[]>;
    decorateFile?: (file: TelegramFile, fallbackFolderId: number | null) => TelegramFile;
}

function shouldUseRemoteSearch(query: string, localMatchCount: number) {
    const lower = query.toLowerCase();
    if (
        lower.includes('folder:')
        || lower.includes('tag:')
        || lower.includes('#')
        || lower.includes('encrypted:')
        || lower.includes('enc:')
        || lower.includes('type:')
        || lower.includes('ext:')
        || lower.includes('min:')
        || lower.includes('max:')
    ) {
        return true;
    }

    return localMatchCount < 40;
}

export function useDashboardSearch({
    activeFolderId,
    sourceFiles,
    showFavoritesOnly,
    favoriteIds,
    searchCurrentFolderOnly,
    allowRemoteSearch = true,
    folderNameResolver,
    handleGlobalSearch,
    decorateFile,
}: UseDashboardSearchOptions) {
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [allIndexedFiles, setAllIndexedFiles] = useState<TelegramFile[]>([]);
    const [pdfTextIndex, setPdfTextIndex] = useState<Record<string, string>>({});
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deferredSearchTerm = useDeferredValue(searchQuery);
    const searchActive = deferredSearchTerm.length > 2;

    useEffect(() => {
        const loadPdfTextIndex = () => {
            try {
                setPdfTextIndex(JSON.parse(localStorage.getItem(PDF_TEXT_INDEX_STORAGE_KEY) || '{}'));
            } catch {
                setPdfTextIndex({});
            }
        };

        loadPdfTextIndex();
        window.addEventListener(PDF_TEXT_INDEX_EVENT, loadPdfTextIndex);
        window.addEventListener('storage', loadPdfTextIndex);
        return () => {
            window.removeEventListener(PDF_TEXT_INDEX_EVENT, loadPdfTextIndex);
            window.removeEventListener('storage', loadPdfTextIndex);
        };
    }, []);

    useEffect(() => {
        if (!searchActive) return;
        let cancelled = false;
        tauriApi.getAllIndexedFiles().then((files) => {
            if (!cancelled) {
                setAllIndexedFiles(files.map((f) => {
                    const normalized = {
                        ...f,
                        sizeStr: formatBytes(f.size),
                        type: (f.icon_type === 'folder' ? 'folder' : 'file') as 'folder' | 'file',
                    };
                    return decorateFile ? decorateFile(normalized, normalized.folder_id ?? activeFolderId) : normalized;
                }));
            }
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [activeFolderId, decorateFile, searchActive]);

    const indexedFiles = useMemo(() => {
        const merged = new Map<string, TelegramFile>();

        const addFile = (file: TelegramFile) => {
            const key = buildRemoteFileKey(file, file.folder_id ?? activeFolderId);
            if (!merged.has(key)) {
                merged.set(key, { ...file, pdf_text: pdfTextIndex[key] ?? file.pdf_text });
            }
        };

        sourceFiles.forEach(addFile);
        allIndexedFiles.forEach(addFile);

        return Array.from(merged.values());
    }, [activeFolderId, allIndexedFiles, pdfTextIndex, sourceFiles]);

    useEffect(() => {
        if (deferredSearchTerm.length <= 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        const localMatches = indexedFiles.filter((file) => (
            (!searchCurrentFolderOnly || resolveFileFolderId(file, activeFolderId) === activeFolderId)
            && matchesAdvancedSearch(file, deferredSearchTerm, folderNameResolver)
        ));
        setSearchResults(localMatches);

        if (!allowRemoteSearch || !shouldUseRemoteSearch(deferredSearchTerm, localMatches.length)) {
            setIsSearching(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const remoteResults = (await handleGlobalSearch(deferredSearchTerm)).map((file) => {
                    const normalized = {
                        ...file,
                        sizeStr: formatBytes(file.size),
                        type: 'file' as const,
                    };
                    return decorateFile ? decorateFile(normalized, normalized.folder_id ?? activeFolderId) : normalized;
                });

                const merged = new Map<string, TelegramFile>();
                for (const file of localMatches) {
                    merged.set(buildRemoteFileKey(file, file.folder_id ?? activeFolderId), file);
                }

                for (const result of remoteResults) {
                    const key = buildRemoteFileKey(result, result.folder_id ?? activeFolderId);
                    if (
                        !merged.has(key)
                        && (!searchCurrentFolderOnly || resolveFileFolderId(result, activeFolderId) === activeFolderId)
                        && matchesAdvancedSearch(result, deferredSearchTerm, folderNameResolver)
                    ) {
                        merged.set(key, result);
                    }
                }

                setSearchResults(Array.from(merged.values()));
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [activeFolderId, allowRemoteSearch, decorateFile, deferredSearchTerm, folderNameResolver, handleGlobalSearch, indexedFiles, searchCurrentFolderOnly]);

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
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            startTransition(() => setSearchQuery(value));
        }, 200);
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
