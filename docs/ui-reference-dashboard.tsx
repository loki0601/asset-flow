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
  ArrowRightLeft,
  Users,
  TrendingDown
} from 'lucide-react';

const MOCK_DATA = {
  total: "₩124,950,500",
  changeAmt: "+₩1,240,000",
  changePct: "+1.2%",
  family: ['전체', '나', '배우자', '첫째'],
  holdings: [
    { name: '삼성전자', total: '₩45,200,000', change: '+₩450,000', pct: '+1.0%', qty: '600주', color: '#2D4F35' },
    { name: 'S&P 500 ETF', total: '₩32,500,000', change: '+₩840,000', pct: '+2.6%', qty: '120주', color: '#4A7256' },
    { name: '비트코인', total: '₩12,450,000', change: '-₩120,000', pct: '-0.9%', qty: '0.15개', color: '#7A8C7E' },
    { name: '애플', total: '₩15,800,000', change: '+₩320,000', pct: '+2.1%', qty: '55주', color: '#8BA18E' },
  ],
  graphData: {
    '1M': [30, 45, 35, 55, 48, 62],
    '3M': [20, 38, 45, 42, 58, 65],
    '6M': [15, 25, 40, 35, 50, 70],
    '1Y': [10, 30, 25, 45, 55, 80]
  },
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
  const [selectedFamily, setSelectedFamily] = useState('전체');
  const [timeRange, setTimeRange] = useState('1M');

  const DashboardView = () => (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
      {/* Family Filter Area */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
        {MOCK_DATA.family.map(member => (
          <button
            key={member}
            onClick={() => setSelectedFamily(member)}
            className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
              selectedFamily === member
                ? 'bg-[#2D4F35] text-white border-[#2D4F35] shadow-md'
                : 'bg-white text-[#7A8C7E] border-[#E9EDE9]'
            }`}
          >
            {member === '전체' ? <Users size={14} className="inline mr-1" /> : null}
            {member}
          </button>
        ))}
      </div>

      {/* Total Asset Hero */}
      <div className="px-2">
        <div className="flex justify-between items-start mb-1">
          <p className="text-[#7A8C7E] text-[10px] font-bold uppercase tracking-[0.2em]">Total Balance</p>
          <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-full shadow-sm border border-[#E9EDE9]">
            <TrendingUp size={12} className="text-[#2D4F35]" />
            <span className="text-[10px] font-black text-[#2D4F35]">{MOCK_DATA.changePct}</span>
          </div>
        </div>
        <h1 className="text-3xl font-black text-[#2D3A30] tracking-tight">{MOCK_DATA.total}</h1>
        <p className="text-[#2D4F35] text-xs font-bold mt-1 opacity-70">
          전일 대비 <span className="font-black">{MOCK_DATA.changeAmt}</span>
        </p>
      </div>

      {/* Asset Flow Graph Area */}
      <div className="bg-white p-6 rounded-[2.5rem] border border-[#E9EDE9] shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <p className="text-xs font-bold text-[#2D3A30]">자산 흐름</p>
          <div className="flex bg-[#F4F7F5] p-1 rounded-xl">
            {['1M', '3M', '6M', '1Y'].map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-[10px] font-black rounded-lg transition-all ${
                  timeRange === range ? 'bg-white text-[#2D4F35] shadow-sm' : 'text-[#7A8C7E]'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Simple SVG Chart Representation */}
        <div className="h-32 w-full mt-4 relative">
          <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
            <defs>
              <linearGradient id="gradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2D4F35" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#2D4F35" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`M0,40 L0,${40 - MOCK_DATA.graphData[timeRange][0]}
                 C20,${40 - MOCK_DATA.graphData[timeRange][1]} 40,${40 - MOCK_DATA.graphData[timeRange][2]} 60,${40 - MOCK_DATA.graphData[timeRange][3]}
                 C80,${40 - MOCK_DATA.graphData[timeRange][4]} 90,${40 - MOCK_DATA.graphData[timeRange][5]} 100,${40 - MOCK_DATA.graphData[timeRange][5]}
                 L100,40 Z`}
              fill="url(#gradient)"
            />
            <path
              d={`M0,${40 - MOCK_DATA.graphData[timeRange][0]}
                 C20,${40 - MOCK_DATA.graphData[timeRange][1]} 40,${40 - MOCK_DATA.graphData[timeRange][2]} 60,${40 - MOCK_DATA.graphData[timeRange][3]}
                 C80,${40 - MOCK_DATA.graphData[timeRange][4]} 90,${40 - MOCK_DATA.graphData[timeRange][5]} 100,${40 - MOCK_DATA.graphData[timeRange][5]}`}
              fill="none"
              stroke="#2D4F35"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute top-0 right-0 w-2 h-2 bg-[#2D4F35] rounded-full border-2 border-white shadow-md"></div>
        </div>
      </div>

      <div className="px-2">
        <div className="flex justify-between items-end mb-4">
          <h3 className="font-black text-[#2D3A30] text-lg italic">Holdings</h3>
          <span className="text-[10px] font-bold text-[#7A8C7E] uppercase tracking-widest border-b border-[#E9EDE9] pb-1">View All</span>
        </div>

        <div className="grid gap-4">
          {MOCK_DATA.holdings.map((item, i) => (
            <div key={i} className="bg-white p-5 rounded-[2rem] border border-[#E9EDE9] hover:shadow-md transition-all active:scale-[0.98]">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white" style={{backgroundColor: item.color}}>
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <h4 className="font-black text-[#2D3A30] text-sm">{item.name}</h4>
                    <p className="text-[10px] font-bold text-[#7A8C7E] uppercase tracking-tighter">Quantity: {item.qty}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-[#2D3A30] text-sm">{item.total}</p>
                </div>
              </div>
              <div className="h-[1px] w-full bg-[#F4F7F5] mb-4"></div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-black p-1.5 px-3 rounded-xl ${item.pct.startsWith('+') ? 'bg-[#2D4F35]/10 text-[#2D4F35]' : 'bg-rose-50 text-rose-500'}`}>
                    {item.pct}
                  </span>
                </div>
                <div className="text-right">
                  <p className={`text-[10px] font-black ${item.pct.startsWith('+') ? 'text-[#2D4F35]' : 'text-rose-500'}`}>
                    {item.change}
                  </p>
                </div>
              </div>
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
          {MOCK_DATA.holdings.slice(0,3).map((asset, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white" style={{backgroundColor: asset.color}}>
                <PieChart size={18} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-end mb-1">
                  <p className="text-sm font-bold text-[#2D3A30]">{asset.name}</p>
                  <p className="text-sm font-bold text-[#2D3A30]">{(33-i*5)}%</p>
                </div>
                <div className="h-1.5 w-full bg-[#F4F7F5] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{width: `${33-i*5}%`, backgroundColor: asset.color}}></div>
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
        <div className="relative w-full max-w-[380px] h-[780px] max-h-full bg-black rounded-[3.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] border-[12px] border-slate-900 overflow-hidden ring-8 ring-white/10 flex flex-col">

          {/* Status Bar */}
          <div className="absolute top-0 left-0 right-0 h-10 flex justify-between px-10 items-center z-[60] pointer-events-none">
            <span className="text-[11px] font-bold text-[#2D3A30]/40">9:41</span>
            <div className="flex gap-1.5 opacity-30">
              <div className="w-3.5 h-3.5 rounded-full border border-slate-950"></div>
              <div className="w-3.5 h-3.5 rounded-full border border-slate-950"></div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-[#F4F7F5] overflow-y-auto no-scrollbar pt-12 pb-24 px-6">
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'portfolio' && <PortfolioView />}
            {activeTab === 'loans' && <LoansView />}
            {activeTab === 'retirement' && <RetirementView />}
            {activeTab === 'settings' && <SettingsView />}
          </div>

          {/* Navigation Bar */}
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
          개편된 <span className="text-[#2D4F35]">대시보드 레이아웃</span>을 확인해 보세요. 상단 필터와 그래프 기간 선택이 가능합니다.
        </p>
      </div>
    </div>
  );
};

export default App;
