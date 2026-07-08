import { useState, useRef, useEffect } from 'react';
import { Check, Folder, Eye, HardDrive, Trash2, Shield } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { TelegramFile } from '../../types';
import { FileTypeIcon } from '../FileTypeIcon';
import { formatBytes } from '../../utils';
import { useLanguage } from '../../context/LanguageContext';

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
    onInlineRename?: (id: number, newName: string) => void;
    folderColor?: string;
}

export function FileListItem({
    file, selectedIds, selectionMode = false, onFileClick, handleContextMenu,
    onDragStart, onDragEnd, onDrop,
    onPreview, onDownload, onDelete, onInlineRename, folderColor
}: FileListItemProps) {
    const { lang } = useLanguage();
    const isFolder = file.type === 'folder';
    const isSelected = selectedIds.includes(file.id);
    const [isDragOver, setIsDragOver] = useState(false);
    const [folderSize, setFolderSize] = useState<{ count: number; bytes: number } | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameDraft, setRenameDraft] = useState('');
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isFolder) return;
        let cancelled = false;
        invoke<[number, number]>('cmd_get_folder_size', { folderId: file.id })
            .then(([count, bytes]) => { if (!cancelled) setFolderSize({ count, bytes }); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [file.id, isFolder]);

    return (
        <div
            onClick={() => onPreview(file)}
            onContextMenu={(e) => handleContextMenu(e, file)}
            draggable={!isFolder}
            onDragStart={(e) => {
                if (onDragStart) onDragStart(file.id);
                e.dataTransfer.setData('application/x-telegram-file-id', file.id.toString());
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => onDragEnd?.()}
            onDragOver={(e) => {
                if (!isFolder) return;
                e.preventDefault();
                e.stopPropagation();
                if (!isDragOver) setIsDragOver(true);
            }}
            onDragLeave={(e) => {
                if (!isFolder) return;
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
            }}
            onDrop={(e) => {
                if (!isFolder || !onDrop) return;
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
                onDrop(e, file.id);
            }}
            className={`group grid grid-cols-[2.5rem_minmax(0,1fr)_6rem_7rem] items-center gap-3 rounded-md border px-2.5 py-1.5 transition-all
                ${isSelected ? 'border-telegram-primary/35 bg-telegram-primary/10' : 'border-transparent hover:bg-white/[0.03]'}
                ${isDragOver ? 'bg-telegram-primary/14 ring-2 ring-telegram-primary/25' : ''}
            `}
        >
            <div className="flex justify-center">
                <button
                    onClick={(e) => { e.stopPropagation(); onFileClick(e, file.id); }}
                    className={`mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${isSelected ? 'border-telegram-primary bg-telegram-primary text-black' : 'border-telegram-border bg-white/[0.03] text-telegram-subtext hover:text-telegram-text'} ${selectionMode ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`}
                    title={isSelected ? 'Remove from selection' : 'Add to selection'}
                >
                    {isSelected ? <Check className="h-3 w-3" /> : <div className="h-2 w-2 rounded-full border border-current/60" />}
                </button>
                <div
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-telegram-border bg-white/[0.03]"
                    style={isFolder && folderColor ? { color: folderColor, borderColor: `${folderColor}55`, backgroundColor: `${folderColor}14` } : undefined}
                >
                    {isFolder ? <Folder className="h-4 w-4" /> : <FileTypeIcon filename={file.name} className="h-4 w-4" />}
                </div>
            </div>

            <div className="relative truncate pr-8 text-sm font-medium text-telegram-text">
                <div className="flex items-center gap-2">
                    {isRenaming ? (
                        <input
                            ref={renameInputRef}
                            autoFocus
                            className="min-w-0 flex-1 border-b border-telegram-primary/70 bg-transparent text-sm font-medium outline-none"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={() => {
                                setIsRenaming(false);
                                if (renameDraft.trim() && renameDraft !== file.name) {
                                    onInlineRename?.(file.id, renameDraft.trim());
                                }
                            }}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') e.currentTarget.blur();
                                else if (e.key === 'Escape') setIsRenaming(false);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span
                            className="truncate"
                            onDoubleClick={(e) => {
                                if (!onInlineRename) return;
                                e.stopPropagation();
                                setRenameDraft(file.name);
                                setIsRenaming(true);
                                setTimeout(() => renameInputRef.current?.select(), 0);
                            }}
                        >
                            {file.name}
                        </span>
                    )}
                    {file.is_encrypted && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-yellow-400/20 bg-yellow-400/10 px-1.5 py-0.5 text-[10px] text-yellow-200">
                            <Shield className="h-3 w-3" />
                            {lang === 'es' ? 'Cifrado' : 'Encrypted'}
                        </span>
                    )}
                </div>

                <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center rounded-md border border-telegram-border bg-telegram-bg/90 px-0.5 py-0.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); onPreview(file); }} className="rounded-md p-1 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text" title="Preview"><Eye className="h-3.5 w-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDownload(file); }} className="rounded-md p-1 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text" title="Download"><HardDrive className="h-3.5 w-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(file); }} className="rounded-md p-1 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-400" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
            </div>

            <div className="truncate text-right text-xs text-telegram-subtext">
                {isFolder
                    ? folderSize
                        ? `${folderSize.count} file${folderSize.count !== 1 ? 's' : ''} - ${formatBytes(folderSize.bytes)}`
                        : <span className="opacity-40">-</span>
                    : file.sizeStr
                }
            </div>
            <div className="truncate text-right font-mono text-xs text-telegram-subtext opacity-50">{file.created_at || '-'}</div>
        </div>
    );
}
