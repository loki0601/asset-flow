import { describe, expect, it } from 'vitest';
import { splitDetail } from '@/lib/splitDetail';

describe('splitDetail', () => {
  it('splits on " · " when present', () => {
    const detail =
      'Apr/2026 실적 · 장 마감 후 · EPS 컨센 $1.70 · 전년 EPS $0.77';
    expect(splitDetail(detail)).toEqual([
      'Apr/2026 실적',
      '장 마감 후',
      'EPS 컨센 $1.70',
      '전년 EPS $0.77',
    ]);
  });

  it('falls back to sentence splits for paragraph detail', () => {
    const detail =
      'Lumentum Holdings 의 단일 일 급등 6.62%. 현재 NASDAQ-100 시총 순위 11위. 섹터: 메모리.';
    expect(splitDetail(detail)).toEqual([
      'Lumentum Holdings 의 단일 일 급등 6.62%.',
      '현재 NASDAQ-100 시총 순위 11위.',
      '섹터: 메모리.',
    ]);
  });

  it('returns single-element array when no separators present', () => {
    expect(splitDetail('단일 문장')).toEqual(['단일 문장']);
  });

  it('drops empty chunks from trailing or leading separators', () => {
    expect(splitDetail(' · a · b · ')).toEqual(['a', 'b']);
  });

  it('handles empty input', () => {
    expect(splitDetail('')).toEqual([]);
    expect(splitDetail(null as unknown as string)).toEqual([]);
  });
});
