'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { Account, FamilyMember, MarketAsset, Transaction } from '@/lib/schema';
import { accountsRepo, familyRepo, transactionsRepo } from '@/lib/repos';
import { useCurrentUserId, useMarketDataKey } from '@/components/AuthProvider';
import { useTheme } from '@/hooks/useTheme';
import { getMarketAsset } from '@/lib/market';
import {
  filterTradesByPeriod,
  filterTradesByRange,
  groupTradesByDate,
  realizedPnl,
  type TradePeriod,
} from '@/lib/transactionHistory';
import { assetDisplayName } from '@/lib/assetDisplay';
import { categoryColor } from '@/lib/categoryColors';
import { formatPrice } from '@/lib/loans';
import { AssetCategoryIcon } from '@/components/AssetCategoryIcon';
import { RangeCalendar } from '@/components/RangeCalendar';
import { EmptyState } from '@/components/EmptyState';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type FilterMode = TradePeriod | 'custom';

const PERIODS: { key: FilterMode; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: '1m', label: '1개월' },
  { key: '3m', label: '3개월' },
  { key: '6m', label: '6개월' },
  { key: '1y', label: '1년' },
  { key: 'custom', label: '직접 선택' },
];

/** "2026-06-10" → "6월 10일 (수)". Parsed at local midnight — display only. */
function formatDateHeader(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** "2026-06-10" → "6/10" for the compact range chip label. */
function shortMD(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** A held/traded symbol should resolve in the catalog; fall back to a minimal
 *  asset so deprecated/unknown tickers still render an icon + name. */
function assetFor(symbol: string): Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo' | 'currency'> {
  return (
    getMarketAsset(symbol) ?? {
      symbol,
      category: '국내증권',
      name: symbol,
      currency: 'KRW',
    }
  );
}

export default function TransactionsPage() {
  const userId = useCurrentUserId();
  const marketKey = useMarketDataKey();
  const { theme } = useTheme();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [period, setPeriod] = useState<FilterMode>('all');
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  // Calendar collapses once a full range is picked; re-tapping 직접 선택 reopens it.
  const [calOpen, setCalOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setTxs(transactionsRepo.list(userId));
    setAccounts(accountsRepo.list(userId));
    setMembers(familyRepo.list(userId));
  }, [userId, marketKey]);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const groups = useMemo(() => {
    const filtered =
      period === 'custom'
        ? range.start && range.end
          ? filterTradesByRange(txs, range.start, range.end)
          : txs
        : filterTradesByPeriod(txs, period, new Date());
    return groupTradesByDate(filtered);
  }, [txs, period, range]);

  const rangeComplete = range.start !== null && range.end !== null;

  function accountLabel(accountId: string): string {
    const acc = accountById.get(accountId);
    if (!acc) return '계좌 미지정';
    const member = memberById.get(acc.memberId);
    const owner = member ? `${member.name} · ` : '';
    return `${owner}${acc.institution} ${acc.name}`;
  }

  return (
    <div className="pb-10">
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar px-0.5">
        {PERIODS.map((p) => {
          const label =
            p.key === 'custom' && rangeComplete && range.start && range.end
              ? `${shortMD(range.start)}~${shortMD(range.end)}`
              : p.label;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPeriod(p.key);
                if (p.key === 'custom') setCalOpen(true);
              }}
              className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-black tracking-wide ${
                period === p.key ? 'bg-brand text-white' : 'bg-brand-surface text-brand-sage'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {period === 'custom' && calOpen && (
        <div className="mb-5">
          <RangeCalendar
            start={range.start}
            end={range.end}
            onChange={(start, end) => {
              setRange({ start, end });
              // Collapse the calendar the moment a full range is chosen.
              if (start && end) setCalOpen(false);
            }}
          />
          <p className="text-[11px] text-brand-sage font-bold text-center mt-2">
            {!range.start ? '시작일을 선택하세요' : '종료일을 선택하세요'}
          </p>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={period === 'all' ? '매수·매도 이력이 없어요' : '해당 기간에 거래가 없어요'}
          description={
            period === 'all'
              ? '포트폴리오에서 매수하거나 매도하면 여기에 기록됩니다.'
              : '다른 기간을 선택해 보세요.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.date}>
              <p className="px-2 mb-2 text-[11px] font-black text-brand-sage tabular-nums">
                {formatDateHeader(group.date)}
              </p>
              <div className="bg-white rounded-[2rem] border border-brand-line shadow-sm divide-y divide-brand-surface overflow-hidden">
                {group.items.map((t) => (
                  <TradeRow key={t.id} tx={t} label={accountLabel(t.accountId)} theme={theme} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeRow({
  tx,
  label,
  theme,
}: {
  tx: Transaction;
  label: string;
  theme: 'light' | 'dark';
}) {
  const asset = assetFor(tx.symbol ?? '');
  const color = categoryColor(asset.category, theme);
  const isBuy = tx.type === 'buy';
  const qty = tx.quantity ?? 0;
  const pnl = realizedPnl(tx);

  return (
    <div className="flex items-center gap-3 p-4">
      <AssetCategoryIcon asset={asset} color={color} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-black text-brand-ink truncate">{assetDisplayName(asset)}</p>
          <span
            className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md ${
              isBuy ? 'bg-brand-up/10 text-brand-up' : 'bg-brand-down/10 text-brand-down'
            }`}
          >
            {isBuy ? '매수' : '매도'}
          </span>
        </div>
        <p className="text-[11px] text-brand-sage truncate mt-0.5">{label}</p>
      </div>
      <div className="text-right shrink-0">
        <p
          className={`text-sm font-black tabular-nums ${
            isBuy ? 'text-brand-up' : 'text-brand-down'
          }`}
        >
          {isBuy ? '+' : '−'}
          {formatPrice(tx.amount, asset.currency)}
        </p>
        <p className="text-[10px] font-bold text-brand-sage tabular-nums mt-0.5">
          {qty}주 @ {formatPrice(tx.price ?? 0, asset.currency)}
        </p>
        {pnl && (
          <p
            className={`text-[10px] font-black tabular-nums mt-0.5 ${
              pnl.amount >= 0 ? 'text-brand-up' : 'text-brand-down'
            }`}
          >
            {pnl.amount >= 0 ? '+' : '−'}
            {formatPrice(Math.abs(pnl.amount), asset.currency)} ({pnl.amount >= 0 ? '+' : '−'}
            {Math.abs(pnl.pct).toFixed(1)}%)
          </p>
        )}
      </div>
    </div>
  );
}
