import { describe, it, expect } from 'vitest';
import { monthMatrix, shiftMonth, yearGrid } from '@/lib/calendar';

describe('monthMatrix', () => {
  it('returns a 6-week × 7-day grid', () => {
    const grid = monthMatrix(2026, 5); // June 2026 (month is 0-based)
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it('starts each week on Sunday', () => {
    const grid = monthMatrix(2026, 5);
    for (const week of grid) {
      const d = new Date(`${week[0].date}T00:00:00Z`);
      expect(d.getUTCDay()).toBe(0); // Sunday
    }
  });

  it('marks exactly the days of the target month as inMonth', () => {
    const grid = monthMatrix(2026, 5); // June has 30 days
    const inMonth = grid.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0].date).toBe('2026-06-01');
    expect(inMonth[inMonth.length - 1].date).toBe('2026-06-30');
  });

  it('fills leading/trailing cells from adjacent months (not inMonth)', () => {
    const grid = monthMatrix(2026, 5);
    const flat = grid.flat();
    // First cell precedes June 1 and belongs to May.
    expect(flat[0].inMonth).toBe(false);
    expect(flat[0].date < '2026-06-01').toBe(true);
    // Last cell follows June 30 and belongs to July.
    expect(flat[flat.length - 1].inMonth).toBe(false);
    expect(flat[flat.length - 1].date > '2026-06-30').toBe(true);
  });

  it('handles a February in a non-leap year (28 days)', () => {
    const grid = monthMatrix(2026, 1); // Feb 2026
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(28);
  });
});

describe('shiftMonth', () => {
  it('advances within a year', () => {
    expect(shiftMonth(2026, 5, 1)).toEqual({ year: 2026, month: 6 });
  });

  it('rolls over the year boundary forward', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('rolls back over the year boundary', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('yearGrid', () => {
  it('returns a stable 12-year page containing the given year', () => {
    const years = yearGrid(2026);
    expect(years).toHaveLength(12);
    expect(years).toContain(2026);
    expect(years[0]).toBe(2016); // floor(2026/12)*12
    expect(years[11]).toBe(2027);
  });

  it('keeps every year in the same block on the same page', () => {
    expect(yearGrid(2016)).toEqual(yearGrid(2027));
  });

  it('moves to the next page for the following block', () => {
    expect(yearGrid(2028)[0]).toBe(2028);
  });
});
