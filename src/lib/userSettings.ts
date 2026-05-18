/**
 * User-level UI preferences persisted in sql.js kv. Reactive across pages
 * via a custom `assetflow:settings-changed` window event — components
 * listen and re-read on the event.
 *
 * Currently tracks the "모아보기" (aggregate same-symbol holdings) toggle
 * which controls dashboard + portfolio list rendering.
 */
import { kvGet, kvSet } from '@/lib/db';

const AGGREGATE_KEY = 'assetflow:settings:aggregateView';
const SETTINGS_CHANGED_EVENT = 'assetflow:settings-changed';

export function getAggregateView(): boolean {
  return kvGet(AGGREGATE_KEY) === '1';
}

export function setAggregateView(value: boolean): void {
  kvSet(AGGREGATE_KEY, value ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  }
}

export { SETTINGS_CHANGED_EVENT };
