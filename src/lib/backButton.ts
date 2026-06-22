/**
 * Android hardware/gesture back-button handling.
 *
 * Behaviour (per product decision): always go to the previous page. The only
 * special case is an open modal — close it first instead of navigating. When
 * there's no page to go back to, exit the app.
 *
 * All modals render through the shared <Modal> (a native <dialog open>), so we
 * detect "a modal is open" generically via `dialog[open]` and close the topmost
 * one — its `close` event fires the modal's onClose. No per-modal wiring needed.
 *
 * No-op on web.
 */

import { Capacitor } from '@capacitor/core';

export type BackAction = 'close-dialog' | 'history-back' | 'exit';

/** Pure decision so the branching is unit-tested without a device. */
export function decideBackAction(state: {
  hasOpenDialog: boolean;
  canGoBack: boolean;
}): BackAction {
  if (state.hasOpenDialog) return 'close-dialog';
  return state.canGoBack ? 'history-back' : 'exit';
}

let registered = false;

export async function initBackButton(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  if (registered) return;
  registered = true;
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', ({ canGoBack }) => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
      const action = decideBackAction({ hasOpenDialog: dialogs.length > 0, canGoBack });
      if (action === 'close-dialog') {
        // Topmost open dialog; its `close` event triggers the modal's onClose.
        dialogs[dialogs.length - 1].close();
      } else if (action === 'history-back') {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch (err) {
    registered = false;
    console.warn('[backButton] init failed', err);
  }
}
