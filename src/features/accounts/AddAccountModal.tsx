'use client';

import { useEffect, useState } from 'react';
import { X, CreditCard, ChevronDown } from 'lucide-react';
import type { FamilyMember } from '@/lib/schema';
import { INSTITUTIONS, type InstitutionKind } from '@/lib/institutions';
import { Modal } from '@/components/Modal';

export interface AddAccountInput {
  memberId: string;
  institution: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  members: FamilyMember[];
  onSubmit: (input: AddAccountInput) => void;
}

const KIND_LABELS: Record<InstitutionKind, string> = {
  증권사: '증권사',
  연금기관: '연금기관 (IRP/연금보험)',
  코인거래소: '코인거래소',
};

const KIND_ORDER: InstitutionKind[] = ['증권사', '연금기관', '코인거래소'];

export function AddAccountModal({ open, onClose, members, onSubmit }: Props) {
  const [memberId, setMemberId] = useState('');
  const [institution, setInstitution] = useState(INSTITUTIONS[0]?.name ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMemberId(members[0]?.id ?? '');
      setInstitution(INSTITUTIONS[0]?.name ?? '');
      setName('');
      setError(null);
    }
  }, [open, members]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) return setError('구성원을 선택하세요.');
    if (!institution) return setError('증권사·거래소를 선택하세요.');
    if (!name.trim()) return setError('계좌 이름을 입력하세요.');

    setError(null);
    onSubmit({ memberId, institution, name: name.trim() });
    setName('');
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-brand-surface text-brand flex items-center justify-center">
            <CreditCard size={18} />
          </div>
          <h2 className="text-lg font-black text-brand-ink">계좌 추가</h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-brand-surface text-brand-sage flex items-center justify-center"
          aria-label="닫기"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
        <Field label="소유자">
          <SelectField
            value={memberId}
            onChange={setMemberId}
            options={members.map((m) => ({ value: m.id, label: m.name }))}
          />
        </Field>

        <Field label="증권사·거래소">
          <GroupedInstitutionSelect value={institution} onChange={setInstitution} />
        </Field>

        <Field label="계좌 이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 메인, ISA, 장기투자"
            className="w-full bg-brand-surface px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none"
          />
        </Field>

        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

        <button
          type="submit"
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20"
        >
          계좌 추가
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

function GroupedInstitutionSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-brand-surface px-4 py-3 pr-10 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none"
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
      <ChevronDown
        size={16}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-sage pointer-events-none"
      />
    </div>
  );
}
