import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';

import { ActivityEntry, TelegramFile } from '../types';
import { buildRemoteFileKey, formatBytes, isMediaFile, isPdfFile, matchesAdvancedSearch, resolveFileFolderId } from '../utils';
import { tauriApi } from '../api/tauri';

// Components
import { Sidebar, RECENT_FOLDER_ID } from './dashboard/Sidebar';
import { TopBar } from './dashboard/TopBar';
import { RenameModal } from './dashboard/RenameModal';
import { SettingsModal } from './dashboard/SettingsModal';
import { ShareModal } from './dashboard/ShareModal';
import { useAutoSync } from '../hooks/useAutoSync';
import { FileExplorer } from './dashboard/FileExplorer';
import { UploadQueue } from './dashboard/UploadQueue';
import { DownloadQueue } from './dashboard/DownloadQueue';
import { MoveToFolderModal } from './dashboard/MoveToFolderModal';
import { PreviewModal } from './dashboard/PreviewModal';
import { MediaPlayer } from './dashboard/MediaPlayer';
import { DragDropOverlay } from './dashboard/DragDropOverlay';
import { ExternalDropBlocker } from './dashboard/ExternalDropBlocker';
import { PdfViewer } from './dashboard/PdfViewer';

// Hooks
import { useTelegramConnection } from '../hooks/useTelegramConnection';
import { useFileOperations } from '../hooks/useFileOperations';
import { useFileUpload } from '../hooks/useFileUpload';
import { useFileDownload } from '../hooks/useFileDownload';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
    const queryClient = useQueryClient();


    const {
        store, folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
        handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete, handleRenameFolder
    } = useTelegramConnection(onLogout);


    const [previewFile, setPreviewFile] = useState<TelegramFile | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'gallery'>('grid');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [internalDragFileId, _setInternalDragFileId] = useState<number | null>(null);
    const internalDragRef = useRef<number | null>(null);
    const lastClickedIdRef = useRef<number | null>(null);
    const handleDroppedFilesRef = useRef<(paths: string[]) => void>(() => {});
    const queueUploadCandidatesRef = useRef<(candidates: { path: string; folderId?: number | null; encrypt?: boolean }[]) => { queuedCount: number; skippedCount: number }>(() => ({ queuedCount: 0, skippedCount: 0 }));

    // Favorites
    const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    // Trash
    const [trashFolderId, setTrashFolderId] = useState<number | null>(null);
    const [trashedFolders, setTrashedFolders] = useState<{ id: number; name: string }[]>([]);

    // Rename
    const [renameTarget, setRenameTarget] = useState<TelegramFile | null>(null);

    // Settings
    const [showSettings, setShowSettings] = useState(false);
    const [shareTarget, setShareTarget] = useState<TelegramFile | null>(null);
    const [autoSyncInterval, setAutoSyncInterval] = useState(0);
    const [encryptionEnabled, setEncryptionEnabled] = useState(false);

    // Encrypted folders (per-folder auto-encrypt flag)
    const [encryptedFolderIds, setEncryptedFolderIds] = useState<Set<number>>(new Set());

    // Recent files
    const [recentFiles, setRecentFiles] = useState<TelegramFile[]>([]);
    const [activity, setActivity] = useState<ActivityEntry[]>([]);
    const [localFileIndex, setLocalFileIndex] = useState<Record<string, TelegramFile[]>>({});

    const setInternalDragFileId = (id: number | null) => {
        internalDragRef.current = id;
        _setInternalDragFileId(id);
    };
    const [playingFile, setPlayingFile] = useState<TelegramFile | null>(null);
    const [pdfFile, setPdfFile] = useState<TelegramFile | null>(null);
    const [previewContextFiles, setPreviewContextFiles] = useState<TelegramFile[]>([]);
    const [previewContextIndex, setPreviewContextIndex] = useState(-1);

    useEffect(() => {
        if (store) {
            store.get<'grid' | 'list' | 'gallery'>('viewMode').then((saved) => {
                if (saved) setViewMode(saved);
            });
        }
    }, [store]);

    useEffect(() => {
        if (store) {
            store.set('viewMode', viewMode).then(() => store.save());
        }
    }, [store, viewMode]);

    // Load/save favorites
    useEffect(() => {
        if (!store) return;
        store.get<number[]>('favorites').then((saved) => {
            if (saved) setFavoriteIds(new Set(saved));
        });
    }, [store]);

    // Init trash folder (create if not exists)
    useEffect(() => {
        tauriApi.getOrCreateTrash().then(id => setTrashFolderId(id)).catch(() => {});
    }, []);

    // Load trashed folders when viewing trash
    useEffect(() => {
        if (trashFolderId !== null && activeFolderId === trashFolderId) {
            tauriApi.getTrashedFolders()
                .then(setTrashedFolders).catch(() => {});
        }
    }, [activeFolderId, trashFolderId]);

    // Load settings from store
    useEffect(() => {
        if (!store) return;
        store.get<number>('autoSyncInterval').then(v => { if (v != null) setAutoSyncInterval(v); });
        store.get<boolean>('encryptionEnabled').then(v => { if (v != null) setEncryptionEnabled(v); });
        tauriApi.getEncryptionStatus().then(setEncryptionEnabled).catch(() => {});
        store.get<number[]>('encryptedFolderIds').then(v => { if (v) setEncryptedFolderIds(new Set(v)); });
        store.get<TelegramFile[]>('recentFiles').then(v => { if (v) setRecentFiles(v); });
        store.get<ActivityEntry[]>('activityHistory').then(v => { if (v) setActivity(v); });
        store.get<Record<string, TelegramFile[]>>('fileIndexByFolder').then(v => { if (v) setLocalFileIndex(v); });
    }, [store]);

    // Request desktop notification permission once
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Persist autoSyncInterval changes
    useEffect(() => {
        if (store) store.set('autoSyncInterval', autoSyncInterval).then(() => store.save());
    }, [store, autoSyncInterval]);

    // Auto-sync hook
    const { nextSyncIn } = useAutoSync(autoSyncInterval, handleSyncFolders);

    const recordActivity = useCallback((entry: ActivityEntry) => {
        setActivity((prev) => {
            const next = [entry, ...prev].slice(0, 60);
            if (store) store.set('activityHistory', next).then(() => store.save());
            return next;
        });
    }, [store]);

    const addToRecent = useCallback((file: TelegramFile) => {
        setRecentFiles(prev => {
            const key = buildRemoteFileKey(file, activeFolderId);
            const next = [file, ...prev.filter((candidate) => buildRemoteFileKey(candidate, activeFolderId) !== key)].slice(0, 20);
            if (store) store.set('recentFiles', next).then(() => store.save());
            return next;
        });
    }, [activeFolderId, store]);

    const handleToggleEncryption = useCallback((folderId: number) => {
        setEncryptedFolderIds(prev => {
            const next = new Set(prev);
            if (next.has(folderId)) { next.delete(folderId); } else { next.add(folderId); }
            if (store) store.set('encryptedFolderIds', Array.from(next)).then(() => store.save());
            return next;
        });
    }, [store]);

    // Listen for backup file detection events
    const handleToggleFavorite = useCallback(async (id: number) => {
        setFavoriteIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            if (store) {
                store.set('favorites', Array.from(next)).then(() => store.save());
            }
            return next;
        });
    }, [store]);

    // Drag & drop from Windows Explorer
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
            if (event.payload.paths?.length > 0) {
                handleDroppedFilesRef.current(event.payload.paths);
            }
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, [activeFolderId]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        import('@tauri-apps/api/event').then(({ listen }) => {
            listen<{ path: string; remote_folder_id: number | null }>('backup-file-detected', (event) => {
                const { path, remote_folder_id } = event.payload;
                const shouldEncrypt = encryptionEnabled || (typeof remote_folder_id === 'number' && encryptedFolderIds.has(remote_folder_id));
                const result = queueUploadCandidatesRef.current([{ path, folderId: remote_folder_id, encrypt: shouldEncrypt }]);
                if (result.queuedCount > 0) {
                    const fileName = path.split(/[/\\]/).pop();
                    recordActivity({
                        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        type: 'backup',
                        message: `Auto-backup queued ${fileName}`,
                        fileName,
                        folderId: remote_folder_id,
                        timestamp: new Date().toISOString(),
                    });
                }
            }).then((fn) => { unlisten = fn; });
        });
        return () => { unlisten?.(); };
    }, [encryptedFolderIds, encryptionEnabled, recordActivity]);

    // Clipboard paste → upload image
    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (!item.type.startsWith('image/')) continue;
                const blob = item.getAsFile();
                if (!blob) continue;
                const ext = item.type.split('/')[1] || 'png';
                const filename = `clipboard_${Date.now()}.${ext}`;
                const buffer = await blob.arrayBuffer();
                const bytes = Array.from(new Uint8Array(buffer));
                try {
                    const tmpPath = await tauriApi.saveClipboardImage(bytes, filename);
                    handleDroppedFilesRef.current([tmpPath]);
                } catch (err) {
                    toast.error(`Clipboard paste failed: ${err}`);
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [activeFolderId]);

    const { data: allFiles = [], isLoading, error } = useQuery({
        queryKey: ['files', activeFolderId],
        queryFn: () => tauriApi.getFiles(activeFolderId).then((res): TelegramFile[] => res.map((f) => ({
            ...f,
            sizeStr: formatBytes(f.size),
            type: (f.icon_type === 'folder' ? 'folder' : 'file') as 'folder' | 'file',
        }))),
        enabled: !!store && activeFolderId !== RECENT_FOLDER_ID,
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    });

    const sourceFiles = activeFolderId === RECENT_FOLDER_ID ? recentFiles : allFiles;
    const folderNameResolver = useCallback((folderId: number | null) => {
        if (folderId == null) return 'Saved Messages';
        return folders.find((folder) => folder.id === folderId)?.name;
    }, [folders]);

    const baseFiles = searchTerm.length > 2
        ? searchResults
        : sourceFiles.filter((file: TelegramFile) => matchesAdvancedSearch(file, searchTerm, folderNameResolver));
    const displayedFiles = showFavoritesOnly
        ? baseFiles.filter((f: TelegramFile) => favoriteIds.has(f.id))
        : baseFiles;

    const { data: bandwidth } = useQuery({
        queryKey: ['bandwidth'],
        queryFn: () => tauriApi.getBandwidth(),
        refetchInterval: 5000,
        enabled: !!store
    });


    const {
        handleDelete, handleBulkDelete, handleBulkMove, handleGlobalSearch

    } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, displayedFiles);

    const encryptByDefault = encryptionEnabled || (typeof activeFolderId === 'number' && activeFolderId > 0 && encryptedFolderIds.has(activeFolderId));
    const { uploadQueue, handleManualUpload, handleFolderUpload, handleDroppedFiles, queueUploadCandidates, cancelAll: cancelUploads, retryItem: retryUpload, clearFinished: clearUploads, isDragging } = useFileUpload(activeFolderId, store, encryptByDefault, recordActivity);
    const { downloadQueue, queueDownload, queueBulkDownload, clearFinished: clearDownloads, cancelAll: cancelDownloads } = useFileDownload(store, recordActivity);
    handleDroppedFilesRef.current = handleDroppedFiles;
    queueUploadCandidatesRef.current = queueUploadCandidates;

    useEffect(() => {
        if (!store || activeFolderId === RECENT_FOLDER_ID) return;
        const folderKey = `${activeFolderId ?? 'home'}`;
        setLocalFileIndex((prev) => {
            const next = { ...prev, [folderKey]: sourceFiles };
            store.set('fileIndexByFolder', next).then(() => store.save());
            return next;
        });
    }, [activeFolderId, sourceFiles, store]);


    const handleSelectAll = useCallback(() => {
        setSelectedIds(displayedFiles.map(f => f.id));
    }, [displayedFiles]);

    const handleKeyboardDelete = useCallback(() => {
        if (selectedIds.length > 0) {
            handleBulkDelete();
        }
    }, [selectedIds, handleBulkDelete]);

    const handleEscape = useCallback(() => {
        setSelectedIds([]);
        setSearchTerm("");
        setPreviewFile(null);
        setPlayingFile(null);
        setPdfFile(null);
    }, []);

    const handleFocusSearch = useCallback(() => {
        const searchInput = document.querySelector('input[placeholder^="Search files"]') as HTMLInputElement;
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, []);

    const handleEnter = useCallback(() => {
        if (selectedIds.length === 1) {
            const selected = displayedFiles.find(f => f.id === selectedIds[0]);
            if (selected) {
                if (selected.type === 'folder') {
                    setActiveFolderId(selected.id);
                } else {
                    handlePreview(selected, displayedFiles);
                }
            }
        }
    }, [selectedIds, displayedFiles, setActiveFolderId]);

    useKeyboardShortcuts({
        onSelectAll: handleSelectAll,
        onDelete: handleKeyboardDelete,
        onEscape: handleEscape,
        onSearch: handleFocusSearch,
        onEnter: handleEnter,
        enabled: !previewFile && !playingFile && !pdfFile && !showMoveModal && !renameTarget && !showSettings
    });


    useEffect(() => {
        setSelectedIds([]);
        setShowMoveModal(false);
        setSearchTerm("");
        setSearchResults([]);
        setPreviewFile(null);
        setPlayingFile(null);
        setPdfFile(null);
        setPreviewContextFiles([]);
        setPreviewContextIndex(-1);
    }, [activeFolderId]);


    useEffect(() => {
        if (searchTerm.length <= 2) {
            setSearchResults([]);
            return;
        }

        const indexedFiles = Object.values(localFileIndex)
            .flat()
            .reduce<TelegramFile[]>((acc, file) => {
                const key = buildRemoteFileKey(file, activeFolderId);
                if (!acc.some((candidate) => buildRemoteFileKey(candidate, activeFolderId) === key)) {
                    acc.push(file);
                }
                return acc;
            }, []);
        const localMatches = indexedFiles.filter((file) => matchesAdvancedSearch(file, searchTerm, folderNameResolver));
        setSearchResults(localMatches);

        const timer = setTimeout(async () => {
            setIsSearching(true);
            const results = (await handleGlobalSearch(searchTerm)).map((file) => ({
                ...file,
                sizeStr: formatBytes(file.size),
                type: 'file' as const,
            }));
            const merged = [...localMatches];
            for (const result of results) {
                const key = buildRemoteFileKey(result, activeFolderId);
                if (!merged.some((candidate) => buildRemoteFileKey(candidate, activeFolderId) === key) && matchesAdvancedSearch(result, searchTerm, folderNameResolver)) {
                    merged.push(result);
                }
            }
            setSearchResults(merged);
            setIsSearching(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [activeFolderId, folderNameResolver, handleGlobalSearch, localFileIndex, searchTerm]);




    const handleFileClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (e.shiftKey && lastClickedIdRef.current !== null) {
            const allIds = displayedFiles.map(f => f.id);
            const lastIdx = allIds.indexOf(lastClickedIdRef.current);
            const currIdx = allIds.indexOf(id);
            if (lastIdx !== -1 && currIdx !== -1) {
                const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
                const rangeIds = allIds.slice(start, end + 1);
                setSelectedIds(prev => [...new Set([...prev, ...rangeIds])]);
                return;
            }
        }
        if (e.metaKey || e.ctrlKey) {
            setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
        } else {
            setSelectedIds([id]);
        }
        lastClickedIdRef.current = id;
    }

    const ensureEncryptionReady = useCallback((file: TelegramFile, action: string) => {
        if (!file.is_encrypted || encryptionEnabled) {
            return true;
        }

        recordActivity({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'security',
            message: `Blocked ${action} for encrypted file until password is loaded`,
            fileName: file.name,
            folderId: resolveFileFolderId(file, activeFolderId),
            timestamp: new Date().toISOString(),
        });
        toast.error(`"${file.name}" is encrypted. Load your password in Settings before trying to ${action}.`);
        setShowSettings(true);
        return false;
    }, [activeFolderId, encryptionEnabled, recordActivity]);

    const handlePreview = (file: TelegramFile, orderedFiles?: TelegramFile[]) => {
        if (!ensureEncryptionReady(file, 'preview it')) return;
        if (file.type !== 'folder') addToRecent(file);
        recordActivity({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'preview',
            message: `Previewed ${file.name}`,
            fileName: file.name,
            folderId: resolveFileFolderId(file, activeFolderId),
            timestamp: new Date().toISOString(),
        });
        const contextFiles = (orderedFiles || displayedFiles).filter((f) => f.type !== 'folder');
        const contextIndex = contextFiles.findIndex((f) => f.id === file.id);

        setPreviewContextFiles(contextFiles);
        setPreviewContextIndex(contextIndex);

        const isMedia = isMediaFile(file.name);
        const isPdf = isPdfFile(file.name);

        if (isMedia) {
            setPlayingFile(file);
            setPreviewFile(null);
            setPdfFile(null);
        } else if (isPdf) {
            setPdfFile(file);
            setPreviewFile(null);
            setPlayingFile(null);
        } else {
            setPreviewFile(file);
            setPlayingFile(null);
            setPdfFile(null);
        }
    };

    const navigatePreview = useCallback((step: 1 | -1) => {
        if (previewContextFiles.length === 0) return;

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id;
        if (!currentFileId) return;

        const currentIndex = previewContextFiles.findIndex((f) => f.id === currentFileId);
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + step + previewContextFiles.length) % previewContextFiles.length;
        const nextFile = previewContextFiles[nextIndex];
        if (!nextFile) return;

        setPreviewContextIndex(nextIndex);

        const isMedia = isMediaFile(nextFile.name);
        const isPdf = isPdfFile(nextFile.name);

        if (isMedia) {
            setPlayingFile(nextFile);
            setPreviewFile(null);
            setPdfFile(null);
        } else if (isPdf) {
            setPdfFile(nextFile);
            setPreviewFile(null);
            setPlayingFile(null);
        } else {
            setPreviewFile(nextFile);
            setPlayingFile(null);
            setPdfFile(null);
        }
    }, [previewContextFiles, previewFile, playingFile, pdfFile]);

    const handleNextPreview = useCallback(() => {
        navigatePreview(1);
    }, [navigatePreview]);

    const handlePrevPreview = useCallback(() => {
        navigatePreview(-1);
    }, [navigatePreview]);

    const previewNeighborFiles = useCallback(() => {
        if (previewContextFiles.length === 0) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id;
        if (!currentFileId) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentIdx = previewContextFiles.findIndex((f) => f.id === currentFileId);
        if (currentIdx === -1) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const nextIdx = (currentIdx + 1) % previewContextFiles.length;
        const prevIdx = (currentIdx - 1 + previewContextFiles.length) % previewContextFiles.length;

        return {
            nextFile: previewContextFiles[nextIdx] || null,
            prevFile: previewContextFiles[prevIdx] || null,
        };
    }, [previewContextFiles, previewFile, playingFile, pdfFile]);

    const handleRestoreFolder = async (folderId: number, folderName: string) => {
        try {
            await tauriApi.restoreFolder(folderId, folderName);
            setTrashedFolders(prev => prev.filter(f => f.id !== folderId));
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            toast.success(`Folder "${folderName}" restored`);
        } catch (e) {
            toast.error(`Failed to restore folder: ${e}`);
        }
    };

    const handleShareLink = (file: TelegramFile) => {
        recordActivity({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'share',
            message: `Opened share options for ${file.name}`,
            fileName: file.name,
            folderId: resolveFileFolderId(file, activeFolderId),
            timestamp: new Date().toISOString(),
        });
        setShareTarget(file);
    };

    const handleRenameFolderFromSidebar = (id: number, name: string) => {
        setRenameTarget({ id, name, size: 0, sizeStr: '', type: 'folder' });
    };

    const handleShareFolderFromSidebar = (id: number, name: string) => {
        setShareTarget({ id, name, size: 0, sizeStr: '', type: 'folder' });
    };

    const selectedFiles = displayedFiles.filter((file) => selectedIds.includes(file.id));

    const handleBulkDownload = useCallback(() => {
        if (selectedFiles.length === 0) return;
        const blocked = selectedFiles.find((file) => !ensureEncryptionReady(file, 'download it'));
        if (blocked) return;
        void queueBulkDownload(selectedFiles, activeFolderId);
    }, [activeFolderId, ensureEncryptionReady, queueBulkDownload, selectedFiles]);

    const handleRename = async (newName: string) => {
        if (!renameTarget) return;
        if (renameTarget.type === 'folder') {
            await handleRenameFolder(renameTarget.id, newName);
        } else {
            await tauriApi.renameFile(renameTarget.id, resolveFileFolderId(renameTarget, activeFolderId), newName);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            recordActivity({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'rename',
                message: `Renamed ${renameTarget.name} to ${newName}`,
                fileName: newName,
                folderId: resolveFileFolderId(renameTarget, activeFolderId),
                timestamp: new Date().toISOString(),
            });
            toast.success(`Renamed to "${newName}"`);
        }
    };

    const handleMoveToTrash = async (file: TelegramFile) => {
        if (trashFolderId === null) { toast.error('Trash not initialized'); return; }
        try {
            await tauriApi.moveFiles([file.id], resolveFileFolderId(file, activeFolderId), trashFolderId);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            recordActivity({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'delete',
                message: `Moved ${file.name} to Trash`,
                fileName: file.name,
                folderId: resolveFileFolderId(file, activeFolderId),
                timestamp: new Date().toISOString(),
            });
            toast.success('Moved to Trash');
        } catch (e) {
            toast.error(`Failed to move to trash: ${e}`);
        }
    };

    const handleBulkMoveToTrash = async () => {
        if (selectedIds.length === 0) return;
        if (trashFolderId === null) { toast.error('Trash not initialized'); return; }
        try {
            const groupedByFolder = new Map<number | null, number[]>();
            for (const file of selectedFiles) {
                const folderId = resolveFileFolderId(file, activeFolderId);
                const existing = groupedByFolder.get(folderId) ?? [];
                existing.push(file.id);
                groupedByFolder.set(folderId, existing);
            }
            for (const [sourceFolderId, messageIds] of groupedByFolder.entries()) {
                await tauriApi.moveFiles(messageIds, sourceFolderId, trashFolderId);
            }
            queryClient.invalidateQueries({ queryKey: ['files'] });
            setSelectedIds([]);
            toast.success(`Moved ${selectedIds.length} file(s) to Trash`);
        } catch (e) {
            toast.error(`Failed to move to trash: ${e}`);
        }
    };

    const handleRestoreFromTrash = async () => {
        if (selectedIds.length === 0) return;
        try {
            await tauriApi.moveFiles(selectedIds, trashFolderId, null);
            queryClient.invalidateQueries({ queryKey: ['files', trashFolderId] });
            setSelectedIds([]);
            toast.success(`Restored ${selectedIds.length} file(s)`);
        } catch (e) {
            toast.error(`Failed to restore: ${e}`);
        }
    };

    const handleEmptyTrash = async () => {
        if (trashFolderId === null) return;
        const trashFiles = allFiles;
        if (trashFiles.length === 0) { toast.info('Trash is already empty'); return; }
        try {
            for (const f of trashFiles) {
                await tauriApi.deleteFile(f.id, trashFolderId);
            }
            queryClient.invalidateQueries({ queryKey: ['files', trashFolderId] });
            toast.success('Trash emptied');
        } catch (e) {
            toast.error(`Failed to empty trash: ${e}`);
        }
    };

    const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
        e.preventDefault();
        e.stopPropagation();

        const dataTransferFileId = e.dataTransfer.getData("application/x-telegram-file-id");

        if (activeFolderId === targetFolderId) return;

        const fileId = internalDragRef.current || (dataTransferFileId ? parseInt(dataTransferFileId) : null);

        if (fileId) {
            try {
                const idsToMove = selectedIds.includes(fileId) ? selectedIds : [fileId];

                await tauriApi.moveFiles(idsToMove, activeFolderId, targetFolderId);

                queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });

                if (selectedIds.includes(fileId)) setSelectedIds([]);

                toast.success(`Moved ${idsToMove.length} file(s).`);

                setInternalDragFileId(null);
            } catch {
                toast.error(`Failed to move file(s).`);
            }
        }
    }

    const currentFolderName = activeFolderId === null
        ? "Saved Messages"
        : folders.find(f => f.id === activeFolderId)?.name || "Folder";


    const handleRootDragOver = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleRootDragEnter = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const previewNeighbors = previewNeighborFiles();

    return (
        <div
            className="flex h-screen w-full overflow-hidden bg-telegram-bg relative"
            onClick={() => setSelectedIds([])}
            onDragOver={handleRootDragOver}
            onDragEnter={handleRootDragEnter}
        >

            <ExternalDropBlocker onUploadClick={handleManualUpload} />

            <AnimatePresence>
                {showSettings && (
                    <SettingsModal
                        key="settings-modal"
                        onClose={() => setShowSettings(false)}
                        autoSyncInterval={autoSyncInterval}
                        onAutoSyncChange={setAutoSyncInterval}
                        encryptionEnabled={encryptionEnabled}
                        onEncryptionToggle={(enabled) => {
                            setEncryptionEnabled(enabled);
                            if (store) store.set('encryptionEnabled', enabled).then(() => store.save());
                        }}
                        folders={folders}
                        activity={activity}
                    />
                )}
                {shareTarget && (
                    <ShareModal
                        key="share-modal"
                        file={shareTarget}
                        activeFolderId={shareTarget.type === 'folder' ? shareTarget.id : activeFolderId}
                        onClose={() => setShareTarget(null)}
                    />
                )}
                {renameTarget && (
                    <RenameModal
                        key="rename-modal"
                        currentName={renameTarget.name}
                        isFolder={renameTarget.type === 'folder'}
                        onConfirm={handleRename}
                        onClose={() => setRenameTarget(null)}
                    />
                )}
                {showMoveModal && (
                    <MoveToFolderModal
                        folders={folders}
                        onClose={() => setShowMoveModal(false)}
                        onSelect={handleBulkMove}
                        activeFolderId={activeFolderId}
                        key="move-modal"
                    />
                )}
                {playingFile && (
                    <MediaPlayer
                        file={playingFile}
                        onClose={() => setPlayingFile(null)}
                        onNext={handleNextPreview}
                        onPrev={handlePrevPreview}
                        currentIndex={previewContextIndex}
                        totalItems={previewContextFiles.length}
                        activeFolderId={activeFolderId}
                        key="media-player"
                    />
                )}
                {pdfFile && (
                    <PdfViewer
                        file={pdfFile}
                        onClose={() => setPdfFile(null)}
                        onNext={handleNextPreview}
                        onPrev={handlePrevPreview}
                        currentIndex={previewContextIndex}
                        totalItems={previewContextFiles.length}
                        activeFolderId={activeFolderId}
                        key="pdf-viewer"
                    />
                )}
                {isDragging && internalDragFileId === null && <DragDropOverlay key="drag-drop-overlay" />}
            </AnimatePresence>

            <Sidebar
                folders={folders}
                activeFolderId={activeFolderId}
                setActiveFolderId={setActiveFolderId}
                onDrop={handleDropOnFolder}
                onDelete={handleFolderDelete}
                onRenameFolder={handleRenameFolderFromSidebar}
                onShareFolder={handleShareFolderFromSidebar}
                onCreate={handleCreateFolder}
                isSyncing={isSyncing}
                isConnected={isConnected}
                onSync={handleSyncFolders}
                onLogout={handleLogout}
                bandwidth={bandwidth || null}
                trashFolderId={trashFolderId}
                trashedFolders={trashedFolders}
                onRestoreFolder={handleRestoreFolder}
                onToggleEncryption={handleToggleEncryption}
                encryptedFolderIds={encryptedFolderIds}
                recentCount={recentFiles.length}
            />

            <main className="flex-1 flex flex-col" onClick={(e) => { if (e.target === e.currentTarget) setSelectedIds([]); }}>
                <TopBar
                    currentFolderName={currentFolderName}
                    selectedIds={selectedIds}
                    onShowMoveModal={() => setShowMoveModal(true)}
                    onBulkDownload={handleBulkDownload}
                    onBulkDelete={handleBulkMoveToTrash}
                    onDownloadFolder={() => {
                        if (displayedFiles.length === 0) {
                            toast.info("Folder is empty.");
                            return;
                        }
                        const filesToDownload = displayedFiles.filter((file) => file.type !== 'folder');
                        const blocked = filesToDownload.find((file) => !ensureEncryptionReady(file, 'download it'));
                        if (blocked) return;
                        void queueBulkDownload(filesToDownload, activeFolderId);
                    }}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    showFavoritesOnly={showFavoritesOnly}
                    onToggleFavoritesFilter={() => setShowFavoritesOnly(v => !v)}
                    favoriteCount={favoriteIds.size}
                    onFolderUpload={handleFolderUpload}
                    isTrashFolder={activeFolderId !== null && activeFolderId === trashFolderId}
                    onRestoreSelected={handleRestoreFromTrash}
                    onEmptyTrash={handleEmptyTrash}
                    onOpenSettings={() => setShowSettings(true)}
                    nextSyncIn={autoSyncInterval > 0 ? nextSyncIn : null}
                />
                {searchTerm.length > 2 && (
                    <div className="px-6 pt-4 pb-0">
                        <h2 className="text-sm font-medium text-telegram-subtext">
                            Search Results for <span className="text-telegram-primary">"{searchTerm}"</span>
                        </h2>
                    </div>
                )}
                <FileExplorer
                    files={displayedFiles}
                    loading={isLoading || isSearching}
                    error={error}
                    viewMode={viewMode}
                    selectedIds={selectedIds}
                    activeFolderId={activeFolderId}
                    onFileClick={handleFileClick}
                    onDelete={trashFolderId !== null && activeFolderId === trashFolderId ? handleDelete : handleMoveToTrash}
                    onDownload={(file) => {
                        if (!ensureEncryptionReady(file, 'download it')) return;
                        addToRecent(file);
                        queueDownload(file.id, file.name, resolveFileFolderId(file, activeFolderId));
                    }}
                    onPreview={handlePreview}
                    onManualUpload={handleManualUpload}
                    onSelectionClear={() => setSelectedIds([])}
                    onDrop={handleDropOnFolder}
                    onDragStart={(fileId) => setInternalDragFileId(fileId)}
                    onDragEnd={() => setTimeout(() => setInternalDragFileId(null), 50)}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={handleToggleFavorite}
                    onRename={(file) => setRenameTarget(file)}
                    onShareLink={handleShareLink}
                    onOpenFolder={(file) => setActiveFolderId(file.id)}
                />
            </main>

            {previewFile && (
                <PreviewModal
                    file={previewFile}
                    activeFolderId={activeFolderId}
                    onClose={() => setPreviewFile(null)}
                    onNext={handleNextPreview}
                    onPrev={handlePrevPreview}
                    currentIndex={previewContextIndex}
                    totalItems={previewContextFiles.length}
                    nextFile={previewNeighbors.nextFile}
                    prevFile={previewNeighbors.prevFile}
                />
            )}


            <UploadQueue
                items={uploadQueue}
                onClearFinished={clearUploads}
                onCancelAll={cancelUploads}
                onRetry={retryUpload}
            />
            <DownloadQueue
                items={downloadQueue}
                onClearFinished={clearDownloads}
                onCancelAll={cancelDownloads}
            />
        </div>
    );
}
