/**
 * Client-side price sync. Pulls daily-close prices from `/api/prices` and
 * patches the locally-cached catalog (price fields only) without touching
 * the catalog version or running migrations.
 *
 * When given a list of held symbols, also mirrors the server's history feed
 * into the local price_history table (the server is the only source of
 * truth — the client never fabricates rows):
 *   - no current deep-backfill flag → purge local rows, full refetch
 *   - otherwise                     → refetch from localMax INCLUSIVE, so a
 *                                     live intraday tick on the last date is
 *                                     replaced by the official close
 */

import { kvGet, kvSet } from '@/lib/db';
import { invalidateCatalogCache, listLocalAssets } from '@/lib/catalog';
import { priceHistoryRepo, type PriceHistoryRow } from '@/lib/priceHistoryRepo';
import { setFxRates } from '@/lib/fx';
import type { MarketAsset } from '@/lib/schema';

const ASSETS_KEY = 'assetflow:catalog:assets';
const LAST_SYNC_KEY = 'assetflow:prices:lastSyncAt';
const FULL_BACKFILL_FROM = '2016-01-01';
// Per-symbol kv flag set after a purge + deep fetch from FULL_BACKFILL_FROM
// has succeeded. Versioned: bumping the suffix forces every client to drop
// its local history once and re-mirror the server. v2 = the 2026-10 repair
// (intraday ticks stored as closes, weekend/holiday copies, US closes
// stamped with the next KST date).
const fullBackfillFlagKey = (symbol: string) =>
  `assetflow:priceHistory:fullBackfilled:v2:${symbol}`;

function isFullBackfilled(symbol: string): boolean {
  return kvGet(fullBackfillFlagKey(symbol)) === '1';
}

/** Mark a symbol as having completed its deep history backfill. Exported so
 *  tests covering the gap-path behavior can pre-seed it without going through
 *  a real /api/prices/history fetch. */
export function markFullBackfilled(symbol: string): void {
  kvSet(fullBackfillFlagKey(symbol), '1');
}

/** True iff at least one held symbol still needs a deep-history pull.
 *  AuthProvider's boot block uses this to bypass the 15-minute price-sync
 *  cooldown the very first time after a deep-backfill schema change —
 *  otherwise a user who just restarted the app would have to wait out the
 *  cooldown (or tap refresh) before getting the historical rows. */
export function needsDeepBackfill(symbols: readonly string[]): boolean {
  for (const s of symbols) {
    if (!isFullBackfilled(s)) return true;
  }
  return false;
}

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

/**
 * True while a recent-enough sync makes another /api/prices pull pointless.
 * Shared by the boot sync (15-min window) and the resume-from-background
 * sync (5-min window). A missing/garbage timestamp counts as "never synced"
 * so the sync always proceeds.
 */
export function isPriceSyncCooldownActive(
  lastSyncAt: string | null,
  nowMs: number,
  cooldownMs: number,
): boolean {
  if (!lastSyncAt) return false;
  const lastMs = Date.parse(lastSyncAt);
  if (Number.isNaN(lastMs)) return false;
  return nowMs - lastMs < cooldownMs;
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

async function syncHistoryFor(symbol: string, fetchImpl: typeof fetch): Promise<void> {
  const localMax = priceHistoryRepo.getMaxDate(symbol);
  const deep = localMax === null || !isFullBackfilled(symbol);
  const from = deep ? FULL_BACKFILL_FROM : localMax;
  const res = await fetchImpl(
    `/api/prices/history?symbol=${encodeURIComponent(symbol)}&from=${from}`,
  );
  if (!res.ok) return;
  const data = (await res.json()) as HistoryResp;
  // Server may still be backfilling (status≠ready) — leave the local cache
  // untouched and retry next sync.
  if (data.status !== 'ready' || data.rows.length === 0) return;
  if (deep) priceHistoryRepo.deleteSymbol(symbol);
  priceHistoryRepo.append(symbol, data.rows);
  if (deep) markFullBackfilled(symbol);
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
      await syncHistoryFor(symbol, fetchImpl);
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
