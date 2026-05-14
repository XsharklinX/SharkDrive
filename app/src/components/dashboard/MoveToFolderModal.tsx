import { X, HardDrive, Folder, MoveRight } from 'lucide-react';
import { TelegramFolder } from '../../types';

interface MoveToFolderModalProps {
    folders: TelegramFolder[];
    onClose: () => void;
    onSelect: (id: number | null) => void;
    activeFolderId: number | null;
}

export function MoveToFolderModal({ folders, onClose, onSelect, activeFolderId }: MoveToFolderModalProps) {
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[linear-gradient(180deg,rgba(4,10,17,0.72),rgba(2,7,13,0.92))] backdrop-blur-lg"
            onClick={onClose}
        >
            <div
                className="vault-panel flex max-h-[80vh] w-[26rem] flex-col overflow-hidden rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border/80 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                            <MoveRight className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold tracking-tight text-telegram-text">Move Files</h3>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="border-b border-telegram-border/70 px-5 py-4 text-sm text-telegram-subtext">
                    Choose where the selected files should go next. The current folder is hidden from the list.
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {activeFolderId !== null && (
                        <button
                            onClick={() => onSelect(null)}
                            className="flex w-full items-center gap-3 rounded-lg border border-telegram-border bg-white/[0.03] px-4 py-3 text-left text-sm text-telegram-text transition hover:bg-white/[0.05]"
                        >
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-primary/20 bg-telegram-primary/10 text-telegram-primary">
                                <HardDrive className="w-4 h-4" />
                            </div>
                            <div>
                                <p className="font-medium">Saved Messages</p>
                                <p className="text-xs text-telegram-subtext">Move back to Saved Messages</p>
                            </div>
                        </button>
                    )}

                    {folders.map((folder) => {
                        if (folder.id === activeFolderId) return null;

                        return (
                            <button
                                key={folder.id}
                                onClick={() => onSelect(folder.id)}
                                className="flex w-full items-center gap-3 rounded-lg border border-telegram-border bg-white/[0.03] px-4 py-3 text-left text-sm text-telegram-text transition hover:bg-white/[0.05]"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-secondary">
                                    <Folder className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate font-medium">{folder.name}</p>
                                    <p className="text-xs text-telegram-subtext">Available destination folder</p>
                                </div>
                            </button>
                        );
                    })}

                    {folders.length === 0 && activeFolderId === null && (
                        <div className="rounded-lg border border-telegram-border bg-white/[0.03] p-5 text-center text-sm text-telegram-subtext">
                            No other folders available yet. Create one first to move items around.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
