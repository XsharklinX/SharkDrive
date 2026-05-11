import { useState, useEffect, useRef } from 'react';
import { Plus, FolderOpen, Pencil, Link, Trash2, Lock, LockOpen } from 'lucide-react';

interface SidebarItemProps {
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
    onDrop: (e: React.DragEvent) => void;
    onDelete?: () => void;
    onRename?: () => void;
    onShareLink?: () => void;
    onToggleEncryption?: () => void;
    isEncrypted?: boolean;
    folderId: number | null;
}

interface FolderContextMenuProps {
    x: number;
    y: number;
    isEncrypted: boolean;
    onOpen: () => void;
    onRename: () => void;
    onShareLink: () => void;
    onToggleEncryption: () => void;
    onDelete: () => void;
    onClose: () => void;
}

function FolderContextMenu({ x, y, isEncrypted, onOpen, onRename, onShareLink, onToggleEncryption, onDelete, onClose }: FolderContextMenuProps) {
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
            if (event.key === 'Escape') {
                onClose();
            }
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

    const btn = "flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-telegram-hover rounded transition-colors text-left w-full";

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[190px] bg-telegram-surface/95 backdrop-blur-xl border border-telegram-border rounded-lg shadow-2xl p-1.5 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: pos.x, top: pos.y }}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
        >
            <button onClick={onOpen} className={`${btn} text-telegram-text`}>
                <FolderOpen className="w-4 h-4 text-yellow-500" />
                Open
            </button>
            <button onClick={onRename} className={`${btn} text-telegram-text`}>
                <Pencil className="w-4 h-4 text-telegram-primary" />
                Rename
            </button>
            <button onClick={onShareLink} className={`${btn} text-telegram-text`}>
                <Link className="w-4 h-4 text-green-400" />
                Share Folder Link
            </button>
            <button onClick={onToggleEncryption} className={`${btn} ${isEncrypted ? 'text-yellow-400' : 'text-telegram-text'}`}>
                {isEncrypted
                    ? <><LockOpen className="w-4 h-4" /> Disable Auto-Encrypt</>
                    : <><Lock className="w-4 h-4 text-yellow-400" /> Enable Auto-Encrypt</>
                }
            </button>
            <div className="h-px bg-telegram-border my-1" />
            <button onClick={onDelete} className={`${btn} text-red-500 hover:bg-red-500/10`}>
                <Trash2 className="w-4 h-4" />
                Move to Trash
            </button>
        </div>
    );
}

export function SidebarItem({ icon: Icon, label, active = false, onClick, onDrop, onDelete, onRename, onShareLink, onToggleEncryption, isEncrypted }: SidebarItemProps) {
    const [isOver, setIsOver] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

    const hasContextMenu = !!(onDelete || onRename || onShareLink);

    return (
        <>
            <button
                onClick={onClick}
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
                    if (onDrop) onDrop(e);
                }}
                onContextMenu={(e) => {
                    if (hasContextMenu) {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY });
                    }
                }}
                className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${active
                    ? 'bg-telegram-primary/10 text-telegram-primary'
                    : isOver
                        ? 'bg-telegram-primary/30 text-telegram-text ring-2 ring-telegram-primary scale-[1.02] shadow-lg'
                        : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'
                    }`}
            >
                <div className="relative flex-shrink-0">
                    <Icon className={`w-4 h-4 ${isOver ? 'text-telegram-primary' : ''}`} />
                    {isEncrypted && (
                        <Lock className="w-2.5 h-2.5 text-yellow-400 absolute -bottom-1 -right-1" />
                    )}
                </div>
                <span className="flex-1 text-left truncate">{label}</span>
                {onDelete && (
                    <div onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400">
                        <Plus className="w-3 h-3 rotate-45" />
                    </div>
                )}
            </button>

            {contextMenu && hasContextMenu && (
                <FolderContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    isEncrypted={!!isEncrypted}
                    onOpen={() => { onClick(); setContextMenu(null); }}
                    onRename={() => { onRename?.(); setContextMenu(null); }}
                    onShareLink={() => { onShareLink?.(); setContextMenu(null); }}
                    onToggleEncryption={() => { onToggleEncryption?.(); setContextMenu(null); }}
                    onDelete={() => { onDelete?.(); setContextMenu(null); }}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </>
    );
}
