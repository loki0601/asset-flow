'use client';

import { useState } from 'react';
import { CloudUpload, CircleCheck } from 'lucide-react';
import { useCurrentUserId } from '@/components/AuthProvider';
import { uploadBackup } from '@/lib/backup';
import { listUsers } from '@/lib/auth';

/**
 * Manual one-shot server backup. Uploads the current sql.js blob with
 * user id + timestamp to /api/backup. Shows an XHR-driven progress bar
 * during upload so the user sees real movement on multi-MB blobs — the
 * earlier version only flashed a pulse icon, which looked frozen on
 * slower network paths.
 */
export function ServerBackupRow() {
  const userId = useCurrentUserId();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [lastSize, setLastSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!userId || busy) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const username = listUsers().find((u) => u.id === userId)?.username ?? null;
      const ack = await uploadBackup({
        userId,
        username,
        onProgress: (frac) => setProgress(frac),
      });
      setProgress(1);
      setLastAt(ack.createdAt);
      setLastSize(ack.blobSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || !userId}
      className="w-full flex items-center gap-4 p-5 active:bg-brand-surface transition-colors disabled:opacity-60"
    >
      <div className="w-10 h-10 bg-brand-surface rounded-2xl flex items-center justify-center text-brand shrink-0">
        <CloudUpload size={20} className={busy ? 'animate-pulse' : ''} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-bold text-brand-ink">서버 백업</p>
        <p className="text-[11px] text-brand-sage mt-0.5 truncate">
          {busy
            ? `업로드 중 ${Math.round(progress * 100)}%`
            : error
              ? `실패: ${error.slice(0, 60)}`
              : lastAt
                ? `마지막 백업 ${formatRelative(lastAt)}${lastSize ? ` · ${formatBytes(lastSize)}` : ''}`
                : '디바이스 DB를 서버에 저장'}
        </p>
        {busy && (
          <div className="mt-2 h-1.5 rounded-full bg-brand-line overflow-hidden">
            <div
              className="h-full bg-brand transition-[width] duration-150"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </div>
      {!busy && lastAt && !error && (
        <CircleCheck size={18} className="text-brand shrink-0" />
      )}
    </button>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.round((now - then) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return new Date(iso).toISOString().slice(0, 10);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
