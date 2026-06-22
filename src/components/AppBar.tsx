'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings } from 'lucide-react';

/**
 * Shared top app bar for every (tabs) page: route-driven title on the left,
 * a settings entry on the right. Replaces the per-page ad-hoc top labels and
 * gives 설정 a consistent home now that it's off the bottom nav.
 */
const TITLES: { prefix: string; title: string }[] = [
  { prefix: '/dashboard', title: 'AssetFlow' },
  { prefix: '/portfolio', title: '포트폴리오' },
  { prefix: '/transactions', title: '거래' },
  { prefix: '/loans', title: '대출' },
  { prefix: '/retirement', title: '노후' },
  { prefix: '/insights', title: '인사이트' },
  { prefix: '/settings', title: '설정' },
];

export function AppBar() {
  const pathname = usePathname();
  const match = TITLES.find((t) => pathname.startsWith(t.prefix));
  const onSettings = pathname.startsWith('/settings');

  return (
    <header className="flex items-center justify-between gap-2 mb-5 min-h-[2.5rem] pt-0.5">
      {/* pr-2: the title is italic, so its right edge overhangs its box — without
          padding the slanted tail gets clipped. */}
      <h1 className="text-lg font-black italic tracking-tight text-brand-ink pr-2">
        {match?.title ?? ''}
      </h1>
      {!onSettings && (
        <Link
          href="/settings"
          aria-label="설정"
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-brand-ink active:bg-brand-surface transition-colors"
        >
          <Settings size={21} strokeWidth={2} />
        </Link>
      )}
    </header>
  );
}
