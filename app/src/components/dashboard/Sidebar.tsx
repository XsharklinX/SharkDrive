import { useState } from 'react';
import { Clock, Folder, HardDrive, LogOut, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { BandwidthStats, TelegramFolder } from '../../types';

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
    trashFolderId: number | null;
    trashedFolders?: { id: number; name: string }[];
    onRestoreFolder?: (id: number, name: string) => void;
    recentCount?: number;
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
    trashFolderId,
    trashedFolders = [],
    onRestoreFolder,
    recentCount = 0,
}: SidebarProps) {
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [createParentId, setCreateParentId] = useState<number | null>(null);

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

    const renderFolderTree = (parentId: number | null, depth = 0): React.ReactNode => {
        const key = parentId === null ? 'root' : String(parentId);
        const items = [...(groupedFolders[key] ?? [])].sort((a, b) => a.name.localeCompare(b.name));

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
                    isEncrypted={encryptedFolderIds.has(folder.id)}
                    folderId={folder.id}
                    depth={depth}
                    draggableFolderId={folder.id}
                />
                {renderFolderTree(folder.id, depth + 1)}
            </div>
        ));
    };

    return (
        <aside className="vault-sidebar flex w-64 flex-col border-r border-telegram-border/80 text-telegram-text" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-telegram-border/70 px-4 py-5">
                <div className="flex items-center gap-3">
                    <img src="/logo.svg" className="h-7 w-7" alt="Logo" />
                    <div>
                        <span className="block text-lg font-semibold tracking-tight text-telegram-text">SharkDrive</span>
                        <span className="block text-xs text-telegram-subtext">Telegram cloud drive</span>
                    </div>
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
                    onClick={() => setActiveFolderId(RECENT_FOLDER_ID as unknown as null)}
                    onDrop={() => {}}
                    folderId={null}
                />
                {trashFolderId !== null && (
                    <>
                        <SidebarItem
                            icon={Trash2}
                            label={`Trash${trashedFolders.length > 0 ? ` (${trashedFolders.length})` : ''}`}
                            active={activeFolderId === trashFolderId}
                            onClick={() => setActiveFolderId(trashFolderId)}
                            onDrop={(e: React.DragEvent) => onDrop(e, trashFolderId)}
                            folderId={trashFolderId}
                        />
                        {activeFolderId === trashFolderId && trashedFolders.length > 0 && (
                            <div className="ml-4 space-y-1 pt-1">
                                {trashedFolders.map((folder) => (
                                    <div key={folder.id} className="group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-telegram-hover">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Folder className="h-3.5 w-3.5 flex-shrink-0 text-telegram-subtext" />
                                            <span className="truncate text-xs text-telegram-subtext">{folder.name}</span>
                                        </div>
                                        <button
                                            onClick={() => onRestoreFolder?.(folder.id, folder.name)}
                                            className="p-1 text-telegram-subtext opacity-0 transition-all group-hover:opacity-100 hover:text-telegram-primary"
                                            title="Restore folder"
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {folders.length > 0 && (
                    <div className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-telegram-subtext">Folders</div>
                )}
                {renderFolderTree(null)}
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

                {bandwidth && <BandwidthWidget bandwidth={bandwidth} />}
            </div>
        </aside>
    );
}
