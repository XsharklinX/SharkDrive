import { useState, useEffect } from 'react';
import { Upload } from 'lucide-react';

/**
 * Shows a visual overlay when the user drags external files over the window.
 * Since dragDropEnabled=true, Tauri handles the actual drop via tauri://drag-drop.
 * This component only provides visual feedback during the drag hover phase.
 */
export function ExternalDropBlocker({ onUploadClick }: { onUploadClick: () => void }) {
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        let hideTimeout: ReturnType<typeof setTimeout>;

        const handleDragOver = (e: DragEvent) => {
            if (e.dataTransfer?.types.includes('Files')) {
                e.preventDefault();
                setIsDragging(true);
                clearTimeout(hideTimeout);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            if (e.clientX <= 0 || e.clientY <= 0 ||
                e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                hideTimeout = setTimeout(() => setIsDragging(false), 100);
            }
        };

        const handleDrop = () => {
            hideTimeout = setTimeout(() => setIsDragging(false), 300);
        };

        document.addEventListener('dragover', handleDragOver, true);
        document.addEventListener('dragleave', handleDragLeave, true);
        document.addEventListener('drop', handleDrop, true);

        return () => {
            document.removeEventListener('dragover', handleDragOver, true);
            document.removeEventListener('dragleave', handleDragLeave, true);
            document.removeEventListener('drop', handleDrop, true);
            clearTimeout(hideTimeout);
        };
    }, [onUploadClick]);

    if (!isDragging) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0 bg-telegram-primary/10 border-4 border-dashed border-telegram-primary/60 rounded-2xl m-4 transition-all" />
            <div className="glass bg-telegram-surface/90 border border-telegram-primary/40 rounded-2xl p-8 max-w-xs mx-4 shadow-2xl text-center relative">
                <div className="w-16 h-16 rounded-full bg-telegram-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8 text-telegram-primary" />
                </div>
                <h3 className="text-lg font-semibold text-telegram-text mb-1">Drop to Upload</h3>
                <p className="text-telegram-subtext text-sm">Release to add files to SharkDrive</p>
            </div>
        </div>
    );
}
