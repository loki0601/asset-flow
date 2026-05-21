import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

/**
 * Pluggable persistence for the SQLite DB blob.
 *
 * Default in the browser/WebView: IndexedDB. We previously used localStorage,
 * but on Android WebView the per-origin quota is ~5 MB and the catalog
 * alone (~5000 assets) drives the sql.js blob right up to that limit. Once
 * any further write pushes it over, localStorage.setItem throws
 * QuotaExceededError silently inside the persistDb microtask and the new
 * user data (accounts, holdings, …) never reaches disk while staying in
 * memory — UI shows it, but next cold launch loses it.
 *
 * IndexedDB has no practical size limit, stores binary natively (no base64
 * 33% overhead), and survives the same install lifecycle. We migrate any
 * legacy localStorage blob the first time we open IDB so existing users
 * don't lose data.
 */
export interface DbPersister {
  /** Either sync (in-memory tests) or async (IDB). Caller awaits. */
  load(): Uint8Array | null | Promise<Uint8Array | null>;
  save(blob: Uint8Array): void;
}

const DB_BLOB_KEY = 'assetflow:db';
const IDB_NAME = 'assetflow';
const IDB_STORE = 'kv';
const IDB_BLOB_KEY = 'db';

class IndexedDbBlobPersister implements DbPersister {
  private dbPromise: Promise<IDBDatabase> | null = null;
  // Save() is fire-and-forget so persistDb stays a sync API. We track the
  // latest pending write here so flushPersistDb can await it (used on
  // visibilitychange → hidden, when the WebView may be killed shortly).
  private latestWrite: Promise<void> = Promise.resolve();

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexedDB open blocked'));
    });
    return this.dbPromise;
  }

  async load(): Promise<Uint8Array | null> {
    const db = await this.openDb();
    const existing = await new Promise<Uint8Array | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_BLOB_KEY);
      req.onsuccess = () => {
        const v = req.result;
        if (v instanceof Uint8Array) resolve(v);
        else if (v instanceof ArrayBuffer) resolve(new Uint8Array(v));
        else resolve(null);
      };
      req.onerror = () => resolve(null);
    });
    if (existing) return existing;
    // First boot on this code: try to migrate the legacy localStorage blob.
    const migrated = this.migrateFromLocalStorage();
    if (migrated) {
      // Persist immediately so subsequent loads come from IDB.
      this.save(migrated);
      // localStorage entry is intentionally LEFT IN PLACE for one more cycle
      // as a backup — cleared only after first IDB write completes
      // successfully (in `save` below) so we never have a window where both
      // stores are empty.
      return migrated;
    }
    return null;
  }

  private migrateFromLocalStorage(): Uint8Array | null {
    if (typeof globalThis.localStorage === 'undefined') return null;
    const b64 = globalThis.localStorage.getItem(DB_BLOB_KEY);
    if (!b64) return null;
    try {
      const binary = atob(b64);
      const u8 = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) u8[i] = binary.charCodeAt(i);
      return u8;
    } catch {
      return null;
    }
  }

  save(blob: Uint8Array): void {
    this.latestWrite = (async () => {
      try {
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
          // Copy into a fresh Uint8Array so the structured-clone snapshot
          // is independent of the live sql.js buffer.
          tx.objectStore(IDB_STORE).put(new Uint8Array(blob), IDB_BLOB_KEY);
        });
        // Clear the legacy localStorage blob now that IDB has its own copy.
        if (typeof globalThis.localStorage !== 'undefined') {
          try {
            globalThis.localStorage.removeItem(DB_BLOB_KEY);
          } catch {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn('[IndexedDbBlobPersister] save failed', err);
      }
    })();
  }

  /** Awaits the latest queued save so callers can block on durability
   *  (e.g. visibility hidden). */
  async awaitLatest(): Promise<void> {
    await this.latestWrite;
  }
}

export class MemoryDbPersister implements DbPersister {
  private blob: Uint8Array | null = null;
  load(): Uint8Array | null {
    return this.blob;
  }
  save(blob: Uint8Array) {
    this.blob = blob;
  }
}

function defaultPersister(): DbPersister {
  if (typeof indexedDB !== 'undefined') return new IndexedDbBlobPersister();
  return new MemoryDbPersister();
}

let persister: DbPersister = defaultPersister();
let db: Database | null = null;
let SQL: SqlJsStatic | null = null;

export function setPersister(p: DbPersister): void {
  persister = p;
}

/**
 * Initialise sql.js, restore the DB blob if present, and ensure the schema
 * (kv table) exists. Safe to call multiple times — subsequent calls return
 * the cached database.
 */
export async function initDb(options?: {
  locateFile?: (file: string) => string;
}): Promise<Database> {
  if (db) return db;
  if (!SQL) {
    // Force every requested wasm filename to our single bundled file. The
    // browser build of sql.js may ask for `sql-wasm-browser.wasm` while the
    // package only ships `sql-wasm.wasm`; redirecting unifies both.
    SQL = await initSqlJs({
      locateFile: options?.locateFile ?? (() => `/sql-wasm.wasm`),
    });
  }
  const blob = await persister.load();
  db = blob ? new SQL.Database(blob) : new SQL.Database();
  db.exec(`CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS price_history (
    symbol TEXT NOT NULL,
    date   TEXT NOT NULL,
    close  REAL NOT NULL,
    PRIMARY KEY (symbol, date)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS fx_history (
    pair TEXT NOT NULL,
    date TEXT NOT NULL,
    rate REAL NOT NULL,
    PRIMARY KEY (pair, date)
  )`);
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error('db not initialised — call initDb() first');
  return db;
}

// persistDb serializes the full ~4MB sql.js blob and writes it to
// localStorage — base64 + setItem costs hundreds of ms. Multiple kvSet calls
// in the same tick (e.g. setLocalCatalog writes 3 keys, or a hot loop of
// price-history inserts) would each pay that cost. Debouncing via microtask
// coalesces them into one write per macrotask, which is the common case.
let persistScheduled = false;
let pendingPersist = false;

export function persistDb(): void {
  if (!db) return;
  if (persistScheduled) {
    pendingPersist = true;
    return;
  }
  persistScheduled = true;
  // Run after the current synchronous batch — queueMicrotask keeps it
  // tighter than setTimeout(0) and avoids React scheduler interference.
  queueMicrotask(() => {
    persistScheduled = false;
    if (!db) return;
    persister.save(db.export());
    if (pendingPersist) {
      pendingPersist = false;
      persistDb();
    }
  });
}

/** Flush any pending persistDb write. Use before a hard process boundary
 *  (e.g. visibility hidden on mobile) where the WebView may be killed
 *  before the queued microtask + the IDB transaction commit.
 *
 *  Returns a Promise; callers that can await (e.g. async handlers) should
 *  do so to ensure durability. Synchronous callers can fire-and-forget. */
export function flushPersistDb(): Promise<void> {
  if (!db) return Promise.resolve();
  if (persistScheduled || pendingPersist) {
    persistScheduled = false;
    pendingPersist = false;
    persister.save(db.export());
  }
  if (persister instanceof IndexedDbBlobPersister) {
    return persister.awaitLatest();
  }
  return Promise.resolve();
}

/** Test helper: drop the cached connection so the next initDb() reopens. */
export function _resetDbForTests(): void {
  flushPersistDb();
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  db = null;
}

/**
 * Nuke every local persistence layer: the in-memory sql.js handle, the
 * IndexedDB blob store, the legacy localStorage blob fallback, plus
 * sessionStorage. Caller should hard-reload the page afterwards so a fresh
 * empty DB is created from scratch.
 *
 * Used by the settings "로컬 DB 초기화" button — pure destructive op, no
 * confirmation here; the UI is expected to ask first.
 */
export async function clearLocalDb(): Promise<void> {
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = null;
  }
  if (typeof indexedDB !== 'undefined') {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(IDB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
  if (typeof localStorage !== 'undefined') {
    // Drop the legacy DB blob and any namespaced session/user keys —
    // anything beginning with "assetflow:" was written by this app.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k === DB_BLOB_KEY || k.startsWith('assetflow:'))) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) localStorage.removeItem(k);
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }
}

// ─── KV helpers ────────────────────────────────────────────────────────

export function kvGet(key: string): string | null {
  if (!db) return null; // SSR / pre-init: no DB available, treat as empty.
  const stmt = db.prepare('SELECT value FROM kv WHERE key = ?');
  try {
    stmt.bind([key]);
    if (stmt.step()) {
      return stmt.get()[0] as string;
    }
    return null;
  } finally {
    stmt.free();
  }
}

export function kvSet(key: string, value: string): void {
  if (!db) return; // Writes during SSR are silently dropped.
  db.run(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
  persistDb();
}

export function kvRemove(key: string): void {
  if (!db) return;
  db.run('DELETE FROM kv WHERE key = ?', [key]);
  persistDb();
}

// ─── KeyValueStore implementation backed by sql.js ─────────────────────

import type { KeyValueStore } from '@/lib/storage';

export class SqliteKvStore implements KeyValueStore {
  getItem(key: string): string | null {
    return kvGet(key);
  }
  setItem(key: string, value: string): void {
    kvSet(key, value);
  }
  removeItem(key: string): void {
    kvRemove(key);
  }
}

// ─── Schema fixups (one-time data renames) ─────────────────────────────

// Legacy Account.type → default institution mapping. When old data is
// upgraded, each account picks a sensible default institution for its old
// type so the row stays valid in the new schema. Users can edit later.
const LEGACY_TYPE_TO_INSTITUTION: Record<string, string> = {
  한국증권: '키움증권',
  국내증권: '키움증권',
  미국증권: '키움증권',
  개인연금: '미래에셋증권 IRP',
  IRP: '미래에셋증권 IRP',
  퇴직연금: '미래에셋증권 IRP',
  연금증권: '미래에셋증권 IRP',
  코인거래소: '업비트',
  가상자산: '업비트',
  금: '키움증권',
  은행: '키움증권',
};

/**
 * Upgrade Account rows from the legacy { type, institution? } shape to the
 * new { institution, name } shape. Idempotent — accounts already on the new
 * schema are left untouched.
 */
export function migrateAccountTypeRenames(): void {
  if (!db) return;
  const rows = db.exec("SELECT key, value FROM kv WHERE key LIKE 'assetflow:user:%:accounts'");
  if (!rows.length) return;
  for (const [key, value] of rows[0].values) {
    if (typeof value !== 'string') continue;
    try {
      const accounts = JSON.parse(value) as Array<Record<string, unknown>>;
      let changed = false;
      for (const acc of accounts) {
        if (acc.type) {
          // Old shape: promote type → institution (if missing) and synthesize a name.
          if (!acc.institution || typeof acc.institution !== 'string') {
            acc.institution = LEGACY_TYPE_TO_INSTITUTION[acc.type as string] ?? '키움증권';
          }
          if (!acc.name || typeof acc.name !== 'string') {
            acc.name = String(acc.type);
          }
          delete acc.type;
          delete acc.number;
          changed = true;
        }
      }
      if (changed) {
        db.run(
          'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key as string, JSON.stringify(accounts)],
        );
      }
    } catch {
      /* skip malformed */
    }
  }
  persistDb();
}

/**
 * One-off fix: the dev account "loki0601" was created before the signup
 * form captured a real name, so its first family member was seeded with a
 * placeholder.  Set it to "이영록" the first time we see this device.
 * Guarded by a kv flag so re-running the cron of migrations is cheap.
 */
export function migrateLoki0601MemberName(): void {
  if (!db) return;
  const FLAG = 'assetflow:migration:loki0601-member-name-v1';
  const already = kvGet(FLAG);
  if (already) return;

  const usersRow = db.exec(`SELECT value FROM kv WHERE key = 'assetflow:users'`);
  if (!usersRow.length) {
    kvSet(FLAG, '1');
    return;
  }
  let users: Array<{ id: string; username: string }> = [];
  try {
    const raw = usersRow[0].values[0]?.[0];
    if (typeof raw === 'string') users = JSON.parse(raw);
  } catch {
    /* malformed users blob — abort migration silently */
    kvSet(FLAG, '1');
    return;
  }
  const loki = users.find((u) => u.username === 'loki0601');
  if (!loki) {
    kvSet(FLAG, '1');
    return;
  }
  const memberKey = `assetflow:user:${loki.id}:members`;
  const memberRow = db.exec('SELECT value FROM kv WHERE key = ?', [memberKey]);
  if (memberRow.length) {
    let members: Array<{ id: string; name: string; userId: string; createdAt: string }> = [];
    try {
      const raw = memberRow[0].values[0]?.[0];
      if (typeof raw === 'string') members = JSON.parse(raw);
    } catch {
      kvSet(FLAG, '1');
      return;
    }
    if (members.length > 0 && members[0].name !== '이영록') {
      members[0] = { ...members[0], name: '이영록' };
      db.run(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [memberKey, JSON.stringify(members)],
      );
      persistDb();
    }
  }
  kvSet(FLAG, '1');
}

// ─── Migration from legacy localStorage ────────────────────────────────

/**
 * If the user is upgrading from the localStorage-only version, copy every
 * `assetflow:...` key (except the DB blob itself) into the kv table and
 * remove the originals. Idempotent.
 */
export function migrateLegacyLocalStorage(): void {
  if (typeof globalThis.localStorage === 'undefined') return;
  const toMigrate: { key: string; value: string }[] = [];
  for (let i = 0; i < globalThis.localStorage.length; i++) {
    const k = globalThis.localStorage.key(i);
    if (!k) continue;
    if (!k.startsWith('assetflow:')) continue;
    if (k === DB_BLOB_KEY) continue;
    const v = globalThis.localStorage.getItem(k);
    if (v != null) toMigrate.push({ key: k, value: v });
  }
  if (toMigrate.length === 0) return;
  for (const { key, value } of toMigrate) {
    getDb().run(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }
  persistDb();
  for (const { key } of toMigrate) globalThis.localStorage.removeItem(key);
}
