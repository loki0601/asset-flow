'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Search, X } from 'lucide-react';
import type { Account, FamilyMember, MarketAsset, Transaction } from '@/lib/schema';
import { accountsRepo, familyRepo, transactionsRepo } from '@/lib/repos';
import { useCurrentUserId, useMarketDataKey } from '@/components/AuthProvider';
import { useTheme } from '@/hooks/useTheme';
import { getMarketAsset } from '@/lib/market';
import {
  filterTradesByPeriod,
  filterTradesByQuery,
  filterTradesByRange,
  groupTradesByDate,
  realizedPnl,
  type TradePeriod,
} from '@/lib/transactionHistory';
import { assetDisplayName, fallbackAsset } from '@/lib/assetDisplay';
import { accountOwnerLabel } from '@/lib/accountLabel';
import { categoryColor } from '@/lib/categoryColors';
import { formatPrice } from '@/lib/loans';
import { AssetCategoryIcon } from '@/components/AssetCategoryIcon';
import { RangeCalendar } from '@/components/RangeCalendar';
import { EmptyState } from '@/components/EmptyState';
import { TradeDetailModal } from '@/features/transactions/TradeDetailModal';

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
 *  asset so deprecated/unknown tickers still render an icon + name.
 *  fallbackAsset infers the currency from the exchange prefix — a hardcoded
 *  KRW fallback used to render a delisted US stock's $415.65 sale as ₩416. */
function assetFor(symbol: string): Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo' | 'currency'> {
  return getMarketAsset(symbol) ?? fallbackAsset(symbol);
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
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [query, setQuery] = useState('');

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
    const searched = filterTradesByQuery(filtered, query, (t) => {
      const asset = assetFor(t.symbol ?? '');
      const acc = accountById.get(t.accountId);
      return {
        names: [asset.nameKo ?? '', asset.name],
        account: accountOwnerLabel(acc, acc ? memberById.get(acc.memberId) : undefined),
      };
    });
    return groupTradesByDate(searched);
  }, [txs, period, range, query, accountById, memberById]);

  const rangeComplete = range.start !== null && range.end !== null;

  function accountLabel(accountId: string): string {
    const acc = accountById.get(accountId);
    return accountOwnerLabel(acc, acc ? memberById.get(acc.memberId) : undefined);
  }

  return (
    <div className="pb-10">
      <div className="relative mb-3">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-sage pointer-events-none"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="종목·계좌·이름·매수/매도 검색"
          aria-label="거래 검색"
          enterKeyHint="search"
          autoCapitalize="none"
          spellCheck={false}
          className="w-full h-11 pl-10 pr-10 rounded-2xl bg-white border border-brand-line text-[13px] font-semibold text-brand-ink placeholder:text-brand-sage outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="검색어 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-sage active:opacity-60"
          >
            <X size={16} />
          </button>
        )}
      </div>

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
          title={
            query.trim()
              ? `'${query.trim()}' 검색 결과가 없어요`
              : period === 'all'
                ? '매수·매도 이력이 없어요'
                : '해당 기간에 거래가 없어요'
          }
          description={
            query.trim()
              ? '다른 검색어나 기간으로 찾아보세요.'
              : period === 'all'
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
                  <TradeRow
                    key={t.id}
                    tx={t}
                    label={accountLabel(t.accountId)}
                    theme={theme}
                    onSelect={() => setSelectedTx(t)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <TradeDetailModal
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
        asset={assetFor(selectedTx?.symbol ?? '')}
        accountLabel={selectedTx ? accountLabel(selectedTx.accountId) : ''}
        dateLabel={selectedTx ? formatDateHeader(selectedTx.occurredAt.slice(0, 10)) : ''}
      />
    </div>
  );
}

function TradeRow({
  tx,
  label,
  theme,
  onSelect,
}: {
  tx: Transaction;
  label: string;
  theme: 'light' | 'dark';
  onSelect: () => void;
}) {
  const asset = assetFor(tx.symbol ?? '');
  const color = categoryColor(asset.category, theme);
  const isBuy = tx.type === 'buy';
  const qty = tx.quantity ?? 0;
  const pnl = realizedPnl(tx);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-4 text-left hover:bg-brand-surface active:bg-brand-surface transition-colors"
    >
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
    </button>
  );
}
