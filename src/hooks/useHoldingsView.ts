'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AssetCategory, Account, Holding, MarketAsset } from '@/lib/schema';
import { accountsRepo, holdingsRepo } from '@/lib/repos';
import { getMarketAsset, listMarketAssets } from '@/lib/market';
import { getFxRate } from '@/lib/fx';
import { useCurrentUserId, useMarketDataKey } from '@/components/AuthProvider';

export interface HoldingView {
  holding: Holding;
  asset: MarketAsset;
  totalValue: number;
  /** Previous-day delta (price source's "Changes" column). */
  dailyChange: number;
  /** Previous-day delta % (price source's "ChangeRate" column). */
  dailyChangePct: number;
  /** Cost basis = quantity × avgPrice — what the user paid in total. */
  costBasis: number;
  /** Total gain since purchase = totalValue − costBasis. Used by dashboard. */
  gain: number;
  /** gain / costBasis × 100. 0 when costBasis is 0. */
  gainPct: number;
  category: AssetCategory;
}

/**
 * Joins user holdings (per-account positions) with current market data.
 * For display use: dashboard list, portfolio donut, holding detail modal.
 */
export function useHoldingsView(
  memberId: string | 'all' = 'all',
  accountId: string | 'all' = 'all',
) {
  const userId = useCurrentUserId();
  const marketKey = useMarketDataKey();
  // Initialize from the repos synchronously — sql.js is in-memory after
  // AuthProvider boot, so there's no need to flash an empty list while a
  // useEffect populates it on the next tick. `loaded` stays false until
  // userId is known, so EmptyState callers can suppress the "보유 종목
  // 없습니다" placeholder during the auth bootstrap.
  const [holdings, setHoldings] = useState<Holding[]>(() =>
    userId ? holdingsRepo.list(userId) : [],
  );
  const [accounts, setAccounts] = useState<Account[]>(() =>
    userId ? accountsRepo.list(userId) : [],
  );
  const [loaded, setLoaded] = useState<boolean>(() => Boolean(userId));
  const [, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userId) return;
    setHoldings(holdingsRepo.list(userId));
    setAccounts(accountsRepo.list(userId));
    setLoaded(true);
  }, [userId]);

  const refresh = useCallback(() => {
    if (!userId) return;
    setHoldings(holdingsRepo.list(userId));
    setAccounts(accountsRepo.list(userId));
    setRefreshKey((k) => k + 1);
  }, [userId]);

  // Filter by family member via the holding's account.memberId, then narrow
  // further by accountId when the user picks a specific account.
  const filteredHoldings = useMemo(() => {
    let result = holdings;
    if (memberId !== 'all') {
      const memberAccountIds = new Set(
        accounts.filter((a) => a.memberId === memberId).map((a) => a.id),
      );
      result = result.filter((h) => memberAccountIds.has(h.accountId));
    }
    if (accountId !== 'all') {
      result = result.filter((h) => h.accountId === accountId);
    }
    return result;
  }, [holdings, accounts, memberId, accountId]);

  const views: HoldingView[] = useMemo(() => {
    return filteredHoldings
      .map((h): HoldingView | null => {
        const asset = getMarketAsset(h.symbol);
        if (!asset) return null;
        // USD-denominated assets (US stocks/ETFs) are stored in their native
        // currency but displayed in KRW. Apply the latest FX rate to every
        // price-shaped number so totalValue / costBasis / gain are
        // comparable across categories.
        const fxMultiplier = asset.currency === 'USD' ? getFxRate('USDKRW') : 1;
        const effectiveNativePrice = asset.currentPrice || h.avgPrice;
        const effectivePrice = effectiveNativePrice * fxMultiplier;
        const totalValue = h.quantity * effectivePrice;
        const costBasis = h.quantity * h.avgPrice * fxMultiplier;
        const gain = totalValue - costBasis;
        const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
        return {
          holding: h,
          asset,
          totalValue,
          dailyChange: h.quantity * asset.dailyChange * fxMultiplier,
          dailyChangePct: asset.dailyChangePct,
          costBasis,
          gain,
          gainPct,
          category: asset.category,
        };
      })
      .filter((v): v is HoldingView => v !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredHoldings, marketKey]);

  const totalValue = useMemo(() => views.reduce((s, v) => s + v.totalValue, 0), [views]);
  const dailyChange = useMemo(() => views.reduce((s, v) => s + v.dailyChange, 0), [views]);
  const dailyChangePct = totalValue > 0 ? (dailyChange / (totalValue - dailyChange)) * 100 : 0;
  const totalCostBasis = useMemo(() => views.reduce((s, v) => s + v.costBasis, 0), [views]);
  const totalGain = totalValue - totalCostBasis;
  const totalGainPct = totalCostBasis > 0 ? (totalGain / totalCostBasis) * 100 : 0;

  const distribution = useMemo(() => {
    if (totalValue <= 0) return [];
    const byCategory: Record<string, number> = {};
    for (const v of views) {
      byCategory[v.category] = (byCategory[v.category] ?? 0) + v.totalValue;
    }
    return Object.entries(byCategory)
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({
        category: category as AssetCategory,
        ratio: (value / totalValue) * 100,
      }));
  }, [views, totalValue]);

  // Touch market list once to ensure module loaded (useful for tests)
  useEffect(() => {
    listMarketAssets();
  }, []);

  return {
    views,
    totalValue,
    dailyChange,
    dailyChangePct,
    totalGain,
    totalGainPct,
    distribution,
    refresh,
    loaded,
  };
}
