import { describe, expect, it } from 'vitest';
import { eventVerb } from '@/lib/eventVerb';

const ev = (kind: string, tags: string[] = []) => ({ kind, tags });

describe('eventVerb', () => {
  it('maps index events', () => {
    expect(eventVerb(ev('index_addition')).label).toBe('편입');
    expect(eventVerb(ev('index_addition')).tone).toBe('up');
    expect(eventVerb(ev('index_removal')).label).toBe('제외');
    expect(eventVerb(ev('index_removal')).tone).toBe('down');
  });

  it('maps ipo sections', () => {
    expect(eventVerb(ev('ipo', ['priced'])).label).toBe('가격 확정');
    expect(eventVerb(ev('ipo', ['upcoming'])).label).toBe('IPO 예정');
    expect(eventVerb(ev('ipo', ['filed'])).label).toBe('S-1 접수');
  });

  it('maps lockup d10 vs dday', () => {
    expect(eventVerb(ev('lockup_expiry', ['lockup', 'post-ipo', 'nasdaq100', 'd10'])).label).toBe(
      '락업 D-10',
    );
    expect(eventVerb(ev('lockup_expiry', ['lockup', 'post-ipo', 'nasdaq100', 'dday'])).label).toBe(
      '락업 당일',
    );
  });

  it('maps earnings', () => {
    expect(eventVerb(ev('earnings')).label).toBe('실적');
  });

  it('maps momentum sub-types', () => {
    expect(eventVerb(ev('momentum', ['price-up-1d', 'momentum'])).label).toBe('급등');
    expect(eventVerb(ev('momentum', ['price-down-1d', 'momentum'])).label).toBe('급락');
    expect(eventVerb(ev('momentum', ['rank-up-1d', 'momentum'])).label).toBe('랭크 +10↑');
    expect(eventVerb(ev('momentum', ['rank-down-1d', 'momentum'])).label).toBe('랭크 -10↓');
    expect(eventVerb(ev('momentum', ['rank-up-5d', 'momentum'])).label).toBe('5일 +20↑');
    expect(eventVerb(ev('momentum', ['top30-breakout', 'momentum'])).label).toBe('TOP30 진입');
    expect(eventVerb(ev('momentum', ['momentum', 'sector-cluster', 'up'])).label).toBe(
      '섹터 동반 상승',
    );
    expect(eventVerb(ev('momentum', ['momentum', 'sector-cluster', 'down'])).label).toBe(
      '섹터 동반 하락',
    );
  });

  it('maps macro events to a generic label (event name carries detail)', () => {
    expect(eventVerb(ev('macro')).label).toBe('매크로');
  });

  it('falls back to kind for truly unknown kinds', () => {
    expect(eventVerb(ev('unknown_kind')).label).toBe('unknown_kind');
  });
});
