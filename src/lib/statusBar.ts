/**
 * Initialise the Android status bar so its icons stay readable on our
 * light-mode background. Capacitor's default behaviour on edge-to-edge
 * Android (SDK 35+) draws the WebView under a transparent status bar with
 * light icons, which become invisible on our off-white brand-surface
 * background. Setting style=Light tells the OS to render dark icons.
 *
 * No-op on web.
 */

import { Capacitor } from '@capacitor/core';

export async function initStatusBar(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Full-bleed: WebView extends behind both system bars. Our layout uses
    // env(safe-area-inset-top/bottom) to pad content so it stays clear of
    // the status bar above and the gesture bar below.
    await StatusBar.setOverlaysWebView({ overlay: true });
    // "Light" = light background / dark icons. Counter-intuitive plugin naming.
    await StatusBar.setStyle({ style: Style.Light });
  } catch (err) {
    console.warn('[statusBar] init failed', err);
  }
}
