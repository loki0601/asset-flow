import { describe, expect, it } from 'vitest';
import {
  isAllInitials,
  toInitials,
  matchesInitials,
} from '@/lib/hangulInitials';

describe('toInitials', () => {
  it('extracts initial jamo from each Hangul syllable', () => {
    expect(toInitials('삼성전자')).toBe('ㅅㅅㅈㅈ');
    expect(toInitials('애플')).toBe('ㅇㅍ');
    expect(toInitials('현대차')).toBe('ㅎㄷㅊ');
  });

  it('passes through ascii and digits unchanged', () => {
    expect(toInitials('Apple Inc.')).toBe('Apple Inc.');
    expect(toInitials('KOSPI 200')).toBe('KOSPI 200');
  });

  it('mixes hangul and ascii correctly', () => {
    expect(toInitials('삼성 SDI')).toBe('ㅅㅅ SDI');
  });

  it('handles already-Jamo input by passing through', () => {
    expect(toInitials('ㅅㅅ')).toBe('ㅅㅅ');
  });
});

describe('isAllInitials', () => {
  it('returns true when every character is a Hangul initial jamo', () => {
    expect(isAllInitials('ㅅㅅ')).toBe(true);
    expect(isAllInitials('ㅎㄷ')).toBe(true);
  });

  it('returns false for syllables, ascii, or empty input', () => {
    expect(isAllInitials('삼성')).toBe(false);
    expect(isAllInitials('AA')).toBe(false);
    expect(isAllInitials('')).toBe(false);
  });
});

describe('matchesInitials', () => {
  it('matches initial-only queries against syllable strings', () => {
    expect(matchesInitials('삼성전자', 'ㅅㅅ')).toBe(true);
    expect(matchesInitials('삼성전자', 'ㅅㅈ')).toBe(true);
    expect(matchesInitials('현대차', 'ㅎㄷ')).toBe(true);
  });

  it('returns false on mismatched initials', () => {
    expect(matchesInitials('삼성전자', 'ㅇㅁ')).toBe(false);
  });

  it('returns false when the query has non-initial characters', () => {
    expect(matchesInitials('삼성전자', '삼')).toBe(false);
  });
});
