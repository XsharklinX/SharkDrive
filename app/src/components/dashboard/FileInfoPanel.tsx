import { X, Copy, Check, Shield, HardDrive, Hash, Calendar, Folder as FolderIcon, FileType, Tag, StickyNote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TelegramFile, TelegramFolder } from '../../types';
import { formatBytes } from '../../utils';

interface FileInfoPanelProps {
    file: TelegramFile;
    folders: TelegramFolder[];
    activeFolderId: number | null;
    onClose: () => void;
    tags?: string[];
    allTags?: string[];
    note?: string;
    onSetTags?: (tags: string[]) => void;
    onSetNote?: (note: string) => void;
}

function InfoRow({ icon: Icon, label, value, mono = false, copyable = false }: {
    icon: typeof HardDrive;
    label: string;
    value: string;
    mono?: boolean;
    copyable?: boolean;
}) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="flex items-start gap-3 py-2.5">
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-telegram-subtext/70" />
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-telegram-subtext/60">{label}</p>
                <p className={`mt-0.5 break-all text-sm text-telegram-text ${mono ? 'font-mono text-xs' : ''}`}>
                    {value}
                </p>
            </div>
            {copyable && (
                <button
                    onClick={handleCopy}
                    className="ml-1 mt-0.5 flex-shrink-0 rounded p-1 text-telegram-subtext transition hover:text-telegram-text"
                    title="Copy"
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            )}
        </div>
    );
}

export function FileInfoPanel({ file, folders, activeFolderId, onClose, tags = [], allTags = [], note = '', onSetTags, onSetNote }: FileInfoPanelProps) {
    const [tagDraft, setTagDraft] = useState('');
    const [noteDraft, setNoteDraft] = useState(note);
    const folderId = typeof file.folder_id === 'number' ? file.folder_id : activeFolderId;
    const folderName = folderId == null
        ? 'Saved Messages'
        : (folders.find(f => f.id === folderId)?.name ?? `Folder ${folderId}`);

    const date = file.created_at
        ? new Date(file.created_at).toLocaleString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })
        : '—';

    const ext = file.name.includes('.')
        ? file.name.split('.').pop()?.toUpperCase() ?? '—'
        : '—';

    useEffect(() => {
        setNoteDraft(note);
    }, [file.id, note]);

    const addTag = (rawTag: string) => {
        const nextTag = rawTag.trim().replace(/\s+/g, '-').toLowerCase();
        if (!nextTag || tags.includes(nextTag)) return;
        onSetTags?.([...tags, nextTag]);
        setTagDraft('');
    };

    const removeTag = (tag: string) => {
        onSetTags?.(tags.filter((item) => item !== tag));
    };

    return (
        <div
            className="absolute inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-telegram-border bg-telegram-surface shadow-2xl"
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b border-telegram-border px-4 py-3">
                <span className="text-sm font-semibold text-telegram-text">File Info</span>
                <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text">
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* File name + ext badge */}
            <div className="border-b border-telegram-border px-4 py-4">
                <div className="mb-2 flex items-start gap-2">
                    <span className="rounded-md border border-telegram-border bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase text-telegram-subtext">
                        {ext}
                    </span>
                    {file.is_encrypted && (
                        <span className="flex items-center gap-0.5 rounded-md border border-yellow-400/25 bg-yellow-400/10 px-1.5 py-0.5 text-[10px] text-yellow-300">
                            <Shield className="h-2.5 w-2.5" />
                            Encrypted
                        </span>
                    )}
                </div>
                <p className="break-all text-sm font-medium text-telegram-text leading-5">{file.name}</p>
            </div>

            {/* Metadata rows */}
            <div className="flex-1 overflow-y-auto px-4 divide-y divide-telegram-border/50">
                <InfoRow icon={HardDrive} label="Size" value={formatBytes(file.size)} />
                <InfoRow icon={Calendar} label="Date" value={date} />
                <InfoRow icon={FolderIcon} label="Folder" value={folderName} />
                <InfoRow icon={FileType} label="Type" value={file.mime_type ?? ext.toLowerCase()} />
                {file.sha256 && (
                    <InfoRow
                        icon={Hash}
                        label="SHA-256"
                        value={file.sha256}
                        mono
                        copyable
                    />
                )}
                <div className="py-3">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-telegram-subtext/60">
                        <Tag className="h-3.5 w-3.5" />
                        Tags
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {tags.length === 0 ? (
                            <span className="text-xs text-telegram-subtext">No tags yet</span>
                        ) : tags.map((tag) => (
                            <button
                                key={tag}
                                onClick={() => removeTag(tag)}
                                className="rounded-md border border-telegram-primary/20 bg-telegram-primary/10 px-2 py-1 text-xs text-telegram-primary transition hover:bg-red-500/10 hover:text-red-300"
                                title="Remove tag"
                            >
                                #{tag}
                            </button>
                        ))}
                    </div>
                    <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') addTag(tagDraft);
                        }}
                        onBlur={() => addTag(tagDraft)}
                        placeholder="Add tag..."
                        className="mt-3 w-full rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm text-telegram-text outline-none transition focus:border-telegram-primary/60"
                    />
                    {allTags.filter((tag) => !tags.includes(tag)).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {allTags.filter((tag) => !tags.includes(tag)).slice(0, 6).map((tag) => (
                                <button
                                    key={tag}
                                    onClick={() => addTag(tag)}
                                    className="rounded-md px-1.5 py-1 text-[11px] text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text"
                                >
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="py-3">
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-telegram-subtext/60">
                        <StickyNote className="h-3.5 w-3.5" />
                        Quick note
                    </div>
                    <textarea
                        value={noteDraft}
                        maxLength={500}
                        onChange={(event) => {
                            const next = event.target.value.slice(0, 500);
                            setNoteDraft(next);
                            onSetNote?.(next);
                        }}
                        placeholder="Private local note for this file..."
                        className="min-h-24 w-full resize-none rounded-lg border border-telegram-border bg-white/[0.03] px-3 py-2 text-sm leading-5 text-telegram-text outline-none transition focus:border-telegram-primary/60"
                    />
                    <p className="mt-1 text-right text-[10px] text-telegram-subtext">{noteDraft.length}/500</p>
                </div>
            </div>
        </div>
    );
}
