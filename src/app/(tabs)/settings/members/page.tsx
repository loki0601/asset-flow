'use client';

import { useEffect, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import type { FamilyMember } from '@/lib/schema';
import { familyRepo } from '@/lib/repos';
import { useCurrentUserId } from '@/components/AuthProvider';
import { ManageHeader } from '@/components/ManageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AddMemberModal } from '@/features/family/AddMemberModal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { deleteMember } from '@/lib/ledgerOps';

const DELETE_BLOCKED: Record<'has-accounts' | 'has-loans' | 'last-member', string> = {
  'has-accounts': '이 구성원의 계좌가 남아 있어요. 계좌를 다른 구성원으로 옮기거나 삭제한 뒤 다시 시도해 주세요.',
  'has-loans': '이 구성원의 대출이 남아 있어요. 대출을 삭제한 뒤 다시 시도해 주세요.',
  'last-member': '구성원은 최소 1명이 있어야 해요.',
};

export default function MembersPage() {
  const userId = useCurrentUserId();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState<FamilyMember | null>(null);
  const [removing, setRemoving] = useState<FamilyMember | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setMembers(familyRepo.list(userId));
  }, [userId]);

  function handleAdd(name: string) {
    if (!userId) return;
    const member: FamilyMember = {
      id: createId(),
      userId,
      name,
      createdAt: new Date().toISOString(),
    };
    familyRepo.add(userId, member);
    setMembers(familyRepo.list(userId));
  }

  function handleRename(name: string) {
    if (!userId || !renaming) return;
    familyRepo.update(userId, renaming.id, { name });
    setMembers(familyRepo.list(userId));
  }

  function handleRemove(member: FamilyMember) {
    if (!userId) return;
    const result = deleteMember(userId, member.id);
    setError(result.ok ? null : DELETE_BLOCKED[result.reason]);
    setMembers(familyRepo.list(userId));
  }

  return (
    <div className="pb-10">
      <ManageHeader label="Members" title="구성원" />

      {members.length === 0 ? (
        <div className="mb-4">
          <EmptyState
            icon={Users}
            title="등록된 구성원이 없어요"
            description="아래 + 구성원 추가로 첫 구성원을 등록하세요."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded-[24px] border border-gray-100 p-5 flex items-center gap-3 shadow-sm"
            >
              <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
                <Users size={20} />
              </div>
              <p className="flex-1 text-sm font-black text-brand-ink truncate">{m.name}</p>
              <button
                onClick={() => setRenaming(m)}
                className="w-9 h-9 rounded-full bg-brand-surface text-brand flex items-center justify-center"
                aria-label="이름 변경"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => setRemoving(m)}
                className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center"
                aria-label="삭제"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs font-bold text-rose-500 mt-3 px-2">{error}</p>}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="w-full bg-brand text-white rounded-[24px] py-4 flex items-center justify-center gap-2 font-black text-sm shadow-md shadow-brand/20 mt-4"
      >
        <Plus size={18} /> 구성원 추가
      </button>

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <AddMemberModal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        onSubmit={handleRename}
        initialName={renaming?.name ?? ''}
      />
      <ConfirmModal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && handleRemove(removing)}
        title={`${removing?.name ?? ''} 님을 삭제할까요?`}
        body="이 구성원의 노후 목표도 함께 삭제됩니다."
        confirmLabel="삭제"
        destructive
      />
    </div>
  );
}
