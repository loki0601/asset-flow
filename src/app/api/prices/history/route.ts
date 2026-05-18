/**
 * GET /api/prices/history?symbol=KRX:005930&from=YYYY-MM-DD
 *
 * PR1: schema + route skeleton. Reads from server.db.price_history. If the
 * symbol is unknown or still pending backfill, returns an empty rows array
 * with a status hint so the client can decide whether to retry.
 *
 * PR2 will add backfill triggering; PR3 wires this into the sync button.
 */

import { NextResponse } from 'next/server';
import {
  serverPriceHistoryRepo,
  trackedSymbolsRepo,
} from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');
  const from = url.searchParams.get('from') ?? '1970-01-01';

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  const tracked = trackedSymbolsRepo.get(symbol);
  if (!tracked) {
    return NextResponse.json({
      symbol,
      status: 'unknown',
      rows: [],
    });
  }

  const rows = serverPriceHistoryRepo.listSince(symbol, from);
  return NextResponse.json(
    {
      symbol,
      status: tracked.status,
      lastCloseDate: tracked.last_close_date,
      rows,
    },
    {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    },
  );
}
