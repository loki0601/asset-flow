'use client';

import { useMemo } from 'react';
import type { HoldingView } from '@/hooks/useHoldingsView';
import type { AssetCategory } from '@/lib/schema';
import type { CategoryFilter } from '@/features/portfolio/CategoryTabs';
import { assetDisplayName } from '@/lib/assetDisplay';
import { categoryColors } from '@/lib/categoryColors';
import { useTheme } from '@/hooks/useTheme';

// Symbol-level palette for the in-category donut. Cycled when more symbols
// than palette entries exist — visual differentiation beats absolute
// uniqueness for ~10 holdings.
const SYMBOL_PALETTE = [
  '#2D4F35',
  '#4A7256',
  '#8BA18E',
  '#B8C8BC',
  '#6B8E5A',
  '#A6B89E',
  '#39604A',
  '#7C9A85',
  '#586E5E',
  '#9CB29F',
];

interface Props {
  selected: CategoryFilter;
  /** Provided by the parent page so a single useHoldingsView instance feeds
   *  both the cards and the donut — keeps them in sync after a trade. */
  views: HoldingView[];
}

interface Segment {
  key: string;
  label: string;
  ratio: number;
  color: string;
}

const R = 40;
const C = 2 * Math.PI * R;

export function AllocationDonut({ selected, views }: Props) {
  const { theme } = useTheme();
  const CATEGORY_COLORS = useMemo(() => categoryColors(theme), [theme]);
  const portfolioTotal = useMemo(
    () => views.reduce((sum, v) => sum + v.totalValue, 0),
    [views],
  );

  // Build segments: when "all" → group by category. When a specific category
  // → group by symbol within that category (each holding's totalValue summed
  // per symbol so multiple accounts holding the same ticker stack into one
  // slice). The donut's "Total" center always reflects the visible subset.
  const { segments, visibleTotal } = useMemo(() => {
    if (selected === 'all') {
      const byCategory: Record<string, number> = {};
      for (const v of views) {
        byCategory[v.category] = (byCategory[v.category] ?? 0) + v.totalValue;
      }
      const tot = Object.values(byCategory).reduce((s, n) => s + n, 0);
      const segs: Segment[] = Object.entries(byCategory)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([category, value]) => ({
          key: category,
          label: category,
          ratio: tot > 0 ? (value / tot) * 100 : 0,
          color: CATEGORY_COLORS[category as AssetCategory] ?? '#9CB29F',
        }));
      return { segments: segs, visibleTotal: tot };
    }

    // Specific category — bucket by symbol.
    const bySymbol = new Map<string, { name: string; value: number }>();
    for (const v of views) {
      if (v.category !== selected) continue;
      const prev = bySymbol.get(v.holding.symbol);
      const value = (prev?.value ?? 0) + v.totalValue;
      bySymbol.set(v.holding.symbol, { name: assetDisplayName(v.asset), value });
    }
    const tot = Array.from(bySymbol.values()).reduce((s, x) => s + x.value, 0);
    const segs: Segment[] = Array.from(bySymbol.entries())
      .filter(([, { value }]) => value > 0)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([symbol, { name, value }], idx) => ({
        key: symbol,
        label: name,
        ratio: tot > 0 ? (value / tot) * 100 : 0,
        color: SYMBOL_PALETTE[idx % SYMBOL_PALETTE.length],
      }));
    return { segments: segs, visibleTotal: tot };
  }, [views, selected]);

  const hasData = segments.length > 0;
  const centerLabel = selected === 'all' ? 'Total' : selected;
  const centerValue =
    visibleTotal > 0 ? formatCompact(visibleTotal) : formatCompact(portfolioTotal);

  let offset = 0;
  const drawn = segments.map((seg) => {
    const length = (seg.ratio / 100) * C;
    const dasharray = `${length} ${C - length}`;
    const dashoffset = -offset;
    offset += length;
    return { ...seg, dasharray, dashoffset };
  });

  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-brand-line shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative w-36 h-36 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {hasData ? (
              drawn.map((seg) => (
                <circle
                  key={seg.key}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={seg.dasharray}
                  strokeDashoffset={seg.dashoffset}
                  style={{ transition: 'opacity 200ms' }}
                />
              ))
            ) : (
              <circle cx="50" cy="50" r={R} fill="none" stroke="#E9EDE9" strokeWidth="14" />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
            <p className="text-[10px] font-bold text-brand-sage uppercase tracking-widest truncate max-w-full">
              {centerLabel}
            </p>
            <p className="text-base font-black text-brand-ink mt-0.5">
              {hasData ? centerValue : '0'}
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          {hasData ? (
            drawn.map((seg) => (
              <div key={seg.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-[11px] font-bold text-brand-ink truncate">
                      {seg.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-brand-sage tabular-nums shrink-0">
                    {seg.ratio.toFixed(1)}%
                  </span>
                </div>
                <div className="h-px w-full bg-brand-surface" />
              </div>
            ))
          ) : (
            <p className="text-[11px] text-brand-sage font-medium">
              {selected === 'all'
                ? '종목을 추가하면 비중이 표시됩니다.'
                : '해당 카테고리에 보유 종목이 없어요.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
