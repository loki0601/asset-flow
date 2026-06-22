'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { InteractivePriceChart } from '@/components/InteractivePriceChart';
import { usePortfolioFlow } from '@/hooks/usePortfolioFlow';
import { usePriceSync } from '@/components/AuthProvider';
import { formatRelative } from '@/lib/relativeTime';

type Metric = 'assets' | 'cumulative';

const METRICS: { key: Metric; label: string }[] = [
  { key: 'assets', label: '총자산' },
  { key: 'cumulative', label: '누적수익' },
];

/** Signed KRW for the profit curve so a loss reads as −1,234 not 1,234. */
function formatSignedKRW(v: number): string {
  const rounded = Math.round(v);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('ko-KR')}`;
}

export function FlowChart({
  memberId = 'all',
  accountId = 'all',
}: {
  memberId?: string | 'all';
  accountId?: string | 'all';
}) {
  const { assets, cumulative } = usePortfolioFlow(memberId, accountId);
  const { refreshPrices, pricesSyncing, pricesLastSyncAt } = usePriceSync();
  const [metric, setMetric] = useState<Metric>('assets');

  const rows = metric === 'assets' ? assets : cumulative;

  function handleRefresh() {
    if (pricesSyncing) return;
    refreshPrices().catch((err) => console.warn('[FlowChart] refresh failed', err));
  }

  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-brand-line shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <p className="text-xs font-bold text-brand-ink shrink-0">자산 흐름</p>
          {pricesLastSyncAt && (
            <p className="text-[10px] text-brand-sage font-bold truncate">
              {pricesSyncing ? '동기화 중…' : `${formatRelative(pricesLastSyncAt)} 업데이트`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={pricesSyncing}
          className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-brand-sage active:bg-brand-surface disabled:opacity-50"
          aria-label="시세 새로고침"
        >
          <RefreshCw size={14} className={pricesSyncing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-1.5 mb-3">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`px-3 py-1 rounded-full text-[11px] font-black tracking-wide ${
              metric === m.key ? 'bg-brand text-white' : 'bg-brand-surface text-brand-sage'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {rows.length < 2 ? (
        <p className="text-[11px] text-brand-sage font-bold py-12 text-center">
          데이터가 충분히 쌓이면 흐름이 표시됩니다
        </p>
      ) : (
        <InteractivePriceChart
          rows={rows}
          formatY={metric === 'cumulative' ? formatSignedKRW : undefined}
        />
      )}
    </div>
  );
}
