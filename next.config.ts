import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  experimental: {
    // Client-router RSC payload reuse. Default dynamic=0 meant every bottom-tab
    // switch refetched the page payload over the Cloudflare tunnel — the main
    // "페이지 이동이 느리다" cost. Tab pages render from LOCAL data (repos/sqlite),
    // so a 5-minute-stale shell payload is harmless; page *content* stays live
    // via client state. Hard navigations still obey the no-store header policy.
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
  async headers() {
    return [
      {
        // HTML pages, API routes — never cache so deploy changes show up immediately.
        // Exception: /api/icons/* serves expensive-to-build content (brand-icon
        // manifest + cached company logos) that's safe to cache for 24h/30d via
        // the route handler's own headers — let those win.
        source: '/((?!_next/static|_next/image|favicon|api/icons/).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
      {
        // Content-hashed assets — safe to cache aggressively
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default config;
