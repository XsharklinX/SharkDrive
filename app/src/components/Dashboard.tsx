import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';

import { TelegramFile } from '../types';
import { formatBytes, resolveFileFolderId, isTextPreviewFile, isSvgFile, isImageFile } from '../utils';
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
import { ShareLinksDashboard } from './dashboard/ShareLinksDashboard';
import { BatchRenameModal } from './dashboard/BatchRenameModal';
import { DuplicateDialog } from './dashboard/DuplicateDialog';
import { BackupConflictDialog } from './dashboard/BackupConflictDialog';
import { TextPreviewModal } from './dashboard/TextPreviewModal';
import { FileInfoPanel } from './dashboard/FileInfoPanel';
import { KeyboardShortcutsOverlay } from './dashboard/KeyboardShortcutsOverlay';
import { ImageCompressDialog } from './dashboard/ImageCompressDialog';
import { OnboardingWizard } from './dashboard/OnboardingWizard';
import { ErrorBoundary } from './ErrorBoundary';
import { VaultLockScreen } from './dashboard/VaultLockScreen';
import { FolderStatsModal } from './dashboard/FolderStatsModal';
import { VersionHistoryModal } from './dashboard/VersionHistoryModal';
import { SyncHistoryPanel } from './dashboard/SyncHistoryPanel';
import { DuplicatesPanel } from './dashboard/DuplicatesPanel';
import { CrossAccountCopyModal } from './dashboard/CrossAccountCopyModal';
import { WebAccessModal } from './dashboard/WebAccessModal';
import { WipeConfirmModal } from './dashboard/WipeConfirmModal';
import { TotpSetupModal } from './dashboard/TotpSetupModal';
import { ExportKeyModal } from './dashboard/ExportKeyModal';

// Hooks
import { useTelegramConnection } from '../hooks/useTelegramConnection';
import { useFileOperations } from '../hooks/useFileOperations';
import { useFileUpload } from '../hooks/useFileUpload';
import { useFileDownload } from '../hooks/useFileDownload';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePreviewNavigation } from '../hooks/usePreviewNavigation';
import { useDashboardSearch } from '../hooks/useDashboardSearch';
import { useContentSearch } from '../hooks/useContentSearch';
import { usePagedFiles } from '../hooks/usePagedFiles';
import { useAccounts } from '../hooks/useAccounts';
import { useFavorites } from '../hooks/useFavorites';
import { useRecentFiles } from '../hooks/useRecentFiles';
import { useActivityLog } from '../hooks/useActivityLog';
import { useEncryptedFolders } from '../hooks/useEncryptedFolders';
import { useRecentSearches } from '../hooks/useRecentSearches';
import { useOrganization } from '../hooks/useOrganization';
import { matchesSmartCollection, useSmartCollections, type SmartCollectionId } from '../hooks/useSmartCollections';
import { useConfirm } from '../context/ConfirmContext';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

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
    const queueUploadCandidatesRef = useRef<(candidates: { path: string; folderId?: number | null; encrypt?: boolean; source?: 'manual' | 'backup' }[]) => { queuedCount: number; skippedCount: number }>(() => ({ queuedCount: 0, skippedCount: 0 }));

    const [renameTarget, setRenameTarget] = useState<TelegramFile | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showVault, setShowVault] = useState(false);
    const [pendingImagePaths, setPendingImagePaths] = useState<string[] | null>(null);
    const [showLinksDashboard, setShowLinksDashboard] = useState(false);
    const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false);
    const [showSyncHistory, setShowSyncHistory] = useState(false);
    const [showDuplicates, setShowDuplicates] = useState(false);
    const [versionHistoryFile, setVersionHistoryFile] = useState<TelegramFile | null>(null);
    const [crossCopyFiles, setCrossCopyFiles] = useState<TelegramFile[] | null>(null);
    const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
    const [showWebAccess, setShowWebAccess] = useState(false);
    const [showWipeConfirm, setShowWipeConfirm] = useState(false);
    const [showTotpSetup, setShowTotpSetup] = useState(false);
    const [exportKeyTarget, setExportKeyTarget] = useState<{ id: number; name: string } | null>(null);
    const pendingUploadPathsRef = useRef<string[]>([]);
    const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('sharkdrive.onboarding.v1') !== 'complete');
    const [batchRenameFiles, setBatchRenameFiles] = useState<TelegramFile[] | null>(null);
    const [textPreviewFile, setTextPreviewFile] = useState<TelegramFile | null>(null);
    const [infoFile, setInfoFile] = useState<TelegramFile | null>(null);
    const [shareTarget, setShareTarget] = useState<TelegramFile | null>(null);
    const [bulkShareTargets, setBulkShareTargets] = useState<TelegramFile[] | null>(null);
    const [autoSyncInterval, setAutoSyncInterval] = useState(0);
    const [movingFolderId, setMovingFolderId] = useState<number | null>(null);
    const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
    const [vaultUiLocked, setVaultUiLocked] = useState(false);
    const [activeSmartCollectionId, setActiveSmartCollectionId] = useState<SmartCollectionId | null>(null);
    const [searchCurrentFolderOnly, setSearchCurrentFolderOnly] = useState(false);
    const [contentSearchEnabled, setContentSearchEnabled] = useState(false);
    const [statsFolderId, setStatsFolderId] = useState<number | null>(null);
    const cleanupReviewedRef = useRef(false);
    const previousSyncingRef = useRef(false);
    const syncFoldersRef = useRef(handleSyncFolders);
    // Always-current refs used by sync history recording
    const allFilesRef = useRef<TelegramFile[]>([]);
    const currentFolderNameRef = useRef<string>('Saved Messages');
    const preSyncInfoRef = useRef<{ folderId: number | null; names: Set<string>; startMs: number } | null>(null);
    syncFoldersRef.current = handleSyncFolders;
    const handleManualUploadRef = useRef<(encrypted?: boolean) => void>(() => {});
    const renameHistoryRef = useRef<Array<{
        type: 'file' | 'folder';
        id: number;
        folderId: number | null;
        oldName: string;
        newName: string;
    }>>([]);

    const { accounts, activeAccountId, refresh: refreshAccounts } = useAccounts();
    const { favoriteIds, showFavoritesOnly, setShowFavoritesOnly, handleToggleFavorite } = useFavorites(store);
    const { recentFiles, addToRecent, removeFromRecent, pruneStaleRecent } = useRecentFiles(store, activeFolderId);
    const { encryptedFolderIds, encryptionEnabled, setEncryptionEnabled, handleToggleEncryption } = useEncryptedFolders(store);
    const { activity, recordActivity } = useActivityLog(store, encryptionEnabled);
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
            void Notification.requestPermission();
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
                if (!unlocked) {
                    setEncryptionEnabled(false);
                    setVaultUiLocked(true);
                }
            }).catch(() => {});
        };
        const events = ['pointerdown', 'keydown', 'wheel', 'drop'];
        events.forEach((eventName) => window.addEventListener(eventName, touch, { passive: true }));
        const interval = window.setInterval(() => {
            void tauriApi.getEncryptionStatus().then((unlocked) => {
                setEncryptionEnabled(unlocked);
                if (!unlocked) setVaultUiLocked(true);
            }).catch(() => {});
        }, 30_000);
        touch();
        return () => {
            events.forEach((eventName) => window.removeEventListener(eventName, touch));
            window.clearInterval(interval);
        };
    }, [encryptionEnabled, setEncryptionEnabled]);

    useEffect(() => {
        if (!encryptionEnabled || vaultUiLocked) return;
        const minutes = Number(localStorage.getItem('sharkdrive.encryptionAutoLockMinutes') || '15');
        if (minutes <= 0) return;
        let lastActivity = Date.now();
        const touch = () => { lastActivity = Date.now(); };
        const events = ['pointerdown', 'keydown', 'wheel', 'drop'];
        events.forEach((eventName) => window.addEventListener(eventName, touch, { passive: true }));
        const interval = window.setInterval(() => {
            if (Date.now() - lastActivity >= minutes * 60_000) {
                void tauriApi.clearEncryptionKey();
                setEncryptionEnabled(false);
                setVaultUiLocked(true);
            }
        }, 5_000);
        return () => {
            events.forEach((eventName) => window.removeEventListener(eventName, touch));
            window.clearInterval(interval);
        };
    }, [encryptionEnabled, setEncryptionEnabled, vaultUiLocked]);

    const { nextSyncIn } = useAutoSync(autoSyncInterval, handleSyncFolders);

    // Scheduled sync — respects WiFi-only setting
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen('scheduled-sync-request', async () => {
            const wifiOnly = localStorage.getItem('sharkdrive.wifiOnlySync.v1') === 'true';
            if (wifiOnly) {
                const isWifi = await tauriApi.isWifiConnected().catch(() => true);
                if (!isWifi) {
                    toast.info('Scheduled sync skipped — not on WiFi / LAN');
                    return;
                }
            }
            void syncFoldersRef.current();
        }).then((dispose) => { unlisten = dispose; });
        return () => unlisten?.();
    }, []);

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
            const result = queueUploadCandidatesRef.current([{ path, folderId: remote_folder_id, encrypt: shouldEncrypt, source: 'backup' }]);
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

    // Tray: "Upload File…" menu item
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen('tray-upload-file', () => {
            handleManualUploadRef.current();
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Remote wipe: check for wipe command in Saved Messages on connect
    useEffect(() => {
        if (!isConnected) return;
        tauriApi.checkRemoteWipe()
            .then(found => { if (found) setShowWipeConfirm(true); })
            .catch(() => {});
    }, [isConnected]);

    // Web companion: file uploaded from mobile phone
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen<{ path: string; filename: string; folderId: number | null }>(
            'web-upload-pending',
            event => {
                const { path, folderId } = event.payload;
                queueUploadCandidatesRef.current([{ path, folderId: folderId ?? activeFolderId }]);
                toast.info(`Mobile upload received: ${event.payload.filename}`);
            }
        ).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, [activeFolderId]);

    // Tray: "Sync Now" menu item
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen('tray-sync-now', () => {
            void syncFoldersRef.current();
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Startup args: protocol URL (sharkdrive://open/{id}) or file path from context menu
    useEffect(() => {
        tauriApi.getStartupArgs().then((arg) => {
            if (!arg) return;
            if (arg.startsWith('sharkdrive://open/')) {
                const rawId = arg.replace('sharkdrive://open/', '').split('?')[0];
                const folderId = parseInt(rawId, 10);
                if (!isNaN(folderId)) setActiveFolderId(folderId);
            } else if (arg.startsWith('sharkdrive://upload?')) {
                try {
                    const params = new URLSearchParams(arg.replace('sharkdrive://upload?', ''));
                    const path = params.get('path');
                    if (path) {
                        queueUploadCandidatesRef.current([{ path, folderId: activeFolderId }]);
                        toast.info(`Queued from Explorer: ${path.split(/[/\\]/).pop()}`);
                    }
                } catch { /* ignore malformed URL */ }
            } else if (arg.length > 2 && !arg.startsWith('-')) {
                // Raw file path (context menu fallback)
                queueUploadCandidatesRef.current([{ path: arg, folderId: activeFolderId }]);
                toast.info(`Queued from Explorer: ${arg.split(/[/\\]/).pop()}`);
            }
        }).catch(() => {});
    // Only run once on mount — args are consumed after first read
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // Instant: reads from local index, no Telegram call (used as initial data for paged hook)
    const { data: cachedFiles } = useQuery({
        queryKey: ['cached-files', activeFolderId],
        queryFn: () => tauriApi.getCachedFiles(activeFolderId).then(mapFileList),
        enabled: !!store && activeFolderId !== RECENT_FOLDER_ID,
        staleTime: Infinity,
        gcTime: 10 * 60 * 1000,
    });

    // Version counter — increment to trigger a page-1 reload from Telegram
    const [fileVersion, setFileVersion] = useState(0);
    const refreshFiles = useCallback(() => {
        // Capture pre-refresh state for sync history recording
        preSyncInfoRef.current = {
            folderId: activeFolderId,
            names: new Set(allFilesRef.current.filter(f => f.type !== 'folder').map(f => f.name)),
            startMs: Date.now(),
        };
        setFileVersion(v => v + 1);
        queryClient.invalidateQueries({ queryKey: ['cached-files', activeFolderId] });
        queryClient.invalidateQueries({ queryKey: ['all-indexed-files'] });
    }, [activeFolderId, queryClient]);

    // Paginated load from Telegram — shows cached instantly, loads real pages on demand
    const pagedFiles = usePagedFiles(
        activeFolderId,
        !!store && activeFolderId !== RECENT_FOLDER_ID && isConnected,
        cachedFiles ?? [],
        fileVersion,
    );
    const allFiles = pagedFiles.files;
    allFilesRef.current = allFiles;
    const isLoading = pagedFiles.isLoadingFirst && allFiles.length === 0;
    const error = pagedFiles.error ? new Error(pagedFiles.error) : null;

    const { data: allIndexedRaw = [] } = useQuery({
        queryKey: ['all-indexed-files'],
        queryFn: () => tauriApi.getAllIndexedFiles(),
        staleTime: 30 * 1000,
        gcTime: 5 * 60 * 1000,
        refetchInterval: 30 * 1000,
        refetchOnWindowFocus: false,
        enabled: !!store,
    });

    const reviewDueCleanupFiles = useCallback(async () => {
        if (cleanupReviewedRef.current) return;
        cleanupReviewedRef.current = true;
        try {
            const dueFiles = await tauriApi.getDueCleanupFiles();
            if (dueFiles.length === 0) return;
            const totalBytes = dueFiles.reduce((sum, file) => sum + file.size, 0);
            const approved = await confirm({
                title: 'Review cleanup candidates',
                message: `${dueFiles.length} remote file${dueFiles.length === 1 ? '' : 's'} (${formatBytes(totalBytes)}) match your cleanup rules.\nDelete them from SharkDrive and Telegram now?`,
                confirmText: `Delete ${dueFiles.length} file${dueFiles.length === 1 ? '' : 's'}`,
                cancelText: 'Keep files',
                variant: 'danger',
            });
            if (!approved) return;

            const secureDelete = localStorage.getItem('sharkdrive.secureDelete.v1') === 'true';
            for (const file of dueFiles) {
                await tauriApi.deleteFile(file.id, file.folder_id ?? null, secureDelete);
            }
            queryClient.invalidateQueries({ queryKey: ['files'] }); refreshFiles();
            queryClient.invalidateQueries({ queryKey: ['cached-files'] });
            queryClient.invalidateQueries({ queryKey: ['all-indexed-files'] });
            toast.success(`Deleted ${dueFiles.length} old file${dueFiles.length === 1 ? '' : 's'} after cleanup review.`);
        } catch (error) {
            toast.error(`Cleanup review failed: ${error}`);
        }
    }, [confirm, queryClient]);

    useEffect(() => {
        if (!store) return;
        void reviewDueCleanupFiles();
    }, [reviewDueCleanupFiles, store]);

    useEffect(() => {
        if (previousSyncingRef.current && !isSyncing) {
            cleanupReviewedRef.current = false;
            void reviewDueCleanupFiles();
        }
        previousSyncingRef.current = isSyncing;
    }, [isSyncing, reviewDueCleanupFiles]);

    const { collections: smartCollections, activeFiles: smartCollectionFiles } = useSmartCollections(
        allIndexedRaw,
        activeSmartCollectionId,
        organization.decorateFile,
    );

    const sourceFiles = activeSmartCollectionId
        ? smartCollectionFiles
        : activeFolderId === RECENT_FOLDER_ID
            ? recentFiles
            : allFiles;
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
        displayedFiles: searchedFiles,
        isSearching,
        resetSearch,
    } = useDashboardSearch({
        activeFolderId,
        sourceFiles: organizedSourceFiles,
        showFavoritesOnly,
        favoriteIds,
        searchCurrentFolderOnly,
        allowRemoteSearch: activeSmartCollectionId === null,
        folderNameResolver,
        handleGlobalSearch,
        decorateFile: organization.decorateFile,
    });

    const contentSearch = useContentSearch(
        searchTerm,
        allFiles,
        activeFolderId,
        contentSearchEnabled && searchTerm.length >= 3,
    );

    const displayedFiles = useMemo(() => (
        activeSmartCollectionId
            ? searchedFiles.filter((file) => matchesSmartCollection(file, activeSmartCollectionId))
            : searchedFiles
    ), [activeSmartCollectionId, searchedFiles]);

    const { data: bandwidth } = useQuery({
        queryKey: ['bandwidth'],
        queryFn: () => tauriApi.getBandwidth(),
        refetchInterval: 5000,
        enabled: !!store
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

    // Evict stale recent-file entries whenever the full index refreshes
    useEffect(() => {
        if (allIndexedRaw.length === 0) return;
        const keys = new Set(allIndexedRaw.map(f => `${f.folder_id ?? 'home'}:${f.id}`));
        pruneStaleRecent(keys);
    }, [allIndexedRaw, pruneStaleRecent]);

    const {
        handleDelete: _handleDeleteBase, handleBulkDelete, handleBulkMove, handleBulkCopy,
    } = useFileOperations(activeFolderId, selectedIds, setSelectedIds, displayedFiles);

    // Wrapper: after delete also purge from recent-files list
    const handleDelete = useCallback(async (file: TelegramFile) => {
        await _handleDeleteBase(file);
        removeFromRecent(file.id);
    }, [_handleDeleteBase, removeFromRecent]);

    const encryptByDefault = encryptionEnabled || (typeof activeFolderId === 'number' && activeFolderId > 0 && encryptedFolderIds.has(activeFolderId));
    const { uploadQueue, selectFilesOnly, handleManualUpload, handleFolderUpload, handleDroppedFiles, queueUploadCandidates, cancelAll: cancelUploads, cancelItem: cancelUploadItem, retryItem: retryUpload, clearFinished: clearUploads, forceUpload, skipDuplicate, duplicateItems, conflictItems, isDragging } = useFileUpload(activeFolderId, store, encryptByDefault, recordActivity, folderNameResolver, isConnected);
    const { downloadQueue, queueDownload, queueBulkDownload, clearFinished: clearDownloads, retryDownload, moveDownloadToFront, reorderDownloadQueue, cancelDownloadItem, cancelAll: cancelDownloads } = useFileDownload(store, recordActivity);
    handleDroppedFilesRef.current = handleDroppedFiles;
    queueUploadCandidatesRef.current = queueUploadCandidates;
    // Smart upload: show compression dialog for image files before queuing
    const handleManualUploadSmart = useCallback(async (encryptOverride?: boolean) => {
        const COMPRESS_PREF_KEY = 'sharkdrive.askCompress.v1';
        const askCompress = localStorage.getItem(COMPRESS_PREF_KEY) !== 'false';
        const paths = await selectFilesOnly();
        if (paths.length === 0) return;
        const imagePaths = askCompress
            ? paths.filter(p => isImageFile(p.split(/[/\\]/).pop() ?? p))
            : [];
        if (imagePaths.length > 0) {
            setPendingImagePaths(imagePaths);
            // non-image files go through immediately
            const others = paths.filter(p => !imagePaths.includes(p));
            if (others.length > 0) queueUploadCandidates(others.map(path => ({ path, encrypt: encryptOverride })));
        } else {
            const result = queueUploadCandidates(paths.map(path => ({ path, encrypt: encryptOverride })));
            if (result.queuedCount > 0) toast.info(`Queued ${result.queuedCount} file${result.queuedCount > 1 ? 's' : ''} for upload`);
        }
    }, [selectFilesOnly, queueUploadCandidates]);

    handleManualUploadRef.current = handleManualUploadSmart;

    const queuedUploadCount = uploadQueue.filter((item) => item.status === 'pending' || item.status === 'uploading').length;
    const uploadingCount = uploadQueue.filter((item) => item.status === 'uploading').length;
    const failedUploadCount = uploadQueue.filter((item) => item.status === 'error').length;
    const activeUploadBatchIds = new Set(uploadQueue
        .filter((item) => item.status === 'pending' || item.status === 'uploading')
        .map((item) => item.batchId || item.id));
    const activeUploadBatchItems = uploadQueue.filter((item) => activeUploadBatchIds.has(item.batchId || item.id));
    const uploadProgress = uploadingCount > 0 && activeUploadBatchItems.length > 0
        ? Math.round(activeUploadBatchItems
            .reduce((sum, item) => sum + (item.status === 'success' ? 100 : item.progress ?? 0), 0) / activeUploadBatchItems.length)
        : null;

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
    }, [activeFolderId, activeSmartCollectionId, resetPreviewState, resetSearch]);

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
        if (isTextPreviewFile(file.name) || isSvgFile(file.name)) {
            setTextPreviewFile(file);
        } else {
            handlePreview(file, orderedFiles);
        }
    };

    const handleExtractZip = async (file: TelegramFile) => {
        const folderId = resolveFileFolderId(file, activeFolderId);
        try {
            const destDir = await openDialog({ directory: true, multiple: false, title: 'Extract ZIP to folder' });
            if (!destDir) return;
            toast.info(`Extracting ${file.name}…`);
            const paths = await tauriApi.extractZip(file.id, folderId, destDir as string);
            toast.success(`Extracted ${paths.length} file${paths.length !== 1 ? 's' : ''} to ${(destDir as string).split(/[/\\]/).pop()}`);
        } catch (e) {
            toast.error(`Extraction failed: ${String(e)}`);
        }
    };

    // Collect all files in the current folder with the same filename — these are "versions"
    const handleVersionHistory = useCallback((file: TelegramFile) => {
        setVersionHistoryFile(file);
    }, []);

    const handleSwitchAccount = useCallback(async (accountId: string) => {
        if (isSwitchingAccount) return;
        setIsSwitchingAccount(true);
        try {
            await tauriApi.switchAccount(accountId);
            // Reconnect: get api_id from account meta
            const meta = accounts.find(a => a.id === accountId);
            if (meta?.api_id) {
                await tauriApi.connect(meta.api_id);
            }
            refreshFiles();
            await refreshAccounts();
        } catch (e) {
            toast.error(`Account switch failed: ${String(e)}`);
        } finally {
            setIsSwitchingAccount(false);
        }
    }, [isSwitchingAccount, accounts, refreshAccounts]);

    const handleAddAccount = useCallback(async () => {
        // Switch to auth screen for a new account slot
        setIsSwitchingAccount(true);
        try {
            await tauriApi.prepareNewAccount();
            // Trigger logout flow in the UI — the auth screen will appear
            onLogout();
        } catch (e) {
            toast.error(`Failed to prepare new account: ${String(e)}`);
            setIsSwitchingAccount(false);
        }
    }, [onLogout]);

    const handleCrossCopyAndSwitch = useCallback(async (tempPaths: string[], targetAccountId: string) => {
        setCrossCopyFiles(null);
        pendingUploadPathsRef.current = tempPaths;
        await handleSwitchAccount(targetAccountId);
        // After switch, queue the temp files for upload
        if (pendingUploadPathsRef.current.length > 0) {
            const paths = pendingUploadPathsRef.current;
            pendingUploadPathsRef.current = [];
            const result = queueUploadCandidates(paths.map(path => ({ path })));
            if (result.queuedCount > 0) {
                toast.success(`Queued ${result.queuedCount} file(s) for cross-account upload`);
            }
        }
    }, [handleSwitchAccount, queueUploadCandidates]);

    const handleExportActivity = useCallback(async (format: 'csv' | 'json') => {
        const ext = format === 'json' ? 'json' : 'csv';
        const savePath = await save({
            defaultPath: `sharkdrive-activity-${new Date().toISOString().slice(0, 10)}.${ext}`,
            filters: [{ name: format.toUpperCase(), extensions: [ext] }],
        });
        if (!savePath) return;
        try {
            await tauriApi.exportActivityLog(activity, format, savePath);
            toast.success(`Activity exported to ${savePath.split(/[/\\]/).pop()}`);
        } catch (e) {
            toast.error(`Export failed: ${String(e)}`);
        }
    }, [activity]);

    const handleDuplicate = async (file: TelegramFile) => {
        const folderId = resolveFileFolderId(file, activeFolderId);
        const dotIdx = file.name.lastIndexOf('.');
        const base = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
        const ext = dotIdx > 0 ? file.name.slice(dotIdx) : '';
        const newName = `${base} (2)${ext}`;
        try {
            await tauriApi.duplicateFile(file.id, folderId, newName);
            queryClient.invalidateQueries({ queryKey: ['files', folderId] });
            queryClient.invalidateQueries({ queryKey: ['cached-files', folderId] });
            refreshFiles();
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

    const handleBulkDownloadZip = useCallback(async () => {
        const filesToZip = selectedFiles.filter((file) => file.type !== 'folder');
        if (filesToZip.length === 0) return;
        const blocked = filesToZip.find((file) => !ensureEncryptionReady(file, 'download it'));
        if (blocked) return;

        const savePath = await save({
            defaultPath: `sharkdrive-${new Date().toISOString().slice(0, 10)}.zip`,
            filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
        });
        if (!savePath) return;

        try {
            await tauriApi.downloadFilesZip(
                filesToZip.map((file) => ({
                    messageId: file.id,
                    folderId: resolveFileFolderId(file, activeFolderId),
                    filename: file.name,
                })),
                savePath,
            );
            toast.success(`ZIP created with ${filesToZip.length} files`);
            recordActivity({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'download',
                message: `Exported ${filesToZip.length} files as ZIP`,
                timestamp: new Date().toISOString(),
                folderId: activeFolderId,
            });
        } catch (error) {
            toast.error(`ZIP download failed: ${error}`);
        }
    }, [activeFolderId, ensureEncryptionReady, recordActivity, selectedFiles]);

    const handleDownloadFolderTree = useCallback(async (rootFolderId: number) => {
        const rootFolder = folders.find(f => f.id === rootFolderId);
        if (!rootFolder) return;

        const basePath = await openDialog({ directory: true, multiple: false, title: 'Select Download Location' });
        if (!basePath) return;

        // Build folderId → relative path map by traversing hierarchy
        const pathMap = new Map<number, string>();
        const buildPaths = (folderId: number, relPath: string) => {
            pathMap.set(folderId, relPath);
            folders
                .filter(f => f.parent_id === folderId)
                .forEach(child => buildPaths(child.id, `${relPath}\\${child.name}`));
        };
        buildPaths(rootFolderId, rootFolder.name);

        // Find all files in these folders (using local index — no Telegram call)
        const filesToDownload = allIndexedRaw.filter(f =>
            f.folder_id != null && pathMap.has(f.folder_id) && f.icon_type !== 'folder'
        );

        if (filesToDownload.length === 0) {
            toast.info('No files found in this folder tree (index may be empty — sync first)');
            return;
        }

        for (const file of filesToDownload) {
            const relPath = pathMap.get(file.folder_id!)!;
            const savePath = `${basePath}\\${relPath}\\${file.name}`;
            queueDownload(file.id, file.name, file.folder_id ?? null, savePath);
        }

        toast.info(`Queued ${filesToDownload.length} file${filesToDownload.length !== 1 ? 's' : ''} with folder structure`);
    }, [allIndexedRaw, folders, queueDownload]);

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

    const rememberRename = useCallback((action: {
        type: 'file' | 'folder';
        id: number;
        folderId: number | null;
        oldName: string;
        newName: string;
    }) => {
        renameHistoryRef.current = [...renameHistoryRef.current.slice(-9), action];
    }, []);

    const undoLastRename = useCallback(async () => {
        const action = renameHistoryRef.current.pop();
        if (!action) {
            toast.info('No rename action to undo.');
            return;
        }

        try {
            if (action.type === 'folder') {
                await handleRenameFolder(action.id, action.oldName);
            } else {
                await tauriApi.renameFile(action.id, action.folderId, action.oldName);
                queryClient.invalidateQueries({ queryKey: ['files'] }); refreshFiles();
                queryClient.invalidateQueries({ queryKey: ['cached-files'] });
            }
            toast.success(`Restored "${action.oldName}"`);
        } catch (error) {
            renameHistoryRef.current.push(action);
            toast.error(`Undo rename failed: ${error}`);
        }
    }, [handleRenameFolder, queryClient]);

    const handleRename = async (newName: string) => {
        if (!renameTarget) return;
        if (renameTarget.type === 'folder') {
            await handleRenameFolder(renameTarget.id, newName);
            rememberRename({
                type: 'folder',
                id: renameTarget.id,
                folderId: null,
                oldName: renameTarget.name,
                newName,
            });
        } else {
            const folderId = resolveFileFolderId(renameTarget, activeFolderId);
            await tauriApi.renameFile(renameTarget.id, folderId, newName);
            queryClient.invalidateQueries({ queryKey: ['files'] }); refreshFiles();
            queryClient.invalidateQueries({ queryKey: ['cached-files'] });
            rememberRename({
                type: 'file',
                id: renameTarget.id,
                folderId,
                oldName: renameTarget.name,
                newName,
            });
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

    // ? key → shortcuts overlay
    useEffect(() => {
        const handle = (e: KeyboardEvent) => {
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                setShowShortcutsOverlay(v => !v);
            }
        };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, []);

    useEffect(() => {
        const handle = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
            event.preventDefault();
            void undoLastRename();
        };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [undoLastRename]);

    const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
        e.preventDefault();
        e.stopPropagation();

        const dataTransferFileId = e.dataTransfer.getData("application/x-telegram-file-id");

        const fileId = internalDragRef.current || (dataTransferFileId ? parseInt(dataTransferFileId) : null);

        if (fileId) {
            try {
                const idsToMove = selectedIds.includes(fileId) ? selectedIds : [fileId];
                const groupedByFolder = new Map<number | null, number[]>();
                for (const file of displayedFiles.filter((candidate) => idsToMove.includes(candidate.id))) {
                    const sourceFolderId = resolveFileFolderId(file, activeFolderId);
                    if (sourceFolderId === targetFolderId) continue;
                    groupedByFolder.set(sourceFolderId, [...(groupedByFolder.get(sourceFolderId) ?? []), file.id]);
                }
                if (groupedByFolder.size === 0) return;
                for (const [sourceFolderId, messageIds] of groupedByFolder) {
                    await tauriApi.moveFiles(messageIds, sourceFolderId, targetFolderId);
                }

                queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });
                queryClient.invalidateQueries({ queryKey: ['cached-files', activeFolderId] });
                refreshFiles();
                queryClient.invalidateQueries({ queryKey: ['all-indexed-files'] });

                if (selectedIds.includes(fileId)) setSelectedIds([]);

                toast.success(`Moved ${idsToMove.length} file(s).`);

                setInternalDragFileId(null);
            } catch {
                toast.error(`Failed to move file(s).`);
            }
        }
    };

    const handleNavigateToFolder = useCallback((folderId: number | null) => {
        setActiveSmartCollectionId(null);
        if (folderId === null || folderId === RECENT_FOLDER_ID) {
            setSearchCurrentFolderOnly(false);
        }
        setActiveFolderId(folderId);
    }, [setActiveFolderId]);

    const handleSelectSmartCollection = useCallback((collectionId: SmartCollectionId) => {
        setActiveFolderId(null);
        setActiveSmartCollectionId(collectionId);
        setActiveTagFilter(null);
        setSearchCurrentFolderOnly(false);
        void queryClient.invalidateQueries({ queryKey: ['all-indexed-files'] });
    }, [queryClient, setActiveFolderId]);

    const activeSmartCollection = smartCollections.find((collection) => collection.id === activeSmartCollectionId);
    const currentFolderName = activeSmartCollection?.label ?? (
        activeFolderId === null
            ? "Saved Messages"
            : activeFolderId === RECENT_FOLDER_ID
                ? "Recent"
                : folders.find(f => f.id === activeFolderId)?.name || "Folder"
    );

    currentFolderNameRef.current = currentFolderName;

    // Record sync session when a refresh completes — compare before/after file names
    useEffect(() => {
        if (pagedFiles.isLoadingFirst || !preSyncInfoRef.current) return;
        const info = preSyncInfoRef.current;
        if (info.folderId !== activeFolderId) { preSyncInfoRef.current = null; return; }
        const currentFileNames = new Set(allFiles.filter(f => f.type !== 'folder').map(f => f.name));
        const added = allFiles.filter(f => f.type !== 'folder' && !info.names.has(f.name)).map(f => f.name);
        const removed = [...info.names].filter(n => !currentFileNames.has(n));
        preSyncInfoRef.current = null;
        tauriApi.recordSyncSession({
            folderId: activeFolderId,
            folderName: currentFolderNameRef.current,
            startedAtMs: info.startMs,
            completedAtMs: Date.now(),
            filesTotal: allFiles.filter(f => f.type !== 'folder').length,
            filesAdded: added,
            filesRemoved: removed,
        }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pagedFiles.isLoadingFirst]);

    const folderPath = useMemo(() => {
        if (activeSmartCollection) {
            return [{ id: null, name: activeSmartCollection.label }];
        }
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
    }, [activeFolderId, activeSmartCollection, folders]);

    const handleInlineRename = useCallback(async (file: TelegramFile, newName: string) => {
        if (!newName.trim() || newName === file.name) return;
        if (file.type === 'folder') {
            await handleRenameFolder(file.id, newName);
            rememberRename({ type: 'folder', id: file.id, folderId: null, oldName: file.name, newName });
        } else {
            const folderId = resolveFileFolderId(file, activeFolderId);
            await tauriApi.renameFile(file.id, folderId, newName);
            queryClient.invalidateQueries({ queryKey: ['files'] }); refreshFiles();
            queryClient.invalidateQueries({ queryKey: ['cached-files'] });
            rememberRename({ type: 'file', id: file.id, folderId, oldName: file.name, newName });
            toast.success(`Renamed to "${newName}"`);
        }
    }, [activeFolderId, handleRenameFolder, queryClient, rememberRename]);

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
                        files={allIndexedRaw.filter((file) => file.icon_type !== 'folder')}
                        activity={activity}
                        shortcuts={organization.shortcuts}
                        onShortcutsChange={organization.setShortcuts}
                        onExportActivity={handleExportActivity}
                    />
                )}
                {showLinksDashboard && (
                    <ShareLinksDashboard
                        key="links-dashboard"
                        onClose={() => setShowLinksDashboard(false)}
                    />
                )}
                {showWebAccess && (
                    <WebAccessModal
                        key="web-access-modal"
                        onClose={() => setShowWebAccess(false)}
                    />
                )}

                {showWipeConfirm && (
                    <WipeConfirmModal
                        key="wipe-confirm-modal"
                        onCancel={() => setShowWipeConfirm(false)}
                        onConfirm={async () => { await tauriApi.executeWipe(); }}
                    />
                )}

                {showTotpSetup && (
                    <TotpSetupModal
                        key="totp-setup-modal"
                        onClose={() => setShowTotpSetup(false)}
                        onEnabled={() => setShowTotpSetup(false)}
                    />
                )}

                {exportKeyTarget && (
                    <ExportKeyModal
                        key="export-key-modal"
                        folderId={exportKeyTarget.id}
                        folderName={exportKeyTarget.name}
                        onClose={() => setExportKeyTarget(null)}
                    />
                )}

                {showSyncHistory && (
                    <SyncHistoryPanel
                        key="sync-history-panel"
                        onClose={() => setShowSyncHistory(false)}
                    />
                )}
                {showDuplicates && (
                    <DuplicatesPanel
                        key="duplicates-panel"
                        folders={folders.map(f => ({ id: f.id, name: f.name }))}
                        onClose={() => setShowDuplicates(false)}
                        onDeleted={refreshFiles}
                    />
                )}
                {crossCopyFiles && (
                    <CrossAccountCopyModal
                        key="cross-copy-modal"
                        files={crossCopyFiles}
                        activeFolderId={activeFolderId}
                        accounts={accounts}
                        activeAccountId={activeAccountId}
                        onClose={() => setCrossCopyFiles(null)}
                        onSwitchAndUpload={handleCrossCopyAndSwitch}
                    />
                )}

                {versionHistoryFile && (
                    <VersionHistoryModal
                        key="version-history-modal"
                        filename={versionHistoryFile.name}
                        folderId={resolveFileFolderId(versionHistoryFile, activeFolderId)}
                        versions={allFiles
                            .filter(f => f.type !== 'folder' && f.name.toLowerCase() === versionHistoryFile.name.toLowerCase())
                            .sort((a, b) => (b.id as number) - (a.id as number))}
                        onClose={() => setVersionHistoryFile(null)}
                        onRestored={refreshFiles}
                    />
                )}
                {showShortcutsOverlay && (
                    <KeyboardShortcutsOverlay
                        key="shortcuts-overlay"
                        shortcuts={organization.shortcuts}
                        onClose={() => setShowShortcutsOverlay(false)}
                    />
                )}
                {pendingImagePaths && (
                    <ImageCompressDialog
                        key="compress-dialog"
                        files={pendingImagePaths.map(p => ({ path: p, name: p.split(/[/\\]/).pop() ?? p, size: 0 }))}
                        onClose={() => setPendingImagePaths(null)}
                        onSkip={() => {
                            queueUploadCandidates(pendingImagePaths.map(path => ({ path })));
                            setPendingImagePaths(null);
                            toast.info(`Queued ${pendingImagePaths.length} image${pendingImagePaths.length !== 1 ? 's' : ''} for upload`);
                        }}
                        onConfirm={async (quality, maxDimension) => {
                            const paths = pendingImagePaths;
                            setPendingImagePaths(null);
                            toast.info('Compressing images…');
                            const results: string[] = [];
                            for (const p of paths) {
                                try {
                                    const compressed = await tauriApi.compressImage(p, quality, maxDimension);
                                    results.push(compressed);
                                } catch {
                                    results.push(p); // fallback to original
                                }
                            }
                            queueUploadCandidates(results.map(path => ({ path })));
                            toast.info(`Queued ${results.length} compressed image${results.length !== 1 ? 's' : ''}`);
                        }}
                    />
                )}
                {showOnboarding && (
                    <OnboardingWizard
                        key="onboarding-wizard"
                        onClose={() => setShowOnboarding(false)}
                        onCreateFolder={(name) => handleCreateFolder(name, null)}
                        onEncryptionEnabled={() => setEncryptionEnabled(true)}
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
                setActiveFolderId={handleNavigateToFolder}
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
                onViewFolderStats={setStatsFolderId}
                smartCollections={smartCollections}
                activeSmartCollectionId={activeSmartCollectionId}
                onSelectSmartCollection={handleSelectSmartCollection}
                encryptionUnlocked={encryptionEnabled}
                onLockVault={async () => {
                    await tauriApi.clearEncryptionKey();
                    setEncryptionEnabled(false);
                    setVaultUiLocked(true);
                    toast.info('Encryption vault locked');
                }}
                accounts={accounts}
                activeAccountId={activeAccountId}
                onSwitchAccount={handleSwitchAccount}
                onAddAccount={handleAddAccount}
                onAccountsChange={refreshAccounts}
            />
            {vaultUiLocked && (
                <VaultLockScreen
                    onUnlock={() => {
                        setEncryptionEnabled(true);
                        setVaultUiLocked(false);
                    }}
                />
            )}

            <main className="flex-1 flex flex-col bg-gradient-to-b from-white/[0.015] to-transparent" onClick={(e) => {
                if (e.target === e.currentTarget) {
                    setSelectedIds([]);
                    setSelectionMode(false);
                }
            }}>
                <TopBar
                    currentFolderName={currentFolderName}
                    folderPath={folderPath}
                    onNavigateTo={handleNavigateToFolder}
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
                    onBulkDownloadZip={handleBulkDownloadZip}
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
                    onDownloadFolderTree={activeFolderId !== null ? () => handleDownloadFolderTree(activeFolderId) : undefined}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onSearchCommit={commitSearchTerm}
                    recentSearches={recentSearches}
                    showFolderSearchScope={activeSmartCollectionId === null && activeFolderId !== null && activeFolderId !== RECENT_FOLDER_ID}
                    searchCurrentFolderOnly={searchCurrentFolderOnly}
                    onSearchCurrentFolderOnlyChange={setSearchCurrentFolderOnly}
                    showFavoritesOnly={showFavoritesOnly}
                    onToggleFavoritesFilter={() => setShowFavoritesOnly(v => !v)}
                    favoriteCount={favoriteIds.size}
                    contentSearchEnabled={contentSearchEnabled}
                    onToggleContentSearch={() => setContentSearchEnabled(v => !v)}
                    contentSearchScanning={contentSearch.scanning}
                    contentSearchMatchCount={contentSearch.matchingIds.size}
                    onFileUpload={handleManualUpload}
                    onEncryptedFileUpload={() => handleManualUpload(true)}
                    onFolderUpload={handleFolderUpload}
                    onOpenSettings={() => setShowSettings(true)}
                    onOpenLinks={() => setShowLinksDashboard(true)}
                    onOpenSyncHistory={() => setShowSyncHistory(true)}
                    onOpenDuplicates={() => setShowDuplicates(true)}
                    onOpenWebAccess={() => setShowWebAccess(true)}
                    nextSyncIn={autoSyncInterval > 0 ? nextSyncIn : null}
                    queuedUploadCount={queuedUploadCount}
                    uploadingCount={uploadingCount}
                    failedUploadCount={failedUploadCount}
                    uploadProgress={uploadProgress}
                    isDraggingFiles={isDragging}
                    isConnected={isConnected}
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
                        queueDownload(file.id, file.name, resolveFileFolderId(file, activeFolderId), undefined, undefined, file.sha256 ?? undefined);
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
                    onExtractZip={handleExtractZip}
                    onVersionHistory={handleVersionHistory}
                    onCopyToOtherAccount={accounts.length > 1 ? (file) => setCrossCopyFiles([file]) : undefined}
                    onBatchRename={(files) => setBatchRenameFiles(files)}
                    onInfo={(file) => setInfoFile(file)}
                    availableTags={organization.allTags}
                    activeTag={activeTagFilter}
                    onTagFilterChange={setActiveTagFilter}
                    getFolderColor={organization.getFolderColor}
                    getFileNote={(file) => organization.getFileNote(file, resolveFileFolderId(file, activeFolderId))}
                    onFileNoteChange={(file, note) => organization.setFileNote(file, resolveFileFolderId(file, activeFolderId), note)}
                    contentMatchIds={contentSearchEnabled ? contentSearch.matchingIds : undefined}
                    hasMore={pagedFiles.hasMore}
                    isLoadingMore={pagedFiles.isLoadingMore}
                    onLoadMore={pagedFiles.loadMore}
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

            {statsFolderId !== null && folders.find((folder) => folder.id === statsFolderId) && (
                <FolderStatsModal
                    folder={folders.find((folder) => folder.id === statsFolderId)!}
                    files={allIndexedRaw.filter((file) => file.icon_type !== 'folder' && file.folder_id === statsFolderId)}
                    onClose={() => setStatsFolderId(null)}
                />
            )}

            {duplicateItems.length > 0 && (
                <DuplicateDialog
                    item={duplicateItems[0]}
                    onForceUpload={forceUpload}
                    onSkip={skipDuplicate}
                />
            )}

            {conflictItems.length > 0 && (
                <BackupConflictDialog
                    item={conflictItems[0]}
                    onUploadVersion={forceUpload}
                    onKeepTelegram={skipDuplicate}
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
                        onOpenTextPreview={(file) => {
                            setPreviewFile(null);
                            setTextPreviewFile(file);
                        }}
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
                        onMoveToFront={moveDownloadToFront}
                        onReorder={reorderDownloadQueue}
                        onCancelItem={cancelDownloadItem}
                    />
                </div>
            </div>
        </div>
    );
}
