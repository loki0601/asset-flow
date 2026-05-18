'use client';

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type {
  Account,
  Holding,
  MarketAsset,
  RetirementTarget,
  Transaction,
} from '@/lib/schema';
import {
  buildProgressTimeline,
  monthlyFromPrincipal,
  principalAtTime,
  type ProgressTimeline,
} from '@/lib/retirementPlanning';
import { formatKRW } from '@/lib/loans';

interface Props {
  target: RetirementTarget;
  accounts: Account[];
  holdings?: Holding[];
  transactions: Transaction[];
  marketAsset: (symbol: string) => MarketAsset | undefined;
  fxUsdKrw: number;
  /** Carried through for any future "tax-band shifts past 70" overlay; not
   *  used directly by the chart math today. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proj?: any;
}

const WINDOW_YEARS = 10; // ±5 years from today by default
const SAMPLE_STEP = 1 / 12; // monthly resolution
const W = 360;
const H = 200;
const PAD_L = 44; // wider left padding for Y-axis labels
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 28;

/**
 * Progress chart with:
 *   - ±5y default window around today, draggable left/right with touch.
 *   - Y-axis labels on the left.
 *   - Stacked area (corp + personal) of "monthly net I'd receive at the
 *     receipt age if I had only the principal I had at time T, and let it
 *     keep growing at the user's annual rate from T to receipt age".
 *   - Future projection (dashed): same metric extrapolated past today
 *     assuming no further contributions. Because the user's annual rate
 *     keeps compounding, this line GROWS over time — the visible benefit
 *     of leaving principal in the account longer.
 *   - Receipt-start year markers (corp / personal) for orientation.
 */
export function RetirementProgressChart({
  target,
  accounts,
  transactions,
  marketAsset,
  fxUsdKrw,
}: Props) {
  const timeline = useMemo(
    () =>
      buildProgressTimeline({
        target,
        accounts,
        transactions,
        marketAsset,
        fxUsdKrw,
      }),
    [target, accounts, transactions, marketAsset, fxUsdKrw],
  );

  if (timeline.events.length === 0) {
    return (
      <div className="bg-white rounded-[2rem] border border-brand-line p-5 shadow-sm text-center">
        <p className="text-sm font-black text-brand-ink mb-1">노후 진척</p>
        <p className="text-[11px] text-brand-sage leading-relaxed mt-2">
          퇴직연금/개인연금 계좌에서의 매수 내역이 누적되면 여기 시간 흐름이 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <ChartBody
      timeline={timeline}
      corporateEnabled={target.corporateEnabled !== false}
      personalEnabled={target.personalEnabled !== false}
    />
  );
}

function ChartBody({
  timeline,
  corporateEnabled,
  personalEnabled,
}: {
  timeline: ProgressTimeline;
  corporateEnabled: boolean;
  personalEnabled: boolean;
}) {
  const today = timeline.todayFraction;

  // Pan state: viewStart is the leftmost year visible.
  const [viewStart, setViewStart] = useState<number>(today - WINDOW_YEARS / 2);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const viewEnd = viewStart + WINDOW_YEARS;

  // Hard limits for the pan: 1 year before earliest event ↔ 2 years past
  // the later of the two receipt years.
  const corpRetireYear = timeline.birthYear + timeline.corpStartAge;
  const persRetireYear = timeline.birthYear + timeline.persStartAge;
  const publicRetireYear = timeline.birthYear + timeline.publicStartAge;
  const lateBoundCandidates = [corpRetireYear, persRetireYear];
  if (timeline.publicEnabled) lateBoundCandidates.push(publicRetireYear);
  const minStart = timeline.earliestYear - 1;
  const maxStart = Math.max(...lateBoundCandidates) + 2 - WINDOW_YEARS;

  // Pointer drag state.
  const dragRef = useRef<{ x: number; viewStart: number; pxPerYear: number } | null>(null);

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    const bbox = e.currentTarget.getBoundingClientRect();
    const pxPerYear = (bbox.width * innerW) / W / WINDOW_YEARS; // px per year in screen coords
    dragRef.current = { x: e.clientX, viewStart, pxPerYear };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const next = drag.viewStart - dx / drag.pxPerYear;
    setViewStart(Math.max(minStart, Math.min(maxStart, next)));
  }
  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  // Sample the stacked monthly values across the visible window.
  const samples = useMemo(() => {
    const out: { T: number; pub: number; corp: number; pers: number }[] = [];
    const corpEvents = timeline.events.filter((e) => e.category === 'corporate');
    const persEvents = timeline.events.filter((e) => e.category === 'personal');
    for (let T = viewStart; T <= viewEnd + 1e-6; T += SAMPLE_STEP) {
      // For T > today we assume no additional contributions — events list is
      // already final. principalAtTime naturally compounds events to T.
      const corpP = principalAtTime(corpEvents, timeline.corpRate, T);
      const persP = principalAtTime(persEvents, timeline.persRate, T);
      const corp = monthlyFromPrincipal(
        corpP,
        timeline.corpRate,
        timeline.corpPayoutYears,
        timeline.corpStartAge,
        'corporate',
      );
      const pers = monthlyFromPrincipal(
        persP,
        timeline.persRate,
        timeline.persPayoutYears,
        timeline.persStartAge,
        'personal',
      );
      // Public is a constant manual monthly — shown as a flat baseline
      // layer when enabled, so the user sees their total guaranteed income
      // at full retirement.
      out.push({ T, pub: timeline.publicMonthlyNet, corp, pers });
    }
    return out;
  }, [timeline, viewStart, viewEnd]);

  const yPeak = Math.max(
    ...samples.map((s) => s.pub + s.corp + s.pers),
    timeline.targetMonthlyAtRetirement,
    1,
  );
  // Round up Y peak to a clean tick.
  const peak = niceCeil(yPeak * 1.1);

  const xFor = (T: number) => PAD_L + ((T - viewStart) / WINDOW_YEARS) * innerW;
  const yFor = (v: number) => PAD_T + innerH - (v / peak) * innerH;

  // Path generation — split into past (solid) vs future (dashed) at today.
  const todayInView = today >= viewStart && today <= viewEnd;
  function clipAtToday(arr: typeof samples, side: 'past' | 'future') {
    if (side === 'past') return arr.filter((s) => s.T <= today);
    return arr.filter((s) => s.T >= today);
  }

  // Stack order (bottom → top): public, corporate, personal.
  // `layer` says which slice we're drawing; bottoms + tops use cumulative
  // sums so all three areas align cleanly.
  function cumBottom(s: { pub: number; corp: number; pers: number }, layer: 'pub' | 'corp' | 'pers'): number {
    if (layer === 'pub') return 0;
    if (layer === 'corp') return s.pub;
    return s.pub + s.corp;
  }
  function cumTop(s: { pub: number; corp: number; pers: number }, layer: 'pub' | 'corp' | 'pers'): number {
    if (layer === 'pub') return s.pub;
    if (layer === 'corp') return s.pub + s.corp;
    return s.pub + s.corp + s.pers;
  }

  function stackedPath(arr: typeof samples, layer: 'pub' | 'corp' | 'pers'): string {
    if (arr.length === 0) return '';
    const tops = arr.map((s) => `${xFor(s.T)},${yFor(cumTop(s, layer))}`);
    const bottoms = arr
      .slice()
      .reverse()
      .map((s) => `${xFor(s.T)},${yFor(cumBottom(s, layer))}`);
    return `M ${tops.join(' L ')} L ${bottoms.join(' L ')} Z`;
  }

  function linePath(arr: typeof samples): string {
    if (arr.length === 0) return '';
    return arr
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(s.T)},${yFor(s.pub + s.corp + s.pers)}`)
      .join(' ');
  }

  const pastSamples = clipAtToday(samples, 'past');
  const futureSamples = clipAtToday(samples, 'future');

  // Y-axis ticks (4 ticks).
  const yTicks = Array.from({ length: 5 }, (_, i) => (peak / 4) * i);

  // X-axis ticks every 2 years.
  const xTicks: number[] = [];
  const firstTick = Math.ceil(viewStart);
  for (let y = firstTick; y <= viewEnd; y++) {
    if ((y - firstTick) % 2 === 0) xTicks.push(y);
  }

  // Receipt-start markers — one per distinct receipt year. If corp and
  // personal happen to land on the same year, merge their ages to avoid a
  // duplicate vertical line.
  type Marker = { year: number; ages: number[] };
  const markerMap = new Map<number, Marker>();
  function pushMarker(year: number, age: number) {
    if (year < viewStart || year > viewEnd) return;
    const m = markerMap.get(year);
    if (m) {
      if (!m.ages.includes(age)) m.ages.push(age);
    } else {
      markerMap.set(year, { year, ages: [age] });
    }
  }
  if (corporateEnabled) pushMarker(corpRetireYear, timeline.corpStartAge);
  if (personalEnabled) pushMarker(persRetireYear, timeline.persStartAge);
  if (timeline.publicEnabled) {
    const publicYear = timeline.birthYear + timeline.publicStartAge;
    pushMarker(publicYear, timeline.publicStartAge);
  }
  const markers = Array.from(markerMap.values());
  const markerYears = new Set(markers.map((m) => m.year));

  // Current value at today for the summary header.
  const todayValues = useMemo(() => {
    const corpEvents = timeline.events.filter((e) => e.category === 'corporate');
    const persEvents = timeline.events.filter((e) => e.category === 'personal');
    const corp = monthlyFromPrincipal(
      principalAtTime(corpEvents, timeline.corpRate, today),
      timeline.corpRate,
      timeline.corpPayoutYears,
      timeline.corpStartAge,
      'corporate',
    );
    const pers = monthlyFromPrincipal(
      principalAtTime(persEvents, timeline.persRate, today),
      timeline.persRate,
      timeline.persPayoutYears,
      timeline.persStartAge,
      'personal',
    );
    return { pub: timeline.publicMonthlyNet, corp, pers, total: timeline.publicMonthlyNet + corp + pers };
  }, [timeline, today]);

  // For target — we use the inflation-adjusted target from the timeline.
  const goalY = yFor(timeline.targetMonthlyAtRetirement);

  return (
    <div className="bg-white rounded-[2rem] border border-brand-line p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <p className="text-sm font-black text-brand-ink">노후 진척 — 월 수령액</p>
        <p className="text-[10px] font-bold text-brand-sage tabular-nums shrink-0">
          현재 ₩{formatKRW(Math.round(todayValues.total))} / 목표 ₩
          {formatKRW(Math.round(timeline.targetMonthlyAtRetirement))}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block select-none touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Y gridlines + labels */}
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              x1={PAD_L}
              y1={yFor(v)}
              x2={W - PAD_R}
              y2={yFor(v)}
              stroke="#E6EBE7"
              strokeWidth="0.7"
            />
            <text
              x={PAD_L - 4}
              y={yFor(v) + 3}
              fontSize="8"
              textAnchor="end"
              fill="#6B7D71"
            >
              {compactKrw(v)}
            </text>
          </g>
        ))}

        {/* Past stacked area (solid) — public floor, then corporate, then personal.
            세 레이어 색상이 모두 sage 계열이라 시각 구분이 안 되던 회귀
            (req: 2026-05-18). 국민연금 → slate 블루, 퇴직연금 → forest 그린,
            개인연금 → amber 골드 로 변경해 hue 자체가 다르게. */}
        {pastSamples.length >= 2 && (
          <>
            {timeline.publicEnabled && (
              <path d={stackedPath(pastSamples, 'pub')} fill="#4F6B82" opacity="0.92" />
            )}
            <path d={stackedPath(pastSamples, 'corp')} fill="#2D4F35" opacity="0.92" />
            <path d={stackedPath(pastSamples, 'pers')} fill="#D9A35A" opacity="0.92" />
          </>
        )}

        {/* Future projection line (dashed) — total, compounds at user's rate */}
        {futureSamples.length >= 2 && (
          <path
            d={linePath(futureSamples)}
            fill="none"
            stroke="#4A7256"
            strokeWidth="1.6"
            strokeDasharray="4 3"
          />
        )}

        {/* Goal line */}
        <line
          x1={PAD_L}
          y1={goalY}
          x2={W - PAD_R}
          y2={goalY}
          stroke="#DC2626"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Today marker */}
        {todayInView && (
          <line
            x1={xFor(today)}
            y1={PAD_T}
            x2={xFor(today)}
            y2={H - PAD_B}
            stroke="#1F2A24"
            strokeWidth="0.7"
            opacity="0.35"
          />
        )}

        {/* Receipt-start markers — vertical line + age label at top */}
        {markers.map((m) => (
          <g key={m.year}>
            <line
              x1={xFor(m.year)}
              y1={PAD_T}
              x2={xFor(m.year)}
              y2={H - PAD_B}
              stroke="#4A7256"
              strokeWidth="0.8"
              strokeDasharray="2 2"
              opacity="0.7"
            />
            <text
              x={xFor(m.year)}
              y={PAD_T + 9}
              fontSize="9"
              fill="#4A7256"
              fontWeight="800"
              textAnchor="middle"
            >
              {m.ages.join('/')}세
            </text>
          </g>
        ))}

        {/* X-axis labels — marker years get circled */}
        {xTicks.map((y) => {
          const circled = markerYears.has(y);
          if (circled) {
            return (
              <g key={y}>
                <circle
                  cx={xFor(y)}
                  cy={H - 13}
                  r={9.5}
                  fill="white"
                  stroke="#4A7256"
                  strokeWidth="0.9"
                />
                <text
                  x={xFor(y)}
                  y={H - 10}
                  fontSize="8.5"
                  textAnchor="middle"
                  fill="#2D4F35"
                  fontWeight="800"
                >
                  {y}
                </text>
              </g>
            );
          }
          return (
            <text
              key={y}
              x={xFor(y)}
              y={H - 10}
              fontSize="9"
              textAnchor="middle"
              fill="#6B7280"
            >
              {y}
            </text>
          );
        })}
        {/* Also circle marker years even if they didn't land on an even tick. */}
        {markers
          .filter((m) => !xTicks.includes(m.year))
          .map((m) => (
            <g key={`mt-${m.year}`}>
              <circle
                cx={xFor(m.year)}
                cy={H - 13}
                r={9.5}
                fill="white"
                stroke="#4A7256"
                strokeWidth="0.9"
              />
              <text
                x={xFor(m.year)}
                y={H - 10}
                fontSize="8.5"
                textAnchor="middle"
                fill="#2D4F35"
                fontWeight="800"
              >
                {m.year}
              </text>
            </g>
          ))}
      </svg>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {timeline.publicEnabled && <Legend color="#4F6B82" label="국민연금" />}
        <Legend color="#2D4F35" label="퇴직연금 (DC/DB)" />
        <Legend color="#D9A35A" label="개인연금 (연금저축 + IRP)" />
        <Legend color="#4A7256" label="현 적립 유지 (연 수익률 반영)" dashed />
        <Legend color="#DC2626" label="목표" dashed />
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  dashed,
  opacity,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  opacity?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-brand-sage">
      <span
        className="inline-block w-3 h-2 rounded-sm"
        style={
          dashed
            ? { backgroundColor: 'transparent', borderTop: `2px dashed ${color}` }
            : { backgroundColor: color, opacity: opacity ?? 1 }
        }
      />
      {label}
    </span>
  );
}

/** Compact KRW formatter for Y-axis labels: 1.2M, 3.5억, etc. */
function compactKrw(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(v >= 1e9 ? 0 : 1)}억`;
  if (v >= 1e4) return `${Math.round(v / 1e4)}만`;
  if (v === 0) return '0';
  return String(Math.round(v));
}

/** Round a positive number up to a "nice" tick value for the Y-axis peak. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const base = v / pow;
  let mult: number;
  if (base <= 1) mult = 1;
  else if (base <= 2) mult = 2;
  else if (base <= 5) mult = 5;
  else mult = 10;
  return mult * pow;
}
