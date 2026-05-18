import { describe, expect, it } from 'vitest';
import { indexEventStatusLabel } from '@/lib/insightsLabels';

describe('indexEventStatusLabel', () => {
  it('returns null when the effective date is today (date badge takes over)', () => {
    expect(indexEventStatusLabel('2026-05-18', '2026-05-18')).toBeNull();
  });

  it('returns D-N when the effective date is in the future', () => {
    expect(indexEventStatusLabel('2026-05-28', '2026-05-18')).toBe('D-10');
    expect(indexEventStatusLabel('2026-05-19', '2026-05-18')).toBe('D-1');
  });

  it('returns "완료" when the effective date is in the past', () => {
    expect(indexEventStatusLabel('2026-05-17', '2026-05-18')).toBe('완료');
  });

  it('handles month/year boundaries without timezone drift', () => {
    expect(indexEventStatusLabel('2027-01-01', '2026-12-22')).toBe('D-10');
  });
});
