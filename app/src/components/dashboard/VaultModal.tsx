import { useMemo, useState } from 'react';
import { X, Download, HardDrive, FileImage, Film, Headphones, FileText, File } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { TelegramFile, TelegramFolder } from '../../types';
import { formatBytes, isImageFile, isVideoFile, isAudioFile, isPdfFile } from '../../utils';
import { tauriApi } from '../../api/tauri';

// ── Types ────────────────────────────────────────────────────────────────────

interface VaultModalProps {
    files: TelegramFile[];
    folders: TelegramFolder[];
    activity: { timestamp: string; type: string }[];
    onClose: () => void;
}

type FileCategory = 'images' | 'videos' | 'audio' | 'docs' | 'other';

const CATEGORIES: { key: FileCategory; label: string; icon: typeof FileImage; color: string }[] = [
    { key: 'images', label: 'Images',    icon: FileImage,   color: '#3b8ddf' },
    { key: 'videos', label: 'Videos',    icon: Film,        color: '#7c5cbf' },
    { key: 'audio',  label: 'Audio',     icon: Headphones,  color: '#2aabee' },
    { key: 'docs',   label: 'Docs',      icon: FileText,    color: '#4caf8e' },
    { key: 'other',  label: 'Other',     icon: File,        color: '#5c6370' },
];

function classifyFile(name: string): FileCategory {
    if (isImageFile(name)) return 'images';
    if (isVideoFile(name)) return 'videos';
    if (isAudioFile(name)) return 'audio';
    if (isPdfFile(name) || /\.(doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|json|xml)$/i.test(name)) return 'docs';
    return 'other';
}

// ── Donut Chart (pure SVG) ───────────────────────────────────────────────────
// r = 15.9155 → circumference ≈ 100

interface DonutSegment { pct: number; color: string; label: string }

function DonutChart({ segments }: { segments: DonutSegment[] }) {
    const CIRCUMFERENCE = 100;
    const R = 15.9155;
    let offset = 25; // start at top (90° rotation = -25% offset offset)

    const arcs = segments.map((seg) => {
        const dash = (seg.pct / 100) * CIRCUMFERENCE;
        const gap = CIRCUMFERENCE - dash;
        const currentOffset = CIRCUMFERENCE - offset;
        offset += (seg.pct / 100) * CIRCUMFERENCE;
        return { ...seg, dash, gap, offset: currentOffset };
    });

    return (
        <svg viewBox="0 0 42 42" className="h-36 w-36 -rotate-90" aria-hidden>
            {/* background track */}
            <circle cx="21" cy="21" r={R} fill="none" stroke="#ffffff08" strokeWidth="4" />
            {arcs.map((arc, i) =>
                arc.dash > 0 ? (
                    <circle
                        key={i}
                        cx="21" cy="21" r={R}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth="4"
                        strokeDasharray={`${arc.dash} ${arc.gap}`}
                        strokeDashoffset={arc.offset}
                        strokeLinecap="butt"
                    />
                ) : null
            )}
        </svg>
    );
}

// ── Mini Sparkline / Line Chart (pure SVG) ───────────────────────────────────

function TrendChart({ dailyCounts }: { dailyCounts: Map<string, number> }) {
    const W = 360;
    const H = 80;
    const PAD = { top: 8, bottom: 20, left: 8, right: 8 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    // Build last 30 days
    const days: { label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const mo = (d.getMonth() + 1).toString().padStart(2, '0');
        const da = d.getDate().toString().padStart(2, '0');
        days.push({ label: `${mo}/${da}`, count: dailyCounts.get(key) ?? 0 });
    }

    const maxCount = Math.max(...days.map(d => d.count), 1);

    const points = days.map((d, i) => {
        const x = PAD.left + (i / (days.length - 1)) * innerW;
        const y = PAD.top + innerH - (d.count / maxCount) * innerH;
        return `${x},${y}`;
    });

    const fillPoints = [
        `${PAD.left},${PAD.top + innerH}`,
        ...points,
        `${W - PAD.right},${PAD.top + innerH}`,
    ].join(' ');

    // X-axis label positions: show every 5th day
    const labels = days
        .map((d, i) => ({ ...d, i }))
        .filter((_, i) => i % 5 === 0 || i === 29);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
            <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b8ddf" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#3b8ddf" stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Fill area */}
            <polygon points={fillPoints} fill="url(#trendFill)" />
            {/* Line */}
            <polyline
                points={points.join(' ')}
                fill="none"
                stroke="#3b8ddf"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {/* X-axis labels */}
            {labels.map(({ label, i }) => {
                const x = PAD.left + (i / (days.length - 1)) * innerW;
                return (
                    <text
                        key={i}
                        x={x}
                        y={H - 4}
                        textAnchor="middle"
                        fontSize="7"
                        fill="#8899aa"
                    >
                        {label}
                    </text>
                );
            })}
        </svg>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function VaultModal({ files, folders, activity, onClose }: VaultModalProps) {
    const [exporting, setExporting] = useState(false);

    const folderNameMap = useMemo(() => {
        const m = new Map<number, string>();
        folders.forEach(f => m.set(f.id, f.name));
        return m;
    }, [folders]);

    // ── Compute stats ──────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const byCategory: Record<FileCategory, { count: number; bytes: number }> = {
            images: { count: 0, bytes: 0 },
            videos: { count: 0, bytes: 0 },
            audio:  { count: 0, bytes: 0 },
            docs:   { count: 0, bytes: 0 },
            other:  { count: 0, bytes: 0 },
        };
        const byFolder: Record<number, { name: string; bytes: number }> = {};
        const totalFiles = files.length;
        let totalBytes = 0;

        for (const f of files) {
            const cat = classifyFile(f.name);
            byCategory[cat].count++;
            byCategory[cat].bytes += f.size;
            totalBytes += f.size;

            const fid = f.folder_id ?? -1;
            if (!byFolder[fid]) {
                byFolder[fid] = {
                    name: fid === -1 ? 'Saved Messages' : (folderNameMap.get(fid) ?? `Folder ${fid}`),
                    bytes: 0,
                };
            }
            byFolder[fid].bytes += f.size;
        }

        const topFolders = Object.entries(byFolder)
            .map(([id, v]) => ({ id: Number(id), ...v }))
            .sort((a, b) => b.bytes - a.bytes)
            .slice(0, 5);

        const maxFolderBytes = topFolders[0]?.bytes ?? 1;

        const segments = CATEGORIES.map(cat => ({
            pct: totalBytes > 0 ? (byCategory[cat.key].bytes / totalBytes) * 100 : 0,
            color: cat.color,
            label: cat.label,
        }));

        return { totalFiles, totalBytes, byCategory, topFolders, maxFolderBytes, segments };
    }, [files, folderNameMap]);

    // ── Daily upload trend from activity ──────────────────────────────────
    const dailyCounts = useMemo(() => {
        const m = new Map<string, number>();
        // Count from activity entries of type 'upload'
        for (const entry of activity) {
            if (entry.type === 'upload') {
                const day = entry.timestamp.slice(0, 10);
                m.set(day, (m.get(day) ?? 0) + 1);
            }
        }
        // Also count from file created_at dates
        for (const f of files) {
            if (f.created_at) {
                const day = f.created_at.slice(0, 10);
                if (!m.has(day)) m.set(day, 0); // seed without double-counting
            }
        }
        return m;
    }, [activity, files]);

    // ── Export CSV ────────────────────────────────────────────────────────
    const handleExport = async () => {
        try {
            const path = await save({
                defaultPath: 'sharkdrive-export.csv',
                filters: [{ name: 'CSV', extensions: ['csv'] }],
            });
            if (!path) return;
            setExporting(true);
            await tauriApi.exportCsv(path);
            toast.success('Exported to ' + path.split(/[/\\]/).pop());
        } catch (e) {
            toast.error('Export failed: ' + String(e));
        } finally {
            setExporting(false);
        }
    };

    const handleExportManifest = async () => {
        try {
            const path = await save({
                defaultPath: 'sharkdrive-manifest.json',
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!path) return;
            setExporting(true);
            const manifest = {
                app: 'SharkDrive',
                exported_at: new Date().toISOString(),
                totals: {
                    folders: folders.length,
                    files: files.length,
                    bytes: stats.totalBytes,
                },
                folders: folders.map((folder) => ({
                    id: folder.id,
                    name: folder.name,
                    parent_id: folder.parent_id ?? null,
                    files: files
                        .filter((file) => file.folder_id === folder.id)
                        .map((file) => ({
                            id: file.id,
                            name: file.name,
                            size: file.size,
                            hash: file.sha256 ?? null,
                            created_at: file.created_at ?? null,
                            encrypted: Boolean(file.is_encrypted),
                            mime_type: file.mime_type ?? null,
                        })),
                })),
                saved_messages: files
                    .filter((file) => file.folder_id == null)
                    .map((file) => ({
                        id: file.id,
                        name: file.name,
                        size: file.size,
                        hash: file.sha256 ?? null,
                        created_at: file.created_at ?? null,
                        encrypted: Boolean(file.is_encrypted),
                        mime_type: file.mime_type ?? null,
                    })),
            };
            await tauriApi.exportManifestJson(path, JSON.stringify(manifest, null, 2));
            toast.success('Manifest exported to ' + path.split(/[/\\]/).pop());
        } catch (e) {
            toast.error('Manifest export failed: ' + String(e));
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative mx-4 w-full max-w-xl rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <HardDrive className="h-5 w-5 text-telegram-primary" />
                        <h2 className="text-base font-semibold text-telegram-text">Vault Dashboard</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="max-h-[80vh] overflow-y-auto p-6 space-y-6">
                    {/* ── Overview ── */}
                    <section>
                        <div className="mb-4 flex items-start gap-6">
                            {/* Donut */}
                            <div className="relative flex-shrink-0">
                                <DonutChart segments={stats.segments} />
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                    <span className="text-lg font-bold text-telegram-text leading-none">
                                        {stats.totalFiles.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-telegram-subtext mt-0.5">files</span>
                                </div>
                            </div>

                            {/* Legend + totals */}
                            <div className="flex-1 space-y-2">
                                <p className="text-sm text-telegram-subtext mb-3">
                                    Total <span className="font-semibold text-telegram-text">{formatBytes(stats.totalBytes)}</span> used
                                </p>
                                {CATEGORIES.map(cat => {
                                    const data = stats.byCategory[cat.key];
                                    const Icon = cat.icon;
                                    return (
                                        <div key={cat.key} className="flex items-center gap-2 text-sm">
                                            <div className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: cat.color }} />
                                            <Icon className="h-3.5 w-3.5 text-telegram-subtext flex-shrink-0" />
                                            <span className="flex-1 text-telegram-text">{cat.label}</span>
                                            <span className="tabular-nums text-telegram-subtext">{data.count.toLocaleString()}</span>
                                            <span className="w-16 text-right tabular-nums text-telegram-subtext text-xs">{formatBytes(data.bytes)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* ── Top Folders ── */}
                    {stats.topFolders.length > 0 && (
                        <section>
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-telegram-subtext">Top Folders</h3>
                            <div className="space-y-2.5">
                                {stats.topFolders.map(folder => {
                                    const pct = Math.round((folder.bytes / stats.maxFolderBytes) * 100);
                                    return (
                                        <div key={folder.id}>
                                            <div className="mb-1 flex items-center justify-between text-sm">
                                                <span className="truncate text-telegram-text max-w-[60%]">{folder.name}</span>
                                                <span className="tabular-nums text-telegram-subtext text-xs">{formatBytes(folder.bytes)}</span>
                                            </div>
                                            <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
                                                <div
                                                    className="h-full rounded-full bg-telegram-primary transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ── Trend ── */}
                    <section>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-telegram-subtext">
                            Upload Trend — last 30 days
                        </h3>
                        <div className="rounded-xl border border-telegram-border bg-white/[0.02] px-3 py-2">
                            <TrendChart dailyCounts={dailyCounts} />
                        </div>
                    </section>

                    {/* ── Export ── */}
                    <section className="border-t border-telegram-border pt-4">
                        <button
                            onClick={handleExport}
                            disabled={exporting || files.length === 0}
                            className="flex items-center gap-2 rounded-lg border border-telegram-border bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-telegram-text transition hover:bg-white/[0.07] disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            {exporting ? 'Exporting…' : 'Export CSV'}
                            {!exporting && files.length > 0 && (
                                <span className="ml-1 text-xs text-telegram-subtext">({files.length.toLocaleString()} files)</span>
                            )}
                        </button>
                        <button
                            onClick={handleExportManifest}
                            disabled={exporting || files.length === 0}
                            className="ml-2 inline-flex items-center gap-2 rounded-lg border border-telegram-border bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-telegram-text transition hover:bg-white/[0.07] disabled:opacity-50"
                        >
                            <FileText className="h-4 w-4" />
                            Manifest JSON
                        </button>
                        <p className="mt-1.5 text-xs text-telegram-subtext/60">
                            CSV exports tabular data. Manifest JSON includes folder tree, file ids, size, hash, date and encryption metadata.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    );
}
