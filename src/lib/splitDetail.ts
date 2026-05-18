/**
 * Break an event's detail string into discrete chunks for line-by-line
 * rendering. Two formats appear in the wild:
 *
 *   - Chip-style: "Apr/2026 실적 · 장 마감 후 · EPS 컨센 $1.70" — split on " · "
 *   - Paragraph : "X 의 단일 일 급등 6.62%. 현재 순위 11위." — split on sentence
 *     boundary so each fact gets its own row.
 *
 * Empty/whitespace chunks are dropped.
 */
export function splitDetail(detail: string | null | undefined): string[] {
  if (!detail) return [];
  if (detail.includes(' · ')) {
    return detail
      .split(' · ')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Split on Korean-style end-of-sentence: full stop followed by space.
  // Use lookbehind so the period is kept with its sentence.
  const parts = detail.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
  return parts;
}
