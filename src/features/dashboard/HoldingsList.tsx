'use client';

import { useState } from 'react';
import { TrendingUp, ArrowUpDown } from 'lucide-react';
import { HoldingCard } from '@/components/HoldingCard';
import { EmptyState } from '@/components/EmptyState';
import { useHoldingsView } from '@/hooks/useHoldingsView';
import { useAggregateView } from '@/hooks/useAggregateView';
import { aggregateBySymbol } from '@/lib/holdingsAggregate';
import {
  sortHoldingViews,
  nextSortMode,
  HOLDING_SORT_MODES,
  type HoldingSortMode,
} from '@/lib/holdingsSort';
import { AccountSelector } from '@/features/dashboard/AccountSelector';
import type { Account } from '@/lib/schema';

export function HoldingsList({
  memberId = 'all',
  accountId = 'all',
  memberAccounts = [],
  onAccountChange,
}: {
  memberId?: string | 'all';
  accountId?: string | 'all';
  memberAccounts?: Account[];
  onAccountChange?: (next: string | 'all') => void;
}) {
  const aggregate = useAggregateView();
  const { views, refresh, loaded } = useHoldingsView(memberId, accountId);
  const showAccountSelector = memberId !== 'all' && memberAccounts.length > 0;
  const [sortMode, setSortMode] = useState<HoldingSortMode>('value');

  const collapsed = aggregate ? aggregateBySymbol(views) : views;
  const displayed = sortHoldingViews(collapsed, sortMode);
  const sortLabel = HOLDING_SORT_MODES.find((m) => m.mode === sortMode)?.label ?? '';

  return (
    <div className="px-2">
      <div className="flex justify-between items-center mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-black text-brand-ink text-lg italic shrink-0">Holdings</h3>
          {showAccountSelector && (
            <AccountSelector
              accounts={memberAccounts}
              value={accountId}
              onChange={(next) => onAccountChange?.(next)}
            />
          )}
        </div>
        {displayed.length > 1 && (
          <button
            type="button"
            onClick={() => setSortMode(nextSortMode(sortMode))}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-surface text-brand-sage text-[11px] font-black active:bg-brand/10 transition-colors"
            aria-label={`정렬: ${sortLabel}`}
          >
            <ArrowUpDown size={12} />
            {sortLabel}
          </button>
        )}
      </div>
      {!loaded ? (
        // While the userId is still resolving (auth bootstrap), keep a
        // neutral placeholder instead of "보유 종목 없습니다" so the empty
        // state doesn't flash during page transitions.
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="bg-white/60 rounded-[2rem] h-[6rem] animate-pulse"
            />
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="보유 종목이 없어요"
          description="포트폴리오의 + 버튼으로 첫 종목을 추가해 보세요."
        />
      ) : (
        <div className="grid gap-4">
          {displayed.map((v) => (
            <HoldingCard
              key={`${v.holding.accountId}:${v.holding.id}`}
              view={v}
              onAfterTrade={refresh}
              memberId={memberId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
