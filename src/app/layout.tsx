import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'Asset Flow',
  description: 'Family asset management',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#F4F7F5', // brand-surface — matches the app background so the
                         // status bar blends in.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // honor env(safe-area-inset-*) on edge-to-edge devices
};

// Inline before any chunked JS runs — catches the very first chunk load
// error (e.g. when the WebView serves stale HTML from memory cache after a
// fresh server build) and hard-reloads with a cache-bust query so the
// next attempt fetches the latest HTML + chunk references. Throttled to
// once per 10s to avoid reload loops if the chunks really are gone.
const CHUNK_ERROR_GUARD = `
(function() {
  function isChunkError(msg) {
    return /ChunkLoadError|Loading chunk \\d+ failed|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(String(msg || ''));
  }
  function bustAndReload() {
    try {
      var k = '__assetflow_chunk_reload_at';
      var last = Number(localStorage.getItem(k) || 0);
      if (Date.now() - last < 10000) return;
      localStorage.setItem(k, String(Date.now()));
    } catch (e) {}
    var url = location.pathname + '?_v=' + Date.now();
    location.replace(url);
  }
  window.addEventListener('error', function(e) {
    if (isChunkError(e && (e.message || e.error && e.error.message))) bustAndReload();
  });
  window.addEventListener('unhandledrejection', function(e) {
    var r = e && e.reason;
    if (isChunkError(r && (r.message || r))) bustAndReload();
  });
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <script dangerouslySetInnerHTML={{ __html: CHUNK_ERROR_GUARD }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
