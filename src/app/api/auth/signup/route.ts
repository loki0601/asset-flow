import { NextResponse } from 'next/server';
import { createServerUser, createSession } from '@/server/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  if (typeof body?.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력해 주세요.' }, { status: 400 });
  }
  if (body.username.trim().length < 2) {
    return NextResponse.json({ error: '아이디는 2자 이상이어야 합니다.' }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다.' }, { status: 400 });
  }
  try {
    const user = createServerUser(body.username, body.password);
    return NextResponse.json({ user, token: createSession(user.id) }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '계정을 만들지 못했습니다.' },
      { status: 409 },
    );
  }
}
