/**
 * Bridge to read prices the native FirebaseMessagingService pre-fetched
 * while the WebView was dead. The service writes the /api/prices response
 * verbatim to `<filesDir>/pending_sync.json`; this module reads it via the
 * Capacitor Filesystem plugin, applies it to the local catalog using the
 * same shape the JS-side syncPrices expects, then deletes the file.
 *
 * Safe to call on web (no-op) and on Android with no pending file.
 */

import { Capacitor } from '@capacitor/core';
import { applyPricePayload, type PricePayload } from '@/lib/prices';

const PENDING_FILE = 'pending_sync.json';

export async function ingestNativePendingSync(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return false;
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    let raw: string;
    try {
      const result = await Filesystem.readFile({
        path: PENDING_FILE,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      raw = typeof result.data === 'string' ? result.data : await result.data.text();
    } catch {
      return false; // file absent — nothing to ingest
    }
    const payload = JSON.parse(raw) as PricePayload;
    applyPricePayload(payload);
    // Best-effort delete; if it fails the next run will overwrite anyway.
    await Filesystem.deleteFile({ path: PENDING_FILE, directory: Directory.Data }).catch(() => {});
    return true;
  } catch (err) {
    console.warn('[nativeSync] ingest failed', err);
    return false;
  }
}
