/**
 * GET /api/fx/history?pair=USDKRW&from=YYYY-MM-DD
 *
 * Daily FX rates for the requested pair. Used by the client to mark each
 * historical asset-flow data point with the FX rate that was actually in
 * effect on that day — otherwise USD holdings would appear to swing with
 * the latest snapshot rate.
 */

import { NextResponse } from 'next/server';
import { fxHistoryRepo } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = (url.searchParams.get('pair') ?? 'USDKRW').toUpperCase();
  const from = url.searchParams.get('from') ?? '2000-01-01';
  const rows = fxHistoryRepo.listSince(pair, from);
  return NextResponse.json(
    { pair, rows },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  );
}
