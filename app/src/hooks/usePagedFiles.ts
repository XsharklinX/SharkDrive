import { useState, useEffect, useCallback, useRef } from 'react';
import { TelegramFile } from '../types';
import { tauriApi } from '../api/tauri';
import { formatBytes } from '../utils';

const PAGE_SIZE = 50;

function mapFile(f: TelegramFile): TelegramFile {
    return { ...f, sizeStr: f.sizeStr || formatBytes(f.size), type: (f.icon_type === 'folder' ? 'folder' : 'file') as 'folder' | 'file' };
}

interface PagedState {
    files: TelegramFile[];
    nextOffsetId: number | null;
    hasMore: boolean;
    isLoadingFirst: boolean;
    isLoadingMore: boolean;
    error: string | null;
}

const EMPTY: PagedState = {
    files: [],
    nextOffsetId: null,
    hasMore: false,
    isLoadingFirst: false,
    isLoadingMore: false,
    error: null,
};

export function usePagedFiles(
    folderId: number | null,
    enabled: boolean,
    cachedFiles: TelegramFile[],
    version = 0,
) {
    const [state, setState] = useState<PagedState>(EMPTY);
    const loadingRef = useRef(false);
    const mountRef = useRef(0);

    // Reset and load first page whenever folder changes OR version bumps (after mutation)
    useEffect(() => {
        if (!enabled) {
            setState(EMPTY);
            return;
        }

        const mountId = ++mountRef.current;
        setState(() => ({ ...EMPTY, files: cachedFiles, isLoadingFirst: cachedFiles.length === 0 }));
        loadingRef.current = false;

        let cancelled = false;

        (async () => {
            if (loadingRef.current) return;
            loadingRef.current = true;
            setState(prev => ({ ...prev, isLoadingFirst: true, error: null }));
            try {
                const result = await tauriApi.getFilesPaged(folderId, 0, PAGE_SIZE);
                if (cancelled || mountId !== mountRef.current) return;
                setState({
                    files: result.files.map(mapFile),
                    nextOffsetId: result.next_offset_id,
                    hasMore: result.has_more,
                    isLoadingFirst: false,
                    isLoadingMore: false,
                    error: null,
                });
            } catch (e) {
                if (cancelled || mountId !== mountRef.current) return;
                // On error, keep showing cached files without blocking the UI
                setState(prev => ({ ...prev, isLoadingFirst: false, error: String(e) }));
            } finally {
                loadingRef.current = false;
            }
        })();

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folderId, enabled, version]);

    const loadMore = useCallback(async () => {
        setState(prev => {
            if (!prev.hasMore || prev.isLoadingMore || prev.nextOffsetId === null) return prev;
            return { ...prev, isLoadingMore: true };
        });

        // Read current offset from state snapshot
        setState(current => {
            if (!current.hasMore || current.nextOffsetId === null) return current;

            const offsetId = current.nextOffsetId;
            const mountId = mountRef.current;

            tauriApi.getFilesPaged(folderId, offsetId, PAGE_SIZE).then(result => {
                setState(prev => {
                    if (mountId !== mountRef.current) return prev;
                    return {
                        ...prev,
                        files: [...prev.files, ...result.files.map(mapFile)],
                        nextOffsetId: result.next_offset_id,
                        hasMore: result.has_more,
                        isLoadingMore: false,
                    };
                });
            }).catch(() => {
                setState(prev => ({ ...prev, isLoadingMore: false }));
            });

            return current;
        });
    }, [folderId]);

    /** Call after an upload/delete to refresh from page 1 */
    const refresh = useCallback(() => {
        const mountId = ++mountRef.current;
        loadingRef.current = false;
        setState(prev => ({ ...prev, isLoadingFirst: true, error: null }));

        tauriApi.getFilesPaged(folderId, 0, PAGE_SIZE).then(result => {
            setState(prev => {
                if (mountId !== mountRef.current) return prev;
                return {
                    files: result.files.map(mapFile),
                    nextOffsetId: result.next_offset_id,
                    hasMore: result.has_more,
                    isLoadingFirst: false,
                    isLoadingMore: false,
                    error: null,
                };
            });
        }).catch(e => {
            setState(prev => ({ ...prev, isLoadingFirst: false, error: String(e) }));
        });
    }, [folderId]);

    return { ...state, loadMore, refresh };
}
