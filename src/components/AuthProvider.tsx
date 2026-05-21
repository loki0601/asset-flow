'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getCurrentUserId, logout as clearSession } from '@/lib/auth';
import { familyRepo } from '@/lib/repos';
import { syncThemeFromDb } from '@/hooks/useTheme';

const PUBLIC_ROUTES = new Set(['/login', '/signup']);
const ONBOARDING_ROUTE = '/onboarding';
import {
  flushPersistDb,
  initDb,
  migrateAccountTypeRenames,
  migrateLegacyLocalStorage,
  migrateLoki0601MemberName,
  SqliteKvStore,
} from '@/lib/db';
import { setStorage } from '@/lib/storage';
import {
  getLastSyncAt,
  getLocalCatalogVersion,
  hasLocalCatalog,
  syncCatalog,
} from '@/lib/catalog';
import { getLastPriceSyncAt, syncLivePrices, syncPrices } from '@/lib/prices';
import { holdingsRepo } from '@/lib/repos';
import { initPush } from '@/lib/push';
import { ingestNativePendingSync } from '@/lib/nativeSync';
import { initStatusBar } from '@/lib/statusBar';
import { registerServiceWorker } from '@/lib/serviceWorker';

interface AuthValue {
  userId: string | null;
  ready: boolean;
  /** Bumped on every successful catalog sync; UI uses it as a re-render key. */
  catalogVersion: string;
  /** ISO timestamp of last catalog sync, or null if never synced. */
  catalogLastSyncAt: string | null;
  /** Trigger a manual catalog sync (for the settings UI). */
  refreshCatalog: () => Promise<void>;
  /** True while a manual catalog refresh is in-flight. */
  catalogSyncing: boolean;
  /** ISO timestamp of last price sync, or null if never synced. */
  pricesLastSyncAt: string | null;
  /** Trigger a manual price sync (daily-close prices). */
  refreshPrices: () => Promise<void>;
  /** True while a manual price refresh is in-flight. */
  pricesSyncing: boolean;
  /** Adopt a freshly authenticated user — called by /login + /signup. */
  signIn: (userId: string) => void;
  /** Clear the persisted session and reset in-memory userId. */
  signOut: () => void;
}

const Ctx = createContext<AuthValue>({
  userId: null,
  ready: false,
  catalogVersion: '0.0.0',
  catalogLastSyncAt: null,
  refreshCatalog: async () => {},
  catalogSyncing: false,
  pricesLastSyncAt: null,
  refreshPrices: async () => {},
  pricesSyncing: false,
  signIn: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<
    Omit<
      AuthValue,
      | 'refreshCatalog'
      | 'catalogSyncing'
      | 'refreshPrices'
      | 'pricesSyncing'
      | 'signIn'
      | 'signOut'
    >
  >({
    userId: null,
    ready: false,
    catalogVersion: '0.0.0',
    catalogLastSyncAt: null,
    pricesLastSyncAt: null,
  });
  const [syncing, setSyncing] = useState(false);
  const [pricesSyncing, setPricesSyncing] = useState(false);

  const refreshCatalog = useCallback(async () => {
    setSyncing(true);
    try {
      await syncCatalog();
      setState((prev) => ({
        ...prev,
        catalogVersion: getLocalCatalogVersion(),
        catalogLastSyncAt: getLastSyncAt(),
      }));
    } finally {
      setSyncing(false);
    }
  }, []);

  const refreshPrices = useCallback(async () => {
    setPricesSyncing(true);
    try {
      const heldSymbols = state.userId
        ? Array.from(new Set(holdingsRepo.list(state.userId).map((h) => h.symbol)))
        : [];
      // Two-step: baseline daily-close from cron snapshot, then overlay any
      // live ticks the server can fetch for held symbols whose markets are
      // currently open. Doing daily first means out-of-window holdings keep
      // a fresh close even when live returns market-closed for them.
      await syncPrices(fetch, heldSymbols);
      if (heldSymbols.length > 0) {
        try {
          await syncLivePrices(heldSymbols, fetch);
        } catch (err) {
          console.warn('[AuthProvider] live overlay skipped:', err);
        }
      }
      setState((prev) => ({
        ...prev,
        pricesLastSyncAt: getLastPriceSyncAt(),
      }));
    } finally {
      setPricesSyncing(false);
    }
  }, [state.userId]);

  // FCM-triggered automatic sync. lib/push.ts emits this event when the
  // server sends a push with data.action='syncPrices'.
  useEffect(() => {
    const handler = () => {
      refreshPrices().catch((err) => console.warn('[AuthProvider] fcm sync failed', err));
    };
    window.addEventListener('assetflow:fcm-sync-prices', handler);
    return () => window.removeEventListener('assetflow:fcm-sync-prices', handler);
  }, [refreshPrices]);

  // When the app comes back to foreground, check for any pending native-side
  // sync the FirebaseMessagingService left behind while we were dead.
  // Also flush any debounced persistDb writes when the app goes hidden,
  // since the WebView process may be killed without firing microtasks.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        flushPersistDb();
        return;
      }
      if (document.visibilityState !== 'visible') return;
      ingestNativePendingSync()
        .then((ingested) => {
          if (ingested) {
            setState((prev) => ({ ...prev, pricesLastSyncAt: getLastPriceSyncAt() }));
          }
        })
        .catch((err) => console.warn('[AuthProvider] visibility ingest skipped', err));
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    // Service worker registration — must run before initDb so the WASM
    // request is served from SW cache on subsequent loads.
    registerServiceWorker();
    let cancelled = false;
    (async () => {
      try {
        await initDb();
        migrateLegacyLocalStorage();
        migrateAccountTypeRenames();
        migrateLoki0601MemberName();
        setStorage(new SqliteKvStore());
        // Theme preference may live in kv (persisted in the user DB
        // blob).  Reconcile against localStorage now — after DB load —
        // so a restored backup re-applies its dark/light setting.
        syncThemeFromDb();
        // No auto-seed — a missing session means the /login route gates
        // entry. Existing devices keep their stored loki0601 session until
        // explicit logout.
        const userId = getCurrentUserId();
        if (!cancelled) {
          setState({
            userId,
            ready: true,
            catalogVersion: getLocalCatalogVersion(),
            catalogLastSyncAt: getLastSyncAt(),
            pricesLastSyncAt: getLastPriceSyncAt(),
          });
        }
        // Catalog sync on boot — only when missing or version-mismatched.
        // The full payload is ~500KB and parsing + persisting via sql.js
        // takes seconds on the device, so guard with a cheap HEAD-style
        // /api/catalog/version probe first.
        (async () => {
          try {
            const localVer = getLocalCatalogVersion();
            const needsFullSync = !hasLocalCatalog();
            if (!needsFullSync) {
              const res = await fetch('/api/catalog/version').catch(() => null);
              if (!res?.ok) return;
              const { version } = (await res.json()) as { version: string };
              if (version === localVer) return; // up to date — skip the heavy sync
            }
            await syncCatalog();
            if (!cancelled) {
              setState((prev) => ({
                ...prev,
                catalogVersion: getLocalCatalogVersion(),
                catalogLastSyncAt: getLastSyncAt(),
              }));
            }
          } catch (err) {
            console.warn('[AuthProvider] catalog sync skipped:', err);
          }
        })();

        // Native Android: configure the status bar early so icons are visible.
        initStatusBar().catch((err) => console.warn('[AuthProvider] status bar init failed', err));

        // FCM registration — native Android only, no-op elsewhere.
        initPush().catch((err) => console.warn('[AuthProvider] push init failed', err));

        // Native FirebaseMessagingService may have dropped a pre-fetched
        // price payload while the WebView was dead. Ingest it now so the
        // UI reflects the latest server data without a manual sync.
        ingestNativePendingSync()
          .then((ingested) => {
            if (ingested && !cancelled) {
              setState((prev) => ({
                ...prev,
                pricesLastSyncAt: getLastPriceSyncAt(),
              }));
            }
          })
          .catch((err) => console.warn('[AuthProvider] native sync ingest skipped', err));
      } catch (err) {
        console.error('[AuthProvider] init failed', err);
        if (!cancelled) setState((prev) => ({ ...prev, ready: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, userId }));
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setState((prev) => ({ ...prev, userId: null }));
    router.replace('/login');
  }, [router]);

  /**
   * Auth gate: once boot finishes, route the user to the right page based
   * on auth state.
   *   - signed out + protected route → /login
   *   - signed in + on /login or /signup → /
   *   - signed in but no family member yet + outside /onboarding → /onboarding
   *   - signed in + on /onboarding but members already exist → /
   */
  useEffect(() => {
    if (!state.ready) return;
    const onPublic = PUBLIC_ROUTES.has(pathname);
    const onOnboarding = pathname === ONBOARDING_ROUTE;

    if (!state.userId) {
      if (!onPublic) router.replace('/login');
      return;
    }
    if (onPublic) {
      router.replace('/');
      return;
    }
    // Signed in: force first-run onboarding only if there are no members.
    // Don't auto-bounce off /onboarding once a member exists — the wizard
    // has its own step-2 (account) flow and decides when to call replace('/').
    const hasMembers = familyRepo.list(state.userId).length > 0;
    if (!hasMembers && !onOnboarding) {
      router.replace(ONBOARDING_ROUTE);
    }
  }, [state.ready, state.userId, pathname, router]);

  return (
    <Ctx.Provider
      value={{
        ...state,
        refreshCatalog,
        catalogSyncing: syncing,
        refreshPrices,
        pricesSyncing,
        signIn,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSignIn(): (userId: string) => void {
  return useContext(Ctx).signIn;
}

export function useSignOut(): () => void {
  return useContext(Ctx).signOut;
}

export function useCurrentUserId(): string | null {
  return useContext(Ctx).userId;
}

export function useAuthReady(): boolean {
  return useContext(Ctx).ready;
}

export function useCatalogVersion(): string {
  return useContext(Ctx).catalogVersion;
}

/**
 * Returns a string that changes on either catalog or price sync. Use this as
 * a React memo invalidation key when displaying market data (so callers
 * re-read the cached asset list after a price refresh).
 */
export function useMarketDataKey(): string {
  const { catalogVersion, pricesLastSyncAt } = useContext(Ctx);
  return `${catalogVersion}#${pricesLastSyncAt ?? ''}`;
}

export function useCatalogSync() {
  const { refreshCatalog, catalogSyncing, catalogLastSyncAt, catalogVersion } = useContext(Ctx);
  return { refreshCatalog, catalogSyncing, catalogLastSyncAt, catalogVersion };
}

export function usePriceSync() {
  const { refreshPrices, pricesSyncing, pricesLastSyncAt } = useContext(Ctx);
  return { refreshPrices, pricesSyncing, pricesLastSyncAt };
}
