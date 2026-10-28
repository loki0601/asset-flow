import { beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  _resetDbForTests,
  exportDbForSync,
  importDbFromSync,
  initDb,
  kvGet,
  kvSet,
  MemoryDbPersister,
  setPersister,
} from '@/lib/db';

const WASM_PATH = path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');
const locateFile = () => `file://${WASM_PATH}`;
const garbage = new TextEncoder().encode('alice-data-v2');

describe('importDbFromSync — corrupt server snapshot', () => {
  beforeEach(async () => {
    _resetDbForTests();
    setPersister(new MemoryDbPersister());
    await initDb({ locateFile });
  });

  it('rejects bytes that are not a SQLite database', async () => {
    await expect(importDbFromSync(garbage)).rejects.toThrow('손상');
  });

  it('keeps the existing local DB usable and persisted after a rejected import', async () => {
    const persister = new MemoryDbPersister();
    setPersister(persister);
    kvSet('assetflow:keep', 'local');

    await importDbFromSync(garbage).catch(() => undefined);

    expect(kvGet('assetflow:keep')).toBe('local');
    expect(persister.load()).not.toEqual(garbage);
  });

  it('still imports a valid snapshot', async () => {
    kvSet('assetflow:from-server', 'yes');
    const snapshot = exportDbForSync();
    kvSet('assetflow:from-server', 'overwritten');

    await importDbFromSync(snapshot);

    expect(kvGet('assetflow:from-server')).toBe('yes');
  });
});

describe('initDb — corrupt persisted blob', () => {
  it('starts with a fresh database instead of failing every boot', async () => {
    _resetDbForTests();
    const persister = new MemoryDbPersister();
    persister.save(garbage);
    setPersister(persister);

    await initDb({ locateFile });

    expect(kvGet('anything')).toBeNull();
    kvSet('assetflow:after-recovery', 'ok');
    expect(kvGet('assetflow:after-recovery')).toBe('ok');
  });
});
