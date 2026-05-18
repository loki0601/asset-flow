/**
 * FX rate helpers. Server-side fetch-prices.py drops a USD/KRW close into
 * prices.json under `fx`; /api/prices forwards it, syncPrices persists it
 * here. Display layers use getFxRate('USDKRW') to normalize USD-denominated
 * holdings to KRW.
 */

import { kvGet, kvSet } from '@/lib/db';

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
