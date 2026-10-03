'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleUser, ChevronRight, CreditCard, HandCoins, HeartPulse, Trash2, Users } from 'lucide-react';
import { ToggleRow } from '@/features/settings/ToggleRow';
import { setAggregateView } from '@/lib/userSettings';
import { useAggregateView } from '@/hooks/useAggregateView';
import { ThemeSelector } from '@/features/settings/ThemeSelector';
import { useTheme } from '@/hooks/useTheme';
import { CatalogSyncRow } from '@/features/settings/CatalogSyncRow';
import { PriceSyncRow } from '@/features/settings/PriceSyncRow';
import { ServerBackupRow } from '@/features/settings/ServerBackupRow';
import { FxRateCard } from '@/features/settings/FxRateCard';
import { useCurrentUserId } from '@/components/AuthProvider';
import { getServerSession } from '@/lib/auth';
import { profileLabel } from '@/lib/accountLabel';
import { familyRepo } from '@/lib/repos';
import { Modal } from '@/components/Modal';
import { ModalHeader } from '@/components/ModalHeader';
import { ConfirmModal } from '@/components/ConfirmModal';

const APP_VERSION = '0.1.0';

export default function SettingsPage() {
  const userId = useCurrentUserId();
  const [memberName, setMemberName] = useState<string | undefined>(undefined);
  const [memberCount, setMemberCount] = useState(0);
  const [notifications, setNotifications] = useState(true);
  const { theme, setTheme } = useTheme();
  const aggregateView = useAggregateView();
  const [needMembersOpen, setNeedMembersOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const members = familyRepo.list(userId);
    setMemberName(members[0]?.name);
    setMemberCount(members.length);
  }, [userId]);

  const requiresMember = memberCount === 0;
  const profile = profileLabel(memberName, getServerSession()?.user.username ?? '');

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
          <p className="text-base font-black text-brand-ink truncate">{profile.name} 님</p>
          <p className="text-[11px] text-brand-sage truncate">{profile.subtitle}</p>
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
            title="구성원"
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
          <ResetLocalDbButton />
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

      <div className="px-6 flex justify-center items-center text-brand-sage text-[10px] font-bold uppercase tracking-widest mt-2">
        <span>App Version {APP_VERSION}</span>
      </div>

      <NeedMemberModal open={needMembersOpen} onClose={() => setNeedMembersOpen(false)} />
    </div>
  );
}

function ResetLocalDbButton() {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  async function performReset() {
    setBusy(true);
    const { clearLocalDb } = await import('@/lib/db');
    await clearLocalDb();
    // Hard reload so AuthProvider re-boots against the empty store.
    window.location.replace('/login');
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="w-full flex items-center gap-4 p-5 active:bg-brand-surface transition-colors disabled:opacity-60 text-left"
      >
        <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 shrink-0">
          <Trash2 size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-rose-500">로컬 DB 초기화</p>
          <p className="text-[11px] text-brand-sage mt-0.5">
            {busy ? '초기화 중…' : '테스트용 — 디바이스의 모든 데이터 삭제 후 로그인으로'}
          </p>
        </div>
      </button>
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={performReset}
        title="로컬 DB 를 초기화할까요?"
        body={
          '구성원·계좌·보유 종목·대출·노후 정보 모두 삭제됩니다.\n서버 백업과 카탈로그는 그대로 유지됩니다.'
        }
        confirmLabel="초기화"
        destructive
      />
    </>
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
      <ModalHeader
        icon={
          <div className="w-10 h-10 rounded-2xl bg-brand-surface text-brand flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
        }
        title="구성원이 필요해요"
        onClose={onClose}
      />
      <div className="px-6 pb-6">
        <p className="text-sm text-brand-ink/80 mb-5 leading-relaxed">
          계좌·대출·노후 정보는 구성원 단위로 관리됩니다. 먼저 구성원을 한 명 이상 등록해 주세요.
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
