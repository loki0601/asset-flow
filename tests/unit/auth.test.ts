import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore, setStorage } from '@/lib/storage';
import {
  hashPassword,
  seedDefaultUser,
  getCurrentUserId,
  setCurrentUserId,
  findUserByUsername,
  login,
  listUsers,
  DEFAULT_USERNAME,
  DEFAULT_PASSWORD,
} from '@/lib/auth';

beforeEach(() => {
  setStorage(new MemoryStore());
});

describe('hashPassword', () => {
  it('is deterministic for the same input', async () => {
    const a = await hashPassword('secret');
    const b = await hashPassword('secret');
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', async () => {
    const a = await hashPassword('a');
    const b = await hashPassword('b');
    expect(a).not.toBe(b);
  });

  it('returns 64-char hex (sha-256)', async () => {
    const h = await hashPassword('x');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('seedDefaultUser', () => {
  it('creates the default user on first run', async () => {
    await seedDefaultUser();
    const users = listUsers();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe(DEFAULT_USERNAME);
  });

  it('logs the default user in on first run', async () => {
    await seedDefaultUser();
    const id = getCurrentUserId();
    expect(id).toBeTruthy();
    expect(findUserByUsername(DEFAULT_USERNAME)?.id).toBe(id);
  });

  it('is idempotent — calling twice does not duplicate', async () => {
    await seedDefaultUser();
    await seedDefaultUser();
    expect(listUsers()).toHaveLength(1);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await seedDefaultUser();
    setCurrentUserId(null);
  });

  it('returns the user and sets current session on correct credentials', async () => {
    const u = await login(DEFAULT_USERNAME, DEFAULT_PASSWORD);
    expect(u).toBeTruthy();
    expect(u?.username).toBe(DEFAULT_USERNAME);
    expect(getCurrentUserId()).toBe(u?.id);
  });

  it('returns null and does not set session on wrong password', async () => {
    const u = await login(DEFAULT_USERNAME, 'wrong');
    expect(u).toBeNull();
    expect(getCurrentUserId()).toBeNull();
  });

  it('returns null on unknown username', async () => {
    const u = await login('ghost', 'whatever');
    expect(u).toBeNull();
  });
});
