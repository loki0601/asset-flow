import { describe, it, expect } from 'vitest';
import {
  generateLinePath,
  generateAreaPath,
  generateSmoothLinePath,
  generateSmoothAreaPath,
} from '@/lib/chart';

describe('generateLinePath', () => {
  it('returns empty string for fewer than 2 points', () => {
    expect(generateLinePath([])).toBe('');
    expect(generateLinePath([100])).toBe('');
  });

  it('starts with M command', () => {
    expect(generateLinePath([100, 200])).toMatch(/^M/);
  });

  it('normalizes min price to bottom and max price to top of viewBox', () => {
    const path = generateLinePath([100, 200], 100, 100);
    expect(path).toContain('M0,100');
    expect(path).toContain('L100,0');
  });

  it('distributes x evenly across viewBox width', () => {
    const path = generateLinePath([0, 50, 100], 100, 100);
    expect(path).toContain('M0,100');
    expect(path).toContain('L50,50');
    expect(path).toContain('L100,0');
  });

  it('handles flat series (no range) without dividing by zero', () => {
    const path = generateLinePath([100, 100, 100], 100, 100);
    expect(path).toMatch(/^M/);
    expect(path).not.toMatch(/NaN/);
  });
});

describe('generateAreaPath', () => {
  it('returns empty string for empty input', () => {
    expect(generateAreaPath([])).toBe('');
  });

  it('closes the path back to baseline', () => {
    const path = generateAreaPath([100, 200], 100, 100);
    expect(path).toContain('L100,100');
    expect(path).toContain('L0,100');
    expect(path.trim().endsWith('Z')).toBe(true);
  });
});

describe('generateSmoothLinePath', () => {
  it('returns empty for < 2 points', () => {
    expect(generateSmoothLinePath([])).toBe('');
    expect(generateSmoothLinePath([10])).toBe('');
  });

  it('falls back to straight line for exactly 2 points', () => {
    const path = generateSmoothLinePath([100, 200]);
    expect(path).toContain('M0,100');
    expect(path).toContain('L100,0');
    expect(path).not.toContain('C');
  });

  it('uses cubic Bezier (C command) for >= 3 points', () => {
    const path = generateSmoothLinePath([100, 150, 200, 180]);
    expect(path).toContain('C');
    expect(path).not.toMatch(/NaN/);
  });

  it('passes through every data point (curve hits start, all middles, end)', () => {
    const prices = [100, 200, 100];
    const path = generateSmoothLinePath(prices, 100, 100);
    // start
    expect(path).toContain('M0,100');
    // end of each segment lands on the actual data point — last numbers before
    // next command (or end) are the data-point coords.
    expect(path).toContain('50,0'); // middle point: max → top
    expect(path).toContain('100,100'); // last point: min → bottom
  });
});

describe('generateSmoothAreaPath', () => {
  it('closes the smoothed line back to baseline', () => {
    const path = generateSmoothAreaPath([100, 150, 200, 180]);
    expect(path).toContain('C'); // smooth segments
    expect(path).toContain('L100,100');
    expect(path).toContain('L0,100');
    expect(path.trim().endsWith('Z')).toBe(true);
  });
});
