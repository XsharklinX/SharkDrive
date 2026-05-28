import { useState, useMemo } from 'react';
import { X, Pencil, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';

interface BatchRenameModalProps {
    files: TelegramFile[];
    activeFolderId: number | null;
    onClose: () => void;
    onDone: () => void;
}

// Pattern tokens: {n} = 1-based index, {name} = original name without ext,
// {ext} = extension without dot, {date} = YYYY-MM-DD from created_at
function applyPattern(pattern: string, file: TelegramFile, index: number): string {
    const dotIdx = file.name.lastIndexOf('.');
    const baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
    const ext = dotIdx > 0 ? file.name.slice(dotIdx + 1) : '';
    const date = file.created_at ? file.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);

    return pattern
        .replace(/\{n\}/g, String(index + 1).padStart(2, '0'))
        .replace(/\{name\}/g, baseName)
        .replace(/\{ext\}/g, ext)
        .replace(/\{date\}/g, date);
}

function hasExtension(name: string): boolean {
    return name.includes('.') && !name.startsWith('.');
}

const EXAMPLES = [
    { token: '{n}',    desc: 'Index (01, 02…)' },
    { token: '{name}', desc: 'Original name (no ext)' },
    { token: '{ext}',  desc: 'Extension (png, pdf…)' },
    { token: '{date}', desc: 'Date (YYYY-MM-DD)' },
];

export function BatchRenameModal({ files, activeFolderId, onClose, onDone }: BatchRenameModalProps) {
    const [pattern, setPattern] = useState('{name}_{n}');
    const [applying, setApplying] = useState(false);

    const previews = useMemo(() =>
        files.map((f, i) => {
            const result = applyPattern(pattern, f, i);
            return { file: f, result };
        }),
        [files, pattern]
    );

    const hasDuplicateNames = useMemo(() => {
        const names = previews.map(p => p.result.toLowerCase());
        return names.length !== new Set(names).size;
    }, [previews]);

    const isEmpty = pattern.trim() === '';

    const handleApply = async () => {
        if (isEmpty || hasDuplicateNames) return;
        setApplying(true);
        try {
            const renames = previews.map(({ file, result }) => ({
                messageId: file.id,
                folderId: file.folder_id ?? activeFolderId,
                newName: result,
            }));
            const count = await tauriApi.batchRename(renames);
            toast.success(`Renamed ${count} file${count !== 1 ? 's' : ''}`);
            onDone();
            onClose();
        } catch (e) {
            toast.error('Batch rename failed: ' + String(e));
        } finally {
            setApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative mx-4 w-full max-w-lg rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Pencil className="h-5 w-5 text-telegram-primary" />
                        <h2 className="text-base font-semibold text-telegram-text">
                            Batch Rename — {files.length} file{files.length !== 1 ? 's' : ''}
                        </h2>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Pattern input */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-telegram-subtext">Pattern</label>
                        <input
                            type="text"
                            value={pattern}
                            onChange={e => setPattern(e.target.value)}
                            placeholder="e.g. photo_{n}.jpg"
                            className="w-full rounded-lg border border-telegram-border bg-telegram-hover px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/60 placeholder:text-telegram-subtext/50"
                        />
                        {/* Token chips */}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {EXAMPLES.map(ex => (
                                <button
                                    key={ex.token}
                                    onClick={() => setPattern(p => p + ex.token)}
                                    title={ex.desc}
                                    className="rounded-md border border-telegram-border bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-telegram-primary transition hover:bg-telegram-primary/10"
                                >
                                    {ex.token}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Warnings */}
                    {hasDuplicateNames && (
                        <div className="flex items-start gap-2 rounded-lg border border-yellow-400/20 bg-yellow-400/8 px-3 py-2 text-xs text-yellow-300">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                            Pattern produces duplicate names — add {'{n}'} to make each name unique.
                        </div>
                    )}
                    {!hasExtension(previews[0]?.result ?? '') && !isEmpty && (
                        <div className="flex items-start gap-2 rounded-lg border border-yellow-400/20 bg-yellow-400/8 px-3 py-2 text-xs text-yellow-300">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                            Result has no extension. Use {'{ext}'} to preserve it (e.g. {'{name}_{n}.{ext}'}).
                        </div>
                    )}

                    {/* Preview table */}
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-telegram-border">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-telegram-surface">
                                <tr className="border-b border-telegram-border text-left text-telegram-subtext">
                                    <th className="px-3 py-2 font-medium">Original</th>
                                    <th className="px-3 py-2 font-medium">→ Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {previews.map(({ file, result }, i) => (
                                    <tr key={file.id} className={i % 2 === 0 ? 'bg-white/[0.015]' : ''}>
                                        <td className="max-w-[10rem] truncate px-3 py-2 text-telegram-subtext" title={file.name}>{file.name}</td>
                                        <td className="max-w-[10rem] truncate px-3 py-2 font-medium text-telegram-text" title={result}>{result || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 border-t border-telegram-border pt-4">
                        <button onClick={onClose} className="rounded-lg border border-telegram-border px-4 py-2 text-sm text-telegram-subtext transition hover:bg-white/[0.05]">
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={applying || isEmpty || hasDuplicateNames}
                            className="flex items-center gap-2 rounded-lg bg-telegram-primary px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                        >
                            {applying ? (
                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                            ) : (
                                <Check className="h-3.5 w-3.5" />
                            )}
                            {applying ? 'Renaming…' : `Apply to ${files.length} files`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
