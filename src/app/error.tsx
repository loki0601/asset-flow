'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

/**
 * Segment-level error boundary. Same look-and-feel as global-error.tsx but
 * keeps the surrounding layout (BottomTabs, etc.) intact so the user can
 * navigate away if the broken page itself can't recover.
 */
export default function SegmentError({
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
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          if (isChunkError) hardReload();
          else reset();
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isChunkError, reset]);

  function hardReload() {
    if (typeof window === 'undefined') return;
    try {
      window.location.replace(window.location.pathname + '?_v=' + Date.now());
    } catch {
      window.location.reload();
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-xs w-full text-center">
        <div className="w-16 h-16 rounded-3xl bg-white border border-brand-line mx-auto mb-5 flex items-center justify-center text-brand">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-base font-black text-brand-ink mb-2">앱을 업데이트하고 있어요</h2>
        <p className="text-xs text-brand-sage leading-relaxed mb-6">
          {isChunkError
            ? '새 버전이 배포되어 화면을 다시 불러옵니다.'
            : '일시적인 오류가 발생했어요. 다시 시도할게요.'}
          <br />
          {secondsLeft > 0 && `${secondsLeft}초 후 자동 재시도`}
        </p>
        <button
          type="button"
          onClick={() => (isChunkError ? hardReload() : reset())}
          className="w-full py-3.5 rounded-2xl bg-brand text-white font-black text-sm shadow-lg shadow-brand/20 inline-flex items-center justify-center gap-2"
        >
          <RefreshCw size={16} /> 지금 다시 시도
        </button>
        {error?.digest && (
          <p className="text-[10px] text-gray-300 mt-4 font-mono">{error.digest}</p>
        )}
      </div>
    </div>
  );
}
