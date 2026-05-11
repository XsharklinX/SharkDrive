import { useState } from 'react';
import { HardDrive, Folder, Plus, RefreshCw, LogOut, Trash2, RotateCcw, Clock } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { TelegramFolder, BandwidthStats } from '../../types';

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
    onCreate: (name: string) => Promise<void>;
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
    folders, activeFolderId, setActiveFolderId, onDrop, onDelete, onRenameFolder, onShareFolder,
    onToggleEncryption, encryptedFolderIds = new Set(), onCreate,
    isSyncing, isConnected, onSync, onLogout, bandwidth, trashFolderId,
    trashedFolders = [], onRestoreFolder, recentCount = 0
}: SidebarProps) {
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");

    const submitCreate = async () => {
        if (!newFolderName.trim()) return;
        try {
            await onCreate(newFolderName);
            setNewFolderName("");
            setShowNewFolderInput(false);
        } catch {
            // handled by parent
        }
    }

    return (
        <aside className="w-64 bg-telegram-surface border-r border-telegram-border flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 flex items-center gap-2">
                <img src="/logo.svg" className="w-8 h-8 drop-shadow-lg" alt="Logo" />
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-[#00b4ff] to-[#0066ff] bg-clip-text text-transparent">SharkDrive</span>
            </div>

            {/* Scrollable folder list */}
            <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto min-h-0">
                <SidebarItem
                    icon={HardDrive}
                    label="Saved Messages"
                    active={activeFolderId === null}
                    onClick={() => setActiveFolderId(null)}
                    onDrop={(e: React.DragEvent) => onDrop(e, null)}
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
                            label={`Trash${trashedFolders.length > 0 ? ` (${trashedFolders.length} folder${trashedFolders.length > 1 ? 's' : ''})` : ''}`}
                            active={activeFolderId === trashFolderId}
                            onClick={() => setActiveFolderId(trashFolderId)}
                            onDrop={(e: React.DragEvent) => onDrop(e, trashFolderId)}
                            folderId={trashFolderId}
                        />
                        {activeFolderId === trashFolderId && trashedFolders.length > 0 && (
                            <div className="ml-4 space-y-0.5">
                                <p className="text-[10px] text-telegram-subtext px-3 py-1 font-medium uppercase tracking-wide">Trashed Folders</p>
                                {trashedFolders.map(f => (
                                    <div key={f.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-telegram-hover group">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Folder className="w-3.5 h-3.5 text-telegram-subtext flex-shrink-0" />
                                            <span className="text-xs text-telegram-subtext truncate">{f.name}</span>
                                        </div>
                                        <button
                                            onClick={() => onRestoreFolder?.(f.id, f.name)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-telegram-primary text-telegram-subtext transition-all"
                                            title="Restore folder"
                                        >
                                            <RotateCcw className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
                {folders.map(folder => (
                    <SidebarItem
                        key={folder.id}
                        icon={Folder}
                        label={folder.name}
                        active={activeFolderId === folder.id}
                        onClick={() => setActiveFolderId(folder.id)}
                        onDrop={(e: React.DragEvent) => onDrop(e, folder.id)}
                        onDelete={() => onDelete(folder.id, folder.name)}
                        onRename={onRenameFolder ? () => onRenameFolder(folder.id, folder.name) : undefined}
                        onShareLink={onShareFolder ? () => onShareFolder(folder.id, folder.name) : undefined}
                        onToggleEncryption={onToggleEncryption ? () => onToggleEncryption(folder.id) : undefined}
                        isEncrypted={encryptedFolderIds.has(folder.id)}
                        folderId={folder.id}
                    />
                ))}
            </nav>

            {/* Sticky Create Folder section — always visible above the footer */}
            <div className="px-2 pb-2 border-b border-telegram-border">
                {showNewFolderInput ? (
                    <div className="px-3 py-2">
                        <input
                            autoFocus
                            type="text"
                            className="w-full bg-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-telegram-primary"
                            placeholder="Folder Name"
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && submitCreate()}
                            onBlur={() => !newFolderName && setShowNewFolderInput(false)}
                        />
                    </div>
                ) : (
                    <button
                        onClick={() => setShowNewFolderInput(true)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors border border-dashed border-telegram-border"
                    >
                        <Plus className="w-4 h-4" />
                        Create Folder
                    </button>
                )}
            </div>

            <div className="p-4 border-t border-telegram-border">
                <div className="flex items-center gap-2 text-telegram-subtext text-xs">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    <span>{isConnected ? 'Connected to Telegram' : 'Disconnected from Telegram'}</span>
                </div>

                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onSync}
                        disabled={isSyncing}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-blue-500 hover:text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Scan for existing folders"
                    >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync'}
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="Sign Out"
                    >
                        <LogOut className="w-3 h-3" />
                        Logout
                    </button>
                </div>

                {bandwidth && <BandwidthWidget bandwidth={bandwidth} />}
            </div>

        </aside>
    )
}
