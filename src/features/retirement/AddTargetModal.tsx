'use client';

import { useEffect, useState } from 'react';
import { X, Target, ChevronDown } from 'lucide-react';
import type { FamilyMember } from '@/lib/schema';
import { Modal } from '@/components/Modal';

export interface AddTargetInput {
  memberId: string;
  targetAge: number;
  currentAge: number;
  targetMonthly: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  members: FamilyMember[];
  onSubmit: (input: AddTargetInput) => void;
}

export function AddTargetModal({ open, onClose, members, onSubmit }: Props) {
  const [memberId, setMemberId] = useState('');
  const [targetAge, setTargetAge] = useState('');
  const [currentAge, setCurrentAge] = useState('');
  const [targetMonthly, setTargetMonthly] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMemberId(members[0]?.id ?? '');
      setTargetAge('');
      setCurrentAge('');
      setTargetMonthly('');
      setError(null);
    }
  }, [open, members]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) return setError('구성원을 선택하세요.');
    const ta = Number(targetAge);
    const ca = Number(currentAge);
    const tm = Number(targetMonthly.replaceAll(',', ''));
    if (!Number.isFinite(ta) || ta <= 0) return setError('은퇴 목표 나이를 입력하세요.');
    if (!Number.isFinite(ca) || ca <= 0) return setError('현재 나이를 입력하세요.');
    if (!Number.isFinite(tm) || tm <= 0) return setError('목표 월 수령액을 입력하세요.');
    onSubmit({ memberId, targetAge: ta, currentAge: ca, targetMonthly: tm });
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
      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
        <Field label="구성원">
          {members.length === 0 ? (
            <p className="text-xs font-bold text-rose-500 px-1">먼저 가족 구성원을 추가하세요.</p>
          ) : (
            <div className="relative">
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full appearance-none bg-brand-surface px-4 py-3 pr-10 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-sage pointer-events-none"
              />
            </div>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="현재 나이">
            <Input value={currentAge} onChange={setCurrentAge} placeholder="38" />
          </Field>
          <Field label="목표 은퇴 나이">
            <Input value={targetAge} onChange={setTargetAge} placeholder="62" />
          </Field>
        </div>
        <Field label="목표 월 수령액">
          <Input value={targetMonthly} onChange={setTargetMonthly} placeholder="4,500,000" />
        </Field>
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
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode="decimal"
      className="w-full bg-brand-surface px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none tabular-nums"
    />
  );
}
