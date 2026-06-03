import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLanguage, type Lang } from '../../context/LanguageContext';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { motion } from 'framer-motion';
import { AlertTriangle, Ban, CheckCircle as CheckCircleIcon, Clock, Copy, Download, Eye, EyeOff, FolderOpen, FolderSync, History, Keyboard, Link2, LogIn, Monitor, Palette, Plus, RefreshCw, Settings, Shield, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { ActivityEntry, BackupFolder, ClassificationRule, CleanupRule, ShareLinkInfo, TelegramFile, TelegramFolder } from '../../types';
import { CLASSIFICATION_RULES_KEY } from '../../utils';
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, normalizeShortcut, shortcutFromEvent, type KeyboardShortcutMap, type ShortcutAction } from '../../hooks/useKeyboardShortcuts';
import { tauriApi } from '../../api/tauri';
import { applyUploadNamingPattern, UPLOAD_NAMING_PATTERN_KEY } from '../../utils';
import QRCode from 'qrcode';

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
    onExportActivity?: (format: 'csv' | 'json') => void;
}

type Tab = 'general' | 'downloads' | 'encryption' | 'backup' | 'sharing' | 'shortcuts' | 'activity';
type ActivityFilter = ActivityEntry['type'] | 'all';
type DownloadDestinationKey = 'images' | 'videos' | 'audio' | 'docs' | 'other';
type DownloadDestinationMap = Partial<Record<DownloadDestinationKey, string>>;
type RotationStep = 1 | 2 | 3;
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
    onExportActivity,
}: SettingsModalProps) {
    const [tab, setTab] = useState<Tab>('general');
    const { lang, t } = useLanguage();
    const [accentColor, setAccentColor] = useState(() => {
        return localStorage.getItem('sharkdrive.accentColor.v1') || '#2f9bff';
    });

    const presetColors = [
        '#2f9bff',
        '#2aabee',
        '#10b981',
        '#8b5cf6',
        '#f43f5e',
        '#f97316',
        '#f59e0b',
        '#06b6d4',
    ];

    const handleAccentColorChange = (color: string) => {
        setAccentColor(color);
        localStorage.setItem('sharkdrive.accentColor.v1', color);
        document.documentElement.style.setProperty('--color-telegram-primary', color);
    };
    const [closeToTray, setCloseToTray] = useState(false);
    const [autostart, setAutostart] = useState(false);
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [autoLockMinutes, setAutoLockMinutes] = useState(15);
    const [sessionPin, setSessionPin] = useState('');
    const [sessionProtected, setSessionProtected] = useState(false);
    const [backupFolders, setBackupFolders] = useState<BackupFolder[]>([]);
    const [scheduledSyncTime, setScheduledSyncTime] = useState('');
    const [cleanupRules, setCleanupRules] = useState<CleanupRule[]>([]);
    const [cleanupFolderId, setCleanupFolderId] = useState('');
    const [cleanupDays, setCleanupDays] = useState(30);
    const [uploadNamingPattern, setUploadNamingPattern] = useState('');
    const [loading, setLoading] = useState(false);
    // v3.5 state
    const [wifiOnlySync, setWifiOnlySync] = useState(() => localStorage.getItem('sharkdrive.wifiOnlySync.v1') === 'true');
    const [cleanupCandidates, setCleanupCandidates] = useState<number | null>(null);
    const [classificationRules, setClassificationRules] = useState<ClassificationRule[]>(() => {
        try { return JSON.parse(localStorage.getItem('sharkdrive.classificationRules.v1') || '[]'); }
        catch { return []; }
    });
    const [newRuleType, setNewRuleType] = useState<string>('image');
    const [newRuleFolderId, setNewRuleFolderId] = useState<string>('');
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
    const [rotationWizardOpen, setRotationWizardOpen] = useState(false);
    const [rotationStep, setRotationStep] = useState<RotationStep>(1);
    const [auditPassword, setAuditPassword] = useState('');
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditWizardOpen, setAuditWizardOpen] = useState(false);

    useEffect(() => {
        invoke<boolean>('cmd_get_close_to_tray').then(setCloseToTray).catch(() => {});
        invoke<boolean>('cmd_get_autostart').then(setAutostart).catch(() => {});
        invoke<BackupFolder[]>('cmd_get_backup_folders').then(setBackupFolders).catch(() => {});
        tauriApi.getAutomationConfig().then((config) => {
            setScheduledSyncTime(config.scheduled_sync_time || '');
            setCleanupRules(config.cleanup_rules);
        }).catch(() => {});
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
        setUploadNamingPattern(localStorage.getItem(UPLOAD_NAMING_PATTERN_KEY) || '');
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
            toast.success(value ? t('closeToTrayMin') : t('closeToTrayExit'));
        } catch (e) {
            toast.error(`${lang === 'es' ? 'Fallo al guardar ajuste de bandeja' : 'Failed to save tray setting'}: ${e instanceof Error ? e.message : String(e)}`);
        }
    };

    const handleAutostart = async (value: boolean) => {
        setAutostart(value);
        try {
            await invoke('cmd_set_autostart', { enabled: value });
            toast.success(value ? t('runAtStartupEnabled') : t('runAtStartupDisabled'));
        } catch (e) {
            toast.error(`${lang === 'es' ? 'Fallo al configurar inicio automático' : 'Startup setting failed'}: ${e}`);
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

    const saveScheduledSyncTime = async () => {
        try {
            await tauriApi.setScheduledSyncTime(scheduledSyncTime || null);
            toast.success(scheduledSyncTime ? `Daily sync scheduled at ${scheduledSyncTime}` : 'Daily sync disabled');
        } catch (error) {
            toast.error(`Could not save daily sync: ${error}`);
        }
    };

    const saveCleanupRules = async (rules: CleanupRule[]) => {
        await tauriApi.setCleanupRules(rules);
        setCleanupRules(rules);
    };

    const addCleanupRule = async () => {
        if (!Number.isFinite(cleanupDays) || cleanupDays < 1) {
            toast.error('Cleanup age must be at least one day');
            return;
        }
        const folderId = cleanupFolderId === '' ? null : Number(cleanupFolderId);
        const next = [
            ...cleanupRules.filter((rule) => rule.folder_id !== folderId),
            { folder_id: folderId, max_age_days: Math.round(cleanupDays) },
        ];
        try {
            await saveCleanupRules(next);
            toast.success('Cleanup rule saved. Deletions always require confirmation.');
        } catch (error) {
            toast.error(`Could not save cleanup rule: ${error}`);
        }
    };

    const removeCleanupRule = async (folderId: number | null) => {
        try {
            await saveCleanupRules(cleanupRules.filter((rule) => rule.folder_id !== folderId));
            toast.info('Cleanup rule removed');
        } catch (error) {
            toast.error(`Could not remove cleanup rule: ${error}`);
        }
    };

    const updateNamingPattern = (value: string) => {
        setUploadNamingPattern(value);
        localStorage.setItem(UPLOAD_NAMING_PATTERN_KEY, value);
    };

    const syncOptions = [
        { label: 'Disabled', value: 0 },
        { label: 'Every 5 min', value: 5 },
        { label: 'Every 15 min', value: 15 },
        { label: 'Every 30 min', value: 30 },
        { label: 'Every hour', value: 60 },
    ];

    const tabs: { id: Tab; label: string; icon: typeof Monitor; description: string }[] = [
        { id: 'general', label: t('general'), icon: Monitor, description: lang === 'es' ? 'Comportamiento de la aplicación, inicio y frecuencia' : 'App behavior, startup and sync cadence' },
        { id: 'downloads', label: t('downloads'), icon: Download, description: lang === 'es' ? 'Destinos predeterminados y comportamiento post-descarga' : 'Default destinations and post-download behavior' },
        { id: 'encryption', label: t('encryption'), icon: Shield, description: lang === 'es' ? 'Carga de claves, recuperación y seguridad local' : 'Key loading, recovery and local security' },
        { id: 'backup', label: t('autoBackup'), icon: FolderSync, description: lang === 'es' ? 'Carpetas vigiladas y destinos remotos' : 'Watched folders and remote destinations' },
        { id: 'sharing', label: t('sharing'), icon: Link2, description: lang === 'es' ? 'Enlaces activos, caducidad y conteo de descargas' : 'Active links, expiry and download counts' },
        { id: 'shortcuts', label: t('shortcuts'), icon: Keyboard, description: lang === 'es' ? 'Acciones de teclado y comprobación de conflictos' : 'Keyboard actions and conflict checks' },
        { id: 'activity', label: t('activityTab'), icon: History, description: lang === 'es' ? 'Historial local de acciones de la aplicación' : 'Local history of app actions' },
    ];
    const visibleActivity = activityFilter === 'all' ? activity : activity.filter((entry) => entry.type === activityFilter);
    const downloadDestinationRows: { key: DownloadDestinationKey; label: string; description: string }[] = [
        { key: 'images', label: lang === 'es' ? 'Imágenes' : 'Images', description: lang === 'es' ? 'Fotos, capturas de pantalla e ilustraciones' : 'Photos, screenshots and artwork' },
        { key: 'videos', label: lang === 'es' ? 'Videos' : 'Videos', description: lang === 'es' ? 'Archivos MP4, WebM, MOV y similares' : 'MP4, WebM, MOV and similar files' },
        { key: 'audio', label: lang === 'es' ? 'Audio' : 'Audio', description: lang === 'es' ? 'Música, notas de voz y podcasts' : 'Music, voice notes and podcasts' },
        { key: 'docs', label: lang === 'es' ? 'Documentos' : 'Documents', description: lang === 'es' ? 'Archivos PDF, Office, texto y EPUB' : 'PDF, Office, text and EPUB files' },
        { key: 'other', label: lang === 'es' ? 'Otros' : 'Other', description: lang === 'es' ? 'Todo lo que no coincida con lo anterior' : 'Everything not matched above' },
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
        if (rotationOldPassword === rotationNewPassword) {
            toast.error('Choose a new password that differs from the current password.');
            return;
        }
        setRotationStep(3);
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
            setRotationStep(1);
            setRotationWizardOpen(false);
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
            setAuditWizardOpen(false);
            toast.success(`Encrypted ${encrypted} existing file${encrypted === 1 ? '' : 's'}. Sync to refresh the audit.`);
        } catch (error) {
            toast.error(`Encryption stopped safely: ${error}`);
        } finally {
            setAuditLoading(false);
        }
    };
    const passwordStrength = estimatePasswordStrength(password);
    const rotationPasswordStrength = estimatePasswordStrength(rotationNewPassword);
    const encryptedCount = files.filter((file) => file.is_encrypted).length;
    const plainFiles = files.filter((file) => !file.is_encrypted);
    const folderAuditRows = useMemo(() => {
        const rows = new Map<number | null, { id: number | null; name: string; encrypted: number; plain: number }>();
        rows.set(null, { id: null, name: 'Saved Messages', encrypted: 0, plain: 0 });
        folders.forEach((folder) => rows.set(folder.id, { id: folder.id, name: folder.name, encrypted: 0, plain: 0 }));
        files.forEach((file) => {
            const folderId = file.folder_id ?? null;
            const row = rows.get(folderId) ?? { id: folderId, name: `Folder ${folderId}`, encrypted: 0, plain: 0 };
            if (file.is_encrypted) row.encrypted += 1;
            else row.plain += 1;
            rows.set(folderId, row);
        });
        return Array.from(rows.values())
            .filter((row) => row.encrypted + row.plain > 0)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [files, folders]);
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
                                <p className="text-[10px] uppercase tracking-[0.24em] text-telegram-subtext">{t('settings')}</p>
                                <h2 className="text-lg font-semibold tracking-tight text-telegram-text">{t('settings')}</h2>
                            </div>
                        </div>
                        <button onClick={onClose} className="rounded-lg border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text" title={t('close')}>
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
                                    {tab === 'general' && t('general')}
                                    {tab === 'downloads' && t('downloads')}
                                    {tab === 'encryption' && t('encryption')}
                                    {tab === 'backup' && t('autoBackup')}
                                    {tab === 'sharing' && t('sharing')}
                                    {tab === 'shortcuts' && t('shortcuts')}
                                    {tab === 'activity' && t('activityTab')}
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
                                    title={t('autoSync')}
                                    icon={<Clock className="w-4 h-4" />}
                                    description={t('autoSyncDesc')}
                                >
                                    <div className="grid grid-cols-5 gap-2">
                                        {syncOptions.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => {
                                                    onAutoSyncChange(opt.value);
                                                    toast.success(opt.value > 0
                                                        ? (lang === 'es' ? `Sincronización automática cada ${opt.value} min` : `Auto sync every ${opt.value} min`)
                                                        : (lang === 'es' ? 'Sincronización automática desactivada' : 'Auto sync disabled')
                                                    );
                                                }}
                                                className={`rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                                                    autoSyncInterval === opt.value
                                                        ? 'border-telegram-primary/35 bg-telegram-primary/14 text-telegram-primary'
                                                        : 'border-telegram-border bg-white/[0.03] text-telegram-subtext hover:text-telegram-text'
                                                }`}
                                            >
                                                {lang === 'es'
                                                    ? (opt.value === 0 ? 'Desactivado' : `Cada ${opt.value} min`)
                                                    : opt.label
                                                }
                                            </button>
                                        ))}
                                    </div>
                                    {autoSyncInterval > 0 && (
                                        <p className="text-xs text-telegram-subtext">
                                            {lang === 'es'
                                                ? `La lista de carpetas se sincronizará cada ${autoSyncInterval} minuto${autoSyncInterval > 1 ? 's' : ''}.`
                                                : `Folder list will sync every ${autoSyncInterval} minute${autoSyncInterval > 1 ? 's' : ''}.`
                                            }
                                        </p>
                                    )}
                                    <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                        <label className="mb-2 block text-xs font-medium text-telegram-text">{t('dailySync')}</label>
                                        <p className="mb-3 text-xs leading-5 text-telegram-subtext">
                                            {t('dailySyncDesc')}
                                        </p>
                                        <div className="flex gap-2">
                                            <input
                                                type="time"
                                                value={scheduledSyncTime}
                                                onChange={(event) => setScheduledSyncTime(event.target.value)}
                                                className="min-w-0 flex-1 rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                            />
                                            <button
                                                onClick={() => void saveScheduledSyncTime()}
                                                className="rounded-lg bg-telegram-primary px-3 py-2 text-xs font-medium text-black transition hover:opacity-90"
                                            >
                                                {t('save')}
                                            </button>
                                            {scheduledSyncTime && (
                                                <button
                                                    onClick={() => {
                                                        setScheduledSyncTime('');
                                                        void tauriApi.setScheduledSyncTime(null).then(() => toast.info(lang === 'es' ? 'Sincronización diaria desactivada' : 'Daily sync disabled'));
                                                    }}
                                                    className="rounded-lg border border-telegram-border px-3 py-2 text-xs text-telegram-subtext transition hover:text-telegram-text"
                                                >
                                                    {t('clear')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </SectionCard>

                                <SectionCard
                                    title={t('desktopBehavior')}
                                    icon={<Monitor className="w-4 h-4" />}
                                    description={t('desktopBehaviorDesc')}
                                >
                                    <div className="space-y-4">
                                        <ToggleRow
                                            icon={<Monitor className="w-3.5 h-3.5" />}
                                            title={t('minimizeToTray')}
                                            description={t('minimizeToTrayDesc')}
                                            checked={closeToTray}
                                            onChange={handleCloseToTray}
                                        />
                                        <div className="h-px bg-telegram-border" />
                                        <ToggleRow
                                            icon={<LogIn className="w-3.5 h-3.5" />}
                                            title={t('runAtStartup')}
                                            description={t('runAtStartupDesc')}
                                            checked={autostart}
                                            onChange={handleAutostart}
                                        />
                                    </div>
                                </SectionCard>

                                <SectionCard
                                    title={t('appearance')}
                                    icon={<Palette className="w-4 h-4" />}
                                    description={t('appearanceDesc')}
                                >
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                            {presetColors.map((color) => (
                                                <button
                                                    key={color}
                                                    onClick={() => handleAccentColorChange(color)}
                                                    className="relative h-8 w-8 rounded-full border border-telegram-border transition-transform hover:scale-110 focus:outline-none"
                                                    style={{ backgroundColor: color }}
                                                    title={color}
                                                >
                                                    {accentColor.toLowerCase() === color.toLowerCase() && (
                                                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-black bg-white/20 rounded-full">
                                                            ✓
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                            <div className="relative flex items-center gap-2 ml-2">
                                                <input
                                                    type="color"
                                                    value={accentColor}
                                                    onChange={(e) => handleAccentColorChange(e.target.value)}
                                                    className="h-8 w-8 cursor-pointer rounded border border-telegram-border bg-transparent p-0"
                                                    title={lang === 'es' ? 'Selector de color personalizado' : 'Custom color picker'}
                                                />
                                                <input
                                                    type="text"
                                                    value={accentColor}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setAccentColor(val);
                                                        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                                                            localStorage.setItem('sharkdrive.accentColor.v1', val);
                                                            document.documentElement.style.setProperty('--color-telegram-primary', val);
                                                        }
                                                    }}
                                                    placeholder="#2f9bff"
                                                    className="w-24 rounded-lg border border-telegram-border bg-white/[0.03] px-2.5 py-1 text-xs font-mono text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </SectionCard>

                                <LanguageCard />
                            </>
                        )}

                        {tab === 'downloads' && (
                            <SectionCard
                                title={t('downloadDestinations')}
                                icon={<Download className="w-4 h-4" />}
                                description={t('downloadDestinationsDesc')}
                            >
                                <ToggleRow
                                    icon={<FolderOpen className="w-3.5 h-3.5" />}
                                    title={t('openAfterDownloadSetting')}
                                    description={t('openAfterDownloadDesc')}
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
                                                        {downloadDestinations[row.key] || t('askWhereToSave')}
                                                    </p>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2">
                                                    <button
                                                        onClick={() => chooseDownloadDestination(row.key)}
                                                        className="rounded-lg border border-telegram-border px-3 py-2 text-xs font-medium text-telegram-text transition hover:bg-white/[0.05]"
                                                    >
                                                        {t('choose')}
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
                            <>
                            <SectionCard
                                title={t('localEncryption')}
                                icon={<Shield className="w-4 h-4" />}
                                description={t('localEncryptionDesc')}
                            >
                                {encryptionEnabled ? (
                                    <div className="space-y-4">
                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                                            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                                                <Shield className="w-4 h-4" />
                                                {t('encryptionActive')}
                                            </div>
                                            <p className="mt-2 text-xs text-emerald-100/80">
                                                {t('encryptionActiveDesc')}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleDisableEncryption}
                                            className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/18"
                                        >
                                            {t('disableEncryption')}
                                        </button>
                                        <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <label className="mb-2 block text-xs font-medium text-telegram-text">{t('autoLock')}</label>
                                            <select
                                                value={autoLockMinutes}
                                                onChange={(event) => void handleAutoLockChange(Number(event.target.value))}
                                                className="w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70"
                                            >
                                                <option value={0}>{lang === 'es' ? 'Desactivado' : 'Disabled'}</option>
                                                <option value={5}>{lang === 'es' ? '5 minutos' : '5 minutes'}</option>
                                                <option value={15}>{lang === 'es' ? '15 minutos' : '15 minutes'}</option>
                                                <option value={30}>{lang === 'es' ? '30 minutos' : '30 minutes'}</option>
                                                <option value={60}>{lang === 'es' ? '60 minutos' : '60 minutes'}</option>
                                            </select>
                                        </div>
                                        <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-telegram-text">{t('rotateKey')}</p>
                                                    <p className="mt-1 text-xs leading-5 text-telegram-subtext">
                                                        {t('rotateKeyDesc')}
                                                    </p>
                                                </div>
                                                {!rotationWizardOpen && (
                                                    <button
                                                        onClick={() => {
                                                            setRotationStep(1);
                                                            setRotationWizardOpen(true);
                                                        }}
                                                        disabled={encryptedCount === 0}
                                                        className="shrink-0 rounded-lg border border-telegram-primary/25 bg-telegram-primary/10 px-3 py-2 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/16 disabled:opacity-50"
                                                    >
                                                        {t('openWizard')}
                                                    </button>
                                                )}
                                            </div>
                                            {rotationWizardOpen && (
                                                <div className="mt-4 rounded-xl border border-telegram-border bg-white/[0.02] p-3">
                                                    <p className="text-[10px] uppercase tracking-[0.18em] text-telegram-subtext">Step {rotationStep} of 3</p>
                                                    {rotationStep === 1 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs text-telegram-subtext">Enter the current password to decrypt indexed encrypted files.</p>
                                                            <input
                                                                autoFocus
                                                                type="password"
                                                                value={rotationOldPassword}
                                                                onChange={(event) => setRotationOldPassword(event.target.value)}
                                                                placeholder="Current password"
                                                                className="mt-3 w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                                            />
                                                        </div>
                                                    )}
                                                    {rotationStep === 2 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs text-telegram-subtext">Choose the new local encryption password.</p>
                                                            <input
                                                                autoFocus
                                                                type="password"
                                                                value={rotationNewPassword}
                                                                onChange={(event) => setRotationNewPassword(event.target.value)}
                                                                placeholder="New password"
                                                                className="mt-3 w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                                            />
                                                            {rotationNewPassword && (
                                                                <p className="mt-2 text-xs text-telegram-subtext">
                                                                    {rotationPasswordStrength.label} | {rotationPasswordStrength.bits} bits | {rotationPasswordStrength.crackTime}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                    {rotationStep === 3 && (
                                                        <div className="mt-2">
                                                            <p className="text-xs text-telegram-subtext">
                                                                Downloading, decrypting, re-encrypting and uploading replacements sequentially.
                                                            </p>
                                                            <p className="mt-3 truncate text-xs font-medium text-telegram-primary">
                                                                {rotationProgress || `0/${encryptedCount}: preparing`}
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div className="mt-4 flex justify-end gap-2">
                                                        {!rotationLoading && (
                                                            <button
                                                                onClick={() => {
                                                                    if (rotationStep === 1) {
                                                                        setRotationOldPassword('');
                                                                        setRotationNewPassword('');
                                                                        setRotationProgress('');
                                                                        setRotationWizardOpen(false);
                                                                    } else {
                                                                        setRotationStep(rotationStep === 3 ? 2 : 1);
                                                                    }
                                                                }}
                                                                className="rounded-lg border border-telegram-border px-3 py-2 text-xs font-medium text-telegram-subtext transition hover:text-telegram-text"
                                                            >
                                                                {rotationStep === 1 ? 'Cancel' : 'Back'}
                                                            </button>
                                                        )}
                                                        {rotationStep === 1 && (
                                                            <button
                                                                onClick={() => setRotationStep(2)}
                                                                disabled={!rotationOldPassword}
                                                                className="rounded-lg bg-telegram-primary px-3 py-2 text-xs font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                                                            >
                                                                Continue
                                                            </button>
                                                        )}
                                                        {rotationStep === 2 && (
                                                            <button
                                                                onClick={() => void rotateEncryptionKey()}
                                                                disabled={rotationNewPassword.length < 8 || rotationNewPassword === rotationOldPassword}
                                                                className="rounded-lg bg-telegram-primary px-3 py-2 text-xs font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                                                            >
                                                                Start rotation
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="rounded-xl border border-telegram-border bg-black/10 px-4 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-medium text-telegram-text">Encryption audit</p>
                                                    <p className="mt-1 text-xs text-telegram-subtext">{encryptedCount} encrypted / {plainFiles.length} plain files indexed locally.</p>
                                                </div>
                                                <span className="rounded-md bg-telegram-primary/10 px-2 py-1 text-xs text-telegram-primary">{files.length} total</span>
                                            </div>
                                            <div className="mt-3 max-h-36 space-y-1 overflow-y-auto">
                                                {folderAuditRows.map((row) => (
                                                    <div key={row.id ?? 'home'} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-3 py-2 text-xs">
                                                        <span className="truncate text-telegram-text">{row.name}</span>
                                                        <span className="shrink-0 text-telegram-subtext">{row.encrypted} encrypted / {row.plain} plain</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {plainFiles.length > 0 && (
                                                <div className="mt-3">
                                                    {!auditWizardOpen ? (
                                                        <button
                                                            onClick={() => setAuditWizardOpen(true)}
                                                            className="rounded-lg border border-telegram-primary/25 bg-telegram-primary/10 px-3 py-2 text-xs font-medium text-telegram-primary transition hover:bg-telegram-primary/16"
                                                        >
                                                            Encrypt all plain files
                                                        </button>
                                                    ) : (
                                                        <div className="rounded-xl border border-telegram-border bg-white/[0.02] p-3">
                                                            <p className="text-xs leading-5 text-telegram-subtext">
                                                                Encrypt {plainFiles.length} indexed plain file{plainFiles.length === 1 ? '' : 's'} sequentially. Originals remain until replacements upload successfully.
                                                            </p>
                                                            <input
                                                                type="password"
                                                                value={auditPassword}
                                                                onChange={(event) => setAuditPassword(event.target.value)}
                                                                placeholder="Encryption password"
                                                                className="mt-3 w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-xs text-telegram-text outline-none focus:border-telegram-primary/70"
                                                            />
                                                            {auditLoading && <p className="mt-2 truncate text-xs text-telegram-primary">{rotationProgress}</p>}
                                                            <div className="mt-3 flex justify-end gap-2">
                                                                {!auditLoading && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setAuditPassword('');
                                                                            setAuditWizardOpen(false);
                                                                        }}
                                                                        className="rounded-lg border border-telegram-border px-3 py-2 text-xs font-medium text-telegram-subtext transition hover:text-telegram-text"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => void encryptPlainFiles()}
                                                                    disabled={auditLoading || auditPassword.length < 8}
                                                                    className="rounded-lg bg-telegram-primary px-3 py-2 text-xs font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                                                                >
                                                                    {auditLoading ? 'Encrypting...' : 'Encrypt files'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
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
                                                    <p className="mt-1.5 text-xs text-telegram-subtext">{passwordStrength.label} | {passwordStrength.bits} bits | {passwordStrength.crackTime}</p>
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
                            <SectionCard
                                title="Secure Delete"
                                icon={<Trash2 className="w-4 h-4" />}
                                description="Reduce recoverable metadata when deleting remote files."
                            >
                                <ToggleRow
                                    icon={<Trash2 className="w-3.5 h-3.5" />}
                                    title="Rewrite caption before deletion"
                                    description="Replace the Telegram caption with [SD-DELETED-timestamp] before deleting the message. Telegram still controls server retention."
                                    checked={secureDelete}
                                    onChange={setSecureDeleteSetting}
                                />
                            </SectionCard>

                            {/* v3.6: TOTP 2FA */}
                            <TotpSection encryptionEnabled={encryptionEnabled} />

                            {/* v3.6: Remote Wipe secret */}
                            <RemoteWipeSection />

                            </>
                        )}

                        {tab === 'backup' && (
                            <>
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
                            <SectionCard
                                title="Upload Naming"
                                icon={<FolderOpen className="w-4 h-4" />}
                                description="Optionally rename uploads in Telegram without changing local filenames."
                            >
                                <input
                                    value={uploadNamingPattern}
                                    onChange={(event) => updateNamingPattern(event.target.value)}
                                    placeholder="{date}_{name}.{ext}"
                                    className="w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                />
                                <p className="text-xs leading-5 text-telegram-subtext">
                                    Tokens: {'{date}'}, {'{name}'}, {'{folder}'}, {'{n}'}, {'{ext}'}. Leave empty to keep original names.
                                </p>
                                <div className="rounded-lg border border-telegram-border bg-black/10 px-3 py-2 text-xs text-telegram-subtext">
                                    Preview: <span className="font-mono text-telegram-text">{uploadNamingPattern ? applyUploadNamingPattern('quarterly-report.pdf', uploadNamingPattern, 'Documents', 1) : 'quarterly-report.pdf'}</span>
                                </div>
                            </SectionCard>
                            <SectionCard
                                title="Cleanup Review"
                                icon={<Trash2 className="w-4 h-4" />}
                                description="Detect old remote files after startup and sync. SharkDrive always asks before deleting anything."
                            >
                                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                                    <select
                                        value={cleanupFolderId}
                                        onChange={(event) => setCleanupFolderId(event.target.value)}
                                        className="rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                    >
                                        <option value="">Saved Messages</option>
                                        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                                    </select>
                                    <input
                                        type="number"
                                        min={1}
                                        value={cleanupDays}
                                        onChange={(event) => setCleanupDays(Number(event.target.value))}
                                        className="rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                        title="Maximum file age in days"
                                    />
                                    <button
                                        onClick={() => void addCleanupRule()}
                                        className="rounded-lg bg-telegram-primary px-3 py-2 text-xs font-medium text-black transition hover:opacity-90"
                                    >
                                        Save Rule
                                    </button>
                                </div>
                                {cleanupRules.length === 0 ? (
                                    <p className="text-xs text-telegram-subtext">No cleanup rules configured.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {cleanupRules.map((rule) => (
                                            <div key={rule.folder_id ?? 'home'} className="flex items-center justify-between gap-3 rounded-lg border border-telegram-border bg-black/10 px-3 py-2">
                                                <p className="truncate text-xs text-telegram-text">
                                                    {rule.folder_id === null ? 'Saved Messages' : folders.find((folder) => folder.id === rule.folder_id)?.name || `Folder ${rule.folder_id}`}
                                                    <span className="text-telegram-subtext"> | older than {rule.max_age_days} days</span>
                                                </p>
                                                <button
                                                    onClick={() => void removeCleanupRule(rule.folder_id)}
                                                    className="rounded-md p-1.5 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-300"
                                                    title="Remove cleanup rule"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {cleanupRules.length > 0 && (
                                    <button
                                        onClick={async () => {
                                            try {
                                                const count = await tauriApi.countCleanupCandidates();
                                                setCleanupCandidates(count);
                                                if (count === 0) { toast.info('No files match current cleanup rules'); }
                                                else { toast.info(`${count} file(s) will be flagged on next sync`); }
                                            } catch (e) { toast.error(String(e)); }
                                        }}
                                        className="self-start rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-1.5 text-xs text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text"
                                    >
                                        {t('runCleanupNow')}
                                        {cleanupCandidates !== null && (
                                            <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-amber-400">{cleanupCandidates}</span>
                                        )}
                                    </button>
                                )}
                            </SectionCard>

                            {/* WiFi-only sync */}
                            <SectionCard
                                title={t('wifiOnlySync')}
                                icon={<RefreshCw className="w-4 h-4" />}
                                description={t('wifiOnlySyncDesc')}
                            >
                                <label className="flex cursor-pointer items-center gap-3">
                                    <div
                                        onClick={() => {
                                            const next = !wifiOnlySync;
                                            setWifiOnlySync(next);
                                            localStorage.setItem('sharkdrive.wifiOnlySync.v1', String(next));
                                            tauriApi.setWifiOnlySync(next).catch(() => {});
                                        }}
                                        className={`relative h-6 w-11 rounded-full transition-colors ${wifiOnlySync ? 'bg-telegram-primary' : 'bg-white/[0.1]'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${wifiOnlySync ? 'translate-x-5' : ''}`} />
                                    </div>
                                    <span className="text-sm text-telegram-text">{t('wifiOnlySync')}</span>
                                </label>
                            </SectionCard>

                            {/* Auto-classification rules */}
                            <SectionCard
                                title={t('autoClassify')}
                                icon={<FolderOpen className="w-4 h-4" />}
                                description={t('autoClassifyDesc')}
                            >
                                <div className="flex gap-2">
                                    <select
                                        value={newRuleType}
                                        onChange={e => setNewRuleType(e.target.value)}
                                        className="flex-1 rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                    >
                                        <option value="image">Images</option>
                                        <option value="video">Videos</option>
                                        <option value="audio">Audio</option>
                                        <option value="doc">Documents</option>
                                        <option value="pdf">PDF only</option>
                                        <option value="other">Other</option>
                                    </select>
                                    <select
                                        value={newRuleFolderId}
                                        onChange={e => setNewRuleFolderId(e.target.value)}
                                        className="flex-1 rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/70"
                                    >
                                        <option value="">— Select folder —</option>
                                        {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                    <button
                                        disabled={!newRuleFolderId}
                                        onClick={() => {
                                            if (!newRuleFolderId) return;
                                            const folder = folders.find(f => String(f.id) === newRuleFolderId);
                                            if (!folder) return;
                                            const next: ClassificationRule[] = [
                                                ...classificationRules.filter(r => !r.fileTypes.includes(newRuleType)),
                                                {
                                                    id: `${Date.now()}`,
                                                    name: `${newRuleType} → ${folder.name}`,
                                                    fileTypes: [newRuleType],
                                                    folderId: folder.id,
                                                    folderName: folder.name,
                                                    enabled: true,
                                                },
                                            ];
                                            setClassificationRules(next);
                                            localStorage.setItem(CLASSIFICATION_RULES_KEY, JSON.stringify(next));
                                            setNewRuleFolderId('');
                                            toast.success(`Rule added: ${newRuleType} → ${folder.name}`);
                                        }}
                                        className="rounded-lg bg-telegram-primary px-3 py-2 text-xs font-medium text-black hover:opacity-90 disabled:opacity-40"
                                    >
                                        {t('addRule')}
                                    </button>
                                </div>
                                {classificationRules.length === 0 ? (
                                    <p className="text-xs text-telegram-subtext">{t('noRules')}</p>
                                ) : (
                                    <div className="space-y-2">
                                        {classificationRules.map(rule => (
                                            <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-telegram-border bg-black/10 px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <label className="flex cursor-pointer items-center gap-1.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={rule.enabled}
                                                            onChange={() => {
                                                                const next = classificationRules.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r);
                                                                setClassificationRules(next);
                                                                localStorage.setItem(CLASSIFICATION_RULES_KEY, JSON.stringify(next));
                                                            }}
                                                            className="accent-telegram-primary"
                                                        />
                                                    </label>
                                                    <p className="text-xs text-telegram-text">
                                                        <span className="font-medium">{rule.fileTypes.join(', ')}</span>
                                                        <span className="text-telegram-subtext"> → </span>
                                                        <span className="font-medium">{rule.folderName}</span>
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const next = classificationRules.filter(r => r.id !== rule.id);
                                                        setClassificationRules(next);
                                                        localStorage.setItem(CLASSIFICATION_RULES_KEY, JSON.stringify(next));
                                                    }}
                                                    className="rounded-md p-1.5 text-telegram-subtext transition hover:bg-red-500/10 hover:text-red-300"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </SectionCard>
                            </>
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

                                {onExportActivity && activity.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-telegram-subtext">{t('exportActivity')}:</span>
                                        <button
                                            onClick={() => onExportActivity('csv')}
                                            className="rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-1 text-xs text-telegram-subtext transition hover:bg-white/[0.08] hover:text-telegram-text"
                                        >
                                            CSV
                                        </button>
                                        <button
                                            onClick={() => onExportActivity('json')}
                                            className="rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-1 text-xs text-telegram-subtext transition hover:bg-white/[0.08] hover:text-telegram-text"
                                        >
                                            JSON
                                        </button>
                                    </div>
                                )}

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

// ── v3.6 Security sections ───────────────────────────────────────────────────

function TotpSection({ encryptionEnabled }: { encryptionEnabled: boolean }) {
    const [enabled, setEnabled] = useState(false);
    const [disableCode, setDisableCode] = useState('');
    const [showDisable, setShowDisable] = useState(false);
    const [showSetup, setShowSetup] = useState(false);

    useEffect(() => { tauriApi.isTotpEnabled().then(setEnabled).catch(() => {}); }, []);

    async function handleDisable() {
        try {
            await tauriApi.disableTotp(disableCode);
            setEnabled(false); setShowDisable(false); setDisableCode('');
            toast.success('2FA disabled');
        } catch (e) { toast.error(String(e)); }
    }

    if (!encryptionEnabled) {
        return (
            <SectionCard title="Two-Factor Authentication (TOTP)" icon={<Shield className="w-4 h-4" />} description="Enable encryption first to configure 2FA.">
                <p className="text-xs text-telegram-subtext">Enable encryption to use 2FA.</p>
            </SectionCard>
        );
    }

    return (
        <SectionCard title="Two-Factor Authentication (TOTP)" icon={<Shield className="w-4 h-4" />}
            description="Require a time-based 6-digit code (Google Authenticator) in addition to your vault password.">
            {showSetup && <TotpSetupInline onEnabled={() => { setEnabled(true); setShowSetup(false); }} onCancel={() => setShowSetup(false)} />}
            {!showSetup && !enabled && (
                <button onClick={() => setShowSetup(true)}
                    className="rounded-lg bg-telegram-primary px-4 py-2 text-xs font-semibold text-black hover:opacity-90">
                    Enable 2FA
                </button>
            )}
            {!showSetup && enabled && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircleIcon className="h-4 w-4" /> 2FA is active
                    </div>
                    {!showDisable ? (
                        <button onClick={() => setShowDisable(true)}
                            className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                            Disable 2FA
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <input
                                type="text" inputMode="numeric" maxLength={6}
                                value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g,'').slice(0,6))}
                                placeholder="Current code" className="flex-1 rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-telegram-text outline-none focus:border-telegram-primary"
                            />
                            <button onClick={handleDisable} disabled={disableCode.length !== 6}
                                className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 disabled:opacity-40">
                                Confirm
                            </button>
                            <button onClick={() => { setShowDisable(false); setDisableCode(''); }}
                                className="rounded-lg border border-telegram-border px-3 py-1.5 text-xs text-telegram-subtext">
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            )}
        </SectionCard>
    );
}

// Inline TOTP setup (QR + confirm) embedded in Settings
function TotpSetupInline({ onEnabled, onCancel }: { onEnabled: () => void; onCancel: () => void }) {
    const [uri, setUri] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => { tauriApi.setupTotp().then(setUri).catch(e => setError(String(e))); }, []);
    useEffect(() => {
        if (!uri || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, uri, { width: 160, margin: 1, color: { dark: '#e6edf3', light: '#161b22' } }).catch(() => {});
    }, [uri]);

    async function confirm() {
        try {
            const ok = await tauriApi.confirmTotpSetup(code);
            if (ok) { onEnabled(); toast.success('2FA enabled'); }
            else { setError('Invalid code'); setCode(''); }
        } catch (e) { setError(String(e)); }
    }

    const secretB32 = uri ? new URL(uri).searchParams.get('secret') : null;
    return (
        <div className="space-y-3 rounded-xl border border-telegram-border bg-white/[0.02] p-4">
            {error && <p className="text-xs text-red-400">{error}</p>}
            {uri ? (
                <div className="flex items-start gap-4">
                    <div className="rounded-lg border border-telegram-border bg-[#161b22] p-2 flex-shrink-0">
                        <canvas ref={canvasRef} />
                    </div>
                    <div className="space-y-2 min-w-0">
                        <p className="text-xs text-telegram-subtext">Scan with your authenticator app, then enter the code:</p>
                        {secretB32 && <p className="font-mono text-[10px] break-all text-telegram-subtext/70">{secretB32}</p>}
                    </div>
                </div>
            ) : <div className="flex justify-center py-4"><div className="h-5 w-5 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary"/></div>}
            <div className="flex gap-2">
                <input type="text" inputMode="numeric" maxLength={6} value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit code"
                    className="flex-1 rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 font-mono text-center text-lg text-telegram-text outline-none focus:border-telegram-primary"
                />
                <button onClick={confirm} disabled={code.length !== 6}
                    className="rounded-lg bg-telegram-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">Verify</button>
                <button onClick={onCancel} className="rounded-lg border border-telegram-border px-3 py-2 text-sm text-telegram-subtext">Cancel</button>
            </div>
        </div>
    );
}

function RemoteWipeSection() {
    const [hasSecret, setHasSecret] = useState(false);
    const [secret, setSecret] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => { tauriApi.hasWipeSecret().then(setHasSecret).catch(() => {}); }, []);

    async function handleSet() {
        if (!secret.trim()) return;
        setLoading(true);
        try {
            await tauriApi.setWipeSecret(secret);
            setHasSecret(true); setSecret('');
            toast.success('Remote wipe secret set. Send [SD-WIPE-yourSecret] to Saved Messages to trigger.');
        } catch (e) { toast.error(String(e)); }
        finally { setLoading(false); }
    }

    return (
        <SectionCard title="Remote Wipe" icon={<AlertTriangle className="w-4 h-4" />}
            description="Send a special Telegram message to yourself to wipe all local SharkDrive data remotely.">
            {hasSecret ? (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <CheckCircleIcon className="h-4 w-4" /> Remote wipe secret is set
                    </div>
                    <p className="text-xs text-telegram-subtext">
                        From any device, send <code className="rounded bg-white/[0.06] px-1">[SD-WIPE-yourSecret]</code> to Saved Messages. SharkDrive will detect it on next connect.
                    </p>
                    <button onClick={async () => { await tauriApi.clearWipeSecret(); setHasSecret(false); }} className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                        Clear secret
                    </button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <input type="text" value={secret} onChange={e => setSecret(e.target.value)}
                        placeholder="Set a wipe secret phrase"
                        className="flex-1 rounded-lg border border-telegram-border bg-white/[0.04] px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                    />
                    <button onClick={handleSet} disabled={!secret.trim() || loading}
                        className="rounded-lg bg-telegram-primary px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">Set</button>
                </div>
            )}
        </SectionCard>
    );
}

function LanguageCard() {
    const { lang, setLang, t } = useLanguage();
    const options: { value: Lang; label: string; flag: string }[] = [
        { value: 'en', label: t('english'), flag: '🇬🇧' },
        { value: 'es', label: t('spanish'), flag: '🇪🇸' },
    ];
    return (
        <div className="rounded-xl border border-telegram-border bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary text-base">
                    🌐
                </div>
                <div>
                    <p className="text-sm font-semibold text-telegram-text">{t('language')}</p>
                    <p className="text-xs text-telegram-subtext">
                        {lang === 'es' ? 'Idioma de la interfaz para SharkDrive.' : 'Interface language for SharkDrive.'}
                    </p>
                </div>
            </div>
            <div className="flex gap-2">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => setLang(opt.value)}
                        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${lang === opt.value
                            ? 'border-telegram-primary/50 bg-telegram-primary/12 text-telegram-primary'
                            : 'border-telegram-border text-telegram-subtext hover:bg-white/[0.04] hover:text-telegram-text'
                        }`}
                    >
                        <span>{opt.flag}</span>
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
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
