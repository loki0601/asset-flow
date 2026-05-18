/**
 * Client-side price-history repository, backed by the sql.js `price_history`
 * table. One row per (symbol, date) — daily close only. See docs/schema.md
 * (Phase: PR1, historical price tracking).
 */

import { getDb, persistDb } from '@/lib/db';

export interface PriceHistoryRow {
  date: string; // YYYY-MM-DD
  close: number;
}

function ensureDb() {
  return getDb();
}

export const priceHistoryRepo = {
  getMaxDate(symbol: string): string | null {
    const db = ensureDb();
    const stmt = db.prepare('SELECT MAX(date) as d FROM price_history WHERE symbol = ?');
    try {
      stmt.bind([symbol]);
      if (stmt.step()) {
        const v = stmt.get()[0];
        return v == null ? null : (v as string);
      }
      return null;
    } finally {
      stmt.free();
    }
  },

  listSince(symbol: string, from: string): PriceHistoryRow[] {
    const db = ensureDb();
    const stmt = db.prepare(
      'SELECT date, close FROM price_history WHERE symbol = ? AND date >= ? ORDER BY date ASC',
    );
    const out: PriceHistoryRow[] = [];
    try {
      stmt.bind([symbol, from]);
      while (stmt.step()) {
        const row = stmt.getAsObject() as { date: string; close: number };
        out.push({ date: row.date, close: row.close });
      }
    } finally {
      stmt.free();
    }
    return out;
  },

  append(symbol: string, rows: PriceHistoryRow[]): void {
    if (rows.length === 0) return;
    const db = ensureDb();
    db.exec('BEGIN');
    try {
      const stmt = db.prepare(
        'INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?) ' +
          'ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close',
      );
      try {
        for (const r of rows) stmt.run([symbol, r.date, r.close]);
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

  deleteSymbol(symbol: string): void {
    const db = ensureDb();
    db.run('DELETE FROM price_history WHERE symbol = ?', [symbol]);
    persistDb();
  },
};
