'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { resampleByMode, type ChartMode } from '@/lib/priceHistorySample';
import { generateSmoothAreaPath, generateSmoothLinePath } from '@/lib/chart';
import type { PriceHistoryRow } from '@/lib/priceHistoryRepo';

const MODES: ChartMode[] = ['D', 'W', 'Y'];
const WINDOW_SIZE: Record<ChartMode, number> = { D: 60, W: 26, Y: 10 };
const TAP_THRESHOLD_PX = 8;
const Y_TICKS = 4;
const X_LABEL_COUNT = 5;
// Vertical breathing room (as a fraction of data range) reserved at the top
// and bottom of the SVG so peak/trough strokes — including Bezier overshoot
// from the Catmull-Rom smoothing — aren't clipped by the chart edge.
const Y_PAD_PCT = 0.08;

interface Props {
  rows: PriceHistoryRow[];
  formatY?: (v: number) => string;
  className?: string;
}

interface Gesture {
  startX: number;
  startOffset: number;
  startMarker: number | null;
  mode: 'idle' | 'drag-pan' | 'drag-marker';
}

export function InteractivePriceChart({
  rows,
  formatY = (v) => Math.round(v).toLocaleString('ko-KR'),
  className = 'w-full',
}: Props) {
  const [mode, setMode] = useState<ChartMode>('D');
  const [panOffset, setPanOffset] = useState(0);
  const [marker, setMarker] = useState<number | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const points = useMemo(() => resampleByMode(rows, mode), [rows, mode]);
  // Use the full series when the total is comparable to the default window.
  // Otherwise the latest 60/26/10 points hide the user's purchase day for
  // short-lived positions (e.g. bought 4 months ago → buy day falls off the
  // left of a 60-day window).
  const baseWin = WINDOW_SIZE[mode];
  const win =
    points.length > 0 && points.length < baseWin * 2
      ? Math.max(2, points.length)
      : baseWin;

  const maxOffset = Math.max(0, points.length - win);
  const offset = Math.min(panOffset, maxOffset);
  const end = points.length - offset;
  const start = Math.max(0, end - win);
  const visible = points.slice(start, end);

  const closes = visible.map((p) => p.close);
  // Stock chart line stays brand green regardless of direction. The
  // up/down semantic lives elsewhere (text/badges) — here the curve is
  // just a visualisation of the price series.
  const stroke = '#2D4F35';
  const gradId = 'ipc-grad';

  const minClose = closes.length > 0 ? Math.min(...closes) : 0;
  const maxClose = closes.length > 0 ? Math.max(...closes) : 0;
  const yRange = maxClose - minClose || 1;
  const paddedMin = minClose - yRange * Y_PAD_PCT;
  const paddedMax = maxClose + yRange * Y_PAD_PCT;
  const paddedRange = paddedMax - paddedMin;
  const pathRange = { min: paddedMin, max: paddedMax };
  const linePath = closes.length >= 2 ? generateSmoothLinePath(closes, 100, 100, pathRange) : '';
  const areaPath = closes.length >= 2 ? generateSmoothAreaPath(closes, 100, 100, pathRange) : '';

  // Marker clamps into the current visible window. Reset when mode flips
  // (the underlying point set changes) or when nothing's visible.
  const markerIdx = marker !== null && marker >= 0 && marker < visible.length ? marker : null;
  const markerRow = markerIdx !== null ? visible[markerIdx] : null;

  useEffect(() => {
    setMarker(null);
    setPanOffset(0);
  }, [mode]);

  function clampIdx(i: number) {
    if (visible.length === 0) return 0;
    return Math.max(0, Math.min(visible.length - 1, i));
  }

  function clientXToIdx(clientX: number): number {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return clampIdx(Math.round(ratio * (visible.length - 1)));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    gestureRef.current = {
      startX: e.clientX,
      startOffset: offset,
      startMarker: markerIdx,
      mode: 'idle',
    };
    try {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.clientX - g.startX;
    if (g.mode === 'idle') {
      if (Math.abs(dx) < TAP_THRESHOLD_PX) return;
      g.mode = g.startMarker !== null ? 'drag-marker' : 'drag-pan';
    }
    if (g.mode === 'drag-marker') {
      setMarker(clientXToIdx(e.clientX));
      return;
    }
    if (g.mode === 'drag-pan') {
      const w = surfaceRef.current?.clientWidth ?? 1;
      const pxPerPoint = w / win;
      // Drag right (positive dx) = scroll into the past = larger offset.
      const deltaPoints = Math.round(dx / pxPerPoint);
      const next = Math.max(0, Math.min(maxOffset, g.startOffset + deltaPoints));
      setPanOffset(next);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    gestureRef.current = null;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!g) return;
    if (g.mode === 'idle') {
      // It's a tap — toggle marker. Tap on existing marker → remove.
      // Tap on empty area → drop marker at tap location.
      if (g.startMarker !== null) {
        setMarker(null);
      } else {
        setMarker(clientXToIdx(e.clientX));
      }
    }
    // drag-marker / drag-pan: the move handler already committed state.
  }

  function changeMode(next: ChartMode) {
    setMode(next);
  }

  // ─── Layout helpers ──────────────────────────────────────────────────
  // Tick values stay anchored to the real data range (maxClose..minClose),
  // but their positions are computed inside the padded space so the top tick
  // sits Y_PAD_PCT below the chart's top edge instead of flush against it —
  // matching where the line actually peaks.
  const yTicks = useMemo(() => {
    if (closes.length === 0) return [] as { value: number; pct: number }[];
    return Array.from({ length: Y_TICKS + 1 }, (_, i) => {
      const value = maxClose - (yRange * i) / Y_TICKS;
      const pct = ((paddedMax - value) / paddedRange) * 100;
      return { value, pct };
    });
  }, [closes.length, maxClose, yRange, paddedMax, paddedRange]);

  const xLabels = useMemo(() => {
    if (visible.length === 0) return [] as { date: string; pct: number }[];
    return Array.from({ length: X_LABEL_COUNT }, (_, i) => {
      const idx = Math.round((i / (X_LABEL_COUNT - 1)) * (visible.length - 1));
      return {
        date: visible[idx].date,
        pct: visible.length <= 1 ? 0 : (idx / (visible.length - 1)) * 100,
      };
    });
  }, [visible]);

  const markerX =
    markerIdx !== null && visible.length > 1 ? (markerIdx / (visible.length - 1)) * 100 : 0;
  const markerY =
    markerRow !== null ? 100 - ((markerRow.close - paddedMin) / paddedRange) * 100 : 0;

  return (
    <div className={className}>
      <div className="flex justify-center gap-1.5 mb-2">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => changeMode(m)}
            className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
              mode === m ? 'bg-brand text-white' : 'bg-brand-surface text-brand-sage'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Marker readout */}
      <div className="px-2 mb-1 h-5 flex items-center justify-end">
        {markerRow && (
          <span className="text-[11px] font-black text-brand-ink tabular-nums">
            {markerRow.date} · {formatY(markerRow.close)}
          </span>
        )}
      </div>

      <div className="flex gap-1 select-none">
        {/* Chart surface (chart + x-axis labels) */}
        <div className="flex-1 min-w-0">
          <div
            ref={surfaceRef}
            className="relative w-full h-44 touch-none cursor-crosshair"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {linePath ? (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-full"
              >
                <defs>
                  <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill={`url(#${gradId})`} />
                <path
                  d={linePath}
                  fill="none"
                  stroke={stroke}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                {markerRow && (
                  <>
                    <line
                      x1={markerX}
                      x2={markerX}
                      y1="0"
                      y2="100"
                      stroke={stroke}
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1="0"
                      x2="100"
                      y1={markerY}
                      y2={markerY}
                      stroke={stroke}
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                )}
              </svg>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-brand-sage text-[11px] font-bold">
                데이터 없음 — 동기화 후 다시 확인
              </div>
            )}
            {markerRow && linePath && (
              <span
                className="absolute pointer-events-none rounded-full box-border"
                style={{
                  left: `${markerX}%`,
                  top: `${markerY}%`,
                  width: 10,
                  height: 10,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: stroke,
                  border: '2px solid #FFFFFF',
                }}
              />
            )}
          </div>

          {/* X-axis date labels */}
          {xLabels.length > 0 && (
            <div className="relative h-4 mt-1">
              {xLabels.map((l, i) => {
                const isFirst = i === 0;
                const isLast = i === xLabels.length - 1;
                return (
                  <span
                    key={`${l.date}-${i}`}
                    className="absolute top-0 text-[9px] font-bold text-brand-sage tabular-nums whitespace-nowrap"
                    style={{
                      left: `${l.pct}%`,
                      transform: isFirst
                        ? 'translateX(0)'
                        : isLast
                          ? 'translateX(-100%)'
                          : 'translateX(-50%)',
                    }}
                  >
                    {l.date.slice(2)}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Y-axis labels */}
        {yTicks.length > 0 && (
          <div className="relative w-14 h-44 shrink-0">
            {yTicks.map((t, i) => (
              <span
                key={i}
                className="absolute right-0 text-[9px] font-bold text-brand-sage tabular-nums"
                style={{
                  top: `${t.pct}%`,
                  transform:
                    i === 0
                      ? 'translateY(0)'
                      : i === yTicks.length - 1
                        ? 'translateY(-100%)'
                        : 'translateY(-50%)',
                }}
              >
                {formatY(t.value)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
