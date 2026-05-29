import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, Star, Image as ImageIcon, Pause, Play } from 'lucide-react';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { isImageFile, resolveFileFolderId } from '../../utils';

interface GalleryViewProps {
    files: TelegramFile[];
    activeFolderId: number | null;
    favoriteIds: Set<number>;
    onToggleFavorite: (id: number) => void;
    onPreview: (file: TelegramFile) => void;
    onToggleSelection?: (id: number) => void;
    selectedIds?: number[];
    selectionMode?: boolean;
    compact?: boolean;
}

function GalleryItem({ file, activeFolderId, isFavorite, isSelected, isFocused, selectionMode, onToggleFavorite, onPreview, onToggleSelection, itemRef }: {
    file: TelegramFile;
    activeFolderId: number | null;
    isFavorite: boolean;
    isSelected: boolean;
    isFocused: boolean;
    selectionMode: boolean;
    onToggleFavorite: (id: number) => void;
    onPreview: (file: TelegramFile) => void;
    onToggleSelection?: (id: number) => void;
    itemRef?: (el: HTMLDivElement | null) => void;
}) {
    const [thumbnail, setThumbnail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        tauriApi.getThumbnail(file.id, resolveFileFolderId(file, activeFolderId))
            .then((result) => { if (!cancelled && result) setThumbnail(result); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [file.id, activeFolderId]);

    return (
        <div
            ref={itemRef}
            className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-telegram-surface transition-all hover:border-telegram-primary/35 ${isSelected ? 'border-telegram-primary/60 ring-1 ring-telegram-primary/30' : 'border-telegram-border'} ${isFocused ? 'ring-2 ring-telegram-primary/70' : ''}`}
            onClick={() => onPreview(file)}
        >
            {thumbnail ? (
                <img src={thumbnail} alt={file.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-telegram-subtext">
                    {loading ? (
                        <div className="w-6 h-6 border-2 border-telegram-primary/30 border-t-telegram-primary rounded-full animate-spin" />
                    ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.03]">
                            <ImageIcon className="w-7 h-7 text-telegram-secondary" />
                        </div>
                    )}
                </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            <div className="absolute bottom-0 left-0 right-0 translate-y-1 px-3 py-3 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                <p className="truncate text-xs font-semibold text-white">{file.name}</p>
                <p className="text-[10px] text-white/65">{file.sizeStr}</p>
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(file.id); }}
                className={`absolute top-2 right-2 rounded-full p-2 transition-all ${isFavorite ? 'opacity-100 text-yellow-400 bg-black/60' : 'opacity-0 group-hover:opacity-100 text-white bg-black/45 hover:text-yellow-400'}`}
                title={isFavorite ? 'Remove from Starred' : 'Add to Starred'}
            >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-yellow-400' : ''}`} />
            </button>

            <button
                onClick={(e) => { e.stopPropagation(); onToggleSelection?.(file.id); }}
                className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border transition ${isSelected ? 'border-telegram-primary bg-telegram-primary text-black opacity-100' : 'border-white/60 bg-black/50 text-white'} ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                title={isSelected ? 'Deselect' : 'Select'}
            >
                {isSelected ? <Check className="h-3.5 w-3.5" /> : <div className="h-2 w-2 rounded-full border border-current/60" />}
            </button>
        </div>
    );
}

export function GalleryView({ files, activeFolderId, favoriteIds, onToggleFavorite, onPreview, onToggleSelection, selectedIds = [], selectionMode = false, compact = false }: GalleryViewProps) {
    const imageFiles = useMemo(() => files.filter((file) => file.type !== 'folder' && isImageFile(file.name)), [files]);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const [columns, setColumns] = useState(4);
    const [slideshowActive, setSlideshowActive] = useState(false);
    const [slideshowDelayMs, setSlideshowDelayMs] = useState(5000);
    const [slideshowIndex, setSlideshowIndex] = useState(0);
    const gridRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (!gridRef.current) return;
        const update = () => {
            const w = gridRef.current?.clientWidth ?? 0;
            if (w < 640) setColumns(3);
            else if (w < 768) setColumns(4);
            else if (w < 1024) setColumns(5);
            else if (w < 1280) setColumns(6);
            else setColumns(8);
        };
        update();
        const obs = new ResizeObserver(update);
        obs.observe(gridRef.current);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (focusedIndex !== null && itemRefs.current[focusedIndex]) {
            itemRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [focusedIndex]);

    useEffect(() => {
        if (!slideshowActive || imageFiles.length === 0) return;

        const timer = window.setInterval(() => {
            setSlideshowIndex((current) => {
                const next = (current + 1) % imageFiles.length;
                setFocusedIndex(next);
                onPreview(imageFiles[next]);
                return next;
            });
        }, slideshowDelayMs);

        return () => window.clearInterval(timer);
    }, [imageFiles, onPreview, slideshowActive, slideshowDelayMs]);

    useEffect(() => {
        if (imageFiles.length === 0) {
            setSlideshowActive(false);
            setSlideshowIndex(0);
            return;
        }
        setSlideshowIndex((current) => Math.min(current, imageFiles.length - 1));
    }, [imageFiles.length]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (imageFiles.length === 0) return;
        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                setFocusedIndex(p => p === null ? 0 : Math.min(p + 1, imageFiles.length - 1));
                break;
            case 'ArrowLeft':
                e.preventDefault();
                setFocusedIndex(p => p === null ? 0 : Math.max(p - 1, 0));
                break;
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex(p => p === null ? 0 : Math.min(p + columns, imageFiles.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex(p => p === null ? 0 : Math.max(p - columns, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIndex !== null) onPreview(imageFiles[focusedIndex]);
                break;
            case ' ':
                e.preventDefault();
                if (focusedIndex !== null) onToggleSelection?.(imageFiles[focusedIndex].id);
                break;
        }
    };

    if (imageFiles.length === 0) {
        return (
            <div className={`flex flex-1 items-center justify-center ${compact ? 'py-10' : 'p-6'}`}>
                <div className={`vault-panel flex max-w-md flex-col items-center text-center ${compact ? 'rounded-xl px-6 py-10' : 'rounded-2xl px-8 py-16'}`}>
                    <div className={`mb-5 flex items-center justify-center border border-telegram-border bg-white/[0.04] ${compact ? 'h-16 w-16 rounded-lg' : 'h-20 w-20 rounded-xl'}`}>
                        <ImageIcon className={`${compact ? 'w-7 h-7' : 'w-9 h-9'} text-telegram-secondary`} />
                    </div>
                    <h3 className={`mt-3 font-semibold tracking-tight text-telegram-text ${compact ? 'text-lg' : 'text-xl'}`}>No images found here yet</h3>
                    <p className="mt-2 text-sm leading-6 text-telegram-subtext">
                        Add photos or artwork here, or switch back to grid view for mixed file types.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex-1 overflow-auto custom-scrollbar px-6 py-4 outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-telegram-text">Gallery</h3>
                <div className="flex items-center gap-2 text-xs text-telegram-subtext">
                    <span>{selectedIds.length > 0 ? `${selectedIds.length} selected · ` : ''}{imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''}</span>
                    <select
                        value={slideshowDelayMs}
                        onChange={(e) => setSlideshowDelayMs(Number(e.target.value))}
                        className="rounded-md border border-telegram-border bg-telegram-surface px-2 py-1 text-xs text-telegram-subtext outline-none"
                        title="Slideshow speed"
                    >
                        <option value={2000}>2s</option>
                        <option value={5000}>5s</option>
                        <option value={10000}>10s</option>
                    </select>
                    <button
                        onClick={() => {
                            const nextIndex = focusedIndex ?? slideshowIndex;
                            setSlideshowIndex(nextIndex);
                            if (!slideshowActive) onPreview(imageFiles[nextIndex] ?? imageFiles[0]);
                            setSlideshowActive((value) => !value);
                        }}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition ${slideshowActive ? 'border-telegram-primary/40 bg-telegram-primary/15 text-telegram-primary' : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'}`}
                        title={slideshowActive ? 'Pause slideshow' : 'Start slideshow'}
                    >
                        {slideshowActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {slideshowActive ? 'Pause' : 'Slideshow'}
                    </button>
                </div>
                <div className="hidden text-xs text-telegram-subtext">
                    {selectedIds.length > 0 ? `${selectedIds.length} selected · ` : ''}{imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''}
                    {focusedIndex !== null && <span className="ml-2 text-telegram-subtext/60">· arrows to navigate, Enter to preview, Space to select</span>}
                </div>
            </div>

            <div ref={gridRef} className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {imageFiles.map((file, i) => (
                    <GalleryItem
                        key={file.id}
                        file={file}
                        activeFolderId={activeFolderId}
                        isFavorite={favoriteIds.has(file.id)}
                        isSelected={selectedIds.includes(file.id)}
                        isFocused={focusedIndex === i}
                        selectionMode={selectionMode}
                        onToggleFavorite={onToggleFavorite}
                        onPreview={(f) => { setFocusedIndex(i); onPreview(f); }}
                        onToggleSelection={onToggleSelection}
                        itemRef={(el) => { itemRefs.current[i] = el; }}
                    />
                ))}
            </div>
        </div>
    );
}
