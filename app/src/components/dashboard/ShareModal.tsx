import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Link, Copy, Check, Wifi, Send, Shield, TimerReset } from 'lucide-react';
import { toast } from 'sonner';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { resolveFileFolderId } from '../../utils';

interface ShareModalProps {
    file: TelegramFile;
    activeFolderId: number | null;
    onClose: () => void;
}

export function ShareModal({ file, activeFolderId, onClose }: ShareModalProps) {
    const [localIp, setLocalIp] = useState('localhost');
    const [shareUrl, setShareUrl] = useState('');
    const [folderInviteLink, setFolderInviteLink] = useState<string | null>(null);
    const [loadingInvite, setLoadingInvite] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [expiresInMinutes, setExpiresInMinutes] = useState(60);

    useEffect(() => {
        tauriApi.getLocalIp().then((ip) => setLocalIp(ip)).catch(() => {});
    }, [file, activeFolderId]);

    useEffect(() => {
        if (file.type === 'folder') return;

        tauriApi.createShareLink(file.id, resolveFileFolderId(file, activeFolderId), file.name, expiresInMinutes).then((url) => {
            setShareUrl(url);
        }).catch(() => {});
    }, [file, activeFolderId, expiresInMinutes]);

    const lanUrl = shareUrl.replace('localhost', localIp);

    const copyToClipboard = async (text: string, key: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        toast.success('Copied!');
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
            toast.error(`${e}`);
        } finally {
            setLoadingInvite(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[linear-gradient(180deg,rgba(4,10,17,0.72),rgba(2,7,13,0.92))] backdrop-blur-lg"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="vault-panel mx-4 w-full max-w-2xl rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border/80 p-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                            <Link className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-telegram-text">{file.type === 'folder' ? 'Share Folder' : 'Share File'}</h2>
                            <p className="max-w-[340px] truncate text-xs text-telegram-subtext">{file.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="grid gap-4 p-6 lg:grid-cols-[1.2fr,0.9fr]">
                    <section className="rounded-xl border border-telegram-border bg-white/[0.03] p-5">
                        <div className="mb-4 flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                <Wifi className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-telegram-text">Local Link</h3>
                                <p className="mt-1 text-xs leading-5 text-telegram-subtext">
                                    Anyone on your Wi-Fi can open this while SharkDrive is running. The link expires automatically.
                                </p>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-telegram-subtext">Expiration</label>
                            <select
                                value={expiresInMinutes}
                                onChange={(event) => setExpiresInMinutes(Number(event.target.value))}
                                className="w-full rounded-xl border border-telegram-border bg-white/[0.03] px-3 py-2.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                            >
                                <option value={15}>15 minutes</option>
                                <option value={60}>1 hour</option>
                                <option value={360}>6 hours</option>
                                <option value={1440}>24 hours</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2 rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                            <span className="flex-1 truncate font-mono text-xs text-telegram-text">{lanUrl || 'Generating...'}</span>
                            <button
                                onClick={() => lanUrl && copyToClipboard(lanUrl, 'lan')}
                                className="flex-shrink-0 text-telegram-subtext transition hover:text-telegram-primary"
                            >
                                {copied === 'lan' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>

                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-telegram-border bg-white/[0.02] px-3 py-2 text-xs text-telegram-subtext">
                            <TimerReset className="w-3.5 h-3.5 text-telegram-secondary" />
                            Expires in {expiresInMinutes >= 1440 ? '24 hours' : expiresInMinutes >= 360 ? '6 hours' : expiresInMinutes >= 60 ? '1 hour' : '15 minutes'}.
                        </div>
                    </section>

                    <section className="rounded-xl border border-telegram-border bg-white/[0.03] p-5">
                        <div className="mb-4 flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-blue-300">
                                <Send className="w-4 h-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-telegram-text">Telegram Invite</h3>
                                <p className="mt-1 text-xs leading-5 text-telegram-subtext">
                                    Create a Telegram invite link for this folder when you want long-term access.
                                </p>
                            </div>
                        </div>

                        {folderInviteLink ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
                                    <span className="flex-1 truncate font-mono text-xs text-blue-200">{folderInviteLink}</span>
                                    <button
                                        onClick={() => copyToClipboard(folderInviteLink, 'invite')}
                                        className="flex-shrink-0 text-telegram-subtext transition hover:text-blue-400"
                                    >
                                        {copied === 'invite' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.08] px-3 py-2 text-xs text-blue-100/80">
                                    Anyone with the invite can join the Telegram folder and access the files available there.
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={handleGetFolderLink}
                                disabled={loadingInvite || activeFolderId === null}
                                className="w-full rounded-xl border border-blue-500/20 bg-blue-500/10 py-3 text-sm font-medium text-blue-300 transition hover:bg-blue-500/18 disabled:opacity-50"
                            >
                                {loadingInvite ? 'Generating...' : activeFolderId === null ? 'Not available for Saved Messages' : 'Get Telegram Invite Link'}
                            </button>
                        )}

                        <div className="mt-4 rounded-lg border border-telegram-border bg-black/10 px-3 py-3 text-xs text-telegram-subtext">
                            <div className="mb-2 flex items-center gap-2 text-telegram-text">
                                <Shield className="w-3.5 h-3.5 text-telegram-primary" />
                                Sharing notes
                            </div>
                            <p>Local links are temporary. Telegram invites follow Telegram channel access rules and stay separate from expiring file links.</p>
                        </div>
                    </section>
                </div>
            </motion.div>
        </motion.div>
    );
}
