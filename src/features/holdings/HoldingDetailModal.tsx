'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from 'lucide-react';
import type { HoldingView } from '@/hooks/useHoldingsView';
import { formatKRW } from '@/lib/loans';
import { profitLossAmount, profitLossPercent } from '@/lib/holdings';
import { InteractivePriceChart } from '@/components/InteractivePriceChart';
import { priceHistoryRepo, type PriceHistoryRow } from '@/lib/priceHistoryRepo';
import { useCurrentUserId, usePriceSync } from '@/components/AuthProvider';
import { accountsRepo, familyRepo } from '@/lib/repos';
import { accountOwnerLabel } from '@/lib/accountLabel';
import { categoryColor } from '@/lib/categoryColors';
import { useTheme } from '@/hooks/useTheme';
import { Modal } from '@/components/Modal';
import { ModalHeader } from '@/components/ModalHeader';
import { AssetCategoryIcon } from '@/components/AssetCategoryIcon';
import { TradeForm, type TradeSide } from '@/features/trade/TradeForm';
import { assetDisplayName } from '@/lib/assetDisplay';
import type { Account, FamilyMember } from '@/lib/schema';

interface Props {
  open: boolean;
  onClose: () => void;
  view: HoldingView;
  /** Member filter active on the parent screen. Forwarded to TradeForm
   *  so the account dropdown only offers that member's accounts when
   *  the user opened the holding from a filtered view. */
  memberId?: string | 'all';
}

export function HoldingDetailModal({ open, onClose, view, memberId = 'all' }: Props) {
  const [tradeSide, setTradeSide] = useState<TradeSide | null>(null);

  useEffect(() => {
    if (open) setTradeSide(null);
  }, [open]);

  function handleClose() {
    setTradeSide(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose}>
      {tradeSide ? (
        <TradeForm
          asset={{
            symbol: view.holding.symbol,
            name: assetDisplayName(view.asset),
            category: view.category,
            currentPrice: view.asset.currentPrice,
            currency: view.asset.currency,
          }}
          side={tradeSide}
          onBack={() => setTradeSide(null)}
          onClose={handleClose}
          memberId={memberId}
        />
      ) : (
        <DetailView view={view} onClose={handleClose} onTrade={setTradeSide} />
      )}
    </Modal>
  );
}

function DetailView({
  view,
  onClose,
  onTrade,
}: {
  view: HoldingView;
  onClose: () => void;
  onTrade: (side: TradeSide) => void;
}) {
  const { holding, asset, totalValue, dailyChangePct } = view;
  const userId = useCurrentUserId();
  const { theme } = useTheme();

  // Owner/account context for this position. Aggregated rows (모아보기)
  // carry per-account constituents; single rows resolve their one account.
  const accountsById = useMemo(() => {
    if (!userId) return new Map<string, Account>();
    return new Map(accountsRepo.list(userId).map((a) => [a.id, a] as const));
  }, [userId]);
  const membersById = useMemo(() => {
    if (!userId) return new Map<string, FamilyMember>();
    return new Map(familyRepo.list(userId).map((m) => [m.id, m] as const));
  }, [userId]);
  const labelFor = (accountId: string) => {
    const acc = accountsById.get(accountId);
    return accountOwnerLabel(acc, acc ? membersById.get(acc.memberId) : undefined);
  };
  const constituents = view.constituents ?? null;
  const color = categoryColor(view.category, theme);
  // Daily-change pill mirrors the SYMBOL itself, not the user's
  // position: show the asset's per-share change (전일 대비 가격 변동)
  // not `qty × change`.  The qty-scaled daily P/L still lives in the
  // detail rows below (평가 손익).
  const dailyChange = asset.dailyChange;
  const isUp = dailyChange >= 0;
  // Detail view shows USD assets in their native currency (per product
  // spec — only the dashboard/portfolio cards convert to KRW so people
  // can compare across categories at a glance). The HoldingView's
  // totalValue/dailyChange/gain are pre-converted to KRW, so we recompute
  // USD numbers locally from the raw catalog values.
  const isUsd = asset.currency === 'USD';
  const effectiveNativePrice = asset.currentPrice || holding.avgPrice;
  const displayCurrentPrice = effectiveNativePrice;
  const displayAvgPrice = holding.avgPrice;
  const displayDailyChange = asset.dailyChange;
  const displayTotalValue = effectiveNativePrice * holding.quantity;
  const profit = profitLossAmount(displayCurrentPrice, displayAvgPrice, holding.quantity);
  const profitPct = profitLossPercent(effectiveNativePrice, holding.avgPrice);
  const profitUp = profit >= 0;
  const qtyLabel = formatQty(holding.quantity, view.category);

  function fmt(value: number): string {
    if (isUsd) {
      return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        value,
      )}`;
    }
    return formatKRW(value);
  }

  // Read history from the local SQL repo. Re-runs after every price sync so
  // newly-fetched rows show up without a full app reload.
  const { pricesLastSyncAt } = usePriceSync();
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  useEffect(() => {
    // Detail view keeps the asset's native currency (USD or KRW) so the
    // chart's y-axis and marker tooltip use the same units as the price
    // header above. No FX multiplication.
    setRows(priceHistoryRepo.listSince(view.holding.symbol, '2016-01-01'));
  }, [view.holding.symbol, pricesLastSyncAt]);

  return (
    <>
      <ModalHeader
        icon={<AssetCategoryIcon asset={asset} color={color} size={40} />}
        eyebrow={view.category}
        title={assetDisplayName(asset)}
        subtitle={constituents ? `${constituents.length}개 계좌 통합` : labelFor(holding.accountId)}
        onClose={onClose}
      />

      <div className="px-6 py-4">
        <p className="text-3xl font-black text-brand-ink tracking-tight">
          {fmt(displayCurrentPrice)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black ${
              isUp ? 'bg-brand-up/10 text-brand-up' : 'bg-brand-down/10 text-brand-down'
            }`}
          >
            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {isUp ? '+' : ''}
            {dailyChangePct.toFixed(1)}%
          </span>
          <span className={`text-xs font-bold ${isUp ? 'text-brand-up' : 'text-brand-down'}`}>
            {isUp ? '+' : ''}{fmt(displayDailyChange)}
          </span>
          <span className="text-[11px] font-medium text-gray-400">전일 대비</span>
        </div>
      </div>

      <div className="px-4 pb-2">
        <InteractivePriceChart
          rows={rows}
          formatY={(v) =>
            isUsd
              ? `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`
              : Math.round(v).toLocaleString('ko-KR')
          }
        />
      </div>

      <div className="px-6 py-4 border-t border-gray-100 grid grid-cols-2 gap-y-3 bg-[#FBFBF9]">
        <Stat label="보유 수량" value={qtyLabel} />
        <Stat label="평균 단가" value={fmt(displayAvgPrice)} align="right" />
        <Stat label="평가 금액" value={fmt(displayTotalValue)} />
        <Stat
          label="평가 손익"
          value={`${profitUp ? '+' : ''}${fmt(profit)}`}
          tone={profitUp ? 'up' : 'down'}
          align="right"
        />
        <div className="col-span-2 flex justify-between items-center pt-2 mt-1 border-t border-gray-100/60">
          <span className="text-xs font-bold text-gray-400">수익률</span>
          <span className={`text-base font-black ${profitUp ? 'text-brand-up' : 'text-brand-down'}`}>
            {profitUp ? '+' : ''}
            {profitPct.toFixed(2)}%
          </span>
        </div>
      </div>

      {constituents && (
        // Aggregated (모아보기) row: read-only per-account breakdown — a
        // simple divided list, no per-row actions. Buy/sell always go
        // through the common CTA below, where 소유주/계좌 are picked
        // explicitly on the trade form (no more silent first-account default).
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-[10px] font-black text-brand-sage uppercase tracking-widest mb-2">
            계좌별 보유
          </p>
          <div className="divide-y divide-gray-100">
            {constituents.map((c) => (
              <div key={c.holding.id} className="flex items-center justify-between py-2.5">
                <p className="text-xs font-bold text-brand-ink truncate">
                  {labelFor(c.holding.accountId)}
                </p>
                <p className="text-xs font-bold text-brand-sage shrink-0 tabular-nums">
                  {formatQty(c.holding.quantity, view.category)} · {formatKRW(c.totalValue)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 py-4 grid grid-cols-2 gap-3 border-t border-gray-100">
        <button
          onClick={() => onTrade('buy')}
          className="bg-brand-up text-white rounded-2xl py-3.5 flex items-center justify-center gap-1.5 font-black text-sm shadow-md shadow-brand-up/20"
        >
          <TrendingUp size={16} /> 매수
        </button>
        <button
          onClick={() => onTrade('sell')}
          className="bg-brand-down text-white rounded-2xl py-3.5 flex items-center justify-center gap-1.5 font-black text-sm shadow-md shadow-brand-down/20"
        >
          <TrendingDown size={16} /> 매도
        </button>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  align = 'left',
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
  align?: 'left' | 'right';
}) {
  const valueColor =
    tone === 'up' ? 'text-brand-up' : tone === 'down' ? 'text-brand-down' : 'text-brand-ink';
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">{label}</p>
      <p className={`text-sm font-black ${valueColor}`}>{value}</p>
    </div>
  );
}

function formatQty(quantity: number, category: string): string {
  if (category === '가상자산') return `${quantity}개`;
  if (category === '금') return `${quantity}g`;
  return `${quantity}주`;
}
