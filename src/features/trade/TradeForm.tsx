'use client';

import { useEffect, useMemo, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import {
  X,
  ChevronLeft,
  ChevronDown,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { Account, AssetCategory, FamilyMember, Holding, Transaction } from '@/lib/schema';
import { accountsRepo, familyRepo, holdingsRepo, transactionsRepo } from '@/lib/repos';
import { institutionSupports } from '@/lib/institutions';
import { formatPrice, type PriceCurrency } from '@/lib/loans';
import { valuationAmount, validateTradeInput } from '@/lib/holdings';
import { applyBuy, applySell, formatPriceInput, preferredAccountId } from '@/lib/trade';
import { trackSymbolHistory } from '@/lib/prices';
import { useCurrentUserId } from '@/components/AuthProvider';

export type TradeSide = 'buy' | 'sell';

interface TradeAsset {
  symbol: string;
  name: string;
  category: AssetCategory;
  currentPrice: number;
  /** Native pricing currency. US tickers price in USD; KR equities,
   *  crypto, and gold all settle in KRW from the user's perspective. */
  currency: PriceCurrency;
}

interface Props {
  asset: TradeAsset;
  side: TradeSide;
  onBack: () => void;
  onClose: () => void;
  /** Narrow the account dropdown to accounts owned by this member.
   *  `'all'` (default) keeps every category-matching account. Wired
   *  from the dashboard's member filter — when the user is viewing
   *  one member's holdings, the buy/sell dialog only offers that
   *  member's accounts. */
  memberId?: string | 'all';
}

export function TradeForm({ asset, side, onBack, onClose, memberId = 'all' }: Props) {
  const userId = useCurrentUserId();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [priceStr, setPriceStr] = useState('');
  const [qtyStr, setQtyStr] = useState('');
  const [dateStr, setDateStr] = useState(() => todayISODate());
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const accs = accountsRepo
      .list(userId)
      .filter((a) => institutionSupports(a.institution, asset.category))
      .filter((a) => memberId === 'all' || a.memberId === memberId);
    setAccounts(accs);
    setMembers(familyRepo.list(userId));
    // Prefer an account that already holds this symbol so the dialog
    // defaults to where the position lives. With multiple held accounts
    // the first in dropdown order wins; with none, fall back to the
    // first candidate.
    const preferred = preferredAccountId(
      accs,
      holdingsRepo.list(userId),
      asset.symbol,
    );
    setAccountId((prev) => prev ?? preferred);
    // Reset date to today each time the form is mounted (e.g. new picker open)
    setDateStr(todayISODate());
  }, [userId, asset.category, asset.symbol, memberId]);

  // priceStr stays user-controlled; the current price is shown via placeholder
  // only, not pre-filled, so the user explicitly enters their fill price.

  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m] as const)),
    [members],
  );

  const price = Number(priceStr.replaceAll(',', ''));
  const qty = Number(qtyStr);
  const expectedTotal =
    Number.isFinite(price) && Number.isFinite(qty) ? valuationAmount(price, qty) : 0;

  const isBuy = side === 'buy';
  const sideLabel = isBuy ? '매수' : '매도';
  const accentBg = isBuy ? 'bg-brand-up' : 'bg-brand-down';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (accounts.length === 0) return setError('먼저 설정에서 계좌를 추가하세요.');
    const result = validateTradeInput({ price, quantity: qty, accountId: accountId ? 1 : null });
    if (!result.ok) {
      const msg =
        result.reason === 'account-required'
          ? '계좌를 선택하세요.'
          : result.reason === 'price-required'
            ? '가격을 입력하세요.'
            : '수량을 입력하세요.';
      setError(msg);
      return;
    }
    if (!accountId) return setError('계좌를 선택하세요.');

    const now = new Date().toISOString();
    const occurredAt = dateStr ? new Date(dateStr).toISOString() : now;
    const existing = holdingsRepo.list(userId).find(
      (h) => h.accountId === accountId && h.symbol === asset.symbol,
    );

    if (isBuy) {
      const base: Holding =
        existing ?? {
          id: createId(),
          userId,
          accountId,
          symbol: asset.symbol,
          quantity: 0,
          avgPrice: 0,
          createdAt: now,
          updatedAt: now,
        };
      const next = applyBuy(base, { quantity: qty, price });
      if (existing) holdingsRepo.update(userId, existing.id, next);
      else {
        holdingsRepo.add(userId, next);
        // First time this user holds this symbol — tell the server to
        // backfill its 10y daily-close history. Fire-and-forget; the chart
        // will pick it up on the next price sync.
        trackSymbolHistory(asset.symbol);
      }
    } else {
      if (!existing) return setError('해당 계좌에 보유 종목이 없습니다.');
      const next = applySell(existing, { quantity: qty });
      if (next === null) holdingsRepo.remove(userId, existing.id);
      else holdingsRepo.update(userId, existing.id, next);
    }

    const tx: Transaction = {
      id: createId(),
      userId,
      accountId,
      symbol: asset.symbol,
      type: isBuy ? 'buy' : 'sell',
      quantity: qty,
      price,
      amount: expectedTotal,
      // Snapshot the cost basis on sells so the ledger can show realized P&L.
      // (existing is guaranteed non-null in the sell branch above.)
      ...(isBuy ? {} : { avgCostAtSale: existing?.avgPrice }),
      occurredAt,
    };
    transactionsRepo.add(userId, tx);

    setError(null);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <>
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-white ${accentBg}`}>
              {isBuy ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            </div>
            <h2 className="text-lg font-black text-brand-ink">{sideLabel} 주문 접수</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-8 text-center">
          <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isBuy ? 'text-brand-up' : 'text-brand-down'}`}>
            {sideLabel} 완료
          </p>
          <p className="text-2xl font-black text-brand-ink mb-1">{formatPrice(expectedTotal, asset.currency)}</p>
          <p className="text-xs text-brand-sage">{asset.name} · {qty}주 @ {formatPrice(price, asset.currency)}</p>
          <button
            onClick={onClose}
            className="mt-6 w-full bg-brand text-white py-3 rounded-2xl font-bold text-sm"
          >
            확인
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center shrink-0"
            aria-label="뒤로"
          >
            <ChevronLeft size={18} />
          </button>
          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-white shrink-0 ${accentBg}`}>
            {isBuy ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black text-brand-ink leading-tight line-clamp-2">
              {asset.name} {sideLabel}
            </h2>
            <p className="text-[10px] text-brand-sage font-bold uppercase tracking-widest truncate mt-0.5">
              {asset.category} · 현재가 {formatPrice(asset.currentPrice, asset.currency)}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center shrink-0"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
        <Field label="계좌 선택">
          {accounts.length === 0 ? (
            <p className="text-xs font-bold text-rose-500 px-1">
              이 카테고리를 보유할 수 있는 계좌가 없어요. 설정에서 추가하세요.
            </p>
          ) : (
            <div className="relative">
              <select
                value={accountId ?? ''}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full appearance-none bg-brand-surface px-4 py-3 pr-10 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none truncate"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {membersById[acc.memberId]?.name ?? '?'} · {acc.institution} · {acc.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-sage pointer-events-none"
              />
            </div>
          )}
        </Field>

        <Field label="주문 가격 (1주)">
          <div className="relative">
            {asset.currency === 'USD' && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-brand-ink pointer-events-none">
                $
              </span>
            )}
            <input
              value={priceStr}
              onChange={(e) => setPriceStr(formatPriceInput(e.target.value))}
              inputMode="decimal"
              placeholder={
                asset.currency === 'USD'
                  ? `현재가 ${asset.currentPrice.toFixed(2)}`
                  : `현재가 ${formatPrice(asset.currentPrice, asset.currency)}`
              }
              className={`w-full bg-brand-surface py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none tabular-nums placeholder:text-brand-sage placeholder:font-medium ${
                asset.currency === 'USD' ? 'pl-9 pr-4' : 'px-4'
              }`}
            />
          </div>
        </Field>

        <Field label="수량">
          <input
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-brand-surface px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none tabular-nums"
          />
        </Field>

        <Field label="거래일">
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            max={todayISODate()}
            className="w-full bg-brand-surface px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none tabular-nums"
          />
        </Field>

        <div className="rounded-2xl bg-brand-surface px-4 py-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500">예상 체결 금액</span>
            <span className="text-base font-black text-brand-ink tabular-nums">
              {formatPrice(expectedTotal, asset.currency)}
            </span>
          </div>
        </div>

        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

        <button
          type="submit"
          className={`w-full py-4 rounded-2xl text-sm font-black text-white shadow-lg ${accentBg}`}
        >
          {sideLabel} 주문
        </button>
      </form>
    </>
  );
}

function todayISODate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black text-brand-sage uppercase tracking-widest">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
