'use client';

import { useMemo } from 'react';
import { Landmark, Building2, PiggyBank } from 'lucide-react';
import type {
  Account,
  Holding,
  MarketAsset,
  PensionCategory,
  RetirementTarget,
} from '@/lib/schema';
import {
  buildProjection,
  pensionPrincipalForMember,
  type PensionStream,
} from '@/lib/retirementPlanning';
import { formatKRW } from '@/lib/loans';

interface Props {
  target: RetirementTarget;
  accounts: Account[];
  holdings: Holding[];
  marketAsset: (symbol: string) => MarketAsset | undefined;
  fxUsdKrw: number;
}

/**
 * Pension projection for a single member: 3 cards (국민 / 퇴직 / 개인).
 * The historical-progress chart that used to live here was replaced by
 * the page-level RetirementFlowChart (daily-total curve) per the 2026-05-30
 * design pass.
 */
export function RetirementProjectionPanel({
  target,
  accounts,
  holdings,
  marketAsset,
  fxUsdKrw,
}: Props) {
  const proj = useMemo(() => {
    const principalCorporate = pensionPrincipalForMember({
      memberId: target.memberId,
      category: 'corporate',
      accounts,
      holdings,
      marketAsset,
      fxUsdKrw,
    });
    const principalPersonal = pensionPrincipalForMember({
      memberId: target.memberId,
      category: 'personal',
      accounts,
      holdings,
      marketAsset,
      fxUsdKrw,
    });
    return buildProjection({ target, principalCorporate, principalPersonal });
  }, [target, accounts, holdings, marketAsset, fxUsdKrw]);

  const anyEnabled = proj.public.enabled || proj.corporate.enabled || proj.personal.enabled;
  if (!anyEnabled) {
    return (
      <div className="bg-brand-surface/50 rounded-2xl p-5 text-center">
        <p className="text-[11px] font-bold text-brand-sage leading-relaxed">
          연금 항목이 설정되지 않았어요.
          <br />
          설정 → 노후 관리에서 국민·퇴직·개인연금을 켜고 입력하면 여기 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {proj.public.enabled && (
          <PensionCard
            stream={proj.public}
            title="국민연금"
            subtitle="종신 수령"
            icon={<Landmark size={18} />}
          />
        )}
        {proj.corporate.enabled && (
          <PensionCard
            stream={proj.corporate}
            title="퇴직연금"
            tags={['DC', 'DB']}
            subtitle="계좌 자동 합산"
            icon={<Building2 size={18} />}
          />
        )}
        {proj.personal.enabled && (
          <PensionCard
            stream={proj.personal}
            title="개인연금"
            tags={['연금저축', 'IRP']}
            subtitle="계좌 자동 합산"
            icon={<PiggyBank size={18} />}
          />
        )}
      </div>

    </div>
  );
}

function PensionCard({
  stream,
  title,
  tags,
  subtitle,
  icon,
}: {
  stream: PensionStream;
  title: string;
  tags?: string[];
  subtitle: string;
  icon: React.ReactNode;
}) {
  const lifetime = stream.endAge >= 120;
  return (
    <div className="bg-white rounded-[2rem] border border-brand-line p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-brand-sage uppercase tracking-widest">
            {subtitle}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-black text-brand-ink">{title}</p>
            {tags?.map((t) => (
              <span
                key={t}
                className="text-[9px] font-bold text-brand-sage bg-brand-surface px-1.5 py-0.5 rounded-md"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <p className="text-sm font-black text-brand-ink tabular-nums">
          ₩{formatKRW(Math.round(stream.monthlyNet))}
          <span className="text-[10px] font-bold text-brand-sage ml-1">/월 세후</span>
        </p>
      </div>
      <div className="h-px w-full bg-brand-surface mb-3" />
      <dl className="grid grid-cols-3 gap-2 text-[10px]">
        {stream.category !== 'public' && (
          <Stat label="현재 적립금" value={`₩${formatKRW(Math.round(stream.principalNow))}`} />
        )}
        {stream.category !== 'public' && (
          <Stat
            label="수령 시 적립금"
            value={`₩${formatKRW(Math.round(stream.principalAtStart))}`}
          />
        )}
        <Stat
          label="수령 기간"
          value={
            lifetime
              ? `만 ${stream.startAge}세 ~ 종신`
              : `만 ${stream.startAge}세 ~ ${stream.endAge}세`
          }
        />
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-bold text-brand-sage uppercase tracking-wider truncate">{label}</p>
      <p className="font-black text-brand-ink mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

/** Useful as a re-export so the retirement page knows the category list. */
export const PENSION_CATEGORIES: PensionCategory[] = ['public', 'corporate', 'personal'];
