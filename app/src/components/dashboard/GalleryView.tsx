import { useState, useEffect } from 'react';
import { Star, Image as ImageIcon } from 'lucide-react';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { resolveFileFolderId } from '../../utils';

interface GalleryViewProps {
    files: TelegramFile[];
    activeFolderId: number | null;
    favoriteIds: Set<number>;
    onToggleFavorite: (id: number) => void;
    onPreview: (file: TelegramFile) => void;
    compact?: boolean;
}

function isImageFile(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic'].includes(ext);
}

function GalleryItem({ file, activeFolderId, isFavorite, onToggleFavorite, onPreview }: {
    file: TelegramFile;
    activeFolderId: number | null;
    isFavorite: boolean;
    onToggleFavorite: (id: number) => void;
    onPreview: (file: TelegramFile) => void;
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
            className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-telegram-border bg-telegram-surface transition-all hover:border-telegram-primary/35"
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
        </div>
    );
}

export function GalleryView({ files, activeFolderId, favoriteIds, onToggleFavorite, onPreview, compact = false }: GalleryViewProps) {
    const imageFiles = files.filter((file) => file.type !== 'folder' && isImageFile(file.name));

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
        <div className="flex-1 overflow-auto custom-scrollbar px-6 py-4">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-telegram-text">Gallery</h3>
                <div className="text-xs text-telegram-subtext">
                    {imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {imageFiles.map((file) => (
                    <GalleryItem
                        key={file.id}
                        file={file}
                        activeFolderId={activeFolderId}
                        isFavorite={favoriteIds.has(file.id)}
                        onToggleFavorite={onToggleFavorite}
                        onPreview={onPreview}
                    />
                ))}
            </div>
        </div>
    );
}
