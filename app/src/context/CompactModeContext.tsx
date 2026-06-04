import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'sharkdrive.compactMode.v1';

interface CompactModeContextType {
    isCompact: boolean;
    toggleCompact: () => void;
}

const CompactModeContext = createContext<CompactModeContextType>({
    isCompact: false,
    toggleCompact: () => {},
});

export function CompactModeProvider({ children }: { children: React.ReactNode }) {
    const [isCompact, setIsCompact] = useState<boolean>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored === 'true';
    });

    // Apply/remove the CSS class on <html> so CSS selectors work
    useEffect(() => {
        if (isCompact) {
            document.documentElement.classList.add('compact');
        } else {
            document.documentElement.classList.remove('compact');
        }
    }, [isCompact]);

    const toggleCompact = useCallback(() => {
        setIsCompact((prev) => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    }, []);

    return (
        <CompactModeContext.Provider value={{ isCompact, toggleCompact }}>
            {children}
        </CompactModeContext.Provider>
    );
}

export const useCompactMode = () => useContext(CompactModeContext);
