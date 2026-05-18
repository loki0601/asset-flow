'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, HandCoins, ChevronDown } from 'lucide-react';
import type { FamilyMember, LoanMethod } from '@/lib/schema';
import { Modal } from '@/components/Modal';
import { formatKRW, monthlyLoanPayment, remainingLoanBalance } from '@/lib/loans';

const METHODS: LoanMethod[] = ['원리금균등상환', '원금균등상환', '만기일시상환'];

export interface AddLoanInput {
  memberId: string;
  name: string;
  bank: string;
  totalAmount: number;
  remainingAmount: number;
  rate: number;
  method: LoanMethod;
  startDate: string;
  maturityDate: string;
  paymentDay: number;
  monthlyEst: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  members: FamilyMember[];
  onSubmit: (input: AddLoanInput) => void;
}

/** "1234567" → "1,234,567"; keeps trailing dot/blank intact so the input stays editable. */
function withCommas(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}

/** Add `years` (integer) to a YYYY-MM-DD date string. Returns YYYY-MM-DD. */
function addYears(isoDate: string, years: number): string {
  if (!isoDate || !Number.isFinite(years)) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

export function AddLoanModal({ open, onClose, members, onSubmit }: Props) {
  const [memberId, setMemberId] = useState('');
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [rateStr, setRateStr] = useState('');
  const [method, setMethod] = useState<LoanMethod>('원리금균등상환');
  const [startDate, setStartDate] = useState('');
  const [termYearsStr, setTermYearsStr] = useState('');
  const [paymentDayStr, setPaymentDayStr] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMemberId(members[0]?.id ?? '');
      setName('');
      setBank('');
      setTotalStr('');
      setRateStr('');
      setMethod('원리금균등상환');
      setStartDate('');
      setTermYearsStr('');
      setPaymentDayStr('');
      setError(null);
    }
  }, [open, members]);

  // Derived fields — both the monthly payment and the current remaining
  // balance fall out of the contract terms + how long it has been running.
  // No need to ask the user for either.
  const principal = Number(totalStr.replaceAll(',', ''));
  const rate = Number(rateStr);
  const years = Number(termYearsStr);
  const totalMonths = Number.isFinite(years) && years > 0 ? Math.round(years * 12) : 0;

  const monthlyEstimate = useMemo(() => {
    if (!Number.isFinite(principal) || principal <= 0) return 0;
    if (!Number.isFinite(rate) || rate < 0) return 0;
    if (totalMonths <= 0) return 0;
    return monthlyLoanPayment(method, principal, rate, totalMonths);
  }, [principal, rate, totalMonths, method]);

  const monthsPaid = useMemo(() => {
    if (!startDate) return 0;
    const [y, m, d] = startDate.split('-').map(Number);
    if (!y || !m || !d) return 0;
    const start = new Date(Date.UTC(y, m - 1, d));
    const now = new Date();
    // Whole months elapsed since startDate, clamped to non-negative.
    const months =
      (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - start.getUTCMonth()) -
      (now.getUTCDate() < d ? 1 : 0);
    return Math.max(0, months);
  }, [startDate]);

  const remainingEstimate = useMemo(() => {
    if (!Number.isFinite(principal) || principal <= 0) return 0;
    if (!Number.isFinite(rate) || rate < 0) return 0;
    if (totalMonths <= 0) return principal;
    return remainingLoanBalance(method, principal, rate, totalMonths, monthsPaid);
  }, [principal, rate, totalMonths, method, monthsPaid]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) return setError('구성원을 선택하세요.');
    if (!name.trim()) return setError('대출 이름을 입력하세요.');
    if (!bank.trim()) return setError('금융기관을 입력하세요.');
    const paymentDay = Number(paymentDayStr);
    if (!Number.isFinite(principal) || principal <= 0) return setError('총 대출액을 입력하세요.');
    if (!Number.isFinite(rate) || rate < 0) return setError('금리를 입력하세요.');
    if (!Number.isFinite(paymentDay) || paymentDay < 1 || paymentDay > 31) return setError('납부일은 1~31 사이입니다.');
    if (!startDate) return setError('시작일을 선택하세요.');
    if (totalMonths <= 0) return setError('만기(년)를 입력하세요.');

    const maturityDate = addYears(startDate, Math.round(years));
    if (!maturityDate) return setError('만기일 계산에 실패했어요.');

    onSubmit({
      memberId,
      name: name.trim(),
      bank: bank.trim(),
      totalAmount: principal,
      remainingAmount: Math.round(remainingEstimate),
      rate,
      method,
      startDate,
      maturityDate,
      paymentDay,
      monthlyEst: Math.round(monthlyEstimate),
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-brand-surface text-brand flex items-center justify-center">
            <HandCoins size={18} />
          </div>
          <h2 className="text-lg font-black text-brand-ink">대출 추가</h2>
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
        <Field label="차주">
          {members.length === 0 ? (
            <p className="text-xs font-bold text-rose-500 px-1">설정 → 가족 구성원에서 먼저 추가하세요.</p>
          ) : (
            <SelectField
              value={memberId}
              onChange={setMemberId}
              options={members.map((m) => ({ value: m.id, label: m.name }))}
            />
          )}
        </Field>

        <Field label="대출 이름">
          <Text value={name} onChange={setName} placeholder="예: 주택담보대출" />
        </Field>

        <Field label="금융기관">
          <Text value={bank} onChange={setBank} placeholder="예: 우리은행" />
        </Field>

        <Field label="총 대출액">
          <Text
            value={totalStr}
            onChange={(v) => setTotalStr(withCommas(v))}
            placeholder="0"
            inputMode="numeric"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="연 금리 (%)">
            <Text value={rateStr} onChange={setRateStr} placeholder="3.5" inputMode="decimal" />
          </Field>
          <Field label="납부일 (매월 N일)">
            <Text value={paymentDayStr} onChange={setPaymentDayStr} placeholder="15" inputMode="numeric" />
          </Field>
        </div>

        <Field label="상환 방식">
          <SelectField
            value={method}
            onChange={(v) => setMethod(v as LoanMethod)}
            options={METHODS.map((m) => ({ value: m, label: m }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="시작일">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-brand-surface px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none tabular-nums"
            />
          </Field>
          <Field label="만기 (년)">
            <Text
              value={termYearsStr}
              onChange={(v) => setTermYearsStr(v.replace(/[^\d]/g, ''))}
              placeholder="예: 30"
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="bg-brand-surface/70 rounded-2xl divide-y divide-white">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[10px] font-black text-brand-sage uppercase tracking-widest">
              월 예상 납부액
            </span>
            <span className="text-sm font-black text-brand-ink tabular-nums">
              {monthlyEstimate > 0 ? `₩${formatKRW(monthlyEstimate)}` : '—'}
            </span>
          </div>
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-[10px] font-black text-brand-sage uppercase tracking-widest">
              현재 남은 금액
            </span>
            <span className="text-sm font-black text-brand-ink tabular-nums">
              {remainingEstimate > 0 || principal > 0 ? `₩${formatKRW(remainingEstimate)}` : '—'}
            </span>
          </div>
        </div>

        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

        <button
          type="submit"
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20 mt-2"
        >
          대출 추가
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

function SelectField({
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
