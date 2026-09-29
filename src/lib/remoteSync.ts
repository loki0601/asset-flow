import { adoptServerSession, hasLocalPortfolioData, type ServerSession } from '@/lib/auth';
import { exportDbForSync, flushPersistDb, importDbFromSync } from '@/lib/db';

interface RemoteAuthResponse {
  user: ServerSession['user'];
  token: string;
  error?: string;
}

async function authRequest(path: string, username: string, password: string): Promise<ServerSession> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const payload = (await response.json().catch(() => ({}))) as RemoteAuthResponse;
  if (!response.ok || !payload.token || !payload.user) {
    throw new Error(payload.error ?? '서버 로그인을 완료하지 못했습니다.');
  }
  return { token: payload.token, user: payload.user };
}

export function loginToServer(username: string, password: string): Promise<ServerSession> {
  return authRequest('/api/auth/login', username, password);
}

export function signupOnServer(username: string, password: string): Promise<ServerSession> {
  return authRequest('/api/auth/signup', username, password);
}

function headers(session: ServerSession): HeadersInit {
  return { Authorization: `Bearer ${session.token}` };
}

/** Upload this device's current local cache as the account's canonical snapshot. */
export async function uploadSyncSnapshot(session: ServerSession): Promise<void> {
  await flushPersistDb();
  const response = await fetch('/api/sync/snapshot', {
    method: 'PUT',
    headers: { ...headers(session), 'Content-Type': 'application/octet-stream' },
    body: new Blob([exportDbForSync() as BlobPart], { type: 'application/octet-stream' }),
  });
  if (!response.ok) throw new Error('서버에 데이터를 동기화하지 못했습니다.');
}

/**
 * Complete a remote login. The first device uploads its local data when no
 * server snapshot exists; every later device downloads the same snapshot.
 */
export async function connectServerSession(session: ServerSession): Promise<'uploaded' | 'downloaded'> {
  const preserveLegacyPortfolio = hasLocalPortfolioData(session.user.username);
  adoptServerSession(session);
  const response = await fetch('/api/sync/snapshot', { headers: headers(session) });
  if (response.status === 204 || preserveLegacyPortfolio) {
    await uploadSyncSnapshot(session);
    return 'uploaded';
  }
  if (!response.ok) throw new Error('서버 동기화 데이터를 불러오지 못했습니다.');
  await importDbFromSync(new Uint8Array(await response.arrayBuffer()));
  // Session data is intentionally excluded from the server snapshot, so the
  // import above wipes it — re-adopt it into the freshly imported DB. Await
  // the flush so the session is durable before this resolves: without it,
  // adoptServerSession only *schedules* a debounced write, and an Android
  // process kill shortly after login (backgrounding, low memory) can lose it
  // before it reaches IndexedDB, bouncing the user back to /login.
  adoptServerSession(session);
  await flushPersistDb();
  return 'downloaded';
}
