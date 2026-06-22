/**
 * GET /api/icons/logo/[symbol]
 *
 * Returns the company logo for the given catalog symbol as a PNG with a
 * transparent background. The client uses the alpha channel as a CSS
 * mask-image so the logo can be re-coloured to the active theme — this
 * is what keeps the holdings list reading as one cohesive family even
 * though we're sourcing logos from a public multi-colour CDN.
 *
 *   Fetch order:
 *     1. data/logo-cache/{slug}.png   (≤ 30d)         — disk cache hit
 *     2. logo.clearbit.com/{domain}    → write to cache, serve
 *
 *   404 cache:
 *     A missing-domain or upstream-404 result is recorded as a sentinel
 *     file `.404` in the same dir so we don't re-hit Clearbit for a
 *     known dead symbol on every render. TTL: 24h.
 */

import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { catalogEntryFor } from '@/server/brandIcons';
import { tickerDomain } from '@/server/tickerDomain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_DIR = path.join(process.cwd(), 'data', 'logo-cache');
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MISS_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

const CLIENT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=2592000, immutable', // 30d
};
const NOT_FOUND_HEADERS = {
  'Cache-Control': 'public, max-age=86400', // 1d — re-check after a day
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const { symbol: encoded } = await context.params;
  const symbol = decodeURIComponent(encoded);

  const safeKey = safeFilename(symbol);
  const pngPath = path.join(CACHE_DIR, `${safeKey}.png`);
  const missPath = path.join(CACHE_DIR, `${safeKey}.404`);

  // Negative cache — if we asked recently and got nothing, don't re-ask.
  const missAge = await ageOf(missPath);
  if (missAge !== null && missAge < MISS_TTL_MS) {
    return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
  }

  // Positive cache — fresh disk hit.
  const hitAge = await ageOf(pngPath);
  if (hitAge !== null && hitAge < HIT_TTL_MS) {
    const buf = await fs.readFile(pngPath);
    const ct = await fs.readFile(`${pngPath}.type`, 'utf-8').catch(() => 'image/png');
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { 'Content-Type': ct, ...CLIENT_CACHE_HEADERS },
    });
  }

  // Cache miss → resolve the symbol's domain and try Clearbit.
  const entry = catalogEntryFor(symbol);
  if (!entry) return await record404(missPath, NOT_FOUND_HEADERS);
  const domain = tickerDomain(entry);
  if (!domain) return await record404(missPath, NOT_FOUND_HEADERS);

  // Multi-source fetch — icon.horse covers most domains with decent
  // resolution; Google's favicon service is the universal fallback.
  // We pick the first one that returns a non-trivial body. (Clearbit
  // was the original choice but their public endpoint was retired in
  // 2025 along with the HubSpot acquisition.)
  const sources = [
    `https://icon.horse/icon/${encodeURIComponent(domain)}`,
    `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}`,
  ];

  let body: { buf: Buffer; contentType: string } | null = null;
  for (const upstream of sources) {
    try {
      const res = await fetch(upstream, {
        redirect: 'follow',
        headers: { Accept: 'image/*' },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 64) continue;
      body = { buf, contentType: res.headers.get('content-type') ?? 'image/png' };
      break;
    } catch {
      continue;
    }
  }
  if (!body) return await record404(missPath, NOT_FOUND_HEADERS);

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(pngPath, body.buf);
  // Stash the upstream content-type beside the cached payload so we can
  // serve it back on subsequent disk hits.
  await fs.writeFile(`${pngPath}.type`, body.contentType);
  // Clear the negative-cache sentinel if it was set.
  await fs.rm(missPath, { force: true });

  return new NextResponse(new Uint8Array(body.buf), {
    status: 200,
    headers: { 'Content-Type': body.contentType, ...CLIENT_CACHE_HEADERS },
  });
}

async function ageOf(p: string): Promise<number | null> {
  try {
    const st = await fs.stat(p);
    return Date.now() - st.mtimeMs;
  } catch {
    return null;
  }
}

async function record404(missPath: string, headers: HeadersInit): Promise<NextResponse> {
  try {
    await fs.mkdir(path.dirname(missPath), { recursive: true });
    await fs.writeFile(missPath, '');
  } catch {
    /* ignore — best-effort caching */
  }
  return new NextResponse(null, { status: 404, headers });
}

function safeFilename(symbol: string): string {
  // Replace path separators / colons so the symbol becomes a safe file
  // name. Encoding keeps decoding round-trippable if ever needed.
  return symbol.replace(/[^A-Za-z0-9._-]/g, '_');
}
