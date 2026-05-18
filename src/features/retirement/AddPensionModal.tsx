'use client';

import { useEffect, useState } from 'react';
import { X, HeartPulse, ChevronDown } from 'lucide-react';
import type { FamilyMember, PensionCategory } from '@/lib/schema';
import { Modal } from '@/components/Modal';

const CATEGORIES: { value: PensionCategory; label: string }[] = [
  { value: 'public', label: '국민연금' },
  { value: 'corporate', label: '퇴직연금' },
  { value: 'personal', label: '개인연금' },
];

export type AddPensionInput =
  | {
      category: 'public';
      memberId: string;
      type: string;
      title: string;
      monthlyAmount: number;
      payPeriod: string;
      startYear: string;
    }
  | {
      category: 'corporate';
      memberId: string;
      type: string;
      title: string;
      institution: string;
      totalValue: number;
      yield: number;
    }
  | {
      category: 'personal';
      memberId: string;
      type: string;
      title: string;
      institution?: string;
      totalValue: number;
      annualContribution: number;
      taxBenefit: number;
    };

interface Props {
  open: boolean;
  onClose: () => void;
  members: FamilyMember[];
  onSubmit: (input: AddPensionInput) => void;
}

export function AddPensionModal({ open, onClose, members, onSubmit }: Props) {
  const [memberId, setMemberId] = useState('');
  const [category, setCategory] = useState<PensionCategory>('public');
  const [type, setType] = useState('국민연금');
  const [title, setTitle] = useState('');
  const [institution, setInstitution] = useState('');
  // Numeric inputs as strings
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [payPeriod, setPayPeriod] = useState('');
  const [startYear, setStartYear] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [yld, setYld] = useState('');
  const [annual, setAnnual] = useState('');
  const [taxBenefit, setTaxBenefit] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMemberId(members[0]?.id ?? '');
      setCategory('public');
      setType('국민연금');
      setTitle('');
      setInstitution('');
      setMonthlyAmount('');
      setPayPeriod('');
      setStartYear('');
      setTotalValue('');
      setYld('');
      setAnnual('');
      setTaxBenefit('');
      setError(null);
    }
  }, [open, members]);

  useEffect(() => {
    // Pre-fill type label per category for convenience
    if (category === 'public') setType('국민연금');
    else if (category === 'corporate') setType('DC형 퇴직연금');
    else setType('연금저축계좌');
  }, [category]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) return setError('구성원을 선택하세요.');
    if (!title.trim()) return setError('상품명을 입력하세요.');

    if (category === 'public') {
      const m = Number(monthlyAmount.replaceAll(',', ''));
      if (!Number.isFinite(m) || m <= 0) return setError('예상 월 수령액을 입력하세요.');
      onSubmit({
        category: 'public',
        memberId,
        type,
        title: title.trim(),
        monthlyAmount: m,
        payPeriod: payPeriod.trim(),
        startYear: startYear.trim(),
      });
    } else if (category === 'corporate') {
      const tv = Number(totalValue.replaceAll(',', ''));
      const y = Number(yld);
      if (!Number.isFinite(tv) || tv <= 0) return setError('현재 평가액을 입력하세요.');
      if (!Number.isFinite(y)) return setError('수익률을 입력하세요.');
      onSubmit({
        category: 'corporate',
        memberId,
        type,
        title: title.trim(),
        institution: institution.trim(),
        totalValue: tv,
        yield: y,
      });
    } else {
      const tv = Number(totalValue.replaceAll(',', ''));
      const a = Number(annual.replaceAll(',', ''));
      const tb = Number(taxBenefit.replaceAll(',', ''));
      if (!Number.isFinite(tv) || tv <= 0) return setError('현재 평가액을 입력하세요.');
      onSubmit({
        category: 'personal',
        memberId,
        type,
        title: title.trim(),
        institution: institution.trim() || undefined,
        totalValue: tv,
        annualContribution: Number.isFinite(a) ? a : 0,
        taxBenefit: Number.isFinite(tb) ? tb : 0,
      });
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-brand-surface text-brand flex items-center justify-center">
            <HeartPulse size={18} />
          </div>
          <h2 className="text-lg font-black text-brand-ink">연금 추가</h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
        <Field label="구성원">
          {members.length === 0 ? (
            <p className="text-xs font-bold text-rose-500 px-1">먼저 가족 구성원을 추가하세요.</p>
          ) : (
            <Select
              value={memberId}
              onChange={setMemberId}
              options={members.map((m) => ({ value: m.id, label: m.name }))}
            />
          )}
        </Field>
        <Field label="구분">
          <Select
            value={category}
            onChange={(v) => setCategory(v as PensionCategory)}
            options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />
        </Field>
        <Field label="상품명">
          <Text value={title} onChange={setTitle} placeholder="예: 노령연금 (예상)" />
        </Field>

        {category === 'public' ? (
          <>
            <Field label="예상 월 수령액">
              <Text value={monthlyAmount} onChange={setMonthlyAmount} placeholder="1,450,000" inputMode="decimal" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="납부 기간">
                <Text value={payPeriod} onChange={setPayPeriod} placeholder="156개월 납부 중" />
              </Field>
              <Field label="수령 시작">
                <Text value={startYear} onChange={setStartYear} placeholder="2051년 수령 예정" />
              </Field>
            </div>
          </>
        ) : category === 'corporate' ? (
          <>
            <Field label="운용사">
              <Text value={institution} onChange={setInstitution} placeholder="예: 미래에셋증권" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="현재 평가액">
                <Text value={totalValue} onChange={setTotalValue} placeholder="84,500,000" inputMode="decimal" />
              </Field>
              <Field label="수익률 (%)">
                <Text value={yld} onChange={setYld} placeholder="5.8" inputMode="decimal" />
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label="기관 (선택)">
              <Text value={institution} onChange={setInstitution} placeholder="예: 신한투자증권" />
            </Field>
            <Field label="현재 평가액">
              <Text value={totalValue} onChange={setTotalValue} placeholder="42,000,000" inputMode="decimal" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="연 납입액">
                <Text value={annual} onChange={setAnnual} placeholder="6,000,000" inputMode="decimal" />
              </Field>
              <Field label="세액 공제 (원)">
                <Text value={taxBenefit} onChange={setTaxBenefit} placeholder="924,000" inputMode="decimal" />
              </Field>
            </div>
          </>
        )}

        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

        <button
          type="submit"
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20 mt-2"
        >
          연금 추가
        </button>
      </form>
    </Modal>
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

function Text({
  value,
  onChange,
  placeholder,
  inputMode,
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
      className="w-full bg-brand-surface px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none tabular-nums"
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
