import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Key, Lock, ArrowRight, ShieldCheck, Sun, Moon, CheckCircle, ExternalLink, Copy, Eye, EyeOff } from "lucide-react";
import { load } from '@tauri-apps/plugin-store';
import { useTheme } from '../context/ThemeContext';
import { open } from '@tauri-apps/plugin-shell';

type Step = "welcome" | "guide" | "setup" | "phone" | "code" | "password";

// ── Step progress ─────────────────────────────────────────────────────────────

const STEPS: Step[] = ["welcome", "guide", "setup", "phone", "code"];

function StepDots({ current }: { current: Step }) {
    const idx = STEPS.indexOf(current);
    if (idx < 0) return null;
    return (
        <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((s, i) => (
                <div
                    key={s}
                    className={`transition-all duration-300 rounded-full ${
                        i === idx
                            ? 'w-6 h-2 bg-telegram-primary'
                            : i < idx
                            ? 'w-2 h-2 bg-telegram-primary/50'
                            : 'w-2 h-2 bg-white/15'
                    }`}
                />
            ))}
        </div>
    );
}

// ── Theme toggle ──────────────────────────────────────────────────────────────

function AuthThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    return (
        <button
            onClick={toggleTheme}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-white" /> : <Moon className="w-4 h-4 text-white" />}
        </button>
    );
}

// ── Visual mockup of my.telegram.org ─────────────────────────────────────────

function TelegramPortalMockup({ highlight }: { highlight: 'api-tools' | 'create' | 'credentials' }) {
    return (
        <div className="rounded-xl border border-white/10 bg-[#17212b] overflow-hidden text-xs shadow-2xl">
            {/* Browser bar */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#0e1621] border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <div className="flex-1 bg-white/[0.06] rounded px-2.5 py-1 text-[10px] text-white/40 font-mono">
                    my.telegram.org
                </div>
            </div>

            {highlight === 'api-tools' && (
                <div className="p-4">
                    <div className="text-white/50 text-[10px] mb-3">Telegram Core — My Account</div>
                    <div className="grid grid-cols-2 gap-2">
                        {['Account info', 'Two-step verification', 'Active sessions', 'Privacy & Security'].map(item => (
                            <div key={item} className="p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/40 text-[10px]">
                                {item}
                            </div>
                        ))}
                        <div className="col-span-2 relative p-2.5 rounded-lg bg-telegram-primary/20 border-2 border-telegram-primary text-telegram-primary text-[10px] font-bold animate-pulse">
                            API development tools
                            <div className="absolute -right-2 -top-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">→</div>
                        </div>
                    </div>
                </div>
            )}

            {highlight === 'create' && (
                <div className="p-4 space-y-2">
                    <div className="text-white/50 text-[10px] mb-3">API development tools</div>
                    <div className="text-white/70 text-[10px]">App title</div>
                    <div className="bg-white/[0.06] rounded px-2 py-1.5 text-white/30 text-[10px]">Mi app SharkDrive</div>
                    <div className="text-white/70 text-[10px]">Short name</div>
                    <div className="bg-white/[0.06] rounded px-2 py-1.5 text-white/30 text-[10px]">sharkdrive</div>
                    <div className="text-white/70 text-[10px]">Platform</div>
                    <div className="bg-white/[0.06] rounded px-2 py-1.5 text-white/30 text-[10px]">Desktop</div>
                    <div className="relative mt-3 bg-telegram-primary text-white text-[10px] font-bold py-2 rounded text-center animate-pulse">
                        Create application
                        <div className="absolute -right-2 -top-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">→</div>
                    </div>
                </div>
            )}

            {highlight === 'credentials' && (
                <div className="p-4 space-y-2">
                    <div className="text-white/50 text-[10px] mb-3">App configuration</div>
                    <div className="relative p-2.5 rounded-lg bg-telegram-primary/20 border-2 border-telegram-primary">
                        <div className="text-white/50 text-[9px] uppercase tracking-wider mb-1">App api_id</div>
                        <div className="text-telegram-primary font-mono font-bold text-sm">12345678</div>
                        <div className="absolute -right-2 -top-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">→</div>
                    </div>
                    <div className="relative p-2.5 rounded-lg bg-telegram-primary/20 border-2 border-telegram-primary">
                        <div className="text-white/50 text-[9px] uppercase tracking-wider mb-1">App api_hash</div>
                        <div className="text-telegram-primary font-mono font-bold text-[10px] truncate">0a1b2c3d4e5f6a7b8c9d...</div>
                        <div className="absolute -right-2 -top-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">→</div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AuthWizard({ onLogin }: { onLogin: () => void }) {
    const isBrowser = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window);

    if (isBrowser) {
        return (
            <div className="flex h-full max-w-2xl mx-auto items-center justify-center p-8 text-center">
                <div className="vault-panel w-full rounded-2xl px-8 py-12">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[1.6rem] border border-telegram-border bg-white/[0.04]">
                        <ShieldCheck className="w-10 h-10 text-telegram-primary" />
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-telegram-subtext">Desktop Runtime Required</p>
                    <h1 className="mt-3 mb-4 text-3xl font-bold tracking-tight text-white">SharkDrive runs as a desktop app</h1>
                    <p className="text-gray-400 mb-6 leading-relaxed max-w-xl mx-auto">
                        Open the <strong>SharkDrive</strong> desktop window to use the app.
                    </p>
                </div>
            </div>
        );
    }

    const [step, setStep] = useState<Step>("welcome");
    const [guideSubStep, setGuideSubStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [apiId, setApiId] = useState("");
    const [apiHash, setApiHash] = useState("");
    const [showApiHash, setShowApiHash] = useState(false);
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [floodWait, setFloodWait] = useState<number | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const codeInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!floodWait) return;
        const iv = setInterval(() => setFloodWait(p => (p === null || p <= 1 ? null : p - 1)), 1000);
        return () => clearInterval(iv);
    }, [floodWait]);

    useEffect(() => {
        const load_ = async () => {
            try {
                const store = await load('config.json');
                const sid = await store.get<string>('api_id');
                const shash = await store.get<string>('api_hash');
                if (sid && shash) { setApiId(sid); setApiHash(shash); }
            } catch { /* no config */ }
        };
        load_();
    }, []);

    useEffect(() => {
        if (step === 'code') setTimeout(() => codeInputRef.current?.focus(), 300);
    }, [step]);

    const saveCredentials = async () => {
        try {
            const store = await load('config.json');
            await store.set('api_id', apiId.trim());
            await store.set('api_hash', apiHash.trim());
            await store.save();
        } catch { /* non-critical */ }
    };

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        });
    };

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleSetupSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const id = apiId.trim();
        const hash = apiHash.trim();
        if (!id || !hash) { setError("Both fields are required."); return; }
        if (id.includes(' ') || hash.includes(' ')) { setError("Remove spaces from both fields."); return; }
        if (isNaN(parseInt(id, 10))) { setError("API ID must be a number."); return; }
        setError(null);
        await saveCredentials();
        setStep("phone");
    };

    const handlePhoneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            await invoke("cmd_auth_request_code", { phone, apiId: parseInt(apiId, 10), apiHash: apiHash.trim() });
            setStep("code");
        } catch (err: unknown) {
            const msg = String(err instanceof Error ? err.message : err);
            const fw = msg.match(/FLOOD_WAIT_(\d+)/);
            if (fw) { setFloodWait(parseInt(fw[1])); return; }
            setError(msg);
        } finally { setLoading(false); }
    };

    const handleCodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await invoke<{ success: boolean; next_step?: string }>("cmd_auth_sign_in", { code });
            if (res.success) onLogin();
            else if (res.next_step === "password") setStep("password");
            else setError("Unexpected response.");
        } catch (err: unknown) { setError(String(err instanceof Error ? err.message : err)); }
        finally { setLoading(false); }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await invoke<{ success: boolean }>("cmd_auth_check_password", { password });
            if (res.success) onLogin();
            else setError("Incorrect password.");
        } catch (err: unknown) { setError(String(err instanceof Error ? err.message : err)); }
        finally { setLoading(false); }
    };

    // ── Slides ───────────────────────────────────────────────────────────────

    const GUIDE_STEPS = [
        {
            title: "Entra a my.telegram.org",
            desc: "Abre el portal de desarrolladores de Telegram. Inicia sesión con tu número de teléfono (el mismo que usas en la app de Telegram).",
            mockup: <TelegramPortalMockup highlight="api-tools" />,
            action: (
                <button
                    type="button"
                    onClick={() => { open('https://my.telegram.org'); }}
                    className="flex items-center gap-2 rounded-xl bg-telegram-primary px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 transition"
                >
                    <ExternalLink className="h-4 w-4" />
                    Abrir my.telegram.org
                </button>
            ),
        },
        {
            title: "Haz click en «API development tools»",
            desc: "Una vez dentro, verás el menú principal. Haz click en «API development tools» y luego en «Create new application». Puedes poner cualquier nombre.",
            mockup: <TelegramPortalMockup highlight="create" />,
            action: null,
        },
        {
            title: "Copia tu API ID y API Hash",
            desc: "Después de crear la app verás dos datos importantes: el API ID (un número) y el API Hash (una cadena larga). Cópialos — los necesitarás en el siguiente paso.",
            mockup: <TelegramPortalMockup highlight="credentials" />,
            action: null,
        },
    ];

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="h-full w-full auth-gradient flex items-center justify-center p-4 relative overflow-hidden">
            <AuthThemeToggle />

            {/* Background glows */}
            <div className="pointer-events-none fixed top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] -z-10" />
            <div className="pointer-events-none fixed bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] -z-10" />

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="auth-glass p-6 rounded-3xl shadow-2xl w-full max-w-md"
            >
                {/* Logo */}
                <div className="flex flex-col items-center mb-6">
                    <img src="/logo.svg" alt="" className="w-14 h-14 mb-3 drop-shadow-lg" />
                    <h1 className="text-xl font-bold text-white tracking-tight">SharkDrive</h1>
                    <p className="text-xs text-white/50 mt-0.5">Tu nube privada sobre Telegram</p>
                </div>

                <StepDots current={step} />

                <AnimatePresence mode="wait">
                    {/* ── FLOOD WAIT ──────────────────────────────────────── */}
                    {floodWait ? (
                        <motion.div key="flood" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-5">
                            <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse text-2xl">⏳</div>
                            <div>
                                <h2 className="text-lg font-bold text-white mb-1">Demasiadas solicitudes</h2>
                                <p className="text-sm text-white/50">Telegram limitó temporalmente tu cuenta. Espera antes de continuar.</p>
                            </div>
                            <div className="text-4xl font-mono font-bold text-blue-400">
                                {Math.floor(floodWait / 60)}:{(floodWait % 60).toString().padStart(2, '0')}
                            </div>
                            <p className="text-xs text-red-400/60">No cierres la app o el contador se reiniciará.</p>
                        </motion.div>
                    ) : (

                    <>
                    {/* ── WELCOME ─────────────────────────────────────────── */}
                    {step === "welcome" && (
                        <motion.div key="welcome" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-5">
                            <div className="text-center">
                                <h2 className="text-lg font-bold text-white">¿Cómo funciona?</h2>
                                <p className="mt-2 text-sm text-white/55 leading-relaxed">
                                    SharkDrive convierte tu cuenta de Telegram en un drive personal. Tus archivos se guardan directamente en tu propio Telegram — no en ningún servidor externo.
                                </p>
                            </div>

                            <div className="space-y-2.5">
                                {[
                                    { icon: '🔑', title: 'Credenciales de Telegram', desc: 'Necesitas crear una "app" gratuita en my.telegram.org. Es un proceso de 2 minutos.' },
                                    { icon: '📱', title: 'Tu número de teléfono', desc: 'Telegram te enviará un código de verificación, igual que cuando instalas Telegram en un nuevo dispositivo.' },
                                    { icon: '🔒', title: 'Solo tú tienes acceso', desc: 'Todo queda en tu cuenta. SharkDrive no almacena ni ve tus archivos.' },
                                ].map(item => (
                                    <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.05] border border-white/[0.06]">
                                        <span className="text-lg flex-shrink-0">{item.icon}</span>
                                        <div>
                                            <p className="text-sm font-semibold text-white">{item.title}</p>
                                            <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setStep('guide')}
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-900/20"
                            >
                                Empezar configuración <ArrowRight className="w-4 h-4" />
                            </button>

                            {import.meta.env.DEV && (
                                <button onClick={() => onLogin()} className="w-full text-xs text-red-400/50 hover:text-red-300 py-1">Dev Mode</button>
                            )}
                        </motion.div>
                    )}

                    {/* ── GUIDE ───────────────────────────────────────────── */}
                    {step === "guide" && (
                        <motion.div key="guide" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-4">
                            {/* Sub-step indicators */}
                            <div className="flex items-center gap-1.5 mb-2">
                                {GUIDE_STEPS.map((_, i) => (
                                    <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= guideSubStep ? 'bg-telegram-primary' : 'bg-white/15'}`} />
                                ))}
                            </div>

                            <div className="text-center">
                                <div className="text-xs text-telegram-primary font-semibold uppercase tracking-wider mb-1">Paso {guideSubStep + 1} de {GUIDE_STEPS.length}</div>
                                <h2 className="text-base font-bold text-white">{GUIDE_STEPS[guideSubStep].title}</h2>
                                <p className="mt-1.5 text-xs text-white/55 leading-relaxed">{GUIDE_STEPS[guideSubStep].desc}</p>
                            </div>

                            <div className="rounded-xl overflow-hidden border border-white/10">
                                {GUIDE_STEPS[guideSubStep].mockup}
                            </div>

                            <div className="flex gap-2">
                                {guideSubStep > 0 && (
                                    <button
                                        onClick={() => setGuideSubStep(g => g - 1)}
                                        className="flex-1 py-2.5 rounded-xl border border-white/15 text-sm text-white/60 hover:text-white hover:border-white/30 transition"
                                    >
                                        Atrás
                                    </button>
                                )}
                                {GUIDE_STEPS[guideSubStep].action && (
                                    <div className="flex-1">{GUIDE_STEPS[guideSubStep].action}</div>
                                )}
                                {guideSubStep < GUIDE_STEPS.length - 1 ? (
                                    <button
                                        onClick={() => setGuideSubStep(g => g + 1)}
                                        className="flex-1 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                                    >
                                        Siguiente <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setStep('setup')}
                                        className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white text-sm font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
                                    >
                                        Ya tengo mis credenciales <CheckCircle className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <button
                                onClick={() => setStep('setup')}
                                className="w-full text-xs text-white/35 hover:text-white/60 py-1 transition"
                            >
                                Saltar tutorial — ya sé lo que es
                            </button>
                        </motion.div>
                    )}

                    {/* ── SETUP (credentials) ──────────────────────────────── */}
                    {step === "setup" && (
                        <motion.form key="setup" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} onSubmit={handleSetupSubmit} className="space-y-4">
                            <div className="text-center">
                                <h2 className="text-base font-bold text-white">Introduce tus credenciales</h2>
                                <p className="mt-1 text-xs text-white/50">Cópialas de my.telegram.org → Tu app → App configuration</p>
                            </div>

                            <div className="space-y-3">
                                {/* API ID */}
                                <div>
                                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                                        API ID <span className="normal-case font-normal text-white/30">(número, ej: 12345678)</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={apiId}
                                            onChange={e => setApiId(e.target.value)}
                                            placeholder="12345678"
                                            className="flex-1 glass-input rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm transition"
                                        />
                                        {apiId && (
                                            <button type="button" onClick={() => handleCopy(apiId, 'id')}
                                                className="p-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white/50 hover:text-white transition"
                                                title="Copy"
                                            >
                                                {copied === 'id' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* API Hash */}
                                <div>
                                    <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5">
                                        API Hash <span className="normal-case font-normal text-white/30">(cadena larga de letras y números)</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type={showApiHash ? 'text' : 'password'}
                                                value={apiHash}
                                                onChange={e => setApiHash(e.target.value)}
                                                placeholder="0a1b2c3d4e5f..."
                                                className="w-full glass-input rounded-xl px-4 py-3 pr-11 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm transition"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowApiHash(v => !v)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition"
                                            >
                                                {showApiHash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-900/20"
                            >
                                Continuar <ArrowRight className="w-4 h-4" />
                            </button>

                            <div className="flex gap-3">
                                <button type="button" onClick={() => { setStep('guide'); setGuideSubStep(2); }}
                                    className="flex-1 text-xs text-white/40 hover:text-white/70 py-1 transition">
                                    ← Ver tutorial
                                </button>
                                <button type="button" onClick={() => open('https://my.telegram.org')}
                                    className="flex-1 flex items-center justify-center gap-1 text-xs text-telegram-primary hover:text-blue-300 py-1 transition">
                                    <ExternalLink className="w-3 h-3" /> my.telegram.org
                                </button>
                            </div>
                        </motion.form>
                    )}

                    {/* ── PHONE ────────────────────────────────────────────── */}
                    {step === "phone" && (
                        <motion.form key="phone" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} onSubmit={handlePhoneSubmit} className="space-y-5">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-telegram-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Phone className="w-5 h-5 text-telegram-primary" />
                                </div>
                                <h2 className="text-base font-bold text-white">Tu número de Telegram</h2>
                                <p className="mt-1 text-xs text-white/50">El mismo número que usas en la app de Telegram. Te llegará un código de verificación.</p>
                            </div>
                            <input
                                type="tel"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                placeholder="+34 600 000 000"
                                autoFocus
                                className="w-full glass-input rounded-xl px-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-lg tracking-wide transition text-center"
                            />
                            <div className="flex flex-col gap-2">
                                <button
                                    type="submit"
                                    disabled={loading || !phone.trim()}
                                    className="w-full bg-white text-black hover:bg-gray-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg disabled:opacity-50"
                                >
                                    {loading ? "Conectando…" : <>Enviar código <ArrowRight className="w-4 h-4" /></>}
                                </button>
                                <button type="button" onClick={() => setStep("setup")} className="text-xs text-white/35 hover:text-white/60 py-1 transition">
                                    ← Cambiar credenciales
                                </button>
                            </div>
                        </motion.form>
                    )}

                    {/* ── CODE ─────────────────────────────────────────────── */}
                    {step === "code" && (
                        <motion.form key="code" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} onSubmit={handleCodeSubmit} className="space-y-5">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Key className="w-5 h-5 text-green-400" />
                                </div>
                                <h2 className="text-base font-bold text-white">Código de verificación</h2>
                                <p className="mt-1 text-xs text-white/50">
                                    Telegram envió un código de 5 dígitos a <strong className="text-white">{phone}</strong> (en la app de Telegram o por SMS).
                                </p>
                            </div>
                            <input
                                ref={codeInputRef}
                                type="text"
                                inputMode="numeric"
                                value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                                placeholder="• • • • •"
                                className="w-full glass-input rounded-xl px-4 py-5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-3xl tracking-[0.6em] font-mono text-center transition"
                            />
                            <div className="flex flex-col gap-2">
                                <button
                                    type="submit"
                                    disabled={loading || code.length < 5}
                                    className="w-full bg-white text-black hover:bg-gray-100 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition shadow-lg disabled:opacity-50"
                                >
                                    {loading ? "Verificando…" : "Entrar a SharkDrive"}
                                </button>
                                <button type="button" onClick={() => setStep("phone")} className="text-xs text-white/35 hover:text-white/60 py-1 transition">
                                    ← Cambiar número
                                </button>
                            </div>
                        </motion.form>
                    )}

                    {/* ── PASSWORD (2FA) ───────────────────────────────────── */}
                    {step === "password" && (
                        <motion.form key="password" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} onSubmit={handlePasswordSubmit} className="space-y-5">
                            <div className="text-center">
                                <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Lock className="w-5 h-5 text-purple-400" />
                                </div>
                                <h2 className="text-base font-bold text-white">Contraseña de nube</h2>
                                <p className="mt-1 text-xs text-white/50">Tu cuenta tiene verificación en dos pasos activada. Introduce la contraseña que configuraste en Telegram.</p>
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Contraseña de Telegram"
                                autoFocus
                                className="w-full glass-input rounded-xl px-4 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-lg transition"
                            />
                            <div className="flex flex-col gap-2">
                                <button
                                    type="submit"
                                    disabled={loading || !password}
                                    className="w-full bg-white text-black hover:bg-gray-100 font-bold py-3.5 rounded-xl transition shadow-lg disabled:opacity-50"
                                >
                                    {loading ? "Verificando…" : "Desbloquear"}
                                </button>
                                <button type="button" onClick={() => { setStep("code"); setPassword(""); setError(null); }} className="text-xs text-white/35 hover:text-white/60 py-1 transition">
                                    ← Volver al código
                                </button>
                            </div>
                        </motion.form>
                    )}
                    </>
                    )}
                </AnimatePresence>

                {/* Error */}
                {error && !floodWait && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
                    >
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                        <p className="text-red-400 text-sm leading-snug">{error}</p>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
