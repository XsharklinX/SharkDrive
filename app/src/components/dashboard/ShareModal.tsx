import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Link, Copy, Check, Wifi, Send } from 'lucide-react';
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
        tauriApi.getLocalIp().then(ip => setLocalIp(ip)).catch(() => {});
    }, [file, activeFolderId]);

    useEffect(() => {
        if (file.type === 'folder') return;

        tauriApi.createShareLink(file.id, resolveFileFolderId(file, activeFolderId), file.name, expiresInMinutes).then((url) => {
            setShareUrl(url);
        }).catch(() => {});
    }, [file, activeFolderId, expiresInMinutes]);

    // Build LAN URL replacing localhost with actual IP
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-telegram-surface border border-telegram-border rounded-2xl w-full max-w-md mx-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-telegram-border">
                    <div className="flex items-center gap-2">
                        <Link className="w-4 h-4 text-telegram-primary" />
                        <div>
                            <h2 className="font-semibold text-telegram-text text-sm">Share File</h2>
                            <p className="text-[11px] text-telegram-subtext truncate max-w-[240px]">{file.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-telegram-hover rounded text-telegram-subtext">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* LAN Share */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Wifi className="w-3.5 h-3.5 text-telegram-primary" />
                            <span className="text-xs font-medium text-telegram-text">Local Network Link</span>
                        </div>
                        <p className="text-[11px] text-telegram-subtext mb-2">
                            Anyone on your Wi-Fi can download this file while SharkDrive is running. The link now expires automatically.
                        </p>
                        <div className="mb-2">
                            <label className="text-[10px] uppercase tracking-wide text-telegram-subtext block mb-1">Expiration</label>
                            <select
                                value={expiresInMinutes}
                                onChange={(event) => setExpiresInMinutes(Number(event.target.value))}
                                className="w-full bg-telegram-hover border border-telegram-border rounded-lg px-3 py-2 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                            >
                                <option value={15}>15 minutes</option>
                                <option value={60}>1 hour</option>
                                <option value={360}>6 hours</option>
                                <option value={1440}>24 hours</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2 bg-telegram-hover rounded-lg px-3 py-2">
                            <span className="text-xs text-telegram-text flex-1 truncate font-mono">{lanUrl || 'Generating...'}</span>
                            <button
                                onClick={() => lanUrl && copyToClipboard(lanUrl, 'lan')}
                                className="text-telegram-subtext hover:text-telegram-primary transition-colors flex-shrink-0"
                            >
                                {copied === 'lan' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="text-[10px] text-telegram-subtext mt-1">
                            Expires in {expiresInMinutes >= 1440 ? '24 hours' : expiresInMinutes >= 360 ? '6 hours' : expiresInMinutes >= 60 ? '1 hour' : '15 minutes'}.
                        </p>
                    </div>

                    <div className="h-px bg-telegram-border" />

                    {/* Telegram Folder Share */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Send className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-xs font-medium text-telegram-text">Share Folder via Telegram</span>
                        </div>
                        <p className="text-[11px] text-telegram-subtext mb-2">
                            Generate a Telegram invite link. Anyone with it can join the folder channel and access all files through Telegram.
                        </p>
                        {folderInviteLink ? (
                            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                                <span className="text-xs text-blue-300 flex-1 truncate font-mono">{folderInviteLink}</span>
                                <button
                                    onClick={() => copyToClipboard(folderInviteLink, 'invite')}
                                    className="text-telegram-subtext hover:text-blue-400 transition-colors flex-shrink-0"
                                >
                                    {copied === 'invite' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleGetFolderLink}
                                disabled={loadingInvite || activeFolderId === null}
                                className="w-full py-2 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-colors border border-blue-500/20 disabled:opacity-50"
                            >
                                {loadingInvite ? 'Generating...' : activeFolderId === null ? 'Not available for Saved Messages' : 'Get Telegram Invite Link'}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
