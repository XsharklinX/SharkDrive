import { useState, useEffect, useRef } from 'react';
import { Pencil, X, FileText, FolderOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface RenameModalProps {
    currentName: string;
    isFolder: boolean;
    onConfirm: (newName: string) => Promise<void>;
    onClose: () => void;
}

const INVALID_CHARS = /[\\/:*?"<>|]/;

export function RenameModal({ currentName, isFolder, onConfirm, onClose }: RenameModalProps) {
    const [name, setName] = useState(currentName);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    useFocusTrap(containerRef, true);

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

        if (INVALID_CHARS.test(trimmed)) {
            setError('Name contains invalid characters: \\ / : * ? " < > |');
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-label={`Rename ${isFolder ? 'folder' : 'file'}`}
                className="mx-4 w-full max-w-md rounded-lg border border-telegram-border bg-telegram-surface p-5 shadow-2xl"
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
                    <button onClick={onClose} aria-label="Close" className="rounded-md border border-telegram-border bg-white/[0.03] p-2 text-telegram-subtext transition hover:text-telegram-text">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="mb-4 rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                        {isFolder ? <FolderOpen className="w-4 h-4 text-telegram-secondary" /> : <FileText className="w-4 h-4 text-telegram-secondary" />}
                        <div className="min-w-0 truncate text-sm font-medium text-telegram-text">{currentName}</div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-2 block text-xs text-telegram-subtext">
                            New Name
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setError(null); }}
                            className="w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2.5 text-sm text-telegram-text transition-colors focus:outline-none focus:border-telegram-primary/70"
                            placeholder={isFolder ? 'Folder name' : 'File name'}
                            onKeyDown={(e) => e.key === 'Escape' && onClose()}
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-lg border border-telegram-border bg-white/[0.03] py-2.5 text-sm font-medium text-telegram-subtext transition hover:text-telegram-text"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim() || name.trim() === currentName}
                            className="flex-1 rounded-lg bg-telegram-primary py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? 'Renaming...' : 'Rename'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}
