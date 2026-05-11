import { RotateCcw } from 'lucide-react';
import { QueueItem } from "../../types";

interface UploadQueueProps {
    items: QueueItem[];
    onClearFinished: () => void;
    onCancelAll: () => void;
    onRetry: (id: string) => void;
}

const STATUS_DOT: Record<string, string> = {
    pending: 'bg-yellow-500',
    uploading: 'bg-blue-500 animate-pulse',
    cancelled: 'bg-gray-500',
    skipped: 'bg-amber-400',
    error: 'bg-red-500',
    success: 'bg-green-500',
};

export function UploadQueue({ items, onClearFinished, onCancelAll, onRetry }: UploadQueueProps) {
    if (items.length === 0) return null;

    const hasPendingOrActive = items.some(i => i.status === 'pending' || i.status === 'uploading');
    const errorCount = items.filter(i => i.status === 'error').length;

    return (
        <div className="fixed bottom-4 right-4 w-80 bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl overflow-hidden z-[100]">
            <div className="p-3 border-b border-telegram-border bg-telegram-hover flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-telegram-text">Uploads</h4>
                    {errorCount > 0 && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">
                            {errorCount} failed
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    {hasPendingOrActive && (
                        <button onClick={onCancelAll} className="text-xs text-red-400 hover:text-red-300 transition-colors">Cancel All</button>
                    )}
                    <button onClick={onClearFinished} className="text-xs text-telegram-primary hover:text-telegram-text transition-colors">Clear</button>
                </div>
            </div>
            <div className="max-h-60 overflow-y-auto p-2 space-y-2">
                {items.map(item => (
                    <div key={item.id} className="flex flex-col gap-1 p-2 bg-telegram-hover rounded">
                        <div className="flex items-center gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[item.status] ?? 'bg-gray-500'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="truncate text-telegram-subtext text-xs" title={item.path}>
                                    {item.path.split(/[/\\]/).pop()}
                                </div>
                                {item.status === 'error' && item.error && (
                                    <div className="text-[10px] text-red-400 truncate mt-0.5" title={item.error}>
                                        {item.error.length > 60 ? item.error.slice(0, 60) + '…' : item.error}
                                    </div>
                                )}
                            </div>
                            {item.status === 'uploading' && item.progress !== undefined && (
                                <span className="text-xs text-blue-400 font-mono flex-shrink-0">{item.progress}%</span>
                            )}
                            {item.status === 'error' && (
                                <button
                                    onClick={() => onRetry(item.id)}
                                    className="flex-shrink-0 p-1 text-telegram-primary hover:text-telegram-text transition-colors"
                                    title="Retry upload"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                </button>
                            )}
                            {item.status === 'cancelled' && (
                                <span className="text-xs text-gray-400 flex-shrink-0">Cancelled</span>
                            )}
                            {item.status === 'skipped' && (
                                <span className="text-xs text-amber-400 flex-shrink-0">Skipped</span>
                            )}
                        </div>
                        {item.status === 'uploading' && (
                            <div className="w-full bg-telegram-border h-1 rounded-full overflow-hidden">
                                {item.progress !== undefined ? (
                                    <div
                                        className="bg-blue-500 h-full rounded-full transition-all duration-300"
                                        style={{ width: `${item.progress}%` }}
                                    />
                                ) : (
                                    <div className="bg-blue-500 h-full w-full animate-progress-indeterminate" />
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
