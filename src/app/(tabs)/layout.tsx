import { BottomTabs } from '@/components/BottomTabs';

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-surface">
      <main
        className="px-6 pt-10"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          // 7rem keeps clearance above the bottom nav (5rem) + the FAB sitting
          // above it; safe-area-inset-bottom is added because the nav now
          // extends into the gesture-bar area.
          paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))',
        }}
      >
        {children}
      </main>
      <BottomTabs />
    </div>
  );
}
