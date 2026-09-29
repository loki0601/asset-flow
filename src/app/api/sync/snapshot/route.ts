import { NextResponse } from 'next/server';
import { userSnapshotRepo } from '@/server/db';
import { getRequestUser } from '@/server/requestAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

export async function GET(request: Request) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const snapshot = userSnapshotRepo.get(user.id);
  if (!snapshot) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(new Blob([snapshot.blob as unknown as BlobPart]), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-AssetFlow-Revision': String(snapshot.revision),
      'X-AssetFlow-Updated-At': snapshot.updatedAt,
    },
  });
}

export async function PUT(request: Request) {
  const user = getRequestUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const blob = Buffer.from(await request.arrayBuffer());
  if (blob.length === 0) return NextResponse.json({ error: '빈 동기화 데이터입니다.' }, { status: 400 });
  if (blob.length > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ error: '동기화 데이터가 50MB 제한을 초과했습니다.' }, { status: 413 });
  }
  const snapshot = userSnapshotRepo.put(user.id, blob);
  return NextResponse.json(
    { revision: snapshot.revision, updatedAt: snapshot.updatedAt },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
