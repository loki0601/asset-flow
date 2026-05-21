'use client';

import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '@/lib/db';
import { refreshStatusBarStyle } from '@/lib/statusBar';

export type ThemeChoice = 'light' | 'dark';

/**
 * localStorage is the fast-path: read by the inline boot script in
 * layout.tsx BEFORE the sql.js DB is ready, so the page paints with the
 * correct theme on first render (no FOUC).  We mirror to kv so the
 * preference is part of the user's DB blob — survives server backups
 * and is restored across devices when the blob is re-loaded.
 */
const STORAGE_KEY = 'assetflow:theme';
const KV_KEY = 'assetflow:settings:theme';

/**
 * Theme preference, persisted to localStorage.  Applied to <html
 * data-theme="…"> immediately on change so every brand-* CSS variable
 * swaps in lock-step.  An inline boot script in layout.tsx reads the same
 * key before the first paint to avoid FOUC.
 */
export function useTheme(): {
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
} {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStoredTheme());

  // Sync to <html> on mount in case the boot script missed it (e.g. SSR).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next: ThemeChoice) {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* localStorage full / blocked — best effort, in-memory still works */
      }
    }
    // Dual-write to sql.js kv so the preference is captured in the user
    // DB blob (and survives server backup → restore on a fresh device).
    try {
      kvSet(KV_KEY, next);
    } catch {
      /* DB not ready yet — localStorage carries it across this session */
    }
    // Also write to Capacitor Preferences (Android SharedPreferences).
    // MainActivity reads this BEFORE the WebView starts so the native
    // splash drawable + status bar match the saved theme on cold start,
    // independently of the system dark-mode toggle.
    void writeNativeThemePref(next);
    applyTheme(next);
  }

  return { theme, setTheme };
}

function readStoredTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'dark' ? 'dark' : 'light';
}

/**
 * Reconcile the theme between sql.js kv and localStorage once the DB is
 * ready.  Called from AuthProvider boot.
 *
 *   - kv has a value, localStorage doesn't (or differs)  → adopt kv
 *     (e.g. user restored a backup that included their dark choice)
 *   - localStorage has a value, kv doesn't               → migrate to kv
 *     (existing user upgrading to the dual-storage scheme)
 *
 * Re-applies the resolved theme so the DOM + status bar pick it up.
 */
export function syncThemeFromDb(): void {
  if (typeof window === 'undefined') return;
  const local = window.localStorage.getItem(STORAGE_KEY);
  let dbValue: string | null = null;
  try {
    dbValue = kvGet(KV_KEY);
  } catch {
    return;
  }
  if (dbValue && dbValue !== local) {
    window.localStorage.setItem(STORAGE_KEY, dbValue);
    applyTheme(dbValue === 'dark' ? 'dark' : 'light');
  } else if (local && !dbValue) {
    try {
      kvSet(KV_KEY, local);
    } catch {
      /* silent — non-critical */
    }
  }
}

function applyTheme(theme: ThemeChoice) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (theme === 'dark') el.setAttribute('data-theme', 'dark');
  else el.removeAttribute('data-theme');
  // Re-style the native status bar so its icons stay readable against
  // the freshly-swapped background.
  void refreshStatusBarStyle();
}

/**
 * Persist the chosen theme into Android SharedPreferences via Capacitor's
 * Preferences plugin.  MainActivity reads this in `onCreate` before the
 * WebView is started, so the next cold launch picks the right night-mode
 * resources (splash drawable, status bar) regardless of the device's
 * system dark-mode toggle.  No-op on web.
 */
async function writeNativeThemePref(theme: ThemeChoice): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.getPlatform() !== 'android') return;
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: 'assetflow-theme', value: theme });
  } catch (err) {
    // Plugin missing in browser context — silently ignore.
    void err;
  }
}
