/**
 * Thin key-value abstraction over Web Storage. Swappable for tests via
 * `setStorage()` (e.g. MemoryStore). Production code in the browser/WebView
 * falls back to `localStorage`.
 *
 * All persisted data goes through this module so that:
 * - Tests can inject an in-memory store.
 * - Future migration to IndexedDB only touches this file.
 * - Key naming (`assetflow:...`, `assetflow:user:{id}:...`) is centralized.
 */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

// SqliteKvStore is defined in lib/db.ts to avoid an import cycle.

let currentStore: KeyValueStore | null = null;

export function setStorage(store: KeyValueStore): void {
  currentStore = store;
}

export function getStorage(): KeyValueStore {
  if (currentStore) return currentStore;
  if (typeof globalThis.localStorage !== 'undefined') {
    currentStore = globalThis.localStorage as KeyValueStore;
  } else {
    currentStore = new MemoryStore();
  }
  return currentStore;
}

const PREFIX = 'assetflow';

export function globalKey(name: string): string {
  return `${PREFIX}:${name}`;
}

export function userKey(userId: string, collection: string): string {
  return `${PREFIX}:user:${userId}:${collection}`;
}

export function readJSON<T>(key: string, fallback: T): T {
  const raw = getStorage().getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  getStorage().setItem(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
  getStorage().removeItem(key);
}
