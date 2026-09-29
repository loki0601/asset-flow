import { NextResponse } from 'next/server';
import { appendSyncChange, listSyncChanges, type SyncChangeInput } from '@/server/db';
import { getRequestUser } from '@/server/requestAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const collections = new Set(['members', 'accounts', 'holdings', 'transactions', 'loans', 'retirementTargets']);

/** Returns null when valid, or a short reason string for diagnostics. */
function invalidChangeReason(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'not-an-object';
  const change = value as Record<string, unknown>;
  if (typeof change.collection !== 'string' || !collections.has(change.collection)) return `bad-collection:${String(change.collection)}`;
  if (typeof change.entityId !== 'string' || change.entityId.length === 0 || change.entityId.length > 128) return `bad-entityId:${typeof change.entityId}:${String(change.entityId).slice(0, 20)}`;
  if (change.kind !== 'upsert' && change.kind !== 'delete') return `bad-kind:${String(change.kind)}`;
  if (typeof change.baseVersion !== 'number' || !Number.isSafeInteger(change.baseVersion) || change.baseVersion < 0) return `bad-baseVersion:${typeof change.baseVersion}:${String(change.baseVersion)}`;
  if (typeof change.clientUpdatedAt !== 'string' || Number.isNaN(Date.parse(change.clientUpdatedAt))) return `bad-clientUpdatedAt:${typeof change.clientUpdatedAt}:${String(change.clientUpdatedAt)}`;
  if (change.kind === 'upsert' && (!change.payload || typeof change.payload !== 'object' || Array.isArray(change.payload))) return `bad-payload:${typeof change.payload}`;
  return null;
}

function isChange(value: unknown): value is SyncChangeInput {
  return invalidChangeReason(value) === null;
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
    // Kept lightweight and permanent (not per-request-volume like an access
    // log): a rejected batch is rare and worth knowing *why* without having
    // to reproduce it — this is what surfaced the count>100 bug in prod.
    console.warn('[sync/changes] rejecting batch', {
      userId: user.id,
      count: Array.isArray(body?.changes) ? body.changes.length : typeof body?.changes,
      reasons: Array.isArray(body?.changes)
        ? body.changes.map(invalidChangeReason).filter((r): r is string => r !== null).slice(0, 5)
        : undefined,
    });
    return NextResponse.json({ error: '1~100개의 변경분이 필요합니다.' }, { status: 400 });
  }
  const results = body.changes.map((change) => appendSyncChange(user.id, change));
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
