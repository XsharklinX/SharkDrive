import { useCallback, useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { X, Link2, Ban, Copy, Check, Clock, Lock, Download, RefreshCw, Trash2, QrCode, ShieldCheck } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tauriApi } from '../../api/tauri';
import { ShareLinkInfo } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

function timeRemaining(expiresMs: number | null | undefined, lang: 'en' | 'es'): string {
    if (!expiresMs) return lang === 'es' ? 'No expira' : 'Never expires';
    const diff = expiresMs - Date.now();
    if (diff <= 0) return lang === 'es' ? 'Expirado' : 'Expired';
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return lang === 'es' ? `${mins} min restantes` : `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return lang === 'es' ? `${hrs} h restantes` : `${hrs}h left`;
    const days = Math.floor(hrs / 24);
    return lang === 'es' ? `${days} d restantes` : `${days}d left`;
}

function isExpired(link: ShareLinkInfo): boolean {
    return !!link.expires_at_epoch_ms && link.expires_at_epoch_ms < Date.now();
}

function isExhausted(link: ShareLinkInfo): boolean {
    return !!link.max_downloads && link.download_count >= link.max_downloads;
}

function expiryBarPct(link: ShareLinkInfo): number {
    if (!link.expires_at_epoch_ms) return 100;
    const total = link.expires_at_epoch_ms - link.created_at_epoch_ms;
    const remaining = link.expires_at_epoch_ms - Date.now();
    if (total <= 0) return 100;
    return Math.max(0, Math.min(100, (remaining / total) * 100));
}

function ShareMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
    return (
        <div className="rounded-xl border border-telegram-border bg-white/[0.025] px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-telegram-subtext">
                {icon}
                {label}
            </div>
            <p className="mt-1 text-xl font-semibold text-telegram-text">{value}</p>
        </div>
    );
}

function LinkRow({ link, onRevoke }: { link: ShareLinkInfo; onRevoke: (token: string) => void }) {
    const { lang } = useLanguage();
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState('');
    const expired = isExpired(link);
    const exhausted = isExhausted(link);
    const dead = expired || exhausted;
    const pct = expiryBarPct(link);
    const barColor = pct > 50 ? 'bg-emerald-400' : pct > 20 ? 'bg-yellow-400' : 'bg-red-400';

    useEffect(() => {
        if (!showQr) return;
        let cancelled = false;
        QRCode.toDataURL(link.url, {
            margin: 1,
            width: 160,
            color: { dark: '#06111d', light: '#f8fafc' },
        }).then((dataUrl) => {
            if (!cancelled) setQrDataUrl(dataUrl);
        }).catch(() => setQrDataUrl(''));
        return () => { cancelled = true; };
    }, [link.url, showQr]);

    const handleCopy = () => {
        navigator.clipboard.writeText(link.url).then(() => {
            setCopied(true);
            toast.success(lang === 'es' ? 'Enlace copiado' : 'Link copied');
            setTimeout(() => setCopied(false), 1800);
        });
    };

    const handleDownloadQr = () => {
        if (!qrDataUrl) return;
        const anchor = document.createElement('a');
        anchor.href = qrDataUrl;
        anchor.download = `${link.filename}-qr.png`;
        anchor.click();
    };

    return (
        <div className={`rounded-xl border p-4 transition ${dead ? 'border-white/[0.04] opacity-60' : 'border-telegram-border bg-white/[0.02]'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-telegram-text" title={link.filename}>{link.filename}</span>
                        {link.is_password_protected && (
                            <span className="flex items-center gap-0.5 rounded-md border border-yellow-400/20 bg-yellow-400/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
                                <Lock className="h-2.5 w-2.5" /> {lang === 'es' ? 'Clave' : 'Password'}
                            </span>
                        )}
                        {dead && (
                            <span className="rounded-md border border-red-400/20 bg-red-400/10 px-1.5 py-0.5 text-[10px] text-red-300">
                                {exhausted ? (lang === 'es' ? 'Límite alcanzado' : 'Limit reached') : (lang === 'es' ? 'Expirado' : 'Expired')}
                            </span>
                        )}
                    </div>

                    <p className="truncate font-mono text-xs text-telegram-subtext/70">{link.url}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-telegram-subtext">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeRemaining(link.expires_at_epoch_ms, lang)}
                        </span>
                        <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {link.download_count}{link.max_downloads ? ` / ${link.max_downloads}` : ''} {lang === 'es' ? 'descargas' : 'downloads'}
                        </span>
                    </div>

                    {link.expires_at_epoch_ms && !expired && (
                        <div className="mt-2 h-1 w-full rounded-full bg-white/[0.05]">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                    )}
                    {link.max_downloads && !exhausted && (
                        <div className="mt-1 h-1 w-full rounded-full bg-white/[0.05]">
                            <div className="h-full rounded-full bg-telegram-primary transition-all" style={{ width: `${Math.min(100, (link.download_count / link.max_downloads) * 100)}%` }} />
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setShowQr((value) => !value)} disabled={dead} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text disabled:opacity-30" title="QR">
                        <QrCode className="h-4 w-4" />
                    </button>
                    <button onClick={handleCopy} disabled={dead} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text disabled:opacity-30" title={lang === 'es' ? 'Copiar enlace' : 'Copy link'}>
                        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button onClick={() => onRevoke(link.token)} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-300" title={lang === 'es' ? 'Revocar enlace' : 'Revoke link'}>
                        <Ban className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {showQr && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-telegram-border bg-black/10 p-3">
                    {qrDataUrl ? (
                        <img src={qrDataUrl} alt="QR" className="h-24 w-24 rounded-lg bg-white p-1" />
                    ) : (
                        <div className="h-24 w-24 animate-pulse rounded-lg bg-white/[0.05]" />
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-telegram-text">QR</p>
                        <p className="mt-1 text-xs text-telegram-subtext">
                            {lang === 'es' ? 'Escanéalo desde otro dispositivo en tu red local.' : 'Scan it from another device on your local network.'}
                        </p>
                        <button onClick={handleDownloadQr} disabled={!qrDataUrl} className="mt-2 rounded-lg border border-telegram-border px-3 py-1.5 text-xs text-telegram-text transition hover:bg-white/[0.04] disabled:opacity-40">
                            {lang === 'es' ? 'Descargar PNG' : 'Download PNG'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

interface ShareLinksDashboardProps {
    onClose: () => void;
}

export function ShareLinksDashboard({ onClose }: ShareLinksDashboardProps) {
    const { lang } = useLanguage();
    const queryClient = useQueryClient();
    const [revoking, setRevoking] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('active');

    const { data: links = [], isLoading, refetch } = useQuery({
        queryKey: ['share-links'],
        queryFn: () => tauriApi.listShareLinks(),
        refetchInterval: 30_000,
    });

    const activeLinks = links.filter((link) => !isExpired(link) && !isExhausted(link));
    const deadLinks = links.filter((link) => isExpired(link) || isExhausted(link));
    const protectedLinks = links.filter((link) => link.is_password_protected);
    const displayed = filter === 'all' ? links : filter === 'active' ? activeLinks : deadLinks;

    const handleRevoke = useCallback(async (token: string) => {
        setRevoking((prev) => new Set(prev).add(token));
        try {
            await tauriApi.revokeShareLink(token);
            queryClient.setQueryData<ShareLinkInfo[]>(['share-links'], (prev) => (prev ?? []).filter((link) => link.token !== token));
            toast.info(lang === 'es' ? 'Enlace revocado' : 'Link revoked');
        } catch (error) {
            toast.error(`${lang === 'es' ? 'No se pudo revocar' : 'Failed to revoke'}: ${String(error)}`);
        } finally {
            setRevoking((prev) => {
                const next = new Set(prev);
                next.delete(token);
                return next;
            });
        }
    }, [lang, queryClient]);

    const handleRevokeAll = useCallback(async (tokens: string[]) => {
        if (tokens.length === 0) return;
        try {
            await tauriApi.revokeShareLinks(tokens);
            queryClient.setQueryData<ShareLinkInfo[]>(['share-links'], (prev) => (prev ?? []).filter((link) => !tokens.includes(link.token)));
            toast.info(lang === 'es' ? `${tokens.length} enlaces revocados` : `${tokens.length} links revoked`);
        } catch (error) {
            toast.error(`${lang === 'es' ? 'No se pudieron revocar' : 'Failed to revoke'}: ${String(error)}`);
        }
    }, [lang, queryClient]);

    const copyActiveLinks = () => {
        const text = activeLinks.map((link) => `${link.filename}\n${link.url}`).join('\n\n');
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => toast.success(lang === 'es' ? 'Enlaces activos copiados' : 'Active links copied'));
    };

    const filterLabels = {
        active: lang === 'es' ? 'Activos' : 'Active',
        all: lang === 'es' ? 'Todos' : 'All',
        expired: lang === 'es' ? 'Expirados' : 'Expired',
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative mx-4 flex w-full max-w-3xl flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                style={{ maxHeight: '88vh' }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex shrink-0 items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Link2 className="h-5 w-5 text-telegram-primary" />
                        <div>
                            <h2 className="text-base font-semibold text-telegram-text">{lang === 'es' ? 'Centro de Compartir' : 'Sharing Center'}</h2>
                            <p className="text-xs text-telegram-subtext">
                                {activeLinks.length} {lang === 'es' ? 'activos' : 'active'} · {deadLinks.length} {lang === 'es' ? 'expirados' : 'expired'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => refetch()} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text" title={lang === 'es' ? 'Refrescar' : 'Refresh'}>
                            <RefreshCw className="h-4 w-4" />
                        </button>
                        <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="grid shrink-0 gap-3 border-b border-telegram-border px-6 py-4 sm:grid-cols-3">
                    <ShareMetric label={lang === 'es' ? 'Enlaces activos' : 'Active links'} value={String(activeLinks.length)} icon={<Link2 className="h-3.5 w-3.5" />} />
                    <ShareMetric label={lang === 'es' ? 'Protegidos' : 'Protected'} value={String(protectedLinks.length)} icon={<ShieldCheck className="h-3.5 w-3.5" />} />
                    <ShareMetric label={lang === 'es' ? 'Descargas totales' : 'Total downloads'} value={String(links.reduce((sum, link) => sum + link.download_count, 0))} icon={<Download className="h-3.5 w-3.5" />} />
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-telegram-border px-6 py-3">
                    <div className="flex gap-1">
                        {(['active', 'all', 'expired'] as const).map((item) => (
                            <button
                                key={item}
                                onClick={() => setFilter(item)}
                                className={`rounded-md px-2.5 py-1 text-xs transition ${filter === item ? 'bg-telegram-primary/12 text-telegram-primary' : 'text-telegram-subtext hover:bg-white/[0.04] hover:text-telegram-text'}`}
                            >
                                {filterLabels[item]}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {activeLinks.length > 0 && (
                            <button onClick={copyActiveLinks} className="flex items-center gap-1 rounded-md border border-telegram-border px-2.5 py-1 text-xs text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text">
                                <Copy className="h-3 w-3" />
                                {lang === 'es' ? 'Copiar activos' : 'Copy active'}
                            </button>
                        )}
                        {deadLinks.length > 0 && (
                            <button onClick={() => handleRevokeAll(deadLinks.map((link) => link.token))} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300">
                                <Trash2 className="h-3 w-3" />
                                {lang === 'es' ? 'Limpiar expirados' : 'Clear expired'}
                            </button>
                        )}
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    {isLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                        </div>
                    ) : displayed.length === 0 ? (
                        <div className="flex h-36 flex-col items-center justify-center text-center">
                            <Link2 className="mb-3 h-8 w-8 text-telegram-subtext/30" />
                            <p className="text-sm text-telegram-subtext">
                                {filter === 'active'
                                    ? (lang === 'es' ? 'No hay enlaces activos' : 'No active share links')
                                    : (lang === 'es' ? 'No hay enlaces' : 'No links')}
                            </p>
                            <p className="mt-1 text-xs text-telegram-subtext/60">
                                {lang === 'es' ? 'Haz clic derecho en un archivo para compartirlo.' : 'Right-click any file to share it.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {displayed.map((link) => (
                                <LinkRow key={link.token} link={link} onRevoke={(token) => !revoking.has(token) && handleRevoke(token)} />
                            ))}
                        </div>
                    )}
                </div>

                {activeLinks.length > 1 && (
                    <div className="flex shrink-0 justify-end border-t border-telegram-border px-6 py-3">
                        <button onClick={() => handleRevokeAll(activeLinks.map((link) => link.token))} className="flex items-center gap-2 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10">
                            <Ban className="h-3.5 w-3.5" />
                            {lang === 'es' ? `Revocar activos (${activeLinks.length})` : `Revoke all active (${activeLinks.length})`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
