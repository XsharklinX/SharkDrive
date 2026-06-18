/**
 * Extracted from Dashboard.tsx to reduce its line count.
 * Renders all conditional modals inside Suspense + AnimatePresence.
 */
import { Suspense, lazy } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { TelegramFile, TelegramFolder, ActivityEntry, AccountMeta } from '../types';
import { tauriApi } from '../api/tauri';
import { resolveFileFolderId } from '../utils';

// Static
import { RenameModal } from './dashboard/RenameModal';
import { WipeConfirmModal } from './dashboard/WipeConfirmModal';
import { DragDropOverlay } from './dashboard/DragDropOverlay';
import { ErrorBoundary } from './ErrorBoundary';

// Lazy
const SettingsModal = lazy(() => import('./dashboard/SettingsModal').then(m => ({ default: m.SettingsModal })));
const MoveToFolderModal = lazy(() => import('./dashboard/MoveToFolderModal').then(m => ({ default: m.MoveToFolderModal })));
const MediaPlayer = lazy(() => import('./dashboard/MediaPlayer').then(m => ({ default: m.MediaPlayer })));
const PdfViewer = lazy(() => import('./dashboard/PdfViewer').then(m => ({ default: m.PdfViewer })));
const VaultModal = lazy(() => import('./dashboard/VaultModal').then(m => ({ default: m.VaultModal })));
const ShareLinksDashboard = lazy(() => import('./dashboard/ShareLinksDashboard').then(m => ({ default: m.ShareLinksDashboard })));
const BatchRenameModal = lazy(() => import('./dashboard/BatchRenameModal').then(m => ({ default: m.BatchRenameModal })));
const TextPreviewModal = lazy(() => import('./dashboard/TextPreviewModal').then(m => ({ default: m.TextPreviewModal })));
const KeyboardShortcutsOverlay = lazy(() => import('./dashboard/KeyboardShortcutsOverlay').then(m => ({ default: m.KeyboardShortcutsOverlay })));
const ImageCompressDialog = lazy(() => import('./dashboard/ImageCompressDialog').then(m => ({ default: m.ImageCompressDialog })));
const OnboardingWizard = lazy(() => import('./dashboard/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));
const VersionHistoryModal = lazy(() => import('./dashboard/VersionHistoryModal').then(m => ({ default: m.VersionHistoryModal })));
const SyncHistoryPanel = lazy(() => import('./dashboard/SyncHistoryPanel').then(m => ({ default: m.SyncHistoryPanel })));
const DuplicatesPanel = lazy(() => import('./dashboard/DuplicatesPanel').then(m => ({ default: m.DuplicatesPanel })));
const CrossAccountCopyModal = lazy(() => import('./dashboard/CrossAccountCopyModal').then(m => ({ default: m.CrossAccountCopyModal })));
const WebAccessModal = lazy(() => import('./dashboard/WebAccessModal').then(m => ({ default: m.WebAccessModal })));
const TotpSetupModal = lazy(() => import('./dashboard/TotpSetupModal').then(m => ({ default: m.TotpSetupModal })));
const ExportKeyModal = lazy(() => import('./dashboard/ExportKeyModal').then(m => ({ default: m.ExportKeyModal })));
const ConfigExportModal = lazy(() => import('./dashboard/ConfigExportModal').then(m => ({ default: m.ConfigExportModal })));
const CloudImportWizard = lazy(() => import('./dashboard/CloudImportWizard').then(m => ({ default: m.CloudImportWizard })));
const ShareModal = lazy(() => import('./dashboard/ShareModal').then(m => ({ default: m.ShareModal })));

export interface ModalState {
    showSettings: boolean;
    showLinksDashboard: boolean;
    showWebAccess: boolean;
    showWipeConfirm: boolean;
    showTotpSetup: boolean;
    showConfigModal: boolean;
    showCloudImport: boolean;
    showSyncHistory: boolean;
    showDuplicates: boolean;
    showShortcutsOverlay: boolean;
    showOnboarding: boolean;
    showVault: boolean;
    showMoveModal: boolean;
    isDragging: boolean;
    isDraggingInternally: boolean;
}

export interface ModalData {
    // Files & targets
    exportKeyTarget: { id: number; name: string } | null;
    crossCopyFiles: TelegramFile[] | null;
    versionHistoryFile: TelegramFile | null;
    pendingImagePaths: string[] | null;
    batchRenameFiles: TelegramFile[] | null;
    textPreviewFile: TelegramFile | null;
    shareTarget: TelegramFile | null;
    bulkShareTargets: TelegramFile[] | null;
    renameTarget: TelegramFile | null;
    playingFile: TelegramFile | null;
    pdfFile: TelegramFile | null;
    previewFile: TelegramFile | null;
    movingFolderId: number | null;
    // Context
    activeFolderId: number | null;
    folders: TelegramFolder[];
    allFiles: TelegramFile[];
    allIndexedRaw: TelegramFile[];
    activity: ActivityEntry[];
    accounts: AccountMeta[];
    activeAccountId: string | null;
    encryptionEnabled: boolean;
    autoSyncInterval: number;
    destinationAction: 'move' | 'copy';
    // Preview navigation
    previewContextFiles: TelegramFile[];
    previewContextIndex: number;
    previewNeighborState: { nextFile: TelegramFile | null; prevFile: TelegramFile | null };
    // Organization — Partial<KeyboardShortcutMap> compatible
    shortcuts: Record<string, string>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ModalCallbacks {
    close: (modal: keyof ModalState) => void;
    setAutoSyncInterval: (v: number) => void;
    setEncryptionEnabled: (v: boolean) => void;
    setShortcuts: (v: Record<string, string>) => void;
    handleExportActivity: (format: 'csv' | 'json') => void;
    handleRename: (name: string) => Promise<void>;
    handleDestinationSelect: (folderId: number | null) => void;
    handleSetFolderParent: (folderId: number, parentId: number | null) => Promise<void>;
    handleNextPreview: () => void;
    handlePrevPreview: () => void;
    handlePreview: (file: TelegramFile, context: TelegramFile[]) => void;
    handleCreateFolder: (name: string, parentId: number | null) => Promise<void>;
    handleCrossCopyAndSwitch: (tempPaths: string[], targetAccountId: string) => void;
    refreshFiles: () => void;
    queueUploadCandidates: (candidates: { path: string }[]) => void;
    store: { set: (key: string, value: unknown) => Promise<void>; save: () => Promise<void> } | null;
}

interface DashboardModalsProps {
    state: ModalState;
    data: ModalData;
    callbacks: ModalCallbacks;
}

export function DashboardModals({ state: s, data: d, callbacks: c }: DashboardModalsProps) {
    const queryClient = useQueryClient();

    return (
        <Suspense fallback={null}>
        <AnimatePresence>
            {s.showSettings && (
                <SettingsModal
                    key="settings-modal"
                    onClose={() => c.close('showSettings')}
                    autoSyncInterval={d.autoSyncInterval}
                    onAutoSyncChange={c.setAutoSyncInterval}
                    encryptionEnabled={d.encryptionEnabled}
                    onEncryptionToggle={(enabled) => {
                        c.setEncryptionEnabled(enabled);
                        if (c.store) c.store.set('encryptionEnabled', enabled).then(() => c.store!.save());
                    }}
                    folders={d.folders}
                    files={d.allIndexedRaw.filter((f) => f.icon_type !== 'folder')}
                    activity={d.activity}
                    shortcuts={d.shortcuts as any}
                    onShortcutsChange={c.setShortcuts as any}
                    onExportActivity={c.handleExportActivity}
                />
            )}
            {s.showLinksDashboard && <ShareLinksDashboard key="links-dashboard" onClose={() => c.close('showLinksDashboard')} />}
            {s.showWebAccess && <WebAccessModal key="web-access-modal" onClose={() => c.close('showWebAccess')} />}
            {s.showWipeConfirm && <WipeConfirmModal key="wipe-confirm-modal" onCancel={() => c.close('showWipeConfirm')} onConfirm={() => tauriApi.executeWipe()} />}
            {s.showTotpSetup && <TotpSetupModal key="totp-setup-modal" onClose={() => c.close('showTotpSetup')} onEnabled={() => c.close('showTotpSetup')} />}
            {d.exportKeyTarget && <ExportKeyModal key="export-key-modal" folderId={d.exportKeyTarget.id} folderName={d.exportKeyTarget.name} onClose={() => c.close('showSettings')} />}
            {s.showConfigModal && (
                <ConfigExportModal
                    key="config-modal"
                    shortcuts={d.shortcuts}
                    onImport={(cfg) => {
                        if (cfg.classificationRules) localStorage.setItem('sharkdrive.classificationRules.v1', JSON.stringify(cfg.classificationRules));
                        if (cfg.uploadNamingPattern !== undefined) localStorage.setItem('sharkdrive.uploadNamingPattern.v1', String(cfg.uploadNamingPattern));
                        if (cfg.wifiOnlySync !== undefined) localStorage.setItem('sharkdrive.wifiOnlySync.v1', String(cfg.wifiOnlySync));
                        if (cfg.webhookUrl !== undefined) localStorage.setItem('sharkdrive.webhookUrl.v1', String(cfg.webhookUrl));
                        if (cfg.webhookEnabled !== undefined) localStorage.setItem('sharkdrive.webhookEnabled.v1', String(cfg.webhookEnabled));
                        if (cfg.shortcuts && typeof cfg.shortcuts === 'object') c.setShortcuts(cfg.shortcuts as Record<string, string>);
                    }}
                    onClose={() => c.close('showConfigModal')}
                />
            )}
            {s.showCloudImport && (
                <CloudImportWizard key="cloud-import" onClose={() => c.close('showCloudImport')}
                    onFilesReady={(paths) => c.queueUploadCandidates(paths.map(path => ({ path })))} />
            )}
            {s.showSyncHistory && <SyncHistoryPanel key="sync-history-panel" onClose={() => c.close('showSyncHistory')} />}
            {s.showDuplicates && <DuplicatesPanel key="duplicates-panel" folders={d.folders.map(f => ({ id: f.id, name: f.name }))} onClose={() => c.close('showDuplicates')} onDeleted={c.refreshFiles} />}
            {d.crossCopyFiles && <CrossAccountCopyModal key="cross-copy-modal" files={d.crossCopyFiles} activeFolderId={d.activeFolderId} accounts={d.accounts} activeAccountId={d.activeAccountId} onClose={() => c.close('showDuplicates')} onSwitchAndUpload={c.handleCrossCopyAndSwitch} />}
            {d.versionHistoryFile && (
                <VersionHistoryModal key="version-history-modal" filename={d.versionHistoryFile.name} folderId={resolveFileFolderId(d.versionHistoryFile, d.activeFolderId)}
                    versions={d.allFiles.filter(f => f.type !== 'folder' && f.name.toLowerCase() === d.versionHistoryFile!.name.toLowerCase()).sort((a, b) => b.id - a.id)}
                    onClose={() => c.close('showSettings')} onRestored={c.refreshFiles} />
            )}
            {s.showShortcutsOverlay && <KeyboardShortcutsOverlay key="shortcuts-overlay" shortcuts={d.shortcuts as any} onClose={() => c.close('showShortcutsOverlay')} />}
            {d.pendingImagePaths && (
                <ImageCompressDialog key="compress-dialog"
                    files={d.pendingImagePaths.map(p => ({ path: p, name: p.split(/[/\\]/).pop() ?? p, size: 0 }))}
                    onClose={() => c.close('showSettings')}
                    onSkip={() => { c.queueUploadCandidates(d.pendingImagePaths!.map(path => ({ path }))); c.close('showSettings'); toast.info(`Queued ${d.pendingImagePaths!.length} image(s)`); }}
                    onConfirm={async (quality, maxDimension) => {
                        const paths = d.pendingImagePaths!;
                        c.close('showSettings');
                        toast.info('Compressing images…');
                        const results: string[] = [];
                        for (const p of paths) { try { results.push(await tauriApi.compressImage(p, quality, maxDimension)); } catch { results.push(p); } }
                        c.queueUploadCandidates(results.map(path => ({ path })));
                        toast.info(`Queued ${results.length} compressed image(s)`);
                    }}
                />
            )}
            {s.showOnboarding && <OnboardingWizard key="onboarding-wizard" onClose={() => c.close('showOnboarding')} onCreateFolder={(name) => c.handleCreateFolder(name, null)} onEncryptionEnabled={() => c.setEncryptionEnabled(true)} />}
            {s.showVault && <VaultModal key="vault-modal" files={d.allIndexedRaw.filter(f => f.icon_type !== 'folder')} folders={d.folders} activity={d.activity} onClose={() => c.close('showVault')} />}
            {d.batchRenameFiles && <BatchRenameModal key="batch-rename-modal" files={d.batchRenameFiles} activeFolderId={d.activeFolderId} onClose={() => c.close('showSettings')} onDone={() => queryClient.invalidateQueries({ queryKey: ['files', d.activeFolderId] })} />}
            {d.textPreviewFile && <TextPreviewModal key="text-preview-modal" file={d.textPreviewFile} activeFolderId={d.activeFolderId} onClose={() => c.close('showSettings')} />}
            {d.shareTarget && <ShareModal key="share-modal" file={d.shareTarget} activeFolderId={d.shareTarget.type === 'folder' ? d.shareTarget.id : d.activeFolderId} onClose={() => c.close('showSettings')} />}
            {d.bulkShareTargets && <ShareModal key="bulk-share-modal" files={d.bulkShareTargets} activeFolderId={d.activeFolderId} onClose={() => c.close('showSettings')} />}
            {d.renameTarget && <RenameModal key="rename-modal" currentName={d.renameTarget.name} isFolder={d.renameTarget.type === 'folder'} onConfirm={c.handleRename} onClose={() => c.close('showSettings')} />}
            {s.showMoveModal && <MoveToFolderModal key="move-modal" folders={d.folders} onClose={() => c.close('showMoveModal')} onSelect={c.handleDestinationSelect} activeFolderId={d.activeFolderId} mode={d.destinationAction} />}
            {d.movingFolderId !== null && (
                <MoveToFolderModal key="move-folder-modal" folders={d.folders.filter(f => f.id !== d.movingFolderId)} onClose={() => c.close('showSettings')} onSelect={async (targetParentId) => { await c.handleSetFolderParent(d.movingFolderId!, targetParentId); c.close('showSettings'); }} activeFolderId={null} mode="move" />
            )}
            {d.playingFile && (
                <ErrorBoundary onDismiss={() => c.close('showSettings')} key="media-player-boundary">
                    <MediaPlayer file={d.playingFile} onClose={() => c.close('showSettings')} onNext={c.handleNextPreview} onPrev={c.handlePrevPreview} currentIndex={d.previewContextIndex} totalItems={d.previewContextFiles.length} activeFolderId={d.activeFolderId} playlist={d.previewContextFiles} onSelectTrack={(track) => c.handlePreview(track, d.previewContextFiles)} key="media-player" />
                </ErrorBoundary>
            )}
            {d.pdfFile && (
                <ErrorBoundary onDismiss={() => c.close('showSettings')} key="pdf-viewer-boundary">
                    <PdfViewer file={d.pdfFile} onClose={() => c.close('showSettings')} onNext={c.handleNextPreview} onPrev={c.handlePrevPreview} currentIndex={d.previewContextIndex} totalItems={d.previewContextFiles.length} activeFolderId={d.activeFolderId} key="pdf-viewer" />
                </ErrorBoundary>
            )}
            {s.isDragging && !s.isDraggingInternally && <DragDropOverlay key="drag-drop-overlay" />}
        </AnimatePresence>
        </Suspense>
    );
}
