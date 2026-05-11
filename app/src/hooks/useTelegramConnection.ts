import { useState, useEffect, useRef } from 'react';
import { Store } from '@tauri-apps/plugin-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFolder } from '../types';
import { useNetworkStatus } from './useNetworkStatus';
import { tauriApi } from '../api/tauri';

export function useTelegramConnection(onLogoutParent: () => void) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const [folders, setFolders] = useState<TelegramFolder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [store, setStore] = useState<Store | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);


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
                    try {
                        const apiId = parseInt(apiIdStr as string);
                        await tauriApi.connect(apiId);
                        setIsConnected(true);
                        queryClient.invalidateQueries({ queryKey: ['files'] });
                    } catch {
                        const shouldRetry = await confirm({
                            title: "Telegram Connection Failed",
                            message: "SharkDrive couldn't reconnect to Telegram. Retry now?",
                            confirmText: "Retry",
                            variant: 'info'
                        });
                        if (shouldRetry) {
                            window.location.reload();
                        } else {
                            if (_store) {
                                await _store.delete('api_id');
                                await _store.save();
                            }
                            onLogoutParent();
                        }
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


    const prevOnlineRef = useRef(true);
    useEffect(() => {
        const wasOffline = !prevOnlineRef.current;
        prevOnlineRef.current = networkIsOnline;

        if (wasOffline && networkIsOnline && store) {
            // Network restored — attempt to reconnect to Telegram
            store.get<string>('api_id').then(apiIdStr => {
                if (!apiIdStr) return;
                const apiId = parseInt(apiIdStr);
                tauriApi.connect(apiId)
                    .then(() => {
                        setIsConnected(true);
                        queryClient.invalidateQueries({ queryKey: ['files'] });
                        toast.success('Reconnected to Telegram');
                    })
                    .catch(() => setIsConnected(false));
            });
        } else {
            setIsConnected(networkIsOnline);
        }
    }, [networkIsOnline, store, queryClient]);


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
        setIsSyncing(true);
        try {
            const foundFolders = await tauriApi.scanFolders();
            const previousIds = new Set(folders.map((folder) => folder.id));
            const updatedIds = new Set(foundFolders.map((folder) => folder.id));
            const added = foundFolders.filter((folder) => !previousIds.has(folder.id)).length;
            const removed = folders.filter((folder) => !updatedIds.has(folder.id)).length;
            const renamed = foundFolders.filter((folder) => {
                const current = folders.find((candidate) => candidate.id === folder.id);
                return current && current.name !== folder.name;
            }).length;

            setFolders(foundFolders);
            await store.set('folders', foundFolders);
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
        } catch {
            toast.error("Sync failed");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCreateFolder = async (name: string) => {
        if (!store) return;
        try {
            const newFolder = await tauriApi.createFolder(name);
            const updated = [...folders, newFolder];
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(`Folder "${name}" created.`);
        } catch (e) {
            toast.error("Failed to create folder: " + e);
            throw e;
        }
    };

    const handleFolderDelete = async (folderId: number, folderName: string) => {
        if (!await confirm({
            title: "Move to Trash",
            message: `Move "${folderName}" to Trash?\nYou can restore it later from the Trash folder.`,
            confirmText: "Move to Trash",
            variant: 'danger'
        })) return;

        try {
            await tauriApi.softDeleteFolder(folderId, folderName);
            const updated = folders.filter(f => f.id !== folderId);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            if (activeFolderId === folderId) setActiveFolderId(null);
            toast.success(`Folder "${folderName}" deleted.`);
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
                toast.error(`Failed to delete folder: ${e}`);
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
            toast.error(`Failed to rename folder: ${e}`);
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
        handleLogout,
        handleSyncFolders,
        handleCreateFolder,
        handleFolderDelete,
        handleRenameFolder,
        isNetworkError,
        forceLogout
    };
}
