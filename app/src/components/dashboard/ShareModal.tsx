import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { X, Link, Copy, Check, Wifi, Send, Shield, TimerReset, RotateCcw, Ban, Download, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { resolveFileFolderId } from '../../utils';

interface ShareModalProps {
    file?: TelegramFile;
    files?: TelegramFile[];
    activeFolderId: number | null;
    onClose: () => void;
}

type GeneratedLink = {
    file: TelegramFile;
    url: string;
    lanUrl: string;
};

const EXPIRY_PRESETS = [
    { label: '1h', minutes: 60 },
    { label: '24h', minutes: 1440 },
    { label: '7d', minutes: 10080 },
    { label: 'Never', minutes: 0 },
];

function extractShareToken(url: string) {
    const match = url.match(/\/share\/([^/?#]+)/);
    return match?.[1] ?? '';
}

function expiryLabel(minutes: number) {
    if (minutes <= 0) return 'never';
    if (minutes % 10080 === 0) return `${minutes / 10080} week${minutes === 10080 ? '' : 's'}`;
    if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
    if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
    return `${minutes} minutes`;
}

export function ShareModal({ file, files, activeFolderId, onClose }: ShareModalProps) {
    const targets = useMemo(() => (files && files.length > 0 ? files : file ? [file] : []).filter((item) => item.type !== 'folder'), [file, files]);
    const folderTarget = file?.type === 'folder' ? file : null;
    const isBulk = targets.length > 1;
    const [localIp, setLocalIp] = useState('localhost');
    const [links, setLinks] = useState<GeneratedLink[]>([]);
    const [shareLoading, setShareLoading] = useState(false);
    const [shareError, setShareError] = useState(false);
    const [folderInviteLink, setFolderInviteLink] = useState<string | null>(null);
    const [loadingInvite, setLoadingInvite] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [expiresInMinutes, setExpiresInMinutes] = useState(60);
    const [shareRevision, setShareRevision] = useState(0);
    const [retryPending, setRetryPending] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState('');

    useEffect(() => {
        tauriApi.getLocalIp().then((ip) => setLocalIp(ip)).catch(() => {});
    }, [file, activeFolderId]);

    useEffect(() => {
        if (targets.length === 0) return;

        setLinks([]);
        setShareError(false);
        setShareLoading(true);

        const timeoutId = setTimeout(() => {
            setShareLoading(false);
            setShareError(true);
        }, 15000);

        Promise.all(targets.map(async (target) => {
            const url = await tauriApi.createShareLink(target.id, resolveFileFolderId(target, activeFolderId), target.name, expiresInMinutes);
            return {
                file: target,
                url,
                lanUrl: url.replace('localhost', localIp),
            };
        }))
            .then((result) => {
                clearTimeout(timeoutId);
                setLinks(result);
                setShareLoading(false);
            })
            .catch(() => {
                clearTimeout(timeoutId);
                setShareLoading(false);
                setShareError(true);
            });

        return () => clearTimeout(timeoutId);
    }, [targets, activeFolderId, expiresInMinutes, shareRevision, localIp]);

    const primaryLink = links[0];

    useEffect(() => {
        if (!primaryLink?.lanUrl || isBulk) {
            setQrDataUrl('');
            return;
        }
        let cancelled = false;
        QRCode.toDataURL(primaryLink.lanUrl, {
            margin: 1,
            width: 192,
            color: {
                dark: '#06111d',
                light: '#f8fafc',
            },
        }).then((dataUrl) => {
            if (!cancelled) setQrDataUrl(dataUrl);
        }).catch(() => setQrDataUrl(''));
        return () => { cancelled = true; };
    }, [isBulk, primaryLink?.lanUrl]);

    const copyToClipboard = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        toast.success('Copied');
        setTimeout(() => setCopied(null), 2000);
    };

    const handleGetFolderLink = async () => {
        if (activeFolderId === null) {
            toast.error("Can't share Saved Messages");
            return;
        }

        setLoadingInvite(true);
        try {
            const link = await tauriApi.getFolderInviteLink(activeFolderId);
            setFolderInviteLink(link);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to get invite link');
        } finally {
            setLoadingInvite(false);
        }
    };

    const handleRevokeLocalLink = async (url: string) => {
        const token = extractShareToken(url);
        if (!token) return;

        try {
            await tauriApi.revokeShareLink(token);
            setLinks((current) => current.filter((link) => link.url !== url));
            toast.info('Local link revoked');
        } catch (e) {
            toast.error(`Failed to revoke link: ${e}`);
        }
    };

    const handleDownloadQr = () => {
        if (!qrDataUrl) return;
        const anchor = document.createElement('a');
        anchor.href = qrDataUrl;
        anchor.download = `${primaryLink?.file.name ?? 'share-link'}-qr.png`;
        anchor.click();
    };

    const allLinksText = links.map((item) => `${item.file.name}\n${item.lanUrl}`).join('\n\n');

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="mx-4 w-full max-w-3xl rounded-lg border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border/80 p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                            <Link className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-telegram-text">
                                {isBulk ? `Share ${targets.length} Files` : folderTarget ? 'Share Folder' : 'Share File'}
                            </h2>
                            <p className="max-w-[420px] truncate text-xs text-telegram-subtext">
                                {isBulk ? 'Generate one local link per selected file' : (file?.name ?? 'No file selected')}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-[1.25fr,0.85fr]">
                    <section className="rounded-lg border border-telegram-border bg-white/[0.025] p-4">
                        <div className="mb-4 flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                <Wifi className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-telegram-text">Local Link</h3>
                                <p className="mt-1 text-xs leading-5 text-telegram-subtext">
                                    Anyone on your Wi-Fi can open this while SharkDrive is running.
                                </p>
                            </div>
                        </div>

                        {!folderTarget && (
                            <div className="mb-4 space-y-3">
                                <label className="block text-[10px] uppercase tracking-[0.2em] text-telegram-subtext">Expiration</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {EXPIRY_PRESETS.map((preset) => (
                                        <button
                                            key={preset.label}
                                            onClick={() => setExpiresInMinutes(preset.minutes)}
                                            className={`rounded-md px-2.5 py-1.5 text-xs transition ${expiresInMinutes === preset.minutes ? 'bg-telegram-primary/12 text-telegram-primary' : 'border border-telegram-border text-telegram-subtext hover:text-telegram-text'}`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        value={expiresInMinutes}
                                        onChange={(event) => setExpiresInMinutes(Math.max(0, Number(event.target.value) || 0))}
                                        className="w-32 rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                                    />
                                    <span className="text-xs text-telegram-subtext">minutes. Use 0 for never.</span>
                                </div>
                            </div>
                        )}

                        {folderTarget ? (
                            <div className="rounded-lg border border-telegram-border bg-black/10 px-3 py-3 text-xs text-telegram-subtext">
                                Local expiring links are for files. Use Telegram Invite for folder access.
                            </div>
                        ) : isBulk ? (
                            <div className="space-y-3">
                                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                                    {shareLoading && <p className="text-sm text-telegram-subtext">Generating links...</p>}
                                    {shareError && <p className="text-sm text-red-300">Failed to generate links.</p>}
                                    {links.map((item) => (
                                        <div key={item.url} className="rounded-lg border border-telegram-border bg-black/10 px-3 py-2">
                                            <p className="truncate text-sm font-medium text-telegram-text">{item.file.name}</p>
                                            <div className="mt-1 flex items-center gap-2">
                                                <span className="min-w-0 flex-1 truncate font-mono text-xs text-telegram-subtext">{item.lanUrl}</span>
                                                <button onClick={() => copyToClipboard(item.lanUrl, item.url)} className="text-telegram-subtext transition hover:text-telegram-primary">
                                                    {copied === item.url ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                                </button>
                                                <button onClick={() => handleRevokeLocalLink(item.url)} className="text-red-300 transition hover:text-red-200">
                                                    <Ban className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(allLinksText, 'all-links')}
                                    disabled={links.length === 0}
                                    className="w-full rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-text transition hover:bg-white/[0.04] disabled:opacity-40"
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        {copied === 'all-links' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                        Copy all links
                                    </span>
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 rounded-lg border border-telegram-border bg-black/10 px-3 py-2.5">
                                    <span className={`flex-1 truncate font-mono text-xs ${shareError ? 'text-red-400' : 'text-telegram-text'}`}>
                                        {shareError ? 'Failed to generate link' : (shareLoading || !primaryLink?.lanUrl) ? 'Generating...' : primaryLink.lanUrl}
                                    </span>
                                    <button
                                        onClick={() => primaryLink?.lanUrl && !shareError && copyToClipboard(primaryLink.lanUrl, 'lan')}
                                        disabled={shareLoading || shareError || !primaryLink?.lanUrl}
                                        className="flex-shrink-0 text-telegram-subtext transition hover:text-telegram-primary disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        {copied === 'lan' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                {shareError && (
                                    <button
                                        onClick={() => {
                                            setRetryPending(true);
                                            setTimeout(() => {
                                                setRetryPending(false);
                                                setShareRevision((v) => v + 1);
                                            }, 500);
                                        }}
                                        disabled={retryPending}
                                        className="w-full rounded-lg border border-telegram-border px-3 py-1.5 text-xs text-telegram-subtext transition hover:text-telegram-text disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {retryPending ? 'Retrying...' : 'Retry'}
                                    </button>
                                )}
                                <div className="flex items-center gap-2 rounded-lg border border-telegram-border bg-white/[0.02] px-3 py-2 text-xs text-telegram-subtext">
                                    <TimerReset className="w-3.5 h-3.5 text-telegram-secondary" />
                                    Expires {expiryLabel(expiresInMinutes) === 'never' ? 'never' : `in ${expiryLabel(expiresInMinutes)}`}.
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setShareRevision((value) => value + 1)}
                                        className="rounded-lg border border-telegram-border px-3 py-2 text-xs font-medium text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text"
                                    >
                                        <span className="flex items-center justify-center gap-2">
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            New Link
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => primaryLink?.url && handleRevokeLocalLink(primaryLink.url)}
                                        disabled={!primaryLink?.url}
                                        className="rounded-lg border border-red-500/20 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <span className="flex items-center justify-center gap-2">
                                            <Ban className="w-3.5 h-3.5" />
                                            Revoke
                                        </span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-telegram-border bg-white/[0.025] p-4">
                        {!isBulk && !folderTarget && (
                            <div className="mb-4 rounded-lg border border-telegram-border bg-black/10 p-4 text-center">
                                <div className="mb-3 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-telegram-subtext">
                                    <QrCode className="h-3.5 w-3.5" />
                                    QR Code
                                </div>
                                {qrDataUrl ? (
                                    <>
                                        <img src={qrDataUrl} alt="Share QR code" className="mx-auto h-40 w-40 rounded-lg bg-white p-2" />
                                        <button
                                            onClick={handleDownloadQr}
                                            className="mt-3 rounded-lg border border-telegram-border px-3 py-2 text-xs text-telegram-text transition hover:bg-white/[0.04]"
                                        >
                                            <span className="flex items-center justify-center gap-2">
                                                <Download className="h-3.5 w-3.5" />
                                                Download PNG
                                            </span>
                                        </button>
                                    </>
                                ) : (
                                    <p className="py-10 text-sm text-telegram-subtext">QR appears when the link is ready.</p>
                                )}
                            </div>
                        )}

                        <div className="mb-4 flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-blue-300">
                                <Send className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-telegram-text">Telegram Invite</h3>
                                <p className="mt-1 text-xs leading-5 text-telegram-subtext">
                                    Use this for long-term access to a folder.
                                </p>
                            </div>
                        </div>

                        {folderInviteLink ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2.5">
                                    <span className="flex-1 truncate font-mono text-xs text-blue-200">{folderInviteLink}</span>
                                    <button onClick={() => copyToClipboard(folderInviteLink, 'invite')} className="flex-shrink-0 text-telegram-subtext transition hover:text-blue-400">
                                        {copied === 'invite' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleGetFolderLink}
                                disabled={loadingInvite || activeFolderId === null}
                                className="w-full rounded-lg border border-blue-500/20 bg-blue-500/10 py-2.5 text-sm font-medium text-blue-300 transition hover:bg-blue-500/18 disabled:opacity-50"
                            >
                                {loadingInvite ? 'Generating...' : activeFolderId === null ? 'Not available for Saved Messages' : 'Get Telegram Invite Link'}
                            </button>
                        )}

                        <div className="mt-4 rounded-lg border border-telegram-border bg-black/10 px-3 py-3 text-xs text-telegram-subtext">
                            <div className="mb-2 flex items-center gap-2 text-telegram-text">
                                <Shield className="w-3.5 h-3.5 text-telegram-primary" />
                                Sharing notes
                            </div>
                            <p>Local links are temporary and tracked locally. Telegram invites follow Telegram channel access rules.</p>
                        </div>
                    </section>
                </div>
            </motion.div>
        </motion.div>
    );
}
