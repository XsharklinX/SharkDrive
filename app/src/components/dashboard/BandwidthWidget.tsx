import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { BandwidthStats } from '../../types';
import { formatBytes } from '../../utils';

interface BandwidthWidgetProps {
    bandwidth: BandwidthStats | null;
}

export function BandwidthWidget({ bandwidth }: BandwidthWidgetProps) {
    const [expanded, setExpanded] = useState(false);
    const [upSpeed, setUpSpeed] = useState(0);
    const [downSpeed, setDownSpeed] = useState(0);
    const prevRef = useRef<BandwidthStats | null>(null);
    const lastTickRef = useRef<number>(Date.now());

    useEffect(() => {
        if (!bandwidth) return;

        const now = Date.now();
        const dt = (now - lastTickRef.current) / 1000;

        if (prevRef.current && dt > 0) {
            const up = Math.max(0, bandwidth.up_bytes - prevRef.current.up_bytes);
            const down = Math.max(0, bandwidth.down_bytes - prevRef.current.down_bytes);
            setUpSpeed(Math.round(up / dt));
            setDownSpeed(Math.round(down / dt));
        }

        prevRef.current = bandwidth;
        lastTickRef.current = now;
    }, [bandwidth]);

    if (!bandwidth) return null;

    const totalBytes = bandwidth.up_bytes + bandwidth.down_bytes;
    const limit = 250 * 1024 * 1024 * 1024;
    const percent = Math.min((totalBytes / limit) * 100, 100);
    const upPercent = totalBytes > 0 ? (bandwidth.up_bytes / totalBytes) * 100 : 0;
    const isActive = upSpeed > 0 || downSpeed > 0;

    return (
        <div
            className="mt-3 cursor-pointer select-none rounded-2xl border border-telegram-border bg-white/[0.02] p-3"
            onClick={() => setExpanded((value) => !value)}
            title="Click to expand usage details"
        >
            <div className="mb-1.5 flex items-center justify-between text-xs text-telegram-subtext">
                <div className="flex items-center gap-1">
                    <Activity className={`h-3 w-3 ${isActive ? 'animate-pulse text-telegram-primary' : ''}`} />
                    <span>Usage Today</span>
                </div>
                <span className="text-[10px] opacity-60">{expanded ? '^' : 'v'}</span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-telegram-border/70">
                <div className="flex h-full overflow-hidden rounded-full transition-all duration-700">
                    <div
                        className="h-full bg-telegram-primary transition-all duration-700"
                        style={{ width: `${upPercent.toFixed(1)}%` }}
                    />
                    <div
                        className="h-full bg-blue-400 transition-all duration-700"
                        style={{ width: `${(percent - upPercent).toFixed(1)}%` }}
                    />
                </div>
            </div>

            <div className="mt-1 flex justify-between text-[10px] opacity-70">
                <span>{formatBytes(totalBytes)}</span>
                <span>/ 250 GB</span>
            </div>

            {expanded && (
                <div className="mt-2 space-y-1 border-t border-telegram-border pt-2">
                    <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1 text-telegram-primary">
                            <ArrowUp className="h-3 w-3" />
                            <span>Upload</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-telegram-subtext">{formatBytes(bandwidth.up_bytes)}</span>
                            {upSpeed > 0 && (
                                <span className="font-medium text-telegram-primary">{formatBytes(upSpeed)}/s</span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1 text-blue-400">
                            <ArrowDown className="h-3 w-3" />
                            <span>Download</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-telegram-subtext">{formatBytes(bandwidth.down_bytes)}</span>
                            {downSpeed > 0 && (
                                <span className="font-medium text-blue-400">{formatBytes(downSpeed)}/s</span>
                            )}
                        </div>
                    </div>

                    {bandwidth.date && (
                        <div className="flex items-center gap-1 pt-1 text-[10px] text-telegram-subtext/60">
                            <RefreshCw className="h-2.5 w-2.5" />
                            <span>Resets daily - {bandwidth.date}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
