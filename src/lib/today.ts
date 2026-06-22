/**
 * Korea-time "today". The app's data (reference events, daily closes) is keyed
 * to the KST trading calendar, so any server-side "what's today" must resolve
 * in Asia/Seoul — `new Date().toISOString()` would give the UTC date, which is
 * the *previous* day during the KST morning (e.g. the 08:00 KST push).
 */
export function todaySeoulISO(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD; timeZone pins it to KST regardless of host tz.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
