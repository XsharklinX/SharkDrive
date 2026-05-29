import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';

import { TelegramFile } from '../types';
import { formatBytes, resolveFileFolderId, isTextPreviewFile } from '../utils';
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
import { VaultModal } from './dashboard/VaultModal';
import { BatchRenameModal } from './dashboard/BatchRenameModal';
import { DuplicateDialog } from './dashboard/DuplicateDialog';
import { TextPreviewModal } from './dashboard/TextPreviewModal';
import { FileInfoPanel } from './dashboard/FileInfoPanel';
import { ErrorBoundary } from './ErrorBoundary';

// Hooks
import { useTelegramConnection } from '../hooks/useTelegramConnection';
import { useFileOperations } from '../hooks/useFileOperations';
import { useFileUpload } from '../hooks/useFileUpload';
import { useFileDownload } from '../hooks/useFileDownload';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePreviewNavigation } from '../hooks/usePreviewNavigation';
import { useDashboardSearch } from '../hooks/useDashboardSearch';
import { useFavorites } from '../hooks/useFavorites';
import { useRecentFiles } from '../hooks/useRecentFiles';
import { useActivityLog } from '../hooks/useActivityLog';
import { useEncryptedFolders } from '../hooks/useEncryptedFolders';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useOrganization } from '../hooks/useOrganization';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
    const queryClient = useQueryClient();

    const {
        store, folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
        handleLogout, handleSyncFolders, handleCreateFolder, handleFolderDelete, handleRenameFolder, handleSetFolderParent
    } = useTelegramConnection(onLogout);

    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'gallery'>('grid');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [destinationAction, setDestinationAction] = useState<'move' | 'copy'>('move');
    const [isDraggingInternally, setIsDraggingInternally] = useState(false);
    const internalDragRef = useRef<number | null>(null);
    const handleDroppedFilesRef = useRef<(paths: string[]) => void>(() => {});
    const queueUploadCandidatesRef = useRef<(candidates: { path: string; folderId?: number | null; encrypt?: boolean }[]) => { queuedCount: number; skippedCount: number }>(() => ({ queuedCount: 0, skippedCount: 0 }));

    const [renameTarget, setRenameTarget] = useState<TelegramFile | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showVault, setShowVault] = useState(false);
    const [batchRenameFiles, setBatchRenameFiles] = useState<TelegramFile[] | null>(null);
    const [textPreviewFile, setTextPreviewFile] = useState<TelegramFile | null>(null);
    const [infoFile, setInfoFile] = useState<TelegramFile | null>(null);
    const [shareTarget, setShareTarget] = useState<TelegramFile | null>(null);
    const [bulkShareTargets, setBulkShareTargets] = useState<TelegramFile[] | null>(null);
    const [autoSyncInterval, setAutoSyncInterval] = useState(0);
    const [movingFolderId, setMovingFolderId] = useState<number | null>(null);
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

    const { favoriteIds, showFavoritesOnly, setShowFavoritesOnly, handleToggleFavorite } = useFavorites(store);
    const { recentFiles, addToRecent } = useRecentFiles(store, activeFolderId);
    const { activity, recordActivity } = useActivityLog(store);
    const { encryptedFolderIds, encryptionEnabled, setEncryptionEnabled, handleToggleEncryption } = useEncryptedFolders(store);
    const { recentSearches, commitSearchTerm } = useRecentSearches(store);
    const organization = useOrganization(store);

    const setInternalDragFileId = (id: number | null) => {
        internalDragRef.current = id;
        setIsDraggingInternally(id !== null);
    };

    const {
        previewFile,
        setPreviewFile,
        playingFile,
        setPlayingFile,
        pdfFile,
        setPdfFile,
        previewContextFiles,
        previewContextIndex,
        openPreview,
        closeAllPreviews,
        resetPreviewState,
        handleNextPreview,
        handlePrevPreview,
        previewNeighbors,
    } = usePreviewNavigation();

    useEffect(() => {
        if (store) {
            store.get<'grid' | 'list' | 'gallery'>('viewMode').then((saved) => {
                if (saved) setViewMode(saved);
            });
        }
    }, [store]);

    useEffect(() => {
        tauriApi.getStreamToken().catch((e) => {
            console.warn('Streaming server unavailable:', e);
        });
    }, []);

    useEffect(() => {
        if (store) {
            store.set('viewMode', viewMode).then(() => store.save());
        }
    }, [store, viewMode]);

    useEffect(() => {
        if (!store) return;
        store.get<number>('autoSyncInterval').then(v => { if (v != null) setAutoSyncInterval(v); });
    }, [store]);

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    useEffect(() => {
        if (store) store.set('autoSyncInterval', autoSyncInterval).then(() => store.save());
    }, [store, autoSyncInterval]);

    useEffect(() => {
        const savedAutoLock = Number(localStorage.getItem('sharkdrive.encryptionAutoLockMinutes') || '15');
        void tauriApi.setEncryptionAutoLock(savedAutoLock > 0 ? savedAutoLock : null);
    }, []);

    useEffect(() => {
        if (!encryptionEnabled) return;
        let lastTouch = 0;
        const touch = () => {
            const now = Date.now();
            if (now - lastTouch < 10_000) return;
            lastTouch = now;
            void tauriApi.touchEncryptionActivity().then((unlocked) => {
                if (!unlocked) setEncryptionEnabled(false);
            }).catch(() => {});
        };
        const events = ['pointerdown', 'keydown', 'wheel', 'drop'];
        events.forEach((eventName) => window.addEventListener(eventName, touch, { passive: true }));
        const interval = window.setInterval(() => {
            void tauriApi.getEncryptionStatus().then(setEncryptionEnabled).catch(() => {});
        }, 30_000);
        touch();
        return () => {
            events.forEach((eventName) => window.removeEventListener(eventName, touch));
            window.clearInterval(interval);
        };
    }, [encryptionEnabled, setEncryptionEnabled]);

    const { nextSyncIn } = useAutoSync(autoSyncInterval, handleSyncFolders);

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
        return () => { unlisten?.(); };
    }, [encryptedFolderIds, encryptionEnabled, recordActivity]);

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
    }, []);

    const mapFileList = (res: TelegramFile[]): TelegramFile[] => res.map((f) => ({
        ...f,
        sizeStr: formatBytes(f.size),
        type: (f.icon_type === 'folder' ? 'folder' : 'file') as 'folder' | 'file',
    }));

    // Instant: reads from local index, no Telegram call
    const { data: cachedFiles } = useQuery({
        queryKey: ['cached-files', activeFolderId],
        queryFn: () => tauriApi.getCachedFiles(activeFolderId).then(mapFileList),
        enabled: !!store && activeFolderId !== RECENT_FOLDER_ID,
        staleTime: Infinity,
        gcTime: 10 * 60 * 1000,
    });

    // Background refresh from Telegram; uses cachedFiles as placeholder so UI shows instantly
    const { data: allFiles = cachedFiles ?? [], isLoading, error } = useQuery({
        queryKey: ['files', activeFolderId],
        queryFn: () => tauriApi.getFiles(activeFolderId).then(mapFileList),
        enabled: !!store && activeFolderId !== RECENT_FOLDER_ID,
        placeholderData: cachedFiles,
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, err) => {
            if (String(err).includes('not connected')) return false;
            return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    });

    const sourceFiles = activeFolderId === RECENT_FOLDER_ID ? recentFiles : allFiles;
    const organizedSourceFiles = useMemo(() => (
        sourceFiles.map((file) => organization.decorateFile(file, resolveFileFolderId(file, activeFolderId)))
    ), [activeFolderId, organization.decorateFile, sourceFiles]);

    const folderNameResolver = useCallback((folderId: number | null) => {
        if (folderId == null) return 'Saved Messages';
        return folders.find((folder) => folder.id === folderId)?.name;
    }, [folders]);

    const handleGlobalSearch = useCallback(async (query: string) => {
        try {
            return await tauriApi.searchGlobal(query);
        } catch {
            return [];
        }
    }, []);

    const {
        searchTerm,
        setSearchTerm,
        displayedFiles,
        isSearching,
        resetSearch,
    } = useDashboardSearch({
        activeFolderId,
        sourceFiles: organizedSourceFiles,
        showFavoritesOnly,
        favoriteIds,
        folderNameResolver,
        handleGlobalSearch,
        decorateFile: organization.decorateFile,
    });

    const { data: bandwidth } = useQuery({
        queryKey: ['bandwidth'],
        queryFn: () => tauriApi.getBandwidth(),
        refetchInterval: 5000,
        enabled: !!store
    });

    const { data: allIndexedRaw = [] } = useQuery({
        queryKey: ['all-indexed-files'],
        queryFn: () => tauriApi.getAllIndexedFiles(),
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        enabled: !!store,
    });

    const folderFileCounts = useMemo(() => {
        const counts: Record<number, number> = {};
        for (const f of allIndexedRaw) {
            if (f.folder_id != null && f.icon_type !== 'folder') {
                counts[f.folder_id] = (counts[f.folder_id] ?? 0) + 1;
            }
        }
        return counts;
    }, [allIndexedRaw]);

    const vaultBadge = useMemo(() => {
        const fileCount = allIndexedRaw.filter(f => f.icon_type !== 'folder').length;
        const totalBytes = allIndexedRaw.reduce((sum, f) => sum + (f.size ?? 0), 0);
        return { fileCount, totalBytes };
    }, [allIndexedRaw]);

    const {
        handleDelete, handleBulkDelete, handleBulkMove, handleBulkCopy,
    } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, displayedFiles);

    const encryptByDefault = encryptionEnabled || (typeof activeFolderId === 'number' && activeFolderId > 0 && encryptedFolderIds.has(activeFolderId));
    const { uploadQueue, handleManualUpload, handleFolderUpload, handleDroppedFiles, queueUploadCandidates, cancelAll: cancelUploads, cancelItem: cancelUploadItem, retryItem: retryUpload, clearFinished: clearUploads, forceUpload, skipDuplicate, duplicateItems, isDragging } = useFileUpload(activeFolderId, store, encryptByDefault, recordActivity);
    const { downloadQueue, queueDownload, queueBulkDownload, clearFinished: clearDownloads, retryDownload, cancelDownloadItem, cancelAll: cancelDownloads } = useFileDownload(store, recordActivity);
    handleDroppedFilesRef.current = handleDroppedFiles;
    queueUploadCandidatesRef.current = queueUploadCandidates;

    const queuedUploadCount = uploadQueue.filter((item) => item.status === 'pending' || item.status === 'uploading').length;
    const uploadingCount = uploadQueue.filter((item) => item.status === 'uploading').length;
    const failedUploadCount = uploadQueue.filter((item) => item.status === 'error').length;

    const handleSelectAll = useCallback(() => {
        setSelectionMode(true);
        setSelectedIds(displayedFiles.map(f => f.id));
    }, [displayedFiles]);

    const handleEscape = useCallback(() => {
        setSelectedIds([]);
        setSelectionMode(false);
        resetSearch();
        closeAllPreviews();
    }, [closeAllPreviews, resetSearch]);

    const handleFocusSearch = useCallback(() => {
        const searchInput = document.querySelector('input[data-vault-search="true"]') as HTMLInputElement | null;
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

    const handleKeyboardRename = useCallback(() => {
        if (selectedIds.length === 1) {
            const selected = displayedFiles.find(f => f.id === selectedIds[0]);
            if (selected) setRenameTarget(selected);
        }
    }, [selectedIds, displayedFiles]);

    const handleSelectRange = useCallback((ids: number[]) => {
        setSelectionMode(true);
        setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }, []);

    useEffect(() => {
        setSelectedIds([]);
        setSelectionMode(false);
        setShowMoveModal(false);
        resetSearch();
        resetPreviewState();
    }, [activeFolderId, resetPreviewState, resetSearch]);

    const handleToggleSelection = useCallback((id: number) => {
        setSelectionMode(true);
        setSelectedIds((ids) => ids.includes(id) ? ids.filter((existingId) => existingId !== id) : [...ids, id]);
    }, []);

    const handleToggleSelectionMode = useCallback(() => {
        setSelectionMode((current) => {
            if (current) {
                setSelectedIds([]);
                return false;
            }
            return true;
        });
    }, []);

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
        openPreview(file, orderedFiles || displayedFiles);
    };

    const handlePreviewOrText = (file: TelegramFile, orderedFiles?: TelegramFile[]) => {
        if (isTextPreviewFile(file.name)) {
            setTextPreviewFile(file);
        } else {
            handlePreview(file, orderedFiles);
        }
    };

    const handleDuplicate = async (file: TelegramFile) => {
        const folderId = resolveFileFolderId(file, activeFolderId);
        const dotIdx = file.name.lastIndexOf('.');
        const base = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
        const ext = dotIdx > 0 ? file.name.slice(dotIdx) : '';
        const newName = `${base} (2)${ext}`;
        try {
            await tauriApi.duplicateFile(file.id, folderId, newName);
            queryClient.invalidateQueries({ queryKey: ['files', folderId] }); queryClient.invalidateQueries({ queryKey: ['cached-files', folderId] });
            toast.success(`Duplicated as "${newName}"`);
        } catch (e) {
            toast.error(`Duplicate failed: ${String(e)}`);
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

    const handleDestinationSelect = useCallback(async (targetFolderId: number | null) => {
        if (destinationAction === 'copy') {
            await handleBulkCopy(targetFolderId, () => {
                recordActivity({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    type: 'copy',
                    message: `Copied ${selectedIds.length} file(s)`,
                    folderId: targetFolderId,
                    timestamp: new Date().toISOString(),
                });
                setShowMoveModal(false);
            });
            return;
        }

        await handleBulkMove(targetFolderId, () => setShowMoveModal(false));
    }, [destinationAction, handleBulkCopy, handleBulkMove, recordActivity, selectedIds.length]);

    const openDestinationModal = useCallback((action: 'move' | 'copy') => {
        setDestinationAction(action);
        setShowMoveModal(true);
    }, []);

    const handleRename = async (newName: string) => {
        if (!renameTarget) return;
        if (renameTarget.type === 'folder') {
            await handleRenameFolder(renameTarget.id, newName);
        } else {
            await tauriApi.renameFile(renameTarget.id, resolveFileFolderId(renameTarget, activeFolderId), newName);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['cached-files'] });
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

    const handleKeyboardDelete = useCallback(() => {
        if (selectedIds.length > 0) {
            void handleBulkDelete();
        }
    }, [handleBulkDelete, selectedIds.length]);

    useKeyboardShortcuts({
        onSelectAll: handleSelectAll,
        onDelete: handleKeyboardDelete,
        onEscape: handleEscape,
        onSearch: handleFocusSearch,
        onRename: handleKeyboardRename,
        onEnter: handleEnter,
        shortcuts: organization.shortcuts,
        enabled: !previewFile && !playingFile && !pdfFile && !showMoveModal && !renameTarget && !showSettings
    });

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
                queryClient.invalidateQueries({ queryKey: ['cached-files', activeFolderId] });

                if (selectedIds.includes(fileId)) setSelectedIds([]);

                toast.success(`Moved ${idsToMove.length} file(s).`);

                setInternalDragFileId(null);
            } catch {
                toast.error(`Failed to move file(s).`);
            }
        }
    };

    const currentFolderName = activeFolderId === null
        ? "Saved Messages"
        : folders.find(f => f.id === activeFolderId)?.name || "Folder";

    const folderPath = useMemo(() => {
        if (activeFolderId === RECENT_FOLDER_ID) {
            return [{ id: RECENT_FOLDER_ID as number | null, name: 'Recent' }];
        }
        const root: { id: number | null; name: string }[] = [{ id: null, name: 'Saved Messages' }];
        const segments: { id: number | null; name: string }[] = [];
        let current: number | null = activeFolderId;
        while (current !== null) {
            const folder = folders.find(f => f.id === current);
            if (!folder) break;
            segments.unshift({ id: folder.id, name: folder.name });
            current = folder.parent_id ?? null;
        }
        return [...root, ...segments];
    }, [activeFolderId, folders]);

    const handleInlineRename = useCallback(async (file: TelegramFile, newName: string) => {
        if (!newName.trim() || newName === file.name) return;
        if (file.type === 'folder') {
            await handleRenameFolder(file.id, newName);
        } else {
            await tauriApi.renameFile(file.id, resolveFileFolderId(file, activeFolderId), newName);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['cached-files'] });
            toast.success(`Renamed to "${newName}"`);
        }
    }, [activeFolderId, handleRenameFolder, queryClient]);

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

    const previewNeighborState = previewNeighbors();

    return (
        <div
            className="flex h-screen w-full overflow-hidden bg-telegram-bg relative"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    setSelectedIds([]);
                    setSelectionMode(false);
                }
            }}
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
                        shortcuts={organization.shortcuts}
                        onShortcutsChange={organization.setShortcuts}
                    />
                )}
                {showVault && (
                    <VaultModal
                        key="vault-modal"
                        files={allIndexedRaw.filter(f => f.icon_type !== 'folder')}
                        folders={folders}
                        activity={activity}
                        onClose={() => setShowVault(false)}
                    />
                )}
                {batchRenameFiles && (
                    <BatchRenameModal
                        key="batch-rename-modal"
                        files={batchRenameFiles}
                        activeFolderId={activeFolderId}
                        onClose={() => setBatchRenameFiles(null)}
                        onDone={() => queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] })}
                    />
                )}
                {textPreviewFile && (
                    <TextPreviewModal
                        key="text-preview-modal"
                        file={textPreviewFile}
                        activeFolderId={activeFolderId}
                        onClose={() => setTextPreviewFile(null)}
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
                {bulkShareTargets && (
                    <ShareModal
                        key="bulk-share-modal"
                        files={bulkShareTargets}
                        activeFolderId={activeFolderId}
                        onClose={() => setBulkShareTargets(null)}
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
                        onSelect={handleDestinationSelect}
                        activeFolderId={activeFolderId}
                        mode={destinationAction}
                        key="move-modal"
                    />
                )}
                {movingFolderId !== null && (
                    <MoveToFolderModal
                        folders={folders.filter((f) => f.id !== movingFolderId)}
                        onClose={() => setMovingFolderId(null)}
                        onSelect={async (targetParentId) => {
                            await handleSetFolderParent(movingFolderId, targetParentId);
                            setMovingFolderId(null);
                        }}
                        activeFolderId={null}
                        mode="move"
                        key="move-folder-modal"
                    />
                )}
                {playingFile && (
                    <ErrorBoundary onDismiss={() => setPlayingFile(null)} key="media-player-boundary">
                        <MediaPlayer
                            file={playingFile}
                            onClose={() => setPlayingFile(null)}
                            onNext={handleNextPreview}
                            onPrev={handlePrevPreview}
                            currentIndex={previewContextIndex}
                            totalItems={previewContextFiles.length}
                            activeFolderId={activeFolderId}
                            playlist={previewContextFiles}
                            onSelectTrack={(track) => handlePreview(track, previewContextFiles)}
                            key="media-player"
                        />
                    </ErrorBoundary>
                )}
                {pdfFile && (
                    <ErrorBoundary onDismiss={() => setPdfFile(null)} key="pdf-viewer-boundary">
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
                    </ErrorBoundary>
                )}
                {isDragging && !isDraggingInternally && <DragDropOverlay key="drag-drop-overlay" />}
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
                onSetFolderParent={handleSetFolderParent}
                isSyncing={isSyncing}
                isConnected={isConnected}
                onSync={handleSyncFolders}
                onLogout={handleLogout}
                bandwidth={bandwidth || null}
                onToggleEncryption={handleToggleEncryption}
                encryptedFolderIds={encryptedFolderIds}
                recentCount={recentFiles.length}
                starredCount={favoriteIds.size}
                showFavoritesOnly={showFavoritesOnly}
                onToggleStarred={() => setShowFavoritesOnly(v => !v)}
                folderFileCounts={folderFileCounts}
                onMoveFolderTo={(folderId) => setMovingFolderId(folderId)}
                activity={activity}
                vaultBadge={vaultBadge}
                onOpenVault={() => setShowVault(true)}
                pinnedFolderIds={organization.pinnedFolderIds}
                getFolderColor={organization.getFolderColor}
                onTogglePinnedFolder={organization.togglePinnedFolder}
                onSetFolderColor={organization.setFolderColor}
                encryptionUnlocked={encryptionEnabled}
                onLockVault={async () => {
                    await tauriApi.clearEncryptionKey();
                    setEncryptionEnabled(false);
                    toast.info('Encryption vault locked');
                }}
            />

            <main className="flex-1 flex flex-col bg-gradient-to-b from-white/[0.015] to-transparent" onClick={(e) => {
                if (e.target === e.currentTarget) {
                    setSelectedIds([]);
                    setSelectionMode(false);
                }
            }}>
                <TopBar
                    currentFolderName={currentFolderName}
                    folderPath={folderPath}
                    onNavigateTo={setActiveFolderId}
                    selectedIds={selectedIds}
                    selectionMode={selectionMode}
                    onToggleSelectionMode={handleToggleSelectionMode}
                    onShowMoveModal={() => openDestinationModal('move')}
                    onShowCopyModal={() => openDestinationModal('copy')}
                    onBulkShare={() => {
                        const filesToShare = selectedFiles.filter((item) => item.type !== 'folder');
                        if (filesToShare.length === 0) {
                            toast.info('Select at least one file to share.');
                            return;
                        }
                        setBulkShareTargets(filesToShare);
                    }}
                    onBulkDownload={handleBulkDownload}
                    onBulkDelete={handleBulkDelete}
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
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onSearchCommit={commitSearchTerm}
                    recentSearches={recentSearches}
                    showFavoritesOnly={showFavoritesOnly}
                    onToggleFavoritesFilter={() => setShowFavoritesOnly(v => !v)}
                    favoriteCount={favoriteIds.size}
                    onFileUpload={handleManualUpload}
                    onEncryptedFileUpload={() => handleManualUpload(true)}
                    onFolderUpload={handleFolderUpload}
                    onOpenSettings={() => setShowSettings(true)}
                    nextSyncIn={autoSyncInterval > 0 ? nextSyncIn : null}
                    queuedUploadCount={queuedUploadCount}
                    uploadingCount={uploadingCount}
                    failedUploadCount={failedUploadCount}
                    isDraggingFiles={isDragging}
                />
                {searchTerm.length > 2 && (
                    <div className="px-6 pt-4 pb-0">
                        <div className="rounded-lg border border-telegram-border bg-white/[0.02] px-4 py-2.5">
                            <h2 className="text-sm text-telegram-subtext">
                                Results for <span className="font-medium text-telegram-text">"{searchTerm}"</span>
                            </h2>
                        </div>
                    </div>
                )}
                <FileExplorer
                    files={displayedFiles}
                    loading={(isLoading && !cachedFiles?.length) || isSearching}
                    error={error}
                    emptyVariant={searchTerm.length > 2 ? 'search' : showFavoritesOnly ? 'favorites' : 'folder'}
                    searchTerm={searchTerm}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    selectedIds={selectedIds}
                    selectionMode={selectionMode}
                    activeFolderId={activeFolderId}
                    onDelete={handleDelete}
                    onDownload={(file) => {
                        if (!ensureEncryptionReady(file, 'download it')) return;
                        addToRecent(file);
                        queueDownload(file.id, file.name, resolveFileFolderId(file, activeFolderId));
                    }}
                    onPreview={handlePreviewOrText}
                    onManualUpload={handleManualUpload}
                    onSelectionClear={() => {
                        setSelectedIds([]);
                        setSelectionMode(false);
                    }}
                    onToggleSelection={handleToggleSelection}
                    onDrop={handleDropOnFolder}
                    onDragStart={(fileId) => setInternalDragFileId(fileId)}
                    onDragEnd={() => setTimeout(() => setInternalDragFileId(null), 50)}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={handleToggleFavorite}
                    onRename={(file) => setRenameTarget(file)}
                    onInlineRename={handleInlineRename}
                    onShareLink={handleShareLink}
                    onCopyToFolder={(file) => {
                        setSelectionMode(true);
                        setSelectedIds([file.id]);
                        openDestinationModal('copy');
                    }}
                    onOpenFolder={(file) => setActiveFolderId(file.id)}
                    onSelectVisible={handleSelectAll}
                    onSelectRange={handleSelectRange}
                    onDuplicate={handleDuplicate}
                    onBatchRename={(files) => setBatchRenameFiles(files)}
                    onInfo={(file) => setInfoFile(file)}
                    availableTags={organization.allTags}
                    activeTag={activeTagFilter}
                    onTagFilterChange={setActiveTagFilter}
                    getFolderColor={organization.getFolderColor}
                />
            </main>

            {infoFile && (
                <FileInfoPanel
                    file={infoFile}
                    folders={folders}
                    activeFolderId={activeFolderId}
                    tags={organization.getFileTags(infoFile, resolveFileFolderId(infoFile, activeFolderId))}
                    allTags={organization.allTags}
                    note={organization.getFileNote(infoFile, resolveFileFolderId(infoFile, activeFolderId))}
                    onSetTags={(tags) => organization.setFileTags(infoFile, resolveFileFolderId(infoFile, activeFolderId), tags)}
                    onSetNote={(note) => organization.setFileNote(infoFile, resolveFileFolderId(infoFile, activeFolderId), note)}
                    onClose={() => setInfoFile(null)}
                />
            )}

            {duplicateItems.length > 0 && (
                <DuplicateDialog
                    item={duplicateItems[0]}
                    onForceUpload={forceUpload}
                    onSkip={skipDuplicate}
                />
            )}

            {previewFile && (
                <ErrorBoundary onDismiss={() => setPreviewFile(null)}>
                    <PreviewModal
                        file={previewFile}
                        activeFolderId={activeFolderId}
                        onClose={() => setPreviewFile(null)}
                        onNext={handleNextPreview}
                        onPrev={handlePrevPreview}
                        currentIndex={previewContextIndex}
                        totalItems={previewContextFiles.length}
                        nextFile={previewNeighborState.nextFile}
                        prevFile={previewNeighborState.prevFile}
                    />
                </ErrorBoundary>
            )}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-h-[calc(100vh-2rem)] flex-col gap-3">
                <div className="pointer-events-auto">
                    <UploadQueue
                        items={uploadQueue}
                        onClearFinished={clearUploads}
                        onCancelAll={cancelUploads}
                        onRetry={retryUpload}
                        onCancelItem={cancelUploadItem}
                    />
                </div>
                <div className="pointer-events-auto">
                    <DownloadQueue
                        items={downloadQueue}
                        onClearFinished={clearDownloads}
                        onCancelAll={cancelDownloads}
                        onRetry={retryDownload}
                        onCancelItem={cancelDownloadItem}
                    />
                </div>
            </div>
        </div>
    );
}
