/**
 * Map a reference event to a short verb badge — the most-scannable label
 * a row can carry, like a price tag.  The verb sits left of the company
 * name in the Insights timeline.
 *
 * `tone` drives the badge color: bullish = `up`, bearish = `down`, otherwise
 * neutral.  The caller picks the final palette so the page can keep its
 * brand-aware color tokens; this module stays presentation-agnostic.
 */
export interface VerbInput {
  kind: string;
  tags: readonly string[];
}

export type VerbTone = 'up' | 'down' | 'neutral';

export interface Verb {
  label: string;
  tone: VerbTone;
}

export function eventVerb(event: VerbInput): Verb {
  const tags = event.tags ?? [];
  const has = (t: string) => tags.includes(t);

  switch (event.kind) {
    case 'index_addition':
      return { label: '편입', tone: 'up' };
    case 'index_removal':
      return { label: '제외', tone: 'down' };
    case 'earnings':
      return { label: '실적', tone: 'neutral' };
    case 'ipo':
      if (has('priced')) return { label: '가격 확정', tone: 'neutral' };
      if (has('upcoming')) return { label: 'IPO 예정', tone: 'neutral' };
      if (has('filed')) return { label: 'S-1 접수', tone: 'neutral' };
      return { label: 'IPO', tone: 'neutral' };
    case 'lockup_expiry':
      if (has('dday')) return { label: '락업 당일', tone: 'down' };
      if (has('d10')) return { label: '락업 D-10', tone: 'down' };
      return { label: '락업', tone: 'down' };
    case 'macro':
      return { label: '매크로', tone: 'neutral' };
    case 'momentum':
      if (has('sector-cluster')) {
        if (has('up')) return { label: '섹터 동반 상승', tone: 'up' };
        if (has('down')) return { label: '섹터 동반 하락', tone: 'down' };
        return { label: '섹터 클러스터', tone: 'neutral' };
      }
      if (has('price-up-1d')) return { label: '급등', tone: 'up' };
      if (has('price-down-1d')) return { label: '급락', tone: 'down' };
      if (has('rank-up-1d')) return { label: '랭크 +10↑', tone: 'up' };
      if (has('rank-down-1d')) return { label: '랭크 -10↓', tone: 'down' };
      if (has('rank-up-5d')) return { label: '5일 +20↑', tone: 'up' };
      if (has('top30-breakout')) return { label: 'TOP30 진입', tone: 'up' };
      return { label: '모멘텀', tone: 'neutral' };
  }
  return { label: event.kind, tone: 'neutral' };
}
