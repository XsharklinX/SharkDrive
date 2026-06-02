import { useEffect, useState, useCallback } from 'react';
import { X, Copy, Trash2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { DuplicateGroup, TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { useLanguage } from '../../context/LanguageContext';

interface DuplicatesPanelProps {
    folders: { id: number | null; name: string }[];
    onClose: () => void;
    onDeleted: () => void;
}

function formatBytes(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

function folderName(file: TelegramFile, folders: { id: number | null; name: string }[]): string {
    if (file.folder_id == null) return 'Saved Messages';
    return folders.find(f => f.id === file.folder_id)?.name ?? `Folder ${file.folder_id}`;
}

interface GroupRowProps {
    group: DuplicateGroup;
    folders: { id: number | null; name: string }[];
    onDelete: (file: TelegramFile) => Promise<void>;
}

function GroupRow({ group, folders, onDelete }: GroupRowProps) {
    const [expanded, setExpanded] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [deleted, setDeleted] = useState<Set<number>>(new Set());

    async function handleDelete(file: TelegramFile) {
        setDeleting(file.id);
        try {
            await onDelete(file);
            setDeleted(prev => new Set([...prev, file.id]));
        } finally {
            setDeleting(null);
        }
    }

    const visibleFiles = group.files.filter(f => !deleted.has(f.id));

    return (
        <div className="rounded-xl border border-telegram-border/50 bg-white/[0.02]">
            <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(e => !e)}
            >
                <Copy className="h-4 w-4 flex-shrink-0 text-amber-400" />

                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-telegram-text">{group.display_key}</p>
                    <p className="text-xs text-telegram-subtext">
                        {visibleFiles.length} copies · {formatBytes(group.wasted_bytes)} wasted
                    </p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                        ×{visibleFiles.length}
                    </span>
                    {expanded
                        ? <ChevronUp className="h-4 w-4 text-telegram-subtext" />
                        : <ChevronDown className="h-4 w-4 text-telegram-subtext" />
                    }
                </div>
            </button>

            {expanded && (
                <div className="border-t border-telegram-border/40 divide-y divide-telegram-border/30">
                    {group.files.map((file, idx) => {
                        const isDeleted = deleted.has(file.id);
                        const isFirst = idx === 0;
                        return (
                            <div
                                key={file.id}
                                className={`flex items-center gap-3 px-4 py-2.5 ${isDeleted ? 'opacity-40' : ''}`}
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium text-telegram-text">
                                        {folderName(file, folders)}
                                        {isFirst && (
                                            <span className="ml-2 rounded bg-telegram-primary/15 px-1 py-0.5 text-[9px] font-bold uppercase text-telegram-primary">
                                                keep
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-[11px] text-telegram-subtext/70">
                                        {file.created_at ? new Date(file.created_at).toLocaleDateString() : '—'}
                                    </p>
                                </div>

                                {isDeleted ? (
                                    <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                                ) : !isFirst ? (
                                    <button
                                        onClick={() => handleDelete(file)}
                                        disabled={deleting === file.id}
                                        className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
                                    >
                                        {deleting === file.id ? (
                                            <div className="h-3 w-3 animate-spin rounded-full border border-red-400/30 border-t-red-400" />
                                        ) : (
                                            <Trash2 className="h-3 w-3" />
                                        )}
                                        Delete
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function DuplicatesPanel({ folders, onClose, onDeleted }: DuplicatesPanelProps) {
    const { t } = useLanguage();
    const [groups, setGroups] = useState<DuplicateGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const scan = useCallback(async () => {
        setScanning(true);
        setError(null);
        try {
            const result = await tauriApi.findDuplicates();
            setGroups(result);
        } catch (e) {
            setError(String(e));
        } finally {
            setScanning(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => { scan(); }, [scan]);

    const totalWasted = groups.reduce((sum, g) => sum + g.wasted_bytes, 0);

    async function handleDelete(file: TelegramFile) {
        await tauriApi.deleteFile(file.id, file.folder_id ?? null);
        onDeleted();
    }

    const folderList = [{ id: null, name: 'Saved Messages' }, ...folders];

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
                        <Copy className="h-5 w-5 text-amber-400" />
                        <div>
                            <p className="text-sm font-semibold text-telegram-text">{t('duplicates')}</p>
                            {totalWasted > 0 && (
                                <p className="text-xs text-telegram-subtext">
                                    {groups.length} groups · {formatBytes(totalWasted)} wasted
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={scan}
                            disabled={scanning}
                            className="flex items-center gap-1.5 rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-1.5 text-xs text-telegram-subtext transition hover:bg-white/[0.08] hover:text-telegram-text disabled:opacity-50"
                        >
                            <Copy className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
                            {t('rescan')}
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-auto p-4">
                    {loading || scanning ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-3">
                            <div className="h-7 w-7 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                            <p className="text-xs text-telegram-subtext">Scanning index…</p>
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                            {error}
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                            <CheckCircle className="h-10 w-10 text-emerald-400/50" />
                            <p className="text-sm font-medium text-telegram-text">{t('noDuplicates')}</p>
                            <p className="text-xs text-telegram-subtext/60">
                                No files with the same name and size found across folders.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {groups.map(group => (
                                <GroupRow
                                    key={group.display_key}
                                    group={group}
                                    folders={folderList}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {groups.length > 0 && !loading && (
                    <div className="flex-shrink-0 border-t border-telegram-border px-6 py-3">
                        <p className="text-xs text-telegram-subtext/60">
                            The first copy in each group is kept. Delete the others to free space.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
