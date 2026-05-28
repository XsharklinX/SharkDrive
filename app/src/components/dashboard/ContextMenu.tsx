import { useEffect, useRef, useState } from 'react';
import { Copy, Eye, HardDrive, Trash2, FolderOpen, Pencil, Play, FileText, Link } from 'lucide-react';
import { TelegramFile } from '../../types';
import { isMediaFile, isPdfFile } from '../../utils';

interface ContextMenuProps {
    x: number;
    y: number;
    file: TelegramFile;
    onClose: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onPreview: () => void;
    onRename: () => void;
    onShareLink: () => void;
    onCopyToFolder?: () => void;
}

export function ContextMenu({ x, y, file, onClose, onDownload, onDelete, onPreview, onRename, onShareLink, onCopyToFolder }: ContextMenuProps) {
    const [adjustedPos, setAdjustedPos] = useState({ x, y });
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuRef.current) return;

        const rect = menuRef.current.getBoundingClientRect();
        let newX = x;
        let newY = y;

        if (x + rect.width > window.innerWidth) {
            newX = x - rect.width;
        }
        if (y + rect.height > window.innerHeight) {
            newY = y - rect.height;
        }
        newY = Math.max(8, newY);

        setAdjustedPos({ x: newX, y: newY });
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
        const handleResize = () => onClose();

        document.addEventListener('pointerdown', handlePointerDown, true);
        document.addEventListener('contextmenu', handleContextMenu, true);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleResize);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            document.removeEventListener('contextmenu', handleContextMenu, true);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', handleResize);
        };
    }, [onClose]);

    const buttonClass = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.05]';

    return (
        <div
            ref={menuRef}
            className="fixed z-50 flex min-w-[190px] flex-col gap-1 rounded-lg border border-telegram-border bg-telegram-surface/98 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.32)] animate-in fade-in zoom-in-95 duration-100 backdrop-blur-xl overflow-y-auto"
            style={{ left: adjustedPos.x, top: adjustedPos.y, maxHeight: 'calc(100vh - 16px)' }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {file.type !== 'folder' && (
                <button onClick={onPreview} className={`${buttonClass} text-telegram-text`}>
                    {isMediaFile(file.name) ? (
                        <>
                            <Play className="w-4 h-4 text-telegram-secondary" />
                            Play Media
                        </>
                    ) : isPdfFile(file.name) ? (
                        <>
                            <FileText className="w-4 h-4 text-red-300" />
                            Open PDF
                        </>
                    ) : (
                        <>
                            <Eye className="w-4 h-4 text-telegram-primary" />
                            Preview
                        </>
                    )}
                </button>
            )}

            {file.type === 'folder' && (
                <button onClick={onPreview} className={`${buttonClass} text-telegram-text`}>
                    <FolderOpen className="w-4 h-4 text-yellow-300" />
                    Open Folder
                </button>
            )}

            {file.type !== 'folder' && (
                <button onClick={onDownload} className={`${buttonClass} text-telegram-text`}>
                    <HardDrive className="w-4 h-4 text-emerald-300" />
                    Download
                </button>
            )}

            {file.type !== 'folder' && onCopyToFolder && (
                <button onClick={onCopyToFolder} className={`${buttonClass} text-telegram-text`}>
                    <Copy className="w-4 h-4 text-telegram-secondary" />
                    Copy to Folder
                </button>
            )}

            <button onClick={onRename} className={`${buttonClass} text-telegram-text`}>
                <Pencil className="w-4 h-4 text-telegram-primary" />
                Rename
            </button>

            <button onClick={onShareLink} className={`${buttonClass} text-telegram-text`}>
                <Link className="w-4 h-4 text-emerald-300" />
                {file.type === 'folder' ? 'Share Folder' : 'Share File'}
            </button>

            <div className="my-1 h-px bg-telegram-border" />

            <button onClick={onDelete} className={`${buttonClass} text-red-300 hover:bg-red-500/10`}>
                <Trash2 className="w-4 h-4" />
                Delete
            </button>
        </div>
    );
}
