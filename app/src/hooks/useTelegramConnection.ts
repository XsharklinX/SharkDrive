import { useState, useEffect, useRef } from 'react';
import { Store } from '@tauri-apps/plugin-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFolder } from '../types';
import { useNetworkStatus } from './useNetworkStatus';
import { tauriApi } from '../api/tauri';
import { formatError } from '../utils';

export function useTelegramConnection(onLogoutParent: () => void) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const [folders, setFolders] = useState<TelegramFolder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [store, setStore] = useState<Store | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const pendingFolderIdsRef = useRef<Set<number>>(new Set());
    const apiIdRef = useRef<number | null>(null);


    const networkIsOnline = useNetworkStatus();


    useEffect(() => {
        const initStore = async () => {
            try {
                let _store = await Store.load('config.json');
                const checkId = await _store.get<string>('api_id');
                if (!checkId) {
                    _store = await Store.load('settings.json');
                }
                setStore(_store);

                const savedFolders = await _store.get<TelegramFolder[]>('folders');
                if (savedFolders) setFolders(savedFolders);


                const savedActiveFolderId = await _store.get<number | null>('activeFolderId');
                if (savedActiveFolderId !== undefined) setActiveFolderId(savedActiveFolderId);

                const apiIdStr = await _store.get<string>('api_id');
                if (apiIdStr) {
                    const apiId = parseInt(apiIdStr as string);
                    apiIdRef.current = apiId;
                    setIsConnecting(true);
                    try {
                        await tauriApi.connect(apiId);
                        setIsConnected(true);
                        queryClient.invalidateQueries({ queryKey: ['files'] });
                    } catch {
                        // Silent failure — useAutoReconnect will retry
                        setIsConnected(false);
                    } finally {
                        setIsConnecting(false);
                    }
                } else {
                    onLogoutParent();
                }

            } catch {
                // store not available
            }
        };
        initStore();
    }, [queryClient, onLogoutParent]);


    // Reconnect function — used by useAutoReconnect hook and network-restore handler
    const attemptReconnect = async () => {
        const apiId = apiIdRef.current;
        if (!apiId) return;
        setIsConnecting(true);
        try {
            await tauriApi.connect(apiId);
            setIsConnected(true);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            toast.success('Reconnected to Telegram');
        } catch {
            setIsConnected(false);
            throw new Error('reconnect failed');
        } finally {
            setIsConnecting(false);
        }
    };

    const prevOnlineRef = useRef(true);
    useEffect(() => {
        const wasOffline = !prevOnlineRef.current;
        prevOnlineRef.current = networkIsOnline;

        if (wasOffline && networkIsOnline) {
            // Network restored — try to reconnect immediately
            attemptReconnect().catch(() => {});
        } else if (!networkIsOnline) {
            setIsConnected(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [networkIsOnline]);


    const isNetworkError = (error: string): boolean => {
        const keywords = ['timeout', 'connection', 'network', 'socket', 'disconnected', 'EOF', 'ECONNREFUSED', 'overflow'];
        return keywords.some(k => error.toLowerCase().includes(k.toLowerCase()));
    };

    const forceLogout = async () => {
        setIsConnected(false);
        try {
            await tauriApi.cleanCache().catch(() => { });
            if (store) {
                await store.delete('api_id');
                await store.delete('api_hash');
                await store.delete('folders');
                await store.save();
            }
        } catch {
            // best effort cleanup
        }
        toast.error("Connection lost. Please log in again.");
        onLogoutParent();
    };


    const handleLogout = async () => {
        if (!await confirm({ title: "Sign Out", message: "Are you sure you want to sign out? This will disconnect your active session.", confirmText: "Sign Out", variant: 'danger' })) return;

        try {
            await tauriApi.logout();
            await tauriApi.cleanCache();
            if (store) {
                await store.delete('api_id');
                await store.delete('api_hash');
                await store.delete('folders');
                await store.save();
            }
            onLogoutParent();
        } catch {
            toast.error("Error signing out");
            onLogoutParent();
        }
    };

    const handleSyncFolders = async () => {
        if (!store) return;
        if (isSyncing) {
            toast.info('Sync already in progress.');
            return;
        }
        setIsSyncing(true);
        try {
            const foundFolders = await tauriApi.scanFolders();
            const foundIds = new Set(foundFolders.map((folder) => folder.id));
            const preservedPendingFolders = folders.filter((folder) => pendingFolderIdsRef.current.has(folder.id) && !foundIds.has(folder.id));
            const mergedFolders = preservedPendingFolders.length > 0
                ? [...foundFolders, ...preservedPendingFolders]
                : foundFolders;

            for (const folder of foundFolders) {
                pendingFolderIdsRef.current.delete(folder.id);
            }

            const previousIds = new Set(folders.map((folder) => folder.id));
            const updatedIds = new Set(mergedFolders.map((folder) => folder.id));
            const added = mergedFolders.filter((folder) => !previousIds.has(folder.id)).length;
            const removed = folders.filter((folder) => !updatedIds.has(folder.id)).length;
            const renamed = mergedFolders.filter((folder) => {
                const current = folders.find((candidate) => candidate.id === folder.id);
                return current && current.name !== folder.name;
            }).length;

            setFolders(mergedFolders);
            await store.set('folders', mergedFolders);
            await store.save();

            if (activeFolderId !== null && !updatedIds.has(activeFolderId)) {
                setActiveFolderId(null);
                await store.set('activeFolderId', null);
                await store.save();
            }

            if (added || removed || renamed) {
                toast.success(`Sync complete. +${added} new, ${renamed} updated, ${removed} removed.`);
            } else {
                toast.info("Sync complete. No folder changes found.");
            }
        } catch (error) {
            toast.error(`Sync failed: ${formatError(error)}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCreateFolder = async (name: string, parentId: number | null = null) => {
        if (!store) return;
        try {
            const newFolder = await tauriApi.createFolder(name, parentId);
            pendingFolderIdsRef.current.add(newFolder.id);
            const updated = [...folders, newFolder];
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(parentId ? `Subfolder "${name}" created.` : `Folder "${name}" created.`);
        } catch (e) {
            toast.error(`Failed to create folder: ${formatError(e)}`);
            throw e;
        }
    };

    const handleFolderDelete = async (folderId: number, folderName: string) => {
        if (!await confirm({
            title: "Delete Folder",
            message: `Delete "${folderName}" from SharkDrive and Telegram?\nThis cannot be undone.`,
            confirmText: "Delete Folder",
            variant: 'danger'
        })) return;

        try {
            await tauriApi.deleteFolder(folderId);
            pendingFolderIdsRef.current.delete(folderId);
            const updated = folders.filter(f => f.id !== folderId);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            if (activeFolderId === folderId) setActiveFolderId(null);
            toast.success(`Folder "${folderName}" deleted from Telegram.`);
        } catch (e: unknown) {
            const errStr = String(e);
            if (errStr.includes("not found")) {
                if (await confirm({
                    title: "Folder Not Found",
                    message: `Folder "${folderName}" not found on Telegram (it may have been deleted externally).\nRemove from this app?`,
                    confirmText: "Remove",
                    variant: 'info'
                })) {
                    const updated = folders.filter(f => f.id !== folderId);
                    setFolders(updated);
                    if (store) {
                        await store.set('folders', updated);
                        await store.save();
                    }
                    if (activeFolderId === folderId) setActiveFolderId(null);
                }
            } else {
                toast.error(`Failed to delete folder: ${formatError(e)}`);
            }
        }
    };


    const handleRenameFolder = async (folderId: number, newName: string) => {
        try {
            await tauriApi.renameFolder(folderId, newName);
            const updated = folders.map(f => f.id === folderId ? { ...f, name: newName } : f);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            toast.success(`Renamed to "${newName}"`);
        } catch (e) {
            toast.error(`Failed to rename folder: ${formatError(e)}`);
            throw e;
        }
    };

    const handleSetFolderParent = async (folderId: number, parentId: number | null) => {
        try {
            const updatedFolder = await tauriApi.setFolderParent(folderId, parentId);
            const updated = folders.map((folder) => folder.id === folderId ? updatedFolder : folder);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            toast.success(parentId ? 'Folder moved into collection.' : 'Folder moved to root.');
        } catch (e) {
            toast.error(`Failed to move folder: ${formatError(e)}`);
            throw e;
        }
    };

    const handleSetActiveFolderId = async (id: number | null) => {
        setActiveFolderId(id);
        if (store) {
            await store.set('activeFolderId', id);
            await store.save();
        }
    };

    return {
        store,
        folders,
        activeFolderId,
        setActiveFolderId: handleSetActiveFolderId,
        isSyncing,
        isConnected,
        isConnecting,
        attemptReconnect,
        handleLogout,
        handleSyncFolders,
        handleCreateFolder,
        handleFolderDelete,
        handleRenameFolder,
        handleSetFolderParent,
        isNetworkError,
        forceLogout
    };
}
