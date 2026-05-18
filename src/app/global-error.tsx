'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * Root-level error boundary — replaces Next.js' default "Application error"
 * text page with a branded fallback. Auto-reloads with a cache-bust query
 * after a short countdown, so the typical "stale-bundle-after-deploy" case
 * recovers without user action. The user can also tap to reload manually.
 *
 * `global-error.tsx` REPLACES the root html/body, so we re-declare them here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(3);
  const isChunkError =
    /ChunkLoadError|Loading chunk \d+ failed|Loading CSS chunk|Failed to fetch dynamically imported module/i.test(
      String(error?.message || ''),
    );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          hardReload();
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function hardReload() {
    if (typeof window === 'undefined') return;
    try {
      window.location.replace(window.location.pathname + '?_v=' + Date.now());
    } catch {
      window.location.reload();
    }
  }

  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: '#F4F7F5',
            color: '#1F2A24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div style={{ maxWidth: '320px', textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 24,
                background: '#FFFFFF',
                border: '1px solid #E6EBE7',
                margin: '0 auto 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2D4F35',
              }}
            >
              <AlertTriangle size={28} />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0, marginBottom: 8 }}>
              앱을 업데이트하고 있어요
            </h1>
            <p style={{ fontSize: 13, color: '#6B7D71', margin: 0, marginBottom: 24, lineHeight: 1.55 }}>
              {isChunkError
                ? '새 버전이 배포되어 화면을 다시 불러옵니다.'
                : '일시적인 오류가 발생했어요. 다시 시도할게요.'}
              <br />
              {secondsLeft > 0 && `${secondsLeft}초 후 자동 재시도`}
            </p>
            <button
              type="button"
              onClick={() => {
                if (isChunkError) hardReload();
                else reset();
              }}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 16,
                background: '#2D4F35',
                color: 'white',
                fontWeight: 900,
                fontSize: 13,
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 8px 24px rgba(45,79,53,0.2)',
              }}
            >
              <RefreshCw size={16} /> 지금 다시 시도
            </button>
            {error?.digest && (
              <p style={{ fontSize: 10, color: '#9CB29F', marginTop: 16, fontFamily: 'monospace' }}>
                {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
