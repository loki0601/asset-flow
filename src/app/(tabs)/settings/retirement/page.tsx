'use client';

import { useEffect, useMemo, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import { Pencil, Trash2, Target } from 'lucide-react';
import type { FamilyMember, RetirementTarget } from '@/lib/schema';
import { familyRepo, retirementTargetsRepo } from '@/lib/repos';
import { useCurrentUserId } from '@/components/AuthProvider';
import { ManageHeader } from '@/components/ManageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AddTargetModal, type AddTargetInput } from '@/features/retirement/AddTargetModal';
import { formatKRW } from '@/lib/loans';

export default function RetirementManagePage() {
  const userId = useCurrentUserId();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [targets, setTargets] = useState<RetirementTarget[]>([]);
  const [targetOpen, setTargetOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<RetirementTarget | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    setMembers(familyRepo.list(userId));
    setTargets(retirementTargetsRepo.list(userId));
  }, [userId]);

  const membersById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m] as const)),
    [members],
  );

  function handleAddTarget(input: AddTargetInput) {
    if (!userId) return;
    // Replace existing target for the same member, or add new. AddTargetInput
    // already carries every settable field; we just spread it onto a stored
    // shape and let the existing repo handle the kv write.
    const existing = targets.find((t) => t.memberId === input.memberId);
    if (existing) {
      retirementTargetsRepo.update(userId, existing.id, input);
    } else {
      const target: RetirementTarget = { id: createId(), userId, ...input };
      retirementTargetsRepo.add(userId, target);
    }
    setTargets(retirementTargetsRepo.list(userId));
    setEditingTarget(undefined);
  }

  function startEditTarget(t: RetirementTarget) {
    setEditingTarget(t);
    setTargetOpen(true);
  }

  function handleRemoveTarget(id: string) {
    if (!userId) return;
    retirementTargetsRepo.remove(userId, id);
    setTargets(retirementTargetsRepo.list(userId));
  }

  return (
    <div className="pb-10">
      <ManageHeader label="Retirement" title="노후 관리" />

      <section className="mb-8">
        <div className="flex justify-between items-end mb-3 px-2">
          <h3 className="text-lg font-black italic text-brand-ink">노후 목표</h3>
          <button
            type="button"
            onClick={() => {
              setEditingTarget(undefined);
              setTargetOpen(true);
            }}
            className="text-[11px] font-black text-brand inline-flex items-center gap-1"
          >
            <Target size={14} /> 목표 추가
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
                  onClick={() => startEditTarget(t)}
                  className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center shrink-0"
                  aria-label="편집"
                >
                  <Pencil size={16} />
                </button>
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

      {/*
        "연금 상품" 수동 등록 섹션은 제거됨. 새 노후 설계에서는 보유 계좌
        (DC/DB / 연금저축 / IRP)의 holdings에서 적립금이 자동 합산되고,
        분할 시작 연도·기간·수익률·국민연금 월액은 모두 위의 "노후 목표"
        한 곳에서 입력합니다.
      */}

      <AddTargetModal
        open={targetOpen}
        onClose={() => {
          setTargetOpen(false);
          setEditingTarget(undefined);
        }}
        members={members}
        existing={editingTarget}
        onSubmit={handleAddTarget}
      />
    </div>
  );
}
