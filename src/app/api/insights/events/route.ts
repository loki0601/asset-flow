import { NextResponse } from 'next/server';
import { getServerDb } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Reference events feed for the Insights tab.
 *
 * GET /api/insights/events
 *   ?from=YYYY-MM-DD       (default: today)
 *   &until=YYYY-MM-DD      (default: today + 60d)
 *   &kinds=ipo,lockup_expiry (csv, default: all)
 *   &limit=200
 *
 * Returns: { events: [...], asOf: ISO }
 *
 * Source: server.db.reference_events, refreshed daily by scripts/fetch-reference-events.py.
 */
interface RawEventRow {
  id: string;
  kind: string;
  symbol: string | null;
  name: string;
  date: string;
  title: string;
  detail: string | null;
  impact: string;
  confidence: string;
  source: string | null;
  tags: string | null;
  added_at: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get('from') ?? today;
  // Lockup events can be 180+ days out, and we want every future event
  // visible by default. 400d covers a full year of IPOs.
  const defaultUntil = new Date();
  defaultUntil.setUTCDate(defaultUntil.getUTCDate() + 400);
  const until = url.searchParams.get('until') ?? defaultUntil.toISOString().slice(0, 10);
  const kinds = (url.searchParams.get('kinds') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 200));

  const db = getServerDb();
  let sql =
    'SELECT id, kind, symbol, name, date, title, detail, impact, confidence, source, tags, added_at ' +
    'FROM reference_events WHERE date >= ? AND date <= ?';
  const params: (string | number)[] = [from, until];
  if (kinds.length > 0) {
    sql += ` AND kind IN (${kinds.map(() => '?').join(',')})`;
    params.push(...kinds);
  }
  sql += ' ORDER BY date ASC, kind ASC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as RawEventRow[];

  const events = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    symbol: r.symbol,
    name: r.name,
    date: r.date,
    title: r.title,
    detail: r.detail,
    impact: r.impact,
    confidence: r.confidence,
    source: r.source,
    tags: r.tags ? safeJsonParse(r.tags) : [],
  }));

  return NextResponse.json(
    { asOf: new Date().toISOString(), events },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
