'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthMatrix, shiftMonth, yearGrid } from '@/lib/calendar';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type PickerMode = 'days' | 'months' | 'years';

/**
 * Lightweight in-house date-range picker — no external calendar dependency.
 * First tap sets the start, second tap the end (taps before the start swap so
 * the range is always ordered). Tapping the header drills out to a month then
 * year picker so far-off dates are reachable without paging month-by-month.
 */
export function RangeCalendar({
  start,
  end,
  onChange,
}: {
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const [view, setView] = useState(() => anchorMonth(end ?? start));
  const [mode, setMode] = useState<PickerMode>('days');
  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view]);

  const lo = start && end ? (start <= end ? start : end) : null;
  const hi = start && end ? (start <= end ? end : start) : null;

  function pick(date: string) {
    if (!start || (start && end)) {
      onChange(date, null);
    } else if (date < start) {
      onChange(date, start);
    } else {
      onChange(start, date);
    }
  }

  function step(delta: number) {
    if (mode === 'days') setView((v) => ({ ...v, ...shiftMonth(v.year, v.month, delta) }));
    else if (mode === 'months') setView((v) => ({ ...v, year: v.year + delta }));
    else setView((v) => ({ ...v, year: v.year + delta * 12 }));
  }

  const years = yearGrid(view.year);

  return (
    <div className="bg-white rounded-[2rem] border border-brand-line shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => step(-1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-brand-sage active:bg-brand-surface"
          aria-label="이전"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'days' ? 'months' : m === 'months' ? 'years' : 'days'))}
          className="text-sm font-black text-brand-ink tabular-nums px-3 py-1 rounded-full active:bg-brand-surface"
        >
          {mode === 'days' && `${view.year}년 ${view.month + 1}월`}
          {mode === 'months' && `${view.year}년`}
          {mode === 'years' && `${years[0]} – ${years[11]}`}
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-brand-sage active:bg-brand-surface"
          aria-label="다음"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {mode === 'days' && (
        <>
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="text-center text-[10px] font-bold text-brand-sage py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {weeks.flat().map((cell) => {
              const isEndpoint = cell.date === start || cell.date === end;
              const inRange = lo !== null && hi !== null && cell.date > lo && cell.date < hi;
              const day = Number(cell.date.slice(8, 10));
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => pick(cell.date)}
                  className={`h-9 mx-auto w-9 rounded-full text-xs font-bold tabular-nums flex items-center justify-center transition-colors ${
                    isEndpoint
                      ? 'bg-brand text-white'
                      : inRange
                        ? 'bg-brand/10 text-brand-ink'
                        : cell.inMonth
                          ? 'text-brand-ink active:bg-brand-surface'
                          : 'text-brand-sage/40 active:bg-brand-surface'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </>
      )}

      {mode === 'months' && (
        <div className="grid grid-cols-3 gap-2 py-1">
          {Array.from({ length: 12 }, (_, m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setView((v) => ({ ...v, month: m }));
                setMode('days');
              }}
              className={`h-11 rounded-2xl text-xs font-black tabular-nums transition-colors ${
                m === view.month
                  ? 'bg-brand text-white'
                  : 'text-brand-ink bg-brand-surface active:bg-brand/10'
              }`}
            >
              {m + 1}월
            </button>
          ))}
        </div>
      )}

      {mode === 'years' && (
        <div className="grid grid-cols-3 gap-2 py-1">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => {
                setView((v) => ({ ...v, year: y }));
                setMode('months');
              }}
              className={`h-11 rounded-2xl text-xs font-black tabular-nums transition-colors ${
                y === view.year
                  ? 'bg-brand text-white'
                  : 'text-brand-ink bg-brand-surface active:bg-brand/10'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pick the month to open on: the existing end/start selection, else today. */
function anchorMonth(date: string | null): { year: number; month: number } {
  if (date) {
    const d = new Date(`${date}T00:00:00Z`);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}
