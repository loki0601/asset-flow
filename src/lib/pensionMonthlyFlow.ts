/**
 * Daily series of "projected monthly retirement income" — the line the
 * RetirementFlowChart paints. For each calendar date the user's pension
 * principal at that date is fed into the same buildProjection() the
 * summary cards use, so the chart literally answers "if I had stopped
 * contributing on date D, what monthly would I receive at retirement?"
 *
 * Public-pension income is a flat baseline (constant when enabled), so
 * even a fresh user with no pension contributions still gets a non-zero
 * line once a target is configured with publicEnabled=true.
 */

import type {
  Account,
  Holding,
  RetirementTarget,
  Transaction,
} from '@/lib/schema';
import {
  buildProjection,
  classifyPensionAccount,
} from '@/lib/retirementPlanning';
import {
  computePortfolioFlow,
  type FxLookup,
  type PortfolioTx,
  type SymbolMeta,
} from '@/lib/portfolioFlow';
import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

export interface PensionFlowInput {
  /** Targets to project. For "all member" mode, pass every member's
   *  target — daily series are summed across them with carry-forward. */
  targets: RetirementTarget[];
  accounts: Account[];
  holdings: Holding[];
  txs: Transaction[];
  histories: Map<string, PriceHistoryRow[]>;
  symbolMeta: Map<string, SymbolMeta>;
  fxUsdKrw: FxLookup;
}

export function computeDailyPensionMonthly(input: PensionFlowInput): PriceHistoryRow[] {
  const perMember = input.targets
    .map((target) => dailyMonthlyForMember({ target, ...input }))
    .filter((s) => s.length > 0);
  if (perMember.length === 0) return [];

  // Outer-join the per-member series and sum at each unique date with
  // carry-forward — a member that hasn't contributed on date D still
  // contributes their public-pension floor (last known projection).
  const allDates = new Set<string>();
  for (const s of perMember) for (const r of s) allDates.add(r.date);
  const sortedDates = Array.from(allDates).sort();
  const cursors = perMember.map((s) => ({ series: s, idx: -1, lastClose: 0 }));
  const out: PriceHistoryRow[] = [];
  for (const date of sortedDates) {
    let total = 0;
    for (const c of cursors) {
      while (c.idx + 1 < c.series.length && c.series[c.idx + 1].date <= date) {
        c.idx++;
        c.lastClose = c.series[c.idx].close;
      }
      total += c.lastClose;
    }
    out.push({ date, close: Math.round(total) });
  }
  return out;
}

function dailyMonthlyForMember(args: {
  target: RetirementTarget;
  accounts: Account[];
  holdings: Holding[];
  txs: Transaction[];
  histories: Map<string, PriceHistoryRow[]>;
  symbolMeta: Map<string, SymbolMeta>;
  fxUsdKrw: FxLookup;
}): PriceHistoryRow[] {
  const memberAccounts = args.accounts.filter((a) => a.memberId === args.target.memberId);
  const corpIds = new Set(
    memberAccounts.filter((a) => classifyPensionAccount(a) === 'corporate').map((a) => a.id),
  );
  const persIds = new Set(
    memberAccounts.filter((a) => classifyPensionAccount(a) === 'personal').map((a) => a.id),
  );

  const corpDaily = dailyAccountValue({
    accountIds: corpIds,
    holdings: args.holdings,
    txs: args.txs,
    histories: args.histories,
    symbolMeta: args.symbolMeta,
    fxUsdKrw: args.fxUsdKrw,
  });
  const persDaily = dailyAccountValue({
    accountIds: persIds,
    holdings: args.holdings,
    txs: args.txs,
    histories: args.histories,
    symbolMeta: args.symbolMeta,
    fxUsdKrw: args.fxUsdKrw,
  });

  // If both series are empty and there's no public-pension floor, this
  // member contributes nothing — drop them.
  const publicMonthly =
    args.target.publicEnabled !== false ? args.target.publicMonthly ?? 0 : 0;
  if (corpDaily.length === 0 && persDaily.length === 0 && publicMonthly <= 0) return [];

  const allDates = new Set<string>();
  for (const r of corpDaily) allDates.add(r.date);
  for (const r of persDaily) allDates.add(r.date);
  // When neither series has any rows but the public-pension floor is
  // active, still seed today so the line gets at least one point.
  if (allDates.size === 0 && publicMonthly > 0) {
    allDates.add(new Date().toISOString().slice(0, 10));
  }
  const sortedDates = Array.from(allDates).sort();

  const corpByDate = new Map(corpDaily.map((r) => [r.date, r.close]));
  const persByDate = new Map(persDaily.map((r) => [r.date, r.close]));
  let lastCorp = 0;
  let lastPers = 0;
  const out: PriceHistoryRow[] = [];
  for (const date of sortedDates) {
    if (corpByDate.has(date)) lastCorp = corpByDate.get(date) ?? 0;
    if (persByDate.has(date)) lastPers = persByDate.get(date) ?? 0;
    const proj = buildProjection({
      target: args.target,
      principalCorporate: lastCorp,
      principalPersonal: lastPers,
    });
    const monthly =
      (proj.public.enabled ? proj.public.monthlyNet : 0) +
      (proj.corporate.enabled ? proj.corporate.monthlyNet : 0) +
      (proj.personal.enabled ? proj.personal.monthlyNet : 0);
    out.push({ date, close: monthly });
  }
  return out;
}

function dailyAccountValue(args: {
  accountIds: Set<string>;
  holdings: Holding[];
  txs: Transaction[];
  histories: Map<string, PriceHistoryRow[]>;
  symbolMeta: Map<string, SymbolMeta>;
  fxUsdKrw: FxLookup;
}): PriceHistoryRow[] {
  if (args.accountIds.size === 0) return [];
  const holdings = args.holdings.filter((h) => args.accountIds.has(h.accountId));
  const txs = args.txs.filter((t) => args.accountIds.has(t.accountId));
  if (holdings.length === 0 && txs.length === 0) return [];
  const portfolioTxs = buildPortfolioTxs(txs, holdings, args.histories);
  if (portfolioTxs.length === 0) return [];
  return computePortfolioFlow(portfolioTxs, args.histories, {
    symbolMeta: args.symbolMeta,
    fxUsdKrw: args.fxUsdKrw,
  });
}

/**
 * Mirror of the buildTxs helper inside usePortfolioFlow — kept in sync
 * because both paths need the same "synthetic buy at first-history date"
 * rule for holdings that lack an explicit transaction trail.
 */
function buildPortfolioTxs(
  txs: Transaction[],
  holdings: Holding[],
  histories: Map<string, PriceHistoryRow[]>,
): PortfolioTx[] {
  const real: PortfolioTx[] = [];
  const seen = new Set<string>();
  for (const t of txs) {
    if (!t.symbol || !t.quantity) continue;
    if (t.type !== 'buy' && t.type !== 'sell') continue;
    real.push({
      symbol: t.symbol,
      type: t.type,
      quantity: t.quantity,
      date: t.occurredAt.slice(0, 10),
    });
    seen.add(`${t.accountId}:${t.symbol}`);
  }
  const synthetic: PortfolioTx[] = [];
  for (const h of holdings) {
    if (seen.has(`${h.accountId}:${h.symbol}`)) continue;
    const hist = histories.get(h.symbol);
    const anchor =
      hist?.[0]?.date ??
      (h.createdAt
        ? h.createdAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10));
    synthetic.push({
      symbol: h.symbol,
      type: 'buy',
      quantity: h.quantity,
      date: anchor,
    });
  }
  return [...real, ...synthetic];
}
