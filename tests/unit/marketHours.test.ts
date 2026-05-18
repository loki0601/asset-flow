import { describe, it, expect } from 'vitest';
import { liveDateFor, isLiveWindow, classifyMarket } from '@/lib/marketHours';

/**
 * Test inputs use ISO timestamps; the helpers interpret them in Asia/Seoul
 * (KST, UTC+9, no DST) regardless of the host TZ.
 *
 * Markets we care about:
 *   - KRX (KR symbols + KRX:GOLD): KST 09:00–15:30, weekdays
 *   - US (NASDAQ:* / NYSE:*): EDT/EST 09:30–16:00, which is KST 22:30–05:00
 *     (DST) or 23:30–06:00 (standard). We use a single year-round 22:30–05:00
 *     fast path; off-by-one-hour during US standard time is acceptable
 *     because yfinance still returns the same live tick when called.
 *   - Crypto: always live (24/7)
 */

describe('classifyMarket', () => {
  it('classifies KRX prefixes', () => {
    expect(classifyMarket('KRX:005930')).toBe('KRX');
    expect(classifyMarket('KRX:GOLD')).toBe('KRX');
    expect(classifyMarket('KRX:133690')).toBe('KRX');
  });
  it('classifies US prefixes', () => {
    expect(classifyMarket('NASDAQ:AAPL')).toBe('US');
    expect(classifyMarket('NYSE:GE')).toBe('US');
  });
  it('classifies crypto as CRYPTO', () => {
    expect(classifyMarket('CRYPTO:BTC')).toBe('CRYPTO');
    expect(classifyMarket('BTC')).toBe('CRYPTO');
  });
});

describe('isLiveWindow', () => {
  it('KRX live during weekday 09:00–15:30 KST', () => {
    // 2026-05-18 (Mon) 10:00 KST → 01:00 UTC
    expect(isLiveWindow('KRX:005930', new Date('2026-05-18T01:00:00Z'))).toBe(true);
    expect(isLiveWindow('KRX:005930', new Date('2026-05-18T06:30:00Z'))).toBe(true); // 15:30 KST
  });

  it('KRX outside window', () => {
    // Sunday 10:00 KST
    expect(isLiveWindow('KRX:005930', new Date('2026-05-17T01:00:00Z'))).toBe(false);
    // Weekday 16:00 KST
    expect(isLiveWindow('KRX:005930', new Date('2026-05-18T07:00:00Z'))).toBe(false);
    // Weekday 08:00 KST (pre-open)
    expect(isLiveWindow('KRX:005930', new Date('2026-05-17T23:00:00Z'))).toBe(false);
  });

  it('US live during KST 22:30 – 05:00 next day (Mon → Tue mornings)', () => {
    // Mon 23:00 KST = 14:00 UTC
    expect(isLiveWindow('NASDAQ:AAPL', new Date('2026-05-18T14:00:00Z'))).toBe(true);
    // Tue 04:00 KST = 19:00 UTC Mon
    expect(isLiveWindow('NASDAQ:AAPL', new Date('2026-05-18T19:00:00Z'))).toBe(true);
  });

  it('US outside window', () => {
    // Mon 18:00 KST = 09:00 UTC
    expect(isLiveWindow('NASDAQ:AAPL', new Date('2026-05-18T09:00:00Z'))).toBe(false);
    // Sat 23:00 KST = Sat 14:00 UTC — Friday US close already happened; weekend
    expect(isLiveWindow('NASDAQ:AAPL', new Date('2026-05-23T14:00:00Z'))).toBe(false);
  });

  it('Crypto is always live', () => {
    expect(isLiveWindow('CRYPTO:BTC', new Date('2026-05-18T01:00:00Z'))).toBe(true);
    expect(isLiveWindow('CRYPTO:BTC', new Date('2026-05-17T01:00:00Z'))).toBe(true);
  });
});

describe('liveDateFor', () => {
  it('KRX live tick → today KR date', () => {
    // Mon 10:00 KST = 2026-05-18 KR
    expect(liveDateFor('KRX:005930', new Date('2026-05-18T01:00:00Z'))).toBe('2026-05-18');
  });

  it('US live tick before midnight KR (KR 22:30–23:59) → tomorrow KR date', () => {
    // Mon 23:00 KST = 14:00 UTC → US-Mon trading day → store under KR-Tue (2026-05-19)
    expect(liveDateFor('NASDAQ:AAPL', new Date('2026-05-18T14:00:00Z'))).toBe('2026-05-19');
  });

  it('US live tick after midnight KR (00:00–05:00) → today KR date', () => {
    // Tue 04:00 KST = 19:00 UTC Mon → US-Mon trading day still → KR-Tue (2026-05-19)
    expect(liveDateFor('NASDAQ:AAPL', new Date('2026-05-18T19:00:00Z'))).toBe('2026-05-19');
  });

  it('Crypto → today KR date', () => {
    expect(liveDateFor('CRYPTO:BTC', new Date('2026-05-18T01:00:00Z'))).toBe('2026-05-18');
  });

  it('returns null when outside live window', () => {
    // Sunday 10:00 KST — KRX closed
    expect(liveDateFor('KRX:005930', new Date('2026-05-17T01:00:00Z'))).toBeNull();
    // Saturday 23:00 KST — US closed (weekend)
    expect(liveDateFor('NASDAQ:AAPL', new Date('2026-05-23T14:00:00Z'))).toBeNull();
  });
});
