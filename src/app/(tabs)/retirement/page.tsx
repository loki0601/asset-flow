'use client';

import { useEffect, useMemo, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import type {
  FamilyMember,
  Pension,
  RetirementProfile,
  RetirementTarget,
} from '@/lib/schema';
import { familyRepo, pensionsRepo, retirementTargetsRepo } from '@/lib/repos';
import { aggregateProfiles } from '@/lib/retirement';
import { PersonSwitcher } from '@/features/retirement/PersonSwitcher';
import { RetirementSummaryCard } from '@/features/retirement/RetirementSummaryCard';
import { PensionCard } from '@/features/retirement/PensionCard';
import { EmptyState } from '@/components/EmptyState';
import { useCurrentUserId } from '@/components/AuthProvider';

function expectedMonthlyFor(pensions: Pension[]): number {
  // Currently: count only public pensions' monthlyAmount as guaranteed income.
  return pensions.reduce(
    (s, p) => s + (p.category === 'public' ? p.monthlyAmount : 0),
    0,
  );
}

function profileFor(
  member: FamilyMember,
  pensions: Pension[],
  targets: RetirementTarget[],
): RetirementProfile {
  const myPensions = pensions.filter((p) => p.memberId === member.id);
  const target = targets.find((t) => t.memberId === member.id);
  return {
    name: member.name,
    targetAge: target?.targetAge ?? 0,
    currentAge: target?.currentAge ?? 0,
    targetMonthly: target?.targetMonthly ?? 0,
    expectedMonthly: expectedMonthlyFor(myPensions),
    pensions: myPensions,
  };
}

export default function RetirementPage() {
  const userId = useCurrentUserId();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [pensions, setPensions] = useState<Pension[]>([]);
  const [targets, setTargets] = useState<RetirementTarget[]>([]);
  const [selected, setSelected] = useState<string | 'all'>('all');

  useEffect(() => {
    if (!userId) return;
    setMembers(familyRepo.list(userId));
    setPensions(pensionsRepo.list(userId));
    setTargets(retirementTargetsRepo.list(userId));
  }, [userId]);

  const profile: RetirementProfile = useMemo(() => {
    if (selected === 'all') {
      return aggregateProfiles(members.map((m) => profileFor(m, pensions, targets)));
    }
    const m = members.find((mm) => mm.id === selected);
    if (!m) return { name: '', targetAge: 0, currentAge: 0, targetMonthly: 0, expectedMonthly: 0, pensions: [] };
    return profileFor(m, pensions, targets);
  }, [selected, members, pensions, targets]);

  return (
    <div className="pb-10">
      <p className="px-2 text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-2">
        Retirement Plan
      </p>
      <RetirementSummaryCard profile={profile} />

      <PersonSwitcher members={members} selected={selected} onSelect={setSelected} />

      <h3 className="text-lg font-black italic text-brand-ink tracking-tight mb-4 mt-6 px-2">
        Pension Portfolios
      </h3>

      {profile.pensions.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="등록된 연금이 없어요"
          description="설정 → 노후 관리에서 추가하세요."
        />
      ) : (
        <div className="space-y-6">
          {profile.pensions.map((pension) => (
            <PensionCard key={pension.id} pension={pension} />
          ))}
        </div>
      )}
    </div>
  );
}
