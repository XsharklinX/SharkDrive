import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Check, Folder, Trash2, Star, Download, Eye, Play } from 'lucide-react';
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
    onToggleSelection?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    activeFolderId?: number | null;
    height?: number;
    isFavorite?: boolean;
    onToggleFavorite?: (id: number) => void;
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
}: FileCardProps) {
    const isFolder = file.type === 'folder';
    const [isDragOver, setIsDragOver] = useState(false);
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [thumbnailLoading, setThumbnailLoading] = useState(false);
    const [streamToken, setStreamToken] = useState<string | null>(null);
    const [videoReady, setVideoReady] = useState(false);
    const createdLabel = getCreatedLabel(file.created_at);
    const supportsThumbnail = !isFolder && (isImageFile(file.name) || isVideoFile(file.name));
    const isVideo = isVideoFile(file.name);
    const resolvedFolderId = resolveFileFolderId(file, activeFolderId ?? null);
    const videoPreviewUrl = isVideo && streamToken
        ? `http://localhost:14200/stream/${resolvedFolderId ?? 'home'}/${file.id}?token=${streamToken}`
        : null;

    useEffect(() => {
        if (isFolder) return;

        let cancelled = false;
        setThumbnail(null);
        setVideoReady(false);

        if (!supportsThumbnail) return;

        setThumbnailLoading(true);
        tauriApi.getThumbnail(file.id, resolvedFolderId).then((result) => {
            if (!cancelled && result) setThumbnail(result);
        }).catch(() => {
            // Best-effort thumbnail loading only.
        }).finally(() => {
            if (!cancelled) setThumbnailLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [file.id, file.name, isFolder, resolvedFolderId, supportsThumbnail]);

    useEffect(() => {
        if (!isVideo || thumbnail) return;

        let cancelled = false;
        tauriApi.getStreamToken()
            .then((token) => {
                if (!cancelled) setStreamToken(token);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [isVideo, thumbnail]);

    return (
        <div
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
                draggable={!isFolder}
                onDragStart={(e: any) => {
                    if (onDragStart) onDragStart(file.id);
                    e.dataTransfer.setData('application/x-telegram-file-id', file.id.toString());
                    e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                    if (onDragEnd) onDragEnd();
                }}
                whileHover={{ y: -1 }}
                className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-[#0b1521] transition-all
                ${isSelected ? 'border-telegram-primary/45 ring-1 ring-telegram-primary/25' : 'border-telegram-border hover:border-telegram-primary/20'}
                ${isDragOver ? 'bg-telegram-primary/10 ring-1 ring-telegram-primary/30' : ''}`}
                style={height ? { height: `${height}px` } : { aspectRatio: '4/3' }}
            >
                {thumbnail ? (
                    <img src={thumbnail} alt={file.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                {!thumbnail && isVideo && videoPreviewUrl ? (
                    <video
                        src={videoPreviewUrl}
                        muted
                        playsInline
                        preload="auto"
                        className={`absolute inset-0 h-full w-full object-cover transition-opacity ${videoReady ? 'opacity-100' : 'opacity-0'}`}
                        onLoadedData={(event) => {
                            event.currentTarget.pause();
                            setVideoReady(true);
                        }}
                    />
                ) : null}
                {thumbnail ? <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-[#07111bcc] to-[#07111b66]" /> : null}
                {!thumbnail && videoReady ? <div className="absolute inset-0 bg-gradient-to-t from-[#07111b] via-[#07111bcc] to-[#07111b66]" /> : null}

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelection?.();
                    }}
                    className={`absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${isSelected ? 'border-telegram-primary bg-telegram-primary text-black' : 'border-telegram-border bg-[#0b1521]/90 text-telegram-subtext hover:text-telegram-text'} ${selectionMode ? 'opacity-100' : ''}`}
                    title={isSelected ? 'Remove from selection' : 'Add to selection'}
                >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : <div className="h-2 w-2 rounded-full border border-current/60" />}
                </button>

                {!isFolder && (
                    <span className="absolute right-2.5 top-2.5 z-10 rounded-md border border-telegram-border bg-[#0b1521]/90 px-1.5 py-0.5 text-[10px] text-telegram-subtext">
                        {getExtensionLabel(file.name)}
                    </span>
                )}

                <div className="absolute inset-0 flex flex-col justify-between p-2.5">
                    {!thumbnail && !videoReady && (
                        <div className="flex flex-1 items-center justify-center">
                            {isFolder ? (
                                <Folder className="h-10 w-10 text-telegram-primary/80" />
                            ) : thumbnailLoading && supportsThumbnail ? (
                                <div className="h-7 w-7 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                            ) : (
                                <FileTypeIcon filename={file.name} size="lg" />
                            )}
                        </div>
                    )}
                    {(thumbnail || videoReady) && isVideo && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white shadow-lg">
                                <Play className="ml-0.5 h-5 w-5 fill-current" />
                            </div>
                        </div>
                    )}

                    <div className={`mt-auto ${thumbnail ? 'text-white' : 'text-telegram-text'}`}>
                        <div className="line-clamp-2 text-[12px] font-medium leading-5" title={file.name}>
                            {file.name}
                        </div>
                        <div className={`mt-1.5 flex items-center justify-between text-[10px] ${thumbnail ? 'text-white/70' : 'text-telegram-subtext'}`}>
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
                            className={`rounded-md p-1 transition ${isFavorite ? 'bg-yellow-400/14 text-yellow-300' : 'bg-[#0b1521]/90 text-telegram-subtext hover:text-yellow-300'}`}
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
                        className="rounded-md bg-[#0b1521]/90 p-1 text-telegram-subtext transition hover:text-telegram-text"
                        title={isFolder ? 'Open Folder' : 'Preview'}
                    >
                        <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDownload();
                        }}
                        className="rounded-md bg-[#0b1521]/90 p-1 text-telegram-subtext transition hover:text-telegram-text"
                        title="Download"
                    >
                        <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        className="rounded-md bg-[#0b1521]/90 p-1 text-telegram-subtext transition hover:text-red-300"
                        title="Delete"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
