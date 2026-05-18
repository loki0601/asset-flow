'use client';

import { X } from 'lucide-react';
import type { Loan } from '@/lib/schema';
import { formatKRW, loanProgressRatio, currentLoanBalance } from '@/lib/loans';
import { Modal } from '@/components/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  loan: Loan;
}

export function LoanDetailModal({ open, onClose, loan }: Props) {
  const remaining = Math.round(currentLoanBalance(loan));
  const progress = loanProgressRatio(loan.totalAmount, remaining);
  const repaid = loan.totalAmount - remaining;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <div>
          <span className="text-[10px] font-black text-brand-sage uppercase tracking-widest">
            {loan.bank}
          </span>
          <h2 className="text-xl font-black text-brand-ink leading-tight">{loan.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface flex items-center justify-center text-brand-sage"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-6 py-4">
        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Remaining Balance</p>
        <p className="text-3xl font-black text-brand-ink tracking-tight">
          {formatKRW(remaining)}
        </p>
        <p className="text-xs font-medium text-gray-500 mt-1">
          총 {formatKRW(loan.totalAmount)} · 상환 {formatKRW(repaid)}
        </p>

        <div className="mt-4 w-full bg-gray-50 h-1.5 rounded-full overflow-hidden">
          <div className="bg-brand h-full" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-[10px] font-bold text-brand-sage text-right">
          상환율 {progress.toFixed(1)}%
        </p>
      </div>

      <div className="px-6 py-5 border-t border-gray-100 grid grid-cols-2 gap-y-4 bg-[#FBFBF9]">
        <Stat label="상환방식" value={loan.method} />
        <Stat label="현재 금리" value={`연 ${loan.rate}%`} tone="up" align="right" />
        <Stat label="만기일" value={loan.maturityDate} />
        <Stat label="이자 납부일" value={`매월 ${loan.paymentDay}일`} align="right" />

        <div className="col-span-2 flex justify-between items-center pt-3 mt-1 border-t border-gray-100/60">
          <span className="text-xs font-bold text-gray-400">이번 달 예상 납부액</span>
          <span className="text-base font-black text-brand">{formatKRW(loan.monthlyEst)}</span>
        </div>
      </div>
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
    tone === 'up' ? 'text-brand' : tone === 'down' ? 'text-rose-500' : 'text-brand-ink';
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">{label}</p>
      <p className={`text-sm font-black ${valueColor}`}>{value}</p>
    </div>
  );
}
