import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FolderPlus, KeyRound, Lock, ShieldCheck, X } from 'lucide-react';
import { tauriApi } from '../../api/tauri';
import { useLanguage } from '../../context/LanguageContext';

interface OnboardingWizardProps {
    onClose: () => void;
    onCreateFolder: (name: string) => Promise<void>;
    onEncryptionEnabled: () => void;
}

const TOTAL_STEPS = 4;

export function OnboardingWizard({ onClose, onCreateFolder, onEncryptionEnabled }: OnboardingWizardProps) {
    const { lang } = useLanguage();
    const es = lang === 'es';
    const [step, setStep] = useState(0);
    const [folderName, setFolderName] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [folderCreated, setFolderCreated] = useState(false);
    const [encryptionEnabled, setEncryptionEnabled] = useState(false);
    const [error, setError] = useState('');

    const close = () => {
        localStorage.setItem('sharkdrive.onboarding.v1', 'complete');
        onClose();
    };

    const createFolder = async () => {
        if (!folderName.trim() || loading) return;
        setLoading(true);
        setError('');
        try {
            await onCreateFolder(folderName.trim());
            setFolderCreated(true);
        } catch (reason) {
            setError(String(reason));
        } finally {
            setLoading(false);
        }
    };

    const enableEncryption = async () => {
        if (password.length < 8 || loading) return;
        setLoading(true);
        setError('');
        try {
            await tauriApi.setEncryptionKey(password);
            onEncryptionEnabled();
            setEncryptionEnabled(true);
            setPassword('');
        } catch (reason) {
            setError(String(reason));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
            <div className="w-full max-w-xl rounded-2xl border border-telegram-border bg-telegram-surface p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-telegram-primary">
                            {es ? `Inicio ${step + 1} de ${TOTAL_STEPS}` : `Getting started ${step + 1} of ${TOTAL_STEPS}`}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold text-telegram-text">
                            {es ? 'Configura SharkDrive' : 'Set up SharkDrive'}
                        </h2>
                    </div>
                    <button onClick={close} className="rounded-lg p-2 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text" title={es ? 'Omitir configuraci\u00f3n' : 'Skip setup'}>
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-5 flex gap-1.5">
                    {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
                        <div key={index} className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-telegram-primary' : 'bg-white/[0.07]'}`} />
                    ))}
                </div>

                <div className="min-h-64 py-7">
                    {step === 0 && (
                        <div className="space-y-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                <ShieldCheck className="h-7 w-7" />
                            </div>
                            <h3 className="text-lg font-semibold text-telegram-text">{es ? 'Tu nube personal sobre Telegram' : 'Your personal cloud on Telegram'}</h3>
                            <p className="max-w-lg text-sm leading-6 text-telegram-subtext">
                                {es
                                    ? 'SharkDrive usa tu propia sesi\u00f3n de Telegram para almacenar archivos. Este asistente solo prepara lo esencial; podr\u00e1s cambiar todo desde Configuraci\u00f3n.'
                                    : 'SharkDrive uses your own Telegram session to store files. This wizard only prepares the essentials; everything remains editable in Settings.'}
                            </p>
                        </div>
                    )}

                    {step === 1 && (
                        <div className="space-y-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                <KeyRound className="h-7 w-7" />
                            </div>
                            <h3 className="text-lg font-semibold text-telegram-text">{es ? 'Credenciales conectadas' : 'Credentials connected'}</h3>
                            <p className="max-w-lg text-sm leading-6 text-telegram-subtext">
                                {es
                                    ? 'Tu API ID, API Hash y sesi\u00f3n de Telegram ya est\u00e1n configurados localmente. SharkDrive no env\u00eda estas credenciales a servidores externos.'
                                    : 'Your API ID, API Hash, and Telegram session are already configured locally. SharkDrive does not send these credentials to external servers.'}
                            </p>
                            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-300">
                                <Check className="h-3.5 w-3.5" />
                                {es ? 'Telegram conectado' : 'Telegram connected'}
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                <FolderPlus className="h-7 w-7" />
                            </div>
                            <h3 className="text-lg font-semibold text-telegram-text">{es ? 'Crea tu primera carpeta' : 'Create your first folder'}</h3>
                            <p className="text-sm leading-6 text-telegram-subtext">
                                {es ? 'Es opcional. Tambi\u00e9n puedes usar Mensajes Guardados como ra\u00edz.' : 'This is optional. You can also use Saved Messages as your root.'}
                            </p>
                            <div className="flex gap-2">
                                <input
                                    value={folderName}
                                    onChange={(event) => setFolderName(event.target.value)}
                                    onKeyDown={(event) => event.key === 'Enter' && void createFolder()}
                                    placeholder={es ? 'Ej. Documentos' : 'e.g. Documents'}
                                    disabled={folderCreated}
                                    className="min-w-0 flex-1 rounded-lg border border-telegram-border bg-black/10 px-3 py-2.5 text-sm text-telegram-text outline-none transition focus:border-telegram-primary/70 disabled:opacity-60"
                                />
                                <button onClick={() => void createFolder()} disabled={!folderName.trim() || loading || folderCreated} className="rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50">
                                    {folderCreated ? (es ? 'Creada' : 'Created') : (es ? 'Crear' : 'Create')}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                <Lock className="h-7 w-7" />
                            </div>
                            <h3 className="text-lg font-semibold text-telegram-text">{es ? 'Protecci\u00f3n local opcional' : 'Optional local protection'}</h3>
                            <p className="text-sm leading-6 text-telegram-subtext">
                                {es ? 'Define una contrase\u00f1a para cifrar archivos antes de subirlos. Puedes omitir este paso y activarlo luego.' : 'Set a password to encrypt files before upload. You can skip this and enable it later.'}
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    onKeyDown={(event) => event.key === 'Enter' && void enableEncryption()}
                                    placeholder={es ? 'M\u00ednimo 8 caracteres' : 'At least 8 characters'}
                                    disabled={encryptionEnabled}
                                    className="min-w-0 flex-1 rounded-lg border border-telegram-border bg-black/10 px-3 py-2.5 text-sm text-telegram-text outline-none transition focus:border-telegram-primary/70 disabled:opacity-60"
                                />
                                <button onClick={() => void enableEncryption()} disabled={password.length < 8 || loading || encryptionEnabled} className="rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50">
                                    {encryptionEnabled ? (es ? 'Activado' : 'Enabled') : (es ? 'Activar' : 'Enable')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {error && <p className="mb-4 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</p>}

                <div className="flex items-center justify-between gap-3 border-t border-telegram-border pt-4">
                    <button
                        onClick={() => setStep((current) => Math.max(0, current - 1))}
                        disabled={step === 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext transition hover:text-telegram-text disabled:opacity-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {es ? 'Atr\u00e1s' : 'Back'}
                    </button>
                    {step < TOTAL_STEPS - 1 ? (
                        <button onClick={() => setStep((current) => Math.min(TOTAL_STEPS - 1, current + 1))} className="inline-flex items-center gap-2 rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90">
                            {es ? 'Continuar' : 'Continue'}
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    ) : (
                        <button onClick={close} className="inline-flex items-center gap-2 rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90">
                            <Check className="h-4 w-4" />
                            {es ? 'Terminar' : 'Finish'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
