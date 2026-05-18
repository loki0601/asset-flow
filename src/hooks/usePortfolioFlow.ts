'use client';

import { useEffect, useState } from 'react';
import { accountsRepo, holdingsRepo, transactionsRepo } from '@/lib/repos';
import { priceHistoryRepo, type PriceHistoryRow } from '@/lib/priceHistoryRepo';
import { fxHistoryRepo, type FxHistoryRow } from '@/lib/fxHistoryRepo';
import {
  computePortfolioFlow,
  type FxLookup,
  type PortfolioTx,
  type SymbolMeta,
} from '@/lib/portfolioFlow';
import { getMarketAsset } from '@/lib/market';
import { getFxRate } from '@/lib/fx';
import { useCurrentUserId, useMarketDataKey } from '@/components/AuthProvider';
import type { Holding, Transaction } from '@/lib/schema';

/**
 * Daily total-portfolio value rows for the dashboard flow chart.
 *
 *   - With real transactions: chart starts at the first tx date and reacts
 *     to subsequent buys/sells.
 *   - With holdings but no transactions (legacy/seed data): treats the
 *     position as if always held — anchors the synthetic buy at the
 *     earliest known close so the curve shows the full backcast for the
 *     current basket. Without this, h.createdAt's "today" timestamp would
 *     collapse the chart to a single point.
 *   - Missing local history triggers an automatic GET /api/prices/history
 *     fetch, and the chart re-renders once rows arrive.
 */
function buildTxs(
  allTxs: Transaction[],
  allHoldings: Holding[],
  histories: Map<string, PriceHistoryRow[]>,
): PortfolioTx[] {
  const realTxs: PortfolioTx[] = [];
  const seenAccountSymbol = new Set<string>();
  for (const t of allTxs) {
    if (!t.symbol || !t.quantity) continue;
    if (t.type !== 'buy' && t.type !== 'sell') continue;
    realTxs.push({
      symbol: t.symbol,
      type: t.type,
      quantity: t.quantity,
      date: t.occurredAt.slice(0, 10),
    });
    seenAccountSymbol.add(`${t.accountId}:${t.symbol}`);
  }

  const syntheticTxs: PortfolioTx[] = [];
  for (const h of allHoldings) {
    const key = `${h.accountId}:${h.symbol}`;
    if (seenAccountSymbol.has(key)) continue;
    const hist = histories.get(h.symbol);
    const anchor =
      hist?.[0]?.date ??
      (h.createdAt
        ? h.createdAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10));
    syntheticTxs.push({
      symbol: h.symbol,
      type: 'buy',
      quantity: h.quantity,
      date: anchor,
    });
  }
  return [...realTxs, ...syntheticTxs];
}

export function usePortfolioFlow(
  memberId: string | 'all' = 'all',
  accountId: string | 'all' = 'all',
): PriceHistoryRow[] {
  const userId = useCurrentUserId();
  const marketKey = useMarketDataKey();
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const accountsList = accountsRepo.list(userId);
    const memberAccountIds =
      memberId === 'all'
        ? null
        : new Set(accountsList.filter((a) => a.memberId === memberId).map((a) => a.id));
    function passes(itemAccountId: string): boolean {
      if (memberAccountIds !== null && !memberAccountIds.has(itemAccountId)) return false;
      if (accountId !== 'all' && itemAccountId !== accountId) return false;
      return true;
    }

    const allTxs = transactionsRepo.list(userId).filter((t) => passes(t.accountId));
    const allHoldings = holdingsRepo.list(userId).filter((h) => passes(h.accountId));
    if (allHoldings.length === 0 && allTxs.length === 0) {
      setRows([]);
      return;
    }

    const symbols = new Set<string>();
    for (const t of allTxs) {
      if (t.symbol && (t.type === 'buy' || t.type === 'sell')) symbols.add(t.symbol);
    }
    for (const h of allHoldings) symbols.add(h.symbol);

    function loadLocal(): Map<string, PriceHistoryRow[]> {
      const m = new Map<string, PriceHistoryRow[]>();
      for (const s of symbols) {
        const hist = priceHistoryRepo.listSince(s, '2016-01-01');
        if (hist.length > 0) m.set(s, hist);
      }
      return m;
    }

    function loadFxLookup(): FxLookup {
      return {
        rates: fxHistoryRepo.listAll('USDKRW'),
        fallback: getFxRate('USDKRW'),
      };
    }

    function buildSymbolMeta(): Map<string, SymbolMeta> {
      const m = new Map<string, SymbolMeta>();
      for (const s of symbols) {
        const asset = getMarketAsset(s);
        m.set(s, { currency: asset?.currency === 'USD' ? 'USD' : 'KRW' });
      }
      return m;
    }

    function recompute(histories: Map<string, PriceHistoryRow[]>): void {
      const txs = buildTxs(allTxs, allHoldings, histories);
      if (txs.length === 0) {
        setRows([]);
        return;
      }
      setRows(
        computePortfolioFlow(txs, histories, {
          symbolMeta: buildSymbolMeta(),
          fxUsdKrw: loadFxLookup(),
        }),
      );
    }

    // Initial render with whatever's already cached.
    const initial = loadLocal();
    recompute(initial);

    // Background-fetch any symbol missing local history. Each call is
    // cheap (server SELECT) and idempotent.
    const missing = [...symbols].filter((s) => !initial.has(s));
    if (missing.length === 0) return;

    void Promise.all(
      missing.map(async (symbol) => {
        try {
          const res = await fetch(
            `/api/prices/history?symbol=${encodeURIComponent(symbol)}&from=2016-01-01`,
          );
          if (!res.ok) return null;
          const data = (await res.json()) as {
            status: string;
            rows: PriceHistoryRow[];
          };
          if (data.status === 'ready' && Array.isArray(data.rows) && data.rows.length > 0) {
            priceHistoryRepo.append(symbol, data.rows);
            return symbol;
          }
        } catch {
          /* best-effort */
        }
        return null;
      }),
    ).then((results) => {
      if (cancelled) return;
      if (results.every((r) => r === null)) return;
      recompute(loadLocal());
    });

    // FX history sync — pull from server if local is empty or thin.
    void (async () => {
      const localCount = fxHistoryRepo.listAll('USDKRW').length;
      if (localCount > 100) return; // already populated enough
      try {
        const res = await fetch('/api/fx/history?pair=USDKRW&from=2020-01-01');
        if (!res.ok) return;
        const data = (await res.json()) as { rows: FxHistoryRow[] };
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          fxHistoryRepo.append('USDKRW', data.rows);
          if (!cancelled) recompute(loadLocal());
        }
      } catch {
        /* swallow */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, marketKey, memberId, accountId]);

  return rows;
}
