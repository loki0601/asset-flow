import { NextResponse } from 'next/server';
import { getPricePayload } from '@/server/catalog';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getPricePayload(), {
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
