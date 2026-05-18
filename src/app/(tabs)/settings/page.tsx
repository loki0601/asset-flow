'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleUser, ChevronRight, CreditCard, HandCoins, HeartPulse, Users, X } from 'lucide-react';
import { ToggleRow } from '@/features/settings/ToggleRow';
import { setAggregateView } from '@/lib/userSettings';
import { useAggregateView } from '@/hooks/useAggregateView';
import { ThemeSelector, type ThemeChoice } from '@/features/settings/ThemeSelector';
import { CatalogSyncRow } from '@/features/settings/CatalogSyncRow';
import { PriceSyncRow } from '@/features/settings/PriceSyncRow';
import { ServerBackupRow } from '@/features/settings/ServerBackupRow';
import { FxRateCard } from '@/features/settings/FxRateCard';
import { useCurrentUserId } from '@/components/AuthProvider';
import { listUsers } from '@/lib/auth';
import { familyRepo } from '@/lib/repos';
import { Modal } from '@/components/Modal';

const APP_VERSION = '0.1.0';

export default function SettingsPage() {
  const userId = useCurrentUserId();
  const [username, setUsername] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [notifications, setNotifications] = useState(true);
  const [theme, setTheme] = useState<ThemeChoice>('light');
  const aggregateView = useAggregateView();
  const [needMembersOpen, setNeedMembersOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setUsername(listUsers().find((u) => u.id === userId)?.username ?? '');
    setMemberCount(familyRepo.list(userId).length);
  }, [userId]);

  const requiresMember = memberCount === 0;

  function handleGuardedClick(e: React.MouseEvent) {
    if (requiresMember) {
      e.preventDefault();
      setNeedMembersOpen(true);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
        Profile
      </p>

      <button
        type="button"
        className="text-left bg-white rounded-[32px] border border-gray-100 p-5 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-all"
      >
        <div className="w-14 h-14 bg-brand rounded-full flex items-center justify-center text-white shadow-md shadow-brand/20 shrink-0">
          <CircleUser size={28} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-brand-ink truncate">{username || '사용자'} 님</p>
          <p className="text-[11px] text-brand-sage truncate">로그인 됨</p>
        </div>
        <ChevronRight size={18} className="text-gray-300 shrink-0" />
      </button>

      <section>
        <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
          환율
        </p>
        <FxRateCard />
      </section>

      <section>
        <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
          Manage
        </p>
        <div className="bg-white rounded-[32px] border border-gray-100 divide-y divide-gray-100 shadow-sm overflow-hidden">
          <ManageRow
            href="/settings/members"
            icon={<Users size={20} />}
            title="가족 구성원"
            description="구성원 추가·이름 변경"
          />
          <ManageRow
            href="/settings/accounts"
            icon={<CreditCard size={20} />}
            title="계좌 관리"
            description="증권·연금·코인·은행 등 통합 관리"
            onClick={handleGuardedClick}
          />
          <ManageRow
            href="/settings/loans"
            icon={<HandCoins size={20} />}
            title="대출 관리"
            description="대출 잔액·금리·만기 등록"
            onClick={handleGuardedClick}
          />
          <ManageRow
            href="/settings/retirement"
            icon={<HeartPulse size={20} />}
            title="노후 관리"
            description="목표·연금 상품 입력"
            onClick={handleGuardedClick}
          />
        </div>
      </section>

      <section>
        <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
          Data
        </p>
        <div className="bg-white rounded-[32px] border border-gray-100 divide-y divide-gray-100 shadow-sm overflow-hidden">
          <CatalogSyncRow />
          <PriceSyncRow />
          <ServerBackupRow />
        </div>
      </section>

      <section>
        <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
          Preferences
        </p>
        <div className="bg-white rounded-[32px] border border-gray-100 divide-y divide-gray-100 shadow-sm">
          <ToggleRow
            label="알림"
            description="가격 변동·주요 이벤트 알림"
            checked={notifications}
            onChange={setNotifications}
          />
          <ToggleRow
            label="모아보기"
            description="대시보드·포트폴리오에서 같은 종목을 합쳐서 표시"
            checked={aggregateView}
            onChange={setAggregateView}
          />
          <ThemeSelector value={theme} onChange={setTheme} />
        </div>
      </section>

      <div className="px-6 flex justify-between items-center text-brand-sage text-[10px] font-bold uppercase tracking-widest mt-2">
        <span>App Version {APP_VERSION}</span>
        <button className="text-rose-500">Logout</button>
      </div>

      <NeedMemberModal open={needMembersOpen} onClose={() => setNeedMembersOpen(false)} />
    </div>
  );
}

function ManageRow({
  href,
  icon,
  title,
  description,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-4 p-5 active:bg-brand-surface transition-colors"
    >
      <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-brand-ink">{title}</p>
        <p className="text-[11px] text-brand-sage mt-0.5 truncate">{description}</p>
      </div>
      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </Link>
  );
}

function NeedMemberModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();

  function handleAdd() {
    onClose();
    router.push('/settings/members');
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-brand-surface text-brand flex items-center justify-center">
            <Users size={18} />
          </div>
          <h2 className="text-lg font-black text-brand-ink">가족 구성원이 필요해요</h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-6 pb-6">
        <p className="text-sm text-brand-ink/80 mb-5 leading-relaxed">
          계좌·대출·노후 정보는 가족 구성원 단위로 관리됩니다. 먼저 가족 구성원을 한 명 이상 등록해 주세요.
        </p>
        <button
          type="button"
          onClick={handleAdd}
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20"
        >
          구성원 추가하러 가기
        </button>
      </div>
    </Modal>
  );
}
