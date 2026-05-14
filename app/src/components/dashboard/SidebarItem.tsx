import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FolderOpen, Link, Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';

interface SidebarItemProps {
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
    onDrop: (e: React.DragEvent) => void;
    onFolderDrop?: (e: React.DragEvent, folderId: number | null) => void;
    onDelete?: () => void;
    onRename?: () => void;
    onShareLink?: () => void;
    onToggleEncryption?: () => void;
    isEncrypted?: boolean;
    folderId: number | null;
    depth?: number;
    onCreateChild?: () => void;
    draggableFolderId?: number | null;
}

interface FolderContextMenuProps {
    x: number;
    y: number;
    isEncrypted: boolean;
    onOpen: () => void;
    onRename: () => void;
    onShareLink: () => void;
    onToggleEncryption: () => void;
    onCreateChild?: () => void;
    onDelete: () => void;
    onClose: () => void;
}

function FolderContextMenu({ x, y, isEncrypted, onOpen, onRename, onShareLink, onToggleEncryption, onCreateChild, onDelete, onClose }: FolderContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x, y });

    useEffect(() => {
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect();
            let nx = x;
            let ny = y;
            if (x + rect.width > window.innerWidth) nx = x - rect.width;
            if (y + rect.height > window.innerHeight) ny = y - rect.height;
            setPos({ x: nx, y: ny });
        }
    }, [x, y]);

    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        const handleContextMenu = (event: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        const close = () => onClose();

        document.addEventListener('pointerdown', handlePointerDown, true);
        document.addEventListener('contextmenu', handleContextMenu, true);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', close);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            document.removeEventListener('contextmenu', handleContextMenu, true);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', close);
        };
    }, [onClose]);

    const btn = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors w-full hover:bg-white/[0.05]';

    return (
        <div
            ref={menuRef}
            className="fixed z-50 flex min-w-[220px] flex-col gap-1 rounded-xl border border-telegram-border bg-telegram-surface p-2.5 shadow-[0_18px_48px_rgba(0,0,0,0.32)]"
            style={{ left: pos.x, top: pos.y }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            <div className="mb-1 rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-telegram-subtext">Folder</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-telegram-text">Folder Options</p>
                    {isEncrypted && <Lock className="h-3.5 w-3.5 text-yellow-300" />}
                </div>
            </div>
            <button onClick={onOpen} className={`${btn} text-telegram-text`}>
                <FolderOpen className="w-4 h-4 text-yellow-400" />
                Open
            </button>
            <button onClick={onRename} className={`${btn} text-telegram-text`}>
                <Pencil className="w-4 h-4 text-telegram-primary" />
                Rename
            </button>
            {onCreateChild && (
                <button onClick={onCreateChild} className={`${btn} text-telegram-text`}>
                    <Plus className="w-4 h-4 text-telegram-secondary" />
                    Create Subfolder
                </button>
            )}
            <button onClick={onShareLink} className={`${btn} text-telegram-text`}>
                <Link className="w-4 h-4 text-emerald-400" />
                Share Folder
            </button>
            <button onClick={onToggleEncryption} className={`${btn} ${isEncrypted ? 'text-yellow-300' : 'text-telegram-text'}`}>
                {isEncrypted
                    ? <><LockOpen className="w-4 h-4" /> Turn off auto-encrypt</>
                    : <><Lock className="w-4 h-4 text-yellow-300" /> Turn on auto-encrypt</>
                }
            </button>
            <div className="h-px bg-telegram-border my-1" />
            <button onClick={onDelete} className={`${btn} text-red-400 hover:bg-red-500/10`}>
                <Trash2 className="w-4 h-4" />
                Move to Trash
            </button>
        </div>
    );
}

export function SidebarItem({ icon: Icon, label, active = false, onClick, onDrop, onFolderDrop, onDelete, onRename, onShareLink, onToggleEncryption, isEncrypted, folderId, depth = 0, onCreateChild, draggableFolderId }: SidebarItemProps) {
    const [isOver, setIsOver] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const hasContextMenu = !!(onDelete || onRename || onShareLink);

    return (
        <>
            <button
                draggable={typeof draggableFolderId === 'number'}
                onClick={onClick}
                onDragStart={(e) => {
                    if (typeof draggableFolderId !== 'number') return;
                    e.dataTransfer.setData('application/x-sharkdrive-folder-id', String(draggableFolderId));
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOver(true);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX;
                    const y = e.clientY;
                    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                        setIsOver(false);
                    }
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOver(false);
                    const draggedFolderId = e.dataTransfer.getData('application/x-sharkdrive-folder-id');
                    if (draggedFolderId) {
                        onFolderDrop?.(e, folderId);
                        return;
                    }
                    onDrop?.(e);
                }}
                onContextMenu={(e) => {
                    if (hasContextMenu) {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY });
                    }
                }}
                className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    active
                        ? 'border-telegram-primary/25 bg-telegram-primary/10 text-telegram-text'
                        : isOver
                            ? 'border-telegram-primary/25 bg-telegram-primary/14 text-telegram-text'
                            : 'border-transparent text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'
                }`}
                style={{ marginLeft: `${depth * 14}px`, width: `calc(100% - ${depth * 14}px)` }}
            >
                <div className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    active ? 'border-telegram-primary/20 bg-telegram-primary/12 text-telegram-primary' : 'border-telegram-border/70 bg-white/[0.02]'
                }`}>
                    <Icon className={`w-4 h-4 ${isOver ? 'text-telegram-primary' : ''}`} />
                    {isEncrypted && (
                        <Lock className="w-2.5 h-2.5 text-yellow-300 absolute -bottom-1 -right-1" />
                    )}
                </div>
                <span className="flex-1 text-left truncate">{label}</span>
                {depth > 0 && <ChevronRight className="h-3.5 w-3.5 text-telegram-subtext/45" />}
                {onDelete && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="rounded-md p-1 opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                        title="Move to Trash"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                )}
            </button>

            {contextMenu && hasContextMenu && (
                <FolderContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    isEncrypted={!!isEncrypted}
                    onOpen={() => { onClick(); setContextMenu(null); }}
                    onRename={() => { onRename?.(); setContextMenu(null); }}
                    onCreateChild={() => { onCreateChild?.(); setContextMenu(null); }}
                    onShareLink={() => { onShareLink?.(); setContextMenu(null); }}
                    onToggleEncryption={() => { onToggleEncryption?.(); setContextMenu(null); }}
                    onDelete={() => { onDelete?.(); setContextMenu(null); }}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </>
    );
}
