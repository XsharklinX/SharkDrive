import { useState, useEffect, useRef } from 'react';
import { X, File, ChevronLeft, ChevronRight, Shield, Eye } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { isImageFile, resolveFileFolderId } from '../../utils';

const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;
const PREVIEW_CACHE_MAX_ITEMS = 8;

type PreviewCacheValue = {
    src: string;
    cachedAt: number;
};

const previewCache = new Map<string, PreviewCacheValue>();
const pendingPrefetch = new Set<string>();

const getPreviewCacheKey = (fileId: number, folderId: number | null) => `${folderId ?? 'home'}:${fileId}`;

const touchPreviewCache = (key: string, value: PreviewCacheValue) => {
    if (previewCache.has(key)) previewCache.delete(key);
    previewCache.set(key, value);

    while (previewCache.size > PREVIEW_CACHE_MAX_ITEMS) {
        const oldestKey = previewCache.keys().next().value;
        if (!oldestKey) break;
        previewCache.delete(oldestKey);
    }
};

const getCachedPreview = (key: string): string | null => {
    const value = previewCache.get(key);
    if (!value) return null;

    if (Date.now() - value.cachedAt > PREVIEW_CACHE_TTL_MS) {
        previewCache.delete(key);
        return null;
    }

    touchPreviewCache(key, value);
    return value.src;
};

const rememberPreview = (key: string, src: string) => {
    touchPreviewCache(key, { src, cachedAt: Date.now() });
};

const forgetPreview = (key: string) => {
    previewCache.delete(key);
};

const isSafeToPrefetch = (name: string) => isImageFile(name);

interface PreviewModalProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    nextFile?: TelegramFile | null;
    prevFile?: TelegramFile | null;
    activeFolderId: number | null;
}

export function PreviewModal({ file, onClose, onNext, onPrev, currentIndex, totalItems, nextFile, prevFile, activeFolderId }: PreviewModalProps) {
    const [src, setSrc] = useState<string | null>(null);
    const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadNonce, setReloadNonce] = useState(0);
    const [retryCount, setRetryCount] = useState(0);
    const latestRequestRef = useRef(0);

    useEffect(() => {
        setRetryCount(0);
        setReloadNonce(0);
        setThumbnailSrc(null);
    }, [file.id, activeFolderId]);

    useEffect(() => {
        if (!isImageFile(file.name)) return;

        let cancelled = false;
        tauriApi.getThumbnail(file.id, resolveFileFolderId(file, activeFolderId))
            .then((result) => {
                if (!cancelled && result) setThumbnailSrc(result);
            })
            .catch(() => {
                // Thumbnail is only a fast fallback for perceived performance.
            });

        return () => {
            cancelled = true;
        };
    }, [activeFolderId, file.id, file.name]);

    useEffect(() => {
        const load = async () => {
            const effectiveFolderId = resolveFileFolderId(file, activeFolderId);
            const key = getPreviewCacheKey(file.id, effectiveFolderId);
            const shouldBypassCache = reloadNonce > 0;
            const requestId = ++latestRequestRef.current;
            const cachedSrc = shouldBypassCache ? null : getCachedPreview(key);

            if (cachedSrc) {
                if (requestId !== latestRequestRef.current) return;
                setSrc(cachedSrc);
                setLoading(false);
                setError(null);
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const path = await tauriApi.getPreview(file.id, effectiveFolderId);
                if (requestId !== latestRequestRef.current) return;

                if (path) {
                    if (path.startsWith('data:')) {
                        setSrc(path);
                        rememberPreview(key, path);
                    } else {
                        const converted = convertFileSrc(path);
                        setSrc(converted);
                        rememberPreview(key, converted);
                    }
                } else {
                    setError('Preview not available');
                }
            } catch (e) {
                if (requestId !== latestRequestRef.current) return;
                setError(String(e));
            } finally {
                if (requestId !== latestRequestRef.current) return;
                setLoading(false);
            }
        };

        load();
    }, [file, activeFolderId, reloadNonce]);

    useEffect(() => {
        const candidates = [nextFile, prevFile].filter((candidate): candidate is TelegramFile => !!candidate && isSafeToPrefetch(candidate.name));

        candidates.forEach((candidate) => {
            const candidateFolderId = resolveFileFolderId(candidate, activeFolderId);
            const key = getPreviewCacheKey(candidate.id, candidateFolderId);
            if (getCachedPreview(key) || pendingPrefetch.has(key)) return;

            pendingPrefetch.add(key);
            tauriApi.getPreview(candidate.id, candidateFolderId).then((path) => {
                if (!path) return;
                const normalized = path.startsWith('data:') ? path : convertFileSrc(path);
                rememberPreview(key, normalized);
            }).catch(() => {
                // Prefetch failures are safe to ignore.
            }).finally(() => {
                pendingPrefetch.delete(key);
            });
        });
    }, [nextFile, prevFile, activeFolderId]);

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
            className="fixed inset-0 z-[150] flex items-center justify-center bg-[linear-gradient(180deg,rgba(4,10,17,0.78),rgba(2,7,13,0.92))] p-4 backdrop-blur-lg"
            onClick={onClose}
        >
            <div
                className="relative flex max-h-screen w-full max-w-6xl flex-col items-center justify-center gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex w-full items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-telegram-border bg-telegram-surface/95 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                            <Eye className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-telegram-text" title={file.name}>{file.name}</h3>
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
                            title="Close preview"
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

                {loading && (
                    <div className="flex min-h-[60vh] w-full max-w-5xl flex-col items-center justify-center gap-4 rounded-xl border border-telegram-border bg-telegram-surface/95 text-telegram-text">
                        {thumbnailSrc ? (
                            <div className="flex max-h-[72vh] max-w-full items-center justify-center overflow-hidden rounded-lg border border-telegram-border bg-black/35 p-2">
                                <img src={thumbnailSrc} alt="Preview thumbnail" className="max-h-[68vh] max-w-full rounded-md object-contain opacity-90" />
                            </div>
                        ) : (
                            <div className="w-10 h-10 border-4 border-telegram-primary/40 border-t-telegram-primary rounded-full animate-spin"></div>
                        )}
                        <p className="text-sm font-medium">Loading preview...</p>
                        <p className="text-xs text-telegram-subtext">Preparing preview from Telegram storage.</p>
                    </div>
                )}

                {error && (
                    <div className="w-full max-w-xl rounded-xl border border-red-500/25 bg-red-500/8 p-5 text-red-200">
                        <p className="text-sm font-semibold">Preview unavailable</p>
                        <p className="mt-1 text-sm text-red-100/80">{error}</p>
                    </div>
                )}

                {!loading && !error && src && (
                    <div className="flex w-full flex-col items-center gap-4">
                        {isImageFile(file.name) ? (
                            <div className="flex max-h-[78vh] w-full max-w-5xl items-center justify-center overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface/95 p-4">
                                <img
                                    src={src}
                                    className="max-h-[72vh] max-w-full rounded-lg object-contain bg-black/35 shadow-[0_20px_50px_rgba(0,0,0,0.42)]"
                                    alt="Preview"
                                    onError={() => {
                                        const key = getPreviewCacheKey(file.id, resolveFileFolderId(file, activeFolderId));
                                        forgetPreview(key);

                                        if (retryCount < 1) {
                                            setRetryCount((prev) => prev + 1);
                                            setReloadNonce((prev) => prev + 1);
                                            return;
                                        }

                                        setError('Failed to render image preview');
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="w-full max-w-xl rounded-xl border border-telegram-border bg-telegram-surface/95 p-8 text-center">
                                <div className="mx-auto mb-4 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                    <File className="w-10 h-10" />
                                </div>
                                <h3 className="text-xl font-semibold text-telegram-text">{file.name}</h3>
                                <p className="mt-2 text-sm text-telegram-subtext">This file type does not support in-app preview yet.</p>
                                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-telegram-subtext">
                                    {file.name.split('.').pop() || 'Unknown'} file
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div className="rounded-full border border-telegram-border bg-telegram-surface/90 px-4 py-2 text-xs text-telegram-subtext">
                    Preview navigation available with keyboard shortcuts.
                </div>
            </div>
        </div>
    );
}
