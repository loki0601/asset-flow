/**
 * POST /api/prices/history/track
 * Body: { symbol: string }
 *
 * Idempotent — registers a symbol for history tracking. PR1 only inserts the
 * row with status=pending. PR2 will additionally spawn the backfill worker.
 */

import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { trackedSymbolsRepo } from '@/server/db';

export const dynamic = 'force-dynamic';

function spawnBackfill(symbol: string): void {
  const py = path.join(process.cwd(), '.venv/bin/python');
  const script = path.join(process.cwd(), 'scripts/backfill-symbol.py');
  const child = spawn(py, [script, '--symbol', symbol], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
  });
  child.unref();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { symbol?: string } | null;
  const symbol = body?.symbol;
  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  const existing = trackedSymbolsRepo.get(symbol);
  trackedSymbolsRepo.upsert(symbol);

  // Spawn the backfill worker only on first registration or if the previous
  // attempt failed. Already-ready symbols don't re-fetch.
  if (!existing || existing.status === 'failed') {
    try {
      spawnBackfill(symbol);
    } catch (err) {
      console.warn('[track] spawn failed', err);
    }
  }

  const row = trackedSymbolsRepo.get(symbol);
  return NextResponse.json(
    {
      symbol,
      status: row?.status ?? 'pending',
      lastCloseDate: row?.last_close_date ?? null,
    },
    { status: 202, headers: { 'Cache-Control': 'no-store' } },
  );
}
