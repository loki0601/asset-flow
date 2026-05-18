import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'Asset Flow',
  description: 'Family asset management',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#F4F7F5', // brand-surface — matches the app background so the
                         // status bar blends in.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // honor env(safe-area-inset-*) on edge-to-edge devices
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
