/**
 * Client-side price sync. Pulls daily-close prices from `/api/prices` and
 * patches the locally-cached catalog (price fields only) without touching
 * the catalog version or running migrations.
 *
 * When given a list of held symbols, also reconciles the local
 * price_history table with the server's history feed:
 *   - 0 local rows           → GET /api/prices/history (full backfill)
 *   - local_max = latest BD  → skip
 *   - 1 BD gap               → append today's close from the bulk payload
 *   - 2+ BD gap              → skip (per design: per-symbol catch-up via
 *                              individual calls is intentionally avoided)
 */

import { kvGet, kvSet } from '@/lib/db';
import { invalidateCatalogCache, listLocalAssets } from '@/lib/catalog';
import { priceHistoryRepo, type PriceHistoryRow } from '@/lib/priceHistoryRepo';
import { setFxRates } from '@/lib/fx';
import type { MarketAsset } from '@/lib/schema';

const ASSETS_KEY = 'assetflow:catalog:assets';
const LAST_SYNC_KEY = 'assetflow:prices:lastSyncAt';
const FULL_BACKFILL_FROM = '2016-01-01';

export interface PriceEntry {
  price: number;
  change: number;
  changePct: number;
}

export interface PricePayload {
  version: string;
  asOf: string;
  prices: Record<string, PriceEntry>;
  /** Last ~30 KRX business days (ascending). Optional for back-compat with
   *  earlier callers; sync-history logic short-circuits when absent. */
  recentBusinessDays?: string[];
  /** USD/KRW (and any future FX pairs) keyed by 6-letter pair code. */
  fx?: Record<string, number>;
}

interface HistoryResp {
  symbol: string;
  status: 'pending' | 'ready' | 'failed' | 'unknown';
  rows: PriceHistoryRow[];
}

export function getLastPriceSyncAt(): string | null {
  return kvGet(LAST_SYNC_KEY);
}

export function trackSymbolHistory(symbol: string, fetchImpl: typeof fetch = fetch): void {
  void fetchImpl('/api/prices/history/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  }).catch((err) => {
    console.warn('[trackSymbolHistory] failed', err);
  });
}

/**
 * Compute the business-day gap between `localMax` and `latest`, using the
 * supplied business-day list. Returns:
 *   - 0  : already in sync
 *   - 1  : exactly one business day behind
 *   - 2+ : multi-day gap (or no overlap with the BD list)
 */
function businessDayGap(localMax: string, latest: string, businessDays: string[]): number {
  if (localMax === latest) return 0;
  const iLocal = businessDays.indexOf(localMax);
  const iLatest = businessDays.indexOf(latest);
  if (iLocal < 0 || iLatest < 0) return 2; // treat unknown as "big gap"
  return iLatest - iLocal;
}

async function syncHistoryFor(
  symbol: string,
  payload: PricePayload,
  fetchImpl: typeof fetch,
): Promise<void> {
  const businessDays = payload.recentBusinessDays ?? [];
  const latest = businessDays.length > 0 ? businessDays[businessDays.length - 1] : null;
  const localMax = priceHistoryRepo.getMaxDate(symbol);

  if (localMax === null) {
    // First sync — pull full range from server (server may still be backfilling,
    // in which case status≠ready and we just leave it for next time).
    const res = await fetchImpl(
      `/api/prices/history?symbol=${encodeURIComponent(symbol)}&from=${FULL_BACKFILL_FROM}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as HistoryResp;
    if (data.status === 'ready' && data.rows.length > 0) {
      priceHistoryRepo.append(symbol, data.rows);
    }
    return;
  }

  if (!latest) return; // No business-day list — can't reason about gap
  const gap = businessDayGap(localMax, latest, businessDays);
  if (gap === 0) return;
  if (gap === 1) {
    const todays = payload.prices[symbol];
    if (todays && todays.price > 0) {
      priceHistoryRepo.append(symbol, [{ date: latest, close: todays.price }]);
    }
    return;
  }
  // gap >= 2 — skip per requirement.
}

/**
 * Apply a price payload to the locally-cached catalog without touching the
 * server. Used both by syncPrices() (after the HTTP fetch) and by
 * nativeSync (after FirebaseMessagingService dropped a pre-fetched payload
 * into the app's files dir).
 */
export function applyPricePayload(data: PricePayload): void {
  const next: MarketAsset[] = listLocalAssets().map((a) => {
    const p = data.prices[a.symbol];
    if (!p) return a;
    return {
      ...a,
      currentPrice: p.price,
      dailyChange: p.change,
      dailyChangePct: p.changePct,
      updatedAt: data.asOf,
    };
  });
  kvSet(ASSETS_KEY, JSON.stringify(next));
  kvSet(LAST_SYNC_KEY, new Date().toISOString());
  invalidateCatalogCache();
  if (data.fx) setFxRates(data.fx);
}

export async function syncPrices(
  fetchImpl: typeof fetch = fetch,
  historySymbols: string[] = [],
): Promise<void> {
  const res = await fetchImpl('/api/prices');
  if (!res.ok) throw new Error(`prices fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as PricePayload;
  applyPricePayload(data);

  // Reconcile per-symbol history. Sequential to keep contention down — the
  // count is bounded by user holdings (typically < 50).
  for (const symbol of new Set(historySymbols)) {
    try {
      await syncHistoryFor(symbol, data, fetchImpl);
    } catch (err) {
      console.warn('[syncPrices] history sync failed for', symbol, err);
    }
  }
}

export interface LivePricePayload {
  asOf: string;
  prices: Record<string, { price: number; change: number; changePct: number; date: string }>;
  skipped: { symbol: string; reason: string }[];
}

export interface LiveSyncResult {
  applied: number;
  skipped: { symbol: string; reason: string }[];
}

/**
 * On-demand live-price refresh — calls /api/prices/live with the user's
 * held symbols only. Each returned tick:
 *   1. patches catalog.currentPrice/dailyChange/dailyChangePct
 *   2. upserts into priceHistoryRepo under the date the server reported
 *      (KRX/crypto: today KR; US: KR-tomorrow during US session — matches
 *      cron convention so the next 15:35 KST run cleanly overwrites the
 *      temporary live tick with the official close).
 *
 * Server filters symbols by market hours, so an empty `applied` count
 * with a populated `skipped` is the expected response off-hours.
 */
export async function syncLivePrices(
  symbols: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<LiveSyncResult> {
  const unique = Array.from(new Set(symbols)).filter(Boolean);
  if (unique.length === 0) return { applied: 0, skipped: [] };
  const url = `/api/prices/live?symbols=${encodeURIComponent(unique.join(','))}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`live prices fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as LivePricePayload;

  // 1) Patch catalog in one batch so we trigger a single persistDb microtask.
  const livePayload: PricePayload = {
    version: '',
    asOf: data.asOf,
    prices: Object.fromEntries(
      Object.entries(data.prices).map(([sym, p]) => [
        sym,
        { price: p.price, change: p.change, changePct: p.changePct },
      ]),
    ),
  };
  applyPricePayload(livePayload);

  // 2) Upsert per-symbol into priceHistoryRepo so the asset-flow chart's
  //    last point reflects the live tick.
  for (const [symbol, p] of Object.entries(data.prices)) {
    try {
      priceHistoryRepo.append(symbol, [{ date: p.date, close: p.price }]);
    } catch (err) {
      console.warn('[syncLivePrices] history upsert failed for', symbol, err);
    }
  }

  return { applied: Object.keys(data.prices).length, skipped: data.skipped };
}
