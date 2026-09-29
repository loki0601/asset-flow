import { createId } from '@paralleldrive/cuid2';
import { getStorage, globalKey, readJSON, removeKey, userKey, writeJSON } from '@/lib/storage';
import type { Session, User } from '@/lib/schema';

export const DEFAULT_USERNAME = 'loki0601';
export const DEFAULT_PASSWORD = 'loki0601';

const USERS_KEY = globalKey('users');
const SESSION_KEY = globalKey('session');
const SERVER_SESSION_KEY = globalKey('server-session');
const USER_COLLECTIONS = [
  'members',
  'accounts',
  'holdings',
  'transactions',
  'loans',
  'retirementTargets',
] as const;

export interface ServerSession {
  token: string;
  user: Pick<User, 'id' | 'username' | 'createdAt'>;
}

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function listUsers(): User[] {
  return readJSON<User[]>(USERS_KEY, []);
}

export function findUserByUsername(username: string): User | undefined {
  return listUsers().find((u) => u.username === username);
}

export function getCurrentUserId(): string | null {
  return readJSON<Session>(SESSION_KEY, { currentUserId: null }).currentUserId;
}

export function setCurrentUserId(userId: string | null): void {
  writeJSON<Session>(SESSION_KEY, { currentUserId: userId });
}

export function getServerSession(): ServerSession | null {
  return readJSON<ServerSession | null>(SERVER_SESSION_KEY, null);
}

/**
 * Attach this device to the authenticated server identity. If it already has
 * local data for the same username, re-key it once so the first upload keeps
 * every existing account, holding, and transaction.
 */
export function adoptServerSession(session: ServerSession): void {
  const local = findUserByUsername(session.user.username);
  if (local && local.id !== session.user.id) {
    const storage = getStorage();
    for (const collection of USER_COLLECTIONS) {
      const oldKey = userKey(local.id, collection);
      const raw = storage.getItem(oldKey);
      if (raw == null) continue;
      try {
        const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
        storage.setItem(
          userKey(session.user.id, collection),
          JSON.stringify(rows.map((row) => ({ ...row, userId: session.user.id }))),
        );
        storage.removeItem(oldKey);
      } catch {
        // Preserve malformed legacy data under its original key rather than
        // silently dropping it during a login migration.
      }
    }
  }
  const users = listUsers().filter((user) => user.username !== session.user.username);
  writeJSON<User[]>(USERS_KEY, [...users, { ...session.user, passwordHash: '' }]);
  writeJSON<ServerSession>(SERVER_SESSION_KEY, session);
  setCurrentUserId(session.user.id);
}

export function clearServerSession(): void {
  removeKey(SERVER_SESSION_KEY);
}

/** True when a legacy device has financial data that must win its first sync. */
export function hasLocalPortfolioData(username: string): boolean {
  const user = findUserByUsername(username);
  if (!user) return false;
  const storage = getStorage();
  return ['accounts', 'holdings', 'transactions', 'loans', 'retirementTargets'].some((collection) => {
    const raw = storage.getItem(userKey(user.id, collection));
    if (!raw) return false;
    try {
      return Array.isArray(JSON.parse(raw)) && JSON.parse(raw).length > 0;
    } catch {
      return false;
    }
  });
}

export async function seedDefaultUser(): Promise<User> {
  const existing = findUserByUsername(DEFAULT_USERNAME);
  if (existing) {
    if (!getCurrentUserId()) setCurrentUserId(existing.id);
    return existing;
  }
  const user: User = {
    id: createId(),
    username: DEFAULT_USERNAME,
    passwordHash: await hashPassword(DEFAULT_PASSWORD),
    createdAt: new Date().toISOString(),
  };
  writeJSON<User[]>(USERS_KEY, [...listUsers(), user]);
  setCurrentUserId(user.id);
  return user;
}

export async function login(username: string, password: string): Promise<User | null> {
  const user = findUserByUsername(username);
  if (!user) return null;
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) return null;
  setCurrentUserId(user.id);
  return user;
}

export function logout(): void {
  clearServerSession();
  setCurrentUserId(null);
}

/**
 * Create a new account and immediately log them in.
 *
 * Throws on invalid input or duplicate username — callers should surface
 * the message directly to the form.
 */
export async function signup(username: string, password: string): Promise<User> {
  const cleaned = username.trim();
  if (!cleaned) throw new Error('username is required');
  if (cleaned.length < 2) throw new Error('username must be at least 2 characters');
  if (password.length < 4) {
    throw new Error('password must be at least 4 characters');
  }
  if (findUserByUsername(cleaned)) {
    throw new Error('이미 사용 중인 사용자명입니다');
  }
  const user: User = {
    id: createId(),
    username: cleaned,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  writeJSON<User[]>(USERS_KEY, [...listUsers(), user]);
  setCurrentUserId(user.id);
  return user;
}
