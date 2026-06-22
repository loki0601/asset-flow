import { describe, it, expect } from 'vitest';
import { todaySeoulISO } from '@/lib/today';

describe('todaySeoulISO', () => {
  it('returns the KST calendar date, not the UTC one', () => {
    // 23:00 UTC is already 08:00 KST the next day — the daily 08:00 KST push
    // must see the new day, which the old toISOString() path got wrong.
    expect(todaySeoulISO(new Date('2026-06-10T23:00:00Z'))).toBe('2026-06-11');
  });

  it('stays on the same day during KST daytime', () => {
    // 05:00 UTC = 14:00 KST, same date.
    expect(todaySeoulISO(new Date('2026-06-10T05:00:00Z'))).toBe('2026-06-10');
  });

  it('rolls over exactly at KST midnight (15:00 UTC)', () => {
    expect(todaySeoulISO(new Date('2026-06-10T14:59:00Z'))).toBe('2026-06-10');
    expect(todaySeoulISO(new Date('2026-06-10T15:00:00Z'))).toBe('2026-06-11');
  });
});
