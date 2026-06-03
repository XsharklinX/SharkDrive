import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface WipeConfirmModalProps {
    onCancel: () => void;
    onConfirm: () => Promise<void>;
}

export function WipeConfirmModal({ onCancel, onConfirm }: WipeConfirmModalProps) {
    const [countdown, setCountdown] = useState(10);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        if (countdown <= 0) return;
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [countdown]);

    async function handleConfirm() {
        setConfirming(true);
        await onConfirm();
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-sm rounded-2xl border border-red-500/40 bg-telegram-surface p-6 shadow-2xl">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-red-400">Remote Wipe Triggered</h2>
                <p className="mt-2 text-sm leading-6 text-telegram-subtext">
                    A remote wipe command was detected in your Saved Messages. All local SharkDrive data will be permanently deleted.
                </p>
                <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                    This action is <strong>irreversible</strong>. Your Telegram account and cloud data are NOT affected — only local app data.
                </div>
                <div className="mt-5 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 rounded-xl border border-telegram-border py-2.5 text-sm text-telegram-subtext hover:bg-white/[0.04]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={countdown > 0 || confirming}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50"
                    >
                        <Trash2 className="h-4 w-4" />
                        {countdown > 0 ? `Wipe (${countdown}s)` : confirming ? 'Wiping…' : 'Wipe Now'}
                    </button>
                </div>
            </div>
        </div>
    );
}
