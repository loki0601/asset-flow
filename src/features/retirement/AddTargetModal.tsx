'use client';

import { useEffect, useState } from 'react';
import { X, Target, ChevronDown } from 'lucide-react';
import type { FamilyMember, RetirementTarget } from '@/lib/schema';
import { Modal } from '@/components/Modal';

export interface AddTargetInput {
  memberId: string;
  currentAge: number;
  targetAge: number;
  targetMonthly: number;
  publicEnabled: boolean;
  publicMonthly: number;
  publicStartAge: number;
  corporateEnabled: boolean;
  corporateStartAge: number;
  corporateYears: number;
  corporateAnnualRate: number;
  personalEnabled: boolean;
  personalStartAge: number;
  personalYears: number;
  personalAnnualRate: number;
  inflationAdjustEnabled: boolean;
  inflationRate: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  members: FamilyMember[];
  existing?: RetirementTarget; // pre-fill (edit mode)
  onSubmit: (input: AddTargetInput) => void;
}

const DEFAULTS = {
  publicStartAge: 65,
  corporateStartAge: 55,
  corporateYears: 10,
  corporateAnnualRate: 0.04,
  personalStartAge: 55,
  personalYears: 20,
  personalAnnualRate: 0.04,
  inflationRate: 0.025,
};

export function AddTargetModal({ open, onClose, members, existing, onSubmit }: Props) {
  const [memberId, setMemberId] = useState('');
  const [currentAge, setCurrentAge] = useState('');
  const [targetAge, setTargetAge] = useState('');
  const [targetMonthly, setTargetMonthly] = useState('');
  const [publicOn, setPublicOn] = useState(false);
  const [publicMonthly, setPublicMonthly] = useState('');
  const [publicStartAge, setPublicStartAge] = useState(String(DEFAULTS.publicStartAge));
  const [corporateOn, setCorporateOn] = useState(false);
  const [corporateStartAge, setCorporateStartAge] = useState(String(DEFAULTS.corporateStartAge));
  const [corporateYears, setCorporateYears] = useState(String(DEFAULTS.corporateYears));
  const [corporateRate, setCorporateRate] = useState(String(DEFAULTS.corporateAnnualRate * 100));
  const [personalOn, setPersonalOn] = useState(false);
  const [personalStartAge, setPersonalStartAge] = useState(String(DEFAULTS.personalStartAge));
  const [personalYears, setPersonalYears] = useState(String(DEFAULTS.personalYears));
  const [personalRate, setPersonalRate] = useState(String(DEFAULTS.personalAnnualRate * 100));
  const [inflationOn, setInflationOn] = useState(true);
  const [inflationRate, setInflationRate] = useState(String(DEFAULTS.inflationRate * 100));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setMemberId(existing.memberId);
      setCurrentAge(String(existing.currentAge));
      setTargetAge(String(existing.targetAge));
      setTargetMonthly(withCommas(String(existing.targetMonthly)));
      setPublicOn(existing.publicEnabled ?? false);
      setPublicMonthly(existing.publicMonthly ? withCommas(String(existing.publicMonthly)) : '');
      setPublicStartAge(String(existing.publicStartAge ?? DEFAULTS.publicStartAge));
      setCorporateOn(existing.corporateEnabled ?? false);
      setCorporateStartAge(String(existing.corporateStartAge ?? DEFAULTS.corporateStartAge));
      setCorporateYears(String(existing.corporateYears ?? DEFAULTS.corporateYears));
      setCorporateRate(String((existing.corporateAnnualRate ?? DEFAULTS.corporateAnnualRate) * 100));
      setPersonalOn(existing.personalEnabled ?? false);
      setPersonalStartAge(String(existing.personalStartAge ?? DEFAULTS.personalStartAge));
      setPersonalYears(String(existing.personalYears ?? DEFAULTS.personalYears));
      setPersonalRate(String((existing.personalAnnualRate ?? DEFAULTS.personalAnnualRate) * 100));
      setInflationOn(existing.inflationAdjustEnabled ?? true);
      setInflationRate(String((existing.inflationRate ?? DEFAULTS.inflationRate) * 100));
    } else {
      setMemberId(members[0]?.id ?? '');
      setCurrentAge('');
      setTargetAge('');
      setTargetMonthly('');
      setPublicOn(false);
      setPublicMonthly('');
      setPublicStartAge(String(DEFAULTS.publicStartAge));
      setCorporateOn(false);
      setCorporateStartAge(String(DEFAULTS.corporateStartAge));
      setCorporateYears(String(DEFAULTS.corporateYears));
      setCorporateRate(String(DEFAULTS.corporateAnnualRate * 100));
      setPersonalOn(false);
      setPersonalStartAge(String(DEFAULTS.personalStartAge));
      setPersonalYears(String(DEFAULTS.personalYears));
      setPersonalRate(String(DEFAULTS.personalAnnualRate * 100));
      setInflationOn(true);
      setInflationRate(String(DEFAULTS.inflationRate * 100));
    }
    setError(null);
  }, [open, members, existing]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) return setError('구성원을 선택하세요.');
    const ca = Number(currentAge);
    const ta = Number(targetAge);
    const tm = Number(targetMonthly.replaceAll(',', ''));
    const pm = Number(publicMonthly.replaceAll(',', ''));
    if (!Number.isFinite(ca) || ca <= 0) return setError('현재 나이를 입력하세요.');
    if (!Number.isFinite(ta) || ta <= 0) return setError('은퇴 목표 나이를 입력하세요.');
    if (!Number.isFinite(tm) || tm <= 0) return setError('목표 월 수령액을 입력하세요.');

    if (publicOn && (!Number.isFinite(pm) || pm <= 0)) {
      return setError('국민연금 월 예상 수령액을 입력하세요.');
    }

    onSubmit({
      memberId,
      currentAge: ca,
      targetAge: ta,
      targetMonthly: tm,
      publicEnabled: publicOn,
      publicMonthly: publicOn ? pm : 0,
      publicStartAge: Number(publicStartAge) || DEFAULTS.publicStartAge,
      corporateEnabled: corporateOn,
      corporateStartAge: Number(corporateStartAge) || DEFAULTS.corporateStartAge,
      corporateYears: Number(corporateYears) || DEFAULTS.corporateYears,
      corporateAnnualRate:
        Number.isFinite(Number(corporateRate)) ? Number(corporateRate) / 100 : DEFAULTS.corporateAnnualRate,
      personalEnabled: personalOn,
      personalStartAge: Number(personalStartAge) || DEFAULTS.personalStartAge,
      personalYears: Number(personalYears) || DEFAULTS.personalYears,
      personalAnnualRate:
        Number.isFinite(Number(personalRate)) ? Number(personalRate) / 100 : DEFAULTS.personalAnnualRate,
      inflationAdjustEnabled: inflationOn,
      inflationRate:
        Number.isFinite(Number(inflationRate)) ? Number(inflationRate) / 100 : DEFAULTS.inflationRate,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-brand-surface text-brand flex items-center justify-center">
            <Target size={18} />
          </div>
          <h2 className="text-lg font-black text-brand-ink">노후 목표 설정</h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>
      <form
        onSubmit={handleSubmit}
        className="px-6 pb-6 space-y-4 max-h-[80vh] overflow-y-auto"
      >
        <Field label="구성원">
          {members.length === 0 ? (
            <p className="text-xs font-bold text-rose-500 px-1">먼저 구성원을 추가하세요.</p>
          ) : (
            <Select
              value={memberId}
              onChange={setMemberId}
              options={members.map((m) => ({ value: m.id, label: m.name }))}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="현재 나이">
            <Input value={currentAge} onChange={setCurrentAge} placeholder="38" inputMode="numeric" />
          </Field>
          <Field label="은퇴 목표 나이">
            <Input value={targetAge} onChange={setTargetAge} placeholder="55" inputMode="numeric" />
          </Field>
        </div>

        <Field label="목표 월 수령액 (오늘 기준)">
          <Input
            value={targetMonthly}
            onChange={(v) => setTargetMonthly(withCommas(v))}
            placeholder="4,500,000"
            inputMode="numeric"
          />
        </Field>

        <ToggleSection title="국민연금" enabled={publicOn} onToggle={setPublicOn}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="월 예상 수령액">
              <Input
                value={publicMonthly}
                onChange={(v) => setPublicMonthly(withCommas(v))}
                placeholder="1,500,000"
                inputMode="numeric"
              />
            </Field>
            <Field label="수령 시작 나이">
              <Input
                value={publicStartAge}
                onChange={setPublicStartAge}
                placeholder="65"
                inputMode="numeric"
              />
            </Field>
          </div>
        </ToggleSection>

        <ToggleSection
          title="퇴직연금"
          tags={['DC', 'DB']}
          enabled={corporateOn}
          onToggle={setCorporateOn}
          subtitle="적립금·운용사·평가금액은 보유 계좌에서 자동 합산. 분할 수령 조건만 입력."
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="수령 나이">
              <Input
                value={corporateStartAge}
                onChange={setCorporateStartAge}
                placeholder="55"
                inputMode="numeric"
              />
            </Field>
            <Field label="분할 기간 (년)">
              <Input value={corporateYears} onChange={setCorporateYears} inputMode="numeric" />
            </Field>
            <Field label="예상 수익률 (%)">
              <Input value={corporateRate} onChange={setCorporateRate} inputMode="decimal" />
            </Field>
          </div>
        </ToggleSection>

        <ToggleSection
          title="개인연금"
          tags={['연금저축', 'IRP']}
          enabled={personalOn}
          onToggle={setPersonalOn}
          subtitle="적립금·운용사·평가금액은 보유 계좌에서 자동 합산. 분할 수령 조건만 입력."
        >
          <div className="grid grid-cols-3 gap-3">
            <Field label="수령 나이">
              <Input
                value={personalStartAge}
                onChange={setPersonalStartAge}
                placeholder="55"
                inputMode="numeric"
              />
            </Field>
            <Field label="분할 기간 (년)">
              <Input value={personalYears} onChange={setPersonalYears} inputMode="numeric" />
            </Field>
            <Field label="예상 수익률 (%)">
              <Input value={personalRate} onChange={setPersonalRate} inputMode="decimal" />
            </Field>
          </div>
        </ToggleSection>

        <Section title="인플레이션 보정">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-brand-sage leading-relaxed">
                목표 월 수령액을 미래 시점의 명목 금액으로 환산합니다.
                <br />
                예) 오늘 450만원 = 20년 뒤 약 737만원 (2.5% 가정)
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={inflationOn}
              onClick={() => setInflationOn((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                inflationOn ? 'bg-brand' : 'bg-gray-200'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                  inflationOn ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          {inflationOn && (
            <div className="mt-3">
              <Field label="연 인플레이션 (%)">
                <Input value={inflationRate} onChange={setInflationRate} inputMode="decimal" />
              </Field>
            </div>
          )}
        </Section>

        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

        <button
          type="submit"
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20 mt-2"
        >
          저장
        </button>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-brand-surface/50 rounded-2xl p-4 space-y-1">
      <p className="text-[10px] font-black text-brand-sage uppercase tracking-widest">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ToggleSection({
  title,
  tags,
  subtitle,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  /** Small pill labels rendered under the title (e.g. ['DC','DB']). */
  tags?: string[];
  subtitle?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-brand-surface/50 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-brand-sage uppercase tracking-widest">{title}</p>
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="text-[9px] font-bold text-brand-sage bg-white px-1.5 py-0.5 rounded-md border border-brand-line"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {subtitle && (
            <p className="text-[11px] text-brand-sage mt-1 leading-relaxed">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
            enabled ? 'bg-brand' : 'bg-gray-200'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
      {enabled && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black text-brand-sage uppercase tracking-widest">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  inputMode = 'decimal',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full bg-white px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none tabular-nums"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-brand-surface px-4 py-3 pr-10 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-sage pointer-events-none"
      />
    </div>
  );
}

function withCommas(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}
