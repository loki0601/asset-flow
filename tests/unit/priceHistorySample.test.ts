import { describe, it, expect } from 'vitest';
import { resampleByMode, type ChartMode } from '@/lib/priceHistorySample';
import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

function makeRows(start: string, count: number, base = 100): PriceHistoryRow[] {
  const out: PriceHistoryRow[] = [];
  const startDate = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    out.push({ date: d.toISOString().slice(0, 10), close: base + i });
  }
  return out;
}

describe('resampleByMode', () => {
  it('D mode returns rows unchanged', () => {
    const rows = makeRows('2026-01-01', 10);
    const out = resampleByMode(rows, 'D');
    expect(out).toEqual(rows);
  });

  it('W mode keeps only the last row of each ISO week', () => {
    // 2026-01-05 = Monday. 14 days → 2 full weeks + a few days.
    const rows = makeRows('2026-01-05', 14);
    const out = resampleByMode(rows, 'W');
    // Each Sunday or last day of week becomes a point. Last row always kept.
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[out.length - 1]).toEqual(rows[rows.length - 1]);
  });

  it('W mode preserves ascending date order', () => {
    const rows = makeRows('2026-01-01', 30);
    const out = resampleByMode(rows, 'W');
    for (let i = 1; i < out.length; i++) {
      expect(out[i].date > out[i - 1].date).toBe(true);
    }
  });

  it('Y mode keeps one row per calendar year (the latest)', () => {
    const rows: PriceHistoryRow[] = [
      { date: '2024-03-01', close: 10 },
      { date: '2024-12-30', close: 20 },
      { date: '2025-06-15', close: 30 },
      { date: '2025-12-31', close: 40 },
      { date: '2026-05-15', close: 50 },
    ];
    const out = resampleByMode(rows, 'Y');
    expect(out).toEqual([
      { date: '2024-12-30', close: 20 },
      { date: '2025-12-31', close: 40 },
      { date: '2026-05-15', close: 50 },
    ]);
  });

  it('empty input returns empty array for every mode', () => {
    const modes: ChartMode[] = ['D', 'W', 'Y'];
    for (const m of modes) {
      expect(resampleByMode([], m)).toEqual([]);
    }
  });

  it('single row passes through any mode', () => {
    const r = [{ date: '2026-05-15', close: 100 }];
    expect(resampleByMode(r, 'D')).toEqual(r);
    expect(resampleByMode(r, 'W')).toEqual(r);
    expect(resampleByMode(r, 'Y')).toEqual(r);
  });
});
