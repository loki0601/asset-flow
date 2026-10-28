'use client';

import { useEffect, useState } from 'react';
import { CreditCard, ChevronDown, Trash2 } from 'lucide-react';
import type { Account, FamilyMember } from '@/lib/schema';
import { INSTITUTIONS, type InstitutionKind } from '@/lib/institutions';
import { Modal } from '@/components/Modal';
import { ModalHeader } from '@/components/ModalHeader';
import { ConfirmModal } from '@/components/ConfirmModal';

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
  /** Edit mode: prefill from this account and offer deletion. */
  initial?: Account | null;
  onDelete?: () => void;
  deleteError?: string | null;
}

const KIND_LABELS: Record<InstitutionKind, string> = {
  증권사: '증권사',
  연금기관: '연금기관 (IRP/연금보험)',
  코인거래소: '코인거래소',
};

const KIND_ORDER: InstitutionKind[] = ['증권사', '연금기관', '코인거래소'];

export function AddAccountModal({ open, onClose, members, onSubmit, initial, onDelete, deleteError }: Props) {
  const [memberId, setMemberId] = useState('');
  const [institution, setInstitution] = useState(INSTITUTIONS[0]?.name ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isEdit = Boolean(initial);

  useEffect(() => {
    if (open) {
      const ownerExists = initial && members.some((m) => m.id === initial.memberId);
      setMemberId(ownerExists ? initial.memberId : (members[0]?.id ?? ''));
      setInstitution(initial?.institution ?? INSTITUTIONS[0]?.name ?? '');
      setName(initial?.name ?? '');
      setError(null);
    }
  }, [open, members, initial]);

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
      <ModalHeader
        icon={
          <div className="w-10 h-10 rounded-2xl bg-brand-surface text-brand flex items-center justify-center shrink-0">
            <CreditCard size={20} />
          </div>
        }
        title={isEdit ? '계좌 수정' : '계좌 추가'}
        onClose={onClose}
      />

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

        {(error ?? deleteError) && <p className="text-xs font-bold text-rose-500">{error ?? deleteError}</p>}

        <button
          type="submit"
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20"
        >
          {isEdit ? '저장' : '계좌 추가'}
        </button>

        {isEdit && onDelete && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-50 text-rose-500 text-sm font-bold"
          >
            <Trash2 size={16} />
            계좌 삭제
          </button>
        )}
      </form>

      {onDelete && (
        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={onDelete}
          title="이 계좌를 삭제할까요?"
          body={'계좌의 거래 내역도 함께 삭제됩니다.\n보유 종목이 남아 있으면 먼저 매도하거나 거래를 삭제해 주세요.'}
          confirmLabel="삭제"
          destructive
        />
      )}
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
