import { useState, useEffect, useRef } from 'react';
import { X, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import QRCode from 'qrcode';
import { tauriApi } from '../../api/tauri';

interface TotpSetupModalProps {
    onClose: () => void;
    onEnabled: () => void;
}

export function TotpSetupModal({ onClose, onEnabled }: TotpSetupModalProps) {
    const [step, setStep] = useState<'setup' | 'confirm' | 'done'>('setup');
    const [otpUri, setOtpUri] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        tauriApi.setupTotp()
            .then(uri => setOtpUri(uri))
            .catch(e => setError(String(e)));
    }, []);

    useEffect(() => {
        if (!otpUri || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, otpUri, {
            width: 200,
            margin: 2,
            color: { dark: '#e6edf3', light: '#161b22' },
        }).catch(() => {});
    }, [otpUri, canvasRef.current]);

    async function handleConfirm() {
        if (code.length !== 6) return;
        setLoading(true);
        setError(null);
        try {
            const ok = await tauriApi.confirmTotpSetup(code);
            if (ok) {
                setStep('done');
                setTimeout(() => { onEnabled(); onClose(); }, 1500);
            } else {
                setError('Invalid code. Check your authenticator app and try again.');
            }
        } catch (e) { setError(String(e)); }
        finally { setLoading(false); }
    }

    const secretB32 = otpUri ? new URL(otpUri).searchParams.get('secret') : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="mx-4 flex w-full max-w-sm flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-telegram-primary" />
                        <p className="text-sm font-semibold text-telegram-text">Set up 2FA (TOTP)</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext hover:bg-white/[0.06]">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {step === 'done' ? (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <CheckCircle className="h-12 w-12 text-emerald-400" />
                            <p className="text-sm font-semibold text-telegram-text">2FA enabled!</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-telegram-subtext">
                                1. Scan the QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app.
                            </p>
                            {error && (
                                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                    {error}
                                </div>
                            )}
                            {otpUri ? (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="rounded-xl border border-telegram-border bg-[#161b22] p-3">
                                        <canvas ref={canvasRef} />
                                    </div>
                                    {secretB32 && (
                                        <div className="w-full rounded-lg border border-telegram-border bg-white/[0.02] px-3 py-2 text-center font-mono text-xs text-telegram-subtext">
                                            {secretB32}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex justify-center py-8">
                                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                                </div>
                            )}
                            <p className="text-xs text-telegram-subtext">
                                2. Enter the 6-digit code from the app to confirm setup:
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    onKeyDown={e => e.key === 'Enter' && void handleConfirm()}
                                    placeholder="123456"
                                    className="flex-1 rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-center font-mono text-lg text-telegram-text outline-none focus:border-telegram-primary"
                                />
                                <button
                                    onClick={handleConfirm}
                                    disabled={code.length !== 6 || loading}
                                    className="rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
                                >
                                    {loading ? '…' : 'Verify'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
