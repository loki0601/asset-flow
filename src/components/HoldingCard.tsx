'use client';

import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { HoldingView } from '@/hooks/useHoldingsView';
import { HoldingDetailModal } from '@/features/holdings/HoldingDetailModal';
import { card } from '@/lib/cardStyles';
import { formatKRW } from '@/lib/loans';
import { assetDisplayName } from '@/lib/assetDisplay';

const CATEGORY_COLORS: Record<string, string> = {
  국내증권: '#2D4F35',
  미국증권: '#4A7256',
  가상자산: '#8BA18E',
  금: '#B8C8BC',
};

export function HoldingCard({ view, onAfterTrade }: { view: HoldingView; onAfterTrade?: () => void }) {
  const [open, setOpen] = useState(false);
  const up = view.gain >= 0;
  const color = CATEGORY_COLORS[view.category] ?? '#2D4F35';
  const qtyLabel = formatQty(view.holding.quantity, view.category);
  // USD assets carry a secondary native-currency pill alongside the KRW
  // primary values, so users can cross-check against US brokerage statements.
  const isUsd = view.asset.currency === 'USD';
  const nativePrice = view.asset.currentPrice || view.holding.avgPrice;
  const usdTotal = isUsd ? nativePrice * view.holding.quantity : 0;
  const usdGain = isUsd
    ? (nativePrice - view.holding.avgPrice) * view.holding.quantity
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left w-full bg-white p-5 rounded-[2rem] border border-brand-line hover:shadow-md transition-all active:scale-[0.98]"
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`${card.iconBox} text-white`}
              style={{ backgroundColor: color }}
            >
              <TrendingUp size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className={`${card.title} line-clamp-2 leading-tight`}>{assetDisplayName(view.asset)}</h4>
                {view.asset.deprecated && (
                  <span className="text-[9px] font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    단종
                  </span>
                )}
              </div>
              <p className={card.subLabel}>{qtyLabel}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className={card.value}>{formatKRW(view.totalValue)}</p>
            {isUsd && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-brand-surface text-brand-sage">
                {formatUsd(usdTotal)}
              </span>
            )}
          </div>
        </div>
        <div className="h-px w-full bg-brand-surface mb-4" />
        <div className="flex justify-between items-start">
          <span
            className={`text-[10px] font-black p-1.5 px-3 rounded-xl ${
              up ? 'bg-brand-up/10 text-brand-up' : 'bg-brand-down/10 text-brand-down'
            }`}
          >
            {up ? '+' : ''}{view.gainPct.toFixed(2)}%
          </span>
          <div className="flex flex-col items-end gap-1">
            <p className={`text-[10px] font-black ${up ? 'text-brand-up' : 'text-brand-down'}`}>
              {up ? '+' : ''}{formatKRW(view.gain)}
            </p>
            {isUsd && (
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                  up ? 'bg-brand-up/10 text-brand-up' : 'bg-brand-down/10 text-brand-down'
                }`}
              >
                {usdGain >= 0 ? '+' : ''}{formatUsd(usdGain)}
              </span>
            )}
          </div>
        </div>
      </button>

      <HoldingDetailModal
        open={open}
        onClose={() => {
          setOpen(false);
          onAfterTrade?.();
        }}
        view={view}
      />
    </>
  );
}

function formatQty(quantity: number, category: string): string {
  if (category === '가상자산') return `${quantity}개`;
  if (category === '금') return `${quantity}g`;
  return `${quantity}주`;
}

function formatUsd(value: number): string {
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}
