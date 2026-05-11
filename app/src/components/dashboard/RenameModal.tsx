import { useState, useEffect, useRef } from 'react';
import { Pencil, X } from 'lucide-react';
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
        if (!trimmed || trimmed === currentName) { onClose(); return; }
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-telegram-surface border border-telegram-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-telegram-primary" />
                        <h2 className="text-sm font-semibold text-telegram-text">
                            Rename {isFolder ? 'Folder' : 'File'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-telegram-hover rounded text-telegram-subtext">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-telegram-hover border border-telegram-border rounded-lg px-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/70 transition-colors"
                        placeholder={isFolder ? 'Folder name' : 'File name'}
                        onKeyDown={e => e.key === 'Escape' && onClose()}
                    />

                    {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 text-sm text-telegram-subtext hover:text-telegram-text bg-telegram-hover hover:bg-telegram-border rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim() || name.trim() === currentName}
                            className="flex-1 py-2 text-sm font-medium bg-telegram-primary text-white rounded-lg hover:bg-telegram-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Renaming...' : 'Rename'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </motion.div>
    );
}
