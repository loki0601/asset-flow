import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Reduce vertical padding when used inside a tighter container. */
  compact?: boolean;
}

/**
 * Shared empty-state placeholder for list sections that have no items yet.
 * Dashed-border card with an icon, title, and optional description so an
 * empty section never reads as a layout bug.
 */
export function EmptyState({ icon: Icon, title, description, compact = false }: Props) {
  return (
    <div
      className={`bg-white border border-dashed border-brand-line rounded-[24px] ${
        compact ? 'py-8' : 'py-12'
      } px-6 flex flex-col items-center text-center`}
    >
      <div className="w-12 h-12 rounded-full bg-brand-surface flex items-center justify-center text-brand-sage mb-3">
        <Icon size={22} />
      </div>
      <p className="text-sm font-bold text-brand-ink">{title}</p>
      {description && <p className="text-[11px] text-brand-sage mt-1">{description}</p>}
    </div>
  );
}
