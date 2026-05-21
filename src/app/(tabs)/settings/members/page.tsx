'use client';

import { useEffect, useState } from 'react';
import { createId } from '@paralleldrive/cuid2';
import { Plus, Trash2, Users } from 'lucide-react';
import type { FamilyMember } from '@/lib/schema';
import { familyRepo } from '@/lib/repos';
import { useCurrentUserId } from '@/components/AuthProvider';
import { ManageHeader } from '@/components/ManageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AddMemberModal } from '@/features/family/AddMemberModal';

export default function MembersPage() {
  const userId = useCurrentUserId();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [addOpen, setAddOpen] = useState(false);

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

  function handleRemove(id: string) {
    if (!userId) return;
    familyRepo.remove(userId, id);
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
                onClick={() => handleRemove(m.id)}
                className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center"
                aria-label="삭제"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="w-full bg-brand text-white rounded-[24px] py-4 flex items-center justify-center gap-2 font-black text-sm shadow-md shadow-brand/20 mt-4"
      >
        <Plus size={18} /> 구성원 추가
      </button>

      <AddMemberModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
    </div>
  );
}
