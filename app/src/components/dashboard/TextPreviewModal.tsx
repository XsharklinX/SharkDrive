import { useEffect, useState } from 'react';
import { X, FileText, AlertTriangle } from 'lucide-react';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { resolveFileFolderId } from '../../utils';

interface TextPreviewModalProps {
    file: TelegramFile;
    activeFolderId: number | null;
    onClose: () => void;
}

type TextMode = 'plain' | 'json' | 'csv' | 'md' | 'xml' | 'svg';

const MAX_CHARS = 200_000;

function detectMode(name: string): TextMode {
    const lower = name.toLowerCase();
    if (lower.endsWith('.json')) return 'json';
    if (lower.endsWith('.csv')) return 'csv';
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
    if (lower.endsWith('.svg')) return 'svg';
    if (lower.endsWith('.xml') || lower.endsWith('.html') || lower.endsWith('.htm')) return 'xml';
    return 'plain';
}

// ── Renderers ────────────────────────────────────────────────────────────────

function JsonView({ raw }: { raw: string }) {
    const pretty = (() => {
        try { return JSON.stringify(JSON.parse(raw), null, 2); }
        catch { return raw; }
    })();
    return (
        <pre className="whitespace-pre-wrap break-all font-mono text-xs text-emerald-300 leading-5">
            {pretty}
        </pre>
    );
}

function CsvView({ raw }: { raw: string }) {
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const rows = lines.map(line => {
        // Simple CSV split (handles quoted fields with commas)
        const cols: string[] = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuote = !inQuote; continue; }
            if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; continue; }
            cur += ch;
        }
        cols.push(cur);
        return cols;
    });
    const headers = rows[0] ?? [];
    const body = rows.slice(1);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
                <thead>
                    <tr className="border-b border-telegram-border">
                        {headers.map((h, i) => (
                            <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-telegram-text">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {body.slice(0, 500).map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? 'bg-white/[0.015]' : ''}>
                            {row.map((cell, ci) => (
                                <td key={ci} className="max-w-[16rem] truncate px-3 py-1.5 text-telegram-subtext" title={cell}>
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {body.length > 500 && (
                <p className="px-3 py-2 text-xs text-telegram-subtext/60">
                    Showing first 500 of {body.length} rows.
                </p>
            )}
        </div>
    );
}

function MarkdownView({ raw }: { raw: string }) {
    // Minimal markdown: headers, bold, inline code, horizontal rules
    const lines = raw.split(/\r?\n/);
    return (
        <div className="space-y-1 text-sm leading-6 text-telegram-text">
            {lines.map((line, i) => {
                if (/^#{1}\s/.test(line)) return <h1 key={i} className="text-xl font-bold">{line.replace(/^#+\s/, '')}</h1>;
                if (/^#{2}\s/.test(line)) return <h2 key={i} className="text-lg font-bold text-telegram-primary">{line.replace(/^#+\s/, '')}</h2>;
                if (/^#{3,}\s/.test(line)) return <h3 key={i} className="font-semibold text-telegram-primary">{line.replace(/^#+\s/, '')}</h3>;
                if (/^---+$/.test(line.trim())) return <hr key={i} className="border-telegram-border" />;
                if (line.trim() === '') return <div key={i} className="h-2" />;
                // Inline: **bold**, `code`
                const rendered = line
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/`(.+?)`/g, '<code class="rounded bg-white/[0.08] px-1 font-mono text-xs text-telegram-primary">$1</code>');
                return <p key={i} dangerouslySetInnerHTML={{ __html: rendered }} />;
            })}
        </div>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function TextPreviewModal({ file, activeFolderId, onClose }: TextPreviewModalProps) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);

    const folderId = resolveFileFolderId(file, activeFolderId);
    const mode = detectMode(file.name);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setContent(null);

        tauriApi.getStreamToken().then(async (token) => {
            const folderParam = folderId ?? 'home';
            const url = `http://localhost:14200/stream/${folderParam}/${file.id}?token=${token}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            if (!cancelled) {
                if (text.length > MAX_CHARS) {
                    setContent(text.slice(0, MAX_CHARS));
                    setTruncated(true);
                } else {
                    setContent(text);
                }
                setLoading(false);
            }
        }).catch((e) => {
            if (!cancelled) {
                setError(String(e));
                setLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [file.id, folderId]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative mx-4 flex w-full max-w-3xl flex-col rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                style={{ maxHeight: '88vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex flex-shrink-0 items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-5 w-5 flex-shrink-0 text-telegram-primary" />
                        <span className="truncate text-sm font-semibold text-telegram-text">{file.name}</span>
                        <span className="rounded-md border border-telegram-border bg-white/[0.04] px-1.5 py-0.5 text-[10px] uppercase text-telegram-subtext">
                            {mode}
                        </span>
                    </div>
                    <button onClick={onClose} className="ml-3 rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-auto p-5">
                    {loading && (
                        <div className="flex h-40 items-center justify-center">
                            <div className="h-7 w-7 animate-spin rounded-full border-2 border-telegram-primary/30 border-t-telegram-primary" />
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                    {content !== null && (
                        <>
                            {truncated && (
                                <p className="mb-3 text-xs text-yellow-300/80">
                                    File is large — showing first {(MAX_CHARS / 1000).toFixed(0)} KB.
                                </p>
                            )}
                            {mode === 'json' && <JsonView raw={content} />}
                            {mode === 'csv'  && <CsvView  raw={content} />}
                            {mode === 'md'   && <MarkdownView raw={content} />}
                            {mode === 'svg'  && (
                                <div className="flex items-center justify-center rounded-lg bg-white/[0.03] p-4">
                                    <div
                                        className="max-h-[60vh] max-w-full"
                                        dangerouslySetInnerHTML={{
                                            __html: content
                                                .replace(/<script[\s\S]*?<\/script>/gi, '')
                                                .replace(/on\w+="[^"]*"/gi, '')
                                        }}
                                    />
                                </div>
                            )}
                            {mode === 'xml' && (
                                <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-emerald-300/90">
                                    {content}
                                </pre>
                            )}
                            {mode === 'plain' && (
                                <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-telegram-text/90">
                                    {content}
                                </pre>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
