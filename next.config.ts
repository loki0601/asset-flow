import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
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
