'use client';

import { useMemo, useState } from 'react';
import { Plus, TrendingUp } from 'lucide-react';
import type { AssetCategory } from '@/lib/schema';
import { AllocationDonut } from '@/features/portfolio/AllocationDonut';
import { CategoryTabs, type CategoryFilter } from '@/features/portfolio/CategoryTabs';
import { HoldingCard } from '@/components/HoldingCard';
import { AssetPickerModal } from '@/features/trade/AssetPickerModal';
import { EmptyState } from '@/components/EmptyState';
import { useHoldingsView } from '@/hooks/useHoldingsView';
import { useAggregateView } from '@/hooks/useAggregateView';
import { aggregateBySymbol } from '@/lib/holdingsAggregate';

export default function PortfolioPage() {
  const [selected, setSelected] = useState<CategoryFilter>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const { views, refresh, loaded } = useHoldingsView();
  const aggregate = useAggregateView();

  const filtered = selected === 'all' ? views : views.filter((v) => v.category === selected);
  const displayed = aggregate ? aggregateBySymbol(filtered) : filtered;
  const allEmpty = views.length === 0;
  // Categories that actually have holdings. Used by CategoryTabs to hide
  // empty tabs so the row stays tight when the user only holds a subset.
  const availableCategories = useMemo(
    () => new Set<AssetCategory>(views.map((v) => v.category)),
    [views],
  );

  return (
    <>
      <div className="flex flex-col gap-6 pb-10">
        <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] -mb-2">
          Asset Allocation
        </p>
        <AllocationDonut selected={selected} />
        <CategoryTabs selected={selected} onSelect={setSelected} available={availableCategories} />
        <div className="grid gap-4">
          {!loaded ? (
            // Auth bootstrap placeholder — avoid flashing the "보유 종목
            // 없습니다" empty state during page transitions.
            Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="bg-white/60 rounded-[2rem] h-[6rem] animate-pulse"
              />
            ))
          ) : displayed.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title={
                allEmpty
                  ? '보유 종목이 없어요'
                  : '해당 카테고리에 보유 종목이 없어요'
              }
              description={
                allEmpty
                  ? '+ 버튼으로 첫 종목을 추가해 보세요.'
                  : '다른 카테고리를 확인하거나 + 버튼으로 매수해 보세요.'
              }
            />
          ) : (
            displayed.map((v) => (
              <HoldingCard
                key={`${v.holding.accountId}:${v.holding.id}`}
                view={v}
                onAfterTrade={refresh}
              />
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-label="신규 매수"
        className="fixed right-6 z-30 w-14 h-14 bg-brand text-white rounded-full flex items-center justify-center shadow-2xl shadow-brand/30 active:scale-95 transition-transform"
        style={{ bottom: 'calc(6.5rem + env(safe-area-inset-bottom))' }}
      >
        <Plus size={24} />
      </button>

      <AssetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onTraded={refresh}
      />
    </>
  );
}
