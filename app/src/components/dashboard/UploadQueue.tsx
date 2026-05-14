import { ArrowUpToLine, RotateCcw, X } from 'lucide-react';
import { QueueItem } from "../../types";

interface UploadQueueProps {
    items: QueueItem[];
    onClearFinished: () => void;
    onCancelAll: () => void;
    onRetry: (id: string) => void;
}

const STATUS_DOT: Record<string, string> = {
    pending: 'bg-yellow-500',
    uploading: 'bg-telegram-primary animate-pulse',
    cancelled: 'bg-gray-500',
    skipped: 'bg-amber-400',
    error: 'bg-red-500',
    success: 'bg-green-500',
};

export function UploadQueue({ items, onClearFinished, onCancelAll, onRetry }: UploadQueueProps) {
    if (items.length === 0) return null;

    const hasPendingOrActive = items.some((item) => item.status === 'pending' || item.status === 'uploading');
    const errorCount = items.filter((item) => item.status === 'error').length;
    const activeCount = items.filter((item) => item.status === 'pending' || item.status === 'uploading').length;
    const latestItems = items.slice(-6).reverse();

    return (
        <section className="w-[22rem] overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-telegram-border/80 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                        <ArrowUpToLine className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-telegram-text">Upload Queue</h4>
                        <p className="text-[11px] text-telegram-subtext">{activeCount} active {activeCount === 1 ? 'transfer' : 'transfers'}</p>
                    </div>
                    {errorCount > 0 && (
                        <span className="rounded-full bg-red-500/16 px-2 py-1 text-[10px] font-medium text-red-300">
                            {errorCount} failed
                        </span>
                    )}
                </div>

                <div className="flex gap-2">
                    {hasPendingOrActive && (
                        <button onClick={onCancelAll} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/18">
                            Cancel All
                        </button>
                    )}
                    <button onClick={onClearFinished} className="rounded-lg border border-telegram-border px-3 py-1.5 text-xs font-medium text-telegram-subtext transition hover:text-telegram-text">
                        Clear
                    </button>
                </div>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                {latestItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-telegram-border bg-white/[0.03] p-3">
                        <div className="flex items-start gap-3 text-sm">
                            <div className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ${STATUS_DOT[item.status] ?? 'bg-gray-500'}`} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-medium text-telegram-text" title={item.path}>
                                    {item.path.split(/[/\\]/).pop()}
                                </div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">
                                    {item.status}
                                </div>
                                {item.status === 'error' && item.error && (
                                    <div className="mt-1 truncate text-[10px] text-red-300" title={item.error}>
                                        {item.error.length > 60 ? item.error.slice(0, 60) + '...' : item.error}
                                    </div>
                                )}
                            </div>

                            {item.status === 'uploading' && item.progress !== undefined && (
                                <span className="flex-shrink-0 text-xs font-mono text-telegram-primary">{item.progress}%</span>
                            )}

                            {item.status === 'error' && (
                                <button
                                    onClick={() => onRetry(item.id)}
                                    className="flex-shrink-0 rounded-lg p-2 text-telegram-primary transition hover:bg-white/[0.05] hover:text-telegram-text"
                                    title="Retry upload"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {item.status === 'cancelled' && (
                                <span className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-400">
                                    <X className="w-3 h-3" />
                                    Cancelled
                                </span>
                            )}

                            {item.status === 'skipped' && (
                                <span className="flex-shrink-0 text-xs text-amber-300">Skipped</span>
                            )}
                        </div>

                        {item.status === 'uploading' && (
                            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-telegram-border">
                                {item.progress !== undefined ? (
                                    <div
                                        className="h-full rounded-full bg-telegram-primary transition-all duration-300"
                                        style={{ width: `${item.progress}%` }}
                                    />
                                ) : (
                                    <div className="h-full w-full animate-progress-indeterminate bg-telegram-primary" />
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
