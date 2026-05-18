/**
 * Server-side market catalog. Source of truth for assets that the
 * `/api/catalog` endpoint exposes to the client.
 *
 * Data layout:
 *   src/server/data/krx.json     — Korean equities (FinanceDataReader output)
 *   src/server/data/us.json      — S&P500 + NASDAQ
 *   src/server/data/crypto.json  — Top 100 coins from CoinGecko
 *   src/server/data/prices.json  — Daily-close prices, joined into the response
 *
 * Update commands (catalog: monthly/manual, prices: daily after 15:30 KST):
 *   .venv/bin/python scripts/fetch-catalog.py
 *   .venv/bin/python scripts/fetch-us-catalog.py
 *   .venv/bin/python scripts/fetch-crypto-catalog.py
 *   .venv/bin/python scripts/fetch-prices.py
 *
 * Versioning rules (carry over from previous design):
 *   - SERVER_VERSION must be bumped on every published change.
 *   - For renames/splits/deprecations, append a CatalogMigration entry
 *     to MIGRATIONS; clients apply migrations whose version > local.
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  AssetCategory,
  CatalogMigration,
  MarketAsset,
} from '@/lib/schema';
import { aliasFor } from '@/server/data/usAliases';

// 3.6.0 — adds nameKo (Korean alias) on US-listed assets. Clients on older
// versions fall back to the English name and re-sync on next version probe.
export const SERVER_VERSION = '3.6.0';

interface RawAsset {
  symbol: string;
  name: string;
  market: string;
}

interface RawCatalog {
  as_of: string;
  count: number;
  assets: RawAsset[];
}

interface RawPrice {
  price: number;
  change: number;
  changePct: number;
}

interface RawPriceFile {
  as_of: string;
  count: number;
  prices: Record<string, RawPrice>;
  fx?: Record<string, number>;
}

const DATA_DIR = path.join(process.cwd(), 'src/server/data');

function readCatalog(file: string): RawCatalog {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    return { as_of: '', count: 0, assets: [] };
  }
  return JSON.parse(fs.readFileSync(full, 'utf-8')) as RawCatalog;
}

function readPrices(): RawPriceFile {
  const full = path.join(DATA_DIR, 'prices.json');
  if (!fs.existsSync(full)) {
    return { as_of: '', count: 0, prices: {} };
  }
  return JSON.parse(fs.readFileSync(full, 'utf-8')) as RawPriceFile;
}

/**
 * Read the latest prices.json on every call so /api/prices reflects fresh
 * data after a `scripts/fetch-prices.py` run (no server rebuild required).
 */
export function getPricePayload(): {
  version: string;
  asOf: string;
  prices: RawPriceFile['prices'];
  recentBusinessDays: string[];
  fx: Record<string, number>;
} {
  const p = readPrices();
  let recentBusinessDays: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getServerDb } = require('@/server/db') as typeof import('@/server/db');
    const rows = (getServerDb()
      .prepare('SELECT date FROM kr_business_days ORDER BY date DESC LIMIT 30')
      .all() as { date: string }[]).map((r) => r.date);
    recentBusinessDays = rows.reverse();
  } catch {
    recentBusinessDays = [];
  }
  return {
    version: SERVER_VERSION,
    asOf: p.as_of,
    prices: p.prices,
    recentBusinessDays,
    fx: p.fx ?? {},
  };
}

function categorize(market: string, symbol: string): AssetCategory {
  if (symbol.startsWith('CRYPTO:')) return '가상자산';
  if (market === 'CoinGecko') return '가상자산';
  if (
    market === 'KOSPI' ||
    market === 'KOSDAQ' ||
    market === 'KONEX' ||
    market === 'KRX' ||
    market === 'ETF'
  ) {
    return '국내증권';
  }
  if (market === 'S&P500' || market === 'NASDAQ' || market === 'NYSE' || market === 'ETF_US')
    return '미국증권';
  return '국내증권';
}

/**
 * Manually-curated extras the fetch scripts don't cover.
 * - KRX 금현물: KRX 금시장(data.krx.co.kr) 상품. FDR StockListing엔 안 들어옴.
 */
const STATIC_EXTRAS: MarketAsset[] = [
  {
    symbol: 'KRX:GOLD',
    name: 'KRX 금현물',
    category: '금',
    currency: 'KRW',
    currentPrice: 0,
    dailyChange: 0,
    dailyChangePct: 0,
    updatedAt: '',
  },
];

function buildAssets(): MarketAsset[] {
  const krx = readCatalog('krx.json');
  const us = readCatalog('us.json');
  const crypto = readCatalog('crypto.json');
  const priceFile = readPrices();
  const updatedAt = priceFile.as_of;

  const out: MarketAsset[] = [];

  for (const a of [...krx.assets, ...us.assets, ...crypto.assets]) {
    const p = priceFile.prices[a.symbol];
    const isUS =
      a.market === 'S&P500' ||
      a.market === 'NASDAQ' ||
      a.market === 'NYSE' ||
      a.market === 'ETF_US';
    const nameKo = isUS ? aliasFor(a.symbol) : undefined;
    out.push({
      symbol: a.symbol,
      name: a.name,
      ...(nameKo ? { nameKo } : {}),
      category: categorize(a.market, a.symbol),
      currency: isUS ? 'USD' : 'KRW',
      currentPrice: p?.price ?? 0,
      dailyChange: p?.change ?? 0,
      dailyChangePct: p?.changePct ?? 0,
      updatedAt: p ? updatedAt : '',
    });
  }

  for (const extra of STATIC_EXTRAS) {
    const p = priceFile.prices[extra.symbol];
    out.push({
      ...extra,
      currentPrice: p?.price ?? extra.currentPrice,
      dailyChange: p?.change ?? extra.dailyChange,
      dailyChangePct: p?.changePct ?? extra.dailyChangePct,
      updatedAt: p ? updatedAt : extra.updatedAt,
    });
  }
  return out;
}

export const ASSETS: MarketAsset[] = buildAssets();

/**
 * Migration history — append-only. Entry shape:
 *   { version: '3.0.1', appliedAt: '2026-06-01T00:00:00Z',
 *     op: { kind: 'rename_symbol', from: 'KRX:OLD', to: 'KRX:NEW' } }
 */
export const MIGRATIONS: CatalogMigration[] = [];

export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function migrationsSince(version: string): CatalogMigration[] {
  return MIGRATIONS.filter((m) => compareVersion(m.version, version) > 0);
}
