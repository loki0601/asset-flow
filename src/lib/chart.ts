export interface PathRange {
  min: number;
  max: number;
}

export function generateLinePath(
  prices: number[],
  viewBoxX = 100,
  viewBoxY = 100,
  range?: PathRange,
): string {
  if (prices.length < 2) return '';
  const min = range?.min ?? Math.min(...prices);
  const max = range?.max ?? Math.max(...prices);
  const span = max - min || 1;
  const steps = prices.length - 1;

  return prices
    .map((p, i) => {
      const x = (i / steps) * viewBoxX;
      const y = viewBoxY - ((p - min) / span) * viewBoxY;
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd}${stripZero(x)},${stripZero(y)}`;
    })
    .join(' ');
}

/**
 * Catmull-Rom-to-Bezier smoothed line. Same shape model as generateLinePath
 * but uses cubic curves between points so the chart reads as a continuous
 * curve rather than a polyline (matches stock-app aesthetic).
 */
export function generateSmoothLinePath(
  prices: number[],
  viewBoxX = 100,
  viewBoxY = 100,
  range?: PathRange,
): string {
  if (prices.length < 2) return '';
  if (prices.length === 2) return generateLinePath(prices, viewBoxX, viewBoxY, range);

  const min = range?.min ?? Math.min(...prices);
  const max = range?.max ?? Math.max(...prices);
  const span = max - min || 1;
  const steps = prices.length - 1;

  const pts = prices.map((p, i) => ({
    x: (i / steps) * viewBoxX,
    y: viewBoxY - ((p - min) / span) * viewBoxY,
  }));

  let path = `M${stripZero(pts[0].x)},${stripZero(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${stripZero(cp1x)},${stripZero(cp1y)} ${stripZero(cp2x)},${stripZero(cp2y)} ${stripZero(p2.x)},${stripZero(p2.y)}`;
  }
  return path;
}

export function generateSmoothAreaPath(
  prices: number[],
  viewBoxX = 100,
  viewBoxY = 100,
  range?: PathRange,
): string {
  const line = generateSmoothLinePath(prices, viewBoxX, viewBoxY, range);
  if (!line) return '';
  return `${line} L${stripZero(viewBoxX)},${stripZero(viewBoxY)} L0,${stripZero(viewBoxY)} Z`;
}

export function generateAreaPath(
  prices: number[],
  viewBoxX = 100,
  viewBoxY = 100,
  range?: PathRange,
): string {
  const line = generateLinePath(prices, viewBoxX, viewBoxY, range);
  if (!line) return '';
  return `${line} L${stripZero(viewBoxX)},${stripZero(viewBoxY)} L0,${stripZero(viewBoxY)} Z`;
}

function stripZero(n: number): string {
  // 100.00 → 100, 50.50 → 50.5, integer x stays as integer
  const fixed = Number(n.toFixed(2));
  return String(fixed);
}
