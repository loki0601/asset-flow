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
  signup,
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

describe('signup', () => {
  it('creates a new user, sets the session, and returns the user', async () => {
    const u = await signup('alice', 'secret123');
    expect(u.username).toBe('alice');
    expect(listUsers()).toHaveLength(1);
    expect(getCurrentUserId()).toBe(u.id);
  });

  it('rejects an empty username', async () => {
    await expect(signup('', 'secret123')).rejects.toThrow(/username/i);
  });

  it('rejects a duplicate username', async () => {
    await signup('alice', 'secret123');
    await expect(signup('alice', 'other123')).rejects.toThrow(/이미/);
  });

  it('rejects a password shorter than 4 characters', async () => {
    await expect(signup('alice', 'abc')).rejects.toThrow(/password|비밀번호/i);
  });

  it('hashes the stored password (no plaintext)', async () => {
    const u = await signup('alice', 'secret123');
    expect(u.passwordHash).not.toBe('secret123');
    expect(u.passwordHash).toMatch(/^[0-9a-f]{64}$/);
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
