import { ShieldCheck, Zap, Heart, ChevronRight } from 'lucide-react';
import type { Pension } from '@/lib/schema';
import { formatKRW } from '@/lib/loans';
import { card } from '@/lib/cardStyles';

export function PensionCard({ pension }: { pension: Pension }) {
  const icon =
    pension.category === 'public' ? (
      <ShieldCheck size={18} className="text-emerald-600" />
    ) : pension.category === 'corporate' ? (
      <Zap size={18} className="text-amber-500" />
    ) : (
      <Heart size={18} className="text-rose-400" />
    );

  return (
    <div className="bg-white rounded-[32px] overflow-hidden border border-gray-100 shadow-sm">
      <div className="p-5">
        <div className="flex items-start mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`${card.iconBox} bg-brand-surface`}>{icon}</div>
            <div className="min-w-0">
              <span className={card.subLabel}>{pension.type}</span>
              <h4 className={`${card.title} truncate`}>{pension.title}</h4>
            </div>
          </div>
        </div>

        {pension.category === 'public' ? (
          <div className="flex justify-between items-end mt-4">
            <div>
              <p className={`${card.smallLabel} mb-1`}>예상 수령액 (월)</p>
              <p className={`${card.value} text-brand`}>{formatKRW(pension.monthlyAmount)}</p>
            </div>
            <div className="text-right">
              <p className={`${card.smallLabel} mb-1`}>{pension.startYear}</p>
              <p className="text-[11px] font-bold text-gray-600">{pension.payPeriod}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-end mt-4">
            <div>
              <p className={`${card.smallLabel} mb-1`}>현재 평가액</p>
              <p className={`${card.value} text-brand`}>{formatKRW(pension.totalValue)}</p>
            </div>
            <div className="text-right">
              {pension.category === 'corporate' ? (
                <>
                  <p className={`${card.smallLabel} mb-1`}>수익률</p>
                  <p className="text-sm font-black text-emerald-500">+{pension.yield}%</p>
                </>
              ) : (
                <>
                  <p className={`${card.smallLabel} mb-1`}>연 납입액</p>
                  <p className="text-sm font-black text-gray-700">
                    {formatKRW(pension.annualContribution)}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#FBFBF9] px-5 py-3.5 border-t border-gray-50 flex justify-between items-center">
        {pension.category === 'public' && (
          <span className="text-[11px] font-medium text-gray-400">국가 보장 기초 연금</span>
        )}
        {pension.category === 'corporate' && (
          <span className="text-[11px] font-medium text-gray-400">운용사: {pension.institution}</span>
        )}
        {pension.category === 'personal' && (
          <span className="text-[11px] font-bold text-[#8B9D83]">
            {pension.taxBenefit > 0
              ? `올해 세액공제 혜택: ${formatKRW(pension.taxBenefit)}`
              : '비과세 혜택 적용 상품'}
          </span>
        )}
        <ChevronRight size={16} className="text-gray-300" />
      </div>
    </div>
  );
}
