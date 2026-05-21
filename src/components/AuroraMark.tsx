'use client';

import { useEffect, useState } from 'react';

/**
 * Brand wordmark rendered inline as SVG.  Same composition as the Android
 * launcher icon (scripts/_generate-icon.py).  Two colour variants:
 *
 *   - light theme : deep sage palette (matches the launcher PNG)
 *   - dark theme  : warm sepia palette so the in-app mark harmonises
 *                   with vocalog-style brown dark surfaces
 *
 * The Android launcher icon itself is a baked PNG and stays sage — that
 * one represents the brand identity outside the app.  Inside the app,
 * where the surrounding palette flips, the mark recolours to fit.
 */
type Palette = {
  bg: string;
  grid: string;
  glow: string;
  gradStart: string;
  gradMid: string;
  gradEnd: string;
  midDot: string;
  endDot: string;
};

const LIGHT_PALETTE: Palette = {
  bg: '#2D4F35',
  grid: '#7A8C7E',
  glow: '#A6B89E',
  gradStart: '#2D3A30',
  gradMid: '#A6B89E',
  gradEnd: '#B89968',
  midDot: '#F4F7F5',
  endDot: '#B89968',
};

const DARK_PALETTE: Palette = {
  // Warm sepia inspired by vocalog dark theme.
  bg: '#2A1F18',     // warm dark brown
  grid: '#7A6A5C',   // warm grey-brown grid
  glow: '#9A8470',   // muted ochre glow
  gradStart: '#3D2E22',
  gradMid: '#A88A6F',
  gradEnd: '#D6B380', // warmer gold than light
  midDot: '#E8E2D6',
  endDot: '#D6B380',
};

export function AuroraMark({
  size = 'w-20 h-20',
  rounded = true,
  animate = false,
}: {
  size?: string;
  rounded?: boolean;
  animate?: boolean;
}) {
  const [dark, setDark] = useState<boolean>(() =>
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark',
  );

  // Re-read on every theme toggle.  MutationObserver is overkill for a
  // single attribute on <html>, so we just poll the documentElement once
  // per render via an effect that listens for our custom theme-change
  // signal (a custom event fired by useTheme).
  useEffect(() => {
    function onChange() {
      setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    }
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const p = dark ? DARK_PALETTE : LIGHT_PALETTE;

  return (
    <div
      className={`${size} ${rounded ? 'rounded-[22px]' : ''} overflow-hidden shadow-xl shadow-brand/15 shrink-0`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect x="0" y="0" width="100" height="100" fill={p.bg} />
        <g opacity="0.18" stroke={p.grid} strokeWidth="0.25" fill="none">
          <circle cx="50" cy="50" r="42" strokeDasharray="1,1" />
          <line x1="50" y1="5" x2="50" y2="95" />
          <line x1="5" y1="50" x2="95" y2="50" />
        </g>
        <path
          d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
          fill="none"
          stroke={p.glow}
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.22"
          className={animate ? 'animate-pulse' : undefined}
        />
        <path
          d="M 15 75 C 32 80, 44 45, 58 55 C 72 65, 78 30, 85 25"
          fill="none"
          stroke="url(#auroraGrad)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="58" cy="55" r="2" fill={p.midDot} />
        <circle cx="85" cy="25" r="2.5" fill={p.endDot} />
        <defs>
          <linearGradient id="auroraGrad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={p.gradStart} />
            <stop offset="50%" stopColor={p.gradMid} />
            <stop offset="100%" stopColor={p.gradEnd} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
