'use client';

import { useEffect, useState } from 'react';
import { accountsRepo, holdingsRepo, transactionsRepo } from '@/lib/repos';
import { priceHistoryRepo, type PriceHistoryRow } from '@/lib/priceHistoryRepo';
import { fxHistoryRepo } from '@/lib/fxHistoryRepo';
import {
  computePortfolioFlow,
  type FxLookup,
  type PortfolioTx,
  type SymbolMeta,
} from '@/lib/portfolioFlow';
import { applyCumulativeProfit, type CashflowEvent } from '@/lib/cumulativeProfit';
import { getMarketAsset } from '@/lib/market';
import { getFxRate, syncFxHistory } from '@/lib/fx';
import { liveHoldingsValue } from '@/lib/holdingsValue';
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

/**
 * KRW cashflows for the 누적수익 (cumulative P&L) series — one signed event per
 * buy/sell (and per synthetic buy for holdings without a tx trail). USD amounts
 * are converted at the CURRENT FX (not the transaction-date FX), so the curve
 * EXCLUDES currency gains/losses and reflects only stock performance — matching
 * the dashboard header's 평가손익 basis (per product decision).
 */
function buildCashflows(
  allTxs: Transaction[],
  allHoldings: Holding[],
  histories: Map<string, PriceHistoryRow[]>,
  fxNow: number,
): CashflowEvent[] {
  const events: CashflowEvent[] = [];
  const seen = new Set<string>();
  for (const t of allTxs) {
    if (!t.symbol || !t.quantity) continue;
    if (t.type !== 'buy' && t.type !== 'sell') continue;
    const date = t.occurredAt.slice(0, 10);
    const usd = getMarketAsset(t.symbol)?.currency === 'USD';
    const native = t.amount || (t.price ?? 0) * t.quantity;
    const krw = native * (usd ? fxNow : 1);
    events.push({ date, krw: t.type === 'buy' ? krw : -krw });
    seen.add(`${t.accountId}:${t.symbol}`);
  }
  for (const h of allHoldings) {
    if (seen.has(`${h.accountId}:${h.symbol}`)) continue;
    const date =
      histories.get(h.symbol)?.[0]?.date ??
      (h.createdAt ? h.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    const usd = getMarketAsset(h.symbol)?.currency === 'USD';
    events.push({ date, krw: h.quantity * h.avgPrice * (usd ? fxNow : 1) });
  }
  return events;
}

/** Replace the most-recent point's value in place (keeping its date), used to
 *  pin today's point to the live header valuation. No-op on an empty series. */
function anchorLastClose(rows: PriceHistoryRow[], value: number): void {
  if (rows.length === 0) return;
  rows[rows.length - 1] = { ...rows[rows.length - 1], close: Math.round(value) };
}

export interface PortfolioFlowSeries {
  /** Σ qty×close — market-value curve. */
  assets: PriceHistoryRow[];
  /** marketValue − netInvested — cumulative total P&L (realised + unrealised);
   *  retains realised gains so rotating positions doesn't drop the curve. */
  cumulative: PriceHistoryRow[];
}

export function usePortfolioFlow(
  memberId: string | 'all' = 'all',
  accountId: string | 'all' = 'all',
): PortfolioFlowSeries {
  const userId = useCurrentUserId();
  const marketKey = useMarketDataKey();
  const [series, setSeries] = useState<PortfolioFlowSeries>({ assets: [], cumulative: [] });

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
      setSeries({ assets: [], cumulative: [] });
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
        setSeries({ assets: [], cumulative: [] });
        return;
      }
      const symbolMeta = buildSymbolMeta();
      const fxUsdKrw = loadFxLookup();
      const fxNow = getFxRate('USDKRW');
      const live = liveHoldingsValue(allHoldings, getMarketAsset, fxNow);

      // 총자산: market value at the FX that was actually in effect on each
      // historical date (real historical KRW value). Endpoint anchored to the
      // live header total.
      const assets = computePortfolioFlow(txs, histories, { symbolMeta, fxUsdKrw });
      anchorLastClose(assets, live.assets);

      // 누적수익 = marketValue − netInvested, FX-excluded: value USD at the
      // CURRENT rate on every date (empty rates → the fx cursor stays on
      // fallback=fxNow) and cost at the current rate too, so currency moves
      // don't shift the curve — only stock P&L does. Endpoint = live.assets −
      // total net invested ⇒ matches the header 평가손익 when there are no sells.
      const mvNow = computePortfolioFlow(txs, histories, {
        symbolMeta,
        fxUsdKrw: { rates: [], fallback: fxNow },
      });
      anchorLastClose(mvNow, live.assets);
      const cashflows = buildCashflows(allTxs, allHoldings, histories, fxNow);
      const cumulative = applyCumulativeProfit(mvNow, cashflows);
      setSeries({ assets, cumulative });
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

    // FX history sync — always backfill from localMax+1 so the daily rate
    // keeps flowing in. (Earlier shortcut bailed once localCount > 100 and
    // left the settings rate card stuck on stale values.)
    void (async () => {
      const before = fxHistoryRepo.getMaxDate('USDKRW');
      await syncFxHistory(fetch, 'USDKRW');
      const after = fxHistoryRepo.getMaxDate('USDKRW');
      if (!cancelled && after !== before) recompute(loadLocal());
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, marketKey, memberId, accountId]);

  return series;
}
