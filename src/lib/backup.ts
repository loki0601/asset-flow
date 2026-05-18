/**
 * Client-side backup uploader. Exports the running sql.js DB blob and POSTs
 * it to /api/backup, where the server keeps the latest N copies keyed by
 * the user's id + a timestamp. Doubles as a safety net for the local
 * IndexedDB store and lets us restore on a fresh install in the future.
 */

import { getDb, flushPersistDb } from '@/lib/db';

export interface BackupAck {
  id: number;
  createdAt: string;
  blobSize: number;
}

export async function uploadBackup(opts: {
  userId: string;
  username?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<BackupAck> {
  // Make sure any pending in-memory writes are persisted to IndexedDB before
  // we snapshot — keeps the server copy aligned with what the next cold
  // launch will read locally.
  await flushPersistDb();
  const u8 = getDb().export();
  // BodyInit accepts ArrayBuffer, Blob, etc. — wrap so TS is happy and
  // fetch streams the raw bytes verbatim (no JSON / base64 overhead).
  const body = new Blob([u8 as BlobPart], { type: 'application/octet-stream' });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl('/api/backup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-user-id': opts.userId,
      ...(opts.username ? { 'x-username': opts.username } : {}),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`backup upload failed: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as BackupAck;
}
