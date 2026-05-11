import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile } from '../types';
import { tauriApi } from '../api/tauri';
import { resolveFileFolderId } from '../utils';

export function useFileOperations(
    activeFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[]
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const handleDelete = async (file: TelegramFile) => {
        if (!await confirm({ title: "Delete File", message: "Are you sure you want to delete this file?", confirmText: "Delete", variant: 'danger' })) return;
        try {
            await tauriApi.deleteFile(file.id, resolveFileFolderId(file, activeFolderId));
            queryClient.invalidateQueries({ queryKey: ['files'] });
            toast.success("File deleted");
        } catch (e) {
            toast.error(`Delete failed: ${e}`);
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!await confirm({ title: "Delete Files", message: `Are you sure you want to delete ${selectedIds.length} files?`, confirmText: "Delete All", variant: 'danger' })) return;

        let success = 0;
        let fail = 0;
        for (const id of selectedIds) {
            try {
                const file = displayedFiles.find((candidate) => candidate.id === id);
                await tauriApi.deleteFile(id, file ? resolveFileFolderId(file, activeFolderId) : activeFolderId);
                success++;
            } catch {
                fail++;
            }
        }
        setSelectedIds([]);
        queryClient.invalidateQueries({ queryKey: ['files'] });
        if (success > 0) toast.success(`Deleted ${success} files.`);
        if (fail > 0) toast.error(`Failed to delete ${fail} files.`);
    }

    const handleBulkMove = async (targetFolderId: number | null, onSuccess?: () => void) => {
        if (selectedIds.length === 0) return;
        try {
            const groupedByFolder = new Map<number | null, number[]>();
            for (const file of displayedFiles.filter((candidate) => selectedIds.includes(candidate.id))) {
                const sourceFolderId = resolveFileFolderId(file, activeFolderId);
                const existing = groupedByFolder.get(sourceFolderId) ?? [];
                existing.push(file.id);
                groupedByFolder.set(sourceFolderId, existing);
            }

            for (const [sourceFolderId, messageIds] of groupedByFolder.entries()) {
                await tauriApi.moveFiles(messageIds, sourceFolderId, targetFolderId);
            }
            toast.success(`Moved ${selectedIds.length} files.`);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            setSelectedIds([]);
            if (onSuccess) onSuccess();
        } catch {
            toast.error('Failed to move files');
        }
    };

    return {
        handleDelete,
        handleBulkDelete,
        handleBulkMove,
        handleGlobalSearch: async (query: string) => {
            try {
                return await tauriApi.searchGlobal(query);
            } catch {
                return [];
            }
        }
    };
}
