import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore, setStorage } from '@/lib/storage';
import { adoptServerSession, getCurrentUserId, setCurrentUserId } from '@/lib/auth';

const connectServerSession = vi.fn();
vi.mock('@/lib/remoteSync', () => ({
  connectServerSession: (...args: unknown[]) => connectServerSession(...args),
}));

const seedChangeFeed = vi.fn();
const flushChangeOutbox = vi.fn(() => Promise.resolve());
const pullChangeFeed = vi.fn(() => Promise.resolve(false));
vi.mock('@/lib/changeSync', () => ({
  seedChangeFeed: (...args: unknown[]) => seedChangeFeed(...args),
  flushChangeOutbox: (...args: unknown[]) => flushChangeOutbox(...args),
  pullChangeFeed: (...args: unknown[]) => pullChangeFeed(...args),
}));

import { resolveBootSession } from '@/lib/bootAuth';

const session = { token: 'tok', user: { id: 'u1', username: 'loki0601', createdAt: '2026-01-01T00:00:00.000Z' } };

beforeEach(() => {
  setStorage(new MemoryStore());
  connectServerSession.mockReset();
  seedChangeFeed.mockClear();
  flushChangeOutbox.mockClear().mockResolvedValue(undefined);
  pullChangeFeed.mockClear().mockResolvedValue(false);
});

describe('resolveBootSession — a network hiccup during boot must never look like a logout', () => {
  it('never round-trips the full snapshot on boot — it is a login-time bootstrap only', async () => {
    // The snapshot is the whole local DB (~11MB with price history). Boot
    // used to GET it and then PUT it back on every cold start, which made
    // the app sit on the splash for seconds over the tunnel. The change
    // feed already keeps signed-in devices in sync.
    adoptServerSession(session);

    const userId = await resolveBootSession();

    expect(userId).toBe('u1');
    expect(connectServerSession).not.toHaveBeenCalled();
  });

  it('stays signed in when the post-connect change-feed sync fails', async () => {
    adoptServerSession(session);
    flushChangeOutbox.mockRejectedValue(new Error('ECONNRESET'));

    const userId = await resolveBootSession();

    expect(userId).toBe('u1');
  });

  it('resolves to the connected user id on a clean boot', async () => {
    adoptServerSession(session);

    const userId = await resolveBootSession();

    expect(userId).toBe('u1');
    expect(seedChangeFeed).toHaveBeenCalledWith('u1');
    expect(flushChangeOutbox).toHaveBeenCalledWith('u1');
    expect(pullChangeFeed).toHaveBeenCalledWith('u1');
  });

  it('has no session on disk → resolves to null without touching the network', async () => {
    setCurrentUserId('stale-legacy-id');

    const userId = await resolveBootSession();

    expect(userId).toBeNull();
    expect(connectServerSession).not.toHaveBeenCalled();
  });
});
