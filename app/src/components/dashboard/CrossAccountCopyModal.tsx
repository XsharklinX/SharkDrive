import { useState, useEffect } from 'react';
import { X, Download, ArrowRight, Upload, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { AccountMeta, TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';
import { resolveFileFolderId } from '../../utils';

interface Props {
    files: TelegramFile[];
    activeFolderId: number | null;
    accounts: AccountMeta[];
    activeAccountId: string | null;
    onClose: () => void;
    onSwitchAndUpload: (tempPaths: string[], targetAccountId: string) => void;
}

type Phase = 'select-target' | 'downloading' | 'ready' | 'done';

interface Progress {
    done: number;
    total: number;
    filename: string;
}

export function CrossAccountCopyModal({
    files,
    activeFolderId,
    accounts,
    activeAccountId,
    onClose,
    onSwitchAndUpload,
}: Props) {
    const { t } = useLanguage();
    const [phase, setPhase] = useState<Phase>('select-target');
    const [targetAccountId, setTargetAccountId] = useState<string | null>(null);
    const [progress, setProgress] = useState<Progress>({ done: 0, total: files.length, filename: '' });
    const [transferId] = useState(() => `xcopy_${Date.now()}`);
    const [tempPaths, setTempPaths] = useState<string[]>([]);
    const [failed, setFailed] = useState<string[]>([]);

    const otherAccounts = accounts.filter(a => a.id !== activeAccountId);

    // Listen for download progress events
    useEffect(() => {
        if (phase !== 'downloading') return;
        let unlisten: (() => void) | undefined;
        listen<{ transfer_id: string; done: number; total: number; filename: string }>(
            'cross-copy-progress',
            event => {
                if (event.payload.transfer_id !== transferId) return;
                setProgress({
                    done: event.payload.done,
                    total: event.payload.total,
                    filename: event.payload.filename,
                });
            }
        ).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, [phase, transferId]);

    async function handleStartDownload() {
        if (!targetAccountId) return;
        setPhase('downloading');

        const entries = files
            .filter(f => f.type !== 'folder')
            .map(f => ({
                messageId: f.id,
                folderId: resolveFileFolderId(f, activeFolderId),
                filename: f.name,
            }));

        try {
            const result = await tauriApi.crossAccountDownload(entries, transferId);
            setTempPaths(result.temp_paths.map(([, path]) => path));
            setFailed(result.failed);
            setPhase('ready');
        } catch (e) {
            toast.error(`Download failed: ${e}`);
            setPhase('select-target');
        }
    }

    function handleConfirmSwitch() {
        onSwitchAndUpload(tempPaths, targetAccountId!);
    }

    const targetAccount = accounts.find(a => a.id === targetAccountId);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative mx-4 flex w-full max-w-md flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <ArrowRight className="h-5 w-5 text-telegram-primary" />
                        <div>
                            <p className="text-sm font-semibold text-telegram-text">{t('copyToAccount')}</p>
                            <p className="text-xs text-telegram-subtext">{files.filter(f => f.type !== 'folder').length} file(s)</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext hover:bg-white/[0.06] hover:text-telegram-text">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Phase: Select target */}
                    {phase === 'select-target' && (
                        <>
                            <p className="text-sm text-telegram-subtext">Select the target account:</p>
                            {otherAccounts.length === 0 ? (
                                <div className="rounded-lg border border-telegram-border bg-white/[0.02] p-4 text-center text-sm text-telegram-subtext">
                                    No other accounts available. Add an account first.
                                </div>
                            ) : (
                                <ul className="space-y-2">
                                    {otherAccounts.map(account => (
                                        <li key={account.id}>
                                            <button
                                                onClick={() => setTargetAccountId(account.id)}
                                                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                                                    targetAccountId === account.id
                                                        ? 'border-telegram-primary bg-telegram-primary/10'
                                                        : 'border-telegram-border bg-white/[0.02] hover:bg-white/[0.05]'
                                                }`}
                                            >
                                                <div
                                                    style={{ background: account.accent_color ?? '#2481cc' }}
                                                    className="h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                                >
                                                    {account.alias.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-telegram-text">{account.alias}</p>
                                                    {account.phone && (
                                                        <p className="truncate text-xs text-telegram-subtext">{account.phone}</p>
                                                    )}
                                                </div>
                                                {targetAccountId === account.id && (
                                                    <CheckCircle className="h-4 w-4 text-telegram-primary flex-shrink-0" />
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <button
                                disabled={!targetAccountId || otherAccounts.length === 0}
                                onClick={handleStartDownload}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                            >
                                <Download className="h-4 w-4" />
                                {t('downloadingFiles')}
                            </button>
                        </>
                    )}

                    {/* Phase: Downloading */}
                    {phase === 'downloading' && (
                        <div className="flex flex-col items-center gap-4 py-4 text-center">
                            <Loader2 className="h-10 w-10 animate-spin text-telegram-primary" />
                            <div>
                                <p className="text-sm font-medium text-telegram-text">{t('downloadingFiles')}</p>
                                <p className="text-xs text-telegram-subtext mt-1">
                                    {progress.done} / {progress.total}
                                    {progress.filename && ` — ${progress.filename}`}
                                </p>
                            </div>
                            {/* Progress bar */}
                            <div className="w-full rounded-full bg-white/[0.08] h-1.5">
                                <div
                                    className="h-1.5 rounded-full bg-telegram-primary transition-all"
                                    style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Phase: Ready to switch */}
                    {phase === 'ready' && (
                        <>
                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                                <div className="flex items-center gap-2 text-sm text-emerald-400">
                                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                                    <span>
                                        {tempPaths.length} file(s) downloaded.
                                        {failed.length > 0 && ` (${failed.length} failed)`}
                                    </span>
                                </div>
                            </div>
                            {failed.length > 0 && (
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400">
                                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                                    Failed: {failed.join(', ')}
                                </div>
                            )}
                            <div className="rounded-xl border border-telegram-border bg-white/[0.02] px-4 py-3 text-sm text-telegram-subtext">
                                The app will switch to <span className="font-semibold text-telegram-text">
                                    {targetAccount?.alias ?? targetAccountId}
                                </span> and queue the files for upload.
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 rounded-xl border border-telegram-border px-4 py-2.5 text-sm text-telegram-subtext hover:bg-white/[0.04]"
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={handleConfirmSwitch}
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                                >
                                    <Upload className="h-4 w-4" />
                                    {t('confirmSwitch')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
