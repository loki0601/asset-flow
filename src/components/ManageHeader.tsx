import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function ManageHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 px-2">
      <Link
        href="/settings"
        className="w-9 h-9 rounded-full bg-white border border-gray-100 flex items-center justify-center text-brand-sage"
        aria-label="뒤로"
      >
        <ChevronLeft size={20} />
      </Link>
      <div>
        <p className="text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em]">{label}</p>
        <h1 className="text-2xl font-black text-brand-ink tracking-tight">{title}</h1>
      </div>
    </div>
  );
}
