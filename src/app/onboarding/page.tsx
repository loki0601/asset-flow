'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import { useCurrentUserId } from '@/components/AuthProvider';
import { useHoldingsData } from '@/components/HoldingsDataProvider';
import { accountsRepo, familyRepo } from '@/lib/repos';
import { INSTITUTIONS, type InstitutionKind } from '@/lib/institutions';
import type { Account, FamilyMember } from '@/lib/schema';

/**
 * Two-step first-run wizard:
 *   1. Member name — minimum unit-of-ownership, required by the auth gate.
 *   2. First account — institution + label so the user can immediately
 *      start adding holdings without bouncing into settings.
 *
 * The user can skip step 2 (account); accounts are addable from settings
 * later anyway.  The auth gate in AuthProvider only enforces members, so
 * after step 1 finishes the only thing keeping us here is the wizard's
 * own internal state.
 */
type Step = 'member' | 'account';

export default function OnboardingPage() {
  const router = useRouter();
  const userId = useCurrentUserId();
  const { refresh: refreshHoldingsData } = useHoldingsData();
  const [step, setStep] = useState<Step>('member');
  const [createdMemberId, setCreatedMemberId] = useState<string | null>(null);

  // If the user already finished step 1 in a prior session (members exist
  // but they backed out before adding an account), skip straight to step 2.
  useEffect(() => {
    if (!userId) return;
    const members = familyRepo.list(userId);
    if (members.length > 0) {
      setCreatedMemberId(members[0].id);
      setStep('account');
    }
  }, [userId]);

  function done() {
    refreshHoldingsData();
    router.replace('/');
  }

  return (
    <main
      className="min-h-screen bg-brand-surface flex flex-col px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 4rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)',
      }}
    >
      <StepDots step={step} />
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
        {step === 'member' && (
          <MemberStep
            userId={userId}
            onCreated={(id) => {
              setCreatedMemberId(id);
              setStep('account');
            }}
          />
        )}
        {step === 'account' && (
          <AccountStep
            userId={userId}
            memberId={createdMemberId}
            onCreated={done}
            onSkip={done}
          />
        )}
      </div>
    </main>
  );
}

function StepDots({ step }: { step: Step }) {
  const isActive = (s: Step) => s === step;
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <Dot active={isActive('member')} />
      <Dot active={isActive('account')} />
    </div>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      className={`block rounded-full transition-all ${
        active ? 'w-6 h-2 bg-brand' : 'w-2 h-2 bg-brand-line'
      }`}
    />
  );
}

function MemberStep({
  userId,
  onCreated,
}: {
  userId: string | null;
  onCreated: (memberId: string) => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = name.trim();
    if (!cleaned) return setError('이름을 입력해 주세요');
    if (!userId) return setError('세션이 만료됐어요. 다시 로그인해 주세요.');
    setSubmitting(true);
    try {
      const member: FamilyMember = {
        id: createId(),
        userId,
        name: cleaned,
        createdAt: new Date().toISOString(),
      };
      familyRepo.add(userId, member);
      onCreated(member.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <p className="text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
        시작하기 1/2
      </p>
      <h1 className="text-3xl font-black text-brand-ink mb-2">먼저 이름부터</h1>
      <p className="text-sm text-brand-sage font-medium mb-10 leading-relaxed">
        자산 정보는 구성원 단위로 관리해요. 본인 이름으로 첫 구성원을 만들어
        시작하고, 가족 자산도 함께 관리하려면 설정에서 추가하면 돼요.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-[11px] font-black text-brand-sage uppercase tracking-wider">
            본인 이름
          </span>
          <input
            type="text"
            autoFocus
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 이영록"
            className="mt-1.5 w-full rounded-2xl bg-white border border-brand-line px-4 py-3 text-[15px] font-bold text-brand-ink outline-none focus:border-brand"
            required
            minLength={1}
            maxLength={30}
          />
        </label>
        {error && (
          <p className="text-[12px] font-bold text-brand-up bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full rounded-2xl bg-brand text-white py-3.5 text-[15px] font-black shadow-md disabled:opacity-60 mt-2"
        >
          {submitting ? '저장 중…' : '다음'}
        </button>
      </form>
    </>
  );
}

const KIND_LABELS: Record<InstitutionKind, string> = {
  증권사: '증권사',
  연금기관: '연금기관 (IRP/연금보험)',
  코인거래소: '코인거래소',
};
const KIND_ORDER: InstitutionKind[] = ['증권사', '연금기관', '코인거래소'];

function AccountStep({
  userId,
  memberId,
  onCreated,
  onSkip,
}: {
  userId: string | null;
  memberId: string | null;
  onCreated: () => void;
  onSkip: () => void;
}) {
  const [institution, setInstitution] = useState(INSTITUTIONS[0]?.name ?? '');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId || !memberId) {
      return setError('세션이 만료됐어요. 다시 로그인해 주세요.');
    }
    if (!institution) return setError('증권사·거래소를 선택하세요.');
    const cleaned = name.trim();
    if (!cleaned) return setError('계좌 이름을 입력하세요.');

    setSubmitting(true);
    try {
      const account: Account = {
        id: createId(),
        userId,
        memberId,
        institution,
        name: cleaned,
        createdAt: new Date().toISOString(),
      };
      accountsRepo.add(userId, account);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <p className="text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
        시작하기 2/2
      </p>
      <h1 className="text-3xl font-black text-brand-ink mb-2">첫 계좌 등록</h1>
      <p className="text-sm text-brand-sage font-medium mb-10 leading-relaxed">
        매수할 종목은 계좌 단위로 보관해요. 가장 자주 사용하는 증권사 또는
        거래소를 골라 첫 계좌를 만들고, 다른 계좌는 설정에서 추가하세요.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-[11px] font-black text-brand-sage uppercase tracking-wider">
            증권사·거래소
          </span>
          <select
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            className="mt-1.5 w-full rounded-2xl bg-white border border-brand-line px-4 py-3 text-[15px] font-bold text-brand-ink outline-none focus:border-brand appearance-none"
          >
            {KIND_ORDER.map((kind) => {
              const items = INSTITUTIONS.filter((i) => i.kind === kind);
              if (items.length === 0) return null;
              return (
                <optgroup key={kind} label={KIND_LABELS[kind]}>
                  {items.map((i) => (
                    <option key={i.name} value={i.name}>
                      {i.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-black text-brand-sage uppercase tracking-wider">
            계좌 이름
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 종합매매 / IRP / 현물"
            className="mt-1.5 w-full rounded-2xl bg-white border border-brand-line px-4 py-3 text-[15px] font-bold text-brand-ink outline-none focus:border-brand"
            required
            minLength={1}
            maxLength={30}
          />
        </label>
        {error && (
          <p className="text-[12px] font-bold text-brand-up bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !name.trim() || !institution}
          className="w-full rounded-2xl bg-brand text-white py-3.5 text-[15px] font-black shadow-md disabled:opacity-60 mt-2"
        >
          {submitting ? '저장 중…' : '시작하기'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full py-2 text-[12px] font-black text-brand-sage hover:text-brand-ink"
        >
          나중에 — 설정에서 추가할게요
        </button>
      </form>
    </>
  );
}
