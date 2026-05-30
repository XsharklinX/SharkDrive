import { GitCompareArrows, X } from 'lucide-react';
import { QueueItem } from '../../types';

interface BackupConflictDialogProps {
    item: QueueItem;
    onUploadVersion: (id: string) => void;
    onKeepTelegram: (id: string) => void;
}

export function BackupConflictDialog({ item, onUploadVersion, onKeepTelegram }: BackupConflictDialogProps) {
    const fileName = item.remoteName || item.path.split(/[/\\]/).pop() || item.path;

    return (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative mx-4 w-full max-w-md rounded-2xl border border-amber-400/20 bg-telegram-surface p-6 shadow-2xl">
                <button
                    onClick={() => onKeepTelegram(item.id)}
                    className="absolute right-3 top-3 rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text"
                    title="Keep Telegram version"
                >
                    <X className="h-4 w-4" />
                </button>

                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/10">
                    <GitCompareArrows className="h-6 w-6 text-amber-300" />
                </div>

                <h2 className="mb-1 text-base font-semibold text-telegram-text">Backup conflict detected</h2>
                <p className="text-sm leading-6 text-telegram-subtext">
                    <span className="font-medium text-telegram-text">{fileName}</span> changed locally while Telegram already has a different version with the same name.
                </p>
                <p className="mb-5 mt-2 text-xs leading-5 text-telegram-subtext/75">
                    Keeping Telegram skips this upload. Uploading a new version preserves the existing Telegram file and adds the local version.
                </p>

                <div className="flex gap-2">
                    <button
                        onClick={() => onKeepTelegram(item.id)}
                        className="flex-1 rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:bg-white/[0.05]"
                    >
                        Keep Telegram
                    </button>
                    <button
                        onClick={() => onUploadVersion(item.id)}
                        className="flex-1 rounded-lg bg-telegram-primary px-3 py-2 text-sm font-medium text-black transition hover:opacity-90"
                    >
                        Upload New Version
                    </button>
                </div>
            </div>
        </div>
    );
}
