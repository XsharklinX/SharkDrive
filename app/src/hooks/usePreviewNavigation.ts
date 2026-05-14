import { useCallback, useState } from 'react';
import { TelegramFile } from '../types';
import { isMediaFile, isPdfFile } from '../utils';

export function usePreviewNavigation() {
    const [previewFile, setPreviewFile] = useState<TelegramFile | null>(null);
    const [playingFile, setPlayingFile] = useState<TelegramFile | null>(null);
    const [pdfFile, setPdfFile] = useState<TelegramFile | null>(null);
    const [previewContextFiles, setPreviewContextFiles] = useState<TelegramFile[]>([]);
    const [previewContextIndex, setPreviewContextIndex] = useState(-1);

    const setActivePreviewFile = useCallback((file: TelegramFile) => {
        const isMedia = isMediaFile(file.name);
        const isPdf = isPdfFile(file.name);

        if (isMedia) {
            setPlayingFile(file);
            setPreviewFile(null);
            setPdfFile(null);
        } else if (isPdf) {
            setPdfFile(file);
            setPreviewFile(null);
            setPlayingFile(null);
        } else {
            setPreviewFile(file);
            setPlayingFile(null);
            setPdfFile(null);
        }
    }, []);

    const openPreview = useCallback((file: TelegramFile, orderedFiles: TelegramFile[]) => {
        const contextFiles = orderedFiles.filter((candidate) => candidate.type !== 'folder');
        const contextIndex = contextFiles.findIndex((candidate) => candidate.id === file.id);

        setPreviewContextFiles(contextFiles);
        setPreviewContextIndex(contextIndex);
        setActivePreviewFile(file);
    }, [setActivePreviewFile]);

    const closeAllPreviews = useCallback(() => {
        setPreviewFile(null);
        setPlayingFile(null);
        setPdfFile(null);
    }, []);

    const resetPreviewState = useCallback(() => {
        closeAllPreviews();
        setPreviewContextFiles([]);
        setPreviewContextIndex(-1);
    }, [closeAllPreviews]);

    const navigatePreview = useCallback((step: 1 | -1) => {
        if (previewContextFiles.length === 0) return;

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id;
        if (!currentFileId) return;

        const currentIndex = previewContextFiles.findIndex((candidate) => candidate.id === currentFileId);
        if (currentIndex === -1) return;

        const nextIndex = (currentIndex + step + previewContextFiles.length) % previewContextFiles.length;
        const nextFile = previewContextFiles[nextIndex];
        if (!nextFile) return;

        setPreviewContextIndex(nextIndex);
        setActivePreviewFile(nextFile);
    }, [pdfFile, playingFile, previewContextFiles, previewFile, setActivePreviewFile]);

    const handleNextPreview = useCallback(() => {
        navigatePreview(1);
    }, [navigatePreview]);

    const handlePrevPreview = useCallback(() => {
        navigatePreview(-1);
    }, [navigatePreview]);

    const previewNeighbors = useCallback(() => {
        if (previewContextFiles.length === 0) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentFileId = previewFile?.id ?? playingFile?.id ?? pdfFile?.id;
        if (!currentFileId) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const currentIndex = previewContextFiles.findIndex((candidate) => candidate.id === currentFileId);
        if (currentIndex === -1) {
            return { nextFile: null as TelegramFile | null, prevFile: null as TelegramFile | null };
        }

        const nextIndex = (currentIndex + 1) % previewContextFiles.length;
        const prevIndex = (currentIndex - 1 + previewContextFiles.length) % previewContextFiles.length;

        return {
            nextFile: previewContextFiles[nextIndex] || null,
            prevFile: previewContextFiles[prevIndex] || null,
        };
    }, [pdfFile, playingFile, previewContextFiles, previewFile]);

    return {
        previewFile,
        setPreviewFile,
        playingFile,
        setPlayingFile,
        pdfFile,
        setPdfFile,
        previewContextFiles,
        previewContextIndex,
        openPreview,
        closeAllPreviews,
        resetPreviewState,
        handleNextPreview,
        handlePrevPreview,
        previewNeighbors,
    };
}
