import { describe, it, expect } from 'vitest';
import { decideBackAction } from '@/lib/backButton';

describe('decideBackAction', () => {
  it('closes an open dialog first, even when navigation is possible', () => {
    expect(decideBackAction({ hasOpenDialog: true, canGoBack: true })).toBe('close-dialog');
    expect(decideBackAction({ hasOpenDialog: true, canGoBack: false })).toBe('close-dialog');
  });

  it('goes to the previous page when no dialog is open and history exists', () => {
    expect(decideBackAction({ hasOpenDialog: false, canGoBack: true })).toBe('history-back');
  });

  it('exits the app when there is nothing to go back to', () => {
    expect(decideBackAction({ hasOpenDialog: false, canGoBack: false })).toBe('exit');
  });
});
