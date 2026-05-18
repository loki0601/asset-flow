import { NextResponse } from 'next/server';
import { SERVER_VERSION } from '@/server/catalog';

export const dynamic = 'force-static';

/** Lightweight version probe (tens of bytes vs the full /api/catalog payload).
 *  Clients call this on boot to decide whether to trigger a full sync. */
export async function GET() {
  return NextResponse.json(
    { version: SERVER_VERSION },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  );
}
