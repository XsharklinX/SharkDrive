import { useState } from 'react';
import { Activity, BarChart2, ChevronDown, Clock, Folder, HardDrive, Lock, LogOut, Plus, RefreshCw, Star } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { ActivityEntry, BandwidthStats, TelegramFolder } from '../../types';
import { formatBytes } from '../../utils';

function timeAgo(isoTimestamp: string): string {
    const diff = Date.now() - new Date(isoTimestamp).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
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
    encryptionUnlocked?: boolean;
    onLockVault?: () => void;
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
    encryptionUnlocked = false,
    onLockVault,
}: SidebarProps) {
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [createParentId, setCreateParentId] = useState<number | null>(null);
    const [showActivity, setShowActivity] = useState(false);

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
                />
                {renderFolderTree(folder.id, depth + 1)}
            </div>
        ));
    };

    const rootPinnedCount = (groupedFolders.root ?? []).filter((folder) => pinnedSet.has(folder.id)).length;
    const rootNormalCount = (groupedFolders.root ?? []).length - rootPinnedCount;

    return (
        <aside className="vault-sidebar flex w-64 flex-col border-r border-telegram-border/80 text-telegram-text" onClick={(e) => e.stopPropagation()}>
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
                                <span className="block text-xs text-telegram-subtext">Telegram cloud drive</span>
                            )}
                        </div>
                    </div>
                    {onOpenVault && (
                        <button
                            onClick={onOpenVault}
                            title="Vault Dashboard"
                            className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-primary"
                        >
                            <BarChart2 className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-telegram-subtext">
                    <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span>{isConnected ? 'Connected to Telegram' : 'Disconnected'}</span>
                </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
                <SidebarItem
                    icon={HardDrive}
                    label="Saved Messages"
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
                    label={`Recent${recentCount > 0 ? ` (${recentCount})` : ''}`}
                    active={activeFolderId === RECENT_FOLDER_ID}
                    onClick={() => setActiveFolderId(RECENT_FOLDER_ID)}
                    onDrop={() => {}}
                    folderId={null}
                />
                {onToggleStarred && (
                    <SidebarItem
                        icon={Star}
                        label={`Starred${starredCount > 0 ? ` (${starredCount})` : ''}`}
                        active={showFavoritesOnly}
                        onClick={onToggleStarred}
                        onDrop={() => {}}
                        folderId={null}
                    />
                )}
                {rootPinnedCount > 0 && (
                    <>
                        <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-telegram-subtext">Pinned</div>
                        {renderFolderTree(null, 0, true)}
                    </>
                )}
                {rootNormalCount > 0 && (
                    <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-telegram-subtext">Folders</div>
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
                                Activity
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
                                            <p className="text-[10px] text-telegram-subtext">{timeAgo(entry.timestamp)}</p>
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
                            placeholder={createTargetParentId ? 'New subfolder name' : 'New folder name'}
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
                        {selectedFolder ? 'Create Subfolder' : 'Create Folder'}
                    </button>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={onSync}
                        disabled={isSyncing}
                        className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${isSyncing ? 'cursor-not-allowed bg-telegram-hover text-telegram-subtext opacity-60' : 'bg-telegram-primary/12 text-telegram-primary hover:bg-telegram-primary/20'}`}
                        title="Scan for existing folders"
                    >
                        <span className="flex items-center justify-center gap-2">
                            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            {isSyncing ? 'Syncing' : 'Sync'}
                        </span>
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex-1 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                        title="Sign Out"
                    >
                        <span className="flex items-center justify-center gap-2">
                            <LogOut className="h-3.5 w-3.5" />
                            Logout
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
