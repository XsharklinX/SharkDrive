import { useState, useEffect } from 'react';
import { Lock, Unlock, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { tauriApi } from '../../api/tauri';

interface VaultLockScreenProps {
    onUnlock: () => void;
}

export function VaultLockScreen({ onUnlock }: VaultLockScreenProps) {
    const [password, setPassword] = useState('');
    const [totpCode, setTotpCode] = useState('');
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [step, setStep] = useState<'password' | 'totp'>('password');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        tauriApi.isTotpEnabled().then(setTotpEnabled).catch(() => {});
    }, []);

    const handlePasswordSubmit = async () => {
        if (!password.trim()) return;
        if (totpEnabled) {
            // Verify password first (unlock will happen after TOTP)
            setLoading(true);
            try {
                // Try unlocking to verify password is correct
                await tauriApi.unlockEncryptionKey(password);
                // Password OK — now lock it again and ask for TOTP
                await tauriApi.clearEncryptionKey();
                setStep('totp');
            } catch (error) {
                toast.error(`Wrong password: ${error}`);
            } finally {
                setLoading(false);
            }
        } else {
            // No TOTP — unlock directly
            setLoading(true);
            try {
                await tauriApi.unlockEncryptionKey(password);
                onUnlock();
                toast.success('Vault unlocked');
            } catch (error) {
                toast.error(`Could not unlock vault: ${error}`);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleTotpSubmit = async () => {
        if (totpCode.length !== 6) return;
        setLoading(true);
        try {
            const valid = await tauriApi.verifyTotp(totpCode);
            if (!valid) {
                toast.error('Invalid 2FA code. Try again.');
                setTotpCode('');
                return;
            }
            // TOTP valid — now do the real unlock
            await tauriApi.unlockEncryptionKey(password);
            onUnlock();
            toast.success('Vault unlocked');
        } catch (error) {
            toast.error(`Could not unlock: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-telegram-bg/95 px-4 backdrop-blur-xl">
            <div className="w-full max-w-sm rounded-2xl border border-telegram-border bg-telegram-surface p-6 shadow-2xl">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-telegram-border bg-white/[0.04] text-telegram-primary">
                    {step === 'totp' ? <Shield className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </div>
                <h2 className="text-xl font-semibold text-telegram-text">
                    {step === 'totp' ? '2FA Verification' : 'Vault locked'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-telegram-subtext">
                    {step === 'totp'
                        ? 'Enter the 6-digit code from your authenticator app.'
                        : 'Enter your encryption password to continue. Your Telegram session remains connected.'}
                </p>

                {step === 'password' && (
                    <>
                        <input
                            autoFocus
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && void handlePasswordSubmit()}
                            placeholder="Encryption password"
                            className="mt-5 w-full rounded-xl border border-telegram-border bg-black/10 px-4 py-3 text-sm text-telegram-text outline-none transition focus:border-telegram-primary/70"
                        />
                        {totpEnabled && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-telegram-subtext">
                                <Shield className="h-3.5 w-3.5 text-telegram-primary" />
                                2FA required after password
                            </p>
                        )}
                        <button
                            onClick={handlePasswordSubmit}
                            disabled={loading || !password.trim()}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                        >
                            <Unlock className="h-4 w-4" />
                            {loading ? 'Checking…' : totpEnabled ? 'Continue' : 'Unlock Vault'}
                        </button>
                    </>
                )}

                {step === 'totp' && (
                    <>
                        <input
                            autoFocus
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={totpCode}
                            onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            onKeyDown={e => e.key === 'Enter' && void handleTotpSubmit()}
                            placeholder="123456"
                            className="mt-5 w-full rounded-xl border border-telegram-border bg-black/10 px-4 py-3 text-center font-mono text-2xl tracking-widest text-telegram-text outline-none transition focus:border-telegram-primary/70"
                        />
                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={() => { setStep('password'); setTotpCode(''); }}
                                className="flex-1 rounded-xl border border-telegram-border py-3 text-sm text-telegram-subtext hover:bg-white/[0.04]"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleTotpSubmit}
                                disabled={loading || totpCode.length !== 6}
                                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-3 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                            >
                                <Shield className="h-4 w-4" />
                                {loading ? 'Verifying…' : 'Unlock Vault'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
