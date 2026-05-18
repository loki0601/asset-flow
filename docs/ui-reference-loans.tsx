import React, { useState, useMemo } from 'react';
import {
  Wallet,
  PieChart,
  TrendingUp,
  User,
  Settings,
  CreditCard,
  Target,
  ChevronRight,
  Bell,
  Search,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Calendar,
  Percent,
  CircleDollarSign
} from 'lucide-react';

const App = () => {
  const [activeTab, setActiveTab] = useState('loans');
  const [selectedCategory, setSelectedCategory] = useState('전체');

  // Nordic Sage Design System
  const theme = {
    bg: '#F7F8F3',
    card: '#FFFFFF',
    primary: '#2D4F35',
    accent: '#8B9D83',
    textMain: '#1A1C1E',
    textMuted: '#8E9185',
    success: '#4A6D52',
    danger: '#D9534F',
    chipBg: '#F1F3EE'
  };

  const categories = [
    { id: '주식', label: '주식', value: 45, color: '#2D4F35' },
    { id: '가상화폐', label: '가상화폐', value: 15, color: '#8B9D83' },
    { id: '현금', label: '현금', value: 20, color: '#A3B18A' },
    { id: '부동산', label: '부동산', value: 15, color: '#588157' },
    { id: '금', label: '금', value: 5, color: '#3A5A40' }
  ];

  const holdingsData = [
    { id: 1, category: '주식', name: '삼성전자', total: '45,200,000', quantity: '600주', change: '+450,000', percent: '+1.0', isUp: true },
    { id: 2, category: '주식', name: 'S&P 500 ETF', total: '32,500,000', quantity: '120주', change: '+840,000', percent: '+2.6', isUp: true },
    { id: 3, category: '가상화폐', name: '비트코인', total: '12,450,000', quantity: '0.15개', change: '-120,000', percent: '-0.9', isUp: false },
    { id: 4, category: '주식', name: '애플', total: '15,800,000', quantity: '55주', change: '+320,000', percent: '+2.1', isUp: true },
  ];

  const loanSummary = {
    totalBorrowed: 520000000,
    totalRepaid: 124800000,
    monthlyPayment: 2450000,
    progress: 24
  };

  const loansList = [
    {
      id: 1,
      name: '우리 주택담보대출',
      bank: '우리은행',
      totalAmount: 420000000,
      remainingAmount: 315000000,
      method: '원리금균등상환',
      rate: 3.85,
      maturityDate: '2048.12.15',
      paymentDate: '매월 15일',
      monthlyEst: 1650000,
      status: '상환 중'
    },
    {
      id: 2,
      name: 'BMW 파이낸셜 자동차 대출',
      bank: 'BMW Financial',
      totalAmount: 65000000,
      remainingAmount: 42000000,
      method: '원금균등상환',
      rate: 5.2,
      maturityDate: '2027.05.20',
      paymentDate: '매월 20일',
      monthlyEst: 620000,
      status: '상환 중'
    },
    {
      id: 3,
      name: '카카오뱅크 마이너스 통장',
      bank: '카카오뱅크',
      totalAmount: 35000000,
      remainingAmount: 18000000,
      method: '만기일시상환',
      rate: 6.42,
      maturityDate: '2025.02.10',
      paymentDate: '매월 10일',
      monthlyEst: 180000,
      status: '상환 중'
    }
  ];

  const formatKRW = (val) => new Intl.NumberFormat('ko-KR').format(val);

  const renderLoans = () => (
    <div className="pb-24 animate-in fade-in slide-in-from-right duration-500">
      {/* Total Loan Summary Card */}
      <div className="bg-[#2D4F35] rounded-[40px] p-8 mb-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
        <div className="flex justify-between items-center mb-6">
          <span className="text-xs font-bold text-white/60 tracking-widest uppercase">Loan Summary</span>
          <Info size={18} className="text-white/40" />
        </div>

        <div className="space-y-1 mb-8">
          <p className="text-sm text-white/70 font-medium">전체 대출 잔액</p>
          <h2 className="text-3xl font-black">₩{formatKRW(loanSummary.totalBorrowed - loanSummary.totalRepaid)}</h2>
        </div>

        <div className="space-y-4">
          <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
            <div className="bg-[#A3B18A] h-full rounded-full transition-all duration-1000" style={{ width: `${loanSummary.progress}%` }} />
          </div>
          <div className="flex justify-between text-[11px] font-bold text-white/60">
            <span>총 대출액 ₩{formatKRW(loanSummary.totalBorrowed)}</span>
            <span>상환율 {loanSummary.progress}%</span>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center">
          <div>
            <p className="text-[10px] text-white/50 font-bold uppercase mb-1">Estimated Monthly</p>
            <p className="text-xl font-bold">₩{formatKRW(loanSummary.monthlyPayment)}</p>
          </div>
          <button className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-xs font-bold transition-colors">상세일정</button>
        </div>
      </div>

      {/* Loan List Header */}
      <div className="flex justify-between items-end mb-6 px-2">
        <h3 className="text-2xl font-black italic text-[#1A1C1E] tracking-tight">Loan Accounts</h3>
      </div>

      {/* Individual Loan Cards */}
      <div className="space-y-5">
        {loansList.map(loan => (
          <div key={loan.id} className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
            <div className="p-6 pb-4">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#F7F8F3] rounded-2xl flex items-center justify-center text-[#2D4F35]">
                    <CreditCard size={22} />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[#1A1C1E] leading-tight">{loan.name}</h4>
                    <p className="text-[11px] text-gray-400 font-bold mt-0.5">{loan.bank}</p>
                  </div>
                </div>
                <div className="bg-[#F1F3EE] px-2.5 py-1 rounded-lg text-[10px] font-black text-[#2D4F35] uppercase">
                  {loan.status}
                </div>
              </div>

              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Remaining Balance</p>
                  <p className="text-xl font-black text-[#1A1C1E]">₩{formatKRW(loan.remainingAmount)}</p>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">총 ₩{formatKRW(loan.totalAmount)}</p>
              </div>

              <div className="w-full bg-gray-50 h-1.5 rounded-full mt-4 overflow-hidden">
                <div
                  className="bg-[#2D4F35] h-full"
                  style={{ width: `${(loan.totalAmount - loan.remainingAmount) / loan.totalAmount * 100}%` }}
                />
              </div>
            </div>

            <div className="bg-[#FBFBF9] px-6 py-5 grid grid-cols-2 gap-y-4 border-t border-gray-50">
              <div className="flex items-center gap-2">
                <div className="text-gray-300"><CircleDollarSign size={14}/></div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">상환방식</p>
                  <p className="text-xs font-bold text-gray-700">{loan.method}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-gray-300"><Percent size={14}/></div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">현재 금리</p>
                  <p className="text-xs font-bold text-[#2D4F35]">연 {loan.rate}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-gray-300"><Calendar size={14}/></div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">만기일</p>
                  <p className="text-xs font-bold text-gray-700">{loan.maturityDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-gray-300"><TrendingUp size={14}/></div>
                <div>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">이자 납부일</p>
                  <p className="text-xs font-bold text-gray-700">{loan.paymentDate}</p>
                </div>
              </div>
              <div className="col-span-2 pt-3 mt-1 border-t border-gray-100/50 flex justify-between items-center">
                <span className="text-xs font-bold text-gray-400">이번 달 예상 납부액</span>
                <span className="text-sm font-black text-[#2D4F35]">₩{formatKRW(loan.monthlyEst)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return renderLoans();
};

export default App;
