import { NextResponse } from 'next/server';
import { getServerDb } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BACKUPS_PER_USER = 10;
const MAX_BLOB_BYTES = 50 * 1024 * 1024; // 50 MB ceiling — sql.js blob is

/**
 * Server-side backup of the client's sql.js DB blob.
 *
 * POST: client sends the raw blob bytes (application/octet-stream) plus
 * x-user-id (required) and optional x-username headers. The blob is stored
 * verbatim in server.db.user_backups along with a creation timestamp.
 * Latest MAX_BACKUPS_PER_USER kept per user; older ones are pruned in the
 * same transaction to keep storage bounded.
 *
 * GET: lists this user's backups (metadata only — id, created_at, size).
 * Restore is a future feature; for now this is a unidirectional safety net
 * for the IndexedDB blob.
 */
export async function POST(request: Request) {
  const userId = request.headers.get('x-user-id');
  const username = request.headers.get('x-username') || null;
  if (!userId) {
    return NextResponse.json({ error: 'x-user-id required' }, { status: 400 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: 'empty body' }, { status: 400 });
  }
  if (buf.length > MAX_BLOB_BYTES) {
    return NextResponse.json(
      { error: `blob too large (${buf.length} > ${MAX_BLOB_BYTES})` },
      { status: 413 },
    );
  }

  const db = getServerDb();
  const createdAt = new Date().toISOString();
  const insert = db.prepare(
    'INSERT INTO user_backups (user_id, username, created_at, blob_size, blob) VALUES (?, ?, ?, ?, ?)',
  );
  const prune = db.prepare(
    `DELETE FROM user_backups
     WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM user_backups
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       )`,
  );

  const txn = db.transaction(() => {
    const result = insert.run(userId, username, createdAt, buf.length, buf);
    prune.run(userId, userId, MAX_BACKUPS_PER_USER);
    return result.lastInsertRowid as number | bigint;
  });
  const id = txn();

  return NextResponse.json(
    {
      id: Number(id),
      userId,
      username,
      createdAt,
      blobSize: buf.length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') ?? request.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const db = getServerDb();
  const rows = db
    .prepare(
      'SELECT id, username, created_at, blob_size FROM user_backups WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    )
    .all(userId) as Array<{ id: number; username: string | null; created_at: string; blob_size: number }>;
  return NextResponse.json(
    {
      userId,
      backups: rows.map((r) => ({
        id: r.id,
        username: r.username,
        createdAt: r.created_at,
        blobSize: r.blob_size,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
