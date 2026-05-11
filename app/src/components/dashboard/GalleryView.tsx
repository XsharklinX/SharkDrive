import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { resolveFileFolderId } from '../../utils';

interface GalleryViewProps {
    files: TelegramFile[];
    activeFolderId: number | null;
    favoriteIds: Set<number>;
    onToggleFavorite: (id: number) => void;
    onPreview: (file: TelegramFile) => void;
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
            .then(result => { if (!cancelled && result) setThumbnail(result); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [file.id, activeFolderId]);

    return (
        <div
            className="relative group cursor-pointer rounded-xl overflow-hidden bg-telegram-surface aspect-square border border-telegram-border hover:border-telegram-primary/50 transition-all hover:shadow-[0_4px_20px_rgba(0,180,255,0.15)]"
            onClick={() => onPreview(file)}
        >
            {thumbnail ? (
                <img src={thumbnail} alt={file.name} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-telegram-subtext">
                    {loading
                        ? <div className="w-6 h-6 border-2 border-telegram-primary/30 border-t-telegram-primary rounded-full animate-spin" />
                        : <span className="text-2xl">🖼️</span>
                    }
                </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
                <p className="text-white text-xs font-medium truncate">{file.name}</p>
                <p className="text-white/60 text-[10px]">{file.sizeStr}</p>
            </div>
            <button
                onClick={e => { e.stopPropagation(); onToggleFavorite(file.id); }}
                className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${isFavorite ? 'opacity-100 text-yellow-400 bg-black/60' : 'opacity-0 group-hover:opacity-100 text-white bg-black/50 hover:text-yellow-400'}`}
                title={isFavorite ? 'Remove from Starred' : 'Add to Starred'}
            >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-yellow-400' : ''}`} />
            </button>
        </div>
    );
}

export function GalleryView({ files, activeFolderId, favoriteIds, onToggleFavorite, onPreview }: GalleryViewProps) {
    const imageFiles = files.filter(f => f.type !== 'folder' && isImageFile(f.name));

    if (imageFiles.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center flex-col gap-3 text-telegram-subtext p-6">
                <span className="text-5xl opacity-30">🖼️</span>
                <p className="text-sm">No images found in this folder</p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-6 overflow-auto custom-scrollbar">
            <p className="text-xs text-telegram-subtext mb-4">{imageFiles.length} image{imageFiles.length !== 1 ? 's' : ''}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {imageFiles.map(file => (
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
