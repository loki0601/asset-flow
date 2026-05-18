import { NextResponse } from 'next/server';
import { fcmTokensRepo } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { token?: string; platform?: string }
    | null;
  const token = body?.token?.trim();
  const platform = body?.platform?.trim() || 'unknown';
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }
  fcmTokensRepo.upsert(token, platform);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
