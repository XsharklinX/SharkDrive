import { Upload, Shield, FolderPlus } from 'lucide-react';

interface EmptyStateProps {
    onUpload: () => void;
}

export function EmptyState({ onUpload }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-telegram-border bg-telegram-surface/70 px-8 py-16 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-telegram-border bg-white/[0.03]">
                <FolderPlus className="w-10 h-10 text-telegram-primary" />
            </div>

            <div className="max-w-md">
                <p className="text-[10px] uppercase tracking-[0.24em] text-telegram-subtext">Empty folder</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-telegram-text">
                    No files here yet
                </h3>
                <p className="mt-3 text-sm leading-6 text-telegram-subtext">
                    Upload files or drop them into this folder to get started.
                </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-telegram-subtext">
                <span className="rounded-full border border-telegram-border bg-white/[0.03] px-3 py-1.5">
                    Drag and drop ready
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-telegram-border bg-white/[0.03] px-3 py-1.5">
                    <Shield className="w-3.5 h-3.5 text-yellow-200" />
                    Optional encryption
                </span>
            </div>

            <button
                onClick={onUpload}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-telegram-primary px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
            >
                <Upload className="w-5 h-5" />
                Add Files
            </button>
        </div>
    );
}
