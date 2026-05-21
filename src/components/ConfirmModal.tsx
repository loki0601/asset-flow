'use client';

import { Modal } from '@/components/Modal';

interface Props {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (rose) — for delete/reset flows. */
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Branded confirmation dialog — replacement for `window.confirm()` so the
 * native browser/WebView popup doesn't break visual consistency on Android.
 */
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = '확인',
  cancelLabel = '취소',
  destructive,
  onConfirm,
  onClose,
}: Props) {
  function handleConfirm() {
    onClose();
    // Defer the action so the close animation can start before the caller
    // does whatever heavy work it's confirming.
    setTimeout(onConfirm, 0);
  }
  return (
    <Modal open={open} onClose={onClose}>
      <div className="px-6 pt-6 pb-3">
        <h2 className="text-base font-black text-brand-ink mb-2">{title}</h2>
        {body && (
          <p className="text-[13px] text-brand-sage leading-relaxed whitespace-pre-line">
            {body}
          </p>
        )}
      </div>
      <div className="px-6 pb-6 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-2xl py-3 text-sm font-black text-brand-ink bg-brand-surface border border-brand-line"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className={`flex-1 rounded-2xl py-3 text-sm font-black text-white shadow-md ${
            destructive ? 'bg-rose-500 shadow-rose-500/20' : 'bg-brand shadow-brand/20'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
