'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight } from 'lucide-react';
import { fxHistoryRepo } from '@/lib/fxHistoryRepo';
import { getFxRate } from '@/lib/fx';
import { usePriceSync } from '@/components/AuthProvider';

interface FxState {
  rate: number;
  change: number | null;
  changePct: number | null;
  asOf: string | null;
}

export function FxRateCard() {
  const { pricesLastSyncAt } = usePriceSync();
  const [state, setState] = useState<FxState>({
    rate: 0,
    change: null,
    changePct: null,
    asOf: null,
  });

  useEffect(() => {
    const rows = fxHistoryRepo.listAll('USDKRW');
    const fallback = getFxRate('USDKRW');
    if (rows.length === 0) {
      setState({ rate: fallback, change: null, changePct: null, asOf: null });
      return;
    }
    const latest = rows[rows.length - 1];
    const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
    const change = prev ? latest.rate - prev.rate : null;
    const changePct = prev && prev.rate > 0 ? (change! / prev.rate) * 100 : null;
    setState({ rate: latest.rate, change, changePct, asOf: latest.date });
  }, [pricesLastSyncAt]);

  const isUp = (state.change ?? 0) >= 0;

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
      <div className="w-12 h-12 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
        <ArrowLeftRight size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-bold text-brand-ink">USD / KRW</p>
          {state.asOf && (
            <p className="text-[10px] text-brand-sage">{state.asOf}</p>
          )}
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <p className="text-lg font-black text-brand-ink tracking-tight">
            ₩{state.rate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
          </p>
          {state.changePct !== null && state.change !== null && (
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] font-black ${
                isUp ? 'text-brand-up' : 'text-brand-down'
              }`}
            >
              {isUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {isUp ? '+' : ''}
              {state.changePct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
