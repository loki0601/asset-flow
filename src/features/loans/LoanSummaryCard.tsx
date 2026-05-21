'use client';

import { useEffect, useState } from 'react';
import type { Loan } from '@/lib/schema';
import { loansRepo } from '@/lib/repos';
import { formatKRW, totalOutstanding, repaymentProgress, currentLoanBalance } from '@/lib/loans';
import { useCurrentUserId } from '@/components/AuthProvider';

export function LoanSummaryCard() {
  const userId = useCurrentUserId();
  const [loans, setLoans] = useState<Loan[]>([]);

  useEffect(() => {
    if (!userId) return;
    setLoans(loansRepo.list(userId));
  }, [userId]);

  const totalBorrowed = loans.reduce((s, l) => s + l.totalAmount, 0);
  const remaining = loans.reduce((s, l) => s + currentLoanBalance(l), 0);
  const totalRepaid = totalBorrowed - remaining;
  const monthlyPayment = loans.reduce((s, l) => s + l.monthlyEst, 0);
  const outstanding = totalOutstanding(totalBorrowed, totalRepaid);
  const progress = repaymentProgress(totalBorrowed, totalRepaid);

  return (
    <div className="bg-hero rounded-[40px] p-8 mb-8 text-white shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />

      <div className="mb-6 relative">
        <p className="text-white/50 text-[10px] font-black tracking-widest uppercase mb-1">
          Loan Summary
        </p>
        <h2 className="text-3xl font-black tracking-tight">{formatKRW(outstanding)}</h2>
        <p className="text-[11px] text-white/60 font-medium mt-1">전체 대출 잔액</p>
      </div>

      <div className="space-y-3 relative">
        <div className="flex justify-between items-end">
          <span className="text-xs text-white/60 font-bold">상환 진행률</span>
          <span className="text-2xl font-black text-[#A3B18A]">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-[#A3B18A] h-full rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[11px] font-medium text-white/60">
          총 대출액 {formatKRW(totalBorrowed)}
        </p>
      </div>

      <div className="mt-8 pt-6 border-t border-white/10 relative">
        <p className="text-[10px] text-white/50 font-black uppercase tracking-widest mb-1">
          Estimated Monthly
        </p>
        <p className="text-xl font-bold">{formatKRW(monthlyPayment)}</p>
      </div>
    </div>
  );
}
