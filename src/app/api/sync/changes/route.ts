import { NextResponse } from 'next/server';
import { appendSyncChange, listSyncChanges, type SyncChangeInput } from '@/server/db';
import { getRequestUser } from '@/server/requestAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const collections = new Set(['members', 'accounts', 'holdings', 'transactions', 'loans', 'retirementTargets']);

function isChange(value: unknown): value is SyncChangeInput {
  if (!value || typeof value !== 'object') return false;
  const change = value as Record<string, unknown>;
  if (typeof change.collection !== 'string' || !collections.has(change.collection)) return false;
  if (typeof change.entityId !== 'string' || change.entityId.length === 0 || change.entityId.length > 128) return false;
  if (change.kind !== 'upsert' && change.kind !== 'delete') return false;
  if (typeof change.baseVersion !== 'number' || !Number.isSafeInteger(change.baseVersion) || change.baseVersion < 0) return false;
  if (typeof change.clientUpdatedAt !== 'string' || Number.isNaN(Date.parse(change.clientUpdatedAt))) return false;
  if (change.kind === 'upsert' && (!change.payload || typeof change.payload !== 'object' || Array.isArray(change.payload))) return false;
  return true;
}

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const after = Math.max(0, Number(new URL(request.url).searchParams.get('cursor') ?? '0') || 0);
  const changes = listSyncChanges(user.id, after);
  return NextResponse.json({ changes, cursor: changes.at(-1)?.cursor ?? after }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { changes?: SyncChangeInput[] } | null;
  if (!Array.isArray(body?.changes) || body.changes.length === 0 || body.changes.length > 100 || !body.changes.every(isChange)) {
    return NextResponse.json({ error: '1~100개의 변경분이 필요합니다.' }, { status: 400 });
  }
  const results = body.changes.map((change) => appendSyncChange(user.id, change));
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
