import { NextResponse } from 'next/server';
import { authenticateUser, createSession } from '@/server/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  if (typeof body?.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력해 주세요.' }, { status: 400 });
  }
  const user = authenticateUser(body.username, body.password);
  if (!user) return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  return NextResponse.json({ user, token: createSession(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
