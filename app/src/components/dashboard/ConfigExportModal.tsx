import { useState } from 'react';
import { X, Download, Upload, Eye, EyeOff, Package } from 'lucide-react';
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { tauriApi } from '../../api/tauri';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';
import { CLASSIFICATION_RULES_KEY, UPLOAD_NAMING_PATTERN_KEY } from '../../utils';

interface Props {
    shortcuts: Record<string, string>;
    onImport: (config: Record<string, unknown>) => void;
    onClose: () => void;
}

type Mode = 'export' | 'import';

export function ConfigExportModal({ shortcuts, onImport, onClose }: Props) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<Mode>('export');
    const [password, setPassword] = useState('');
    const [pwVisible, setPwVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    function collectConfig(): Record<string, unknown> {
        return {
            version: '3.7.0',
            exportedAt: new Date().toISOString(),
            shortcuts,
            classificationRules: JSON.parse(localStorage.getItem(CLASSIFICATION_RULES_KEY) || '[]'),
            uploadNamingPattern: localStorage.getItem(UPLOAD_NAMING_PATTERN_KEY) || '',
            downloadDestinations: JSON.parse(localStorage.getItem('sharkdrive.downloadDestinations.v1') || '{}'),
            wifiOnlySync: localStorage.getItem('sharkdrive.wifiOnlySync.v1') === 'true',
            openAfterDownload: localStorage.getItem('sharkdrive.openAfterDownload.v1') === 'true',
            webhookUrl: localStorage.getItem('sharkdrive.webhookUrl.v1') || '',
            webhookEnabled: localStorage.getItem('sharkdrive.webhookEnabled.v1') === 'true',
            dropboxAppKey: localStorage.getItem('sharkdrive.dropboxAppKey.v1') || '',
        };
    }

    async function handleExport() {
        const savePath = await saveDialog({
            defaultPath: `sharkdrive-config-${new Date().toISOString().slice(0, 10)}.sdconfig`,
            filters: [{ name: 'SharkDrive Config', extensions: ['sdconfig'] }],
        });
        if (!savePath) return;
        setLoading(true);
        try {
            const json = JSON.stringify(collectConfig(), null, 2);
            await tauriApi.exportConfig(json, password || null, savePath);
            toast.success(`Config exported to ${savePath.split(/[/\\]/).pop()}`);
            onClose();
        } catch (e) { toast.error(String(e)); }
        finally { setLoading(false); }
    }

    async function handleImport() {
        const filePath = await openDialog({ multiple: false, filters: [{ name: 'SharkDrive Config', extensions: ['sdconfig'] }] });
        if (!filePath) return;
        setLoading(true);
        try {
            const json = await tauriApi.importConfig(filePath as string, password || null);
            const config = JSON.parse(json) as Record<string, unknown>;
            onImport(config);
            toast.success('Configuration imported successfully');
            onClose();
        } catch (e) { toast.error(String(e)); }
        finally { setLoading(false); }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="mx-4 flex w-full max-w-sm flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Package className="h-5 w-5 text-telegram-primary" />
                        <p className="text-sm font-semibold text-telegram-text">Configuration</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext hover:bg-white/[0.06]">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex border-b border-telegram-border">
                    {(['export', 'import'] as Mode[]).map(m => (
                        <button key={m} onClick={() => setMode(m)}
                            className={`flex-1 py-3 text-sm font-medium transition ${mode === m ? 'border-b-2 border-telegram-primary text-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text'}`}>
                            {m === 'export' ? t('exportConfig') : t('importConfig')}
                        </button>
                    ))}
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-xs text-telegram-subtext">
                        {mode === 'export'
                            ? 'Exports shortcuts, classification rules, naming patterns, download destinations, and other preferences.'
                            : 'Import settings from a .sdconfig file. Existing settings will be overwritten.'}
                    </p>
                    <div>
                        <label className="mb-1 block text-xs text-telegram-subtext">{t('configPassword')}</label>
                        <div className="relative">
                            <input
                                type={pwVisible ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Leave empty for plaintext"
                                className="w-full rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                            />
                            <button onClick={() => setPwVisible(v => !v)} className="absolute right-2.5 top-2.5 text-telegram-subtext">
                                {pwVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={mode === 'export' ? handleExport : handleImport}
                        disabled={loading}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-telegram-primary py-2.5 text-sm font-semibold text-black disabled:opacity-40"
                    >
                        {mode === 'export'
                            ? <><Download className="h-4 w-4" /> {loading ? 'Exporting…' : t('exportConfig')}</>
                            : <><Upload className="h-4 w-4" /> {loading ? 'Importing…' : t('importConfig')}</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
