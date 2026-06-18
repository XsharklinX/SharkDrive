import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { Check, Folder, FolderOpen, Trash2, Star, Download, Eye, Play, Shield, Info, StickyNote } from 'lucide-react';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { isImageFile, isVideoFile, resolveFileFolderId } from '../../utils';
import { FileTypeIcon } from '../FileTypeIcon';

interface FileCardProps {
    file: TelegramFile;
    onDelete: () => void;
    onDownload: () => void;
    onPreview?: () => void;
    isSelected: boolean;
    selectionMode?: boolean;
    onClick?: () => void;
    onToggleSelection?: (event: React.MouseEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    activeFolderId?: number | null;
    height?: number;
    isFavorite?: boolean;
    onToggleFavorite?: (id: number) => void;
    onInlineRename?: (id: number, newName: string) => void;
    onInfo?: (file: TelegramFile) => void;
    folderColor?: string;
    note?: string;
    onNoteChange?: (note: string) => void;
    hasContentMatch?: boolean;
}

function getExtensionLabel(filename: string) {
    return filename.split('.').pop()?.toUpperCase() || 'FILE';
}

function getCreatedLabel(createdAt?: string) {
    if (!createdAt) return 'Now';
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) return 'Now';
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function FileCard({
    file,
    onDelete,
    onDownload,
    onPreview,
    isSelected,
    selectionMode = false,
    onClick,
    onToggleSelection,
    onContextMenu,
    onDrop,
    onDragStart,
    onDragEnd,
    activeFolderId,
    height,
    isFavorite,
    onToggleFavorite,
    onInlineRename,
    onInfo,
    folderColor,
    note = '',
    onNoteChange,
    hasContentMatch = false,
}: FileCardProps) {
    const isFolder = file.type === 'folder';
    const [isDragOver, setIsDragOver] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [showNoteEditor, setShowNoteEditor] = useState(false);
    const [noteDraft, setNoteDraft] = useState(note);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const [renameDraft, setRenameDraft] = useState('');
    const renameInputRef = useRef<HTMLInputElement>(null);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [thumbnailLoading, setThumbnailLoading] = useState(false);
    const [streamToken, setStreamToken] = useState<string | null>(null);
    const [videoReady, setVideoReady] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const createdLabel = getCreatedLabel(file.created_at);
    // Videos use the LAN stream URL for preview — getThumbnail downloads the whole video, so skip it.
    const supportsThumbnail = !isFolder && isImageFile(file.name);
    const isVideo = isVideoFile(file.name);
    const resolvedFolderId = resolveFileFolderId(file, activeFolderId ?? null);
    const videoPreviewUrl = isVideo && streamToken
        ? `http://localhost:14200/stream/${resolvedFolderId ?? 'home'}/${file.id}?token=${streamToken}`
        : null;

    // IntersectionObserver: only load thumbnail when the card is actually visible
    const cardRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = cardRef.current;
        if (!el || !supportsThumbnail) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
            { threshold: 0.1, rootMargin: '100px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [supportsThumbnail]);

    useEffect(() => {
        if (!isVisible || isFolder || !supportsThumbnail) return;

        let cancelled = false;
        setThumbnail(null);

        // Small stagger so cards visible at once don't all fire simultaneously
        const stagger = (file.id % 4) * 80;
        const timer = setTimeout(async () => {
            if (cancelled) return;
            setThumbnailLoading(true);
            try {
                const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 8000));
                const result = await Promise.race([tauriApi.getThumbnail(file.id, resolvedFolderId), timeout]);
                if (!cancelled && result) setThumbnail(result);
            } catch {
                // best-effort
            } finally {
                if (!cancelled) setThumbnailLoading(false);
            }
        }, stagger);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [file.id, file.name, isFolder, resolvedFolderId, supportsThumbnail]);

    useEffect(() => {
        if (!isVideo || thumbnail) return;

        let cancelled = false;
        const tokenTimeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000));
        Promise.race([tauriApi.getStreamToken(), tokenTimeout])
            .then((token) => {
                if (!cancelled && token) setStreamToken(token);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [isVideo, thumbnail]);

    return (
        <div
            ref={cardRef}
            className="relative"
            onContextMenu={onContextMenu}
            onClick={onClick}
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
        >
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ duration: 0.15 }}
                draggable={!isFolder}
                data-file-card
                tabIndex={0}
                role="button"
                aria-label={`${file.name}${isSelected ? ' (selected)' : ''}${file.is_encrypted ? ' encrypted' : ''}`}
                aria-pressed={isSelected}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClick?.();
                    } else if (e.key === 'Delete') {
                        onDelete();
                    }
                }}
                onDragStart={(e: any) => {
                    if (onDragStart) onDragStart(file.id);
                    e.dataTransfer.setData('application/x-telegram-file-id', file.id.toString());
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                    if (onDragEnd) onDragEnd();
                }}
                whileHover={{ y: -2, scale: 1.01 }}
                className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-telegram-bg transition-all
                ${isSelected ? 'border-telegram-primary/55 ring-1 ring-telegram-primary/25' : 'border-telegram-border/85 hover:border-telegram-primary/25'}
                ${isDragOver ? 'border-telegram-primary/60 ring-2 ring-telegram-primary/40' : ''}
                focus-visible:outline-2 focus-visible:outline-telegram-primary focus-visible:outline-offset-1`}
                style={height ? { height: `${height}px` } : { aspectRatio: '4/3' }}
            >
                {thumbnail ? (
                    <img src={thumbnail} alt={file.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                {!thumbnail && isVideo && videoPreviewUrl && !videoError ? (
                    <video
                        src={videoPreviewUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className={`absolute inset-0 h-full w-full object-cover transition-opacity ${videoReady ? 'opacity-100' : 'opacity-0'}`}
                        onLoadedData={(event) => {
                            event.currentTarget.pause();
                            setVideoReady(true);
                        }}
                        onError={() => setVideoError(true)}
                    />
                ) : null}
                {thumbnail ? <div className="absolute inset-0 bg-gradient-to-t from-telegram-bg/95 via-telegram-bg/60 to-transparent" /> : null}
                {!thumbnail && videoReady ? <div className="absolute inset-0 bg-gradient-to-t from-telegram-bg/95 via-telegram-bg/60 to-transparent" /> : null}

                {isDragOver && isFolder && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg bg-telegram-primary/25 backdrop-blur-[2px]">
                        <FolderOpen className="h-9 w-9 text-telegram-primary drop-shadow-lg" />
                        <span className="mt-2 text-xs font-semibold text-telegram-primary drop-shadow">Move here</span>
                    </div>
                )}

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelection?.(e);
                    }}
                    className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${isSelected ? 'border-telegram-primary bg-telegram-primary text-black' : 'border-telegram-border bg-telegram-bg/90 text-telegram-subtext hover:text-telegram-text'} ${selectionMode ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`}
                    title={isSelected ? 'Remove from selection' : 'Add to selection'}
                >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : <div className="h-2 w-2 rounded-full border border-current/60" />}
                </button>

                {!isFolder && (
                    <span className="absolute right-2 top-2 z-10 rounded-md border border-telegram-border/80 bg-telegram-bg/85 px-1.5 py-0.5 text-[10px] text-telegram-subtext">
                        {getExtensionLabel(file.name)}
                    </span>
                )}
                {file.is_encrypted && (
                    <span className="absolute right-2 top-9 z-10 flex items-center gap-0.5 rounded-md border border-yellow-400/25 bg-yellow-400/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
                        <Shield className="h-2.5 w-2.5" />
                        Enc
                    </span>
                )}
                {hasContentMatch && (
                    <span className="absolute left-2 top-9 z-10 rounded-md border border-telegram-primary/30 bg-telegram-primary/15 px-1.5 py-0.5 text-[10px] text-telegram-primary">
                        content
                    </span>
                )}

                <div className="absolute inset-0 flex flex-col justify-between p-2">
                    {!thumbnail && !videoReady && (
                        <div className="flex flex-1 items-center justify-center">
                            {isFolder ? (
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-telegram-border/80 bg-white/[0.03]" style={folderColor ? { color: folderColor, borderColor: `${folderColor}55`, backgroundColor: `${folderColor}18` } : undefined}>
                                    <Folder className="h-8 w-8" />
                                </div>
                            ) : thumbnailLoading && supportsThumbnail ? (
                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                            ) : (
                                <FileTypeIcon filename={file.name} size="lg" />
                            )}
                        </div>
                    )}
                    {(thumbnail || videoReady) && isVideo && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white shadow-lg">
                                <Play className="ml-0.5 h-4 w-4 fill-current" />
                            </div>
                        </div>
                    )}

                    <div className={`mt-auto ${thumbnail ? 'text-white' : 'text-telegram-text'}`}>
                        <div
                            className="line-clamp-2 text-[12px] font-medium leading-4"
                            title={isRenaming ? undefined : file.name}
                            onDoubleClick={(e) => {
                                if (isFolder || !onInlineRename) return;
                                e.stopPropagation();
                                setRenameDraft(file.name);
                                setIsRenaming(true);
                                setTimeout(() => renameInputRef.current?.select(), 0);
                            }}
                        >
                            {isRenaming ? (
                                <input
                                    ref={renameInputRef}
                                    autoFocus
                                    className="w-full bg-transparent text-[12px] font-medium outline-none border-b border-telegram-primary/70"
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
                                        if (e.key === 'Enter') { e.currentTarget.blur(); }
                                        else if (e.key === 'Escape') { setIsRenaming(false); }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                file.name
                            )}
                        </div>
                        <div className={`mt-1 flex items-center justify-between text-[10px] ${thumbnail ? 'text-white/70' : 'text-telegram-subtext'}`}>
                            <span>{isFolder ? 'Folder' : file.sizeStr}</span>
                            <span>{createdLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-2 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {onToggleFavorite && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(file.id);
                            }}
                            className={`rounded-md p-1 transition ${isFavorite ? 'bg-yellow-400/14 text-yellow-300' : 'bg-telegram-bg/90 text-telegram-subtext hover:text-yellow-300'}`}
                            title={isFavorite ? 'Remove from Starred' : 'Add to Starred'}
                        >
                            <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-yellow-300' : ''}`} />
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onPreview) onPreview();
                        }}
                        className="rounded-md bg-telegram-bg/90 p-1 text-telegram-subtext transition hover:text-telegram-text"
                        title={isFolder ? 'Open Folder' : 'Preview'}
                    >
                        <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDownload();
                        }}
                        className="rounded-md bg-telegram-bg/90 p-1 text-telegram-subtext transition hover:text-telegram-text"
                        title="Download"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="rounded-md bg-telegram-bg/90 p-1 text-telegram-subtext transition hover:text-red-300"
                        title="Delete"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {!isFolder && onInfo && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onInfo(file);
                            }}
                            className="rounded-md bg-telegram-bg/90 p-1 text-telegram-subtext transition hover:text-telegram-text"
                            title="File Info"
                        >
                            <Info className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {!isFolder && onNoteChange && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setNoteDraft(note);
                                setShowNoteEditor(v => !v);
                                setTimeout(() => noteRef.current?.focus(), 50);
                            }}
                            className={`relative rounded-md bg-telegram-bg/90 p-1 transition hover:text-telegram-text ${note ? 'text-telegram-primary' : 'text-telegram-subtext'}`}
                            title={note ? 'Edit note' : 'Add note'}
                        >
                            <StickyNote className="h-3.5 w-3.5" />
                            {note && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-telegram-primary" />}
                        </button>
                    )}
                </div>

                {/* Inline note editor */}
                {showNoteEditor && !isFolder && (
                    <div
                        className="absolute bottom-1 left-1 right-1 z-20 rounded-lg border border-telegram-primary/40 bg-telegram-surface/98 p-2 shadow-xl backdrop-blur"
                        onClick={e => e.stopPropagation()}
                    >
                        <textarea
                            ref={noteRef}
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            onBlur={() => {
                                onNoteChange?.(noteDraft.trim());
                                setShowNoteEditor(false);
                            }}
                            onKeyDown={e => {
                                e.stopPropagation();
                                if (e.key === 'Escape') { setShowNoteEditor(false); }
                                if (e.key === 'Enter' && e.ctrlKey) {
                                    onNoteChange?.(noteDraft.trim());
                                    setShowNoteEditor(false);
                                }
                            }}
                            placeholder="Add a note… (Ctrl+Enter to save)"
                            className="w-full resize-none bg-transparent text-[11px] text-telegram-text placeholder:text-telegram-subtext/50 outline-none"
                            rows={3}
                        />
                    </div>
                )}
            </motion.div>
        </div>
    );
}
