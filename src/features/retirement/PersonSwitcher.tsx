'use client';

import { Users } from 'lucide-react';
import type { FamilyMember } from '@/lib/schema';

interface Props {
  members: FamilyMember[];
  selected: string | 'all';
  onSelect: (memberId: string | 'all') => void;
}

export function PersonSwitcher({ members, selected, onSelect }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
      <Chip active={selected === 'all'} onClick={() => onSelect('all')} icon>
        전체
      </Chip>
      {members.map((m) => (
        <Chip key={m.id} active={selected === m.id} onClick={() => onSelect(m.id)}>
          {m.name}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap border ${
        active
          ? 'bg-brand text-white border-brand shadow-md'
          : 'bg-white text-brand-sage border-brand-line'
      }`}
    >
      {icon && <Users size={14} className="inline mr-1" />}
      {children}
    </button>
  );
}
