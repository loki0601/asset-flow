/**
 * POST /api/fcm/send
 * Body: { action?: 'syncPrices'|'custom', title?: string, body?: string, data?: object }
 *
 * Broadcasts a push to every registered token. Used by the daily cron
 * (after fetch-prices.py) and for ad-hoc admin testing. Unregistered
 * tokens are pruned automatically based on FCM response codes.
 *
 * Auth: requires FCM_SEND_SECRET env var; sender must supply
 *   `Authorization: Bearer <FCM_SEND_SECRET>` header.
 *   Without that env var set, the endpoint is disabled (returns 503) —
 *   no anonymous broadcasts.
 */

import { NextResponse } from 'next/server';
import { fcmTokensRepo } from '@/server/db';
import { sendToAll } from '@/server/fcm';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.FCM_SEND_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'fcm send disabled' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    title?: string;
    body?: string;
    data?: Record<string, string>;
  };

  const tokens = fcmTokensRepo.listAll().map((r) => r.token);
  if (tokens.length === 0) {
    return NextResponse.json({ sent: 0, message: 'no registered tokens' });
  }

  const dataPayload: Record<string, string> = {
    action: body.action ?? 'syncPrices',
    ...(body.data ?? {}),
  };
  const notification =
    body.title || body.body ? { title: body.title ?? '', body: body.body ?? '' } : undefined;

  const result = await sendToAll(tokens, dataPayload, notification);
  for (const invalid of result.invalidTokens) {
    fcmTokensRepo.delete(invalid);
  }

  return NextResponse.json({
    sent: result.successCount,
    failed: result.failureCount,
    pruned: result.invalidTokens.length,
  });
}
