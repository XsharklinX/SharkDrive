import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { tauriApi } from '../../api/tauri';

interface VaultLockScreenProps {
    onUnlock: () => void;
}

export function VaultLockScreen({ onUnlock }: VaultLockScreenProps) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const unlock = async () => {
        if (!password.trim()) return;
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
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07111b]/95 px-4 backdrop-blur-xl">
            <div className="w-full max-w-sm rounded-2xl border border-telegram-border bg-telegram-surface p-6 shadow-2xl">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-telegram-border bg-white/[0.04] text-telegram-primary">
                    <Lock className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold text-telegram-text">Vault locked</h2>
                <p className="mt-2 text-sm leading-6 text-telegram-subtext">
                    Enter your encryption password to continue. Your Telegram session remains connected.
                </p>
                <input
                    autoFocus
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && void unlock()}
                    placeholder="Encryption password"
                    className="mt-5 w-full rounded-xl border border-telegram-border bg-black/10 px-4 py-3 text-sm text-telegram-text outline-none transition focus:border-telegram-primary/70"
                />
                <button
                    onClick={() => void unlock()}
                    disabled={loading || !password.trim()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                >
                    <Unlock className="h-4 w-4" />
                    {loading ? 'Unlocking...' : 'Unlock Vault'}
                </button>
            </div>
        </div>
    );
}
