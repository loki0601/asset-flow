'use client';

import { useEffect, useMemo, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import { Plus, Trash2, HeartPulse, Target } from 'lucide-react';
import type { FamilyMember, Pension, RetirementTarget } from '@/lib/schema';
import { familyRepo, pensionsRepo, retirementTargetsRepo } from '@/lib/repos';
import { useCurrentUserId } from '@/components/AuthProvider';
import { ManageHeader } from '@/components/ManageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AddTargetModal, type AddTargetInput } from '@/features/retirement/AddTargetModal';
import { AddPensionModal, type AddPensionInput } from '@/features/retirement/AddPensionModal';
import { formatKRW } from '@/lib/loans';

export default function RetirementManagePage() {
  const userId = useCurrentUserId();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [pensions, setPensions] = useState<Pension[]>([]);
  const [targets, setTargets] = useState<RetirementTarget[]>([]);
  const [targetOpen, setTargetOpen] = useState(false);
  const [pensionOpen, setPensionOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setMembers(familyRepo.list(userId));
    setPensions(pensionsRepo.list(userId));
    setTargets(retirementTargetsRepo.list(userId));
  }, [userId]);

  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m] as const)),
    [members],
  );

  function handleAddTarget(input: AddTargetInput) {
    if (!userId) return;
    // Replace existing target for the same member, or add new
    const existing = targets.find((t) => t.memberId === input.memberId);
    if (existing) {
      retirementTargetsRepo.update(userId, existing.id, input);
    } else {
      const target: RetirementTarget = { id: createId(), userId, ...input };
      retirementTargetsRepo.add(userId, target);
    }
    setTargets(retirementTargetsRepo.list(userId));
  }

  function handleRemoveTarget(id: string) {
    if (!userId) return;
    retirementTargetsRepo.remove(userId, id);
    setTargets(retirementTargetsRepo.list(userId));
  }

  function handleAddPension(input: AddPensionInput) {
    if (!userId) return;
    const base = {
      id: createId(),
      userId,
      memberId: input.memberId,
      type: input.type,
      title: input.title,
      createdAt: new Date().toISOString(),
    };
    let pension: Pension;
    if (input.category === 'public') {
      pension = {
        ...base,
        category: 'public',
        monthlyAmount: input.monthlyAmount,
        payPeriod: input.payPeriod,
        startYear: input.startYear,
      };
    } else if (input.category === 'corporate') {
      pension = {
        ...base,
        category: 'corporate',
        institution: input.institution,
        totalValue: input.totalValue,
        yield: input.yield,
      };
    } else {
      pension = {
        ...base,
        category: 'personal',
        institution: input.institution,
        totalValue: input.totalValue,
        annualContribution: input.annualContribution,
        taxBenefit: input.taxBenefit,
      };
    }
    pensionsRepo.add(userId, pension);
    setPensions(pensionsRepo.list(userId));
  }

  function handleRemovePension(id: string) {
    if (!userId) return;
    pensionsRepo.remove(userId, id);
    setPensions(pensionsRepo.list(userId));
  }

  return (
    <div className="pb-10">
      <ManageHeader label="Retirement" title="노후 관리" />

      <section className="mb-8">
        <div className="flex justify-between items-end mb-3 px-2">
          <h3 className="text-lg font-black italic text-brand-ink">노후 목표</h3>
          <button
            type="button"
            onClick={() => setTargetOpen(true)}
            className="text-[11px] font-black text-brand inline-flex items-center gap-1"
          >
            <Plus size={14} /> 목표 추가
          </button>
        </div>

        {targets.length === 0 ? (
          <EmptyState
            icon={Target}
            title="목표가 설정되지 않았어요"
            description="구성원별로 은퇴 목표를 등록하세요."
          />
        ) : (
          <div className="space-y-3">
            {targets.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-[24px] border border-gray-100 p-5 flex items-center gap-3 shadow-sm"
              >
                <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
                  <Target size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-brand-sage uppercase tracking-tighter truncate">
                    {membersById[t.memberId]?.name ?? '?'}
                  </p>
                  <p className="text-sm font-black text-brand-ink">
                    만 {t.targetAge}세 · 월 {formatKRW(t.targetMonthly)}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveTarget(t.id)}
                  className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0"
                  aria-label="삭제"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex justify-between items-end mb-3 px-2">
          <h3 className="text-lg font-black italic text-brand-ink">연금 상품</h3>
          <button
            type="button"
            onClick={() => setPensionOpen(true)}
            className="text-[11px] font-black text-brand inline-flex items-center gap-1"
          >
            <Plus size={14} /> 연금 추가
          </button>
        </div>

        {pensions.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title="등록된 연금이 없어요"
            description="국민·퇴직·개인연금을 추가하세요."
          />
        ) : (
          <div className="space-y-3">
            {pensions.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-[24px] border border-gray-100 p-5 flex items-center gap-3 shadow-sm"
              >
                <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
                  <HeartPulse size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-brand-sage uppercase tracking-tighter truncate">
                    {p.type} · {membersById[p.memberId]?.name ?? '?'}
                  </p>
                  <p className="text-sm font-black text-brand-ink truncate">{p.title}</p>
                </div>
                <button
                  onClick={() => handleRemovePension(p.id)}
                  className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0"
                  aria-label="삭제"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <AddTargetModal
        open={targetOpen}
        onClose={() => setTargetOpen(false)}
        members={members}
        onSubmit={handleAddTarget}
      />
      <AddPensionModal
        open={pensionOpen}
        onClose={() => setPensionOpen(false)}
        members={members}
        onSubmit={handleAddPension}
      />
    </div>
  );
}
