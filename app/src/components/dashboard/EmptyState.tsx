import { FolderPlus, Search, Star, Upload } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

type EmptyVariant = 'folder' | 'search' | 'favorites';

interface EmptyStateProps {
    onUpload: () => void;
    variant?: EmptyVariant;
    searchTerm?: string;
}

const VARIANTS = {
    folder: {
        Icon: FolderPlus,
        titleKey: 'emptyFolder' as const,
        subKey: 'emptyFolderSub' as const,
    },
    search: {
        Icon: Search,
        titleKey: 'noResults' as const,
        subKey: 'noResultsSub' as const,
    },
    favorites: {
        Icon: Star,
        titleKey: 'noStarred' as const,
        subKey: 'noStarredSub' as const,
    },
};

export function EmptyState({ onUpload, variant = 'folder', searchTerm }: EmptyStateProps) {
    const { t } = useLanguage();
    const { Icon, titleKey, subKey } = VARIANTS[variant];
    const title = t(titleKey);
    const sub = t(subKey);

    return (
        <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-lg border border-telegram-border bg-white/[0.015] px-8 py-12 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-telegram-border bg-white/[0.03]">
                <Icon className="w-7 h-7 text-telegram-primary" />
            </div>

            <div className="max-w-md">
                <h3 className="text-lg font-semibold tracking-tight text-telegram-text">
                    {variant === 'search' && searchTerm ? `${t('noResults')} "${searchTerm}"` : title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-telegram-subtext">{sub}</p>
            </div>

            {variant === 'folder' && (
                <button
                    onClick={onUpload}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-telegram-primary px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
                >
                    <Upload className="w-4 h-4" />
                    {t('addFiles')}
                </button>
            )}
        </div>
    );
}
