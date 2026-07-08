import { useState, useRef } from 'react';
import { Activity, BarChart2, ChevronDown, Clock, FileText, Folder, HardDrive, Image, Lock, LogOut, Plus, RefreshCw, Sparkles, Star, Tag, Video } from 'lucide-react';
import { AccountSwitcher } from './AccountSwitcher';
import { useLanguage } from '../../context/LanguageContext';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { AccountMeta, ActivityEntry, BandwidthStats, TelegramFolder } from '../../types';
import { formatBytes } from '../../utils';
import type { SmartCollection, SmartCollectionId, SmartCollectionKind } from '../../hooks/useSmartCollections';

function timeAgo(isoTimestamp: string, lang: 'en' | 'es'): string {
    const diff = Date.now() - new Date(isoTimestamp).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return lang === 'es' ? 'ahora' : 'just now';
    if (minutes < 60) return lang === 'es' ? `hace ${minutes} min` : `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return lang === 'es' ? `hace ${hours} h` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return lang === 'es' ? `hace ${days} d` : `${days}d ago`;
}

export const RECENT_FOLDER_ID = -1;

interface SidebarProps {
    folders: TelegramFolder[];
    activeFolderId: number | null;
    setActiveFolderId: (id: number | null) => void;
    onDrop: (e: React.DragEvent, folderId: number | null) => void;
    onDelete: (id: number, name: string) => void;
    onRenameFolder?: (id: number, name: string) => void;
    onShareFolder?: (id: number, name: string) => void;
    onToggleEncryption?: (id: number) => void;
    encryptedFolderIds?: Set<number>;
    onCreate: (name: string, parentId?: number | null) => Promise<void>;
    onSetFolderParent?: (folderId: number, parentId: number | null) => Promise<void>;
    isSyncing: boolean;
    isConnected: boolean;
    isConnecting?: boolean;
    onSync: () => void;
    onLogout: () => void;
    bandwidth: BandwidthStats | null;
    recentCount?: number;
    starredCount?: number;
    showFavoritesOnly?: boolean;
    onToggleStarred?: () => void;
    folderFileCounts?: Record<number, number>;
    onMoveFolderTo?: (folderId: number) => void;
    activity?: ActivityEntry[];
    vaultBadge?: { fileCount: number; totalBytes: number };
    onOpenVault?: () => void;
    pinnedFolderIds?: number[];
    getFolderColor?: (folderId: number) => string | undefined;
    onTogglePinnedFolder?: (folderId: number) => void;
    onSetFolderColor?: (folderId: number, color: string | null) => void;
    onViewFolderStats?: (folderId: number) => void;
    smartCollections?: SmartCollection[];
    activeSmartCollectionId?: SmartCollectionId | null;
    onSelectSmartCollection?: (collectionId: SmartCollectionId) => void;
    encryptionUnlocked?: boolean;
    onLockVault?: () => void;
    accounts?: AccountMeta[];
    activeAccountId?: string | null;
    onSwitchAccount?: (id: string) => void;
    onAddAccount?: () => void;
    onAccountsChange?: () => void;
}

export function Sidebar({
    folders,
    activeFolderId,
    setActiveFolderId,
    onDrop,
    onDelete,
    onRenameFolder,
    onShareFolder,
    onToggleEncryption,
    encryptedFolderIds = new Set(),
    onCreate,
    onSetFolderParent,
    isSyncing,
    isConnected,
    isConnecting = false,
    onSync,
    onLogout,
    bandwidth,
    recentCount = 0,
    starredCount = 0,
    showFavoritesOnly = false,
    onToggleStarred,
    folderFileCounts = {},
    onMoveFolderTo,
    activity = [],
    vaultBadge,
    onOpenVault,
    pinnedFolderIds = [],
    getFolderColor,
    onTogglePinnedFolder,
    onSetFolderColor,
    onViewFolderStats,
    smartCollections = [],
    activeSmartCollectionId = null,
    onSelectSmartCollection,
    encryptionUnlocked = false,
    onLockVault,
    accounts = [],
    activeAccountId = null,
    onSwitchAccount,
    onAddAccount,
    onAccountsChange,
}: SidebarProps) {
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [createParentId, setCreateParentId] = useState<number | null>(null);
    const [showActivity, setShowActivity] = useState(false);
    const [showSmartFolders, setShowSmartFolders] = useState(true);
    const { lang, t } = useLanguage();

    const selectedFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;
    const createTargetParentId = createParentId ?? (selectedFolder ? selectedFolder.id : null);

    const submitCreate = async () => {
        if (!newFolderName.trim()) return;
        try {
            await onCreate(newFolderName, createTargetParentId);
            setNewFolderName('');
            setShowNewFolderInput(false);
            setCreateParentId(null);
        } catch {
            // handled by parent
        }
    };

    const folderIds = new Set(folders.map((folder) => folder.id));
    const childrenByParent = folders.reduce<Record<string, number[]>>((groups, folder) => {
        const parentId = folder.parent_id && folderIds.has(folder.parent_id) ? folder.parent_id : null;
        const key = parentId === null ? 'root' : String(parentId);
        groups[key] = groups[key] ? [...groups[key], folder.id] : [folder.id];
        return groups;
    }, {});
    const groupedFolders = folders.reduce<Record<string, TelegramFolder[]>>((groups, folder) => {
        const normalizedParent = folder.parent_id && folderIds.has(folder.parent_id) ? folder.parent_id : null;
        const key = normalizedParent === null ? 'root' : String(normalizedParent);
        groups[key] = groups[key] ? [...groups[key], folder] : [folder];
        return groups;
    }, {});

    const isDescendant = (folderId: number, potentialParentId: number | null): boolean => {
        if (potentialParentId === null) return false;
        if (folderId === potentialParentId) return true;

        const descendants = [...(childrenByParent[String(folderId)] ?? [])];
        while (descendants.length > 0) {
            const current = descendants.pop()!;
            if (current === potentialParentId) return true;
            descendants.push(...(childrenByParent[String(current)] ?? []));
        }

        return false;
    };

    const handleFolderDrop = async (draggedFolderId: number, targetParentId: number | null) => {
        if (!onSetFolderParent) return;
        if (draggedFolderId === targetParentId) return;
        if (isDescendant(draggedFolderId, targetParentId)) return;
        await onSetFolderParent(draggedFolderId, targetParentId);
    };

    const pinnedSet = new Set(pinnedFolderIds);

    const sortFolders = (items: TelegramFolder[]) => [...items].sort((a, b) => {
        const pinDiff = Number(pinnedSet.has(b.id)) - Number(pinnedSet.has(a.id));
        if (pinDiff !== 0) return pinDiff;
        return a.name.localeCompare(b.name);
    });

    const renderFolderTree = (parentId: number | null, depth = 0, rootPinnedFilter?: boolean): React.ReactNode => {
        const key = parentId === null ? 'root' : String(parentId);
        const items = sortFolders(groupedFolders[key] ?? []).filter((folder) => (
            parentId !== null || rootPinnedFilter === undefined || pinnedSet.has(folder.id) === rootPinnedFilter
        ));

        return items.map((folder) => (
            <div key={folder.id}>
                <SidebarItem
                    icon={Folder}
                    label={folder.name}
                    active={activeFolderId === folder.id}
                    onClick={() => setActiveFolderId(folder.id)}
                    onDrop={(e: React.DragEvent) => onDrop(e, folder.id)}
                    onFolderDrop={(e, targetParentId) => {
                        const draggedFolderId = Number(e.dataTransfer.getData('application/x-sharkdrive-folder-id'));
                        if (!Number.isNaN(draggedFolderId)) {
                            void handleFolderDrop(draggedFolderId, targetParentId);
                        }
                    }}
                    onDelete={() => onDelete(folder.id, folder.name)}
                    onRename={onRenameFolder ? () => onRenameFolder(folder.id, folder.name) : undefined}
                    onShareLink={onShareFolder ? () => onShareFolder(folder.id, folder.name) : undefined}
                    onToggleEncryption={onToggleEncryption ? () => onToggleEncryption(folder.id) : undefined}
                    onCreateChild={() => {
                        setCreateParentId(folder.id);
                        setShowNewFolderInput(true);
                    }}
                    onMoveToRoot={depth > 0 ? () => void handleFolderDrop(folder.id, null) : undefined}
                    onMoveFolderTo={onMoveFolderTo ? () => onMoveFolderTo(folder.id) : undefined}
                    isEncrypted={encryptedFolderIds.has(folder.id)}
                    folderId={folder.id}
                    depth={depth}
                    draggableFolderId={folder.id}
                    fileCount={folderFileCounts[folder.id]}
                    folderColor={getFolderColor?.(folder.id)}
                    isPinned={pinnedSet.has(folder.id)}
                    onTogglePinned={onTogglePinnedFolder ? () => onTogglePinnedFolder(folder.id) : undefined}
                    onSetFolderColor={onSetFolderColor ? (color) => onSetFolderColor(folder.id, color) : undefined}
                    onViewStats={onViewFolderStats ? () => onViewFolderStats(folder.id) : undefined}
                />
                {renderFolderTree(folder.id, depth + 1)}
            </div>
        ));
    };

    const rootPinnedCount = (groupedFolders.root ?? []).filter((folder) => pinnedSet.has(folder.id)).length;
    const rootNormalCount = (groupedFolders.root ?? []).length - rootPinnedCount;
    const visibleSmartCollections = smartCollections.filter((collection) => collection.count > 0 || collection.kind !== 'tag');

    const smartCollectionLabel = (collection: SmartCollection) => {
        if (collection.id === 'images') return lang === 'es' ? 'Imágenes' : 'Images';
        if (collection.id === 'videos') return lang === 'es' ? 'Videos' : 'Videos';
        if (collection.id === 'documents') return lang === 'es' ? 'Documentos' : 'Documents';
        if (collection.id === 'large') return lang === 'es' ? 'Grandes' : 'Large files';
        if (collection.id === 'recent-7d') return lang === 'es' ? 'Últimos 7 días' : 'Last 7 days';
        if (collection.id.startsWith('tag:')) return `${lang === 'es' ? 'Etiqueta' : 'Tag'}: ${collection.id.slice(4)}`;
        return collection.label;
    };

    // ── Drag-to-resize ────────────────────────────────────────────────────────
    const SIDEBAR_WIDTH_KEY = 'sharkdrive.sidebarWidth.v1';
    const MIN_W = 180;
    const MAX_W = 320;
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? '256', 10);
        return isNaN(saved) ? 256 : Math.min(MAX_W, Math.max(MIN_W, saved));
    });
    const isResizing = useRef(false);
    const handleResizeMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        const startX = e.clientX;
        const startW = sidebarWidth;
        const onMove = (ev: MouseEvent) => {
            if (!isResizing.current) return;
            const next = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX));
            setSidebarWidth(next);
        };
        const onUp = () => {
            isResizing.current = false;
            setSidebarWidth(w => { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w)); return w; });
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <aside
            className="vault-sidebar relative flex flex-col border-r border-telegram-border/80 text-telegram-text"
            style={{ width: sidebarWidth, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Resize handle */}
            <div
                className="absolute inset-y-0 right-0 z-50 w-1 cursor-col-resize hover:bg-telegram-primary/40 transition-colors"
                onMouseDown={handleResizeMouseDown}
            />
            <div className="border-b border-telegram-border/70 px-4 py-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.svg" className="h-7 w-7" alt="Logo" />
                        <div>
                            <span className="block text-lg font-semibold tracking-tight text-telegram-text">SharkDrive</span>
                            {vaultBadge && vaultBadge.fileCount > 0 ? (
                                <span className="block text-xs text-telegram-subtext">
                                    {vaultBadge.fileCount.toLocaleString()} files · {formatBytes(vaultBadge.totalBytes)}
                                </span>
                            ) : (
                                <span className="block text-xs text-telegram-subtext">{lang === 'es' ? 'Drive personal en Telegram' : 'Personal Telegram drive'}</span>
                            )}
                        </div>
                    </div>
                    {onOpenVault && (
                        <button
                            onClick={onOpenVault}
                            title={lang === 'es' ? 'Resumen del drive' : 'Drive dashboard'}
                            className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-primary"
                        >
                            <BarChart2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-telegram-subtext">
                    <div className={`h-2 w-2 rounded-full ${
                        isConnected ? 'bg-emerald-400'
                        : isConnecting ? 'bg-amber-400 animate-pulse'
                        : 'bg-red-500 animate-pulse'
                    }`} />
                    <span className={
                        isConnected ? '' : isConnecting ? 'text-amber-400' : 'text-red-400 font-semibold'
                    }>
                        {isConnected ? 'Connected to Telegram' : isConnecting ? 'Reconnecting…' : 'Offline Mode'}
                    </span>
                </div>
            </div>

            {/* Account switcher — shown when multiple accounts exist or onAddAccount is provided */}
            {(accounts.length > 0 || onAddAccount) && onSwitchAccount && onAddAccount && (
                <div className="border-b border-telegram-border/70 px-3 py-2">
                    <AccountSwitcher
                        accounts={accounts}
                        activeAccountId={activeAccountId}
                        onSwitch={onSwitchAccount}
                        onAddAccount={onAddAccount}
                        onAccountsChange={onAccountsChange ?? (() => {})}
                    />
                </div>
            )}

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
                <SidebarItem
                    icon={HardDrive}
                    label={t('savedMessages')}
                    active={activeFolderId === null}
                    onClick={() => setActiveFolderId(null)}
                    onDrop={(e: React.DragEvent) => onDrop(e, null)}
                    onFolderDrop={(e) => {
                        const draggedFolderId = Number(e.dataTransfer.getData('application/x-sharkdrive-folder-id'));
                        if (!Number.isNaN(draggedFolderId)) {
                            void handleFolderDrop(draggedFolderId, null);
                        }
                    }}
                    folderId={null}
                />
                <SidebarItem
                    icon={Clock}
                    label={`${t('recent')}${recentCount > 0 ? ` (${recentCount})` : ''}`}
                    active={activeFolderId === RECENT_FOLDER_ID}
                    onClick={() => setActiveFolderId(RECENT_FOLDER_ID)}
                    onDrop={() => {}}
                    folderId={null}
                />
                {onToggleStarred && (
                    <SidebarItem
                        icon={Star}
                        label={`${t('starred')}${starredCount > 0 ? ` (${starredCount})` : ''}`}
                        active={showFavoritesOnly}
                        onClick={onToggleStarred}
                        onDrop={() => {}}
                        folderId={null}
                    />
                )}
                {visibleSmartCollections.length > 0 && onSelectSmartCollection && (
                    <div className="mt-3">
                        <button
                            onClick={() => setShowSmartFolders((visible) => !visible)}
                            className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-telegram-subtext transition hover:text-telegram-text"
                        >
                            <span className="flex items-center gap-1.5"><Sparkles className="h-3 w-3" />{t('smartFolders')}</span>
                            <ChevronDown className={`h-3 w-3 transition-transform ${showSmartFolders ? 'rotate-180' : ''}`} />
                        </button>
                        {showSmartFolders && (
                            <div className="space-y-0.5">
                                <p className="px-3 pb-1 text-[10px] leading-4 text-telegram-subtext/75">
                                    {lang === 'es' ? 'Filtros locales, no crean carpetas en Telegram.' : 'Local filters, no Telegram folders created.'}
                                </p>
                                {visibleSmartCollections.map((collection) => (
                                    <SidebarItem
                                        key={collection.id}
                                        icon={smartCollectionIcons[collection.kind]}
                                        label={smartCollectionLabel(collection)}
                                        active={activeSmartCollectionId === collection.id}
                                        onClick={() => onSelectSmartCollection(collection.id)}
                                        onDrop={() => {}}
                                        folderId={null}
                                        fileCount={collection.count}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {rootPinnedCount > 0 && (
                    <>
                        <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-telegram-subtext">{lang === 'es' ? 'Fijadas' : 'Pinned'}</div>
                        {renderFolderTree(null, 0, true)}
                    </>
                )}
                {rootNormalCount > 0 && (
                    <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-telegram-subtext">{lang === 'es' ? 'Carpetas' : 'Folders'}</div>
                )}
                {renderFolderTree(null, 0, rootPinnedCount > 0 ? false : undefined)}

                {activity.length > 0 && (
                    <div className="mt-4">
                        <button
                            onClick={() => setShowActivity((v) => !v)}
                            className="flex w-full items-center justify-between px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-telegram-subtext hover:text-telegram-text transition-colors"
                        >
                            <span className="flex items-center gap-1.5">
                                <Activity className="h-3 w-3" />
                                {t('activity')}
                            </span>
                            <ChevronDown className={`h-3 w-3 transition-transform ${showActivity ? 'rotate-180' : ''}`} />
                        </button>
                        {showActivity && (
                            <div className="mt-1 space-y-px">
                                {activity.slice(0, 8).map((entry) => (
                                    <div key={entry.id} className="flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-white/[0.03]">
                                        <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-telegram-primary/60" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs text-telegram-text/80">{entry.message}</p>
                                            <p className="text-[10px] text-telegram-subtext">{timeAgo(entry.timestamp, lang)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </nav>

            <div className="border-t border-telegram-border/70 px-3 py-3">
                {showNewFolderInput ? (
                    <div className="px-1 pb-3">
                        <input
                            autoFocus
                            type="text"
                            className="w-full rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-sm text-telegram-text focus:outline-none focus:ring-1 focus:ring-telegram-primary"
                            placeholder={createTargetParentId ? (lang === 'es' ? 'Nombre de subcarpeta' : 'New subfolder name') : (lang === 'es' ? 'Nombre de carpeta' : 'New folder name')}
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
                            onBlur={() => {
                                if (!newFolderName) {
                                    setShowNewFolderInput(false);
                                    setCreateParentId(null);
                                }
                            }}
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => {
                            setCreateParentId(selectedFolder ? selectedFolder.id : null);
                            setShowNewFolderInput(true);
                        }}
                        className="mb-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-telegram-border px-3 py-2.5 text-sm text-telegram-subtext transition hover:bg-telegram-hover hover:text-telegram-text"
                    >
                        <Plus className="h-4 w-4" />
                        {selectedFolder ? t('createSubfolder') : t('createFolder')}
                    </button>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={onSync}
                        disabled={isSyncing}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${isSyncing ? 'cursor-not-allowed bg-telegram-hover text-telegram-subtext opacity-60' : 'bg-telegram-primary/12 text-telegram-primary hover:bg-telegram-primary/20'}`}
                        title={lang === 'es' ? 'Buscar carpetas existentes' : 'Scan for existing folders'}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? (lang === 'es' ? 'Sincronizando' : 'Syncing') : t('sync')}
                        </span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex-1 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                        title={lang === 'es' ? 'Cerrar sesion' : 'Sign out'}
                    >
                        <span className="flex items-center justify-center gap-2">
                            <LogOut className="h-3.5 w-3.5" />
                            {lang === 'es' ? 'Salir' : 'Logout'}
                        </span>
                    </button>
                </div>

                {onLockVault && (
                    <button
                        onClick={onLockVault}
                        disabled={!encryptionUnlocked}
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text disabled:cursor-not-allowed disabled:opacity-45"
                        title="Clear the in-memory encryption key without logging out of Telegram"
                    >
                        <Lock className="h-3.5 w-3.5" />
                        {encryptionUnlocked ? 'Lock Vault' : 'Vault Locked'}
                    </button>
                )}

                {bandwidth && <BandwidthWidget bandwidth={bandwidth} />}
            </div>
        </aside>
    );
}

const smartCollectionIcons: Record<SmartCollectionKind, React.ElementType> = {
    images: Image,
    videos: Video,
    documents: FileText,
    large: HardDrive,
    recent: Clock,
    tag: Tag,
};
