import { useEffect, useRef, useState, type ElementType } from 'react';
import {
    CheckSquare,
    ChevronRight,
    Cloud,
    Copy,
    Download,
    FolderOpen,
    GitFork,
    HardDrive,
    Link2,
    Moon,
    MoreHorizontal,
    MoveRight,
    Package,
    Plus,
    RefreshCw,
    Search,
    Settings,
    Smartphone,
    Star,
    Sun,
    Trash2,
    X,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';

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
    onBulkDownloadZip: () => void;
    onBulkDelete: () => void;
    onDownloadFolder: () => void;
    onDownloadFolderTree?: () => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    onSearchCommit: (term: string) => void;
    recentSearches: string[];
    showFolderSearchScope?: boolean;
    searchCurrentFolderOnly: boolean;
    onSearchCurrentFolderOnlyChange: (enabled: boolean) => void;
    contentSearchEnabled?: boolean;
    onToggleContentSearch?: () => void;
    contentSearchScanning?: boolean;
    contentSearchMatchCount?: number;
    showFavoritesOnly: boolean;
    onToggleFavoritesFilter: () => void;
    favoriteCount: number;
    onFileUpload: () => void;
    onEncryptedFileUpload: () => void;
    onFolderUpload: () => void;
    onOpenSettings: () => void;
    onOpenLinks?: () => void;
    onOpenSyncHistory?: () => void;
    onOpenDuplicates?: () => void;
    onOpenWebAccess?: () => void;
    onOpenVault?: () => void;
    onOpenConfigExport?: () => void;
    onOpenCloudImport?: () => void;
    nextSyncIn?: number | null;
    queuedUploadCount: number;
    uploadingCount: number;
    failedUploadCount: number;
    uploadProgress?: number | null;
    isDraggingFiles: boolean;
    isConnected?: boolean;
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
    onBulkDownloadZip,
    onBulkDelete,
    onDownloadFolder,
    onDownloadFolderTree,
    searchTerm,
    onSearchChange,
    onSearchCommit,
    recentSearches,
    showFolderSearchScope = false,
    searchCurrentFolderOnly,
    onSearchCurrentFolderOnlyChange,
    contentSearchEnabled = false,
    onToggleContentSearch,
    contentSearchScanning = false,
    contentSearchMatchCount = 0,
    showFavoritesOnly,
    onToggleFavoritesFilter,
    favoriteCount,
    onFileUpload,
    onEncryptedFileUpload,
    onFolderUpload,
    onOpenSettings,
    onOpenLinks,
    onOpenSyncHistory,
    onOpenDuplicates,
    onOpenWebAccess,
    onOpenVault,
    onOpenConfigExport,
    onOpenCloudImport,
    nextSyncIn,
    queuedUploadCount,
    uploadingCount,
    failedUploadCount,
    uploadProgress,
    isDraggingFiles,
    isConnected = true,
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();
    const { lang, t } = useLanguage();
    const [searchFocused, setSearchFocused] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const advancedMenuRef = useRef<HTMLDivElement>(null);

    const hasQueuedUploads = queuedUploadCount > 0;
    const showRecentSearches = searchFocused && recentSearches.length > 0;
    const shouldShowTransferHint = isDraggingFiles || hasQueuedUploads || failedUploadCount > 0;
    const hasAdvancedTools = !!(
        onOpenLinks ||
        onOpenSyncHistory ||
        onOpenDuplicates ||
        onOpenWebAccess ||
        onOpenVault ||
        onOpenCloudImport ||
        onOpenConfigExport ||
        onToggleContentSearch ||
        showFolderSearchScope ||
        onDownloadFolderTree ||
        onEncryptedFileUpload
    );

    const transferStatusLabel = isDraggingFiles
        ? (lang === 'es' ? 'Arrastra archivos para subir' : 'Drop files to upload')
        : uploadingCount > 0
            ? (lang === 'es' ? `${uploadingCount} subiendo` : `${uploadingCount} uploading`)
            : failedUploadCount > 0
                ? (lang === 'es' ? `${failedUploadCount} requieren atencion` : `${failedUploadCount} need attention`)
                : (lang === 'es' ? `${queuedUploadCount} en cola` : `${queuedUploadCount} queued`);

    useEffect(() => {
        if (!advancedOpen) return;
        const close = (event: PointerEvent) => {
            if (advancedMenuRef.current?.contains(event.target as Node)) return;
            setAdvancedOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setAdvancedOpen(false);
        };
        document.addEventListener('pointerdown', close, true);
        window.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', close, true);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [advancedOpen]);

    const runAdvancedAction = (action: () => void) => {
        action();
        setAdvancedOpen(false);
    };

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
                                            <span className="inline-flex truncate text-[1.3rem] font-semibold tracking-tight text-telegram-text">
                                                {segment.name}
                                            </span>
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
                        <h1 className="truncate text-[1.45rem] font-semibold tracking-tight text-telegram-text">{currentFolderName}</h1>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-telegram-subtext">
                        {!isConnected && (
                            <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-semibold text-red-300">
                                {lang === 'es' ? 'Sin conexion' : 'Offline'}
                            </span>
                        )}
                        {shouldShowTransferHint && (
                            <span className={failedUploadCount > 0 ? 'text-amber-200' : ''}>
                                {transferStatusLabel}{uploadProgress != null && uploadingCount > 0 ? ` | ${uploadProgress}%` : ''}
                            </span>
                        )}
                    </div>
                    {uploadProgress != null && uploadingCount > 0 && (
                        <div className="mt-1 h-1 max-w-56 overflow-hidden rounded-full bg-telegram-border">
                            <div className="h-full rounded-full bg-telegram-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        onClick={onToggleFavoritesFilter}
                        className={`relative rounded-lg border px-2.5 py-2 text-sm transition ${showFavoritesOnly ? 'border-yellow-300/35 bg-yellow-300/10 text-yellow-200' : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'}`}
                        title={showFavoritesOnly ? (lang === 'es' ? 'Mostrar todos' : 'Show all files') : (lang === 'es' ? 'Mostrar destacados' : 'Show starred only')}
                    >
                        <span className="flex items-center gap-2">
                            <Star className={`h-4 w-4 ${showFavoritesOnly ? 'fill-yellow-300' : ''}`} />
                            <span className="hidden sm:inline">{t('starred')}</span>
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
                        title={theme === 'dark' ? (lang === 'es' ? 'Cambiar a modo claro' : 'Switch to Light Mode') : (lang === 'es' ? 'Cambiar a modo oscuro' : 'Switch to Dark Mode')}
                        aria-label={theme === 'dark' ? (lang === 'es' ? 'Cambiar a modo claro' : 'Switch to Light Mode') : (lang === 'es' ? 'Cambiar a modo oscuro' : 'Switch to Dark Mode')}
                    >
                        {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
                    </button>

                    <button
                        onClick={onOpenSettings}
                        className="relative rounded-lg border border-telegram-border px-2.5 py-2 text-telegram-subtext transition hover:text-telegram-text"
                        title={t('settings')}
                        aria-label={t('settings')}
                    >
                        <Settings className="h-4 w-4" aria-hidden="true" />
                        {nextSyncIn !== null && nextSyncIn !== undefined && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-telegram-primary px-1 text-[9px] font-bold text-black">
                                {nextSyncIn}
                            </span>
                        )}
                    </button>

                    {hasAdvancedTools && (
                        <div className="relative" ref={advancedMenuRef}>
                            <button
                                onClick={() => setAdvancedOpen((open) => !open)}
                                className={`rounded-lg border px-2.5 py-2 transition ${advancedOpen ? 'border-telegram-primary/30 bg-telegram-primary/10 text-telegram-primary' : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'}`}
                                title={lang === 'es' ? 'Mas opciones' : 'More options'}
                                aria-label={lang === 'es' ? 'Mas opciones' : 'More options'}
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {advancedOpen && (
                                <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-64 rounded-xl border border-telegram-border bg-telegram-surface p-2 shadow-2xl">
                                    <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-telegram-subtext">
                                        {lang === 'es' ? 'Mas opciones' : 'More options'}
                                    </div>
                                    <MenuButton icon={ShieldIcon} label={lang === 'es' ? 'Subir cifrado' : 'Upload encrypted'} onClick={() => runAdvancedAction(onEncryptedFileUpload)} />
                                    {onDownloadFolderTree && <MenuButton icon={HardDrive} label={t('withSubfolders')} onClick={() => runAdvancedAction(onDownloadFolderTree)} />}
                                    {onOpenLinks && <MenuButton icon={Link2} label={lang === 'es' ? 'Enlaces compartidos' : 'Share links'} onClick={() => runAdvancedAction(onOpenLinks)} />}
                                    {onOpenSyncHistory && <MenuButton icon={RefreshCw} label={lang === 'es' ? 'Historial de sync' : 'Sync history'} onClick={() => runAdvancedAction(onOpenSyncHistory)} />}
                                    {onOpenDuplicates && <MenuButton icon={GitFork} label={lang === 'es' ? 'Buscar duplicados' : 'Find duplicates'} onClick={() => runAdvancedAction(onOpenDuplicates)} />}
                                    {onOpenWebAccess && <MenuButton icon={Smartphone} label={lang === 'es' ? 'Acceso movil' : 'Mobile access'} onClick={() => runAdvancedAction(onOpenWebAccess)} />}
                                    {onOpenVault && <MenuButton icon={HardDrive} label={lang === 'es' ? 'Resumen y manifest' : 'Vault summary and manifest'} onClick={() => runAdvancedAction(onOpenVault)} />}
                                    {onOpenCloudImport && <MenuButton icon={Cloud} label={lang === 'es' ? 'Importar desde nube' : 'Import from cloud'} onClick={() => runAdvancedAction(onOpenCloudImport)} />}
                                    {onOpenConfigExport && <MenuButton icon={Package} label={lang === 'es' ? 'Exportar configuracion' : 'Export configuration'} onClick={() => runAdvancedAction(onOpenConfigExport)} />}
                                    {(showFolderSearchScope || onToggleContentSearch) && (
                                        <div className="mt-2 border-t border-telegram-border/70 pt-2">
                                            {showFolderSearchScope && (
                                                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text">
                                                    <input
                                                        type="checkbox"
                                                        checked={searchCurrentFolderOnly}
                                                        onChange={(event) => onSearchCurrentFolderOnlyChange(event.target.checked)}
                                                        className="accent-telegram-primary"
                                                    />
                                                    {t('searchOnlyThisFolder')}
                                                </label>
                                            )}
                                            {onToggleContentSearch && (
                                                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text">
                                                    <input
                                                        type="checkbox"
                                                        checked={contentSearchEnabled}
                                                        onChange={onToggleContentSearch}
                                                        className="accent-telegram-primary"
                                                    />
                                                    <span className="flex items-center gap-1.5">
                                                        {lang === 'es' ? 'Buscar en contenido' : 'Search content'}
                                                        {contentSearchScanning && <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-telegram-primary/40 border-t-telegram-primary" />}
                                                        {!contentSearchScanning && contentSearchEnabled && contentSearchMatchCount > 0 && (
                                                            <span className="rounded-full bg-telegram-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-telegram-primary">{contentSearchMatchCount}</span>
                                                        )}
                                                    </span>
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[18rem] flex-1">
                    <div className="flex items-center gap-3 rounded-lg border border-telegram-border bg-black/10 px-4 py-2.5">
                        <Search className="h-4 w-4 shrink-0 text-telegram-subtext" />
                        <input
                            type="text"
                            placeholder={t('searchPlaceholder')}
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
                                title={lang === 'es' ? 'Limpiar busqueda' : 'Clear search'}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {showRecentSearches && (
                        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 rounded-lg border border-telegram-border bg-telegram-surface p-1.5 shadow-2xl">
                            <div className="px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-telegram-subtext">{lang === 'es' ? 'Busquedas recientes' : 'Recent searches'}</div>
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
                        title={selectionMode ? (lang === 'es' ? 'Salir de seleccion' : 'Exit selection mode') : (lang === 'es' ? 'Seleccionar multiples archivos' : 'Select multiple files')}
                    >
                        <span className="flex items-center gap-2">
                            <CheckSquare className="h-4 w-4" />
                            {selectionMode ? (lang === 'es' ? 'Listo' : 'Done') : t('select')}
                        </span>
                    </button>

                    {selectedIds.length > 0 && (
                        <div className="flex items-center gap-1.5 rounded-lg border border-telegram-primary/20 bg-telegram-primary/[0.06] px-2 py-1.5">
                            <span className="px-1.5 text-xs font-medium text-telegram-text">
                                {t('selectedCount').replace('{count}', String(selectedIds.length))}
                            </span>
                            <button onClick={onShowMoveModal} className="rounded-md bg-telegram-primary/15 px-2.5 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22" title={lang === 'es' ? 'Mover seleccionados' : 'Move selected'}>
                                <span className="flex items-center gap-1.5"><MoveRight className="h-3 w-3" />{t('move')}</span>
                            </button>
                            <button onClick={onShowCopyModal} className="rounded-md bg-telegram-primary/15 px-2.5 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22" title={lang === 'es' ? 'Copiar seleccionados' : 'Copy selected'}>
                                <span className="flex items-center gap-1.5"><Copy className="h-3 w-3" />{t('copy')}</span>
                            </button>
                            <button onClick={onBulkShare} className="rounded-md bg-telegram-primary/15 px-2.5 py-1.5 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/22" title={lang === 'es' ? 'Compartir seleccionados' : 'Share selected'}>
                                <span className="flex items-center gap-1.5"><Link2 className="h-3 w-3" />{t('shareAll')}</span>
                            </button>
                            <button onClick={onBulkDownload} className="rounded-md border border-telegram-border px-2.5 py-1.5 text-xs text-telegram-text transition hover:bg-white/[0.04]" title={lang === 'es' ? 'Descargar seleccionados' : 'Download selected'}>
                                <span className="flex items-center gap-1.5"><Download className="h-3 w-3" />{t('bulkDownload')}</span>
                            </button>
                            {selectedIds.length > 1 && (
                                <button onClick={onBulkDownloadZip} className="rounded-md border border-telegram-border px-2.5 py-1.5 text-xs text-telegram-text transition hover:bg-white/[0.04]" title={lang === 'es' ? 'Descargar seleccionados como ZIP' : 'Download selected as ZIP'}>
                                    <span className="flex items-center gap-1.5"><HardDrive className="h-3 w-3" />{t('zip')}</span>
                                </button>
                            )}
                            <button onClick={onBulkDelete} className="rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 transition hover:bg-red-500/18" title={lang === 'es' ? 'Eliminar seleccionados' : 'Delete selected'}>
                                <span className="flex items-center gap-1.5"><Trash2 className="h-3 w-3" />{t('bulkDelete')}</span>
                            </button>
                        </div>
                    )}

                    <button onClick={onFileUpload} className="rounded-lg bg-telegram-primary px-3 py-2 text-sm font-semibold text-black transition hover:opacity-90" title={t('addFiles')}>
                        <span className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            {t('addFiles')}
                            {hasQueuedUploads && (
                                <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-black">{queuedUploadCount}</span>
                            )}
                        </span>
                    </button>
                    <button onClick={onFolderUpload} className="rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:text-telegram-text" title={t('uploadFolder')}>
                        <span className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4" />
                            {t('uploadFolder')}
                        </span>
                    </button>
                    <button onClick={onDownloadFolder} className="rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:text-telegram-text" title={lang === 'es' ? 'Descargar esta carpeta' : 'Download this folder'}>
                        <span className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4" />
                            {t('downloadAll')}
                        </span>
                    </button>
                </div>
            </div>
        </header>
    );
}

function MenuButton({ icon: Icon, label, onClick }: { icon: ElementType; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text"
        >
            <Icon className="h-4 w-4" />
            <span className="truncate">{label}</span>
        </button>
    );
}

function ShieldIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l7 3v5c0 5-3.2 8.4-7 10-3.8-1.6-7-5-7-10V6l7-3z" />
        </svg>
    );
}
