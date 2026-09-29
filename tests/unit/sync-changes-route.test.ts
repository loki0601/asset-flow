import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/sync/changes/route';
import { createServerUser, createSession, openServerDb, setServerDbForTests } from '@/server/db';

beforeEach(() => setServerDbForTests(openServerDb(':memory:')));

describe('POST /api/sync/changes', () => {
  it('requires an authenticated, well-formed portfolio mutation', async () => {
    const user = createServerUser('loki0601', 'correct horse battery staple');
    const token = createSession(user.id);
    const invalid = await POST(new Request('http://localhost/api/sync/changes', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ collection: 'unknown', entityId: 'id', kind: 'upsert', baseVersion: 0, payload: {}, clientUpdatedAt: '2026-09-29T00:00:00.000Z' }] }),
    }));
    const accepted = await POST(new Request('http://localhost/api/sync/changes', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ collection: 'transactions', entityId: 'buy-1', kind: 'upsert', baseVersion: 0, payload: { id: 'buy-1', type: 'buy' }, clientUpdatedAt: '2026-09-29T00:00:00.000Z' }] }),
    }));

    expect(invalid.status).toBe(400);
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ results: [expect.objectContaining({ ok: true, version: 1 })] });
  });
});
