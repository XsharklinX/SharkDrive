import { useState, useEffect, useRef } from 'react';
import { Pencil, X, FileText, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';

interface RenameModalProps {
    currentName: string;
    isFolder: boolean;
    onConfirm: (newName: string) => Promise<void>;
    onClose: () => void;
}

export function RenameModal({ currentName, isFolder, onConfirm, onClose }: RenameModalProps) {
    const [name, setName] = useState(currentName);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || trimmed === currentName) {
            onClose();
            return;
        }

        setLoading(true);
        setError(null);
        try {
            await onConfirm(trimmed);
            onClose();
        } catch (err) {
            setError(String(err));
            setLoading(false);
        }
    };

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
                className="vault-panel mx-4 w-full max-w-md rounded-2xl p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-primary">
                            <Pencil className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-telegram-text">
                                Rename {isFolder ? 'Folder' : 'File'}
                            </h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="mb-4 rounded-lg border border-telegram-border bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-secondary">
                            {isFolder ? <FolderOpen className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-telegram-subtext">Current Name</p>
                            <p className="truncate text-sm font-medium text-telegram-text">{currentName}</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-[0.2em] text-telegram-subtext">
                            New Name
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-2xl border border-telegram-border bg-white/[0.03] px-4 py-3 text-sm text-telegram-text transition-colors focus:outline-none focus:border-telegram-primary/70"
                            placeholder={isFolder ? 'Folder name' : 'File name'}
                            onKeyDown={(e) => e.key === 'Escape' && onClose()}
                        />
                    </div>

                    {error && (
                        <div className="rounded-[1.15rem] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-2xl border border-telegram-border bg-white/[0.03] py-3 text-sm font-medium text-telegram-subtext transition hover:text-telegram-text"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim() || name.trim() === currentName}
                            className="flex-1 rounded-2xl bg-telegram-primary py-3 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? 'Renaming...' : 'Rename'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}
