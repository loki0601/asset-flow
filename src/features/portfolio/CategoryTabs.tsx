'use client';

import { ACCOUNT_TYPES, type AssetCategory } from '@/lib/schema';

export type CategoryFilter = AssetCategory | 'all';

interface Props {
  selected: CategoryFilter;
  onSelect: (category: CategoryFilter) => void;
  /** Categories that have at least one holding. Categories not in this set
   *  are hidden from the tab row. '전체' is always shown. */
  available?: Set<AssetCategory>;
}

export function CategoryTabs({ selected, onSelect, available }: Props) {
  const tabs: CategoryFilter[] = [
    'all',
    ...ACCOUNT_TYPES.filter((c) => !available || available.has(c)),
  ];
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
      {tabs.map((cat) => {
        const active = selected === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
              active
                ? 'bg-brand text-white border-brand shadow-md'
                : 'bg-white text-brand-sage border-brand-line'
            }`}
          >
            {cat === 'all' ? '전체' : cat}
          </button>
        );
      })}
    </div>
  );
}
