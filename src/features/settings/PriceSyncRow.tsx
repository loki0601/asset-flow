'use client';

import { TrendingUp, CircleCheck } from 'lucide-react';
import { usePriceSync } from '@/components/AuthProvider';

export function PriceSyncRow() {
  const { refreshPrices, pricesSyncing, pricesLastSyncAt } = usePriceSync();

  function handleClick() {
    if (pricesSyncing) return;
    refreshPrices().catch((err) => console.warn('[PriceSyncRow] sync failed', err));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pricesSyncing}
      className="w-full flex items-center gap-4 p-5 active:bg-brand-surface transition-colors disabled:opacity-60"
    >
      <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
        <TrendingUp size={20} className={pricesSyncing ? 'animate-pulse' : ''} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-bold text-brand-ink">시세 동기화</p>
        <p className="text-[11px] text-brand-sage mt-0.5 truncate">
          {pricesSyncing
            ? '동기화 중...'
            : pricesLastSyncAt
              ? `마지막 동기화 ${formatRelative(pricesLastSyncAt)}`
              : '종가 시세를 받아오세요'}
        </p>
      </div>
      {!pricesSyncing && pricesLastSyncAt && (
        <CircleCheck size={18} className="text-brand shrink-0" />
      )}
    </button>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return '방금 전';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `${days}일 전`;
  return new Date(iso).toISOString().slice(0, 10);
}
