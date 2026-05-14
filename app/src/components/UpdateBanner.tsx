import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, RefreshCw } from 'lucide-react';

interface UpdateBannerProps {
    available: boolean;
    version: string | null;
    downloading: boolean;
    progress: number;
    onUpdate: () => void;
    onDismiss: () => void;
}

export function UpdateBanner({
    available,
    version,
    downloading,
    progress,
    onUpdate,
    onDismiss
}: UpdateBannerProps) {
    return (
        <AnimatePresence>
            {available && (
                <motion.div
                    initial={{ opacity: 0, y: -50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -50 }}
                    className="fixed left-0 right-0 top-0 z-50 border-b border-telegram-border bg-telegram-primary/95 p-3 shadow-lg backdrop-blur-sm"
                >
                    <div className="flex items-center justify-center gap-4 max-w-screen-lg mx-auto">
                        <span className="text-sm font-medium text-white">
                            {downloading ? (
                                <>Downloading SharkDrive update... {progress}%</>
                            ) : (
                                <>SharkDrive {version} is available.</>
                            )}
                        </span>

                        {downloading ? (
                            <div className="flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 text-white animate-spin" />
                                <div className="w-32 h-2 bg-white/30 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-white rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={onUpdate}
                                className="flex items-center gap-2 rounded-full bg-white px-4 py-1.5 font-semibold text-telegram-primary transition-colors hover:bg-white/90 shadow-md"
                            >
                                <Download className="w-4 h-4" />
                                Update
                            </button>
                        )}

                        {!downloading && (
                            <button
                                onClick={onDismiss}
                                className="p-1 text-white/70 hover:text-white transition-colors"
                                title="Dismiss"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
