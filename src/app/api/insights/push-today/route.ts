/**
 * POST /api/insights/push-today
 *
 * Builds a one-line summary of today's reference events and fans it out to
 * every registered FCM token. Triggered by a launchd job at 08:00 KST.
 *
 * Auth: same Bearer FCM_SEND_SECRET as /api/fcm/send. Disabled (503) when
 * the secret isn't configured.
 *
 * Behaviour:
 *   - Zero events today → skip the send (no empty notifications).
 *   - Otherwise → broadcast with title/body summarising up to 5 events.
 */

import { NextResponse } from 'next/server';
import { fcmTokensRepo, getServerDb } from '@/server/db';
import { sendToAll } from '@/server/fcm';
import { eventVerb } from '@/lib/eventVerb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RawRow {
  kind: string;
  symbol: string | null;
  name: string;
  tags: string | null;
}

export async function POST(request: Request) {
  const secret = process.env.FCM_SEND_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'fcm send disabled' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const db = getServerDb();
  const rows = db
    .prepare(
      'SELECT kind, symbol, name, tags FROM reference_events WHERE date = ? ORDER BY kind ASC',
    )
    .all(today) as RawRow[];

  if (rows.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 'no events today' });
  }

  const tokens = fcmTokensRepo.listAll().map((r) => r.token);
  if (tokens.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 'no registered tokens' });
  }

  const items = rows.map((r) => {
    const tags = safeJsonArray(r.tags);
    const verb = eventVerb({ kind: r.kind, tags });
    // Use symbol when present (tighter for a notification), fall back to name.
    const label = r.symbol ?? r.name;
    return `${label} ${verb.label}`;
  });
  const head = items.slice(0, 5).join(' · ');
  const tail = items.length > 5 ? ` 외 ${items.length - 5}건` : '';
  const title = `오늘 인사이트 (${items.length}건)`;
  const body = `${head}${tail}`;

  const result = await sendToAll(
    tokens,
    { action: 'insights' },
    { title, body },
  );
  for (const invalid of result.invalidTokens) {
    fcmTokensRepo.delete(invalid);
  }

  return NextResponse.json({
    sent: result.successCount,
    failed: result.failureCount,
    pruned: result.invalidTokens.length,
    title,
    body,
  });
}

function safeJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
