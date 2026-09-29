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
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
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
    CREATE TABLE IF NOT EXISTS app_users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES app_users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_sessions_user
      ON app_sessions (user_id);
    CREATE TABLE IF NOT EXISTS user_sync_snapshots (
      user_id    TEXT PRIMARY KEY REFERENCES app_users(id),
      blob       BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      revision   INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS user_sync_snapshot_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL REFERENCES app_users(id),
      revision    INTEGER NOT NULL,
      blob        BLOB NOT NULL,
      archived_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sync_snapshot_history_user
      ON user_sync_snapshot_history (user_id, archived_at DESC);
    CREATE TABLE IF NOT EXISTS user_sync_entities (
      user_id TEXT NOT NULL REFERENCES app_users(id), collection TEXT NOT NULL,
      entity_id TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      payload TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, collection, entity_id)
    );
    CREATE TABLE IF NOT EXISTS user_sync_changes (
      cursor INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES app_users(id),
      collection TEXT NOT NULL, entity_id TEXT NOT NULL, kind TEXT NOT NULL,
      version INTEGER NOT NULL, payload TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sync_changes_cursor ON user_sync_changes (user_id, cursor);
    CREATE TABLE IF NOT EXISTS reference_events (
      id          TEXT PRIMARY KEY,
      kind        TEXT NOT NULL,
      symbol      TEXT,
      name        TEXT NOT NULL,
      date        TEXT NOT NULL,
      title       TEXT NOT NULL,
      detail      TEXT,
      impact      TEXT NOT NULL DEFAULT 'neutral',
      confidence  TEXT NOT NULL DEFAULT 'estimated',
      source      TEXT,
      tags        TEXT,
      added_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reference_events_date
      ON reference_events (date);
    CREATE INDEX IF NOT EXISTS idx_reference_events_kind_date
      ON reference_events (kind, date);
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

// ─── Server accounts + cross-device snapshots ─────────────────────────

export interface ServerUser {
  id: string;
  username: string;
  createdAt: string;
}

export interface UserSnapshot {
  blob: Buffer;
  updatedAt: string;
  revision: number;
}

function passwordHash(password: string, salt = randomBytes(16).toString('hex')): string {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function passwordMatches(password: string, stored: string): boolean {
  const [algorithm, salt, expected] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function toServerUser(row: { id: string; username: string; created_at: string }): ServerUser {
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function createServerUser(username: string, password: string): ServerUser {
  const cleanUsername = username.trim();
  if (cleanUsername.length < 2) throw new Error('username must be at least 2 characters');
  if (password.length < 8) throw new Error('password must be at least 8 characters');
  const user: ServerUser = {
    id: randomUUID(),
    username: cleanUsername,
    createdAt: new Date().toISOString(),
  };
  try {
    getServerDb()
      .prepare('INSERT INTO app_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(user.id, user.username, passwordHash(password), user.createdAt);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
      throw new Error('이미 사용 중인 사용자명입니다');
    }
    throw error;
  }
  return user;
}

export function authenticateUser(username: string, password: string): ServerUser | null {
  const row = getServerDb()
    .prepare('SELECT id, username, password_hash, created_at FROM app_users WHERE username = ? COLLATE NOCASE')
    .get(username.trim()) as { id: string; username: string; password_hash: string; created_at: string } | undefined;
  if (!row || !passwordMatches(password, row.password_hash)) return null;
  return toServerUser(row);
}

export function createSession(userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const db = getServerDb();
  db.prepare('DELETE FROM app_sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare('INSERT INTO app_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(tokenHash, userId, expiresAt, now.toISOString());
  return token;
}

export function getSessionUser(token: string): ServerUser | null {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const row = getServerDb()
    .prepare(
      `SELECT u.id, u.username, u.created_at
       FROM app_sessions s JOIN app_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, new Date().toISOString()) as { id: string; username: string; created_at: string } | undefined;
  return row ? toServerUser(row) : null;
}

export const userSnapshotRepo = {
  get(userId: string): UserSnapshot | null {
    const row = getServerDb()
      .prepare('SELECT blob, updated_at, revision FROM user_sync_snapshots WHERE user_id = ?')
      .get(userId) as { blob: Buffer; updated_at: string; revision: number } | undefined;
    return row ? { blob: row.blob, updatedAt: row.updated_at, revision: row.revision } : null;
  },
  put(userId: string, blob: Buffer): UserSnapshot {
    const updatedAt = new Date().toISOString();
    const db = getServerDb();
    const previous = this.get(userId);
    const write = db.transaction(() => {
      if (previous) {
        db.prepare(
          `INSERT INTO user_sync_snapshot_history (user_id, revision, blob, archived_at)
           VALUES (?, ?, ?, ?)`,
        ).run(userId, previous.revision, previous.blob, updatedAt);
      }
      db.prepare(
        `INSERT INTO user_sync_snapshots (user_id, blob, updated_at, revision)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(user_id) DO UPDATE SET
           blob = excluded.blob,
           updated_at = excluded.updated_at,
           revision = user_sync_snapshots.revision + 1`,
      ).run(userId, blob, updatedAt);
      // Retain a bounded recovery trail for each account before pruning.
      db.prepare(
        `DELETE FROM user_sync_snapshot_history
         WHERE user_id = ? AND id NOT IN (
           SELECT id FROM user_sync_snapshot_history
           WHERE user_id = ? ORDER BY archived_at DESC, id DESC LIMIT 20
         )`,
      ).run(userId, userId);
    });
    write();
    return this.get(userId)!;
  },
  listHistory(userId: string): UserSnapshot[] {
    return (getServerDb()
      .prepare(
        `SELECT blob, archived_at AS updated_at, revision
         FROM user_sync_snapshot_history WHERE user_id = ?
         ORDER BY archived_at DESC, id DESC`,
      )
      .all(userId) as Array<{ blob: Buffer; updated_at: string; revision: number }>)
      .map((row) => ({ blob: row.blob, updatedAt: row.updated_at, revision: row.revision }));
  },
};

export type SyncChangeInput = {
  collection: string; entityId: string; kind: 'upsert' | 'delete'; baseVersion: number;
  payload?: Record<string, unknown>; clientUpdatedAt: string;
};
export type SyncChangeResult =
  | { ok: true; cursor: number; version: number }
  | { ok: false; currentVersion: number };

export function appendSyncChange(userId: string, input: SyncChangeInput): SyncChangeResult {
  const db = getServerDb();
  return db.transaction(() => {
    const existing = db.prepare(
      'SELECT version, deleted, payload FROM user_sync_entities WHERE user_id = ? AND collection = ? AND entity_id = ?',
    ).get(userId, input.collection, input.entityId) as { version: number; deleted: number; payload: string | null } | undefined;
    const currentVersion = existing?.version ?? 0;
    const payload = input.kind === 'delete' ? null : JSON.stringify(input.payload ?? {});
    if (currentVersion !== input.baseVersion) {
      // A response may be lost after the server commits. Retrying that exact
      // mutation must acknowledge the original cursor, not create a second
      // transaction or leave the device retrying forever.
      if (existing && existing.deleted === (input.kind === 'delete' ? 1 : 0) && existing.payload === payload) {
        const row = db.prepare(
          'SELECT cursor FROM user_sync_changes WHERE user_id = ? AND collection = ? AND entity_id = ? AND version = ? ORDER BY cursor DESC LIMIT 1',
        ).get(userId, input.collection, input.entityId, currentVersion) as { cursor: number } | undefined;
        if (row) return { ok: true as const, cursor: row.cursor, version: currentVersion };
      }
      return { ok: false as const, currentVersion };
    }
    const version = currentVersion + 1;
    db.prepare(
      `INSERT INTO user_sync_entities (user_id, collection, entity_id, version, deleted, payload, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, collection, entity_id) DO UPDATE SET version=excluded.version, deleted=excluded.deleted, payload=excluded.payload, updated_at=excluded.updated_at`,
    ).run(userId, input.collection, input.entityId, version, input.kind === 'delete' ? 1 : 0, payload, input.clientUpdatedAt);
    const cursor = db.prepare(
      'INSERT INTO user_sync_changes (user_id, collection, entity_id, kind, version, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, input.collection, input.entityId, input.kind, version, payload, input.clientUpdatedAt).lastInsertRowid;
    return { ok: true as const, cursor: Number(cursor), version };
  })();
}

export function listSyncChanges(userId: string, afterCursor: number) {
  return dbRowsToChanges(getServerDb().prepare(
    'SELECT cursor, collection, entity_id, kind, version, payload, created_at FROM user_sync_changes WHERE user_id = ? AND cursor > ? ORDER BY cursor ASC',
  ).all(userId, afterCursor) as Array<{ cursor: number; collection: string; entity_id: string; kind: 'upsert' | 'delete'; version: number; payload: string | null; created_at: string }>);
}

function dbRowsToChanges(rows: Array<{ cursor: number; collection: string; entity_id: string; kind: 'upsert' | 'delete'; version: number; payload: string | null; created_at: string }>) {
  return rows.map((row) => ({ cursor: row.cursor, collection: row.collection, entityId: row.entity_id, kind: row.kind, version: row.version, payload: row.payload ? JSON.parse(row.payload) as Record<string, unknown> : null, updatedAt: row.created_at }));
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

/**
 * Decision used by POST /api/prices/history/track: should we (re)spawn the
 * Python backfill worker for this symbol?
 *
 * The straightforward cases are first-registration (no row yet) and
 * explicit prior failure. The non-obvious one is `status='ready'` with a
 * NULL `source` — that combination means the daily-cron append loop has
 * promoted the row to ready (it only operates on ready rows) but
 * backfill-symbol.py never landed its UPDATE, so the symbol has a
 * fraction of the history we'd expect. Without re-spawning here, the
 * symbol is "ready" but anemic forever. Observed in production for
 * PLTR/AMZN/UBER added in a single batch on 2026-05-17.
 *
 * Pending rows are deliberately *not* re-spawned — they signal an
 * in-flight backfill, and a second spawn would race the first.
 */
export function shouldBackfill(existing: TrackedSymbol | undefined): boolean {
  if (!existing) return true;
  if (existing.status === 'failed') return true;
  if (existing.status === 'ready' && !existing.source) return true;
  return false;
}

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
