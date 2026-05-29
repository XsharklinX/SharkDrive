import { useState } from 'react';
import { ChevronRight, Copy, FolderOpen, HardDrive, Link2, Moon, Plus, Search, Settings, Star, Sun, Trash2, X, MoveRight, Download, CheckSquare } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface TopBarProps {
    currentFolderName: string;
    folderPath: { id: number | null; name: string }[];
    onNavigateTo: (id: number | null) => void;
    selectedIds: number[];
    selectionMode: boolean;
    onToggleSelectionMode: () => void;
    onShowMoveModal: () => void;
    onShowCopyModal: () => void;
    onBulkShare: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onDownloadFolder: () => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    onSearchCommit: (term: string) => void;
    recentSearches: string[];
    showFavoritesOnly: boolean;
    onToggleFavoritesFilter: () => void;
    favoriteCount: number;
    onFileUpload: () => void;
    onEncryptedFileUpload: () => void;
    onFolderUpload: () => void;
    onOpenSettings: () => void;
    nextSyncIn?: number | null;
    queuedUploadCount: number;
    uploadingCount: number;
    failedUploadCount: number;
    isDraggingFiles: boolean;
}

export function TopBar({
    currentFolderName,
    folderPath,
    onNavigateTo,
    selectedIds,
    selectionMode,
    onToggleSelectionMode,
    onShowMoveModal,
    onShowCopyModal,
    onBulkShare,
    onBulkDownload,
    onBulkDelete,
    onDownloadFolder,
    searchTerm,
    onSearchChange,
    onSearchCommit,
    recentSearches,
    showFavoritesOnly,
    onToggleFavoritesFilter,
    favoriteCount,
    onFileUpload,
    onEncryptedFileUpload,
    onFolderUpload,
    onOpenSettings,
    nextSyncIn,
    queuedUploadCount,
    uploadingCount,
    failedUploadCount,
    isDraggingFiles,
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();
    const [searchFocused, setSearchFocused] = useState(false);
    const hasQueuedUploads = queuedUploadCount > 0;
    const showRecentSearches = searchFocused && recentSearches.length > 0;
    const shouldShowTransferHint = isDraggingFiles || hasQueuedUploads || failedUploadCount > 0;
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
                    {folderPath.length > 1 ? (
                        <nav className="flex min-w-0 items-center gap-0.5 overflow-hidden">
                            {folderPath.map((segment, i) => {
                                const isLast = i === folderPath.length - 1;
                                return (
                                    <span key={segment.id ?? 'root'} className="flex min-w-0 items-center gap-0.5">
                                        {i > 0 && <ChevronRight className="h-4 w-4 flex-shrink-0 text-telegram-subtext/40" />}
                                        {isLast ? (
                                            <span className="truncate text-[1.3rem] font-semibold tracking-tight text-telegram-text">{segment.name}</span>
                                        ) : (
                                            <button
                                                onClick={() => onNavigateTo(segment.id)}
                                                className="min-w-0 truncate text-sm text-telegram-subtext transition hover:text-telegram-text"
                                            >
                                                {segment.name}
                                            </button>
                                        )}
                                    </span>
                                );
                            })}
                        </nav>
                    ) : (
                        <h1 className="truncate text-[1.5rem] font-semibold tracking-tight text-telegram-text">{currentFolderName}</h1>
                    )}
                    {shouldShowTransferHint && (
                        <p className={`mt-1 text-xs ${failedUploadCount > 0 ? 'text-amber-200' : 'text-telegram-subtext'}`}>
                            {transferStatusLabel}
                        </p>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        onClick={onToggleFavoritesFilter}
                        className={`relative rounded-lg border px-2.5 py-2 text-sm transition ${showFavoritesOnly ? 'border-yellow-300/35 bg-yellow-300/10 text-yellow-200' : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'}`}
                        title={showFavoritesOnly ? 'Show all files' : 'Show starred only'}
                    >
                        <span className="flex items-center gap-2">
                            <Star className={`h-4 w-4 ${showFavoritesOnly ? 'fill-yellow-300' : ''}`} />
                            <span className="hidden sm:inline">Starred</span>
                        </span>
                        {favoriteCount > 0 && !showFavoritesOnly && (
                            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-300 px-1 text-[10px] font-bold text-black">
                                {favoriteCount > 9 ? '9+' : favoriteCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={toggleTheme}
                        className="rounded-lg border border-telegram-border px-2.5 py-2 text-telegram-subtext transition hover:text-telegram-text"
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>

                    <button
                        onClick={onOpenSettings}
                        className="relative rounded-lg border border-telegram-border px-2.5 py-2 text-telegram-subtext transition hover:text-telegram-text"
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
                <div className="relative min-w-[18rem] flex-1">
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
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') onSearchCommit(searchTerm);
                            }}
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
                    {showRecentSearches && (
                        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 rounded-lg border border-telegram-border bg-telegram-surface p-1.5 shadow-2xl">
                            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-telegram-subtext">Recent searches</div>
                            {recentSearches.map((term) => (
                                <button
                                    key={term}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        onSearchChange(term);
                                        onSearchCommit(term);
                                        setSearchFocused(false);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text"
                                >
                                    <Search className="h-3.5 w-3.5" />
                                    <span className="truncate">{term}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                        onClick={onToggleSelectionMode}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${
                            selectionMode
                                ? 'border-telegram-primary/30 bg-telegram-primary/10 text-telegram-primary'
                                : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'
                        }`}
                        title={selectionMode ? 'Exit selection mode' : 'Select multiple files'}
                    >
                        <span className="flex items-center gap-2">
                            <CheckSquare className="h-4 w-4" />
                            {selectionMode ? 'Done' : 'Select'}
                        </span>
                    </button>

                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-1.5 rounded-lg border border-telegram-primary/20 bg-telegram-primary/[0.06] px-2 py-1.5">
                            <span className="px-1.5 text-xs font-medium text-telegram-text">{selectedIds.length} selected</span>
                            <button onClick={onShowMoveModal} className="rounded-md bg-telegram-primary/15 px-2.5 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22" title="Move selected">
                                <span className="flex items-center gap-1.5"><MoveRight className="h-3 w-3" />Move</span>
                            </button>
                            <button onClick={onShowCopyModal} className="rounded-md bg-telegram-primary/15 px-2.5 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22" title="Copy selected">
                                <span className="flex items-center gap-1.5"><Copy className="h-3 w-3" />Copy</span>
                            </button>
                            <button onClick={onBulkShare} className="rounded-md bg-telegram-primary/15 px-2.5 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22" title="Share selected">
                                <span className="flex items-center gap-1.5"><Link2 className="h-3 w-3" />Share All</span>
                            </button>
                            <button onClick={onBulkDownload} className="rounded-md border border-telegram-border px-2.5 py-1.5 text-xs text-telegram-text transition hover:bg-white/[0.04]" title="Download selected">
                                <span className="flex items-center gap-1.5"><Download className="h-3 w-3" />Download</span>
                            </button>
                            <button onClick={onBulkDelete} className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 transition hover:bg-red-500/18" title="Delete selected">
                                <span className="flex items-center gap-1.5"><Trash2 className="h-3 w-3" />Delete</span>
                            </button>
                        </div>
                    )}

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
                    <button onClick={onEncryptedFileUpload} className="rounded-lg border border-yellow-300/25 px-3 py-2 text-sm text-yellow-200 transition hover:bg-yellow-300/10" title="Add encrypted files">
                        <span className="flex items-center gap-2">
                            <ShieldIcon />
                            Add Encrypted
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
                </div>
            </div>
        </header>
    );
}

function ShieldIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l7 3v5c0 5-3.2 8.4-7 10-3.8-1.6-7-5-7-10V6l7-3z" />
        </svg>
    );
}
