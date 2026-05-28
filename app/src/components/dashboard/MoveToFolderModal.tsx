import { X, HardDrive, Folder, MoveRight, Copy } from 'lucide-react';
import { TelegramFolder } from '../../types';

interface MoveToFolderModalProps {
    folders: TelegramFolder[];
    onClose: () => void;
    onSelect: (id: number | null) => void;
    activeFolderId: number | null;
    mode?: 'move' | 'copy';
}

function buildHierarchicalList(folders: TelegramFolder[]): { folder: TelegramFolder; depth: number }[] {
    const idSet = new Set(folders.map((f) => f.id));
    const result: { folder: TelegramFolder; depth: number }[] = [];
    const visited = new Set<number>();

    const addFolder = (folder: TelegramFolder, depth: number) => {
        if (visited.has(folder.id)) return;
        visited.add(folder.id);
        result.push({ folder, depth });
        folders
            .filter((f) => f.parent_id === folder.id)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((child) => addFolder(child, depth + 1));
    };

    folders
        .filter((f) => !f.parent_id || !idSet.has(f.parent_id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((f) => addFolder(f, 0));

    return result;
}

export function MoveToFolderModal({ folders, onClose, onSelect, activeFolderId, mode = 'move' }: MoveToFolderModalProps) {
    const isCopy = mode === 'copy';
    const Icon = isCopy ? Copy : MoveRight;
    const hierarchical = buildHierarchicalList(folders);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={onClose}
        >
            <div
                className="flex max-h-[80vh] w-[26rem] flex-col overflow-hidden rounded-lg border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border/80 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                            <Icon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold tracking-tight text-telegram-text">{isCopy ? 'Copy Files' : 'Move Files'}</h3>
                            <p className="text-xs text-telegram-subtext">Choose destination folder</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {activeFolderId !== null && (
                        <button
                            onClick={() => onSelect(null)}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-telegram-text transition hover:bg-white/[0.05]"
                        >
                            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-telegram-primary/20 bg-telegram-primary/10 text-telegram-primary">
                                <HardDrive className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="font-medium">Saved Messages</p>
                            </div>
                        </button>
                    )}

                    {hierarchical.map(({ folder, depth }) => {
                        if (folder.id === activeFolderId) return null;

                        return (
                            <button
                                key={folder.id}
                                onClick={() => onSelect(folder.id)}
                                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-telegram-text transition hover:bg-white/[0.05]"
                                style={{ paddingLeft: `${12 + depth * 16}px` }}
                            >
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-telegram-border bg-white/[0.04] text-telegram-secondary">
                                    <Folder className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-medium">{folder.name}</p>
                                </div>
                            </button>
                        );
                    })}

                    {folders.length === 0 && activeFolderId === null && (
                        <div className="rounded-lg border border-telegram-border bg-white/[0.03] p-5 text-center text-sm text-telegram-subtext">
                            No other folders available yet. Create one first to {isCopy ? 'copy' : 'move'} items around.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
