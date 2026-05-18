'use client';

import { useEffect, useState } from 'react';
import { getAggregateView, SETTINGS_CHANGED_EVENT } from '@/lib/userSettings';
import { useAuthReady } from '@/components/AuthProvider';

/** Reactive accessor for the "모아보기" preference. Re-reads from kv when
 *  the settings page dispatches a change event AND once auth becomes ready
 *  (the initial useState read returns false when sql.js hasn't been
 *  initialised yet, so the stored value would otherwise be lost on every
 *  cold launch). */
export function useAggregateView(): boolean {
  const ready = useAuthReady();
  const [value, setValue] = useState<boolean>(() => getAggregateView());

  useEffect(() => {
    if (ready) setValue(getAggregateView());
  }, [ready]);

  useEffect(() => {
    function handler() {
      setValue(getAggregateView());
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handler);
  }, []);

  return value;
}
