import { beforeEach, describe, expect, it } from 'vitest';
import { POST as signup } from '@/app/api/auth/signup/route';
import { PUT as putSnapshot } from '@/app/api/sync/snapshot/route';
import { POST as postBackup } from '@/app/api/backup/route';
import { POST as postChanges } from '@/app/api/sync/changes/route';
import { createServerUser, createSession, openServerDb, setServerDbForTests } from '@/server/db';

beforeEach(() => setServerDbForTests(openServerDb(':memory:')));

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');

function authed(token: string, init: RequestInit): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } };
}

function tokenFor(username: string): string {
  return createSession(createServerUser(username, 'correct horse battery staple').id);
}

function signupRequest(username: string, password: string) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

describe('POST /api/auth/signup validation', () => {
  it('rejects a too-short username with 400 and a Korean message', async () => {
    const res = await signup(signupRequest('a', 'long-enough-password'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('아이디는 2자 이상이어야 합니다.');
  });

  it('rejects a too-short password with 400 and a Korean message', async () => {
    const res = await signup(signupRequest('qa_user', 'short'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('비밀번호는 8자 이상이어야 합니다.');
  });

  it('keeps 409 for a duplicate username', async () => {
    await signup(signupRequest('qa_user', 'long-enough-password'));
    const res = await signup(signupRequest('qa_user', 'long-enough-password'));
    expect(res.status).toBe(409);
  });
});

describe('snapshot and backup uploads must be SQLite databases', () => {
  it('rejects a non-SQLite snapshot with 400', async () => {
    const token = tokenFor('loki0601');
    const res = await putSnapshot(new Request('http://localhost/api/sync/snapshot', authed(token, {
      method: 'PUT', body: Buffer.from('alice-data-v2'),
    })));
    expect(res.status).toBe(400);
  });

  it('accepts a snapshot with a SQLite header', async () => {
    const token = tokenFor('loki0601');
    const res = await putSnapshot(new Request('http://localhost/api/sync/snapshot', authed(token, {
      method: 'PUT', body: Buffer.concat([SQLITE_HEADER, Buffer.alloc(84)]),
    })));
    expect(res.status).toBe(200);
  });

  it('rejects a non-SQLite backup with 400', async () => {
    const token = tokenFor('loki0601');
    const res = await postBackup(new Request('http://localhost/api/backup', authed(token, {
      method: 'POST', body: Buffer.from('blob'),
    })));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/sync/changes error message', () => {
  it('describes an invalid change instead of the batch-size rule', async () => {
    const token = tokenFor('loki0601');
    const res = await postChanges(new Request('http://localhost/api/sync/changes', authed(token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [{ collection: 'unknown', entityId: 'a', kind: 'upsert', baseVersion: 0, payload: {}, clientUpdatedAt: '2026-10-28T00:00:00Z' }] }),
    })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('올바르지 않은 변경분이 포함되어 있습니다.');
  });
});
