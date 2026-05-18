/**
 * Format a short temporal status for index_addition / index_removal events.
 *
 * Returns null for today's events — the row already gets a circular "오늘"
 * date badge in the timeline, so an extra pill would be redundant. Only
 * future (D-N) and past (완료) cases earn a label.
 */
export function indexEventStatusLabel(
  eventDateISO: string,
  todayISO: string,
): string | null {
  const days = isoDayDiff(eventDateISO, todayISO);
  if (days === 0) return null;
  if (days > 0) return `D-${days}`;
  return '완료';
}

function isoDayDiff(a: string, b: string): number {
  const da = isoToUTC(a);
  const db = isoToUTC(b);
  return Math.round((da - db) / 86_400_000);
}

function isoToUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
