import { Copy, X } from 'lucide-react';
import { QueueItem } from '../../types';

interface DuplicateDialogProps {
    item: QueueItem;
    onForceUpload: (id: string) => void;
    onSkip: (id: string) => void;
}

export function DuplicateDialog({ item, onForceUpload, onSkip }: DuplicateDialogProps) {
    const fileName = item.path.split(/[/\\]/).pop() ?? item.path;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-yellow-400/20 bg-telegram-surface p-6 shadow-2xl">
                <button
                    onClick={() => onSkip(item.id)}
                    className="absolute right-3 top-3 rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text"
                >
                    <X className="h-4 w-4" />
                </button>

                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-400/10">
                    <Copy className="h-6 w-6 text-yellow-300" />
                </div>

                <h2 className="mb-1 text-base font-semibold text-telegram-text">File already exists</h2>
                <p className="mb-1 text-sm text-telegram-subtext">
                    <span className="font-medium text-telegram-text">{fileName}</span> is already in this folder (same hash).
                </p>
                <p className="mb-5 text-xs text-telegram-subtext/70">
                    You can upload a second copy anyway, or skip this file.
                </p>

                <div className="flex gap-2">
                    <button
                        onClick={() => onSkip(item.id)}
                        className="flex-1 rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:bg-white/[0.05]"
                    >
                        Skip
                    </button>
                    <button
                        onClick={() => onForceUpload(item.id)}
                        className="flex-1 rounded-lg bg-telegram-primary px-3 py-2 text-sm font-medium text-black transition hover:opacity-90"
                    >
                        Upload Anyway
                    </button>
                </div>
            </div>
        </div>
    );
}
