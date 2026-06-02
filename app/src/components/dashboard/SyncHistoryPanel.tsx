import { useEffect, useState } from 'react';
import { X, RefreshCw, Plus, Minus, FolderOpen, Clock } from 'lucide-react';
import { SyncSession } from '../../types';
import { tauriApi } from '../../api/tauri';
import { useLanguage } from '../../context/LanguageContext';

interface SyncHistoryPanelProps {
    onClose: () => void;
}

function formatDuration(startMs: number, endMs: number): string {
    const secs = Math.round((endMs - startMs) / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function formatDate(ms: number): string {
    try {
        return new Date(ms).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return String(ms);
    }
}

function SessionRow({ session }: { session: SyncSession }) {
    const [expanded, setExpanded] = useState(false);
    const hasChanges = session.files_added.length > 0 || session.files_removed.length > 0;

    return (
        <div className="rounded-xl border border-telegram-border/50 bg-white/[0.02] transition hover:bg-white/[0.04]">
            <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => hasChanges && setExpanded(e => !e)}
            >
                {/* Icon */}
                <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                    hasChanges ? 'bg-telegram-primary/15' : 'bg-white/[0.06]'
                }`}>
                    <RefreshCw className={`h-4 w-4 ${hasChanges ? 'text-telegram-primary' : 'text-telegram-subtext'}`} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <FolderOpen className="h-3 w-3 text-telegram-subtext/60" />
                        <span className="truncate text-sm font-medium text-telegram-text">
                            {session.folder_name}
                        </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-telegram-subtext">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(session.started_at_ms)}
                        </span>
                        <span>{formatDuration(session.started_at_ms, session.completed_at_ms)}</span>
                        <span>{session.files_total} files</span>
                    </div>
                </div>

                {/* Badges */}
                <div className="flex flex-shrink-0 items-center gap-2">
                    {session.files_added.length > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                            <Plus className="h-2.5 w-2.5" />
                            {session.files_added.length}
                        </span>
                    )}
                    {session.files_removed.length > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-400">
                            <Minus className="h-2.5 w-2.5" />
                            {session.files_removed.length}
                        </span>
                    )}
                    {!hasChanges && (
                        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-telegram-subtext">
                            no changes
                        </span>
                    )}
                </div>
            </button>

            {/* Expandable diff */}
            {expanded && hasChanges && (
                <div className="border-t border-telegram-border/40 px-4 py-3 space-y-2">
                    {session.files_added.length > 0 && (
                        <div>
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">Added</p>
                            <ul className="space-y-0.5">
                                {session.files_added.map((name, i) => (
                                    <li key={i} className="flex items-center gap-1.5 text-xs text-telegram-subtext">
                                        <Plus className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                                        <span className="truncate">{name}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {session.files_removed.length > 0 && (
                        <div>
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-400/80">Removed</p>
                            <ul className="space-y-0.5">
                                {session.files_removed.map((name, i) => (
                                    <li key={i} className="flex items-center gap-1.5 text-xs text-telegram-subtext">
                                        <Minus className="h-3 w-3 text-red-400 flex-shrink-0" />
                                        <span className="truncate">{name}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function SyncHistoryPanel({ onClose }: SyncHistoryPanelProps) {
    const { t } = useLanguage();
    const [sessions, setSessions] = useState<SyncSession[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        tauriApi.getSyncHistory(100)
            .then(setSessions)
            .catch(() => setSessions([]))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative mx-4 flex w-full max-w-xl flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                style={{ maxHeight: '85vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="h-5 w-5 text-telegram-primary" />
                        <div>
                            <p className="text-sm font-semibold text-telegram-text">{t('syncHistory')}</p>
                            <p className="text-xs text-telegram-subtext">{sessions.length} sessions recorded</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-auto p-4">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center">
                            <div className="h-7 w-7 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                            <RefreshCw className="h-10 w-10 text-telegram-subtext/30" />
                            <p className="text-sm text-telegram-subtext">{t('noSyncHistory')}</p>
                            <p className="text-xs text-telegram-subtext/60">Sync a folder to start tracking</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sessions.map(session => (
                                <SessionRow key={session.id} session={session} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
