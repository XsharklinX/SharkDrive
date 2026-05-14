import { DownloadItem } from "../../types";
import { Download, Check, X, AlertCircle } from "lucide-react";

interface DownloadQueueProps {
    items: DownloadItem[];
    onClearFinished: () => void;
    onCancelAll: () => void;
}

export function DownloadQueue({ items, onClearFinished, onCancelAll }: DownloadQueueProps) {
    if (items.length === 0) return null;

    const activeCount = items.filter((item) => item.status === 'pending' || item.status === 'downloading').length;
    const completedCount = items.filter((item) => item.status === 'success').length;
    const latestItems = items.slice(-6).reverse();

    return (
        <section className="w-[22rem] overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-telegram-border/80 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-secondary">
                        <Download className="w-4 h-4" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-telegram-text">Download Queue</h4>
                        <p className="text-[11px] text-telegram-subtext">{activeCount} active {activeCount === 1 ? 'transfer' : 'transfers'}</p>
                    </div>
                    {activeCount > 0 && (
                        <span className="rounded-full bg-telegram-secondary/16 px-2 py-1 text-[10px] font-medium text-telegram-secondary">
                            {activeCount} active
                        </span>
                    )}
                </div>

                <div className="flex gap-2">
                    {activeCount > 0 && (
                        <button onClick={onCancelAll} className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/18">
                            Cancel All
                        </button>
                    )}
                    {completedCount > 0 && (
                        <button onClick={onClearFinished} className="rounded-lg border border-telegram-border px-3 py-1.5 text-xs font-medium text-telegram-subtext transition hover:text-telegram-text">
                            Clear Finished
                        </button>
                    )}
                </div>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                {latestItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-telegram-border bg-white/[0.03] p-3">
                        <div className="flex items-start gap-3 text-sm">
                            <div className="flex-shrink-0">
                                {item.status === 'pending' && <div className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500/20"><div className="h-2 w-2 rounded-full bg-yellow-500" /></div>}
                                {item.status === 'downloading' && <div className="h-4 w-4 rounded-full border-2 border-telegram-secondary border-t-transparent animate-spin" />}
                                {item.status === 'success' && <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/20"><Check className="w-3 h-3 text-green-500" /></div>}
                                {item.status === 'error' && <div className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20"><X className="w-3 h-3 text-red-500" /></div>}
                                {item.status === 'cancelled' && <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-500/20"><X className="w-3 h-3 text-gray-400" /></div>}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-medium text-telegram-text" title={item.filename}>
                                    {item.filename}
                                </div>
                                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-telegram-subtext">
                                    {item.status}
                                </div>
                            </div>

                            {item.status === 'downloading' && item.progress !== undefined && (
                                <div className="text-xs font-mono text-telegram-secondary">{item.progress}%</div>
                            )}

                            {item.status === 'cancelled' && <div className="text-xs text-gray-400">Cancelled</div>}
                        </div>

                        {item.status === 'downloading' && (
                            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-telegram-border">
                                {item.progress !== undefined ? (
                                    <div
                                        className="h-full rounded-full bg-telegram-secondary transition-all duration-300"
                                        style={{ width: `${item.progress}%` }}
                                    />
                                ) : (
                                    <div className="h-full w-full animate-progress-indeterminate bg-telegram-secondary" />
                                )}
                            </div>
                        )}

                        {item.status === 'error' && item.error && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-red-300">
                                <AlertCircle className="w-3 h-3" />
                                <span className="truncate">{item.error}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    )
}
