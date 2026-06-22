/**
 * Client-side cache for the brand-icon manifest. The full manifest is
 * ~1.8 MB (≈200 KB gzipped) and changes only when the server's catalog
 * does, so the right model is "fetch once, keep in sql.js KV".
 *
 *   assetBrandIcon()  ← reads the cached map synchronously
 *   syncBrandIconManifest(fetch) — kicked from AuthProvider on boot
 */
import { kvGet, kvSet } from '@/lib/db';

interface ManifestIcon {
  path: string;
  viewBox: string;
  slug: string;
  /** Brand-native hex colour (no leading "#"). Optional so older cached
   *  manifests still load — assetBrandIcon supplies a fallback. */
  hex?: string;
}

interface CachedManifest {
  version: string;
  icons: Record<string, ManifestIcon>;
  /** Symbols where no SVG glyph exists but a domain-derived logo is
   *  available through `/api/icons/logo/[symbol]`. Stored as a list on
   *  disk; hydrated into a Set on first read for O(1) lookups. */
  logoSymbols?: string[];
}

const KV_KEY = 'assetflow:brandIcons:manifest';

// In-process mirror so reads inside a render pass don't re-deserialize the
// whole blob. Invalidated by sync() / loadFromKv() after a successful
// fetch or kv reload.
let inMemory: CachedManifest | null = null;
let logoSet: Set<string> | null = null;
let hydrated = false;

function loadFromKv(): CachedManifest | null {
  const raw = kvGet(KV_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedManifest;
  } catch {
    return null;
  }
}

function hydrate(): void {
  if (hydrated) return;
  inMemory = loadFromKv();
  logoSet = inMemory?.logoSymbols ? new Set(inMemory.logoSymbols) : null;
  hydrated = true;
}

export function cachedBrandIcon(symbol: string): ManifestIcon | null {
  hydrate();
  return inMemory?.icons?.[symbol] ?? null;
}

/** True when the manifest's `logoSymbols` list contains the symbol —
 *  the client may then try `/api/icons/logo/[symbol]` and route through
 *  the mask-image render path. */
export function cachedHasLogo(symbol: string): boolean {
  hydrate();
  return logoSet?.has(symbol) ?? false;
}

export function cachedManifestVersion(): string | null {
  hydrate();
  return inMemory?.version ?? null;
}

/** Drop the in-process mirror — tests use this between cases. */
export function _resetBrandIconCacheForTests(): void {
  inMemory = null;
  logoSet = null;
  hydrated = false;
}

/**
 * Best-effort browser-cache warmup: kick `/api/icons/logo/[symbol]`
 * fetches for each held symbol that has a logo, so the holdings card
 * doesn't see the visible network round-trip on first render.
 *
 * Uses `cache: 'force-cache'` so it's a true prefetch — the browser
 * stores the response in its HTTP cache, and the later `<img>` tag
 * reads from that cache instead of touching the network. We skip
 * symbols that lack a domain mapping (no point) and chunk requests so
 * a large portfolio doesn't blast 100+ parallel fetches.
 */
export async function prefetchHeldLogos(
  fetchImpl: typeof fetch,
  symbols: readonly string[],
): Promise<void> {
  hydrate();
  if (!logoSet) return;
  const targets = symbols.filter((s) => logoSet?.has(s));
  if (targets.length === 0) return;
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const i = cursor++;
      const symbol = targets[i];
      try {
        await fetchImpl(`/api/icons/logo/${encodeURIComponent(symbol)}`, {
          cache: 'force-cache',
        });
      } catch {
        /* offline — img tag will retry when the card actually renders */
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

/**
 * Fetch /api/icons/manifest and persist the result if it differs from
 * the cached version. Best-effort: any failure is swallowed so it
 * cannot block boot. Safe to call repeatedly — the ETag header makes
 * unchanged versions return 304.
 */
export async function syncBrandIconManifest(fetchImpl: typeof fetch): Promise<void> {
  hydrate();
  try {
    const headers: HeadersInit = inMemory?.version
      ? { 'If-None-Match': `"${inMemory.version}"` }
      : {};
    const res = await fetchImpl('/api/icons/manifest', { headers });
    if (res.status === 304) return; // server confirmed our cache is current
    if (!res.ok) return;
    const data = (await res.json()) as CachedManifest;
    if (!data?.version || !data.icons) return;
    if (inMemory?.version === data.version) return;
    kvSet(KV_KEY, JSON.stringify(data));
    inMemory = data;
    logoSet = data.logoSymbols ? new Set(data.logoSymbols) : null;
  } catch {
    /* offline / network glitch — keep whatever we already have */
  }
}
