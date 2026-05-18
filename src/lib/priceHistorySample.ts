/**
 * Down-sampling for the interactive price chart. Each chart mode collapses
 * the raw daily series to a different stride:
 *   D — every day (no change)
 *   W — last close per ISO week (Mon-Sun bucket)
 *   Y — last close per calendar year
 *
 * Input must be ascending by date.
 */

import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

export type ChartMode = 'D' | 'W' | 'Y';

function isoWeekKey(date: string): string {
  // Compute ISO-8601 week-year + week number. Robust enough for grouping.
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDay() || 7; // Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function yearKey(date: string): string {
  return date.slice(0, 4);
}

function lastPerBucket(
  rows: PriceHistoryRow[],
  keyFn: (date: string) => string,
): PriceHistoryRow[] {
  const out: PriceHistoryRow[] = [];
  let currentKey = '';
  let currentRow: PriceHistoryRow | null = null;
  for (const r of rows) {
    const k = keyFn(r.date);
    if (k !== currentKey) {
      if (currentRow) out.push(currentRow);
      currentKey = k;
    }
    currentRow = r;
  }
  if (currentRow) out.push(currentRow);
  return out;
}

export function resampleByMode(rows: PriceHistoryRow[], mode: ChartMode): PriceHistoryRow[] {
  if (rows.length <= 1) return rows.slice();
  if (mode === 'D') return rows.slice();
  if (mode === 'W') return lastPerBucket(rows, isoWeekKey);
  return lastPerBucket(rows, yearKey);
}
