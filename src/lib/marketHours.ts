/**
 * Pure helpers for the live-quote feature. Determines which market a symbol
 * belongs to, whether that market is currently in a "live tick worth
 * fetching" window, and which date row a live tick should be stored under
 * in price_history.
 *
 * All time logic is Asia/Seoul (KST, UTC+9, no DST) — the user lives there
 * and our cron + price_history table use KST dates as their convention.
 *
 * US date mapping rationale: cron at KR-15:35 stores the *previous* US
 * close into the *current* KR date row, so a US row is "KR date − 1 day in
 * US/Eastern". For a live tick captured DURING a US session, we mirror
 * that convention by storing under "US trading date + 1 day in KR" so the
 * next cron will cleanly overwrite the temporary live tick with the
 * official close.
 */

export type MarketKind = 'KRX' | 'US' | 'CRYPTO' | 'UNKNOWN';

export function classifyMarket(symbol: string): MarketKind {
  if (symbol.startsWith('KRX:')) return 'KRX';
  if (symbol.startsWith('NASDAQ:') || symbol.startsWith('NYSE:')) return 'US';
  if (symbol.startsWith('CRYPTO:')) return 'CRYPTO';
  // Plain ticker (e.g. "BTC") — treat as crypto by default. Catalog wraps
  // everything else in a prefix, so this fallback is mostly for safety.
  if (!symbol.includes(':')) return 'CRYPTO';
  return 'UNKNOWN';
}

/** Date components in Asia/Seoul (KST, UTC+9). */
function kstParts(d: Date): { year: number; month: number; day: number; weekday: number; hour: number; minute: number } {
  // Asia/Seoul has been fixed at UTC+9 since 1961-08-09 — no DST, no
  // ambiguity, so a manual offset is safer than Intl which can drift
  // between Node versions.
  const ms = d.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(ms);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    weekday: kst.getUTCDay(), // 0 = Sun, 6 = Sat
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

function fmtDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayKR(d: Date): string {
  const p = kstParts(d);
  return fmtDate(p.year, p.month, p.day);
}

function addDaysKR(isoDate: string, days: number): string {
  const [y, m, dd] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  t.setUTCDate(t.getUTCDate() + days);
  return fmtDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function isLiveWindow(symbol: string, now: Date): boolean {
  const kind = classifyMarket(symbol);
  if (kind === 'CRYPTO') return true;
  if (kind === 'UNKNOWN') return false;
  const p = kstParts(now);

  if (kind === 'KRX') {
    // Mon–Fri only; 09:00 ≤ t ≤ 15:30 KST.
    if (p.weekday === 0 || p.weekday === 6) return false;
    const minutes = p.hour * 60 + p.minute;
    return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
  }

  // US: KST 22:30 → 05:00 next morning. A live tick at KR-Mon 23:00 sits in
  // US-Mon trading; at KR-Tue 04:00 sits in US-Mon trading too (US close at
  // 16:00 EDT = KR 05:00). Weekend block: US-Sat/Sun mornings KR = US-Fri
  // night → still live, so we exclude only KR-Sun-evening through KR-Mon-
  // afternoon (no US session on US-Sat/Sun). Specifically: skip when the
  // *prospective US trading day* (KR date − 1) lands on US-Sat or US-Sun.
  const minutes = p.hour * 60 + p.minute;
  const inWindow = minutes >= 22 * 60 + 30 || minutes < 5 * 60;
  if (!inWindow) return false;
  // KR weekday at this instant: figure out which US calendar day the tick
  // would map to. Cron convention: US trading day = KR date − 1.
  // KR-Sun (0) night → US-Sat trading? No, that's US-Sun morning. Block.
  // KR-Sat night → US-Fri evening (US-Fri trading session ends 16:00 EDT =
  // KR-Sat 05:00). After KR-Sat 05:00 → US weekend until KR-Mon 22:30.
  if (minutes < 5 * 60) {
    // 00:00–04:59 KR — corresponds to US "yesterday" still trading
    // (US session 09:30–16:00 EDT = KR previous day 22:30 → today 05:00).
    // Block when KR weekday is Sat (so US-Fri session = OK at KR-Sat 04:59,
    // but US session itself ended at KR-Sat 05:00). Block Sun (US-Sat = no
    // trading) and Mon (US-Sun = no trading).
    if (p.weekday === 0 /* Sun */ || p.weekday === 1 /* Mon */) return false;
    return true;
  }
  // 22:30–23:59 KR — US session just opened (09:30 EDT = KR 22:30). Block
  // when KR weekday is Sat or Sun.
  if (p.weekday === 0 /* Sun */ || p.weekday === 6 /* Sat */) return false;
  return true;
}

/** Returns the price_history date row a live tick should be written to,
 *  or null when the market is closed. */
export function liveDateFor(symbol: string, now: Date): string | null {
  if (!isLiveWindow(symbol, now)) return null;
  const kind = classifyMarket(symbol);
  if (kind !== 'US') return todayKR(now);
  // US: target row = US trading day + 1 (to match cron's convention)
  const p = kstParts(now);
  const minutes = p.hour * 60 + p.minute;
  if (minutes >= 22 * 60 + 30) {
    // KR evening 22:30–23:59 — US trading just started, US trading day = KR today.
    // Target = KR today + 1.
    return addDaysKR(todayKR(now), 1);
  }
  // KR early morning 00:00–04:59 — US trading session of "yesterday US" still
  // running. US trading day = KR yesterday. Target = KR yesterday + 1 = KR today.
  return todayKR(now);
}
