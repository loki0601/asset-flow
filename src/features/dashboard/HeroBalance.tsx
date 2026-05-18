'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatKRW } from '@/lib/loans';
import { useHoldingsView } from '@/hooks/useHoldingsView';

export function HeroBalance({
  memberId = 'all',
  accountId = 'all',
}: {
  memberId?: string | 'all';
  accountId?: string | 'all';
}) {
  const { totalValue, totalGain, totalGainPct } = useHoldingsView(memberId, accountId);
  const up = totalGain >= 0;

  return (
    <div className="px-2">
      <p className="text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
        Total Balance
      </p>
      <div className="flex justify-between items-center gap-3">
        <h1 className="text-3xl font-black text-brand-ink tracking-tight">
          {formatKRW(totalValue)}
        </h1>
        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow-sm border border-brand-line shrink-0">
          {up ? (
            <TrendingUp size={14} className="text-brand-up" />
          ) : (
            <TrendingDown size={14} className="text-brand-down" />
          )}
          <span className={`text-xs font-black ${up ? 'text-brand-up' : 'text-brand-down'}`}>
            {up ? '+' : ''}
            {totalGainPct.toFixed(2)}%
          </span>
        </div>
      </div>
      <p className={`text-xs font-bold mt-1 opacity-70 ${up ? 'text-brand-up' : 'text-brand-down'}`}>
        평가 손익 <span className="font-black">{up ? '+' : ''}{formatKRW(totalGain)}</span>
      </p>
    </div>
  );
}
