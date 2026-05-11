import { useEffect, useState } from 'react';
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

    const handleCloseToTray = async (val: boolean) => {
        setCloseToTray(val);
        await invoke('cmd_set_close_to_tray', { enabled: val });
        toast.success(val ? 'App will minimize to tray on close' : 'App will exit on close');
    };

    const handleAutostart = async (val: boolean) => {
        setAutostart(val);
        try {
            await invoke('cmd_set_autostart', { enabled: val });
            toast.success(val ? 'SharkDrive will start with Windows' : 'Removed from startup');
        } catch (e) {
            toast.error(`Startup setting failed: ${e}`);
            setAutostart(!val);
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
                className="bg-telegram-surface border border-telegram-border rounded-2xl w-full max-w-2xl mx-4 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-telegram-border">
                    <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-telegram-primary" />
                        <h2 className="font-semibold text-telegram-text">Settings</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-telegram-hover rounded text-telegram-subtext">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex border-b border-telegram-border">
                    {([
                        { id: 'general', label: 'General', icon: Monitor },
                        { id: 'encryption', label: 'Encryption', icon: Shield },
                        { id: 'backup', label: 'Auto Backup', icon: FolderSync },
                        { id: 'activity', label: 'Activity', icon: History },
                    ] as { id: Tab; label: string; icon: React.FC<{ className?: string }> }[]).map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                                tab === id
                                    ? 'border-telegram-primary text-telegram-primary'
                                    : 'border-transparent text-telegram-subtext hover:text-telegram-text'
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                <div className="p-5 space-y-5 max-h-[500px] overflow-y-auto">
                    {tab === 'general' && (
                        <>
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Clock className="w-3.5 h-3.5 text-telegram-primary" />
                                    <span className="text-sm font-medium text-telegram-text">Auto Sync</span>
                                </div>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {syncOptions.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => {
                                                onAutoSyncChange(opt.value);
                                                toast.success(opt.value > 0 ? `Auto sync every ${opt.label.toLowerCase()}` : 'Auto sync disabled');
                                            }}
                                            className={`py-1.5 text-xs rounded-lg transition-colors ${
                                                autoSyncInterval === opt.value
                                                    ? 'bg-telegram-primary text-white'
                                                    : 'bg-telegram-hover text-telegram-subtext hover:text-telegram-text'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                {autoSyncInterval > 0 && (
                                    <p className="text-[11px] text-telegram-subtext mt-1.5">
                                        Folder list will sync every {autoSyncInterval} minute{autoSyncInterval > 1 ? 's' : ''}
                                    </p>
                                )}
                            </div>

                            <div className="h-px bg-telegram-border" />

                            <ToggleRow
                                icon={<Monitor className="w-3.5 h-3.5" />}
                                title="Minimize to Tray"
                                description="When closing, hide to system tray instead of exiting"
                                checked={closeToTray}
                                onChange={handleCloseToTray}
                            />

                            <div className="h-px bg-telegram-border" />

                            <ToggleRow
                                icon={<LogIn className="w-3.5 h-3.5" />}
                                title="Run at Startup"
                                description="Launch SharkDrive automatically when Windows starts"
                                checked={autostart}
                                onChange={handleAutostart}
                            />
                        </>
                    )}

                    {tab === 'encryption' && (
                        <>
                            <div className="p-3 rounded-lg bg-telegram-hover border border-telegram-border text-xs text-telegram-subtext">
                                Files are encrypted locally with AES-256-GCM before uploading. The key never leaves your device.
                            </div>

                            {encryptionEnabled ? (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                        <Shield className="w-4 h-4 text-green-400" />
                                        <span className="text-sm text-green-400 font-medium">Encryption Active</span>
                                    </div>
                                    <p className="text-xs text-telegram-subtext">
                                        Encrypted files can be previewed and downloaded while this key is loaded in memory.
                                    </p>
                                    <button
                                        onClick={handleDisableEncryption}
                                        className="w-full py-2 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                                    >
                                        Disable Encryption
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                                        If an encrypted file fails to open, load the same password here and try again.
                                    </div>
                                    <div>
                                        <label className="text-xs text-telegram-subtext mb-1.5 block">Encryption Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPass ? 'text' : 'password'}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSetEncryption()}
                                                placeholder="Enter a strong password..."
                                                className="w-full bg-telegram-hover border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70 pr-10"
                                            />
                                            <button
                                                onClick={() => setShowPass((value) => !value)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-telegram-subtext hover:text-telegram-text"
                                            >
                                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleSetEncryption}
                                        disabled={loading || !password.trim()}
                                        className="w-full py-2 text-sm font-medium bg-telegram-primary text-white rounded-lg hover:bg-telegram-primary/90 transition-colors disabled:opacity-50"
                                    >
                                        {loading ? 'Setting up...' : 'Enable Encryption'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {tab === 'backup' && (
                        <>
                            <div className="p-3 rounded-lg bg-telegram-hover border border-telegram-border text-xs text-telegram-subtext">
                                Watched folders auto-upload new and changed files to SharkDrive. Duplicate file events are debounced and remote duplicates are skipped automatically.
                            </div>

                            <button
                                onClick={handleAddBackupFolder}
                                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-telegram-primary bg-telegram-primary/10 hover:bg-telegram-primary/20 rounded-lg transition-colors border border-telegram-primary/20"
                            >
                                <Plus className="w-4 h-4" />
                                Add Folder to Watch
                            </button>

                            {backupFolders.length === 0 ? (
                                <p className="text-xs text-telegram-subtext text-center py-4">No folders being watched</p>
                            ) : (
                                <div className="space-y-2">
                                    {backupFolders.map((folder) => (
                                        <div key={folder.local_path} className="p-2.5 bg-telegram-hover rounded-lg space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-telegram-text font-medium truncate">{folder.local_path}</p>
                                                    <p className="text-[10px] text-telegram-subtext">
                                                        Auto-backup is active for new and modified files
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveBackupFolder(folder.local_path)}
                                                    className="ml-2 p-1 hover:bg-red-500/10 text-telegram-subtext hover:text-red-400 rounded transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            <div>
                                                <label className="text-[10px] uppercase tracking-wide text-telegram-subtext block mb-1">Destination</label>
                                                <select
                                                    value={folder.remote_folder_id ?? ''}
                                                    onChange={(event) => handleBackupDestinationChange(folder.local_path, event.target.value === '' ? null : Number(event.target.value))}
                                                    className="w-full bg-telegram-surface border border-telegram-border rounded-lg px-3 py-2 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary/70"
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
                        </>
                    )}

                    {tab === 'activity' && (
                        <>
                            <div className="p-3 rounded-lg bg-telegram-hover border border-telegram-border text-xs text-telegram-subtext">
                                Latest local activity from uploads, downloads, previews, sharing, backup automation and encryption recovery prompts.
                            </div>

                            {activity.length === 0 ? (
                                <p className="text-xs text-telegram-subtext text-center py-4">No activity recorded yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {activity.map((entry) => (
                                        <div key={entry.id} className="p-2.5 bg-telegram-hover rounded-lg">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-telegram-text font-medium">{entry.message}</p>
                                                    {entry.fileName && <p className="text-[10px] text-telegram-subtext truncate">{entry.fileName}</p>}
                                                </div>
                                                <span className="text-[10px] text-telegram-subtext whitespace-nowrap">
                                                    {new Date(entry.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

function ToggleRow({
    icon,
    title,
    description,
    checked,
    onChange,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
                <span className="text-telegram-primary mt-0.5">{icon}</span>
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
                    backgroundColor: checked ? 'var(--color-telegram-primary, #00b4ff)' : 'rgba(90,138,170,0.4)',
                    position: 'relative',
                    transition: 'background-color 0.2s',
                    border: 'none',
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
