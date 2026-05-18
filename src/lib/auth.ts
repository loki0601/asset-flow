import { createId } from '@paralleldrive/cuid2';
import { globalKey, readJSON, writeJSON } from '@/lib/storage';
import type { Session, User } from '@/lib/schema';

export const DEFAULT_USERNAME = 'loki0601';
export const DEFAULT_PASSWORD = 'loki0601';

const USERS_KEY = globalKey('users');
const SESSION_KEY = globalKey('session');

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
  setCurrentUserId(null);
}
