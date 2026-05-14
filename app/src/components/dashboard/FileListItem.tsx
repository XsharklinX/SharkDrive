import { useState } from 'react';
import { Check, Folder, Eye, HardDrive, Trash2 } from 'lucide-react';
import { TelegramFile } from '../../types';
import { FileTypeIcon } from '../FileTypeIcon';

interface FileListItemProps {
    file: TelegramFile;
    selectedIds: number[];
    selectionMode?: boolean;
    onFileClick: (e: React.MouseEvent, id: number) => void;
    handleContextMenu: (e: React.MouseEvent, file: TelegramFile) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onPreview: (file: TelegramFile) => void;
    onDownload: (file: TelegramFile) => void;
    onDelete: (file: TelegramFile) => void;
}

export function FileListItem({
    file, selectedIds, selectionMode = false, onFileClick, handleContextMenu,
    onDragStart, onDragEnd, onDrop,
    onPreview, onDownload, onDelete
}: FileListItemProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const isFolder = file.type === 'folder';
    const isSelected = selectedIds.includes(file.id);

    return (
        <div
            onClick={() => onPreview(file)}
            onContextMenu={(e) => handleContextMenu(e, file)}
            draggable={!isFolder}
            onDragStart={(e) => {
                if (onDragStart) onDragStart(file.id);
                e.dataTransfer.setData("application/x-telegram-file-id", file.id.toString());
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
                if (onDragEnd) onDragEnd();
            }}
            onDragOver={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDragOver) setIsDragOver(true);
                }
            }}
            onDragLeave={(e) => {
                if (isFolder) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                }
            }}
            onDrop={(e) => {
                if (isFolder && onDrop) {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    onDrop(e, file.id);
                }
            }}
            className={`group grid grid-cols-[3rem_2fr_6rem_8rem] items-center gap-4 rounded-lg border px-3 py-2 transition-all
                ${isSelected ? 'border-telegram-primary/35 bg-telegram-primary/10' : 'border-transparent hover:bg-white/[0.03]'}
                ${isDragOver ? 'bg-telegram-primary/14 ring-2 ring-telegram-primary/25' : ''}
            `}
        >
            <div className="flex justify-center">
                <button
                    onClick={(e) => { e.stopPropagation(); onFileClick(e, file.id); }}
                    className={`mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? 'border-telegram-primary bg-telegram-primary text-black' : 'border-telegram-border bg-white/[0.03] text-telegram-subtext hover:text-telegram-text'} ${selectionMode ? 'opacity-100' : ''}`}
                    title={isSelected ? 'Remove from selection' : 'Add to selection'}
                >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : <div className="h-2.5 w-2.5 rounded-full border border-current/60" />}
                </button>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.03]">
                    {isFolder ? <Folder className="w-5 h-5 text-telegram-primary" /> : <FileTypeIcon filename={file.name} className="w-5 h-5" />}
                </div>
            </div>
            <div className="truncate text-sm text-telegram-text font-medium relative pr-8">
                <div className="flex items-center gap-2">
                    <span className="truncate">{file.name}</span>
                    {file.is_encrypted && <span className="text-[10px] text-yellow-200">Encrypted</span>}
                </div>
                <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center rounded-lg border border-telegram-border bg-[#0b1521]/90 px-1 py-1 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); onPreview(file) }} className="rounded-md p-1.5 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text" title="Preview"><Eye className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDownload(file) }} className="rounded-md p-1.5 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text" title="Download"><HardDrive className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(file) }} className="rounded-md p-1.5 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-400" title="Delete"><Trash2 className="w-4 h-4" /></button>
                </div>
            </div>
            <div className="text-right text-xs text-telegram-subtext truncate">{file.sizeStr}</div>
            <div className="text-right text-xs text-telegram-subtext font-mono opacity-50 truncate">{file.created_at || '-'}</div>
        </div>
    );
}
