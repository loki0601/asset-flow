'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { Account } from '@/lib/schema';

interface Props {
  accounts: Account[];
  /** 'all' = 계좌 전체, or a specific account.id. */
  value: string | 'all';
  onChange: (next: string | 'all') => void;
}

/** Holdings 타이틀 옆에 노출되는 계좌 선택 드롭다운.
 *  유리(blur) 효과의 미니 팝오버 안에서 단일 계좌를 고르거나
 *  '계좌 전체'로 초기화한다. accounts 가 비면 렌더하지 않는다. */
export function AccountSelector({ accounts, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (accounts.length === 0) return null;

  const selected = value === 'all' ? null : accounts.find((a) => a.id === value);
  const current = selected ? `${selected.institution} · ${selected.name}` : '계좌 전체';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-white border border-brand-line rounded-full px-3.5 py-1.5 text-xs font-bold text-brand-ink shadow-sm active:scale-[0.97] transition"
      >
        <span className="max-w-[12rem] truncate">{current}</span>
        <ChevronDown
          size={14}
          className={`text-brand-sage transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[180px] rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-xl overflow-hidden">
          <Row
            label="계좌 전체"
            active={value === 'all'}
            onClick={() => {
              onChange('all');
              setOpen(false);
            }}
          />
          {accounts.map((a) => (
            <Row
              key={a.id}
              label={`${a.institution} · ${a.name}`}
              active={value === a.id}
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-bold transition-colors ${
        active ? 'text-brand bg-white/60' : 'text-brand-ink hover:bg-white/40'
      }`}
    >
      <span className="truncate text-left">{label}</span>
      {active && <Check size={14} className="text-brand shrink-0" />}
    </button>
  );
}
