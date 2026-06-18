import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const STORAGE_KEY_ENABLED = 'sharkdrive.soundEnabled.v1';
const STORAGE_KEY_VOLUME = 'sharkdrive.soundVolume.v1';

type SoundType = 'success' | 'delete' | 'error' | 'notification' | 'click';

interface SoundContextType {
    soundEnabled: boolean;
    volume: number;
    setSoundEnabled: (v: boolean) => void;
    setVolume: (v: number) => void;
    play: (type: SoundType) => void;
}

const SoundContext = createContext<SoundContextType>({
    soundEnabled: true,
    volume: 0.5,
    setSoundEnabled: () => {},
    setVolume: () => {},
    play: () => {},
});

// All sounds synthesized with Web Audio API — no external files needed
function createTone(
    ctx: AudioContext,
    freq: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    startTime = 0,
) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration);
}

function playSound(ctx: AudioContext, type: SoundType, vol: number) {
    const v = Math.max(0.01, Math.min(1, vol));

    switch (type) {
        case 'success': {
            // Rising two-tone chime: C5 → E5
            createTone(ctx, 523, 0.12, v * 0.4, 'sine', 0);
            createTone(ctx, 659, 0.18, v * 0.35, 'sine', 0.1);
            break;
        }
        case 'delete': {
            // Descending soft tone: G4 → D4
            createTone(ctx, 392, 0.08, v * 0.25, 'triangle', 0);
            createTone(ctx, 294, 0.12, v * 0.2, 'triangle', 0.06);
            break;
        }
        case 'error': {
            // Two quick low buzzes
            createTone(ctx, 220, 0.08, v * 0.3, 'square', 0);
            createTone(ctx, 196, 0.1, v * 0.25, 'square', 0.12);
            break;
        }
        case 'notification': {
            // Bright single ping: A5
            createTone(ctx, 880, 0.2, v * 0.3, 'sine', 0);
            break;
        }
        case 'click': {
            // Very short white-noise-like tap
            createTone(ctx, 1200, 0.03, v * 0.15, 'triangle', 0);
            break;
        }
    }
}

export function SoundProvider({ children }: { children: React.ReactNode }) {
    const [soundEnabled, setSoundEnabledState] = useState(
        () => localStorage.getItem(STORAGE_KEY_ENABLED) !== 'false', // default ON
    );
    const [volume, setVolumeState] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY_VOLUME);
        return stored ? parseFloat(stored) : 0.5;
    });
    const ctxRef = useRef<AudioContext | null>(null);

    // Lazy-init AudioContext (browsers require user gesture)
    const getCtx = useCallback(() => {
        if (!ctxRef.current) {
            ctxRef.current = new AudioContext();
        }
        if (ctxRef.current.state === 'suspended') {
            ctxRef.current.resume();
        }
        return ctxRef.current;
    }, []);

    const setSoundEnabled = useCallback((v: boolean) => {
        setSoundEnabledState(v);
        localStorage.setItem(STORAGE_KEY_ENABLED, String(v));
    }, []);

    const setVolume = useCallback((v: number) => {
        setVolumeState(v);
        localStorage.setItem(STORAGE_KEY_VOLUME, String(v));
    }, []);

    const play = useCallback((type: SoundType) => {
        if (!soundEnabled) return;
        try {
            playSound(getCtx(), type, volume);
        } catch {
            // AudioContext not available — silent fallback
        }
    }, [soundEnabled, volume, getCtx]);

    // Cleanup AudioContext on unmount
    useEffect(() => {
        return () => { ctxRef.current?.close(); };
    }, []);

    return (
        <SoundContext.Provider value={{ soundEnabled, volume, setSoundEnabled, setVolume, play }}>
            {children}
        </SoundContext.Provider>
    );
}

export const useSound = () => useContext(SoundContext);
