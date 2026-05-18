import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/**
 * Live-quote endpoint. Spawns scripts/fetch-live.py and returns its JSON
 * output verbatim. Server reuses the cron's Python deps (.venv) and the
 * upstream sources (yfinance for US, Naver for KRX, CoinGecko for crypto)
 * — kept out of the Node bundle so the WebView client stays slim.
 *
 * Symbols are filtered server-side: anything whose market is currently
 * closed is reported as `skipped: market-closed` without an upstream call,
 * so we don't hammer rate-limited providers off-hours.
 *
 * Caching: brief in-memory cache (60s) keyed by the sorted symbol list,
 * to absorb dashboard double-taps and multi-device sync without doubling
 * upstream load.
 */

interface LiveResponse {
  asOf: string;
  prices: Record<string, { price: number; change: number; changePct: number; date: string }>;
  skipped: { symbol: string; reason: string }[];
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; payload: LiveResponse }>();

const PROJECT_ROOT = path.resolve(process.cwd());
const SCRIPT = path.join(PROJECT_ROOT, 'scripts/fetch-live.py');
const PYTHON = path.join(PROJECT_ROOT, '.venv/bin/python');

function runScript(symbols: string[]): Promise<LiveResponse> {
  return new Promise((resolve, reject) => {
    const args = ['--symbols', symbols.join(',')];
    const child = spawn(PYTHON, [SCRIPT, ...args], { cwd: PROJECT_ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`fetch-live.py exit ${code}: ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout) as LiveResponse);
      } catch (e) {
        reject(new Error(`bad json from fetch-live.py: ${e}\nstdout: ${stdout}`));
      }
    });
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('symbols') ?? '';
  const symbols = Array.from(new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)))
    .sort();

  if (symbols.length === 0) {
    return NextResponse.json(
      { asOf: new Date().toISOString(), prices: {}, skipped: [] } as LiveResponse,
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const key = symbols.join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.payload, {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'HIT' },
    });
  }

  try {
    const payload = await runScript(symbols);
    cache.set(key, { at: Date.now(), payload });
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
