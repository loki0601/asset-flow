'use client';

import { useEffect, useState } from 'react';
import { X, Users } from 'lucide-react';
import { Modal } from '@/components/Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export function AddMemberModal({ open, onClose, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('이름을 입력하세요.');
    onSubmit(trimmed);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-brand-surface text-brand flex items-center justify-center">
            <Users size={18} />
          </div>
          <h2 className="text-lg font-black text-brand-ink">구성원 추가</h2>
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
        <label className="block">
          <span className="text-[10px] font-black text-brand-sage uppercase tracking-widest">이름</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 배우자"
            className="mt-1.5 w-full bg-brand-surface px-4 py-3 rounded-2xl text-sm font-bold text-brand-ink focus:outline-none"
          />
        </label>
        {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
        <button
          type="submit"
          className="w-full py-4 rounded-2xl text-sm font-black text-white bg-brand shadow-lg shadow-brand/20"
        >
          추가
        </button>
      </form>
    </Modal>
  );
}
