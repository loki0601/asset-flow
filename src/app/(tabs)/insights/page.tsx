'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Lightbulb } from 'lucide-react';
import { indexEventStatusLabel } from '@/lib/insightsLabels';
import { eventVerb, type VerbTone } from '@/lib/eventVerb';
import { splitDetail } from '@/lib/splitDetail';

/**
 * Insights tab — vertical timeline of upcoming/recent reference events
 * pulled from /api/insights/events. Layout follows the "1안 하이브리드"
 * reference: cardless line-feed with a centred vertical axis, date column
 * on the left and a small coloured dot tying each row to the axis.
 *
 * Data is read-mostly: events refresh once per day on the server cron, so
 * we fetch once on mount and rely on the Service Worker to serve cached
 * responses on subsequent visits. No live polling.
 */

interface ReferenceEvent {
  id: string;
  kind: string;
  symbol: string | null;
  name: string;
  date: string; // YYYY-MM-DD
  title: string;
  detail: string | null;
  impact: string;
  confidence: string;
  source: string | null;
  tags: string[];
}

// Tones intentionally desaturated to harmonize with the sage/earth palette.
// Original saturated set (blue/amber/emerald/red/violet/pink/gray) felt too
// loud against the muted brand tokens.
const KIND_META: Record<string, { label: string; color: string; cta: string }> = {
  ipo: { label: 'IPO 일정', color: '#5C7A9C', cta: 'NASDAQ에서 보기' },          // dusty slate-blue
  lockup_expiry: { label: '락업 해제', color: '#B89968', cta: '보유 종목 확인' }, // muted ochre
  index_addition: { label: '지수 편입', color: '#5C8B6B', cta: '편입 종목 자세히' }, // sage green
  index_removal: { label: '지수 제외', color: '#B85950', cta: '제외 종목 자세히' }, // brand "up" (toned red — Korean direction convention)
  earnings: { label: '실적 발표', color: '#8E7BA4', cta: '실적 보기' },         // dusty lavender
  momentum: { label: '모멘텀', color: '#B07A8C', cta: '종목 시세 보기' },        // muted rose
  macro: { label: '거시 이벤트', color: '#7A8C7E', cta: '자세히' },             // brand-sage
};

function metaFor(kind: string) {
  return KIND_META[kind] ?? { label: kind, color: '#6B7280', cta: '자세히' };
}

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDateParts(iso: string): { short: string; dayOfWeek: string; isToday: boolean } {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = KO_WEEKDAYS[dt.getUTCDay()];
  const short = `${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
  return { short, dayOfWeek: dow, isToday: iso === todayLocalISO() };
}

type Filter = 'all' | 'ipo' | 'lockup_expiry' | 'index' | 'earnings' | 'momentum' | 'macro';

const FILTER_LABELS: Record<Filter, string> = {
  all: '전체',
  ipo: 'IPO',
  lockup_expiry: '락업 해제',
  index: '지수',
  earnings: '실적 발표',
  momentum: '모멘텀',
  macro: '매크로',
};

const PAST_LOOKBACK_DAYS = 90;

export default function InsightsPage() {
  const [events, setEvents] = useState<ReferenceEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showPast, setShowPast] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const todayAnchorTopRef = useRef<number | null>(null);

  /**
   * Preserve visual scroll position when the toggle adds/removes past rows.
   * Record where the first "today / future" row sat relative to viewport
   * just before the toggle, then snap it back to that same offset right
   * after React re-renders.
   */
  function handlePastToggle() {
    const anchor = containerRef.current?.querySelector<HTMLDivElement>(
      '[data-anchor="now"]',
    );
    todayAnchorTopRef.current = anchor
      ? anchor.getBoundingClientRect().top
      : null;
    setShowPast((v) => !v);
  }

  useLayoutEffect(() => {
    const before = todayAnchorTopRef.current;
    if (before === null) return;
    const anchor = containerRef.current?.querySelector<HTMLDivElement>(
      '[data-anchor="now"]',
    );
    if (!anchor) return;
    const after = anchor.getBoundingClientRect().top;
    window.scrollBy({ top: after - before, behavior: 'instant' as ScrollBehavior });
    todayAnchorTopRef.current = null;
  }, [showPast]);

  // Fetch the full window once on mount (today - 90d → today + 400d). The
  // toggle is a pure client-side filter, so flipping it neither refetches
  // nor causes a scroll jump.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: '500' });
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - PAST_LOOKBACK_DAYS);
        params.set('from', d.toISOString().slice(0, 10));
        const res = await fetch(`/api/insights/events?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { events: ReferenceEvent[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayISO = todayLocalISO();
  const filtered = useMemo(() => {
    if (!events) return null;
    let pool = events;
    if (!showPast) pool = pool.filter((e) => e.date >= todayISO);
    if (filter === 'all') return pool;
    if (filter === 'index') {
      return pool.filter(
        (e) => e.kind === 'index_addition' || e.kind === 'index_removal',
      );
    }
    return pool.filter((e) => e.kind === filter);
  }, [events, filter, showPast, todayISO]);

  return (
    <div className="pb-10" ref={containerRef}>
      {/* Sticky header zone: title + switch + tagline + filter chips.
       *  Extends upward (via negative margin equal to main's safe-area pt)
       *  so its background covers the status-bar/notch area when stuck —
       *  prevents the timeline rows from being seen behind the status bar
       *  when scrolled.  Inner paddingTop restores the visual position. */}
      <div
        className="sticky top-0 z-20 bg-brand-surface -mx-6 px-6 pb-3 border-b border-brand-line/60"
        style={{
          marginTop: 'calc(-1 * (env(safe-area-inset-top) + 1rem))',
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        }}
      >
        <div className="flex items-end justify-between gap-3 px-2 mb-1">
          <div className="flex-1 min-w-0">
            <p className="text-brand-sage text-[10px] font-bold uppercase tracking-[0.2em] mb-1">
              Insights
            </p>
            <h2 className="text-2xl font-black text-brand-ink">자산 인사이트</h2>
          </div>
          <PastSwitch showPast={showPast} onToggle={handlePastToggle} />
        </div>
        <p className="px-2 text-[10px] text-brand-sage font-bold mb-4 uppercase tracking-widest">
          Daily Reference Events
        </p>
        <FilterChips selected={filter} onSelect={setFilter} />
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl p-4 text-xs font-bold mb-4">
          이벤트를 불러오지 못했어요: {error}
        </div>
      )}

      {!filtered && !error && <SkeletonTimeline />}
      {filtered && filtered.length === 0 && <EmptyFiltered filter={filter} />}
      {filtered && filtered.length > 0 && <Timeline events={filtered} />}
    </div>
  );
}

function PastSwitch({
  showPast,
  onToggle,
}: {
  showPast: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={showPast}
      onClick={onToggle}
      className="flex items-center gap-2 shrink-0 pb-1"
    >
      <span className="text-[11px] font-bold text-brand-sage tracking-wide">
        지난 {PAST_LOOKBACK_DAYS}일
      </span>
      <span
        className={`relative inline-block w-9 h-[22px] rounded-full transition-colors ${
          showPast ? 'bg-brand' : 'bg-brand-line'
        }`}
      >
        <span
          className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            showPast ? 'translate-x-[14px]' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

function FilterChips({
  selected,
  onSelect,
}: {
  selected: Filter;
  onSelect: (f: Filter) => void;
}) {
  const filters: Filter[] = [
    'all',
    'ipo',
    'lockup_expiry',
    'index',
    'earnings',
    'momentum',
    'macro',
  ];
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 mb-5">
      {filters.map((f) => {
        const active = selected === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onSelect(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all ${
              active
                ? 'bg-brand text-white border-brand shadow-md'
                : 'bg-white text-brand-sage border-brand-line'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        );
      })}
    </div>
  );
}

function EmptyFiltered({ filter }: { filter: Filter }) {
  return (
    <div className="bg-white rounded-[2rem] border border-brand-line p-8 shadow-sm text-center">
      <div className="w-12 h-12 rounded-2xl bg-brand-surface text-brand mx-auto flex items-center justify-center mb-3">
        <Lightbulb size={22} />
      </div>
      <p className="text-sm font-black text-brand-ink mb-1">
        "{FILTER_LABELS[filter]}" 카테고리에 표시할 이벤트가 없어요
      </p>
      <p className="text-[11px] text-brand-sage leading-relaxed">
        다른 필터를 선택하거나 "전체"로 돌아가서 확인해 주세요.
      </p>
    </div>
  );
}

function Timeline({ events }: { events: ReferenceEvent[] }) {
  const today = todayLocalISO();
  // Anchor the first row whose date >= today so scroll preservation can
  // pin the "now" line in place when the past-toggle flips.
  const firstNowIndex = events.findIndex((e) => e.date >= today);
  return (
    <div className="relative space-y-9 pb-4">
      {/* Vertical axis aligned to the centre of the dot column. The 73px
       *  matches the date column (62px) + half the dot column (~11px). */}
      <div className="absolute left-[73px] top-1.5 bottom-2 w-0.5 bg-brand-line/70" />
      {events.map((event, i) => (
        <TimelineRow
          key={event.id}
          event={event}
          isAnchor={i === firstNowIndex}
        />
      ))}
    </div>
  );
}

function TimelineRow({
  event,
  isAnchor,
}: {
  event: ReferenceEvent;
  isAnchor?: boolean;
}) {
  const meta = metaFor(event.kind);
  const today = todayLocalISO();
  const { short, dayOfWeek, isToday } = formatDateParts(event.date);
  const isPast = event.date < today;
  const verb = eventVerb({ kind: event.kind, tags: event.tags ?? [] });
  const indexStatus =
    event.kind === 'index_addition' || event.kind === 'index_removal'
      ? indexEventStatusLabel(event.date, today)
      : null;

  function handleAction() {
    if (event.source) window.open(event.source, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className={`relative flex gap-6 ${isPast ? 'opacity-55' : ''}`}
      {...(isAnchor ? { 'data-anchor': 'now' } : {})}
    >
      {/* Left: weekday + date. Today gets a soft rounded pill around just the
       *  date so it stands out without competing with the active filter chip. */}
      <div className="w-[62px] flex flex-col items-end pr-1 pt-1 shrink-0">
        <span className="text-[10px] font-black uppercase text-brand-sage tracking-wider">
          {isToday ? '오늘' : isPast ? '지난' : `${dayOfWeek}요일`}
        </span>
        {isToday ? (
          <span className="mt-1 text-[12px] font-black leading-none tabular-nums px-2 py-1 rounded-full bg-brand-ink/10 text-brand-ink">
            {short}
          </span>
        ) : (
          <span className="text-sm font-black text-brand-ink leading-none mt-0.5 tabular-nums">
            {short}
          </span>
        )}
      </div>

      {/* Centre: dot on the axis */}
      <div className="relative flex items-start justify-center w-[22px] shrink-0">
        <div
          className="w-4 h-4 rounded-full border-4 border-brand-surface z-10 mt-1"
          style={{ backgroundColor: meta.color }}
        />
      </div>

      {/* Right: content — verb badge + company name first, detail compressed */}
      <div className="flex-1 min-w-0 pb-4 pr-1">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <VerbBadge verb={verb} kindColor={meta.color} />
          {indexStatus && (
            <span
              className="text-[8.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md text-white"
              style={{ backgroundColor: meta.color }}
            >
              {indexStatus}
            </span>
          )}
        </div>
        <h4 className="text-[15px] font-black text-brand-ink leading-tight">
          {event.name}
          {event.symbol && (
            <span className="ml-1.5 text-[11px] font-bold text-brand-sage tracking-wide">
              {event.symbol}
            </span>
          )}
        </h4>
        {event.detail && (
          <ul className="mt-1.5 mb-2 space-y-0.5">
            {splitDetail(event.detail).map((line, i) => (
              <li
                key={i}
                className="text-[11px] text-brand-sage leading-snug font-medium flex gap-1.5"
              >
                <span className="text-brand-line/80 select-none">•</span>
                <span className="flex-1">{line}</span>
              </li>
            ))}
          </ul>
        )}
        {event.source && (
          <button
            type="button"
            onClick={handleAction}
            className="flex items-center gap-1 text-[11px] font-black text-brand hover:opacity-80 transition-all"
          >
            <span>{meta.cta}</span>
            <ChevronRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function VerbBadge({
  verb,
  kindColor,
}: {
  verb: { label: string; tone: VerbTone };
  kindColor: string;
}) {
  // Match brand-up / brand-down tokens from tailwind.config.ts so up/down
  // verbs sit in the same earthy palette as the kind colors.
  const bg =
    verb.tone === 'up'
      ? '#5C8B6B'  // sage green (matches brand 'up' direction subtly)
      : verb.tone === 'down'
      ? '#B85950'  // toned red (brand.up token for Korean stock convention)
      : kindColor;
  return (
    <span
      className="inline-flex items-center text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md text-white shadow-sm"
      style={{ backgroundColor: bg }}
    >
      {verb.label}
    </span>
  );
}

function SkeletonTimeline() {
  return (
    <div className="relative space-y-9 pb-4 animate-pulse">
      <div className="absolute left-[73px] top-1.5 bottom-2 w-0.5 bg-brand-line/70" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-6">
          <div className="w-[62px] flex flex-col items-end gap-1 pt-1">
            <div className="h-2 w-8 rounded bg-brand-line/60" />
            <div className="h-3 w-10 rounded bg-brand-line/60" />
          </div>
          <div className="w-[22px] flex items-start justify-center">
            <div className="w-4 h-4 rounded-full bg-brand-line mt-1" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-2 w-20 rounded bg-brand-line/60" />
            <div className="h-3 w-full rounded bg-brand-line/60" />
            <div className="h-2 w-3/4 rounded bg-brand-line/60" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-line p-10 shadow-sm flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-surface text-brand flex items-center justify-center mb-4">
        <Lightbulb size={26} />
      </div>
      <p className="text-base font-black text-brand-ink mb-2">표시할 이벤트가 없어요</p>
      <p className="text-xs text-brand-sage leading-relaxed">
        서버 cron이 매일 06:00 KST에 새 IPO·락업 일정을 가져옵니다.
        <br />
        잠시 후 다시 확인해 주세요.
      </p>
    </div>
  );
}
