import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Radio, Shield, Video, Shuffle, Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import { TelegramFile } from '../../types';
import { tauriApi } from '../../api/tauri';
import { isVideoFile, isAudioFile, resolveFileFolderId } from '../../utils';


interface MediaPlayerProps {
    file: TelegramFile;
    onClose: () => void;
    onNext?: () => void;
    onPrev?: () => void;
    currentIndex?: number;
    totalItems?: number;
    activeFolderId: number | null;
    playlist?: TelegramFile[];
    onSelectTrack?: (file: TelegramFile) => void;
}

export function MediaPlayer({ file, onClose, onNext, onPrev, currentIndex, totalItems, activeFolderId, playlist = [], onSelectTrack }: MediaPlayerProps) {
    const [streamToken, setStreamToken] = useState<string | null>(null);
    const [posterSrc, setPosterSrc] = useState<string | null>(null);
    const [shuffle, setShuffle] = useState(false);

    // Custom audio player state
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [seeking, setSeeking] = useState(false);

    useEffect(() => {
        tauriApi.getStreamToken().then(setStreamToken).catch(() => {});
    }, []);

    useEffect(() => {
        let cancelled = false;
        setPosterSrc(null);

        tauriApi.getThumbnail(file.id, resolveFileFolderId(file, activeFolderId))
            .then((result) => {
                if (!cancelled && result) setPosterSrc(result);
            })
            .catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [activeFolderId, file.id]);

    const folderId = resolveFileFolderId(file, activeFolderId);
    const folderIdParam = folderId !== null ? folderId.toString() : 'home';
    const streamUrl = streamToken
        ? `http://localhost:14200/stream/${folderIdParam}/${file.id}?token=${streamToken}`
        : null;

    const isVideo = isVideoFile(file.name);
    const isAudio = isAudioFile(file.name);
    const audioPlaylist = useMemo(() => playlist.filter((item) => isAudioFile(item.name)), [playlist]);

    // Reset audio state when track changes
    useEffect(() => {
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
    }, [file.id]);

    const formatTime = (secs: number) => {
        if (!isFinite(secs) || secs < 0) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const togglePlay = () => {
        const a = audioRef.current;
        if (!a) return;
        if (a.paused) { void a.play(); } else { a.pause(); }
    };

    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const t = Number(e.target.value);
        setCurrentTime(t);
        if (audioRef.current) audioRef.current.currentTime = t;
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = Number(e.target.value);
        setVolume(v);
        if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = false; }
        setIsMuted(false);
    };

    const toggleMute = () => {
        if (!audioRef.current) return;
        audioRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    // Space bar to play/pause audio
    useEffect(() => {
        if (!isAudio) return;
        const handle = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,button')) {
                e.preventDefault();
                togglePlay();
            }
        };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [isAudio, isPlaying]);

    const handleEnded = () => {
        if (isAudio && shuffle && audioPlaylist.length > 1 && onSelectTrack) {
            const alternatives = audioPlaylist.filter((item) => item.id !== file.id);
            const next = alternatives[Math.floor(Math.random() * alternatives.length)];
            if (next) {
                onSelectTrack(next);
                return;
            }
        }
        onNext?.();
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            const key = e.key.toLowerCase();

            if (e.key === 'ArrowRight' || key === 'l') {
                e.preventDefault();
                onNext?.();
                return;
            }

            if (e.key === 'ArrowLeft' || key === 'j') {
                e.preventDefault();
                onPrev?.();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-[linear-gradient(180deg,rgba(4,10,17,0.8),rgba(2,7,13,0.94))] p-4 backdrop-blur-lg animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div className="relative flex w-full max-w-6xl flex-col gap-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-telegram-border bg-telegram-surface/95 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.04] text-telegram-secondary">
                            {isVideo ? <Video className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-telegram-text">{file.name}</h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {file.is_encrypted && (
                            <div className="flex items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-2 text-xs text-yellow-200">
                                <Shield className="w-3.5 h-3.5" />
                                Encrypted
                            </div>
                        )}
                        {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 && (
                            <div className="rounded-full border border-telegram-border bg-telegram-surface/95 px-3 py-2 text-xs text-telegram-subtext">
                                Item {currentIndex + 1} of {totalItems}
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                            title="Close media player"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <button
                    onClick={onPrev}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                    title="Previous (ArrowLeft / J)"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                    onClick={onNext}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-telegram-border bg-telegram-surface/95 p-3 text-telegram-subtext transition hover:text-telegram-text"
                    title="Next (ArrowRight / L)"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>

                <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface/95 p-3 shadow-2xl">
                    {!streamUrl ? (
                        <div className="flex flex-col items-center gap-4 text-telegram-text">
                            {posterSrc ? (
                                <div className="overflow-hidden rounded-[1.4rem] border border-telegram-border bg-black">
                                    <img src={posterSrc} alt="Video thumbnail" className="max-h-[55vh] max-w-full object-contain opacity-95" />
                                </div>
                            ) : (
                                <div className="w-10 h-10 border-4 border-telegram-secondary/40 border-t-telegram-secondary rounded-full animate-spin"></div>
                            )}
                            <p className="text-sm font-medium">Preparing stream...</p>
                        </div>
                    ) : isVideo ? (
                        <video
                            src={streamUrl}
                            poster={posterSrc ?? undefined}
                            controls
                            autoPlay
                            playsInline
                            preload="metadata"
                            className="h-full w-full rounded-[1.4rem] bg-black object-contain"
                        />
                    ) : isAudio ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-8 rounded-[1.4rem] bg-[radial-gradient(circle_at_top,rgba(105,199,255,0.14),transparent_28%),linear-gradient(180deg,rgba(10,18,28,0.95),rgba(6,11,18,1))] px-8">
                            {/* Hidden audio element */}
                            <audio
                                ref={audioRef}
                                src={streamUrl}
                                autoPlay
                                preload="auto"
                                onPlay={() => setIsPlaying(true)}
                                onPause={() => setIsPlaying(false)}
                                onEnded={handleEnded}
                                onTimeUpdate={() => { if (!seeking && audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
                                onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); setIsPlaying(true); }}
                                onVolumeChange={() => { if (audioRef.current) { setIsMuted(audioRef.current.muted); setVolume(audioRef.current.volume); } }}
                            />
                            {/* Album art placeholder */}
                            <div className="flex h-36 w-36 items-center justify-center rounded-full border border-telegram-border/50 bg-telegram-surface shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14 text-telegram-primary/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                            </div>
                            {/* Custom controls */}
                            <div className="w-full max-w-sm space-y-4">
                                {/* Progress bar */}
                                <div className="space-y-1">
                                    <input
                                        type="range"
                                        min={0}
                                        max={duration || 1}
                                        step={0.1}
                                        value={currentTime}
                                        onMouseDown={() => setSeeking(true)}
                                        onMouseUp={() => setSeeking(false)}
                                        onChange={handleSeekChange}
                                        className="audio-range w-full accent-telegram-primary"
                                        style={{ height: 4 }}
                                    />
                                    <div className="flex justify-between text-[11px] tabular-nums text-telegram-subtext/70">
                                        <span>{formatTime(currentTime)}</span>
                                        <span>{formatTime(duration)}</span>
                                    </div>
                                </div>
                                {/* Play / Skip controls */}
                                <div className="flex items-center justify-center gap-5">
                                    <button
                                        onClick={onPrev}
                                        disabled={!onPrev}
                                        className="rounded-full p-2 text-telegram-subtext transition hover:text-telegram-text disabled:opacity-30"
                                        title="Previous track"
                                    >
                                        <SkipBack className="h-5 w-5" />
                                    </button>
                                    <button
                                        onClick={togglePlay}
                                        className="flex h-12 w-12 items-center justify-center rounded-full bg-telegram-primary text-black shadow-lg transition hover:opacity-90 active:scale-95"
                                        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                                    >
                                        {isPlaying
                                            ? <Pause className="h-5 w-5 fill-current" />
                                            : <Play className="ml-0.5 h-5 w-5 fill-current" />
                                        }
                                    </button>
                                    <button
                                        onClick={onNext}
                                        disabled={!onNext}
                                        className="rounded-full p-2 text-telegram-subtext transition hover:text-telegram-text disabled:opacity-30"
                                        title="Next track"
                                    >
                                        <SkipForward className="h-5 w-5" />
                                    </button>
                                </div>
                                {/* Volume */}
                                <div className="flex items-center gap-2">
                                    <button onClick={toggleMute} className="flex-shrink-0 text-telegram-subtext/70 transition hover:text-telegram-text">
                                        {isMuted || volume === 0
                                            ? <VolumeX className="h-4 w-4" />
                                            : <Volume2 className="h-4 w-4" />
                                        }
                                    </button>
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.02}
                                        value={isMuted ? 0 : volume}
                                        onChange={handleVolumeChange}
                                        className="w-full accent-telegram-primary"
                                        style={{ height: 3 }}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-telegram-text">Unsupported media type</div>
                    )}
                </div>

                <div className="flex items-center justify-between rounded-lg border border-telegram-border bg-white/[0.03] px-4 py-3">
                    <div>
                        <h3 className="text-sm font-semibold text-telegram-text">{file.name}</h3>
                        <p className="text-xs text-telegram-subtext">Streaming from Telegram</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAudio && audioPlaylist.length > 1 && (
                            <button
                                onClick={() => setShuffle((value) => !value)}
                                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${shuffle ? 'border-telegram-primary/40 bg-telegram-primary/15 text-telegram-primary' : 'border-telegram-border text-telegram-subtext hover:text-telegram-text'}`}
                                title="Shuffle playlist"
                            >
                                <Shuffle className="h-3.5 w-3.5" />
                                Shuffle
                            </button>
                        )}
                        <p className="text-xs text-telegram-subtext">
                            {typeof currentIndex === 'number' && typeof totalItems === 'number' && totalItems > 0 ? `${currentIndex + 1}/${totalItems}` : 'Live'}
                        </p>
                    </div>
                </div>

                {isAudio && audioPlaylist.length > 1 && (
                    <div className="max-h-44 overflow-auto rounded-lg border border-telegram-border bg-telegram-surface/90 p-2 custom-scrollbar">
                        {audioPlaylist.map((track) => (
                            <button
                                key={track.id}
                                onClick={() => onSelectTrack?.(track)}
                                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition ${track.id === file.id ? 'bg-telegram-primary/15 text-telegram-primary' : 'text-telegram-subtext hover:bg-white/[0.04] hover:text-telegram-text'}`}
                            >
                                <span className="truncate">{track.name}</span>
                                <span className="ml-3 shrink-0">{track.sizeStr}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
