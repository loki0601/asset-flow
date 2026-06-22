'use client';

import { useEffect, useMemo, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import type {
  Account,
  FamilyMember,
  Holding,
  RetirementTarget,
} from '@/lib/schema';
import {
  accountsRepo,
  familyRepo,
  holdingsRepo,
  retirementTargetsRepo,
} from '@/lib/repos';
import { PersonSwitcher } from '@/features/retirement/PersonSwitcher';
import { RetirementSummaryCard } from '@/features/retirement/RetirementSummaryCard';
import { RetirementFlowChart } from '@/features/retirement/RetirementFlowChart';
import { RetirementProjectionPanel } from '@/features/retirement/RetirementProjectionPanel';
import { EmptyState } from '@/components/EmptyState';
import { useCurrentUserId, useMarketDataKey } from '@/components/AuthProvider';
import { getMarketAsset } from '@/lib/market';
import { getFxRate } from '@/lib/fx';
import {
  buildProjection,
  pensionPrincipalForMember,
} from '@/lib/retirementPlanning';

/** Per-member projection summary used by the top RetirementSummaryCard.
 *  expectedMonthly = sum of enabled streams at the earliest receipt age.
 *  targetMonthly = inflation-adjusted goal if the user opted in.
 */
function summaryFor(args: {
  target: RetirementTarget;
  accounts: Account[];
  holdings: Holding[];
  fxUsdKrw: number;
}): { expectedMonthly: number; targetMonthly: number } {
  const principalCorporate = pensionPrincipalForMember({
    memberId: args.target.memberId,
    category: 'corporate',
    accounts: args.accounts,
    holdings: args.holdings,
    marketAsset: getMarketAsset,
    fxUsdKrw: args.fxUsdKrw,
  });
  const principalPersonal = pensionPrincipalForMember({
    memberId: args.target.memberId,
    category: 'personal',
    accounts: args.accounts,
    holdings: args.holdings,
    marketAsset: getMarketAsset,
    fxUsdKrw: args.fxUsdKrw,
  });
  const proj = buildProjection({
    target: args.target,
    principalCorporate,
    principalPersonal,
  });
  // Sum every enabled stream's monthly regardless of when each kicks in —
  // the summary describes the user's expected income at FULL retirement
  // (all streams active), not the moment of the earliest receipt.
  const expectedMonthly =
    (proj.public.enabled ? proj.public.monthlyNet : 0) +
    (proj.corporate.enabled ? proj.corporate.monthlyNet : 0) +
    (proj.personal.enabled ? proj.personal.monthlyNet : 0);
  return {
    expectedMonthly: Math.round(expectedMonthly),
    targetMonthly: Math.round(proj.inflatedMonthlyTargetAtStart),
  };
}

export default function RetirementPage() {
  const userId = useCurrentUserId();
  const marketKey = useMarketDataKey();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [targets, setTargets] = useState<RetirementTarget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [selected, setSelected] = useState<string | 'all'>('all');

  useEffect(() => {
    if (!userId) return;
    setMembers(familyRepo.list(userId));
    setTargets(retirementTargetsRepo.list(userId));
    setAccounts(accountsRepo.list(userId));
    setHoldings(holdingsRepo.list(userId));
    // marketKey changes when prices/catalog sync — re-pulling triggers a
    // recompute with fresh currentPrice values.
  }, [userId, marketKey]);

  const fxUsdKrw = useMemo(() => getFxRate('USDKRW'), [marketKey]);

  const planningMembers = useMemo(() => {
    const withTarget = new Set(targets.map((t) => t.memberId));
    return members.filter((m) => withTarget.has(m.id));
  }, [members, targets]);

  useEffect(() => {
    if (selected !== 'all' && !planningMembers.some((m) => m.id === selected)) {
      setSelected('all');
    }
  }, [planningMembers, selected]);

  // Top summary: aggregate across selected planning members.
  const summary = useMemo(() => {
    const visible =
      selected === 'all' ? planningMembers : planningMembers.filter((m) => m.id === selected);
    let expectedMonthly = 0;
    let targetMonthly = 0;
    let name = '';
    if (visible.length === 1) name = visible[0].name;
    else if (visible.length > 1) name = '전체';
    for (const m of visible) {
      const target = targets.find((t) => t.memberId === m.id);
      if (!target) continue;
      const s = summaryFor({ target, accounts, holdings, fxUsdKrw });
      expectedMonthly += s.expectedMonthly;
      targetMonthly += s.targetMonthly;
    }
    return {
      name,
      expectedMonthly,
      targetMonthly,
      targetAge: 0,
      currentAge: 0,
      pensions: [],
    };
  }, [selected, planningMembers, targets, accounts, holdings, fxUsdKrw]);

  return (
    <div className="pb-10">
      <RetirementSummaryCard profile={summary} />

      <div className="mt-6">
        <RetirementFlowChart selected={selected} />
      </div>

      <PersonSwitcher members={planningMembers} selected={selected} onSelect={setSelected} />

      <h3 className="text-lg font-black italic text-brand-ink tracking-tight mb-4 mt-6 px-2">
        Pension Projections
      </h3>

      {planningMembers.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="설정된 노후 목표가 없어요"
          description="설정 → 노후 관리에서 구성원별 목표를 등록하세요."
        />
      ) : (
        <div className="space-y-8">
          {(selected === 'all' ? planningMembers : planningMembers.filter((m) => m.id === selected))
            .map((m) => {
              const target = targets.find((t) => t.memberId === m.id);
              if (!target) return null;
              return (
                <section key={m.id} className="space-y-3">
                  {selected === 'all' && (
                    <p className="px-2 text-sm font-black text-brand-ink">{m.name}</p>
                  )}
                  <RetirementProjectionPanel
                    target={target}
                    accounts={accounts}
                    holdings={holdings}
                    marketAsset={getMarketAsset}
                    fxUsdKrw={fxUsdKrw}
                  />
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
