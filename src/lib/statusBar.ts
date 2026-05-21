/**
 * Initialise the Android status bar so its icons stay readable on our
 * brand-surface background.  Capacitor's default behaviour on edge-to-edge
 * Android (SDK 35+) draws the WebView under a transparent status bar with
 * light icons, which become invisible on light theme.  We pick the icon
 * style from the active app theme (`html[data-theme]`).
 *
 * No-op on web.
 */

import { Capacitor } from '@capacitor/core';

export async function initStatusBar(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Full-bleed: WebView extends behind both system bars. Layouts pad
    // with env(safe-area-inset-*).
    await StatusBar.setOverlaysWebView({ overlay: true });
    await applyStatusBarStyle(StatusBar, Style);
  } catch (err) {
    console.warn('[statusBar] init failed', err);
  }
}

/** Re-apply the status-bar style after a theme switch. */
export async function refreshStatusBarStyle(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await applyStatusBarStyle(StatusBar, Style);
  } catch (err) {
    console.warn('[statusBar] style refresh failed', err);
  }
}

type StatusBarApi = typeof import('@capacitor/status-bar')['StatusBar'];
type StyleEnum = typeof import('@capacitor/status-bar')['Style'];

async function applyStatusBarStyle(StatusBar: StatusBarApi, Style: StyleEnum) {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';
  // Plugin naming: "Light" = light background → dark icons.  Counter-
  // intuitive but documented.
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
}
