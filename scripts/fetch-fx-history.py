#!/usr/bin/env python3
"""One-shot 5-year FX backfill into server.db.fx_history.

Usage:
  .venv/bin/python scripts/fetch-fx-history.py --pair USDKRW --years 5

Idempotent (INSERT OR REPLACE on (pair, date)). Run again any time to
re-sync — the regular daily cron handles ongoing inserts via
fetch-prices.py.
"""
from __future__ import annotations

import argparse
import math
import sqlite3
import sys
from datetime import date, timedelta
from pathlib import Path

import FinanceDataReader as fdr

SERVER_DB = Path(__file__).resolve().parents[1] / "data" / "server.db"

PAIR_TO_FDR = {
    "USDKRW": "USD/KRW",
}


def fetch(pair: str, years: int) -> list[tuple[str, float]]:
    code = PAIR_TO_FDR.get(pair)
    if not code:
        raise ValueError(f"unsupported pair {pair!r}")
    start = (date.today() - timedelta(days=years * 366)).isoformat()
    df = fdr.DataReader(code, start)
    rows: list[tuple[str, float]] = []
    for ts, row in df.iterrows():
        rate = float(row.get("Close", 0) or 0)
        if rate <= 0 or math.isnan(rate):
            continue
        d = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
        rows.append((d, rate))
    return rows


def write_to_db(pair: str, rows: list[tuple[str, float]]) -> int:
    SERVER_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(SERVER_DB))
    try:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute(
            """CREATE TABLE IF NOT EXISTS fx_history (
                 pair TEXT NOT NULL,
                 date TEXT NOT NULL,
                 rate REAL NOT NULL,
                 PRIMARY KEY (pair, date)
               )"""
        )
        con.executemany(
            "INSERT OR REPLACE INTO fx_history (pair, date, rate) VALUES (?, ?, ?)",
            [(pair, d, r) for d, r in rows],
        )
        con.commit()
        cnt = con.execute(
            "SELECT COUNT(*), MIN(date), MAX(date) FROM fx_history WHERE pair = ?",
            (pair,),
        ).fetchone()
        return cnt
    finally:
        con.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pair", default="USDKRW")
    ap.add_argument("--years", type=int, default=5)
    args = ap.parse_args()

    print(f"Fetching {args.pair} for {args.years}y…", file=sys.stderr)
    rows = fetch(args.pair, args.years)
    print(f"  got {len(rows)} rows", file=sys.stderr)
    if not rows:
        return 1
    count, min_d, max_d = write_to_db(args.pair, rows)
    print(f"server.db.fx_history[{args.pair}]: {count} rows, {min_d} ~ {max_d}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
