import { X, History, RotateCcw, Clock, HardDrive } from 'lucide-react';
import { TelegramFile } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { tauriApi } from '../../api/tauri';
import { useState } from 'react';

interface VersionHistoryModalProps {
    filename: string;
    folderId: number | null;
    versions: TelegramFile[]; // all files sharing this name in this folder, sorted newest first
    onClose: () => void;
    onRestored: () => void;
}

function formatSize(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
        return new Date(dateStr).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

export function VersionHistoryModal({ filename, folderId, versions, onClose, onRestored }: VersionHistoryModalProps) {
    const { t } = useLanguage();
    const [restoringId, setRestoringId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleRestore(file: TelegramFile) {
        setRestoringId(file.id);
        setError(null);
        try {
            await tauriApi.restoreVersion(file.id, folderId);
            onRestored();
            onClose();
        } catch (e) {
            setError(String(e));
            setRestoringId(null);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative mx-4 flex w-full max-w-lg flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                style={{ maxHeight: '80vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <History className="h-5 w-5 flex-shrink-0 text-telegram-primary" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-telegram-text">{filename}</p>
                            <p className="text-xs text-telegram-subtext">{versions.length} {versions.length === 1 ? 'version' : 'versions'}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-3 rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-auto">
                    {error && (
                        <div className="mx-5 mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">
                            {error}
                        </div>
                    )}

                    <ul className="divide-y divide-telegram-border/50 px-2 py-2">
                        {versions.map((file, idx) => {
                            const isCurrent = idx === 0;
                            return (
                                <li
                                    key={file.id}
                                    className="flex items-center gap-4 rounded-xl px-4 py-3 transition hover:bg-white/[0.03]"
                                >
                                    {/* Version badge */}
                                    <div className="flex-shrink-0 text-center">
                                        <div className={`rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums ${
                                            isCurrent
                                                ? 'bg-telegram-primary/15 text-telegram-primary'
                                                : 'bg-white/[0.06] text-telegram-subtext'
                                        }`}>
                                            v{versions.length - idx}
                                        </div>
                                        {isCurrent && (
                                            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-telegram-primary/80">
                                                {t('current')}
                                            </p>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 text-xs text-telegram-subtext">
                                            <Clock className="h-3 w-3 flex-shrink-0" />
                                            <span>{formatDate(file.created_at)}</span>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2 text-xs text-telegram-subtext/70">
                                            <HardDrive className="h-3 w-3 flex-shrink-0" />
                                            <span>{formatSize(file.size)}</span>
                                        </div>
                                    </div>

                                    {/* Restore button */}
                                    {!isCurrent && (
                                        <button
                                            onClick={() => handleRestore(file)}
                                            disabled={restoringId === file.id}
                                            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-1.5 text-xs text-telegram-subtext transition hover:border-telegram-primary/50 hover:bg-telegram-primary/10 hover:text-telegram-primary disabled:opacity-50"
                                        >
                                            {restoringId === file.id ? (
                                                <div className="h-3 w-3 animate-spin rounded-full border border-telegram-primary/30 border-t-telegram-primary" />
                                            ) : (
                                                <RotateCcw className="h-3 w-3" />
                                            )}
                                            {t('restore')}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="flex-shrink-0 border-t border-telegram-border px-6 py-3">
                    <p className="text-xs text-telegram-subtext/60">
                        {t('versionHistoryHint')}
                    </p>
                </div>
            </div>
        </div>
    );
}
