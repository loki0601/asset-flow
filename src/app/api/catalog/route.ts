import { NextResponse } from 'next/server';
import type { CatalogResponse } from '@/lib/schema';
import { ASSETS, MIGRATIONS, SERVER_VERSION, migrationsSince } from '@/server/catalog';

export const dynamic = 'force-static';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const since = url.searchParams.get('since') ?? '0.0.0';
  const payload: CatalogResponse = {
    version: SERVER_VERSION,
    assets: ASSETS,
    migrations: since ? migrationsSince(since) : MIGRATIONS,
  };
  return NextResponse.json(payload, {
    headers: {
      // HTML is no-store globally; for API we want clients to fetch fresh.
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
