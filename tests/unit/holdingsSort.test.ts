import { describe, it, expect } from 'vitest';
import type { HoldingView } from '@/hooks/useHoldingsView';
import { sortHoldingViews, nextSortMode, HOLDING_SORT_MODES } from '@/lib/holdingsSort';

function view(p: { id: string; totalValue: number; gainPct: number; dailyChangePct: number }): HoldingView {
  return {
    holding: { id: p.id } as HoldingView['holding'],
    totalValue: p.totalValue,
    gainPct: p.gainPct,
    dailyChangePct: p.dailyChangePct,
  } as HoldingView;
}

const sample = [
  view({ id: 'a', totalValue: 100, gainPct: 5, dailyChangePct: -1 }),
  view({ id: 'b', totalValue: 300, gainPct: -2, dailyChangePct: 3 }),
  view({ id: 'c', totalValue: 200, gainPct: 12, dailyChangePct: 1 }),
];

const ids = (vs: HoldingView[]) => vs.map((v) => v.holding.id);

describe('sortHoldingViews', () => {
  it('value: largest total first', () => {
    expect(ids(sortHoldingViews(sample, 'value'))).toEqual(['b', 'c', 'a']);
  });

  it('return: highest gain% first (incl. negatives last)', () => {
    expect(ids(sortHoldingViews(sample, 'return'))).toEqual(['c', 'a', 'b']);
  });

  it('daily: highest daily change% first', () => {
    expect(ids(sortHoldingViews(sample, 'daily'))).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const copy = [...sample];
    sortHoldingViews(sample, 'value');
    expect(sample).toEqual(copy);
  });
});

describe('nextSortMode', () => {
  it('cycles value → return → daily → value', () => {
    expect(nextSortMode('value')).toBe('return');
    expect(nextSortMode('return')).toBe('daily');
    expect(nextSortMode('daily')).toBe('value');
  });

  it('every mode has a label', () => {
    for (const m of ['value', 'return', 'daily'] as const) {
      expect(HOLDING_SORT_MODES.find((x) => x.mode === m)?.label).toBeTruthy();
    }
  });
});
