'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Search, TrendingUp, Bitcoin, Coins, ChevronRight, CreditCard } from 'lucide-react';
import { ACCOUNT_TYPES, type AssetCategory, type MarketAsset } from '@/lib/schema';
import { listMarketAssets } from '@/lib/market';
import { accountsRepo, holdingsRepo } from '@/lib/repos';
import { institutionSupports, listInstitutionsByKind } from '@/lib/institutions';
import { getFxRate } from '@/lib/fx';
import { assetDisplayName } from '@/lib/assetDisplay';
import { isAllInitials, matchesInitials } from '@/lib/hangulInitials';
import { Modal } from '@/components/Modal';
import { TradeForm } from '@/features/trade/TradeForm';
import { useCurrentUserId, useMarketDataKey } from '@/components/AuthProvider';

const CATEGORIES: (AssetCategory | '전체')[] = ['전체', ...ACCOUNT_TYPES];

function icon(cat: AssetCategory) {
  if (cat === '가상자산') return <Bitcoin size={18} />;
  if (cat === '금') return <Coins size={18} />;
  return <TrendingUp size={18} />;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onTraded?: () => void;
}

const PICKER_CATEGORY_KEY = 'assetflow:asset-picker:category';

function readStoredCategory(): AssetCategory | '전체' {
  if (typeof window === 'undefined') return '전체';
  const stored = window.localStorage.getItem(PICKER_CATEGORY_KEY);
  if (!stored) return '전체';
  if (stored === '전체') return '전체';
  return ACCOUNT_TYPES.includes(stored as AssetCategory)
    ? (stored as AssetCategory)
    : '전체';
}

export function AssetPickerModal({ open, onClose, onTraded }: Props) {
  const userId = useCurrentUserId();
  const marketKey = useMarketDataKey();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AssetCategory | '전체'>(() =>
    readStoredCategory(),
  );
  const [selected, setSelected] = useState<MarketAsset | null>(null);

  // Persist the category choice so re-opening the picker keeps the same
  // filter — avoids the "starts on 미국증권 then snaps to 전체" flash that
  // a useEffect-based reset caused on every open.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PICKER_CATEGORY_KEY, category);
    }
  }, [category]);

  // Reset query/selection on every open — but NOT category (above).
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(null);
    }
  }, [open]);

  const heldSymbols = useMemo(() => {
    if (!userId) return new Set<string>();
    return new Set(holdingsRepo.list(userId).map((h) => h.symbol));
  }, [userId, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = listMarketAssets().filter((a) => {
      if (a.deprecated) return false; // 단종 종목은 신규 매수 목록에서 숨김
      if (category !== '전체' && a.category !== category) return false;
      return true;
    });
    // Hoist held assets to the top of every result list — they're the ones
    // the user typically wants to add to / trim from.  Preserves the
    // alphabetical ordering inside each group (held vs. unheld).
    const heldFirst = (list: typeof base) => {
      const held: typeof base = [];
      const rest: typeof base = [];
      for (const a of list) {
        (heldSymbols.has(a.symbol) ? held : rest).push(a);
      }
      return [...held, ...rest];
    };
    if (!q) return heldFirst(base);

    // If the user typed only Hangul initial jamo (e.g. "ㅅㅅ"), match against
    // the initials-projection of name/nameKo. Falls through to substring
    // search for any other query shape.
    const initialsOnly = isAllInitials(query.trim());

    // Symbol (e.g. ARKX) is what users actually search for — prioritise it.
    // Score: 0=exact symbol/name, 1=symbol prefix, 2=symbol contains, 3=name
    // prefix, 4=name contains, 5=initial-jamo match. Anything else drops out.
    type Scored = { a: (typeof base)[number]; score: number };
    const scored: Scored[] = [];
    for (const a of base) {
      const sym = a.symbol.split(':').pop()?.toLowerCase() ?? '';
      // Match against both English and Korean names so "애플" and "Apple"
      // both surface the same ticker. Lowercase normalisation works for
      // hangul too — toLowerCase is a no-op for non-cased scripts.
      const name = a.name.toLowerCase();
      const nameKo = (a.nameKo ?? '').toLowerCase();
      let score = -1;
      if (sym === q || name === q || nameKo === q) score = 0;
      else if (sym.startsWith(q)) score = 1;
      else if (sym.includes(q)) score = 2;
      else if (name.startsWith(q) || nameKo.startsWith(q)) score = 3;
      else if (name.includes(q) || nameKo.includes(q)) score = 4;
      else if (
        initialsOnly &&
        (matchesInitials(a.name, query.trim()) ||
          matchesInitials(a.nameKo ?? '', query.trim()))
      ) {
        score = 5;
      }
      if (score >= 0) scored.push({ a, score });
    }
    // Held items take precedence over scoring — a held position is always
    // more interesting than an unrelated match at the same relevance band.
    scored.sort((x, y) => {
      const xh = heldSymbols.has(x.a.symbol) ? 0 : 1;
      const yh = heldSymbols.has(y.a.symbol) ? 0 : 1;
      if (xh !== yh) return xh - yh;
      return x.score - y.score || x.a.name.localeCompare(y.a.name);
    });
    return scored.map((s) => s.a);
    // `marketKey` triggers a re-read after a catalog OR price sync; `open`
    // is included so re-opening the modal also refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, open, marketKey, heldSymbols]);

  function handleClose() {
    setSelected(null);
    onClose();
  }

  function handleTraded() {
    setSelected(null);
    onClose();
    onTraded?.();
  }

  // Pre-flight: does the user have any account whose institution supports
  // the picked asset's category? If not, route to a guidance screen
  // instead of TradeForm — TradeForm itself would just show an error toast
  // and silently fail to save, which is what bit us before.
  const hasSupportingAccount = useMemo(() => {
    if (!selected || !userId) return false;
    const accs = accountsRepo.list(userId);
    return accs.some((a) => institutionSupports(a.institution, selected.category));
  }, [selected, userId]);

  return (
    <Modal open={open} onClose={handleClose} fillHeight={!selected}>
      {selected && hasSupportingAccount ? (
        <TradeForm
          asset={{
            symbol: selected.symbol,
            name: assetDisplayName(selected),
            category: selected.category,
            currentPrice: selected.currentPrice,
          }}
          side="buy"
          onBack={() => setSelected(null)}
          onClose={handleTraded}
        />
      ) : selected ? (
        <NoSupportingAccountView
          category={selected.category}
          onBack={() => setSelected(null)}
          onClose={handleClose}
        />
      ) : (
        <PickerView
          query={query}
          onQuery={setQuery}
          category={category}
          onCategory={setCategory}
          assets={filtered}
          heldSymbols={heldSymbols}
          onSelect={setSelected}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
}

function NoSupportingAccountView({
  category,
  onBack,
  onClose,
}: {
  category: AssetCategory;
  onBack: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const institutions = useMemo(() => {
    // Suggest the institutions that actually support this category, grouped
    // by kind. Cap to 4 names so the screen stays scannable.
    const matches = [
      ...listInstitutionsByKind('증권사'),
      ...listInstitutionsByKind('연금기관'),
      ...listInstitutionsByKind('코인거래소'),
    ].filter((i) => i.supports.includes(category));
    return matches.slice(0, 4).map((i) => i.name);
  }, [category]);

  function goAddAccount() {
    onClose();
    router.push('/settings/accounts');
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center"
          aria-label="뒤로"
        >
          <X size={18} />
        </button>
        <h2 className="text-lg font-black text-brand-ink">계좌가 필요해요</h2>
        <span className="w-9 h-9" />
      </div>
      <div className="px-6 pb-6 space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-brand-surface text-brand flex items-center justify-center mx-auto">
          <CreditCard size={26} />
        </div>
        <p className="text-center text-sm text-brand-ink leading-relaxed">
          <span className="font-black">{category}</span>을(를) 거래할 수 있는 계좌가 아직 없어요.
          <br />
          먼저 계좌를 등록한 뒤 매수해 주세요.
        </p>
        {institutions.length > 0 && (
          <div className="bg-brand-surface/70 rounded-2xl px-4 py-3">
            <p className="text-[10px] font-black text-brand-sage uppercase tracking-widest mb-1.5">
              추천 기관
            </p>
            <p className="text-xs font-bold text-brand-ink">
              {institutions.join(' · ')}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={goAddAccount}
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20"
        >
          계좌 만들러 가기
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 text-xs font-bold text-brand-sage"
        >
          다른 종목 선택
        </button>
      </div>
    </div>
  );
}

function PickerView({
  query,
  onQuery,
  category,
  onCategory,
  assets,
  heldSymbols,
  onSelect,
  onClose,
}: {
  query: string;
  onQuery: (v: string) => void;
  category: AssetCategory | '전체';
  onCategory: (v: AssetCategory | '전체') => void;
  assets: MarketAsset[];
  heldSymbols: Set<string>;
  onSelect: (a: MarketAsset) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <h2 className="text-lg font-black text-brand-ink">매수할 종목 선택</h2>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-6 pb-3 shrink-0">
        <div className="flex items-center gap-2 bg-brand-surface px-4 py-2.5 rounded-2xl">
          <Search size={16} className="text-brand-sage" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="종목명 검색"
            className="flex-1 bg-transparent text-sm font-bold text-brand-ink focus:outline-none placeholder:text-brand-sage"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar px-6 pb-3 shrink-0">
        {CATEGORIES.map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              onClick={() => onCategory(c)}
              className={`px-4 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border ${
                active
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-brand-sage border-brand-line'
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4">
        {assets.length === 0 ? (
          <p className="text-center text-brand-sage text-xs py-10">검색 결과가 없습니다.</p>
        ) : (
          assets.map((a) => {
            const held = heldSymbols.has(a.symbol);
            const up = a.dailyChangePct >= 0;
            return (
              <button
                key={a.symbol}
                onClick={() => onSelect(a)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-brand-surface active:bg-brand-surface text-left"
              >
                <div className="w-10 h-10 rounded-2xl bg-brand-surface text-brand flex items-center justify-center shrink-0">
                  {icon(a.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-brand-ink line-clamp-2 leading-tight">{assetDisplayName(a)}</h4>
                    {held && (
                      <span className="text-[9px] font-black text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                        보유
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-brand-sage uppercase tracking-wider">
                    {a.category}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-brand-ink tabular-nums">
                    {new Intl.NumberFormat('ko-KR').format(
                      Math.round(
                        a.currentPrice * (a.currency === 'USD' ? getFxRate('USDKRW') : 1),
                      ),
                    )}
                  </p>
                  <p className={`text-[11px] font-black ${up ? 'text-brand-up' : 'text-brand-down'}`}>
                    {up ? '+' : ''}
                    {a.dailyChangePct.toFixed(1)}%
                  </p>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
