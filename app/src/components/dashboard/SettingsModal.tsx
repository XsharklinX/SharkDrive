import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { motion } from 'framer-motion';
import { AlertTriangle, Ban, Clock, Copy, Download, Eye, EyeOff, FolderOpen, FolderSync, History, Keyboard, Link2, LogIn, Monitor, Plus, Settings, Shield, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ActivityEntry, BackupFolder, ShareLinkInfo, TelegramFile, TelegramFolder } from '../../types';
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, normalizeShortcut, shortcutFromEvent, type KeyboardShortcutMap, type ShortcutAction } from '../../hooks/useKeyboardShortcuts';
import { tauriApi } from '../../api/tauri';

interface SettingsModalProps {
    onClose: () => void;
    autoSyncInterval: number;
    onAutoSyncChange: (minutes: number) => void;
    encryptionEnabled: boolean;
    onEncryptionToggle: (enabled: boolean, password?: string) => void;
    folders: TelegramFolder[];
    files: TelegramFile[];
    activity: ActivityEntry[];
    shortcuts: KeyboardShortcutMap;
    onShortcutsChange: (shortcuts: KeyboardShortcutMap) => void;
}

type Tab = 'general' | 'downloads' | 'encryption' | 'backup' | 'sharing' | 'shortcuts' | 'activity';
type ActivityFilter = ActivityEntry['type'] | 'all';
type DownloadDestinationKey = 'images' | 'videos' | 'audio' | 'docs' | 'other';
type DownloadDestinationMap = Partial<Record<DownloadDestinationKey, string>>;
const DOWNLOAD_DESTINATIONS_KEY = 'sharkdrive.downloadDestinations.v1';
const OPEN_AFTER_DOWNLOAD_KEY = 'sharkdrive.openAfterDownload.v1';
const SECURE_DELETE_KEY = 'sharkdrive.secureDelete.v1';

function estimatePasswordStrength(password: string) {
    if (!password) return { bits: 0, label: 'Not set', crackTime: 'Add a password to estimate strength', width: 0 };
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/\d/.test(password)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(password)) pool += 32;
    const bits = Math.round(password.length * Math.log2(Math.max(pool, 1)));
    const seconds = 2 ** Math.min(bits, 1024) / 10_000_000_000;
    const crackTime = seconds < 60 ? 'under a minute' : seconds < 3600 ? `${Math.round(seconds / 60)} minutes` : seconds < 86_400 ? `${Math.round(seconds / 3600)} hours` : seconds < 31_536_000 ? `${Math.round(seconds / 86_400)} days` : `${Math.round(seconds / 31_536_000)} years`;
    return {
        bits,
        label: bits >= 80 ? 'Strong' : bits >= 55 ? 'Good' : bits >= 36 ? 'Weak' : 'Very weak',
        crackTime: `Estimated offline brute force: ${crackTime}`,
        width: Math.min(100, Math.max(5, bits)),
    };
}

export function SettingsModal({
    onClose,
    autoSyncInterval,
    onAutoSyncChange,
    encryptionEnabled,
    onEncryptionToggle,
    folders,
    files,
    activity,
    shortcuts,
    onShortcutsChange,
}: SettingsModalProps) {
    const [tab, setTab] = useState<Tab>('general');
    const [closeToTray, setCloseToTray] = useState(false);
    const [autostart, setAutostart] = useState(false);
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [autoLockMinutes, setAutoLockMinutes] = useState(15);
    const [sessionPin, setSessionPin] = useState('');
    const [sessionProtected, setSessionProtected] = useState(false);
    const [backupFolders, setBackupFolders] = useState<BackupFolder[]>([]);
    const [loading, setLoading] = useState(false);
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
    const [recordingShortcut, setRecordingShortcut] = useState<ShortcutAction | null>(null);
    const [shareLinks, setShareLinks] = useState<ShareLinkInfo[]>([]);
    const [shareLinksLoading, setShareLinksLoading] = useState(false);
    const [downloadDestinations, setDownloadDestinations] = useState<DownloadDestinationMap>({});
    const [openAfterDownload, setOpenAfterDownload] = useState(false);
    const [secureDelete, setSecureDelete] = useState(false);
    const [rotationOldPassword, setRotationOldPassword] = useState('');
    const [rotationNewPassword, setRotationNewPassword] = useState('');
    const [rotationLoading, setRotationLoading] = useState(false);
    const [rotationProgress, setRotationProgress] = useState('');
    const [auditPassword, setAuditPassword] = useState('');
    const [auditLoading, setAuditLoading] = useState(false);

    useEffect(() => {
        invoke<boolean>('cmd_get_close_to_tray').then(setCloseToTray).catch(() => {});
        invoke<boolean>('cmd_get_autostart').then(setAutostart).catch(() => {});
        invoke<BackupFolder[]>('cmd_get_backup_folders').then(setBackupFolders).catch(() => {});
        tauriApi.isSessionProtected().then(setSessionProtected).catch(() => {});
        const savedAutoLock = localStorage.getItem('sharkdrive.encryptionAutoLockMinutes');
        if (savedAutoLock) setAutoLockMinutes(Number(savedAutoLock) || 15);
        try {
            setDownloadDestinations(JSON.parse(localStorage.getItem(DOWNLOAD_DESTINATIONS_KEY) || '{}'));
        } catch {
            localStorage.removeItem(DOWNLOAD_DESTINATIONS_KEY);
        }
        setOpenAfterDownload(localStorage.getItem(OPEN_AFTER_DOWNLOAD_KEY) === 'true');
        setSecureDelete(localStorage.getItem(SECURE_DELETE_KEY) === 'true');
    }, []);

    useEffect(() => {
        if (tab !== 'sharing') return;
        setShareLinksLoading(true);
        tauriApi.listShareLinks()
            .then(setShareLinks)
            .catch((error) => toast.error(`Failed to load share links: ${error}`))
            .finally(() => setShareLinksLoading(false));
    }, [tab]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        listen<{ completed: number; total: number; filename: string }>('encryption-rotation-progress', (event) => {
            setRotationProgress(`${event.payload.completed}/${event.payload.total}: ${event.payload.filename}`);
        }).then((dispose) => { unlisten = dispose; });
        return () => unlisten?.();
    }, []);

    const handleCloseToTray = async (value: boolean) => {
        try {
            await invoke('cmd_set_close_to_tray', { enabled: value });
            setCloseToTray(value);
            toast.success(value ? 'App will minimize to tray on close' : 'App will exit on close');
        } catch (e) {
            toast.error(`Failed to save tray setting: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleAutostart = async (value: boolean) => {
        setAutostart(value);
        try {
            await invoke('cmd_set_autostart', { enabled: value });
            toast.success(value ? 'SharkDrive will start with Windows' : 'Removed from startup');
        } catch (e) {
            toast.error(`Startup setting failed: ${e}`);
            setAutostart(!value);
        }
    };

    const handleSetEncryption = async () => {
        if (!password.trim()) {
            toast.error('Enter a password');
            return;
        }
        if (password.length < 8) {
            toast.error('Password must be at least 8 characters');
            return;
        }

        setLoading(true);
        try {
            await invoke('cmd_set_encryption_key', { password });
            onEncryptionToggle(true, password);
            setPassword('');
            toast.success('Encryption enabled');
        } catch (e) {
            toast.error(`Encryption error: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDisableEncryption = async () => {
        await invoke('cmd_clear_encryption_key');
        onEncryptionToggle(false);
        toast.info('Encryption disabled');
    };

    const handleAutoLockChange = async (minutes: number) => {
        setAutoLockMinutes(minutes);
        localStorage.setItem('sharkdrive.encryptionAutoLockMinutes', String(minutes));
        await invoke('cmd_set_encryption_auto_lock', { minutes: minutes > 0 ? minutes : null });
        toast.success(minutes > 0 ? `Vault auto-lock set to ${minutes} min` : 'Vault auto-lock disabled');
    };

    const handleProtectSession = async () => {
        try {
            await tauriApi.setSessionPin(sessionPin);
            setSessionProtected(true);
            setSessionPin('');
            toast.success('Telegram session protected with PIN');
        } catch (error) {
            toast.error(`Session PIN failed: ${error}`);
        }
    };

    const handleClearSessionPin = async () => {
        try {
            await tauriApi.clearSessionPin(sessionPin);
            setSessionProtected(false);
            setSessionPin('');
            toast.info('Session PIN removed');
        } catch (error) {
            toast.error(`Could not remove PIN: ${error}`);
        }
    };

    const handleAddBackupFolder = async () => {
        const selected = await open({ multiple: false, directory: true });
        if (!selected) return;

        try {
            await invoke('cmd_add_backup_folder', { localPath: selected, remoteFolderId: null });
            setBackupFolders((prev) => [
                ...prev.filter((folder) => folder.local_path !== selected),
                { local_path: selected as string, remote_folder_id: null, enabled: true },
            ]);
            toast.success('Backup folder added and watching for changes');
        } catch (e) {
            toast.error(`${e}`);
        }
    };

    const handleRemoveBackupFolder = async (path: string) => {
        try {
            await invoke('cmd_remove_backup_folder', { localPath: path });
            setBackupFolders((prev) => prev.filter((folder) => folder.local_path !== path));
            toast.info('Backup folder removed');
        } catch (e) {
            toast.error(`${e}`);
        }
    };

    const handleBackupDestinationChange = async (path: string, remoteFolderId: number | null) => {
        try {
            await invoke('cmd_update_backup_folder', { localPath: path, remoteFolderId });
            setBackupFolders((prev) => prev.map((folder) => (
                folder.local_path === path ? { ...folder, remote_folder_id: remoteFolderId } : folder
            )));
            toast.success('Backup destination updated');
        } catch (e) {
            toast.error(`${e}`);
        }
    };

    const syncOptions = [
        { label: 'Disabled', value: 0 },
        { label: 'Every 5 min', value: 5 },
        { label: 'Every 15 min', value: 15 },
        { label: 'Every 30 min', value: 30 },
        { label: 'Every hour', value: 60 },
    ];

    const tabs: { id: Tab; label: string; icon: typeof Monitor; description: string }[] = [
        { id: 'general', label: 'General', icon: Monitor, description: 'App behavior, startup and sync cadence' },
        { id: 'downloads', label: 'Downloads', icon: Download, description: 'Default destinations and post-download behavior' },
        { id: 'encryption', label: 'Encryption', icon: Shield, description: 'Key loading, recovery and local security' },
        { id: 'backup', label: 'Auto Backup', icon: FolderSync, description: 'Watched folders and remote destinations' },
        { id: 'sharing', label: 'Sharing', icon: Link2, description: 'Active links, expiry and download counts' },
        { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, description: 'Keyboard actions and conflict checks' },
        { id: 'activity', label: 'Activity', icon: History, description: 'Local history of app actions' },
    ];
    const visibleActivity = activityFilter === 'all' ? activity : activity.filter((entry) => entry.type === activityFilter);
    const downloadDestinationRows: { key: DownloadDestinationKey; label: string; description: string }[] = [
        { key: 'images', label: 'Images', description: 'Photos, screenshots and artwork' },
        { key: 'videos', label: 'Videos', description: 'MP4, WebM, MOV and similar files' },
        { key: 'audio', label: 'Audio', description: 'Music, voice notes and podcasts' },
        { key: 'docs', label: 'Documents', description: 'PDF, Office, text and EPUB files' },
        { key: 'other', label: 'Other', description: 'Everything not matched above' },
    ];
    const activityFilters: ActivityFilter[] = ['all', 'upload', 'download', 'copy', 'share', 'preview', 'backup', 'security'];
    const activityListRef = useRef<HTMLDivElement>(null);
    const shortcutActions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];
    const normalizedShortcutEntries = shortcutActions.map((action) => ({
        action,
        value: normalizeShortcut(shortcuts[action] || DEFAULT_SHORTCUTS[action]),
    }));
    const conflictValues = new Set(
        normalizedShortcutEntries
            .map((entry) => entry.value)
            .filter((value, index, list) => value && list.indexOf(value) !== index)
    );
    const updateShortcut = (action: ShortcutAction, value: string) => {
        onShortcutsChange({
            ...shortcuts,
            [action]: normalizeShortcut(value),
        });
    };
    const saveDownloadDestinations = (next: DownloadDestinationMap) => {
        setDownloadDestinations(next);
        localStorage.setItem(DOWNLOAD_DESTINATIONS_KEY, JSON.stringify(next));
    };
    const chooseDownloadDestination = async (key: DownloadDestinationKey) => {
        const selected = await open({ multiple: false, directory: true, title: `Select ${key} download folder` });
        if (!selected) return;
        saveDownloadDestinations({ ...downloadDestinations, [key]: selected as string });
        toast.success('Download destination saved');
    };
    const clearDownloadDestination = (key: DownloadDestinationKey) => {
        const next = { ...downloadDestinations };
        delete next[key];
        saveDownloadDestinations(next);
        toast.info('Download destination cleared');
    };
    const setOpenAfterDownloadSetting = (value: boolean) => {
        setOpenAfterDownload(value);
        localStorage.setItem(OPEN_AFTER_DOWNLOAD_KEY, String(value));
        toast.success(value ? 'Downloads will open when finished' : 'Open after download disabled');
    };
    const setSecureDeleteSetting = (value: boolean) => {
        setSecureDelete(value);
        localStorage.setItem(SECURE_DELETE_KEY, String(value));
        toast.success(value ? 'Secure delete enabled' : 'Secure delete disabled');
    };
    const rotateEncryptionKey = async () => {
        const encryptedFiles = files.filter((file) => file.is_encrypted);
        if (encryptedFiles.length === 0) {
            toast.info('No encrypted files are indexed locally.');
            return;
        }
        if (!rotationOldPassword || rotationNewPassword.length < 8) {
            toast.error('Enter the current password and a new password with at least 8 characters.');
            return;
        }
        setRotationLoading(true);
        setRotationProgress(`0/${encryptedFiles.length}: preparing`);
        try {
            const rotated = await tauriApi.rotateEncryptionKey(
                encryptedFiles.map((file) => ({
                    messageId: file.id,
                    folderId: file.folder_id ?? null,
                    filename: file.name,
                })),
                rotationOldPassword,
                rotationNewPassword,
            );
            await tauriApi.setEncryptionKey(rotationNewPassword);
            setRotationOldPassword('');
            setRotationNewPassword('');
            setRotationProgress('');
            toast.success(`Rotated ${rotated} encrypted file${rotated === 1 ? '' : 's'}.`);
        } catch (error) {
            toast.error(`Key rotation stopped safely: ${error}`);
        } finally {
            setRotationLoading(false);
        }
    };
    const encryptPlainFiles = async () => {
        if (plainFiles.length === 0) return;
        if (auditPassword.length < 8) {
            toast.error('Enter your encryption password before converting plain files.');
            return;
        }
        setAuditLoading(true);
        setRotationProgress(`0/${plainFiles.length}: preparing`);
        try {
            const encrypted = await tauriApi.encryptRemoteFiles(
                plainFiles.map((file) => ({
                    messageId: file.id,
                    folderId: file.folder_id ?? null,
                    filename: file.name,
                })),
                auditPassword,
            );
            await tauriApi.setEncryptionKey(auditPassword);
            setAuditPassword('');
            setRotationProgress('');
            toast.success(`Encrypted ${encrypted} existing file${encrypted === 1 ? '' : 's'}. Sync to refresh the audit.`);
        } catch (error) {
            toast.error(`Encryption stopped safely: ${error}`);
        } finally {
            setAuditLoading(false);
        }
    };
    const passwordStrength = estimatePasswordStrength(password);
    const encryptedCount = files.filter((file) => file.is_encrypted).length;
    const plainFiles = files.filter((file) => !file.is_encrypted);
    const formatShareExpiry = (value?: number | null) => {
        if (!value) return 'Never';
        const diff = value - Date.now();
        if (diff <= 0) return 'Expired';
        const minutes = Math.ceil(diff / 60_000);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.ceil(minutes / 60);
        if (hours < 48) return `${hours}h`;
        return `${Math.ceil(hours / 24)}d`;
    };
    const revokeShareLink = async (token: string) => {
        try {
            await tauriApi.revokeShareLink(token);
            setShareLinks((links) => links.filter((link) => link.token !== token));
            toast.info('Share link revoked');
        } catch (error) {
            toast.error(`Failed to revoke link: ${error}`);
        }
    };
    const activityVirtualizer = useVirtualizer({
        count: visibleActivity.length,
        getScrollElement: () => activityListRef.current,
        estimateSize: () => 60,
        overscan: 5,
    });

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
                className="vault-panel mx-4 flex w-full max-w-5xl overflow-hidden rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <aside className="w-72 border-r border-telegram-border/80 bg-black/10 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                                <Settings className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.24em] text-telegram-subtext">Settings</p>
                                <h2 className="text-lg font-semibold tracking-tight text-telegram-text">Settings</h2>
                            </div>
                        </div>
                        <button onClick={onClose} className="rounded-lg border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-telegram-subtext">
                        Manage sync, startup, encryption, backups and activity.
                    </p>

                    <div className="mt-6 space-y-2">
                        {tabs.map(({ id, label, icon: Icon, description }) => (
                            <button
                                key={id}
                                onClick={() => setTab(id)}
                                className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                                    tab === id
                                        ? 'border-telegram-primary/30 bg-telegram-primary/10 text-telegram-text'
                                        : 'border-telegram-border bg-white/[0.02] text-telegram-subtext hover:bg-white/[0.04] hover:text-telegram-text'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${tab === id ? 'bg-telegram-primary/15 text-telegram-primary' : 'bg-white/[0.05]'}`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{label}</p>
                                        <p className="mt-1 text-xs leading-5">{description}</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </aside>

                <div className="flex-1">
                    <div className="border-b border-telegram-border/80 px-6 py-5">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.24em] text-telegram-subtext">Section</p>
                                <h3 className="mt-1 text-xl font-semibold tracking-tight text-telegram-text">
                                    {tab === 'general' && 'General'}
                                    {tab === 'downloads' && 'Downloads'}
                                    {tab === 'encryption' && 'Encryption'}
                                    {tab === 'backup' && 'Auto Backup'}
                                    {tab === 'sharing' && 'Sharing'}
                                    {tab === 'shortcuts' && 'Shortcuts'}
                                    {tab === 'activity' && 'Activity'}
                                </h3>
                            </div>
                            <div className="text-xs text-telegram-subtext">
                                SharkDrive
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[640px] space-y-5 overflow-y-auto p-6">
                        {tab === 'general' && (
                            <>
                                <SectionCard
                                    title="Auto Sync"
                                    icon={<Clock className="w-4 h-4" />}
                                    description="Refresh your folders automatically without waiting for a manual sync."
                                >
                                    <div className="grid grid-cols-5 gap-2">
                                        {syncOptions.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => {
                                                    onAutoSyncChange(opt.value);
                                                    toast.success(opt.value > 0 ? `Auto sync every ${opt.label.toLowerCase()}` : 'Auto sync disabled');
                                                }}
                                                className={`rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                                                    autoSyncInterval === opt.value
                                                        ? 'border-telegram-primary/35 bg-telegram-primary/14 text-telegram-primary'
                                                        : 'border-telegram-border bg-white/[0.03] text-telegram-subtext hover:text-telegram-text'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    {autoSyncInterval > 0 && (
                                        <p className="text-xs text-telegram-subtext">
                                            Folder list will sync every {autoSyncInterval} minute{autoSyncInterval > 1 ? 's' : ''}.
                                        </p>
                                    )}
                                </SectionCard>

                                <SectionCard
                                    title="Desktop Behavior"
                                    icon={<Monitor className="w-4 h-4" />}
                                    description="Choose how SharkDrive behaves when you close the window or start Windows."
                                >
                                    <div className="space-y-4">
                                        <ToggleRow
                                            icon={<Monitor className="w-3.5 h-3.5" />}
                                            title="Minimize to Tray"
                                            description="Hide to the system tray instead of exiting."
                                            checked={closeToTray}
                                            onChange={handleCloseToTray}
                                        />
                                        <div className="h-px bg-telegram-border" />
                                        <ToggleRow
                                            icon={<LogIn className="w-3.5 h-3.5" />}
                                            title="Run at Startup"
                                            description="Launch SharkDrive automatically when Windows starts."
                                            checked={autostart}
                                            onChange={handleAutostart}
                                        />
                                    </div>
                                </SectionCard>
                            </>
                        )}

                        {tab === 'downloads' && (
                            <SectionCard
                                title="Download Destinations"
                                icon={<Download className="w-4 h-4" />}
                                description="Route downloads by type without asking every time. Empty categories keep using the save dialog."
                            >
                                <ToggleRow
                                    icon={<FolderOpen className="w-3.5 h-3.5" />}
                                    title="Open after download"
                                    description="Open completed files with the system default app."
                                    checked={openAfterDownload}
                                    onChange={setOpenAfterDownloadSetting}
                                />

                                <div className="space-y-2">
                                    {downloadDestinationRows.map((row) => (
                                        <div key={row.key} className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-telegram-text">{row.label}</p>
                                                    <p className="mt-0.5 text-xs text-telegram-subtext">{row.description}</p>
                                                    <p className="mt-2 truncate font-mono text-xs text-telegram-subtext/80">
                                                        {downloadDestinations[row.key] || 'Ask where to save'}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <button
                                                        onClick={() => chooseDownloadDestination(row.key)}
                                                        className="rounded-lg border border-telegram-border px-3 py-2 text-xs font-medium text-telegram-text transition hover:bg-white/[0.05]"
                                                    >
                                                        Choose
                                                    </button>
                                                    {downloadDestinations[row.key] && (
                                                        <button
                                                            onClick={() => clearDownloadDestination(row.key)}
                                                            className="rounded-lg p-2 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-300"
                                                            title="Clear destination"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {tab === 'encryption' && (
                            <SectionCard
                                title="Local Encryption"
                                icon={<Shield className="w-4 h-4" />}
                                description="Files are encrypted on this device before upload. The key stays local."
                            >
                                {encryptionEnabled ? (
                                    <div className="space-y-4">
                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                                            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                                                <Shield className="w-4 h-4" />
                                                Encryption active
                                            </div>
                                            <p className="mt-2 text-xs text-emerald-100/80">
                                                Encrypted files can be previewed and downloaded while your password is loaded.
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleDisableEncryption}
                                            className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/18"
                                        >
                                            Disable Encryption
                                        </button>
                                        <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <label className="mb-2 block text-xs font-medium text-telegram-text">Auto-lock after inactivity</label>
                                            <select
                                                value={autoLockMinutes}
                                                onChange={(event) => void handleAutoLockChange(Number(event.target.value))}
                                                className="w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                                            >
                                                <option value={0}>Disabled</option>
                                                <option value={5}>5 minutes</option>
                                                <option value={15}>15 minutes</option>
                                                <option value={30}>30 minutes</option>
                                                <option value={60}>60 minutes</option>
                                            </select>
                                        </div>
                                        <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <p className="text-sm font-medium text-telegram-text">Rotate encryption key</p>
                                            <p className="mt-1 text-xs leading-5 text-telegram-subtext">
                                                Replaces encrypted files one at a time. The original Telegram message is deleted only after its replacement uploads successfully.
                                            </p>
                                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                <input
                                                    type="password"
                                                    value={rotationOldPassword}
                                                    onChange={(event) => setRotationOldPassword(event.target.value)}
                                                    placeholder="Current password"
                                                    className="rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                                />
                                                <input
                                                    type="password"
                                                    value={rotationNewPassword}
                                                    onChange={(event) => setRotationNewPassword(event.target.value)}
                                                    placeholder="New password"
                                                    className="rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                                />
                                            </div>
                                            {rotationProgress && <p className="mt-2 truncate text-xs text-telegram-subtext">{rotationProgress}</p>}
                                            <button
                                                onClick={() => void rotateEncryptionKey()}
                                                disabled={rotationLoading || files.filter((file) => file.is_encrypted).length === 0}
                                                className="mt-3 rounded-lg border border-telegram-primary/25 bg-telegram-primary/10 px-3 py-2 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/16 disabled:opacity-50"
                                            >
                                                {rotationLoading ? 'Rotating...' : 'Start Rotation'}
                                            </button>
                                        </div>
                                        <ToggleRow
                                            icon={<Trash2 className="w-3.5 h-3.5" />}
                                            title="Secure delete"
                                            description="Replace the Telegram caption with [SD-DELETED] before deleting the message."
                                            checked={secureDelete}
                                            onChange={setSecureDeleteSetting}
                                        />
                                        <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-telegram-text">Encryption audit</p>
                                                    <p className="mt-1 text-xs text-telegram-subtext">{encryptedCount} encrypted / {plainFiles.length} plain files indexed locally.</p>
                                                </div>
                                                <span className="rounded-md bg-telegram-primary/10 px-2 py-1 text-xs text-telegram-primary">{files.length} total</span>
                                            </div>
                                            {plainFiles.length > 0 && (
                                                <div className="mt-3">
                                                    <div className="max-h-28 space-y-1 overflow-y-auto">
                                                        {plainFiles.slice(0, 20).map((file) => (
                                                            <p key={`${file.folder_id ?? 'home'}-${file.id}`} className="truncate text-xs text-telegram-subtext">{file.name}</p>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3 flex gap-2">
                                                        <input
                                                            type="password"
                                                            value={auditPassword}
                                                            onChange={(event) => setAuditPassword(event.target.value)}
                                                            placeholder="Encryption password"
                                                            className="min-w-0 flex-1 rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-xs text-telegram-text outline-none focus:border-telegram-primary/70"
                                                        />
                                                        <button
                                                            onClick={() => void encryptPlainFiles()}
                                                            disabled={auditLoading}
                                                            className="rounded-lg border border-telegram-primary/25 bg-telegram-primary/10 px-3 py-2 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/16 disabled:opacity-50"
                                                        >
                                                            {auditLoading ? 'Encrypting...' : 'Encrypt now'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <label className="mb-2 block text-xs font-medium text-telegram-text">Protected Telegram session PIN</label>
                                            <p className="mb-3 text-xs text-telegram-subtext">
                                                Encrypts the saved Telegram session file with a 6-digit PIN. If enabled, SharkDrive asks for it before auto-login.
                                            </p>
                                            <input
                                                inputMode="numeric"
                                                maxLength={6}
                                                value={sessionPin}
                                                onChange={(event) => setSessionPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                                className="w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm tracking-[0.25em] text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                                                placeholder="000000"
                                            />
                                            <div className="mt-3 flex gap-2">
                                                <button
                                                    onClick={handleProtectSession}
                                                    disabled={sessionPin.length !== 6}
                                                    className="flex-1 rounded-lg bg-telegram-primary/12 px-3 py-2 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/18 disabled:opacity-50"
                                                >
                                                    {sessionProtected ? 'Update PIN' : 'Protect Session'}
                                                </button>
                                                {sessionProtected && (
                                                    <button
                                                        onClick={handleClearSessionPin}
                                                        disabled={sessionPin.length !== 6}
                                                        className="flex-1 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/18 disabled:opacity-50"
                                                    >
                                                        Remove PIN
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90">
                                            If an encrypted file fails to open later, load the same password here and retry preview or download.
                                        </div>
                                        <div>
                                            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-telegram-subtext">Encryption Password</label>
                                            <div className="relative">
                                                <input
                                                    type={showPass ? 'text' : 'password'}
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSetEncryption()}
                                                    placeholder="Enter a strong password..."
                                                    className={`w-full rounded-xl border bg-white/[0.03] px-4 py-3 pr-11 text-sm text-telegram-text focus:outline-none transition ${
                                                        password.length > 0 && password.length < 8
                                                            ? 'border-red-500/60 focus:border-red-500/80'
                                                            : 'border-telegram-border focus:border-telegram-primary/70'
                                                    }`}
                                                />
                                                <button
                                                    onClick={() => setShowPass((value) => !value)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-telegram-subtext transition hover:text-telegram-text"
                                                >
                                                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {password.length > 0 && password.length < 8 && (
                                                <p className="mt-1.5 text-xs text-red-400">{8 - password.length} more character{8 - password.length !== 1 ? 's' : ''} needed</p>
                                            )}
                                            {password.length > 0 && (
                                                <div className="mt-3">
                                                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                                        <div className="h-full rounded-full bg-telegram-primary transition-all" style={{ width: `${passwordStrength.width}%` }} />
                                                    </div>
                                                    <p className="mt-1.5 text-xs text-telegram-subtext">{passwordStrength.label} · {passwordStrength.bits} bits · {passwordStrength.crackTime}</p>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleSetEncryption}
                                            disabled={loading || !password.trim()}
                                            className="rounded-xl bg-telegram-primary px-4 py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                                        >
                                            {loading ? 'Setting up...' : 'Enable Encryption'}
                                        </button>
                                    </div>
                                )}
                            </SectionCard>
                        )}

                        {tab === 'backup' && (
                            <SectionCard
                                title="Watched Folders"
                                icon={<FolderSync className="w-4 h-4" />}
                                description="Auto-upload new and changed files. Duplicate events are ignored automatically."
                            >
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-subtext">Watching</p>
                                        <p className="mt-1 text-lg font-semibold text-telegram-text">{backupFolders.length}</p>
                                    </div>
                                    <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-subtext">Enabled</p>
                                        <p className="mt-1 text-lg font-semibold text-telegram-text">{backupFolders.filter((folder) => folder.enabled).length}</p>
                                    </div>
                                    <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-subtext">Default</p>
                                        <p className="mt-1 truncate text-sm font-semibold text-telegram-text">Saved Messages</p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleAddBackupFolder}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-telegram-primary/25 bg-telegram-primary/10 py-3 text-sm font-medium text-telegram-primary transition hover:bg-telegram-primary/16"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Folder to Watch
                                </button>

                                {backupFolders.length === 0 ? (
                                    <p className="py-4 text-center text-xs text-telegram-subtext">No folders being watched yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {backupFolders.map((folder) => (
                                            <div key={folder.local_path} className="rounded-xl border border-telegram-border bg-white/[0.03] p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-telegram-text">{folder.local_path}</p>
                                                        <p className="mt-1 text-xs text-telegram-subtext">New and modified files will be queued automatically.</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveBackupFolder(folder.local_path)}
                                                        className="rounded-xl p-2 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-400"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                <div className="mt-4">
                                                    <label className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-telegram-subtext">Destination</label>
                                                    <select
                                                        value={folder.remote_folder_id ?? ''}
                                                        onChange={(event) => handleBackupDestinationChange(folder.local_path, event.target.value === '' ? null : Number(event.target.value))}
                                                        className="w-full rounded-xl border border-telegram-border bg-white/[0.02] px-3 py-2.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                                                    >
                                                        <option value="">Saved Messages</option>
                                                        {folders.map((remoteFolder) => (
                                                            <option key={remoteFolder.id} value={remoteFolder.id}>{remoteFolder.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>
                        )}

                        {tab === 'sharing' && (
                            <SectionCard
                                title="Active Share Links"
                                icon={<Link2 className="w-4 h-4" />}
                                description="Local expiring links currently available while SharkDrive is running."
                            >
                                {shareLinksLoading ? (
                                    <p className="py-4 text-center text-sm text-telegram-subtext">Loading links...</p>
                                ) : shareLinks.length === 0 ? (
                                    <p className="py-4 text-center text-sm text-telegram-subtext">No active share links.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {shareLinks.map((link) => (
                                            <div key={link.token} className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-telegram-text">{link.filename}</p>
                                                        <p className="mt-1 truncate font-mono text-xs text-telegram-subtext">{link.url}</p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success('Copied'))}
                                                            className="rounded-lg p-2 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text"
                                                            title="Copy link"
                                                        >
                                                            <Copy className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => revokeShareLink(link.token)}
                                                            className="rounded-lg p-2 text-red-300 transition hover:bg-red-500/10"
                                                            title="Revoke link"
                                                        >
                                                            <Ban className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-telegram-subtext">
                                                    <span className="rounded-md bg-white/[0.04] px-2 py-1">Expires: {formatShareExpiry(link.expires_at_epoch_ms)}</span>
                                                    <span className="rounded-md bg-white/[0.04] px-2 py-1">Downloads: {link.download_count}</span>
                                                    <span className="rounded-md bg-white/[0.04] px-2 py-1">Token: {link.token.slice(0, 8)}...</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>
                        )}

                        {tab === 'shortcuts' && (
                            <SectionCard
                                title="Keyboard Shortcuts"
                                icon={<Keyboard className="w-4 h-4" />}
                                description="Keep fast actions available without adding more visible controls to the explorer."
                            >
                                {conflictValues.size > 0 && (
                                    <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        Two or more actions use the same shortcut. Change one before relying on keyboard actions.
                                    </div>
                                )}
                                <div className="space-y-2">
                                    {shortcutActions.map((action) => {
                                        const value = normalizeShortcut(shortcuts[action] || DEFAULT_SHORTCUTS[action]);
                                        const hasConflict = conflictValues.has(value);
                                        return (
                                            <div key={action} className="flex items-center justify-between gap-3 rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                                <div>
                                                    <p className="text-sm font-medium text-telegram-text">{SHORTCUT_LABELS[action]}</p>
                                                    <p className="mt-0.5 text-xs text-telegram-subtext">Default: {DEFAULT_SHORTCUTS[action]}</p>
                                                </div>
                                                <button
                                                    onKeyDown={(event) => {
                                                        if (recordingShortcut !== action) return;
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        const next = shortcutFromEvent(event.nativeEvent);
                                                        if (next) updateShortcut(action, next);
                                                        setRecordingShortcut(null);
                                                    }}
                                                    onClick={() => setRecordingShortcut(action)}
                                                    className={`min-w-28 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                                        hasConflict
                                                            ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                                                            : recordingShortcut === action
                                                                ? 'border-telegram-primary/60 bg-telegram-primary/12 text-telegram-primary'
                                                                : 'border-telegram-border bg-white/[0.03] text-telegram-text hover:border-telegram-primary/35'
                                                    }`}
                                                >
                                                    {recordingShortcut === action ? 'Press keys...' : value}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={() => onShortcutsChange(DEFAULT_SHORTCUTS)}
                                    className="rounded-xl border border-telegram-border px-4 py-2.5 text-sm text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text"
                                >
                                    Reset shortcuts
                                </button>
                            </SectionCard>
                        )}

                        {tab === 'activity' && (
                            <SectionCard
                                title="Local Activity"
                                icon={<History className="w-4 h-4" />}
                                description="Uploads, downloads, previews, shares, backups and encryption prompts."
                            >
                                <div className="flex flex-wrap gap-1.5">
                                    {activityFilters.map((filter) => (
                                        <button
                                            key={filter}
                                            onClick={() => setActivityFilter(filter)}
                                            className={`rounded-lg px-2.5 py-1.5 text-xs capitalize transition ${
                                                activityFilter === filter
                                                    ? 'bg-telegram-primary/12 text-telegram-primary'
                                                    : 'text-telegram-subtext hover:bg-white/[0.04] hover:text-telegram-text'
                                            }`}
                                        >
                                            {filter}
                                        </button>
                                    ))}
                                </div>

                                {visibleActivity.length === 0 ? (
                                    <p className="py-4 text-center text-xs text-telegram-subtext">No activity recorded yet.</p>
                                ) : (
                                    <div
                                        ref={activityListRef}
                                        className="overflow-auto rounded-xl border border-telegram-border bg-white/[0.025]"
                                        style={{ maxHeight: '400px' }}
                                    >
                                        <div style={{ height: `${activityVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                                            {activityVirtualizer.getVirtualItems().map((virtualItem) => {
                                                const entry = visibleActivity[virtualItem.index];
                                                return (
                                                    <div
                                                        key={entry.id}
                                                        style={{
                                                            position: 'absolute',
                                                            top: 0,
                                                            left: 0,
                                                            width: '100%',
                                                            transform: `translateY(${virtualItem.start}px)`,
                                                        }}
                                                        className={`px-4 py-3${virtualItem.index < visibleActivity.length - 1 ? ' border-b border-telegram-border' : ''}`}
                                                    >
                                                        <div className="grid grid-cols-[6rem_minmax(0,1fr)_9rem] items-start gap-3">
                                                            <span className="rounded-md bg-white/[0.04] px-2 py-1 text-center text-[11px] capitalize text-telegram-subtext">{entry.type}</span>
                                                            <div className="min-w-0">
                                                                <p className="truncate text-sm font-medium text-telegram-text">{entry.message}</p>
                                                                {entry.fileName && <p className="mt-1 truncate text-xs text-telegram-subtext">{entry.fileName}</p>}
                                                            </div>
                                                            <span className="whitespace-nowrap text-right text-[11px] text-telegram-subtext">
                                                                {new Date(entry.timestamp).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </SectionCard>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}

function SectionCard({
    title,
    icon,
    description,
    children,
}: {
    title: string;
    icon: ReactNode;
    description: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-telegram-border bg-white/[0.03] p-5">
            <div className="mb-4 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                    {icon}
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-telegram-text">{title}</h4>
                    <p className="mt-1 text-xs leading-5 text-telegram-subtext">{description}</p>
                </div>
            </div>
            <div className="space-y-4">{children}</div>
        </section>
    );
}

function ToggleRow({
    icon,
    title,
    description,
    checked,
    onChange,
}: {
    icon: ReactNode;
    title: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
            <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-telegram-primary">{icon}</span>
                <div>
                    <p className="text-sm font-medium text-telegram-text">{title}</p>
                    <p className="text-xs text-telegram-subtext">{description}</p>
                </div>
            </div>
            <button
                onClick={() => onChange(!checked)}
                role="switch"
                aria-checked={checked}
                style={{
                    flexShrink: 0,
                    width: '44px',
                    height: '24px',
                    borderRadius: '12px',
                    backgroundColor: checked ? 'var(--color-telegram-primary, #52e3c2)' : 'rgba(90,138,170,0.4)',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    border: '1px solid rgba(126, 164, 191, 0.18)',
                    cursor: 'pointer',
                    padding: 0,
                }}
            >
                <span
                    style={{
                        position: 'absolute',
                        top: '3px',
                        left: checked ? '23px' : '3px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: 'white',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        transition: 'left 0.2s',
                        display: 'block',
                    }}
                />
            </button>
        </div>
    );
}
