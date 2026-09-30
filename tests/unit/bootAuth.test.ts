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
  it('stays signed in when connectServerSession fails (e.g. offline / tunnel hiccup on app cold-start)', async () => {
    // adoptServerSession (called by the real connectServerSession before it
    // ever touches the network) already wrote this session to disk in an
    // earlier successful login — that's the ground truth for "am I logged
    // in", independent of whether today's boot sync round-trip succeeds.
    adoptServerSession(session);
    connectServerSession.mockRejectedValue(new Error('network error'));

    const userId = await resolveBootSession();

    expect(userId).toBe('u1');
    expect(getCurrentUserId()).toBe('u1');
  });

  it('stays signed in when the post-connect change-feed sync fails', async () => {
    adoptServerSession(session);
    connectServerSession.mockResolvedValue('downloaded');
    flushChangeOutbox.mockRejectedValue(new Error('ECONNRESET'));

    const userId = await resolveBootSession();

    expect(userId).toBe('u1');
  });

  it('resolves to the connected user id on a clean boot', async () => {
    adoptServerSession(session);
    connectServerSession.mockResolvedValue('downloaded');

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
