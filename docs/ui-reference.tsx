import React, { useState } from 'react';
import {
  LayoutDashboard,
  PieChart,
  HandCoins,
  HeartPulse,
  Settings,
  ChevronRight,
  ArrowUpRight,
  Bell,
  CircleUser,
  Plus,
  TrendingUp,
  Wallet,
  Calendar,
  ShieldCheck,
  ArrowRightLeft
} from 'lucide-react';

const MOCK_DATA = {
  total: "₩124,950,500",
  change: "+₩1,240,000",
  assets: [
    { name: '국내 주식', value: '₩54,000,000', ratio: 43, color: '#2D4F35' },
    { name: '해외 주식', value: '₩32,500,000', ratio: 26, color: '#4A7256' },
    { name: '현금/예금', value: '₩38,450,500', ratio: 31, color: '#7A8C7E' },
  ],
  loans: {
    total: "₩45,000,000",
    paid: 15,
    items: [
      { name: '주택담보대출', amount: '₩40,000,000', rate: '3.2%', bank: 'NH농협' },
      { name: '신용대출', amount: '₩5,000,000', rate: '5.5%', bank: '카카오뱅크' }
    ]
  },
  retirement: {
    target: "₩1,000,000,000",
    current: "₩124,950,500",
    progress: 12.5,
    estimatedAge: 65
  }
};

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const DashboardView = () => (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center px-2">
        <div>
          <p className="text-[#7A8C7E] text-xs font-bold uppercase tracking-widest mb-1">Total Assets</p>
          <h1 className="text-3xl font-bold text-[#2D3A30]">{MOCK_DATA.total}</h1>
        </div>
        <div className="flex gap-2">
          <span className="p-2 bg-white rounded-full shadow-sm text-[#2D4F35]"><Bell size={18} /></span>
        </div>
      </div>

      <div className="bg-[#2D4F35] text-white p-6 rounded-[2.5rem] shadow-xl shadow-[#2D4F35]/20">
        <div className="flex justify-between items-start mb-6">
          <p className="text-white/60 text-xs font-medium">Daily Performance</p>
          <span className="flex items-center gap-1 text-[10px] font-bold bg-white/20 px-2 py-1 rounded-full">
            <TrendingUp size={12} /> {MOCK_DATA.change}
          </span>
        </div>
        <p className="text-lg font-medium leading-tight mb-2">자산이 어제보다<br/>안정적으로 늘어나고 있어요.</p>
        <div className="flex -space-x-2 mt-4">
          {[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-full border-2 border-[#2D4F35] bg-[#E9EDE9]" />)}
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">+12</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#E9EDE9] p-5 rounded-3xl flex flex-col justify-between h-32">
          <Wallet size={20} className="text-[#2D4F35]" />
          <div>
            <p className="text-[10px] font-bold text-[#7A8C7E]">Spending</p>
            <p className="font-bold text-[#2D3A30]">₩1,240k</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-[#E9EDE9] flex flex-col justify-between h-32">
          <Calendar size={20} className="text-[#7A8C7E]" />
          <div>
            <p className="text-[10px] font-bold text-[#7A8C7E]">Schedule</p>
            <p className="font-bold text-[#2D3A30]">3 Events</p>
          </div>
        </div>
      </div>

      <div className="px-2">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-[#2D3A30]">Quick Actions</h3>
          <span className="text-[10px] font-bold text-[#7A8C7E] uppercase">Edit</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
          {['Transfer', 'Stock', 'Insurance', 'Gold'].map((action, i) => (
            <div key={i} className="min-w-[80px] aspect-square bg-white rounded-3xl flex flex-col items-center justify-center border border-[#E9EDE9] gap-2 active:scale-95 transition-transform">
              <div className="p-2 bg-[#F4F7F5] rounded-full text-[#2D4F35]">
                {i === 0 && <ArrowRightLeft size={18} />}
                {i === 1 && <TrendingUp size={18} />}
                {i === 2 && <ShieldCheck size={18} />}
                {i === 3 && <PieChart size={18} />}
              </div>
              <p className="text-[10px] font-bold text-[#2D3A30]">{action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const PortfolioView = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center py-4">
        <h2 className="text-xl font-bold text-[#2D3A30]">Portfolio Analysis</h2>
        <p className="text-[#7A8C7E] text-xs">Based on current market value</p>
      </div>

      <div className="flex justify-center mb-4">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle cx="96" cy="96" r="75" stroke="#E9EDE9" strokeWidth="15" fill="none" />
            <circle cx="96" cy="96" r="75" stroke="#2D4F35" strokeWidth="15" fill="none" strokeDasharray="471" strokeDashoffset="268" />
            <circle cx="96" cy="96" r="75" stroke="#4A7256" strokeWidth="15" fill="none" strokeDasharray="471" strokeDashoffset="348" />
          </svg>
          <div className="absolute text-center">
            <p className="text-[10px] font-bold text-[#7A8C7E]">Yield</p>
            <p className="text-2xl font-bold text-[#2D4F35]">+14.2%</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-6 border border-[#E9EDE9]">
        <h3 className="font-bold text-[#2D3A30] mb-6">Asset Distribution</h3>
        <div className="space-y-6">
          {MOCK_DATA.assets.map((asset, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white" style={{backgroundColor: asset.color}}>
                <PieChart size={18} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-end mb-1">
                  <p className="text-sm font-bold text-[#2D3A30]">{asset.name}</p>
                  <p className="text-sm font-bold text-[#2D3A30]">{asset.ratio}%</p>
                </div>
                <div className="h-1.5 w-full bg-[#F4F7F5] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width: `${asset.ratio}%`, backgroundColor: asset.color}}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="w-full bg-[#2D4F35] text-white py-5 rounded-3xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2D4F35]/20">
        <Plus size={18} /> Add New Asset
      </button>
    </div>
  );

  const LoansView = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="px-2">
        <p className="text-[#7A8C7E] text-xs font-bold uppercase tracking-widest mb-1">Total Debts</p>
        <h2 className="text-3xl font-bold text-[#2D3A30]">{MOCK_DATA.loans.total}</h2>
      </div>

      <div className="bg-[#FDFBF7] border border-[#E9EDE9] p-6 rounded-[2.5rem]">
        <div className="flex justify-between items-center mb-4">
          <p className="font-bold text-[#2D3A30]">Repayment Progress</p>
          <p className="text-[#2D4F35] font-bold text-sm">{MOCK_DATA.loans.paid}%</p>
        </div>
        <div className="h-3 w-full bg-[#E9EDE9] rounded-full overflow-hidden mb-2">
          <div className="h-full bg-[#2D4F35] rounded-full" style={{width: `${MOCK_DATA.loans.paid}%`}}></div>
        </div>
        <p className="text-[10px] text-[#7A8C7E] font-medium text-center italic">상환 완료까지 약 15년 남았습니다.</p>
      </div>

      <div className="space-y-4">
        <h3 className="px-2 font-bold text-[#2D3A30]">Loan Accounts</h3>
        {MOCK_DATA.loans.items.map((item, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl border border-[#E9EDE9] flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <div className="w-10 h-10 bg-[#F4F7F5] text-[#2D4F35] rounded-full flex items-center justify-center">
                <HandCoins size={20} />
              </div>
              <div>
                <p className="font-bold text-sm text-[#2D3A30]">{item.name}</p>
                <p className="text-[10px] text-[#7A8C7E] font-bold uppercase">{item.bank} • {item.rate}</p>
              </div>
            </div>
            <p className="font-bold text-sm text-[#2D3A30]">{item.amount.split('₩')[1]}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#2D4F35]/5 border border-[#2D4F35]/10 p-5 rounded-3xl flex items-center gap-4">
        <ShieldCheck className="text-[#2D4F35]" size={24} />
        <div>
          <p className="text-xs font-bold text-[#2D3A30]">안심 대출 갈아타기</p>
          <p className="text-[10px] text-[#7A8C7E]">이자를 0.5% 더 낮출 수 있어요!</p>
        </div>
        <ChevronRight size={16} className="ml-auto text-[#7A8C7E]" />
      </div>
    </div>
  );

  const RetirementView = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="text-center py-4">
        <h2 className="text-xl font-bold text-[#2D3A30]">Retirement Plan</h2>
        <p className="text-[#7A8C7E] text-xs">Journey to Financial Freedom</p>
      </div>

      <div className="bg-white p-8 rounded-[3rem] border border-[#E9EDE9] shadow-sm text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#E9EDE9]/40 rounded-full -mr-16 -mt-16" />
        <HeartPulse size={32} className="text-[#2D4F35] mx-auto mb-4" />
        <p className="text-[#7A8C7E] text-[10px] font-bold uppercase tracking-widest mb-2">Target Status</p>
        <p className="text-sm font-bold text-[#2D3A30] mb-1">현재 목표의 {MOCK_DATA.retirement.progress}% 달성</p>
        <p className="text-2xl font-bold text-[#2D4F35] mb-6">{MOCK_DATA.retirement.current}</p>

        <div className="flex justify-between text-[10px] font-bold text-[#7A8C7E] mb-2 px-1">
          <span>Now</span>
          <span>{MOCK_DATA.retirement.estimatedAge}y</span>
        </div>
        <div className="h-1.5 w-full bg-[#F4F7F5] rounded-full overflow-hidden">
          <div className="h-full bg-[#2D4F35] rounded-full" style={{width: `${MOCK_DATA.retirement.progress}%`}}></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-2">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold text-[#7A8C7E] uppercase">Monthly Saved</p>
          <p className="font-bold text-[#2D3A30]">₩1,500,000</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-bold text-[#7A8C7E] uppercase">Est. Monthly Pension</p>
          <p className="font-bold text-[#2D3A30]">₩4,200,000</p>
        </div>
      </div>

      <div className="bg-[#E9EDE9] p-6 rounded-[2.5rem]">
        <h3 className="font-bold text-[#2D3A30] mb-4 text-sm">Advice for you</h3>
        <p className="text-xs text-[#2D3A30] leading-relaxed opacity-80">
          "지금의 저축 속도를 유지한다면, 62세에 목표 금액의 80%에 도달할 수 있습니다. IRP 계좌를 활용해 세액 공제를 받아보세요."
        </p>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col items-center py-6">
        <div className="w-20 h-20 bg-[#2D4F35] rounded-full flex items-center justify-center text-white mb-4 shadow-lg shadow-[#2D4F35]/20">
          <CircleUser size={40} />
        </div>
        <h2 className="text-xl font-bold text-[#2D3A30]">홍길동 님</h2>
        <p className="text-[#7A8C7E] text-xs">Premium Member</p>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-[#E9EDE9] overflow-hidden">
        {[
          { icon: <CircleUser size={18}/>, title: "Profile Information" },
          { icon: <ShieldCheck size={18}/>, title: "Security & Privacy" },
          { icon: <Bell size={18}/>, title: "Notifications" },
          { icon: <Calendar size={18}/>, title: "Export Reports" },
        ].map((item, i) => (
          <div key={i} className={`flex items-center justify-between p-5 active:bg-[#F4F7F5] transition-colors ${i !== 3 ? 'border-b border-[#E9EDE9]' : ''}`}>
            <div className="flex items-center gap-4">
              <span className="text-[#7A8C7E]">{item.icon}</span>
              <span className="text-sm font-bold text-[#2D3A30]">{item.title}</span>
            </div>
            <ChevronRight size={16} className="text-[#7A8C7E]" />
          </div>
        ))}
      </div>

      <div className="px-6 flex justify-between items-center text-[#7A8C7E] text-[10px] font-bold uppercase tracking-widest mt-4">
        <span>App Version 1.4.2</span>
        <span className="text-rose-500">Logout</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#E5E7EB] font-sans">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-10 overflow-hidden">
        {}
        <div className="relative w-full max-w-[380px] h-[780px] max-h-full bg-black rounded-[3.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] border-[12px] border-slate-900 overflow-hidden ring-8 ring-white/10 flex flex-col">

          {/* Status Bar */}
          <div className="absolute top-0 left-0 right-0 h-10 flex justify-between px-10 items-center z-[60] pointer-events-none">
            <span className="text-[11px] font-bold text-[#2D3A30]/40">9:41</span>
            <div className="flex gap-1.5 opacity-30">
              <div className="w-3.5 h-3.5 rounded-full border border-slate-950"></div>
              <div className="w-3.5 h-3.5 rounded-full border border-slate-950"></div>
            </div>
          </div>

          {/* Main App Content Scroll Area */}
          <div className="flex-1 bg-[#F4F7F5] overflow-y-auto no-scrollbar pt-12 pb-24 px-6">
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'portfolio' && <PortfolioView />}
            {activeTab === 'loans' && <LoansView />}
            {activeTab === 'retirement' && <RetirementView />}
            {activeTab === 'settings' && <SettingsView />}
          </div>

          {}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-white/80 backdrop-blur-md border-t border-[#E9EDE9] px-6 flex justify-between items-center z-[70]">
            {[
              { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: '대시보드' },
              { id: 'portfolio', icon: <PieChart size={20} />, label: '포트폴리오' },
              { id: 'loans', icon: <HandCoins size={20} />, label: '대출' },
              { id: 'retirement', icon: <HeartPulse size={20} />, label: '노후' },
              { id: 'settings', icon: <Settings size={20} />, label: '설정' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${
                  activeTab === tab.id ? 'text-[#2D4F35] scale-110' : 'text-[#7A8C7E]'
                }`}
              >
                <div className={`p-1 rounded-xl transition-colors ${activeTab === tab.id ? 'bg-[#2D4F35]/10' : 'bg-transparent'}`}>
                  {tab.icon}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-tighter">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Android Home Indicator */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-28 h-1.5 rounded-full z-[80] bg-black/10"></div>
        </div>
      </div>

      <div className="bg-white p-3 text-center border-t border-slate-200">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
          하단 <span className="text-[#2D4F35]">네비게이션 탭</span>을 클릭하여 각 메뉴의 상세 레이아웃을 확인하세요.
        </p>
      </div>
    </div>
  );
};

export default App;
