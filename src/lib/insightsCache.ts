import { kvGet, kvSet } from '@/lib/db';

/**
 * Local cache for the Insights tab's /api/insights/events payload.
 *
 * The Insights tab was the one screen with no local fallback — every mount
 * fired the API call and held a skeleton until the server answered (blank
 * offline). Events refresh once a day on the server cron, so the last
 * payload is a perfectly good first paint: render it immediately, then
 * revalidate from the network in the background.
 *
 * Shape is opaque here (the page owns the ReferenceEvent type) — the cache
 * just round-trips JSON.
 */
const EVENTS_KEY = 'assetflow:insights:events';

export function getCachedInsightsEvents<T = unknown>(): T[] | null {
  const raw = kvGet(EVENTS_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function setCachedInsightsEvents(events: unknown[]): void {
  kvSet(EVENTS_KEY, JSON.stringify(events));
}
