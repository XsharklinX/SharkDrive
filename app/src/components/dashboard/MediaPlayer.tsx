import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Radio, Shield, Video } from 'lucide-react';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { isVideoFile, isAudioFile, resolveFileFolderId } from '../../utils';

let cachedStreamToken: string | null = null;

interface MediaPlayerProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    activeFolderId: number | null;
}

export function MediaPlayer({ file, onClose, onNext, onPrev, currentIndex, totalItems, activeFolderId }: MediaPlayerProps) {
    const [streamToken, setStreamToken] = useState<string | null>(null);
    const [posterSrc, setPosterSrc] = useState<string | null>(null);

    useEffect(() => {
        if (cachedStreamToken) {
            setStreamToken(cachedStreamToken);
            return;
        }

        tauriApi.getStreamToken().then((token) => {
            cachedStreamToken = token;
            setStreamToken(token);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        let cancelled = false;
        setPosterSrc(null);

        tauriApi.getThumbnail(file.id, resolveFileFolderId(file, activeFolderId))
            .then((result) => {
                if (!cancelled && result) setPosterSrc(result);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [activeFolderId, file.id]);

    const folderId = resolveFileFolderId(file, activeFolderId);
    const folderIdParam = folderId !== null ? folderId.toString() : 'home';
    const streamUrl = streamToken
        ? `http://localhost:14200/stream/${folderIdParam}/${file.id}?token=${streamToken}`
        : null;

    const isVideo = isVideoFile(file.name);
    const isAudio = isAudioFile(file.name);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            const key = e.key.toLowerCase();

            if (e.key === 'ArrowRight' || key === 'l') {
                e.preventDefault();
                onNext?.();
                return;
            }

            if (e.key === 'ArrowLeft' || key === 'j') {
                e.preventDefault();
                onPrev?.();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-[linear-gradient(180deg,rgba(4,10,17,0.8),rgba(2,7,13,0.94))] p-4 backdrop-blur-lg animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div className="relative flex w-full max-w-6xl flex-col gap-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-telegram-border bg-telegram-surface/95 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-secondary">
                            {isVideo ? <Video className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-telegram-text">{file.name}</h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {file.is_encrypted && (
                            <div className="flex items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-200">
                                <Shield className="w-3.5 h-3.5" />
                                Encrypted
                            </div>
                        )}
                        {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 && (
                            <div className="rounded-full border border-telegram-border bg-telegram-surface/95 px-3 py-2 text-xs text-telegram-subtext">
                                Item {currentIndex + 1} of {totalItems}
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                            title="Close media player"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <button
                    onClick={onPrev}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                    title="Previous (ArrowLeft / J)"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                    onClick={onNext}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                    title="Next (ArrowRight / L)"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>

                <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface/95 p-3 shadow-2xl">
                    {!streamUrl ? (
                        <div className="flex flex-col items-center gap-4 text-telegram-text">
                            {posterSrc ? (
                                <div className="overflow-hidden rounded-[1.4rem] border border-telegram-border bg-black">
                                    <img src={posterSrc} alt="Video thumbnail" className="max-h-[55vh] max-w-full object-contain opacity-95" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 border-4 border-telegram-secondary/40 border-t-telegram-secondary rounded-full animate-spin"></div>
                            )}
                            <p className="text-sm font-medium">Preparing stream...</p>
                        </div>
                    ) : isVideo ? (
                        <video
                            src={streamUrl}
                            poster={posterSrc ?? undefined}
                            controls
                            autoPlay
                            className="h-full w-full rounded-[1.4rem] bg-black object-contain"
                        />
                    ) : isAudio ? (
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-[1.4rem] bg-[radial-gradient(circle_at_top,rgba(105,199,255,0.18),transparent_24%),linear-gradient(180deg,rgba(10,18,28,0.92),rgba(6,11,18,0.98))]">
                            <div className="mb-8 flex h-32 w-32 items-center justify-center rounded-full border border-telegram-border bg-telegram-surface shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 text-telegram-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                            </div>
                            <audio src={streamUrl} controls autoPlay className="w-full max-w-md px-4" />
                        </div>
                    ) : (
                        <div className="text-telegram-text">Unsupported media type</div>
                    )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-telegram-border bg-white/[0.03] px-4 py-3">
                    <div>
                        <h3 className="text-sm font-semibold text-telegram-text">{file.name}</h3>
                        <p className="text-xs text-telegram-subtext">Streaming from Telegram</p>
                    </div>
                    <p className="text-xs text-telegram-subtext">
                        {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 ? `${currentIndex + 1}/${totalItems}` : 'Live'}
                    </p>
                </div>
            </div>
        </div>
    );
}
