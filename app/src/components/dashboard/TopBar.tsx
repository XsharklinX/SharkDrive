import { FolderOpen, HardDrive, Moon, Plus, RotateCcw, Search, Settings, Star, Sun, Trash2, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface TopBarProps {
    currentFolderName: string;
    selectedIds: number[];
    selectionMode: boolean;
    onToggleSelectionMode: () => void;
    onShowMoveModal: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onDownloadFolder: () => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    showFavoritesOnly: boolean;
    onToggleFavoritesFilter: () => void;
    favoriteCount: number;
    onFileUpload: () => void;
    onFolderUpload: () => void;
    isTrashFolder: boolean;
    onRestoreSelected: () => void;
    onEmptyTrash: () => void;
    onOpenSettings: () => void;
    nextSyncIn?: number | null;
    queuedUploadCount: number;
    uploadingCount: number;
    failedUploadCount: number;
    isDraggingFiles: boolean;
}

export function TopBar({
    currentFolderName,
    selectedIds,
    selectionMode,
    onToggleSelectionMode,
    onShowMoveModal,
    onBulkDownload,
    onBulkDelete,
    onDownloadFolder,
    searchTerm,
    onSearchChange,
    showFavoritesOnly,
    onToggleFavoritesFilter,
    favoriteCount,
    onFileUpload,
    onFolderUpload,
    isTrashFolder,
    onRestoreSelected,
    onEmptyTrash,
    onOpenSettings,
    nextSyncIn,
    queuedUploadCount,
    uploadingCount,
    failedUploadCount,
    isDraggingFiles,
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();
    const hasQueuedUploads = queuedUploadCount > 0;
    const shouldShowTransferHint = !isTrashFolder && (isDraggingFiles || hasQueuedUploads || failedUploadCount > 0);
    const transferStatusLabel = isDraggingFiles
        ? 'Drop files to upload'
        : uploadingCount > 0
            ? `${uploadingCount} uploading`
            : failedUploadCount > 0
                ? `${failedUploadCount} need attention`
                : `${queuedUploadCount} queued`;

    return (
        <header className="sticky top-0 z-10 border-b border-telegram-border/80 bg-telegram-bg/95 px-5 py-3 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-[1.5rem] font-semibold tracking-tight text-telegram-text">{currentFolderName}</h1>
                    {shouldShowTransferHint && (
                        <p className={`mt-1 text-xs ${failedUploadCount > 0 ? 'text-amber-200' : 'text-telegram-subtext'}`}>
                            {transferStatusLabel}
                        </p>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={onToggleFavoritesFilter}
                        className={`relative rounded-lg border px-3 py-2 text-sm transition ${showFavoritesOnly ? 'border-yellow-300/35 bg-yellow-300/10 text-yellow-200' : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'}`}
                        title={showFavoritesOnly ? 'Show all files' : 'Show starred only'}
                    >
                        <span className="flex items-center gap-2">
                            <Star className={`h-4 w-4 ${showFavoritesOnly ? 'fill-yellow-300' : ''}`} />
                            Starred
                        </span>
                        {favoriteCount > 0 && !showFavoritesOnly && (
                            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-300 px-1 text-[10px] font-bold text-black">
                                {favoriteCount > 9 ? '9+' : favoriteCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={toggleTheme}
                        className="rounded-lg border border-telegram-border px-3 py-2 text-telegram-subtext transition hover:text-telegram-text"
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>

                    <button
                        onClick={onOpenSettings}
                        className="relative rounded-lg border border-telegram-border px-3 py-2 text-telegram-subtext transition hover:text-telegram-text"
                        title="Settings"
                    >
                        <Settings className="h-4 w-4" />
                        {nextSyncIn !== null && nextSyncIn !== undefined && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-telegram-primary px-1 text-[9px] font-bold text-black">
                                {nextSyncIn}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="min-w-[18rem] flex-1">
                    <div className="flex items-center gap-3 rounded-lg border border-telegram-border bg-black/10 px-4 py-2.5">
                        <Search className="h-4 w-4 shrink-0 text-telegram-subtext" />
                        <input
                            type="text"
                            placeholder="Search files and folders"
                            data-vault-search="true"
                            className="w-full bg-transparent text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none"
                            value={searchTerm}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) => onSearchChange(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => onSearchChange('')}
                                className="rounded-md p-1 text-telegram-subtext transition hover:text-telegram-text"
                                title="Clear search"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {!isTrashFolder && (
                        <button
                            onClick={onToggleSelectionMode}
                            className={`rounded-lg border px-3 py-2 text-sm transition ${
                                selectionMode
                                    ? 'border-telegram-primary/30 bg-telegram-primary/10 text-telegram-primary'
                                    : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'
                            }`}
                            title={selectionMode ? 'Exit selection mode' : 'Select multiple files'}
                        >
                            {selectionMode ? 'Done' : 'Select'}
                        </button>
                    )}

                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-2 rounded-lg border border-telegram-border px-3 py-2">
                            <span className="text-xs text-telegram-subtext">{selectedIds.length} selected</span>
                            {isTrashFolder ? (
                                <button onClick={onRestoreSelected} className="rounded-md bg-telegram-primary/15 px-3 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22">
                                    <span className="flex items-center gap-1.5">
                                        <RotateCcw className="h-3 w-3" />
                                        Restore
                                    </span>
                                </button>
                            ) : (
                                <>
                                    <button onClick={onShowMoveModal} className="rounded-md bg-telegram-primary/15 px-3 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22">
                                        Move
                                    </button>
                                    <button onClick={onBulkDownload} className="rounded-md border border-telegram-border px-3 py-1.5 text-xs text-telegram-text transition hover:bg-white/[0.04]">
                                        Download
                                    </button>
                                    <button onClick={onBulkDelete} className="rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/18">
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {isTrashFolder && (
                        <button onClick={onEmptyTrash} className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/18">
                            <span className="flex items-center gap-2">
                                <Trash2 className="h-4 w-4" />
                                Empty Trash
                            </span>
                        </button>
                    )}

                    {!isTrashFolder && (
                        <>
                            <button onClick={onFileUpload} className="rounded-lg bg-telegram-primary px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90" title="Add Files">
                                <span className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add Files
                                    {hasQueuedUploads && (
                                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-black">
                                            {queuedUploadCount}
                                        </span>
                                    )}
                                </span>
                            </button>
                            <button onClick={onFolderUpload} className="rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:text-telegram-text" title="Upload Folder">
                                <span className="flex items-center gap-2">
                                    <FolderOpen className="h-4 w-4" />
                                    Upload Folder
                                </span>
                            </button>
                            <button onClick={onDownloadFolder} className="rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:text-telegram-text" title="Download Folder">
                                <span className="flex items-center gap-2">
                                    <HardDrive className="h-4 w-4" />
                                    Download All
                                </span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
