/**
 * Server-side SQLite (better-sqlite3) for cross-user persistent data.
 *
 * Holds:
 *   - tracked_symbols: per-symbol backfill state (one row per symbol any
 *     user has ever held). Append-only — symbols are not removed when the
 *     last holder sells, since the daily bulk job is cheap.
 *   - price_history: (symbol, date, close) — primary key (symbol, date).
 *     INSERT OR IGNORE used everywhere to keep daily appends idempotent.
 *   - kr_business_days: KRX trading-day cache. Lets clients/server detect
 *     "missing today vs. missing N business days" gaps without calling a
 *     calendar API every time.
 *
 * Location: data/server.db (gitignored). Tests use an in-memory DB.
 */

import Database, { type Database as DB } from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'server.db');

let cached: DB | null = null;

function bootstrap(db: DB): void {
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_symbols (
      symbol           TEXT PRIMARY KEY,
      first_added_at   TEXT NOT NULL,
      last_close_date  TEXT,
      source           TEXT,
      status           TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS price_history (
      symbol TEXT NOT NULL,
      date   TEXT NOT NULL,
      close  REAL NOT NULL,
      PRIMARY KEY (symbol, date)
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_symbol_date
      ON price_history (symbol, date);
    CREATE TABLE IF NOT EXISTS kr_business_days (
      date TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      token       TEXT PRIMARY KEY,
      platform    TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      last_seen_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fx_history (
      pair TEXT NOT NULL,
      date TEXT NOT NULL,
      rate REAL NOT NULL,
      PRIMARY KEY (pair, date)
    );
    CREATE TABLE IF NOT EXISTS user_backups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      username    TEXT,
      created_at  TEXT NOT NULL,
      blob_size   INTEGER NOT NULL,
      blob        BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_backups_user_created
      ON user_backups (user_id, created_at DESC);
  `);
}

export function openServerDb(filePath: string = DB_PATH): DB {
  if (filePath !== ':memory:') {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  const db = new Database(filePath);
  bootstrap(db);
  return db;
}

export function getServerDb(): DB {
  if (!cached) {
    cached = openServerDb();
  }
  return cached;
}

export function setServerDbForTests(db: DB): void {
  cached = db;
}

// ─── Repos ────────────────────────────────────────────────────────────

export type TrackedStatus = 'pending' | 'ready' | 'failed';

export interface TrackedSymbol {
  symbol: string;
  first_added_at: string;
  last_close_date: string | null;
  source: string | null;
  status: TrackedStatus;
}

export const trackedSymbolsRepo = {
  upsert(symbol: string): void {
    const db = getServerDb();
    db.prepare(
      `INSERT INTO tracked_symbols (symbol, first_added_at, status)
       VALUES (?, ?, 'pending')
       ON CONFLICT(symbol) DO NOTHING`,
    ).run(symbol, new Date().toISOString());
  },

  get(symbol: string): TrackedSymbol | undefined {
    return getServerDb()
      .prepare('SELECT * FROM tracked_symbols WHERE symbol = ?')
      .get(symbol) as TrackedSymbol | undefined;
  },

  setStatus(symbol: string, status: TrackedStatus): void {
    getServerDb()
      .prepare('UPDATE tracked_symbols SET status = ? WHERE symbol = ?')
      .run(status, symbol);
  },

  setLastCloseDate(symbol: string, date: string): void {
    getServerDb()
      .prepare('UPDATE tracked_symbols SET last_close_date = ? WHERE symbol = ?')
      .run(date, symbol);
  },

  setSource(symbol: string, source: string): void {
    getServerDb()
      .prepare('UPDATE tracked_symbols SET source = ? WHERE symbol = ?')
      .run(source, symbol);
  },

  listReady(): string[] {
    return (
      getServerDb()
        .prepare("SELECT symbol FROM tracked_symbols WHERE status = 'ready' ORDER BY symbol")
        .all() as { symbol: string }[]
    ).map((r) => r.symbol);
  },

  listAll(): TrackedSymbol[] {
    return getServerDb()
      .prepare('SELECT * FROM tracked_symbols ORDER BY symbol')
      .all() as TrackedSymbol[];
  },
};

export interface PriceRow {
  date: string;
  close: number;
}

export const serverPriceHistoryRepo = {
  insertMany(symbol: string, rows: PriceRow[]): void {
    if (rows.length === 0) return;
    const db = getServerDb();
    const stmt = db.prepare(
      'INSERT OR IGNORE INTO price_history (symbol, date, close) VALUES (?, ?, ?)',
    );
    const tx = db.transaction((items: PriceRow[]) => {
      for (const r of items) stmt.run(symbol, r.date, r.close);
    });
    tx(rows);
  },

  listSince(symbol: string, from: string): PriceRow[] {
    return getServerDb()
      .prepare(
        'SELECT date, close FROM price_history WHERE symbol = ? AND date >= ? ORDER BY date ASC',
      )
      .all(symbol, from) as PriceRow[];
  },

  getMaxDate(symbol: string): string | null {
    const row = getServerDb()
      .prepare('SELECT MAX(date) as d FROM price_history WHERE symbol = ?')
      .get(symbol) as { d: string | null } | undefined;
    return row?.d ?? null;
  },
};

export const fcmTokensRepo = {
  upsert(token: string, platform: string): void {
    const now = new Date().toISOString();
    getServerDb()
      .prepare(
        `INSERT INTO fcm_tokens (token, platform, registered_at, last_seen_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      )
      .run(token, platform, now, now);
  },

  listAll(): { token: string; platform: string }[] {
    return getServerDb()
      .prepare('SELECT token, platform FROM fcm_tokens ORDER BY last_seen_at DESC')
      .all() as { token: string; platform: string }[];
  },

  delete(token: string): void {
    getServerDb().prepare('DELETE FROM fcm_tokens WHERE token = ?').run(token);
  },
};

export interface FxRow {
  date: string;
  rate: number;
}

export const fxHistoryRepo = {
  insertMany(pair: string, rows: FxRow[]): void {
    if (rows.length === 0) return;
    const db = getServerDb();
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO fx_history (pair, date, rate) VALUES (?, ?, ?)',
    );
    const tx = db.transaction((items: FxRow[]) => {
      for (const r of items) stmt.run(pair, r.date, r.rate);
    });
    tx(rows);
  },

  listSince(pair: string, from: string): FxRow[] {
    return getServerDb()
      .prepare(
        'SELECT date, rate FROM fx_history WHERE pair = ? AND date >= ? ORDER BY date ASC',
      )
      .all(pair, from) as FxRow[];
  },

  getLatest(pair: string): FxRow | null {
    const row = getServerDb()
      .prepare(
        'SELECT date, rate FROM fx_history WHERE pair = ? ORDER BY date DESC LIMIT 1',
      )
      .get(pair) as FxRow | undefined;
    return row ?? null;
  },
};

export const krBusinessDaysRepo = {
  upsert(dates: string[]): void {
    if (dates.length === 0) return;
    const db = getServerDb();
    const stmt = db.prepare('INSERT OR IGNORE INTO kr_business_days (date) VALUES (?)');
    const tx = db.transaction((arr: string[]) => {
      for (const d of arr) stmt.run(d);
    });
    tx(dates);
  },

  latest(): string | null {
    const row = getServerDb()
      .prepare('SELECT MAX(date) as d FROM kr_business_days')
      .get() as { d: string | null } | undefined;
    return row?.d ?? null;
  },

  isBusinessDay(date: string): boolean {
    const row = getServerDb()
      .prepare('SELECT 1 as ok FROM kr_business_days WHERE date = ?')
      .get(date) as { ok: number } | undefined;
    return !!row;
  },
};
