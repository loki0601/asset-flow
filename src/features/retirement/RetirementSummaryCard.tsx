import { Target } from 'lucide-react';
import type { RetirementProfile } from '@/lib/schema';
import { formatKRW } from '@/lib/loans';
import { computeAttainment } from '@/lib/retirement';

export function RetirementSummaryCard({ profile }: { profile: RetirementProfile }) {
  const attainment = computeAttainment(profile.expectedMonthly, profile.targetMonthly);

  return (
    <div className="bg-brand rounded-[40px] p-8 mb-8 text-white shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />

      <div className="flex justify-between items-start mb-6 relative">
        <div>
          <p className="text-white/50 text-[10px] font-black tracking-widest uppercase mb-1">
            Expected Monthly
          </p>
          <h2 className="text-3xl font-black tracking-tight">
            {formatKRW(profile.expectedMonthly)}
          </h2>
          <p className="text-[11px] text-white/60 font-medium mt-1">
            목표 {formatKRW(profile.targetMonthly)} / 월
          </p>
        </div>
        <div className="bg-white/10 p-2 rounded-xl shrink-0">
          <Target size={24} className="text-[#A3B18A]" />
        </div>
      </div>

      <div className="space-y-3 relative">
        <div className="flex justify-between items-end">
          <span className="text-xs text-white/60 font-bold">목표 수령액 대비</span>
          <span className="text-2xl font-black text-[#A3B18A]">{attainment}%</span>
        </div>
        <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-[#A3B18A] h-full rounded-full transition-all duration-1000"
            style={{ width: `${attainment}%` }}
          />
        </div>
      </div>
    </div>
  );
}
