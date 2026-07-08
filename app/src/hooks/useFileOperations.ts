import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { useSound } from '../context/SoundContext';
import { TelegramFile } from '../types';
import { tauriApi } from '../api/tauri';
import { formatBytes, formatError, resolveFileFolderId } from '../utils';

export function useFileOperations(
    activeFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[],
    onDeleted?: (deletedIds: number[]) => void,
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();
    const { play } = useSound();
    const secureDelete = localStorage.getItem('sharkdrive.secureDelete.v1') === 'true';

    const invalidateFileQueries = (folderId: number | null) => {
        queryClient.invalidateQueries({ queryKey: ['files'] });
        queryClient.invalidateQueries({ queryKey: ['cached-files', folderId] });
        queryClient.invalidateQueries({ queryKey: ['cached-files'] });
        queryClient.invalidateQueries({ queryKey: ['all-indexed-files'] });
    };

    const handleDelete = async (file: TelegramFile) => {
        const folderId = resolveFileFolderId(file, activeFolderId);
        const sizeLabel = file.size ? ` (${formatBytes(file.size)})` : '';
        if (!await confirm({
            title: 'Eliminar archivo',
            message: `Eliminar "${file.name}"${sizeLabel}?\n\nEsto lo borrara de Telegram de forma permanente.`,
            confirmText: 'Eliminar',
            variant: 'danger',
        })) return;

        try {
            await tauriApi.deleteFile(file.id, folderId, secureDelete);
            invalidateFileQueries(folderId);
            onDeleted?.([file.id]);
            play('delete');
            toast.success(`"${file.name}" eliminado`);
        } catch (e) {
            play('error');
            toast.error(`Error al eliminar: ${formatError(e)}`);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;

        const selectedFiles = displayedFiles.filter((f) => selectedIds.includes(f.id));
        const totalBytes = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
        const sizeLabel = totalBytes > 0 ? ` - ${formatBytes(totalBytes)}` : '';
        if (!await confirm({
            title: 'Eliminar archivos',
            message: `Eliminar ${selectedIds.length} archivo${selectedIds.length !== 1 ? 's' : ''}${sizeLabel}?\n\nEsto los borrara de Telegram de forma permanente.`,
            confirmText: `Eliminar ${selectedIds.length}`,
            variant: 'danger',
        })) return;

        let success = 0;
        const failedNames: string[] = [];
        const deletedIds: number[] = [];

        for (const id of selectedIds) {
            const file = displayedFiles.find((candidate) => candidate.id === id);
            const folderId = file ? resolveFileFolderId(file, activeFolderId) : activeFolderId;
            try {
                await tauriApi.deleteFile(id, folderId, secureDelete);
                success++;
                deletedIds.push(id);
            } catch {
                failedNames.push(file?.name ?? `#${id}`);
            }
        }

        setSelectedIds([]);
        invalidateFileQueries(activeFolderId);
        if (deletedIds.length > 0) {
            onDeleted?.(deletedIds);
            play('delete');
        }
        if (success > 0) {
            toast.success(`${success} archivo${success !== 1 ? 's' : ''} eliminado${success !== 1 ? 's' : ''} de Telegram.`);
        }
        if (failedNames.length > 0) {
            play('error');
            const preview = failedNames.slice(0, 3).join(', ');
            const extra = failedNames.length > 3 ? ` y ${failedNames.length - 3} mas` : '';
            toast.error(`Error al eliminar: ${preview}${extra}`);
        }
    };

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
        const failures: string[] = [];
        for (const [sourceFolderId, messageIds] of groupedByFolder.entries()) {
            try {
                await tauriApi.moveFiles(messageIds, sourceFolderId, targetFolderId);
                success += messageIds.length;
                invalidateFileQueries(sourceFolderId);
            } catch (error) {
                failures.push(formatError(error));
            }
        }

        if (targetFolderId !== activeFolderId) invalidateFileQueries(targetFolderId);
        if (success > 0) toast.success(`Moved ${success} file${success !== 1 ? 's' : ''}.`);
        if (failures.length > 0) toast.error(`Move failed: ${failures[0]}`);
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
        const failures: string[] = [];
        for (const [sourceFolderId, messageIds] of groupedByFolder.entries()) {
            try {
                await tauriApi.copyFiles(messageIds, sourceFolderId, targetFolderId);
                success += messageIds.length;
            } catch (error) {
                failures.push(formatError(error));
            }
        }

        invalidateFileQueries(targetFolderId);
        if (success > 0) toast.success(`Copied ${success} file${success !== 1 ? 's' : ''}.`);
        if (failures.length > 0) toast.error(`Copy failed: ${failures[0]}`);
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
