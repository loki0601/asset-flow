import { kvGet, kvSet } from '@/lib/db';
import { holdingsRepo, transactionsRepo } from '@/lib/repos';
import type {
  CatalogMigration,
  CatalogResponse,
  Holding,
  MarketAsset,
  Transaction,
  User,
} from '@/lib/schema';

const VERSION_KEY = 'assetflow:catalog:version';
const ASSETS_KEY = 'assetflow:catalog:assets';
const LAST_SYNC_KEY = 'assetflow:catalog:lastSyncAt';
const USERS_KEY = 'assetflow:users';

export function getLocalCatalogVersion(): string {
  return kvGet(VERSION_KEY) ?? '0.0.0';
}

// Module-level cache for the parsed asset list. Catalogue is ~500KB / ~5000
// entries — re-parsing on every getMarketAsset(symbol) lookup costs ~50ms,
// and useHoldingsView calls it once per holding inside a useMemo, so every
// page transition was paying tens-of-milliseconds × dozens of holdings.
let assetsCache: { version: string; list: MarketAsset[]; map: Map<string, MarketAsset> } | null = null;

function buildCache(): typeof assetsCache {
  const raw = kvGet(ASSETS_KEY);
  if (!raw) return null;
  let list: MarketAsset[] = [];
  try {
    list = JSON.parse(raw) as MarketAsset[];
  } catch {
    return null;
  }
  const version = kvGet(VERSION_KEY) ?? '';
  const map = new Map<string, MarketAsset>();
  for (const a of list) map.set(a.symbol, a);
  return { version, list, map };
}

function getCache(): typeof assetsCache {
  const currentVersion = kvGet(VERSION_KEY) ?? '';
  if (assetsCache && assetsCache.version === currentVersion) return assetsCache;
  assetsCache = buildCache();
  return assetsCache;
}

/** Reset the cached asset list. Called after a catalog sync writes new data. */
export function invalidateCatalogCache(): void {
  assetsCache = null;
}

export function listLocalAssets(): MarketAsset[] {
  return getCache()?.list ?? [];
}

export function getLocalAsset(symbol: string): MarketAsset | undefined {
  return getCache()?.map.get(symbol);
}

export function setLocalCatalog(version: string, assets: MarketAsset[]): void {
  kvSet(ASSETS_KEY, JSON.stringify(assets));
  kvSet(VERSION_KEY, version);
  kvSet(LAST_SYNC_KEY, new Date().toISOString());
  invalidateCatalogCache();
}

export function getLastSyncAt(): string | null {
  return kvGet(LAST_SYNC_KEY);
}

export function hasLocalCatalog(): boolean {
  return kvGet(ASSETS_KEY) !== null;
}

function listUserIds(): string[] {
  const raw = kvGet(USERS_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as User[]).map((u) => u.id);
  } catch {
    return [];
  }
}

function rewriteUserHoldings(transform: (h: Holding) => Holding | null): void {
  for (const userId of listUserIds()) {
    const arr = holdingsRepo.list(userId);
    const next = arr.map((h) => transform(h)).filter((h): h is Holding => h !== null);
    holdingsRepo.replaceAll(userId, next);
  }
}

function rewriteUserTransactions(transform: (t: Transaction) => Transaction | null): void {
  for (const userId of listUserIds()) {
    const arr = transactionsRepo.list(userId);
    const next = arr.map((t) => transform(t)).filter((t): t is Transaction => t !== null);
    transactionsRepo.replaceAll(userId, next);
  }
}

/**
 * Apply one catalog migration to local user data. Pure data transform —
 * does not touch the cached assets list (that comes from the server payload).
 */
export function applyMigration(m: CatalogMigration): void {
  switch (m.op.kind) {
    case 'rename_symbol': {
      const { from, to } = m.op;
      rewriteUserHoldings((h) => (h.symbol === from ? { ...h, symbol: to } : h));
      rewriteUserTransactions((t) => (t.symbol === from ? { ...t, symbol: to } : t));
      return;
    }
    case 'split': {
      const { symbol, ratio } = m.op;
      if (ratio <= 0) return;
      rewriteUserHoldings((h) =>
        h.symbol === symbol
          ? { ...h, quantity: h.quantity * ratio, avgPrice: h.avgPrice / ratio }
          : h,
      );
      return;
    }
    case 'merge': {
      // Treat as rename + ratio adjustment (1:ratio share conversion)
      const { from, to, ratio } = m.op;
      if (ratio <= 0) return;
      rewriteUserHoldings((h) =>
        h.symbol === from
          ? { ...h, symbol: to, quantity: h.quantity * ratio, avgPrice: h.avgPrice / ratio }
          : h,
      );
      rewriteUserTransactions((t) => (t.symbol === from ? { ...t, symbol: to } : t));
      return;
    }
    case 'deprecate':
    case 'noop':
      // No user-data side effect. Deprecation surfaces via the asset list
      // flag returned by the server payload.
      return;
  }
}

/**
 * Fetch the latest catalog + migrations from the server, apply migrations
 * to local user data, and store the new asset list & version.
 *
 * Throws on network failure — caller may choose to swallow errors to allow
 * the app to keep running with the cached catalog.
 */
export async function syncCatalog(fetchImpl: typeof fetch = fetch): Promise<void> {
  const since = getLocalCatalogVersion();
  const res = await fetchImpl(`/api/catalog?since=${encodeURIComponent(since)}`);
  if (!res.ok) throw new Error(`catalog fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as CatalogResponse;
  for (const m of data.migrations) applyMigration(m);
  setLocalCatalog(data.version, data.assets);
}
