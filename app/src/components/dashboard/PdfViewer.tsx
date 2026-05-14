import { useEffect, useState, useRef, type MouseEvent } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, FileText, Shield } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { resolveFileFolderId } from '../../utils';

import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    activeFolderId: number | null;
}

export function PdfViewer({ file, onClose, onNext, onPrev, currentIndex, totalItems, activeFolderId }: PdfViewerProps) {
    const [streamToken, setStreamToken] = useState<string | null>(null);
    const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [numPages, setNumPages] = useState<number>(0);
    const [scale, setScale] = useState<number>(1.2);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

    useEffect(() => {
        tauriApi.getStreamToken().then(setStreamToken).catch((err) => {
            console.error('Failed to get stream token:', err);
            setError('Failed to initialize stream');
        });
    }, []);

    useEffect(() => {
        if (!streamToken) return;

        let cancelled = false;
        setLoading(true);
        setError(null);
        setPdf(null);
        setNumPages(0);

        const folderId = resolveFileFolderId(file, activeFolderId);
        const folderIdParam = folderId !== null ? folderId.toString() : 'home';
        const streamUrl = `http://localhost:14200/stream/${folderIdParam}/${file.id}?token=${streamToken}`;

        const loadingTask = pdfjsLib.getDocument(streamUrl);

        loadingTask.promise.then(
            (pdfDoc) => {
                if (cancelled) {
                    pdfDoc.destroy();
                    return;
                }

                if (pdfRef.current) {
                    pdfRef.current.destroy();
                }

                pdfRef.current = pdfDoc;
                setPdf(pdfDoc);
                setNumPages(pdfDoc.numPages);
                setLoading(false);
            },
            (err) => {
                if (cancelled) return;
                console.error('Error loading PDF:', err);
                setError('Failed to load PDF document.');
                setLoading(false);
            }
        );

        return () => {
            cancelled = true;
            loadingTask.destroy();
        };
    }, [streamToken, activeFolderId, file.id]);

    useEffect(() => {
        return () => {
            if (pdfRef.current) {
                pdfRef.current.destroy();
                pdfRef.current = null;
            }
        };
    }, []);

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
                return;
            }

            if (e.key === '=' || key === '+') {
                e.preventDefault();
                setScale((value) => Math.min(value + 0.2, 3));
            }

            if (e.key === '-') {
                e.preventDefault();
                setScale((value) => Math.max(value - 0.2, 0.5));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    const handleZoomIn = (e: MouseEvent) => {
        e.stopPropagation();
        setScale((value) => Math.min(value + 0.2, 3));
    };

    const handleZoomOut = (e: MouseEvent) => {
        e.stopPropagation();
        setScale((value) => Math.max(value - 0.2, 0.5));
    };

    const handleFitWidth = (e: MouseEvent) => {
        e.stopPropagation();
        setScale(1.2);
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col bg-[linear-gradient(180deg,rgba(4,10,17,0.82),rgba(2,7,13,0.96))] p-4 backdrop-blur-lg animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div className="pointer-events-none absolute left-0 right-0 top-4 z-10 flex items-start justify-between gap-4 px-6">
                <div className="pointer-events-auto flex min-w-0 items-center gap-3 rounded-lg border border-telegram-border bg-telegram-surface/95 px-4 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-secondary">
                        <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="max-w-sm truncate text-sm font-semibold text-telegram-text">{file.name}</h3>
                    </div>
                </div>

                <div className="pointer-events-auto flex items-center gap-2">
                    {file.is_encrypted && (
                        <div className="flex items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-200">
                            <Shield className="w-3.5 h-3.5" />
                            Encrypted PDF
                        </div>
                    )}

                    <div className="flex items-center gap-2 rounded-full border border-telegram-border bg-telegram-surface/95 p-1.5">
                        <button onClick={handleZoomOut} className="rounded-full p-2 text-telegram-subtext transition hover:bg-white/10 hover:text-telegram-text" title="Zoom Out (-)">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <span className="min-w-[3rem] text-center text-xs font-medium text-telegram-text">{Math.round(scale * 100)}%</span>
                        <button onClick={handleZoomIn} className="rounded-full p-2 text-telegram-subtext transition hover:bg-white/10 hover:text-telegram-text" title="Zoom In (+)">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        <div className="mx-1 h-4 w-px bg-telegram-border"></div>
                        <button onClick={handleFitWidth} className="rounded-full p-2 text-telegram-subtext transition hover:bg-white/10 hover:text-telegram-text" title="Fit Width">
                            <Maximize className="w-4 h-4" />
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                        title="Close document"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                title="Previous file (ArrowLeft / J)"
            >
                <ChevronLeft className="w-6 h-6" />
            </button>

            <button
                onClick={(e) => { e.stopPropagation(); onNext?.(); }}
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                title="Next file (ArrowRight / L)"
            >
                <ChevronRight className="w-6 h-6" />
            </button>

            <div
                ref={containerRef}
                className="relative flex flex-1 w-full flex-col items-center overflow-auto custom-scrollbar pt-22 pb-8"
                onClick={(e) => e.stopPropagation()}
            >
                {loading && (
                    <div className="absolute inset-0 flex flex-1 flex-col items-center justify-center text-telegram-text">
                        <div className="mb-4 w-10 h-10 border-4 border-telegram-secondary/40 border-t-telegram-secondary rounded-full animate-spin"></div>
                        <p className="text-sm font-medium">Loading document...</p>
                        <p className="mt-1 text-xs text-telegram-subtext">Loading pages from Telegram storage.</p>
                    </div>
                )}

                {error && (
                    <div className="mt-20 flex flex-col items-center justify-center rounded-xl border border-red-500/25 bg-red-500/8 p-6 text-red-100">
                        <p className="mb-2 text-sm font-semibold">Document error</p>
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {pdf && numPages > 0 && (
                    <div className="flex w-full flex-col items-center gap-4">
                        {Array.from({ length: numPages }, (_, index) => (
                            <PdfPage
                                key={`${file.id}_page_${index + 1}`}
                                pageNumber={index + 1}
                                pdf={pdf}
                                scale={scale}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-telegram-border bg-telegram-surface/92 px-4 py-2 text-sm text-telegram-subtext">
                {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 && (
                    <span className="mr-3 border-r border-telegram-border pr-3">File {currentIndex + 1} of {totalItems}</span>
                )}
                <span>{numPages} {numPages === 1 ? 'page' : 'pages'}</span>
            </div>
        </div>
    );
}

function PdfPage({ pageNumber, pdf, scale }: { pageNumber: number; pdf: pdfjsLib.PDFDocumentProxy; scale: number }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [page, setPage] = useState<pdfjsLib.PDFPageProxy | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setIsVisible(true);
                }
            },
            { rootMargin: '1000px 0px' }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible || !pdf) return;

        let cancelled = false;
        pdf.getPage(pageNumber).then((loadedPage) => {
            if (!cancelled) {
                setPage(loadedPage);
            }
        }).catch((err) => console.error(`Error loading page ${pageNumber}:`, err));

        return () => {
            cancelled = true;
        };
    }, [isVisible, pdf, pageNumber]);

    useEffect(() => {
        if (!page || !canvasRef.current || !isVisible) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context) return;

        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;
        context.clearRect(0, 0, viewport.width, viewport.height);

        const renderTask = page.render({
            canvasContext: context,
            viewport,
            canvas,
        });
        renderTaskRef.current = renderTask;

        renderTask.promise.catch((err) => {
            if (err?.name !== 'RenderingCancelledException') {
                console.error(`Render error on page ${pageNumber}:`, err);
            }
        });

        return () => {
            renderTask.cancel();
            renderTaskRef.current = null;
        };
    }, [page, scale, isVisible, pageNumber]);

    const estimatedHeight = 1056 * scale;
    const estimatedWidth = 816 * scale;

    return (
        <div
            ref={containerRef}
            className="relative my-2 flex flex-col items-center overflow-hidden rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 shadow-[0_10px_40px_rgba(0,0,0,0.38)] transition-shadow"
            style={{
                minHeight: !page ? `${estimatedHeight}px` : undefined,
                minWidth: !page ? `${estimatedWidth}px` : undefined,
            }}
        >
            <canvas ref={canvasRef} className="h-auto max-w-full rounded-[1rem] bg-white" />

            {!page && isVisible && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/30">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    );
}
