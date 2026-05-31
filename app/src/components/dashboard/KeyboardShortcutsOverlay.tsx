import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, type KeyboardShortcutMap } from '../../hooks/useKeyboardShortcuts';
import { useLanguage } from '../../context/LanguageContext';

interface KeyboardShortcutsOverlayProps {
    shortcuts?: Partial<KeyboardShortcutMap>;
    onClose: () => void;
}

const EXTRA_SHORTCUTS = [
    { keys: '?', label: 'Show keyboard shortcuts' },
    { keys: '+  /  −', label: 'Zoom in / out in image preview' },
    { keys: '0', label: 'Reset zoom to 100%' },
    { keys: 'Space', label: 'Play / pause audio' },
    { keys: 'J  /  L', label: 'Previous / next file in preview' },
    { keys: 'Ctrl+Z', label: 'Undo last rename' },
];

const CATEGORY_SHORTCUTS = [
    { category: 'Files', color: 'text-telegram-primary', items: [
        { action: 'selectAll' as const },
        { action: 'delete' as const },
        { action: 'rename' as const },
        { action: 'open' as const },
        { action: 'search' as const },
        { action: 'escape' as const },
    ]},
];

function ShortcutChip({ keys }: { keys: string }) {
    return (
        <div className="flex items-center gap-1">
            {keys.split('/').map((k, i) => (
                <>
                    {i > 0 && <span key={`sep-${i}`} className="text-telegram-subtext/40 text-xs">/</span>}
                    {k.trim().split('+').map((part, j) => (
                        <>
                            {j > 0 && <span key={`plus-${j}`} className="text-telegram-subtext/40 text-[10px]">+</span>}
                            <kbd
                                key={`key-${j}`}
                                className="rounded-md border border-telegram-border bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-telegram-text"
                            >
                                {part.trim()}
                            </kbd>
                        </>
                    ))}
                </>
            ))}
        </div>
    );
}

export function KeyboardShortcutsOverlay({ shortcuts = {}, onClose }: KeyboardShortcutsOverlayProps) {
    const effectiveShortcuts = { ...DEFAULT_SHORTCUTS, ...shortcuts };
    const { lang } = useLanguage();

    useEffect(() => {
        const handle = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === '?') onClose(); };
        window.addEventListener('keydown', handle);
        return () => window.removeEventListener('keydown', handle);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative mx-4 w-full max-w-md rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border px-6 py-4">
                    <div className="flex items-center gap-3">
                        <Keyboard className="h-5 w-5 text-telegram-primary" />
                        <h2 className="text-base font-semibold text-telegram-text">Keyboard Shortcuts</h2>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-telegram-subtext hover:bg-white/[0.06] hover:text-telegram-text transition">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
                    {/* File actions */}
                    <div>
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-telegram-subtext/60">File actions</p>
                        <div className="space-y-2">
                            {CATEGORY_SHORTCUTS[0].items.map(({ action }) => (
                                <div key={action} className="flex items-center justify-between">
                                    <span className="text-sm text-telegram-text">{SHORTCUT_LABELS[action]}</span>
                                    <ShortcutChip keys={effectiveShortcuts[action]} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="h-px bg-telegram-border" />

                    {/* Additional */}
                    <div>
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-telegram-subtext/60">Navigation & media</p>
                        <div className="space-y-2">
                            {EXTRA_SHORTCUTS.map(({ keys, label }) => (
                                <div key={label} className="flex items-center justify-between">
                                    <span className="text-sm text-telegram-text">{label}</span>
                                    <ShortcutChip keys={keys} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="text-center text-xs text-telegram-subtext/50">
                        {lang === 'es' ? 'Presiona ' : 'Press '}
                        <kbd className="font-mono">?</kbd>
                        {lang === 'es' ? ' o ' : ' or '}
                        <kbd className="font-mono">Esc</kbd>
                        {lang === 'es' ? ' para cerrar' : ' to close'}
                    </p>
                </div>
            </div>
        </div>
    );
}
