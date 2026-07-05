'use client';

import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { MarketAsset, Transaction } from '@/lib/schema';
import { Modal } from '@/components/Modal';
import { AssetCategoryIcon } from '@/components/AssetCategoryIcon';
import { assetDisplayName } from '@/lib/assetDisplay';
import { categoryColor } from '@/lib/categoryColors';
import { formatPrice } from '@/lib/loans';
import { realizedPnl } from '@/lib/transactionHistory';
import { useTheme } from '@/hooks/useTheme';

interface Props {
  open: boolean;
  onClose: () => void;
  tx: Transaction | null;
  asset: Pick<MarketAsset, 'symbol' | 'category' | 'name' | 'nameKo' | 'currency'>;
  /** "{owner} · {institution} {name}", pre-formatted by the caller so this
   *  modal doesn't need account/member repos. */
  accountLabel: string;
  /** "6월 10일 (수)" — pre-formatted by the caller (page already has the
   *  date-header formatter for the surrounding group). */
  dateLabel: string;
}

/** Detail popup for a single buy/sell row on the 거래 내역 page. Read-only —
 *  mirrors HoldingDetailModal/LoanDetailModal's stat-grid layout. */
export function TradeDetailModal({ open, onClose, tx, asset, accountLabel, dateLabel }: Props) {
  const { theme } = useTheme();
  if (!tx) return null;

  const isBuy = tx.type === 'buy';
  const qty = tx.quantity ?? 0;
  const price = tx.price ?? 0;
  const pnl = realizedPnl(tx);
  const color = categoryColor(asset.category, theme);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <AssetCategoryIcon asset={asset} color={color} size={40} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-black text-brand-ink leading-tight truncate">
                {assetDisplayName(asset)}
              </h2>
              <span
                className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                  isBuy ? 'bg-brand-up/10 text-brand-up' : 'bg-brand-down/10 text-brand-down'
                }`}
              >
                {isBuy ? '매수' : '매도'}
              </span>
            </div>
            <p className="text-[11px] font-bold text-brand-sage truncate mt-0.5">{dateLabel}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface flex items-center justify-center text-brand-sage shrink-0"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-6 py-4">
        <p
          className={`text-3xl font-black tracking-tight ${
            isBuy ? 'text-brand-up' : 'text-brand-down'
          }`}
        >
          {isBuy ? '+' : '−'}
          {formatPrice(tx.amount, asset.currency)}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {pnl && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black ${
                pnl.amount >= 0 ? 'bg-brand-up/10 text-brand-up' : 'bg-brand-down/10 text-brand-down'
              }`}
            >
              {pnl.amount >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {pnl.amount >= 0 ? '+' : '−'}
              {Math.abs(pnl.pct).toFixed(1)}%
            </span>
          )}
          <span className="text-[11px] font-medium text-gray-400">{accountLabel}</span>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-100 grid grid-cols-2 gap-y-3 bg-[#FBFBF9]">
        <Stat label="수량" value={`${qty}주`} />
        <Stat label="체결 단가" value={formatPrice(price, asset.currency)} align="right" />
        {tx.fee != null && tx.fee > 0 && (
          <Stat label="수수료" value={formatPrice(tx.fee, asset.currency)} />
        )}
        {pnl && (
          <Stat
            label="실현 손익"
            value={`${pnl.amount >= 0 ? '+' : '−'}${formatPrice(Math.abs(pnl.amount), asset.currency)}`}
            tone={pnl.amount >= 0 ? 'up' : 'down'}
            align="right"
          />
        )}
      </div>

      {tx.memo && (
        <div className="px-6 py-4 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">메모</p>
          <p className="text-sm font-medium text-brand-ink whitespace-pre-wrap">{tx.memo}</p>
        </div>
      )}
    </Modal>
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
