import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adoptServerSession = vi.fn();
const hasLocalPortfolioData = vi.fn(() => false);
vi.mock('@/lib/auth', () => ({
  adoptServerSession: (...args: unknown[]) => adoptServerSession(...args),
  hasLocalPortfolioData: (...args: unknown[]) => hasLocalPortfolioData(...args),
}));

const flushPersistDb = vi.fn(() => Promise.resolve());
const importDbFromSync = vi.fn(() => Promise.resolve());
const exportDbForSync = vi.fn(() => new Uint8Array());
vi.mock('@/lib/db', () => ({
  flushPersistDb: (...args: unknown[]) => flushPersistDb(...args),
  importDbFromSync: (...args: unknown[]) => importDbFromSync(...args),
  exportDbForSync: (...args: unknown[]) => exportDbForSync(...args),
}));

import { connectServerSession } from '@/lib/remoteSync';

const session = { token: 'tok', user: { id: 'u1', username: 'loki0601', createdAt: '2026-01-01' } };

beforeEach(() => {
  adoptServerSession.mockClear();
  hasLocalPortfolioData.mockClear();
  flushPersistDb.mockClear();
  importDbFromSync.mockClear();
  exportDbForSync.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connectServerSession — session must survive the app being killed right after login', () => {
  it('durably flushes the re-adopted session to disk after downloading a snapshot, before resolving', async () => {
    // Snapshot exists on the server (device #2 downloading an existing account).
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 200,
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }),
      ),
    );

    // The DB import wipes any session written before it started (the
    // snapshot import replaces the whole local DB), so adoptServerSession is
    // called again afterwards to re-write the session into the fresh DB.
    // That write is only durable once flushPersistDb's promise resolves —
    // if the OS kills the WebView before that, the session is gone and the
    // user is bounced back to /login (the "logged out again" bug).
    let flushResolve: () => void = () => {};
    flushPersistDb.mockImplementationOnce(
      () => new Promise<void>((resolve) => { flushResolve = resolve; }),
    );

    const result = connectServerSession(session);

    // Let the fetch + importDbFromSync microtasks run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The session must already be re-adopted into the freshly imported DB...
    expect(adoptServerSession).toHaveBeenLastCalledWith(session);
    // ...and connectServerSession must not resolve until that write is
    // actually flushed to durable storage.
    let settled = false;
    result.then(() => { settled = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    flushResolve();
    expect(await result).toBe('downloaded');
    expect(flushPersistDb).toHaveBeenCalled();
  });
});
