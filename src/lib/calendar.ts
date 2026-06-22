/**
 * Pure date-grid helpers for the in-house RangeCalendar. No dependencies —
 * all arithmetic goes through UTC so the produced YYYY-MM-DD strings never
 * drift by a timezone offset.
 */

export interface DayCell {
  /** YYYY-MM-DD */
  date: string;
  /** True when the cell belongs to the rendered month (vs. an adjacent-month
   *  filler day shown greyed out). */
  inMonth: boolean;
}

/**
 * 6-week × 7-day matrix for `month` (0-based) of `year`, Sunday-first. Leading
 * and trailing cells are filled from the adjacent months and flagged
 * `inMonth: false`.
 */
export function monthMatrix(year: number, month: number): DayCell[][] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sun
  const weeks: DayCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(Date.UTC(year, month, 1 - firstWeekday + w * 7 + d));
      row.push({
        date: cur.toISOString().slice(0, 10),
        inMonth: cur.getUTCMonth() === month,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** The 12-year page (block) containing `year`, e.g. 2026 → 2016..2027. Used by
 *  the calendar's year picker so paging is stable regardless of which year in
 *  the block is selected. */
export function yearGrid(year: number): number[] {
  const start = Math.floor(year / 12) * 12;
  return Array.from({ length: 12 }, (_, i) => start + i);
}

/** Move `delta` months from (year, month), rolling the year over as needed. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}
