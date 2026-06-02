import { useState } from 'react';
import { X, Image as ImageIcon, Zap } from 'lucide-react';
import { formatBytes } from '../../utils';

interface ImageCompressDialogProps {
    files: { path: string; name: string; size: number }[];
    onConfirm: (quality: number, maxDimension: number) => void;
    onSkip: () => void;
    onClose: () => void;
}

const PRESETS = [
    { label: 'High (90%)', quality: 90, maxDim: 0,    desc: 'Near-original quality, smaller file' },
    { label: 'Medium (75%)', quality: 75, maxDim: 2560, desc: 'Good balance of quality and size' },
    { label: 'Low (50%)',  quality: 50, maxDim: 1920, desc: 'Smaller file, visible compression' },
];

function estimatedSize(original: number, quality: number): string {
    // Rough heuristic: JPEG quality 90 ≈ 60%, q75 ≈ 40%, q50 ≈ 25% of PNG/original
    const factor = quality >= 85 ? 0.6 : quality >= 65 ? 0.4 : 0.25;
    return formatBytes(original * factor);
}

export function ImageCompressDialog({ files, onConfirm, onSkip, onClose }: ImageCompressDialogProps) {
    const [quality, setQuality] = useState(75);
    const [maxDimension, setMaxDimension] = useState(2560);
    const totalSize = files.reduce((s, f) => s + f.size, 0);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative mx-4 w-full max-w-md rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Zap className="h-5 w-5 text-telegram-primary" />
                        <div>
                            <h2 className="text-base font-semibold text-telegram-text">Compress before upload?</h2>
                            <p className="text-xs text-telegram-subtext">
                                {files.length} image{files.length !== 1 ? 's' : ''} · {formatBytes(totalSize)} total
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.06] hover:text-telegram-text">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Preset buttons */}
                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-telegram-subtext/60">Quick presets</p>
                        <div className="space-y-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.label}
                                    onClick={() => { setQuality(p.quality); setMaxDimension(p.maxDim); }}
                                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                                        quality === p.quality && maxDimension === p.maxDim
                                            ? 'border-telegram-primary/50 bg-telegram-primary/10 text-telegram-text'
                                            : 'border-telegram-border text-telegram-subtext hover:bg-white/[0.04] hover:text-telegram-text'
                                    }`}
                                >
                                    <span>
                                        <span className="font-medium">{p.label}</span>
                                        <span className="ml-2 text-[11px] opacity-70">{p.desc}</span>
                                    </span>
                                    <span className="tabular-nums text-xs opacity-60">
                                        ~{estimatedSize(totalSize, p.quality)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Manual controls */}
                    <div className="space-y-3 rounded-lg border border-telegram-border bg-white/[0.02] p-4">
                        <div>
                            <div className="mb-1 flex justify-between text-xs text-telegram-subtext">
                                <span>Quality</span>
                                <span className="tabular-nums font-mono">{quality}%</span>
                            </div>
                            <input
                                type="range" min={20} max={100} step={5} value={quality}
                                onChange={e => setQuality(Number(e.target.value))}
                                className="w-full accent-telegram-primary"
                            />
                        </div>
                        <div>
                            <div className="mb-1 flex justify-between text-xs text-telegram-subtext">
                                <span>Max dimension</span>
                                <span className="tabular-nums font-mono">{maxDimension === 0 ? 'No resize' : `${maxDimension}px`}</span>
                            </div>
                            <input
                                type="range" min={0} max={4096} step={256} value={maxDimension}
                                onChange={e => setMaxDimension(Number(e.target.value))}
                                className="w-full accent-telegram-primary"
                            />
                        </div>
                        <p className="text-[11px] text-telegram-subtext/60">
                            Estimated after compression: <span className="text-telegram-subtext">{estimatedSize(totalSize, quality)}</span>
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={onSkip}
                            className="flex-1 rounded-lg border border-telegram-border px-3 py-2.5 text-sm text-telegram-subtext transition hover:bg-white/[0.04] hover:text-telegram-text"
                        >
                            Upload original
                        </button>
                        <button
                            onClick={() => onConfirm(quality, maxDimension)}
                            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-telegram-primary px-3 py-2.5 text-sm font-medium text-black transition hover:opacity-90"
                        >
                            <ImageIcon className="h-4 w-4" />
                            Compress & upload
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
