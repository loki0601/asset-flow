/**
 * Sort modes for the dashboard Holdings list. Cycled by the header toggle
 * button. Pure + testable; the component only holds the current mode.
 */

import type { HoldingView } from '@/hooks/useHoldingsView';

export type HoldingSortMode = 'value' | 'return' | 'daily';

export const HOLDING_SORT_MODES: { mode: HoldingSortMode; label: string }[] = [
  { mode: 'value', label: '총액순' },
  { mode: 'return', label: '수익률순' },
  { mode: 'daily', label: '일간순' },
];

const METRIC: Record<HoldingSortMode, (v: HoldingView) => number> = {
  value: (v) => v.totalValue,
  return: (v) => v.gainPct,
  daily: (v) => v.dailyChangePct,
};

/** Returns a new array sorted descending by the mode's metric. */
export function sortHoldingViews(views: HoldingView[], mode: HoldingSortMode): HoldingView[] {
  const metric = METRIC[mode];
  return [...views].sort((a, b) => metric(b) - metric(a));
}

/** Next mode in the toggle cycle. */
export function nextSortMode(mode: HoldingSortMode): HoldingSortMode {
  const i = HOLDING_SORT_MODES.findIndex((x) => x.mode === mode);
  return HOLDING_SORT_MODES[(i + 1) % HOLDING_SORT_MODES.length].mode;
}
