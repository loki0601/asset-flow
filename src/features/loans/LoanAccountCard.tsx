'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import type { Loan } from '@/lib/schema';
import { formatKRW } from '@/lib/loans';
import { LoanDetailModal } from './LoanDetailModal';
import { card } from '@/lib/cardStyles';

export function LoanAccountCard({ loan }: { loan: Loan }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left w-full bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`${card.iconBox} bg-brand-surface text-brand`}>
              <CreditCard size={18} />
            </div>
            <div className="min-w-0">
              <h4 className={`${card.title} truncate`}>{loan.bank}</h4>
              <p className={`${card.subLabel} truncate`}>{loan.method}</p>
            </div>
          </div>
          <span className="bg-brand/10 px-2.5 py-1 rounded-lg text-[10px] font-black text-brand uppercase shrink-0">
            연 {loan.rate}%
          </span>
        </div>

        <div className="flex justify-between items-center">
          <p className={card.smallLabel}>남은 금액</p>
          <p className={card.value}>{formatKRW(loan.remainingAmount)}</p>
        </div>
      </button>

      <LoanDetailModal open={open} onClose={() => setOpen(false)} loan={loan} />
    </>
  );
}
