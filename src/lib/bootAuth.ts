import { getCurrentUserId, getServerSession, setCurrentUserId } from '@/lib/auth';
import { connectServerSession } from '@/lib/remoteSync';
import { flushChangeOutbox, pullChangeFeed, seedChangeFeed } from '@/lib/changeSync';

/**
 * Resolve which user (if any) is signed in after app boot, syncing with the
 * server on a best-effort basis.
 *
 * A session written to disk by a previous successful login is the source of
 * truth for "am I logged in" — a network hiccup during today's boot sync
 * (connectServerSession's snapshot round-trip, or the change-feed flush/pull)
 * must never be mistaken for a logout. Callers that let those failures
 * propagate past this point end up clearing their in-memory userId even
 * though the on-disk session is still perfectly valid, bouncing a signed-in
 * user back to /login on every flaky-network cold start.
 */
export async function resolveBootSession(): Promise<string | null> {
  const serverSession = getServerSession();
  if (serverSession) {
    try {
      await connectServerSession(serverSession);
    } catch (err) {
      console.warn('[bootAuth] boot sync failed — staying signed in from the local session', err);
    }
  } else {
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
