import { useState, useEffect, useCallback } from 'react';
import { X, Cloud, FolderOpen, CheckSquare, Square, Download, ChevronRight } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { tauriApi } from '../../api/tauri';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';

type WizardStep = 'setup' | 'browse' | 'import' | 'done';

interface DropboxEntry {
    id: string;
    name: string;
    path: string;
    is_folder: boolean;
    size: number;
}

interface Props {
    onClose: () => void;
    onFilesReady: (tempPaths: string[]) => void;
}

const DROPBOX_KEY_STORAGE = 'sharkdrive.dropboxAppKey.v1';

function formatBytes(b: number) {
    if (b >= 1e9) return `${(b/1e9).toFixed(1)} GB`;
    if (b >= 1e6) return `${(b/1e6).toFixed(1)} MB`;
    if (b >= 1024) return `${Math.round(b/1024)} KB`;
    return `${b} B`;
}

export function CloudImportWizard({ onClose, onFilesReady }: Props) {
    const { t } = useLanguage();
    const [step, setStep] = useState<WizardStep>('setup');
    const [appKey, setAppKey] = useState(() => localStorage.getItem(DROPBOX_KEY_STORAGE) || '');
    const [, setConnected] = useState(false);
    const [entries, setEntries] = useState<DropboxEntry[]>([]);
    const [currentPath, setCurrentPath] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [importDone, setImportDone] = useState(0);
    const [importTotal, setImportTotal] = useState(0);

    useEffect(() => {
        tauriApi.getDropboxTokenStatus().then(ok => {
            if (ok) { setConnected(true); setStep('browse'); }
        }).catch(() => {});
    }, []);

    // Listen for OAuth callback from actix server
    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen<string>('dropbox-auth-success', (evt) => {
            tauriApi.setDropboxToken(evt.payload);
            setConnected(true);
            setStep('browse');
            toast.success('Dropbox connected!');
        }).then(fn => { unlisten = fn; });
        listen<string>('dropbox-auth-error', (evt) => {
            toast.error(`Dropbox auth error: ${evt.payload}`);
        });
        return () => { unlisten?.(); };
    }, []);

    async function handleConnect() {
        if (!appKey.trim()) return;
        localStorage.setItem(DROPBOX_KEY_STORAGE, appKey.trim());
        await tauriApi.setDropboxAppKey(appKey.trim());
        try {
            const url = await tauriApi.getDropboxAuthUrl();
            await openUrl(url);
            toast.info('Complete Dropbox auth in your browser…');
        } catch (e) { toast.error(String(e)); }
    }

    const loadFolder = useCallback(async (path: string) => {
        setLoading(true);
        try {
            const items = await tauriApi.dropboxListFolder(path);
            setEntries(items);
            setCurrentPath(path);
        } catch (e) { toast.error(String(e)); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (step === 'browse') loadFolder('');
    }, [step, loadFolder]);

    function toggleSelect(entry: DropboxEntry) {
        if (entry.is_folder) return; // folders not directly selectable
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(entry.path)) next.delete(entry.path);
            else next.add(entry.path);
            return next;
        });
    }

    async function handleImport() {
        if (selected.size === 0) return;
        setStep('import');
        setImportTotal(selected.size);
        setImportDone(0);

        let unlisten: (() => void) | undefined;
        listen<{ done: number; total: number; filename: string }>('dropbox-import-progress', evt => {
            setImportDone(evt.payload.done);
        }).then(fn => { unlisten = fn; });

        try {
            const paths = await tauriApi.dropboxImportFiles([...selected]);
            onFilesReady(paths);
            setStep('done');
        } catch (e) {
            toast.error(String(e));
            setStep('browse');
        } finally {
            unlisten?.();
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="mx-4 flex w-full max-w-lg flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                 style={{ maxHeight: '80vh' }}
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Cloud className="h-5 w-5 text-blue-400" />
                        <p className="text-sm font-semibold text-telegram-text">{t('importFromCloud')} (Dropbox)</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext hover:bg-white/[0.06]">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-6">
                    {step === 'setup' && (
                        <div className="space-y-4">
                            <p className="text-xs text-telegram-subtext">
                                Create a Dropbox app at <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" className="text-telegram-primary underline">dropbox.com/developers</a>, then paste your App Key here. Set redirect URI to <code className="rounded bg-white/[0.06] px-1">http://localhost:14200/oauth/dropbox/callback</code>.
                            </p>
                            <div>
                                <label className="mb-1 block text-xs text-telegram-subtext">{t('dropboxAppKey')}</label>
                                <input
                                    value={appKey}
                                    onChange={e => setAppKey(e.target.value)}
                                    placeholder="abc123xyz..."
                                    className="w-full rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                                />
                            </div>
                            <button
                                onClick={handleConnect}
                                disabled={!appKey.trim()}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-blue-600"
                            >
                                <Cloud className="h-4 w-4" /> {t('connectDropbox')}
                            </button>
                        </div>
                    )}

                    {step === 'browse' && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs text-telegram-subtext">
                                    <span className="font-medium text-emerald-400">{t('dropboxConnected')}</span>
                                    {currentPath && (
                                        <>
                                            <ChevronRight className="h-3 w-3" />
                                            <button onClick={() => loadFolder('')} className="hover:text-telegram-text">root</button>
                                            <ChevronRight className="h-3 w-3" />
                                            <span>{currentPath.split('/').pop()}</span>
                                        </>
                                    )}
                                </div>
                                <button
                                    onClick={() => { tauriApi.dropboxDisconnect(); setConnected(false); setStep('setup'); }}
                                    className="text-xs text-telegram-subtext hover:text-red-400"
                                >
                                    {t('disconnectDropbox')}
                                </button>
                            </div>
                            {loading ? (
                                <div className="flex h-32 items-center justify-center">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                                </div>
                            ) : (
                                <ul className="space-y-1">
                                    {currentPath && (
                                        <li>
                                            <button onClick={() => loadFolder(currentPath.split('/').slice(0, -1).join('/'))}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-telegram-subtext hover:bg-white/[0.05]">
                                                <FolderOpen className="h-4 w-4" /> ..
                                            </button>
                                        </li>
                                    )}
                                    {entries.map(e => (
                                        <li key={e.id}>
                                            <button
                                                onClick={() => e.is_folder ? loadFolder(e.path) : toggleSelect(e)}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left text-telegram-text hover:bg-white/[0.05]"
                                            >
                                                {e.is_folder
                                                    ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-400" />
                                                    : selected.has(e.path)
                                                        ? <CheckSquare className="h-4 w-4 flex-shrink-0 text-telegram-primary" />
                                                        : <Square className="h-4 w-4 flex-shrink-0 text-telegram-subtext" />
                                                }
                                                <span className="flex-1 truncate">{e.name}</span>
                                                {!e.is_folder && <span className="text-xs text-telegram-subtext">{formatBytes(e.size)}</span>}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="flex items-center justify-between border-t border-telegram-border pt-3">
                                <p className="text-xs text-telegram-subtext">{selected.size} file(s) selected</p>
                                <button
                                    onClick={handleImport}
                                    disabled={selected.size === 0}
                                    className="flex items-center gap-1.5 rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                                >
                                    <Download className="h-4 w-4" /> {t('startImport')}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'import' && (
                        <div className="flex flex-col items-center gap-4 py-8 text-center">
                            <div className="h-10 w-10 animate-spin rounded-full border-4 border-telegram-primary/30 border-t-telegram-primary" />
                            <p className="text-sm font-medium text-telegram-text">Downloading from Dropbox…</p>
                            <p className="text-xs text-telegram-subtext">{importDone} / {importTotal}</p>
                            <div className="w-full rounded-full bg-white/[0.08] h-1.5">
                                <div className="h-1.5 rounded-full bg-telegram-primary transition-all"
                                     style={{ width: `${importTotal > 0 ? (importDone / importTotal) * 100 : 0}%` }} />
                            </div>
                        </div>
                    )}

                    {step === 'done' && (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <Download className="h-12 w-12 text-emerald-400" />
                            <p className="text-sm font-semibold text-telegram-text">Files downloaded!</p>
                            <p className="text-xs text-telegram-subtext">Files have been queued for upload to SharkDrive.</p>
                            <button onClick={onClose} className="rounded-xl bg-telegram-primary px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90">Done</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
