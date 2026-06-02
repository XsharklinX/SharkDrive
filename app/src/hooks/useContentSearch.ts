import { useState, useEffect, useRef } from 'react';
import { TelegramFile } from '../types';
import { isTextPreviewFile, isSvgFile, resolveFileFolderId } from '../utils';
import { tauriApi } from '../api/tauri';

const CONTENT_SEARCH_MAX_FILES = 30;     // scan at most 30 files
const CONTENT_SEARCH_MAX_BYTES = 500_000; // skip files larger than 500 KB
const CONTENT_FETCH_TIMEOUT = 5_000;

export interface ContentMatch {
    fileId: number;
    lineNumber: number;
    lineText: string;
}

async function fetchTextContent(file: TelegramFile, activeFolderId: number | null): Promise<string | null> {
    try {
        const folderId = resolveFileFolderId(file, activeFolderId);
        const token = await tauriApi.getStreamToken();
        const folderParam = folderId ?? 'home';
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT);
        const res = await fetch(
            `http://localhost:14200/stream/${folderParam}/${file.id}?token=${token}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        const text = await res.text();
        return text.slice(0, CONTENT_SEARCH_MAX_BYTES);
    } catch {
        return null;
    }
}

function findMatches(content: string, query: string): ContentMatch[] {
    const lines = content.split(/\r?\n/);
    const lowerQuery = query.toLowerCase();
    const matches: ContentMatch[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
            matches.push({ fileId: 0, lineNumber: i + 1, lineText: lines[i].trim().slice(0, 120) });
        }
    }
    return matches;
}

export function useContentSearch(
    query: string,
    files: TelegramFile[],
    activeFolderId: number | null,
    enabled: boolean,
) {
    const [matchingIds, setMatchingIds] = useState<Set<number>>(new Set());
    const [matchDetails, setMatchDetails] = useState<Map<number, ContentMatch[]>>(new Map());
    const [scanning, setScanning] = useState(false);
    const [scannedCount, setScannedCount] = useState(0);
    const cancelRef = useRef(false);

    useEffect(() => {
        if (!enabled || query.length < 3) {
            setMatchingIds(new Set());
            setMatchDetails(new Map());
            setScanning(false);
            setScannedCount(0);
            return;
        }

        const textFiles = files
            .filter(f => f.type !== 'folder' && (isTextPreviewFile(f.name) || isSvgFile(f.name)) && (f.size ?? 0) < CONTENT_SEARCH_MAX_BYTES)
            .slice(0, CONTENT_SEARCH_MAX_FILES);

        if (textFiles.length === 0) {
            setMatchingIds(new Set());
            setMatchDetails(new Map());
            return;
        }

        cancelRef.current = false;
        setScanning(true);
        setScannedCount(0);
        const ids = new Set<number>();
        const details = new Map<number, ContentMatch[]>();

        (async () => {
            for (const file of textFiles) {
                if (cancelRef.current) break;
                const content = await fetchTextContent(file, activeFolderId);
                if (cancelRef.current) break;
                setScannedCount(n => n + 1);
                if (content && content.toLowerCase().includes(query.toLowerCase())) {
                    ids.add(file.id);
                    const matches = findMatches(content, query).map(m => ({ ...m, fileId: file.id }));
                    details.set(file.id, matches.slice(0, 5));
                }
            }
            if (!cancelRef.current) {
                setMatchingIds(new Set(ids));
                setMatchDetails(new Map(details));
                setScanning(false);
            }
        })();

        return () => { cancelRef.current = true; };
    }, [query, files, activeFolderId, enabled]);

    return { matchingIds, matchDetails, scanning, scannedCount, total: Math.min(files.filter(f => isTextPreviewFile(f.name)).length, CONTENT_SEARCH_MAX_FILES) };
}
