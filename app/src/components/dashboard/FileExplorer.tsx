import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCheck, List, LayoutGrid, RefreshCcw } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileCard } from './FileCard';
import { EmptyState } from './EmptyState';
import { TelegramFile } from '../../types';
import { ContextMenu } from './ContextMenu';
import { FileListItem } from './FileListItem';
import { GalleryView } from './GalleryView';

type SortField = 'name' | 'size' | 'date';
type SortDirection = 'asc' | 'desc';
type FilterType = 'all' | 'image' | 'video' | 'audio' | 'doc' | 'other';
type ViewMode = 'grid' | 'list' | 'gallery';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'heic']);
const VIDEO_EXT = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'epub']);

const FILTER_LABELS: Record<FilterType, string> = {
    all: 'All',
    image: 'Images',
    video: 'Videos',
    audio: 'Audio',
    doc: 'Docs',
    other: 'Other',
};

function getFilterType(name: string): FilterType {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (IMAGE_EXT.has(ext)) return 'image';
    if (VIDEO_EXT.has(ext)) return 'video';
    if (AUDIO_EXT.has(ext)) return 'audio';
    if (DOC_EXT.has(ext)) return 'doc';
    return 'other';
}

interface FileExplorerProps {
    files: TelegramFile[];
    loading: boolean;
    error: Error | null;
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
    selectedIds: number[];
    selectionMode: boolean;
    activeFolderId: number | null;
    onFileClick: (e: React.MouseEvent, id: number) => void;
    onDelete: (file: TelegramFile) => void;
    onDownload: (file: TelegramFile) => void;
    onPreview: (file: TelegramFile, orderedFiles?: TelegramFile[]) => void;
    onManualUpload: () => void;
    onSelectionClear: () => void;
    onToggleSelection: (id: number) => void;
    onDrop?: (e: React.DragEvent, folderId: number) => void;
    onDragStart?: (fileId: number) => void;
    onDragEnd?: () => void;
    favoriteIds: Set<number>;
    onToggleFavorite: (id: number) => void;
    onRename: (file: TelegramFile) => void;
    onShareLink: (file: TelegramFile) => void;
    onOpenFolder?: (file: TelegramFile) => void;
    onSelectVisible?: () => void;
}

function useGridColumns(containerRef: React.RefObject<HTMLDivElement | null>) {
    const [columns, setColumns] = useState(4);
    const [containerWidth, setContainerWidth] = useState(800);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateColumns = () => {
            const width = containerRef.current?.clientWidth || 800;
            setContainerWidth(width);
            if (width < 640) setColumns(2);
            else if (width < 940) setColumns(3);
            else if (width < 1260) setColumns(4);
            else if (width < 1600) setColumns(5);
            else setColumns(6);
        };

        updateColumns();
        const observer = new ResizeObserver(updateColumns);
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [containerRef]);

    return { columns, containerWidth };
}

function ExplorerUploadCard({ onManualUpload, height }: { onManualUpload: () => void; height: number }) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onManualUpload();
            }}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-telegram-border bg-white/[0.02] text-telegram-subtext transition hover:border-telegram-primary/30 hover:bg-white/[0.03] hover:text-telegram-text"
            style={{ height: `${height}px` }}
        >
            <span className="text-sm font-medium text-telegram-text">Add files</span>
            <span className="mt-1 text-xs text-telegram-subtext">Upload to this folder</span>
        </button>
    );
}

export function FileExplorer({
    files, loading, error, viewMode, setViewMode, selectedIds, selectionMode, activeFolderId,
    onFileClick, onDelete, onDownload, onPreview, onManualUpload, onSelectionClear, onToggleSelection, onDrop, onDragStart, onDragEnd,
    favoriteIds, onToggleFavorite, onRename, onShareLink, onOpenFolder, onSelectVisible,
}: FileExplorerProps) {
    const [sortField, setSortField] = useState<SortField>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [filterType, setFilterType] = useState<FilterType>('all');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: TelegramFile } | null>(null);

    const parentRef = useRef<HTMLDivElement>(null);
    const { columns, containerWidth } = useGridColumns(parentRef);

    const gap = 12;
    const cardWidth = (containerWidth - (gap * (columns - 1))) / columns;
    const cardHeight = Math.max(cardWidth * 0.58, 156);
    const rowHeight = cardHeight + gap;

    const handleContextMenu = useCallback((e: React.MouseEvent, file: TelegramFile) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, file });
    }, []);

    const sortedFiles = useMemo(() => {
        const filtered = filterType === 'all'
            ? files
            : files.filter((file) => file.type === 'folder' || getFilterType(file.name) === filterType);

        return [...filtered].sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'size':
                    comparison = (a.size || 0) - (b.size || 0);
                    break;
                case 'date':
                    comparison = (a.created_at || '').localeCompare(b.created_at || '');
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [files, sortField, sortDirection, filterType]);

    const filterCounts = useMemo(() => {
        const counts: Record<FilterType, number> = {
            all: files.length,
            image: 0,
            video: 0,
            audio: 0,
            doc: 0,
            other: 0,
        };

        for (const file of files) {
            if (file.type === 'folder') continue;
            counts[getFilterType(file.name)] += 1;
        }

        return counts;
    }, [files]);

    const handlePreviewRequest = useCallback((file: TelegramFile) => {
        onPreview(file, sortedFiles);
    }, [onPreview, sortedFiles]);

    const gridRows = useMemo(() => {
        const rows: (TelegramFile | 'upload')[][] = [];
        const itemsWithUpload: (TelegramFile | 'upload')[] = [...sortedFiles, 'upload'];
        for (let index = 0; index < itemsWithUpload.length; index += columns) {
            rows.push(itemsWithUpload.slice(index, index + columns));
        }
        return rows;
    }, [sortedFiles, columns]);

    const listItems = useMemo(() => sortedFiles, [sortedFiles]);

    const hasCustomizedControls = sortField !== 'name' || sortDirection !== 'asc' || filterType !== 'all';

    const gridVirtualizer = useVirtualizer({
        count: gridRows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => rowHeight, [rowHeight]),
        overscan: 2,
        gap,
    });

    useEffect(() => {
        gridVirtualizer.measure();
    }, [rowHeight, gridVirtualizer]);

    const listVirtualizer = useVirtualizer({
        count: listItems.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 64,
        overscan: 5,
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const resetExplorerControls = () => {
        setSortField('name');
        setSortDirection('asc');
        setFilterType('all');
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-35" />;
        return sortDirection === 'asc'
            ? <ArrowUp className="h-3 w-3 text-telegram-primary" />
            : <ArrowDown className="h-3 w-3 text-telegram-primary" />;
    };

    if (loading) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-telegram-subtext">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-telegram-primary/40 border-t-telegram-primary"></div>
                <p className="text-sm font-medium text-telegram-text">Loading your files...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-1 items-center justify-center p-6">
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-6 py-5 text-center text-red-200">
                    Error loading files
                </div>
            </div>
        );
    }

    if (files.length === 0) {
        return (
            <div className="flex-1 overflow-auto p-6">
                <EmptyState onUpload={onManualUpload} />
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className="flex-1 overflow-auto custom-scrollbar px-6 py-5"
            onClick={(e) => {
                if (e.target === e.currentTarget) onSelectionClear();
            }}
        >
            <div className="mb-4 border-b border-telegram-border/70 pb-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                    <div className="font-medium text-telegram-text">
                        {selectionMode ? 'Selection mode' : `${sortedFiles.length} items`}
                    </div>

                    <button
                        onClick={() => {
                            if (selectedIds.length === sortedFiles.length && sortedFiles.length > 0) onSelectionClear();
                            else onSelectVisible?.();
                        }}
                        className="text-telegram-subtext transition hover:text-telegram-text"
                    >
                        <span className="flex items-center gap-1.5">
                            <CheckCheck className="h-3.5 w-3.5" />
                            {selectedIds.length === sortedFiles.length && sortedFiles.length > 0 ? 'Clear selection' : 'Select all'}
                        </span>
                    </button>

                    {selectionMode && (
                        <div className="text-xs text-telegram-subtext">
                            Click files to select more than one.
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1 text-sm">
                        {(['all', 'image', 'video', 'audio', 'doc', 'other'] as FilterType[]).map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`rounded-md px-2 py-1 transition ${filterType === type ? 'bg-telegram-primary/12 text-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text'}`}
                            >
                                {FILTER_LABELS[type]} <span className="opacity-60">{type === 'all' ? files.length : filterCounts[type]}</span>
                            </button>
                        ))}
                    </div>

                    <div className="ml-auto flex flex-wrap items-center gap-1 text-sm">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`rounded-md px-2 py-1 transition ${viewMode === 'grid' ? 'bg-telegram-primary/12 text-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text'}`}
                            title="Grid view"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`rounded-md px-2 py-1 transition ${viewMode === 'list' ? 'bg-telegram-primary/12 text-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text'}`}
                            title="List view"
                        >
                            <List className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('gallery')}
                            className={`rounded-md px-2 py-1 transition ${viewMode === 'gallery' ? 'bg-telegram-primary/12 text-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text'}`}
                        >
                            Gallery
                        </button>
                        {(['name', 'size', 'date'] as SortField[]).map((field) => (
                            <button
                                key={field}
                                onClick={() => handleSort(field)}
                                className={`rounded-md px-2 py-1 capitalize transition ${sortField === field ? 'bg-telegram-primary/12 text-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text'}`}
                            >
                                <span className="flex items-center gap-1">
                                    {field}
                                    <SortIcon field={field} />
                                </span>
                            </button>
                        ))}
                        {hasCustomizedControls && (
                            <button
                                onClick={resetExplorerControls}
                                className="rounded-md px-2 py-1 text-telegram-subtext transition hover:text-telegram-text"
                            >
                                <span className="flex items-center gap-1.5">
                                    <RefreshCcw className="h-3.5 w-3.5" />
                                    Reset
                                </span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {sortedFiles.length === 0 && viewMode !== 'gallery' ? (
                <div className="flex flex-col items-center rounded-xl border border-telegram-border bg-white/[0.02] px-6 py-14 text-center">
                    <p className="text-lg font-semibold text-telegram-text">No files match this filter</p>
                    <p className="mt-2 max-w-md text-sm text-telegram-subtext">Try another filter or reset the current view.</p>
                    <button
                        onClick={resetExplorerControls}
                        className="mt-4 rounded-xl bg-telegram-primary px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
                    >
                        Reset view
                    </button>
                </div>
            ) : viewMode === 'gallery' ? (
                <GalleryView
                    files={sortedFiles}
                    activeFolderId={activeFolderId}
                    favoriteIds={favoriteIds}
                    onToggleFavorite={onToggleFavorite}
                    onPreview={(file) => onPreview(file, sortedFiles)}
                    compact
                />
            ) : viewMode === 'grid' ? (
                <div className="relative w-full" style={{ height: `${gridVirtualizer.getTotalSize()}px` }}>
                    {gridVirtualizer.getVirtualItems().map((virtualRow) => {
                        const row = gridRows[virtualRow.index];
                        return (
                            <div
                                key={virtualRow.key}
                                className="absolute left-0 top-0 grid w-full"
                                style={{
                                    height: `${cardHeight}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                                    gap: `${gap}px`,
                                }}
                            >
                                {row.map((item) => {
                                    if (item === 'upload') {
                                        return <ExplorerUploadCard key="upload" onManualUpload={onManualUpload} height={cardHeight} />;
                                    }

                                    return (
                                        <FileCard
                                            key={item.id}
                                            file={item}
                                            isSelected={selectedIds.includes(item.id)}
                                            selectionMode={selectionMode}
                                            onClick={() => item.type === 'folder' ? onOpenFolder?.(item) : handlePreviewRequest(item)}
                                            onToggleSelection={() => onToggleSelection(item.id)}
                                            onContextMenu={(e) => handleContextMenu(e, item)}
                                            onDelete={() => onDelete(item)}
                                            onDownload={() => onDownload(item)}
                                            onPreview={() => item.type === 'folder' ? onOpenFolder?.(item) : handlePreviewRequest(item)}
                                            onDrop={onDrop}
                                            onDragStart={onDragStart}
                                            onDragEnd={onDragEnd}
                                            activeFolderId={activeFolderId}
                                            height={cardHeight}
                                            isFavorite={favoriteIds.has(item.id)}
                                            onToggleFavorite={onToggleFavorite}
                                        />
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex w-full flex-col">
                    <div className="mb-2 grid grid-cols-[2.5rem_2fr_6rem_7rem] items-center gap-4 px-3 py-2 text-xs font-medium text-telegram-subtext">
                        <div></div>
                        <button onClick={() => handleSort('name')} className="flex items-center gap-1 transition-colors hover:text-telegram-text">
                            Name <SortIcon field="name" />
                        </button>
                        <button onClick={() => handleSort('size')} className="flex items-center justify-end gap-1 transition-colors hover:text-telegram-text">
                            Size <SortIcon field="size" />
                        </button>
                        <button onClick={() => handleSort('date')} className="flex items-center justify-end gap-1 transition-colors hover:text-telegram-text">
                            Date <SortIcon field="date" />
                        </button>
                    </div>

                    <div className="relative w-full" style={{ height: `${listVirtualizer.getTotalSize()}px` }}>
                        {listVirtualizer.getVirtualItems().map((virtualItem) => {
                            const item = listItems[virtualItem.index];
                            return (
                                <div
                                    key={item.id}
                                    className="absolute left-0 top-0 w-full"
                                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                                >
                                    <FileListItem
                                        file={item}
                                        selectedIds={selectedIds}
                                        selectionMode={selectionMode}
                                        onFileClick={onFileClick}
                                        handleContextMenu={handleContextMenu}
                                        onDragStart={onDragStart}
                                        onDragEnd={onDragEnd}
                                        onDrop={onDrop}
                                        onPreview={handlePreviewRequest}
                                        onDownload={onDownload}
                                        onDelete={onDelete}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    file={contextMenu.file}
                    onClose={() => setContextMenu(null)}
                    onDownload={() => {
                        onDownload(contextMenu.file);
                        setContextMenu(null);
                    }}
                    onDelete={() => {
                        onDelete(contextMenu.file);
                        setContextMenu(null);
                    }}
                    onPreview={() => {
                        if (contextMenu.file.type === 'folder') {
                            onOpenFolder?.(contextMenu.file);
                        } else {
                            handlePreviewRequest(contextMenu.file);
                        }
                        setContextMenu(null);
                    }}
                    onRename={() => {
                        onRename(contextMenu.file);
                        setContextMenu(null);
                    }}
                    onShareLink={() => {
                        onShareLink(contextMenu.file);
                        setContextMenu(null);
                    }}
                />
            )}
        </div>
    );
}
