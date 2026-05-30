import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile } from '../types';
import { tauriApi } from '../api/tauri';
import { formatBytes, resolveFileFolderId } from '../utils';

export function useFileOperations(
    activeFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[]
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();
    const secureDelete = localStorage.getItem('sharkdrive.secureDelete.v1') === 'true';

    const handleDelete = async (file: TelegramFile) => {
        const sizeLabel = file.size ? ` (${formatBytes(file.size)})` : '';
        if (!await confirm({ title: "Delete File", message: `Delete "${file.name}"${sizeLabel}?\n\nThis cannot be undone.`, confirmText: "Delete", variant: 'danger' })) return;
        try {
            await tauriApi.deleteFile(file.id, resolveFileFolderId(file, activeFolderId), secureDelete);
            queryClient.invalidateQueries({ queryKey: ['files'] });
            toast.success("File deleted");
        } catch (e) {
            toast.error(`Delete failed: ${e}`);
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        const selectedFiles = displayedFiles.filter((f) => selectedIds.includes(f.id));
        const totalBytes = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        const sizeLabel = totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : '';
        if (!await confirm({ title: "Delete Files", message: `Delete ${selectedIds.length} file${selectedIds.length !== 1 ? 's' : ''}${sizeLabel}?\n\nThis cannot be undone.`, confirmText: "Delete All", variant: 'danger' })) return;

        let success = 0;
        const failedNames: string[] = [];
        for (const id of selectedIds) {
            const file = displayedFiles.find((candidate) => candidate.id === id);
            try {
                await tauriApi.deleteFile(id, file ? resolveFileFolderId(file, activeFolderId) : activeFolderId, secureDelete);
                success++;
            } catch {
                failedNames.push(file?.name ?? `#${id}`);
            }
        }
        setSelectedIds([]);
        queryClient.invalidateQueries({ queryKey: ['files'] });
        if (success > 0) toast.success(`Deleted ${success} file${success !== 1 ? 's' : ''}.`);
        if (failedNames.length > 0) {
            const preview = failedNames.slice(0, 3).join(', ');
            const extra = failedNames.length > 3 ? ` and ${failedNames.length - 3} more` : '';
            toast.error(`Failed to delete: ${preview}${extra}`);
        }
    }

    const handleBulkMove = async (targetFolderId: number | null, onSuccess?: () => void) => {
        if (selectedIds.length === 0) return;

        const groupedByFolder = new Map<number | null, number[]>();
        for (const file of displayedFiles.filter((candidate) => selectedIds.includes(candidate.id))) {
            const sourceFolderId = resolveFileFolderId(file, activeFolderId);
            const existing = groupedByFolder.get(sourceFolderId) ?? [];
            existing.push(file.id);
            groupedByFolder.set(sourceFolderId, existing);
        }

        let success = 0;
        let fail = 0;
        for (const [sourceFolderId, messageIds] of groupedByFolder.entries()) {
            try {
                await tauriApi.moveFiles(messageIds, sourceFolderId, targetFolderId);
                success += messageIds.length;
            } catch {
                fail += messageIds.length;
            }
        }

        if (success > 0) toast.success(`Moved ${success} file${success !== 1 ? 's' : ''}.`);
        if (fail > 0) toast.error(`Failed to move ${fail} file${fail !== 1 ? 's' : ''}.`);
        queryClient.invalidateQueries({ queryKey: ['files'] });
        setSelectedIds([]);
        if (success > 0 && onSuccess) onSuccess();
    };

    const handleBulkCopy = async (targetFolderId: number | null, onSuccess?: () => void) => {
        if (selectedIds.length === 0) return;

        const groupedByFolder = new Map<number | null, number[]>();
        for (const file of displayedFiles.filter((candidate) => selectedIds.includes(candidate.id))) {
            const sourceFolderId = resolveFileFolderId(file, activeFolderId);
            const existing = groupedByFolder.get(sourceFolderId) ?? [];
            existing.push(file.id);
            groupedByFolder.set(sourceFolderId, existing);
        }

        let success = 0;
        let fail = 0;
        for (const [sourceFolderId, messageIds] of groupedByFolder.entries()) {
            try {
                await tauriApi.copyFiles(messageIds, sourceFolderId, targetFolderId);
                success += messageIds.length;
            } catch {
                fail += messageIds.length;
            }
        }

        if (success > 0) toast.success(`Copied ${success} file${success !== 1 ? 's' : ''}.`);
        if (fail > 0) toast.error(`Failed to copy ${fail} file${fail !== 1 ? 's' : ''}.`);
        queryClient.invalidateQueries({ queryKey: ['files'] });
        setSelectedIds([]);
        if (success > 0 && onSuccess) onSuccess();
    };

    return {
        handleDelete,
        handleBulkDelete,
        handleBulkMove,
        handleBulkCopy,
    };
}
