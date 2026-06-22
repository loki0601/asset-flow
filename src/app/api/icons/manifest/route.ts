/**
 * GET /api/icons/manifest
 *
 * Returns the full brand-icon manifest the client caches in sql.js KV.
 * Body: { version, icons: { [symbol]: { path, viewBox, slug } }, count }.
 *
 * Module-level memoised on the server — rebuilt only when the process
 * restarts. ETag supports cheap revalidation; clients that already hold
 * the current version get a 304.
 */
import { NextResponse } from 'next/server';
import { brandIconManifest } from '@/server/brandIcons';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const manifest = brandIconManifest();
  const etag = `"${manifest.version}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  return NextResponse.json(manifest, {
    headers: {
      ETag: etag,
      // 24h CDN/browser cache + must-revalidate so the device picks up
      // a deploy-day refresh. The version field is the real cache key
      // on the client side (sql.js KV).
      'Cache-Control': 'public, max-age=86400, must-revalidate',
    },
  });
}
