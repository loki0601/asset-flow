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

export interface UploadOpts {
  userId: string;
  username?: string | null;
  /** Reports progress in [0, 1]. Fires multiple times during upload. */
  onProgress?: (fraction: number) => void;
  /** Abort upload after this many ms (default 120s). */
  timeoutMs?: number;
}

export async function uploadBackup(opts: UploadOpts): Promise<BackupAck> {
  // Make sure any pending in-memory writes are persisted to IndexedDB before
  // we snapshot — keeps the server copy aligned with what the next cold
  // launch will read locally.
  await flushPersistDb();
  const u8 = getDb().export();
  const body = new Blob([u8 as BlobPart], { type: 'application/octet-stream' });
  return xhrUploadBackup(body, opts);
}

/**
 * XMLHttpRequest-based uploader — `fetch` does not expose upload progress
 * events, but the settings UI needs real progress feedback so the user
 * isn't staring at an indefinite spinner.
 */
function xhrUploadBackup(body: Blob, opts: UploadOpts): Promise<BackupAck> {
  const { userId, username, onProgress, timeoutMs = 120_000 } = opts;
  return new Promise<BackupAck>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      const fraction =
        e.lengthComputable && e.total > 0 ? e.loaded / e.total : 0;
      onProgress(fraction);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as BackupAck);
        } catch (parseErr) {
          reject(new Error(`backup ack parse failed: ${String(parseErr)}`));
        }
      } else {
        reject(
          new Error(
            `backup upload failed: HTTP ${xhr.status} ${xhr.responseText.slice(0, 200)}`,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error('backup upload network error'));
    xhr.ontimeout = () => reject(new Error('backup upload timeout'));
    xhr.timeout = timeoutMs;
    xhr.open('POST', '/api/backup');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('x-user-id', userId);
    if (username) xhr.setRequestHeader('x-username', username);
    xhr.send(body);
  });
}
