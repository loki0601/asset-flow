'use client';

import { X, ChevronLeft } from 'lucide-react';

interface ModalHeaderProps {
  /** Pre-rendered icon element, already sized/colored by the caller
   *  (AssetCategoryIcon, or a `card.iconBox` chip wrapping a lucide icon). */
  icon?: React.ReactNode;
  /** Small uppercase line above the title (category, bank name, …). */
  eyebrow?: string;
  /** Main heading. Accepts a node so callers can inline a badge next to the
   *  text (e.g. the 매수/매도 pill on a transaction detail popup). */
  title: React.ReactNode;
  /** Small line below the title (owner/account, date, current price, …). */
  subtitle?: React.ReactNode;
  /** Render a back button instead of leaving that space empty — used by
   *  multi-step flows (asset picker → trade form). */
  onBack?: () => void;
  onClose: () => void;
}

/**
 * Shared header for every modal in the app (holding/loan/transaction detail,
 * trade form, add-account, …) so they read as one consistent surface instead
 * of each screen inventing its own icon/title/close layout.
 */
export function ModalHeader({ icon, eyebrow, title, subtitle, onBack, onClose }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-6 pt-5 pb-2">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center shrink-0"
            aria-label="뒤로"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        {icon}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-black text-brand-sage uppercase tracking-widest truncate">
              {eyebrow}
            </p>
          )}
          <h2 className="text-lg font-black text-brand-ink leading-tight truncate">{title}</h2>
          {subtitle && (
            <p className="text-[11px] font-bold text-brand-sage truncate mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center shrink-0"
        aria-label="닫기"
      >
        <X size={18} />
      </button>
    </div>
  );
}
