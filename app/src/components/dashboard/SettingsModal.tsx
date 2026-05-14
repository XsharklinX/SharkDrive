import { useEffect, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { motion } from 'framer-motion';
import { Clock, Eye, EyeOff, FolderSync, History, LogIn, Monitor, Plus, Settings, Shield, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ActivityEntry, BackupFolder, TelegramFolder } from '../../types';

interface SettingsModalProps {
    onClose: () => void;
    autoSyncInterval: number;
    onAutoSyncChange: (minutes: number) => void;
    encryptionEnabled: boolean;
    onEncryptionToggle: (enabled: boolean, password?: string) => void;
    folders: TelegramFolder[];
    activity: ActivityEntry[];
}

type Tab = 'general' | 'encryption' | 'backup' | 'activity';

export function SettingsModal({
    onClose,
    autoSyncInterval,
    onAutoSyncChange,
    encryptionEnabled,
    onEncryptionToggle,
    folders,
    activity,
}: SettingsModalProps) {
    const [tab, setTab] = useState<Tab>('general');
    const [closeToTray, setCloseToTray] = useState(false);
    const [autostart, setAutostart] = useState(false);
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [backupFolders, setBackupFolders] = useState<BackupFolder[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        invoke<boolean>('cmd_get_close_to_tray').then(setCloseToTray).catch(() => {});
        invoke<boolean>('cmd_get_autostart').then(setAutostart).catch(() => {});
        invoke<BackupFolder[]>('cmd_get_backup_folders').then(setBackupFolders).catch(() => {});
    }, []);

    const handleCloseToTray = async (value: boolean) => {
        setCloseToTray(value);
        await invoke('cmd_set_close_to_tray', { enabled: value });
        toast.success(value ? 'App will minimize to tray on close' : 'App will exit on close');
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

        setLoading(true);
        try {
            await invoke('cmd_set_encryption_key', { password });
            onEncryptionToggle(true, password);
            setPassword('');
            toast.success('Encryption enabled');
        } catch (e) {
            toast.error(`${e}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDisableEncryption = async () => {
        await invoke('cmd_clear_encryption_key');
        onEncryptionToggle(false);
        toast.info('Encryption disabled');
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
        { id: 'encryption', label: 'Encryption', icon: Shield, description: 'Key loading, recovery and local security' },
        { id: 'backup', label: 'Auto Backup', icon: FolderSync, description: 'Watched folders and remote destinations' },
        { id: 'activity', label: 'Activity', icon: History, description: 'Local history of app actions' },
    ];

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
                                    {tab === 'encryption' && 'Encryption'}
                                    {tab === 'backup' && 'Auto Backup'}
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
                                                    className="w-full rounded-xl border border-telegram-border bg-white/[0.03] px-4 py-3 pr-11 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                                                />
                                                <button
                                                    onClick={() => setShowPass((value) => !value)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-telegram-subtext transition hover:text-telegram-text"
                                                >
                                                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
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

                        {tab === 'activity' && (
                            <SectionCard
                                title="Local Activity"
                                icon={<History className="w-4 h-4" />}
                                description="Uploads, downloads, previews, shares, backups and encryption prompts."
                            >
                                {activity.length === 0 ? (
                                    <p className="py-4 text-center text-xs text-telegram-subtext">No activity recorded yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {activity.map((entry) => (
                                            <div key={entry.id} className="rounded-xl border border-telegram-border bg-white/[0.03] px-4 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-telegram-text">{entry.message}</p>
                                                        {entry.fileName && <p className="mt-1 truncate text-xs text-telegram-subtext">{entry.fileName}</p>}
                                                    </div>
                                                    <span className="whitespace-nowrap text-[11px] text-telegram-subtext">
                                                        {new Date(entry.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
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
