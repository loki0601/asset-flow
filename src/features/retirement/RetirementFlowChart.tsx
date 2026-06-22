'use client';

import { useEffect, useState } from 'react';
import { InteractivePriceChart } from '@/components/InteractivePriceChart';
import { useCurrentUserId, useMarketDataKey } from '@/components/AuthProvider';
import {
  accountsRepo,
  holdingsRepo,
  retirementTargetsRepo,
  transactionsRepo,
} from '@/lib/repos';
import { priceHistoryRepo, type PriceHistoryRow } from '@/lib/priceHistoryRepo';
import { fxHistoryRepo } from '@/lib/fxHistoryRepo';
import { getFxRate } from '@/lib/fx';
import { getMarketAsset } from '@/lib/market';
import { computeDailyPensionMonthly } from '@/lib/pensionMonthlyFlow';
import { formatKRW } from '@/lib/loans';
import type { FxLookup, SymbolMeta } from '@/lib/portfolioFlow';

/**
 * Historical curve of the user's projected monthly retirement income.
 * For each calendar date the corp + personal principal at that date is
 * fed through buildProjection() — so the chart literally says "if I had
 * stopped contributing here, my monthly would have been this much."
 * Same InteractivePriceChart + D/W/Y selector as the dashboard's
 * 자산 흐름 chart.
 */
export function RetirementFlowChart({
  selected = 'all',
}: {
  selected?: string | 'all';
}) {
  const userId = useCurrentUserId();
  const marketKey = useMarketDataKey();
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      return;
    }
    const allTargets = retirementTargetsRepo.list(userId);
    const targets = allTargets.filter(
      (t) => selected === 'all' || t.memberId === selected,
    );
    if (targets.length === 0) {
      setRows([]);
      return;
    }
    const accounts = accountsRepo.list(userId);
    const holdings = holdingsRepo.list(userId);
    const txs = transactionsRepo.list(userId);

    // Gather the symbols touched by pension accounts so the histories
    // map only carries what the chart actually needs.
    const targetMemberIds = new Set(targets.map((t) => t.memberId));
    const memberAccountIds = new Set(
      accounts.filter((a) => targetMemberIds.has(a.memberId)).map((a) => a.id),
    );
    const symbols = new Set<string>();
    for (const h of holdings) if (memberAccountIds.has(h.accountId)) symbols.add(h.symbol);
    for (const t of txs) {
      if (t.symbol && memberAccountIds.has(t.accountId)) symbols.add(t.symbol);
    }

    const histories = new Map<string, PriceHistoryRow[]>();
    for (const s of symbols) {
      const hist = priceHistoryRepo.listSince(s, '2016-01-01');
      if (hist.length > 0) histories.set(s, hist);
    }
    const fxUsdKrw: FxLookup = {
      rates: fxHistoryRepo.listAll('USDKRW'),
      fallback: getFxRate('USDKRW'),
    };
    const symbolMeta = new Map<string, SymbolMeta>();
    for (const s of symbols) {
      const asset = getMarketAsset(s);
      symbolMeta.set(s, { currency: asset?.currency === 'USD' ? 'USD' : 'KRW' });
    }

    setRows(
      computeDailyPensionMonthly({
        targets,
        accounts,
        holdings,
        txs,
        histories,
        symbolMeta,
        fxUsdKrw,
      }),
    );
  }, [userId, marketKey, selected]);

  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-brand-line shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-brand-ink shrink-0">예상 월 수령액 흐름</p>
      </div>
      {rows.length < 2 ? (
        <p className="text-[11px] text-brand-sage font-bold py-12 text-center">
          연금 데이터가 누적되면 흐름이 표시됩니다
        </p>
      ) : (
        <InteractivePriceChart
          rows={rows}
          formatY={(v) => `₩${formatKRW(v)}`}
        />
      )}
    </div>
  );
}
