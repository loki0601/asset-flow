import { describe, it, expect } from 'vitest';
import { tickerDomain } from '@/server/tickerDomain';

describe('tickerDomain', () => {
  describe('overrides take precedence over the heuristic', () => {
    it('returns "google.com" for both GOOGL and GOOG, regardless of catalog name', () => {
      expect(tickerDomain({ symbol: 'NASDAQ:GOOGL', name: 'Alphabet Inc.' })).toBe('google.com');
      expect(tickerDomain({ symbol: 'NASDAQ:GOOG', name: 'Alphabet Inc.' })).toBe('google.com');
    });

    it('returns "disney.com" for the DIS ticker despite the legal name', () => {
      expect(tickerDomain({ symbol: 'NASDAQ:DIS', name: 'Walt Disney Company (The)' })).toBe('disney.com');
    });

    it('returns "coca-cola.com" for KO (heuristic would slug to "coca")', () => {
      expect(tickerDomain({ symbol: 'NASDAQ:KO', name: 'Coca-Cola' })).toBe('coca-cola.com');
    });

    it('returns "ford.com" for NYSE:F (heuristic would skip too-short ticker)', () => {
      expect(tickerDomain({ symbol: 'NYSE:F', name: 'Ford Motor Company' })).toBe('ford.com');
    });
  });

  describe('heuristic for unmapped catalog entries', () => {
    it('strips Inc./Corp./Class A suffixes and uses leading word + .com', () => {
      expect(tickerDomain({ symbol: 'NASDAQ:NOTLISTED', name: 'Acme Inc.' })).toBe('acme.com');
      expect(tickerDomain({ symbol: 'NASDAQ:NOTLISTED', name: 'BigCo Corp.' })).toBe('bigco.com');
      expect(tickerDomain({ symbol: 'NASDAQ:NOTLISTED', name: 'Foo Class A Common Stock' })).toBe('foo.com');
    });

    it('strips trailing (The) parenthetical', () => {
      expect(tickerDomain({ symbol: 'NASDAQ:NOTLISTED', name: 'Estee Lauder Companies (The)' })).toBe('estee.com');
    });

    it('returns null when leading word is too short (avoids one/two-char false positives)', () => {
      expect(tickerDomain({ symbol: 'NASDAQ:NOTLISTED', name: 'A B' })).toBeNull();
    });

    it('returns null when the catalog name is missing', () => {
      expect(tickerDomain({ symbol: 'NASDAQ:NOTLISTED', name: '' })).toBeNull();
    });
  });

  describe('KR + crypto coverage', () => {
    it('maps Samsung Electronics regardless of Korean catalog name', () => {
      expect(tickerDomain({ symbol: 'KRX:005930', name: '삼성전자' })).toBe('samsung.com');
    });

    it('maps Bitcoin to its canonical domain', () => {
      expect(tickerDomain({ symbol: 'CRYPTO:BTC', name: 'Bitcoin' })).toBe('bitcoin.org');
    });
  });
});
