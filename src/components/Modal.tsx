'use client';

import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Override max-width if a particular modal needs a different size. */
  maxWidthClass?: string;
  /**
   * Pin the modal to a fixed full-available-height instead of letting it grow
   * with content. Default false (content-sized, bottom-anchored). Use for
   * list/search modals (e.g. AssetPicker) so the size doesn't jump as the
   * result count changes.
   */
  fillHeight?: boolean;
}

/**
 * Shared modal wrapper for the app.
 *
 * Position invariants for ALL modals:
 * - bottom edge anchored at 6rem (96px) — a little above the `h-20` bottom
 *   tab bar (80px) + a 16px gap. THIS IS THE FIXED ANCHOR.
 * - top edge grows naturally with content (auto), capped at 7vh so it never
 *   collides with the status bar / header on very tall content.
 * - horizontally centered via left:50% + translateX(-50%).
 *
 * IMPORTANT: positioning is applied via inline `style` because the UA
 * stylesheet's `dialog:modal { inset: 0; margin: auto; }` rule has higher
 * specificity than Tailwind utility classes. Inline styles beat both.
 *
 * Modals (HoldingDetail, LoanDetail, Trade, …) should always use this rather
 * than rolling their own <dialog>.
 */
export function Modal({
  open,
  onClose,
  children,
  maxWidthClass = 'max-w-md',
  fillHeight = false,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: fillHeight ? '3vh' : 'auto',
        bottom: '6rem',
        left: '50%',
        transform: 'translateX(-50%)',
        margin: 0,
        padding: 0,
        height: fillHeight ? 'calc(100vh - 3vh - 6rem)' : undefined,
        maxHeight: 'calc(100vh - 3vh - 6rem)',
      }}
      className={`w-[92vw] ${maxWidthClass} bg-transparent rounded-[32px] backdrop:bg-black/40 backdrop:backdrop-blur-sm`}
    >
      <div className={`bg-white rounded-[32px] no-scrollbar ${fillHeight ? 'h-full flex flex-col overflow-hidden pb-2' : 'overflow-y-auto max-h-full pb-3'}`}>
        {children}
      </div>
    </dialog>
  );
}
