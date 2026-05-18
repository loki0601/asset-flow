// Retirement page reference (full).
import React, { useState } from 'react';
import {
  Target,
  Heart,
  ShieldCheck,
  Zap,
  Info,
  ChevronRight,
  Umbrella,
  User,
} from 'lucide-react';

const App = () => {
  const [selectedPerson, setSelectedPerson] = useState<'me' | 'spouse'>('me');

  const retirementData = {
    me: {
      name: '나',
      targetAge: 62,
      currentAge: 38,
      targetMonthly: 4500000,
      expectedMonthly: 3120000,
      attainment: 69,
      pensions: [
        { type: '국민연금', category: 'public', title: '노령연금 (예상)', monthlyAmount: 1450000, payPeriod: '156개월 납부 중', startYear: '2051년 수령 예정' },
        { type: '퇴직연금', category: 'corporate', title: 'DC형 퇴직연금', totalValue: 84500000, yield: 5.8, institution: '미래에셋증권' },
        { type: '개인연금', category: 'personal', title: '연금저축계좌', totalValue: 42000000, annualContribution: 6000000, taxBenefit: 924000 }
      ]
    },
    spouse: {
      name: '배우자',
      targetAge: 60,
      currentAge: 36,
      targetMonthly: 3500000,
      expectedMonthly: 2150000,
      attainment: 61,
      pensions: [
        { type: '국민연금', category: 'public', title: '노령연금 (예상)', monthlyAmount: 980000, payPeriod: '110개월 납부 중', startYear: '2053년 수령 예정' },
        { type: '퇴직연금', category: 'corporate', title: 'DB형 퇴직연금', totalValue: 45000000, yield: 2.1, institution: '우리은행' },
        { type: '개인연금', category: 'personal', title: '연금보험', totalValue: 28000000, annualContribution: 3600000, taxBenefit: 0 }
      ]
    }
  } as const;

  const current = retirementData[selectedPerson];
  const formatKRW = (val: number) => new Intl.NumberFormat('ko-KR').format(val);

  return (
    <div className="pb-24">
      {/* Switcher */}
      <div className="flex bg-white/50 backdrop-blur-md p-1.5 rounded-2xl mb-8 border border-gray-100 shadow-sm">
        <button onClick={() => setSelectedPerson('me')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${selectedPerson === 'me' ? 'bg-[#2D4F35] text-white shadow-lg' : 'text-gray-400'}`}>
          <User size={16} /> 나 (본인)
        </button>
        <button onClick={() => setSelectedPerson('spouse')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${selectedPerson === 'spouse' ? 'bg-[#2D4F35] text-white shadow-lg' : 'text-gray-400'}`}>
          <Heart size={16} /> 배우자
        </button>
      </div>

      {/* Retirement Summary Card */}
      <div className="bg-[#2D4F35] rounded-[40px] p-8 mb-10 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl" />
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-white/50 text-[10px] font-black tracking-widest uppercase mb-1">Retirement Target</p>
            <h2 className="text-3xl font-black">만 {current.targetAge}세 은퇴</h2>
          </div>
          <div className="bg-white/10 p-2 rounded-xl">
            <Target size={24} className="text-[#A3B18A]" />
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs text-white/60 font-bold">목표 수령액 대비</span>
              <span className="text-2xl font-black text-[#A3B18A]">{current.attainment}%</span>
            </div>
            <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden">
              <div className="bg-[#A3B18A] h-full rounded-full transition-all duration-1000" style={{ width: `${current.attainment}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-[10px] text-white/40 font-bold uppercase mb-0.5">Monthly Goal</p>
              <p className="text-sm font-bold">₩{formatKRW(current.targetMonthly)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/40 font-bold uppercase mb-0.5">Expected Now</p>
              <p className="text-sm font-bold">₩{formatKRW(current.expectedMonthly)}</p>
            </div>
          </div>
        </div>
      </div>

      <h3 className="text-2xl font-black italic text-[#1A1C1E] tracking-tight mb-6 px-2">Pension Portfolios</h3>

      {/* Pension List */}
      <div className="space-y-6">
        {current.pensions.map((pension, idx) => {
          const icon = pension.category === 'public' ? <ShieldCheck size={24} className="text-emerald-600" />
            : pension.category === 'corporate' ? <Zap size={24} className="text-amber-500" />
            : <Heart size={24} className="text-rose-400" />;
          return (
            <div key={idx} className="bg-white rounded-[32px] overflow-hidden border border-gray-100 shadow-sm">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-[#F7F8F3] rounded-[22px] flex items-center justify-center">{icon}</div>
                    <div>
                      <span className="text-[10px] font-black text-[#8B9D83] uppercase tracking-wider">{pension.type}</span>
                      <h4 className="text-lg font-bold text-[#1A1C1E]">{pension.title}</h4>
                    </div>
                  </div>
                  <button className="text-gray-300"><Info size={20} /></button>
                </div>

                {pension.category === 'public' ? (
                  <div className="flex justify-between items-end mt-6">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">예상 수령액 (월)</p>
                      <p className="text-xl font-black text-[#2D4F35]">₩{formatKRW(pension.monthlyAmount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">{pension.startYear}</p>
                      <p className="text-xs font-bold text-gray-600">{pension.payPeriod}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-end mt-6">
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">현재 평가액</p>
                      <p className="text-xl font-black text-[#2D4F35]">₩{formatKRW(pension.totalValue)}</p>
                    </div>
                    <div className="text-right">
                      {pension.category === 'corporate' ? (
                        <>
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">수익률</p>
                          <p className="text-sm font-black text-emerald-500">+{pension.yield}%</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">연 납입액</p>
                          <p className="text-sm font-black text-gray-700">₩{formatKRW(pension.annualContribution)}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-[#FBFBF9] px-6 py-4 border-t border-gray-50 flex justify-between items-center">
                {pension.category === 'public' && <span className="text-[11px] font-medium text-gray-400">국가 보장 기초 연금</span>}
                {pension.category === 'corporate' && <span className="text-[11px] font-medium text-gray-400">운용사: {pension.institution}</span>}
                {pension.category === 'personal' && (
                  <span className="text-[11px] font-bold text-[#8B9D83]">
                    {pension.taxBenefit > 0 ? `올해 세액공제 혜택: ₩${formatKRW(pension.taxBenefit)}` : '비과세 혜택 적용 상품'}
                  </span>
                )}
                <ChevronRight size={18} className="text-gray-300" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 p-6 bg-[#2D4F35]/5 rounded-[32px] border border-[#2D4F35]/10">
        <div className="flex items-center gap-2 mb-2 text-[#2D4F35]">
          <Umbrella size={20} />
          <span className="font-bold text-sm">노후 준비 팁</span>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          {selectedPerson === 'me'
            ? '현재 은퇴 목표치에 도달하기 위해서는 개인연금 납입액을 월 20만원 더 증액하는 것이 좋습니다.'
            : '배우자님의 국민연금 추납 제도를 활용하면 노후 예상 수령액을 크게 높일 수 있습니다.'}
        </p>
      </div>
    </div>
  );
};

export default App;
