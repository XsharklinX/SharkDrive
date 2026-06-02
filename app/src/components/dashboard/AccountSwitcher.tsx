import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Check, Trash2, Pencil, Palette, UserCircle2 } from 'lucide-react';
import { AccountMeta } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { tauriApi } from '../../api/tauri';
import { toast } from 'sonner';

const ACCENT_COLORS = [
    '#2481cc', '#00a884', '#e74c3c', '#9b59b6',
    '#e67e22', '#27ae60', '#e91e63', '#00bcd4',
];

interface AccountSwitcherProps {
    accounts: AccountMeta[];
    activeAccountId: string | null;
    onSwitch: (accountId: string) => void;
    onAddAccount: () => void;
    onAccountsChange: () => void;
}

function Avatar({ account, size = 32 }: { account: AccountMeta; size?: number }) {
    const color = account.accent_color ?? '#2481cc';
    const initials = account.alias.slice(0, 2).toUpperCase();
    if (account.avatar_b64) {
        return (
            <img
                src={account.avatar_b64}
                alt={account.alias}
                style={{ width: size, height: size }}
                className="rounded-full object-cover flex-shrink-0"
            />
        );
    }
    return (
        <div
            style={{ width: size, height: size, background: color }}
            className="rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 select-none"
        >
            {initials}
        </div>
    );
}

export function AccountSwitcher({ accounts, activeAccountId, onSwitch, onAddAccount, onAccountsChange }: AccountSwitcherProps) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editAlias, setEditAlias] = useState('');
    const [colorPickerId, setColorPickerId] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const activeAccount = accounts.find(a => a.id === activeAccountId);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!dropdownRef.current?.contains(e.target as Node)) {
                setOpen(false);
                setEditingId(null);
                setColorPickerId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    async function handleRenameConfirm(id: string) {
        if (!editAlias.trim()) { setEditingId(null); return; }
        try {
            await tauriApi.setAccountAlias(id, editAlias.trim());
            onAccountsChange();
        } catch (e) { toast.error(`Rename failed: ${e}`); }
        setEditingId(null);
    }

    async function handleSetColor(id: string, color: string) {
        try {
            await tauriApi.setAccountColor(id, color);
            onAccountsChange();
        } catch (e) { toast.error(`Color update failed: ${e}`); }
        setColorPickerId(null);
    }

    async function handleRemove(id: string) {
        if (accounts.length <= 1) { toast.error('Cannot remove the only account.'); return; }
        try {
            await tauriApi.removeAccount(id);
            onAccountsChange();
        } catch (e) { toast.error(`Remove failed: ${e}`); }
    }

    return (
        <div ref={dropdownRef} className="relative">
            {/* Trigger */}
            <button
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-telegram-border bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
            >
                {activeAccount ? (
                    <>
                        <Avatar account={activeAccount} size={28} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-telegram-text leading-tight">{activeAccount.alias}</p>
                            {activeAccount.phone && (
                                <p className="truncate text-[10px] text-telegram-subtext leading-tight">{activeAccount.phone}</p>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-2">
                        <UserCircle2 className="h-5 w-5 text-telegram-subtext" />
                        <span className="text-sm text-telegram-subtext">{t('accounts')}</span>
                    </div>
                )}
                <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-telegram-subtext transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl overflow-hidden">
                    {/* Account list */}
                    <div className="py-1">
                        {accounts.map(account => {
                            const isActive = account.id === activeAccountId;
                            return (
                                <div key={account.id} className="group relative">
                                    {editingId === account.id ? (
                                        <div className="flex items-center gap-2 px-3 py-2">
                                            <Avatar account={account} size={24} />
                                            <input
                                                autoFocus
                                                value={editAlias}
                                                onChange={e => setEditAlias(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleRenameConfirm(account.id);
                                                    if (e.key === 'Escape') setEditingId(null);
                                                }}
                                                onBlur={() => handleRenameConfirm(account.id)}
                                                className="flex-1 rounded bg-white/[0.06] px-2 py-1 text-xs text-telegram-text outline-none focus:ring-1 focus:ring-telegram-primary"
                                            />
                                        </div>
                                    ) : colorPickerId === account.id ? (
                                        <div className="px-3 py-2">
                                            <p className="mb-1.5 text-[10px] text-telegram-subtext">{t('accentColor')}</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {ACCENT_COLORS.map(c => (
                                                    <button
                                                        key={c}
                                                        style={{ background: c }}
                                                        onClick={() => handleSetColor(account.id, c)}
                                                        className="h-5 w-5 rounded-full transition hover:scale-110"
                                                    />
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => setColorPickerId(null)}
                                                className="mt-1.5 text-[10px] text-telegram-subtext hover:text-telegram-text"
                                            >Cancel</button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => {
                                                if (!isActive) { onSwitch(account.id); setOpen(false); }
                                            }}
                                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                                                isActive ? 'bg-telegram-primary/10' : 'hover:bg-white/[0.05]'
                                            }`}
                                        >
                                            <Avatar account={account} size={26} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm text-telegram-text">{account.alias}</p>
                                                {account.phone && (
                                                    <p className="truncate text-[10px] text-telegram-subtext">{account.phone}</p>
                                                )}
                                            </div>
                                            {isActive && <Check className="h-3.5 w-3.5 flex-shrink-0 text-telegram-primary" />}

                                            {/* Action buttons (on hover) */}
                                            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setEditAlias(account.alias);
                                                        setEditingId(account.id);
                                                    }}
                                                    className="rounded p-1 text-telegram-subtext hover:bg-white/[0.08] hover:text-telegram-text"
                                                    title="Rename"
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </button>
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setColorPickerId(account.id);
                                                    }}
                                                    className="rounded p-1 text-telegram-subtext hover:bg-white/[0.08] hover:text-telegram-text"
                                                    title="Change color"
                                                >
                                                    <Palette className="h-3 w-3" />
                                                </button>
                                                {!isActive && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleRemove(account.id); }}
                                                        className="rounded p-1 text-telegram-subtext hover:bg-red-500/10 hover:text-red-400"
                                                        title="Remove account"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-telegram-border/50">
                        <button
                            onClick={() => { setOpen(false); onAddAccount(); }}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-primary"
                        >
                            <Plus className="h-4 w-4" />
                            {t('addAccount')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
