'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PieChart,
  ArrowLeftRight,
  HandCoins,
  HeartPulse,
  Lightbulb,
} from 'lucide-react';

// 설정 lives in the top AppBar (gear icon) — not the bottom nav.
const TABS = [
  { href: '/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { href: '/portfolio', icon: PieChart, label: '포트폴리오' },
  { href: '/transactions', icon: ArrowLeftRight, label: '거래' },
  { href: '/loans', icon: HandCoins, label: '대출' },
  { href: '/retirement', icon: HeartPulse, label: '노후' },
  { href: '/insights', icon: Lightbulb, label: '인사이트' },
] as const;

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-t border-brand-line px-6 flex justify-between items-center"
      style={{
        height: 'calc(5rem + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${
              active ? 'text-brand scale-110' : 'text-brand-sage'
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${active ? 'bg-brand/10' : 'bg-transparent'}`}>
              <Icon size={20} />
            </div>
            <span className="text-[9px] font-bold uppercase tracking-tighter">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
