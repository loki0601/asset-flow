import { getCurrentUserId, getServerSession, setCurrentUserId } from '@/lib/auth';
import { flushChangeOutbox, pullChangeFeed, seedChangeFeed } from '@/lib/changeSync';

/**
 * Resolve which user (if any) is signed in after app boot, syncing with the
 * server on a best-effort basis.
 *
 * A session written to disk by a previous successful login is the source of
 * truth for "am I logged in" — a network hiccup during today's boot sync
 * (the change-feed flush/pull) must never be mistaken for a logout.
 *
 * The full snapshot exchange (connectServerSession) is deliberately NOT run
 * here: it is the login-time bootstrap. Running it on every boot downloaded
 * and then re-uploaded the whole local DB (~11MB) before the first paint.
 */
export async function resolveBootSession(): Promise<string | null> {
  if (!getServerSession()) {
    // Legacy local sessions remain on disk for the one-time migration, but
    // cannot enter the app until they become a real server account.
    setCurrentUserId(null);
  }
  const userId = getCurrentUserId();
  if (userId) {
    // Snapshots are only the one-time migration/first-device bootstrap. All
    // later portfolio writes travel through the append-only change feed.
    seedChangeFeed(userId);
    try {
      await flushChangeOutbox(userId);
      await pullChangeFeed(userId);
    } catch (err) {
      console.warn('[bootAuth] boot change-feed sync failed — will retry on resume', err);
    }
  }
  return userId;
}
