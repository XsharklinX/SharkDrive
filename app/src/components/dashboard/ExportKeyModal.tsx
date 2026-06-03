import { useState, useEffect, useRef } from 'react';
import { X, Key, Eye, EyeOff, Copy, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { tauriApi } from '../../api/tauri';
import { toast } from 'sonner';

interface ExportKeyModalProps {
    folderId: number;
    folderName: string;
    onClose: () => void;
}

type Mode = 'export' | 'import';

export function ExportKeyModal({ folderId, folderName, onClose }: ExportKeyModalProps) {
    const [mode, setMode] = useState<Mode>('export');
    const [sharePassword, setSharePassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [blob, setBlob] = useState<string | null>(null);
    const [importBlob, setImportBlob] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!blob || !canvasRef.current) return;
        // QR encode the blob directly (it's base64 — moderate length)
        QRCode.toCanvas(canvasRef.current, blob, {
            width: 200,
            margin: 2,
            color: { dark: '#e6edf3', light: '#161b22' },
            errorCorrectionLevel: 'L',
        }).catch(() => {});
    }, [blob, canvasRef.current]);

    async function handleExport() {
        if (!sharePassword.trim()) return;
        setLoading(true); setError(null);
        try {
            const exported = await tauriApi.exportFolderKey(folderId, sharePassword);
            setBlob(exported);
        } catch (e) { setError(String(e)); }
        finally { setLoading(false); }
    }

    async function handleImport() {
        if (!importBlob.trim() || !sharePassword.trim()) return;
        setLoading(true); setError(null);
        try {
            const importedFolderId = await tauriApi.importFolderKey(importBlob.trim(), sharePassword);
            toast.success(`Folder key imported (folder ID: ${importedFolderId})`);
            onClose();
        } catch (e) { setError(String(e)); }
        finally { setLoading(false); }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="mx-4 flex w-full max-w-sm flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Key className="h-5 w-5 text-telegram-primary" />
                        <p className="text-sm font-semibold text-telegram-text">Encrypted Folder Key</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext hover:bg-white/[0.06]">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Mode tabs */}
                <div className="flex border-b border-telegram-border">
                    {(['export', 'import'] as Mode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => { setMode(m); setBlob(null); setError(null); }}
                            className={`flex-1 py-3 text-sm font-medium transition ${mode === m ? 'border-b-2 border-telegram-primary text-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text'}`}
                        >
                            {m === 'export' ? `Export key for "${folderName}"` : 'Import key'}
                        </button>
                    ))}
                </div>

                <div className="p-6 space-y-4">
                    {error && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">{error}</div>
                    )}

                    {mode === 'export' && !blob && (
                        <>
                            <p className="text-xs text-telegram-subtext">
                                Protect the exported key with a sharing password. The recipient will need this password to import it.
                            </p>
                            <div className="relative">
                                <input
                                    type={passwordVisible ? 'text' : 'password'}
                                    value={sharePassword}
                                    onChange={e => setSharePassword(e.target.value)}
                                    placeholder="Sharing password"
                                    className="w-full rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                                />
                                <button onClick={() => setPasswordVisible(v => !v)} className="absolute right-2.5 top-2.5 text-telegram-subtext">
                                    {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <button
                                onClick={handleExport}
                                disabled={!sharePassword.trim() || loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-telegram-primary py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                            >
                                <Download className="h-4 w-4" />
                                {loading ? 'Exporting…' : 'Export'}
                            </button>
                        </>
                    )}

                    {mode === 'export' && blob && (
                        <div className="space-y-3">
                            <div className="flex justify-center">
                                <div className="rounded-xl border border-telegram-border bg-[#161b22] p-3">
                                    <canvas ref={canvasRef} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border border-telegram-border bg-white/[0.02] px-3 py-2">
                                <span className="flex-1 truncate font-mono text-xs text-telegram-text">{blob}</span>
                                <button onClick={() => { navigator.clipboard?.writeText(blob); toast.success('Copied'); }} className="text-telegram-subtext hover:text-telegram-primary">
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <p className="text-xs text-telegram-subtext/70">
                                Share this blob + your sharing password with the other SharkDrive user separately.
                            </p>
                        </div>
                    )}

                    {mode === 'import' && (
                        <>
                            <p className="text-xs text-telegram-subtext">
                                Paste the blob from the other user, then enter the sharing password they set.
                            </p>
                            <textarea
                                value={importBlob}
                                onChange={e => setImportBlob(e.target.value)}
                                placeholder="Paste key blob here…"
                                rows={3}
                                className="w-full resize-none rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 font-mono text-xs text-telegram-text outline-none focus:border-telegram-primary"
                            />
                            <div className="relative">
                                <input
                                    type={passwordVisible ? 'text' : 'password'}
                                    value={sharePassword}
                                    onChange={e => setSharePassword(e.target.value)}
                                    placeholder="Sharing password"
                                    className="w-full rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                                />
                                <button onClick={() => setPasswordVisible(v => !v)} className="absolute right-2.5 top-2.5 text-telegram-subtext">
                                    {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <button
                                onClick={handleImport}
                                disabled={!importBlob.trim() || !sharePassword.trim() || loading}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-telegram-primary py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                            >
                                <Key className="h-4 w-4" />
                                {loading ? 'Importing…' : 'Import key'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
