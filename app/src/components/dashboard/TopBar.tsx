import { HardDrive, LayoutGrid, List, Image, Sun, Moon, Star, FolderOpen, Trash2, RotateCcw, Settings } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

type ViewMode = 'grid' | 'list' | 'gallery';

interface TopBarProps {
    currentFolderName: string;
    selectedIds: number[];
    onShowMoveModal: () => void;
    onBulkDownload: () => void;
    onBulkDelete: () => void;
    onDownloadFolder: () => void;
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    showFavoritesOnly: boolean;
    onToggleFavoritesFilter: () => void;
    favoriteCount: number;
    onFolderUpload: () => void;
    isTrashFolder: boolean;
    onRestoreSelected: () => void;
    onEmptyTrash: () => void;
    onOpenSettings: () => void;
    nextSyncIn?: number | null;
}

export function TopBar({
    currentFolderName, selectedIds, onShowMoveModal, onBulkDownload, onBulkDelete,
    onDownloadFolder, viewMode, setViewMode, searchTerm, onSearchChange,
    showFavoritesOnly, onToggleFavoritesFilter, favoriteCount,
    onFolderUpload, isTrashFolder, onRestoreSelected, onEmptyTrash,
    onOpenSettings, nextSyncIn
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();

    const cycleView = () => {
        if (viewMode === 'grid') setViewMode('list');
        else if (viewMode === 'list') setViewMode('gallery');
        else setViewMode('grid');
    };

    const viewIcon = viewMode === 'grid' ? <LayoutGrid className="w-5 h-5" /> : viewMode === 'list' ? <List className="w-5 h-5" /> : <Image className="w-5 h-5" />;
    const viewLabel = viewMode === 'grid' ? 'Grid → List → Gallery' : viewMode === 'list' ? 'List → Gallery → Grid' : 'Gallery → Grid → List';

    return (
        <header className="h-14 border-b border-telegram-border flex items-center px-4 justify-between bg-telegram-surface/80 backdrop-blur-md sticky top-0 z-10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4">
                <div className="flex items-center text-sm breadcrumbs text-telegram-subtext select-none">
                    <span className="hover:text-telegram-text cursor-pointer transition-colors">Start</span>
                    <span className="mx-2">/</span>
                    <span className="text-telegram-text font-medium">{currentFolderName}</span>
                </div>
            </div>

            <div className="flex-1 max-w-md mx-4">
                <input
                    type="text"
                    placeholder="Search files... try type:image ext:pdf encrypted:true"
                    className="w-full bg-telegram-hover border border-telegram-border rounded-lg px-3 py-1.5 text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none focus:border-telegram-primary/50 transition-colors"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                    <div className="flex items-center gap-2 mr-4 animate-in fade-in slide-in-from-top-2">
                        <span className="text-xs text-telegram-subtext mr-2">{selectedIds.length} Selected</span>
                        {isTrashFolder ? (
                            <button onClick={onRestoreSelected} className="flex items-center gap-1.5 px-3 py-1.5 bg-telegram-primary/20 hover:bg-telegram-primary/30 text-telegram-primary rounded-md text-xs transition font-medium">
                                <RotateCcw className="w-3 h-3" />Restore
                            </button>
                        ) : (
                            <>
                                <button onClick={onShowMoveModal} className="px-3 py-1.5 bg-telegram-primary/20 hover:bg-telegram-primary/30 text-telegram-primary rounded-md text-xs transition font-medium">Move to...</button>
                                <button onClick={onBulkDownload} className="px-3 py-1.5 bg-telegram-hover hover:bg-telegram-border rounded-md text-xs text-telegram-text transition">Download</button>
                                <button onClick={onBulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-xs transition">
                                    <Trash2 className="w-3 h-3" />Delete
                                </button>
                            </>
                        )}
                    </div>
                )}
                {isTrashFolder && (
                    <button
                        onClick={onEmptyTrash}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md text-xs transition font-medium mr-2"
                    >
                        <Trash2 className="w-3 h-3" />Empty Trash
                    </button>
                )}

                <button
                    onClick={onToggleFavoritesFilter}
                    className={`p-2 rounded-md transition relative group ${showFavoritesOnly ? 'text-yellow-400 bg-yellow-400/10' : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'}`}
                    title={showFavoritesOnly ? 'Show all files' : 'Show starred only'}
                >
                    <Star className={`w-5 h-5 ${showFavoritesOnly ? 'fill-yellow-400' : ''}`} />
                    {favoriteCount > 0 && !showFavoritesOnly && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 text-black text-[9px] font-bold rounded-full flex items-center justify-center">{favoriteCount > 9 ? '9+' : favoriteCount}</span>
                    )}
                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {showFavoritesOnly ? 'Show all' : 'Starred files'}
                    </span>
                </button>

                {!isTrashFolder && (
                    <>
                        <button onClick={onFolderUpload} className="p-2 hover:bg-telegram-hover rounded-md text-telegram-subtext hover:text-telegram-text transition group relative" title="Upload Folder">
                            <FolderOpen className="w-5 h-5" />
                            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                Upload Folder
                            </span>
                        </button>
                        <button onClick={onDownloadFolder} className="p-2 hover:bg-telegram-hover rounded-md text-telegram-subtext hover:text-telegram-text transition group relative" title="Download Folder">
                            <HardDrive className="w-5 h-5" />
                            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                Download All Files
                            </span>
                        </button>
                    </>
                )}

                <button
                    onClick={cycleView}
                    className="p-2 hover:bg-telegram-hover rounded-md text-telegram-subtext hover:text-telegram-text transition relative group"
                    title="Toggle Layout"
                >
                    {viewIcon}
                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {viewLabel}
                    </span>
                </button>

                <div className="w-px h-6 bg-telegram-border mx-1"></div>

                <button
                    onClick={toggleTheme}
                    className="p-2 hover:bg-telegram-hover rounded-md text-telegram-subtext hover:text-telegram-text transition relative group"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                </button>

                <button
                    onClick={onOpenSettings}
                    className="p-2 hover:bg-telegram-hover rounded-md text-telegram-subtext hover:text-telegram-text transition relative group"
                    title="Settings"
                >
                    <Settings className="w-5 h-5" />
                    {nextSyncIn !== null && nextSyncIn !== undefined && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-telegram-primary rounded-full flex items-center justify-center">
                            <span className="text-[7px] font-bold text-white leading-none">{nextSyncIn}</span>
                        </span>
                    )}
                </button>
            </div>
        </header>
    )
}
