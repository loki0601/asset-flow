/**
 * Client-side per-day FX rate cache. Mirror of the server's fx_history
 * table. Used by computePortfolioFlow to apply the rate that was actually
 * in effect on each historical date, not a single snapshot.
 */

import { getDb, persistDb } from '@/lib/db';

export interface FxHistoryRow {
  date: string; // YYYY-MM-DD
  rate: number;
}

export const fxHistoryRepo = {
  append(pair: string, rows: FxHistoryRow[]): void {
    if (rows.length === 0) return;
    const db = getDb();
    db.exec('BEGIN');
    try {
      const stmt = db.prepare(
        'INSERT INTO fx_history (pair, date, rate) VALUES (?, ?, ?) ' +
          'ON CONFLICT(pair, date) DO UPDATE SET rate = excluded.rate',
      );
      try {
        for (const r of rows) stmt.run([pair, r.date, r.rate]);
      } finally {
        stmt.free();
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    persistDb();
  },

  /**
   * Returns the rate for the given date, or the closest earlier date if
   * the exact day is missing (weekends/holidays). Returns null only when
   * no row predates the date.
   */
  rateOn(pair: string, date: string): number | null {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT rate FROM fx_history WHERE pair = ? AND date <= ? ORDER BY date DESC LIMIT 1',
    );
    try {
      stmt.bind([pair, date]);
      if (stmt.step()) return stmt.get()[0] as number;
      return null;
    } finally {
      stmt.free();
    }
  },

  getMaxDate(pair: string): string | null {
    const db = getDb();
    const stmt = db.prepare('SELECT MAX(date) as d FROM fx_history WHERE pair = ?');
    try {
      stmt.bind([pair]);
      if (stmt.step()) {
        const v = stmt.get()[0];
        return v == null ? null : (v as string);
      }
      return null;
    } finally {
      stmt.free();
    }
  },

  listAll(pair: string): FxHistoryRow[] {
    const db = getDb();
    const stmt = db.prepare(
      'SELECT date, rate FROM fx_history WHERE pair = ? ORDER BY date ASC',
    );
    const out: FxHistoryRow[] = [];
    try {
      stmt.bind([pair]);
      while (stmt.step()) {
        const row = stmt.getAsObject() as { date: string; rate: number };
        out.push({ date: row.date, rate: row.rate });
      }
    } finally {
      stmt.free();
    }
    return out;
  },
};
