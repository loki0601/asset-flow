/**
 * FX rate helpers. Server-side fetch-prices.py drops a USD/KRW close into
 * prices.json under `fx`; /api/prices forwards it, syncPrices persists it
 * here. Display layers use getFxRate('USDKRW') to normalize USD-denominated
 * holdings to KRW.
 */

import { kvGet, kvSet } from '@/lib/db';
import { fxHistoryRepo, type FxHistoryRow } from '@/lib/fxHistoryRepo';

const FX_KEY = 'assetflow:fx:rates';
/** Sensible default when the server hasn't delivered a rate yet — prevents
 *  totalValue collapsing to 0 for US holdings on a fresh install. */
const FALLBACK_USDKRW = 1400;

export function setFxRates(rates: Record<string, number>): void {
  if (!rates || Object.keys(rates).length === 0) return;
  kvSet(FX_KEY, JSON.stringify(rates));
}

export function getFxRates(): Record<string, number> {
  const raw = kvGet(FX_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function getFxRate(pair: string): number {
  const rates = getFxRates();
  if (rates[pair] && rates[pair] > 0) return rates[pair];
  if (pair === 'USDKRW') return FALLBACK_USDKRW;
  return 1;
}

/** Convert a USD amount to KRW using the persisted rate. */
export function usdToKrw(usd: number): number {
  return usd * getFxRate('USDKRW');
}

/**
 * Pull the missing per-day FX rates from the server and append them to the
 * client cache. Without this, once the cache has been seeded the settings
 * page rate card (and the historical-rate path in computePortfolioFlow)
 * never picks up newer daily rates.
 *
 * Idempotent: requests only the window after the current localMax so the
 * usual case is a 0–N row response. UPSERT-on-append makes a duplicate
 * harmless if the windowing ever drifts.
 */
export async function syncFxHistory(
  fetchImpl: typeof fetch,
  pair: string = 'USDKRW',
): Promise<void> {
  const localMax = fxHistoryRepo.getMaxDate(pair);
  const from = localMax ? nextCalendarDay(localMax) : '2000-01-01';
  try {
    const res = await fetchImpl(
      `/api/fx/history?pair=${encodeURIComponent(pair)}&from=${from}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { rows?: FxHistoryRow[] };
    if (Array.isArray(data.rows) && data.rows.length > 0) {
      fxHistoryRepo.append(pair, data.rows);
    }
  } catch {
    /* best-effort — surfaced by the rate card staying on yesterday's value */
  }
}

function nextCalendarDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
