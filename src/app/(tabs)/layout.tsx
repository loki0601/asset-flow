import { AppBar } from '@/components/AppBar';
import { BottomTabs } from '@/components/BottomTabs';

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-surface">
      <main
        className="px-6 pt-10"
        style={{
          // max(): some Android WebViews report safe-area-inset-top as 0 even
          // with overlay:true, which let the app bar sit under the status bar.
          // Floor it at 1.25rem so the header always clears the status bar.
          paddingTop: 'calc(max(env(safe-area-inset-top), 1.25rem) + 1rem)',
          // 7rem keeps clearance above the bottom nav (5rem) + the FAB sitting
          // above it; safe-area-inset-bottom is added because the nav now
          // extends into the gesture-bar area.
          paddingBottom: 'calc(7rem + env(safe-area-inset-bottom))',
        }}
      >
        <AppBar />
        {children}
      </main>
      <BottomTabs />
    </div>
  );
}
