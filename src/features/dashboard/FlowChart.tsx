'use client';

import { InteractivePriceChart } from '@/components/InteractivePriceChart';
import { usePortfolioFlow } from '@/hooks/usePortfolioFlow';

export function FlowChart({
  memberId = 'all',
  accountId = 'all',
}: {
  memberId?: string | 'all';
  accountId?: string | 'all';
}) {
  const rows = usePortfolioFlow(memberId, accountId);

  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-brand-line shadow-sm">
      <p className="text-xs font-bold text-brand-ink mb-2">자산 흐름</p>
      {rows.length < 2 ? (
        <p className="text-[11px] text-brand-sage font-bold py-12 text-center">
          데이터가 충분히 쌓이면 흐름이 표시됩니다
        </p>
      ) : (
        <InteractivePriceChart rows={rows} />
      )}
    </div>
  );
}
