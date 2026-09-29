import { beforeEach, describe, expect, it } from 'vitest';
import {
  authenticateUser,
  createServerUser,
  createSession,
  getSessionUser,
  setServerDbForTests,
  openServerDb,
  userSnapshotRepo,
} from '@/server/db';

beforeEach(() => {
  setServerDbForTests(openServerDb(':memory:'));
});

describe('server-backed account authentication', () => {
  it('creates a server account and only authenticates its configured password', () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');

    expect(authenticateUser('loki0601', 'correct horse battery staple')).toMatchObject({
      id: user.id,
      username: 'loki0601',
    });
    expect(authenticateUser('loki0601', 'wrong password')).toBeNull();
  });

  it('issues an opaque session token that resolves to the owning user', () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');
    const token = createSession(user.id);

    expect(token).not.toContain(user.id);
    expect(getSessionUser(token)).toMatchObject({ id: user.id, username: 'loki0601' });
  });
});

describe('per-user synchronized snapshots', () => {
  it('keeps the latest snapshot private to the authenticated user', () => {
    const loki = createServerUser('loki0601', 'correct horse battery staple');
    const other = createServerUser('other', 'correct horse battery staple');
    const first = Buffer.from('first-device-data');
    const latest = Buffer.from('latest-device-data');

    userSnapshotRepo.put(loki.id, first);
    userSnapshotRepo.put(loki.id, latest);

    expect(userSnapshotRepo.get(loki.id)?.blob).toEqual(latest);
    expect(userSnapshotRepo.listHistory(loki.id)[0]?.blob).toEqual(first);
    expect(userSnapshotRepo.get(other.id)).toBeNull();
  });
});
