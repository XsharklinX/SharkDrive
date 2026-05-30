import { useState, useCallback } from 'react';
import { X, Link2, Ban, Copy, Check, Clock, Lock, Download, RefreshCw, Trash2 } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tauriApi } from '../../api/tauri';
import { ShareLinkInfo } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeRemaining(expiresMs?: number | null): string {
    if (!expiresMs) return 'Never expires';
    const diff = expiresMs - Date.now();
    if (diff <= 0) return 'Expired';
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h left`;
    return `${Math.floor(hrs / 24)}d left`;
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

// ── Row ───────────────────────────────────────────────────────────────────────

function LinkRow({ link, onRevoke }: { link: ShareLinkInfo; onRevoke: (token: string) => void }) {
    const [copied, setCopied] = useState(false);
    const expired = isExpired(link);
    const exhausted = isExhausted(link);
    const dead = expired || exhausted;
    const pct = expiryBarPct(link);
    const barColor = pct > 50 ? 'bg-emerald-400' : pct > 20 ? 'bg-yellow-400' : 'bg-red-400';

    const handleCopy = () => {
        navigator.clipboard.writeText(link.url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    };

    return (
        <div className={`rounded-xl border p-4 transition ${dead ? 'border-white/[0.04] opacity-50' : 'border-telegram-border bg-white/[0.02]'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    {/* filename + badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="truncate text-sm font-medium text-telegram-text" title={link.filename}>
                            {link.filename}
                        </span>
                        {link.is_password_protected && (
                            <span className="flex items-center gap-0.5 rounded-md border border-yellow-400/20 bg-yellow-400/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
                                <Lock className="h-2.5 w-2.5" /> Password
                            </span>
                        )}
                        {dead && (
                            <span className="rounded-md border border-red-400/20 bg-red-400/10 px-1.5 py-0.5 text-[10px] text-red-300">
                                {exhausted ? 'Limit reached' : 'Expired'}
                            </span>
                        )}
                    </div>

                    {/* URL */}
                    <p className="font-mono text-xs text-telegram-subtext/70 truncate">{link.url}</p>

                    {/* Stats row */}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-telegram-subtext">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeRemaining(link.expires_at_epoch_ms)}
                        </span>
                        <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {link.download_count}
                            {link.max_downloads ? ` / ${link.max_downloads}` : ''} downloads
                        </span>
                    </div>

                    {/* Expiry bar */}
                    {link.expires_at_epoch_ms && !expired && (
                        <div className="mt-2 h-1 w-full rounded-full bg-white/[0.05]">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                    )}
                    {/* Downloads bar */}
                    {link.max_downloads && !exhausted && (
                        <div className="mt-1 h-1 w-full rounded-full bg-white/[0.05]">
                            <div
                                className="h-full rounded-full bg-telegram-primary transition-all"
                                style={{ width: `${Math.min(100, (link.download_count / link.max_downloads) * 100)}%` }}
                            />
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                        onClick={handleCopy}
                        disabled={dead}
                        className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text disabled:opacity-30"
                        title="Copy link"
                    >
                        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <button
                        onClick={() => onRevoke(link.token)}
                        className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-300"
                        title="Revoke link"
                    >
                        <Ban className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface ShareLinksDashboardProps {
    onClose: () => void;
}

export function ShareLinksDashboard({ onClose }: ShareLinksDashboardProps) {
    const queryClient = useQueryClient();
    const [revoking, setRevoking] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('active');

    const { data: links = [], isLoading, refetch } = useQuery({
        queryKey: ['share-links'],
        queryFn: () => tauriApi.listShareLinks(),
        refetchInterval: 30_000,
    });

    const activeLinks = links.filter(l => !isExpired(l) && !isExhausted(l));
    const deadLinks = links.filter(l => isExpired(l) || isExhausted(l));
    const displayed = filter === 'all' ? links : filter === 'active' ? activeLinks : deadLinks;

    const handleRevoke = useCallback(async (token: string) => {
        setRevoking(prev => new Set(prev).add(token));
        try {
            await tauriApi.revokeShareLink(token);
            queryClient.setQueryData<ShareLinkInfo[]>(['share-links'], prev =>
                (prev ?? []).filter(l => l.token !== token)
            );
            toast.info('Link revoked');
        } catch (e) {
            toast.error(`Failed to revoke: ${e}`);
        } finally {
            setRevoking(prev => { const s = new Set(prev); s.delete(token); return s; });
        }
    }, [queryClient]);

    const handleRevokeAll = useCallback(async (tokens: string[]) => {
        try {
            await tauriApi.revokeShareLinks(tokens);
            queryClient.setQueryData<ShareLinkInfo[]>(['share-links'], prev =>
                (prev ?? []).filter(l => !tokens.includes(l.token))
            );
            toast.info(`${tokens.length} link${tokens.length > 1 ? 's' : ''} revoked`);
        } catch (e) {
            toast.error(`Failed to revoke: ${e}`);
        }
    }, [queryClient]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative mx-4 flex w-full max-w-xl flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                style={{ maxHeight: '88vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Link2 className="h-5 w-5 text-telegram-primary" />
                        <div>
                            <h2 className="text-base font-semibold text-telegram-text">Share Links</h2>
                            <p className="text-xs text-telegram-subtext">
                                {activeLinks.length} active · {deadLinks.length} expired
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => refetch()}
                            className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text"
                            title="Refresh"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Filter + bulk actions */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-telegram-border px-6 py-3">
                    <div className="flex gap-1">
                        {(['active', 'all', 'expired'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`rounded-md px-2.5 py-1 text-xs transition capitalize ${filter === f ? 'bg-telegram-primary/12 text-telegram-primary' : 'text-telegram-subtext hover:bg-white/[0.04] hover:text-telegram-text'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    {deadLinks.length > 0 && (
                        <button
                            onClick={() => handleRevokeAll(deadLinks.map(l => l.token))}
                            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-red-300/70 transition hover:bg-red-500/10 hover:text-red-300"
                        >
                            <Trash2 className="h-3 w-3" />
                            Clear expired
                        </button>
                    )}
                </div>

                {/* List */}
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    {isLoading ? (
                        <div className="flex h-32 items-center justify-center">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                        </div>
                    ) : displayed.length === 0 ? (
                        <div className="flex h-32 flex-col items-center justify-center text-center">
                            <Link2 className="mb-3 h-8 w-8 text-telegram-subtext/30" />
                            <p className="text-sm text-telegram-subtext">
                                {filter === 'active' ? 'No active share links' : 'No links'}
                            </p>
                            <p className="mt-1 text-xs text-telegram-subtext/60">
                                Right-click any file to share it.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {displayed.map(link => (
                                <LinkRow
                                    key={link.token}
                                    link={link}
                                    onRevoke={token => !revoking.has(token) && handleRevoke(token)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer: revoke all active */}
                {activeLinks.length > 1 && (
                    <div className="flex flex-shrink-0 justify-end border-t border-telegram-border px-6 py-3">
                        <button
                            onClick={() => handleRevokeAll(activeLinks.map(l => l.token))}
                            className="flex items-center gap-2 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/10"
                        >
                            <Ban className="h-3.5 w-3.5" />
                            Revoke all active ({activeLinks.length})
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
