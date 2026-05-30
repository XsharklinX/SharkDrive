import { BarChart3, CalendarRange, FileText, HardDrive, Image, Music, Video, X } from 'lucide-react';
import type { TelegramFile, TelegramFolder } from '../../types';
import { formatBytes, isAudioFile, isDocumentFile, isImageFile, isVideoFile } from '../../utils';

interface FolderStatsModalProps {
    folder: TelegramFolder;
    files: TelegramFile[];
    onClose: () => void;
}

const formatDate = (value?: string) => {
    if (!value) return 'No date';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'No date'
        : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export function FolderStatsModal({ folder, files, onClose }: FolderStatsModalProps) {
    const datedFiles = files.filter((file) => file.created_at).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    const typeRows = [
        { label: 'Images', icon: Image, count: files.filter((file) => isImageFile(file.name)).length },
        { label: 'Videos', icon: Video, count: files.filter((file) => isVideoFile(file.name)).length },
        { label: 'Audio', icon: Music, count: files.filter((file) => isAudioFile(file.name)).length },
        { label: 'Documents', icon: FileText, count: files.filter((file) => isDocumentFile(file.name)).length },
    ];
    const categorized = typeRows.reduce((sum, row) => sum + row.count, 0);
    const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm" onClick={onClose}>
            <section className="w-full max-w-lg rounded-2xl border border-telegram-border bg-telegram-surface p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-telegram-primary">
                            <BarChart3 className="h-4 w-4" />
                            <p className="text-[10px] uppercase tracking-[0.18em]">Folder statistics</p>
                        </div>
                        <h2 className="mt-2 truncate text-lg font-semibold text-telegram-text">{folder.name}</h2>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text" title="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-telegram-border bg-white/[0.025] p-4">
                        <HardDrive className="h-4 w-4 text-telegram-primary" />
                        <p className="mt-3 text-xl font-semibold text-telegram-text">{files.length}</p>
                        <p className="text-xs text-telegram-subtext">Files indexed locally</p>
                    </div>
                    <div className="rounded-xl border border-telegram-border bg-white/[0.025] p-4">
                        <BarChart3 className="h-4 w-4 text-telegram-primary" />
                        <p className="mt-3 text-xl font-semibold text-telegram-text">{formatBytes(totalBytes)}</p>
                        <p className="text-xs text-telegram-subtext">Total size</p>
                    </div>
                </div>

                <div className="mt-4 rounded-xl border border-telegram-border bg-white/[0.025] p-3">
                    {typeRows.map(({ label, icon: Icon, count }) => (
                        <div key={label} className="flex items-center justify-between gap-3 px-1 py-2 text-sm">
                            <span className="flex items-center gap-2 text-telegram-subtext"><Icon className="h-4 w-4" />{label}</span>
                            <span className="font-medium text-telegram-text">{count}</span>
                        </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 px-1 py-2 text-sm">
                        <span className="text-telegram-subtext">Other</span>
                        <span className="font-medium text-telegram-text">{Math.max(0, files.length - categorized)}</span>
                    </div>
                </div>

                <div className="mt-4 flex items-center gap-3 rounded-xl border border-telegram-border bg-white/[0.025] p-3 text-xs text-telegram-subtext">
                    <CalendarRange className="h-4 w-4 shrink-0 text-telegram-primary" />
                    <span>Oldest: {formatDate(datedFiles[0]?.created_at)}</span>
                    <span className="text-telegram-border">|</span>
                    <span>Newest: {formatDate(datedFiles[datedFiles.length - 1]?.created_at)}</span>
                </div>
            </section>
        </div>
    );
}
