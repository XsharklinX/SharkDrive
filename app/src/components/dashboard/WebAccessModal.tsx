import { useState, useEffect, useRef } from 'react';
import { X, Smartphone, Eye, EyeOff, Wifi, Shield, ShieldOff, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import { tauriApi } from '../../api/tauri';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';

interface WebAccessModalProps {
    onClose: () => void;
}

export function WebAccessModal({ onClose }: WebAccessModalProps) {
    useLanguage(); // loaded for future i18n
    const [webUrl, setWebUrl] = useState<string | null>(null);
    const [hasPIN, setHasPIN] = useState(false);
    const [pin, setPin] = useState('');
    const [pinVisible, setPinVisible] = useState(false);
    const [settingPin, setSettingPin] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        Promise.all([tauriApi.getWebAccessUrl(), tauriApi.hasWebPin()])
            .then(([url, has]) => { setWebUrl(url); setHasPIN(has); })
            .catch(() => {});
    }, []);

    // Generate QR when URL is available
    useEffect(() => {
        if (!webUrl || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, webUrl, {
            width: 220,
            margin: 2,
            color: { dark: '#e6edf3', light: '#161b22' },
        }).catch(() => {});
    }, [webUrl, canvasRef.current]);

    async function handleSetPin() {
        if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
            toast.error('PIN must be 6 digits');
            return;
        }
        setSettingPin(true);
        try {
            await tauriApi.setWebPin(pin);
            setHasPIN(true);
            setPin('');
            toast.success('Web PIN set — access to the companion app is now protected');
        } catch (e) {
            toast.error(String(e));
        } finally {
            setSettingPin(false);
        }
    }

    async function handleClearPin() {
        try {
            await tauriApi.clearWebPin();
            setHasPIN(false);
            toast.info('Web PIN cleared — companion app is now open to the LAN');
        } catch (e) {
            toast.error(String(e));
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative mx-4 flex w-full max-w-sm flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Smartphone className="h-5 w-5 text-telegram-primary" />
                        <p className="text-sm font-semibold text-telegram-text">Mobile Companion</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext hover:bg-white/[0.06] hover:text-telegram-text">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* QR Code */}
                    <div className="flex flex-col items-center gap-3">
                        {webUrl ? (
                            <>
                                <div className="rounded-xl border border-telegram-border bg-[#161b22] p-3">
                                    <canvas ref={canvasRef} />
                                </div>
                                <div className="flex items-center gap-2 text-xs text-telegram-subtext">
                                    <Wifi className="h-3.5 w-3.5" />
                                    <span>Scan from your phone on the same network</span>
                                </div>
                                <div className="flex items-center gap-2 rounded-lg border border-telegram-border bg-white/[0.02] px-3 py-2 text-xs">
                                    <span className="flex-1 truncate font-mono text-telegram-text">{webUrl}</span>
                                    <button
                                        onClick={() => { navigator.clipboard?.writeText(webUrl); toast.success('Copied'); }}
                                        className="text-telegram-subtext hover:text-telegram-primary"
                                    >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex h-40 items-center justify-center">
                                <div className="h-6 w-6 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                            </div>
                        )}
                    </div>

                    {/* PIN section */}
                    <div className="rounded-xl border border-telegram-border bg-white/[0.02] p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            {hasPIN
                                ? <Shield className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                                : <ShieldOff className="h-4 w-4 text-amber-400 flex-shrink-0" />
                            }
                            <p className="text-sm font-medium text-telegram-text">
                                {hasPIN ? 'PIN protection active' : 'No PIN — open LAN access'}
                            </p>
                        </div>

                        {hasPIN ? (
                            <button
                                onClick={handleClearPin}
                                className="w-full rounded-lg border border-red-500/30 bg-red-500/5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                            >
                                Remove PIN
                            </button>
                        ) : (
                            <>
                                <p className="text-xs text-telegram-subtext">
                                    Set a 6-digit PIN to protect access to the mobile companion.
                                </p>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type={pinVisible ? 'text' : 'password'}
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            value={pin}
                                            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="6-digit PIN"
                                            className="w-full rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-sm text-telegram-text placeholder-telegram-subtext/50 outline-none focus:border-telegram-primary"
                                        />
                                        <button
                                            onClick={() => setPinVisible(v => !v)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-telegram-subtext hover:text-telegram-text"
                                        >
                                            {pinVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleSetPin}
                                        disabled={pin.length !== 6 || settingPin}
                                        className="flex items-center gap-1 rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                                    >
                                        {settingPin ? (
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                        ) : (
                                            <Shield className="h-4 w-4" />
                                        )}
                                        Set
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <p className="text-center text-xs text-telegram-subtext/60">
                        Read-only access. Upload from phone queues to the desktop app.
                    </p>
                </div>
            </div>
        </div>
    );
}
