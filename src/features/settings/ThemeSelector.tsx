'use client';

import { Sun, Moon } from 'lucide-react';

export type ThemeChoice = 'light' | 'dark';

const OPTIONS: { id: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { id: 'light', label: '라이트', Icon: Sun },
  { id: 'dark', label: '다크', Icon: Moon },
];

interface Props {
  value: ThemeChoice;
  onChange: (v: ThemeChoice) => void;
}

export function ThemeSelector({ value, onChange }: Props) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm font-bold text-brand-ink mb-3">테마</p>
      <div className="flex gap-2 bg-brand-surface p-1 rounded-2xl">
        {OPTIONS.map((opt) => {
          const active = value === opt.id;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                active ? 'bg-white text-brand shadow-sm' : 'text-brand-sage'
              }`}
            >
              <Icon size={14} /> {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
