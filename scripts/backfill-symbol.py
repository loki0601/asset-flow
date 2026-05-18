#!/usr/bin/env python3
"""Backfill daily-close history for a single symbol into server.db.

Invoked by `POST /api/prices/history/track` (the Next.js handler spawns this
script as a detached child process). Designed to be cheap to start, so we
favor `child_process.spawn` over a long-running sidecar.

Symbol prefix → primary source / 3-stage fallback:
  KRX:<code>          fdr.DataReader('<code>')        → pykrx (if KRX creds) → yfinance '<code>.KS'
  NASDAQ:<ticker>     fdr.DataReader('<ticker>')      → yfinance '<ticker>'  → stooq via fdr '<ticker>.US'
  NYSE:<ticker>       (same as NASDAQ)
  CRYPTO:<sym>        fdr.DataReader('<sym>/KRW')     → coingecko market_chart → yfinance '<sym>-USD'

On success: tracked_symbols.status='ready' (with source+last_close_date).
On all-failure: tracked_symbols.status='failed'.
INSERT OR IGNORE keeps re-runs idempotent.
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
import time
import traceback
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import FinanceDataReader as fdr  # primary, covers KR/US/crypto


DEFAULT_DB = Path(__file__).resolve().parents[1] / "data" / "server.db"
DEFAULT_YEARS = 10


# ─── Helpers ────────────────────────────────────────────────────────────


def parse_symbol(symbol: str) -> tuple[str, str]:
    if ":" not in symbol:
        raise ValueError(f"symbol must be PREFIX:CODE, got {symbol!r}")
    prefix, code = symbol.split(":", 1)
    return prefix, code


def to_rows(df, close_col: str = "Close") -> list[dict]:
    rows: list[dict] = []
    for ts, row in df.iterrows():
        try:
            close = float(row[close_col])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isnan(close) or math.isinf(close) or close <= 0:
            continue
        if hasattr(ts, "strftime"):
            d = ts.strftime("%Y-%m-%d")
        else:
            d = str(ts)[:10]
        rows.append({"date": d, "close": close})
    return rows


# ─── Source adapters ────────────────────────────────────────────────────


def src_fdr_direct(code: str, start: str, end: str) -> list[dict]:
    df = fdr.DataReader(code, start, end)
    return to_rows(df)


def src_fdr_kr_yahoo(code: str, start: str, end: str) -> list[dict]:
    # KR fallback via FDR's Yahoo backend.
    df = fdr.DataReader(f"{code}.KS", start, end)
    return to_rows(df)


def src_fdr_us_stooq(ticker: str, start: str, end: str) -> list[dict]:
    df = fdr.DataReader(f"{ticker}.US", start, end)
    return to_rows(df)


def src_pykrx(code: str, start: str, end: str) -> list[dict]:
    # pykrx ≥1.2.8 needs KRX creds for some endpoints; skipped silently when
    # the import or call fails.
    import os

    if not os.environ.get("KRX_ID") or not os.environ.get("KRX_PW"):
        raise RuntimeError("pykrx skipped: KRX_ID/KRX_PW not set")
    from pykrx import stock

    df = stock.get_market_ohlcv_by_date(
        start.replace("-", ""), end.replace("-", ""), code
    )
    rows: list[dict] = []
    for ts, row in df.iterrows():
        close = float(row.get("종가", 0) or 0)
        if close <= 0:
            continue
        rows.append({"date": ts.strftime("%Y-%m-%d"), "close": close})
    return rows


def src_yfinance(ticker: str, start: str, end: str) -> list[dict]:
    import yfinance as yf

    df = yf.download(ticker, start=start, end=end, progress=False, auto_adjust=False)
    if df.empty:
        return []
    # yfinance returns MultiIndex columns when one ticker; flatten:
    if hasattr(df.columns, "levels"):
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
    return to_rows(df)


def src_naver_krx_gold(years: int) -> list[dict]:
    """Scrape Naver finance daily quotes for KRX 금현물 (매매기준율 = KRW/g).

    Public, no auth required. Pages are descending (newest first), 10 rows
    each. Stops once we cover `years` worth of pages (~36 pages per year).
    """
    import re

    rows: list[dict] = []
    max_pages = years * 38  # slight buffer over 36 weekdays-only pages/yr
    for page in range(1, max_pages + 1):
        url = f"https://finance.naver.com/marketindex/goldDailyQuote.naver?page={page}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            html = urllib.request.urlopen(req, timeout=15).read().decode("euc-kr", errors="replace")
        except Exception as e:
            print(f"[naver-gold] page {page} fail: {e}", file=sys.stderr)
            break
        matches = re.findall(
            r'<td class="date">([\d.]+)</td>\s*<td class="num">([\d,\.]+)</td>',
            html,
        )
        if not matches:
            break
        for d, p in matches:
            iso = d.replace(".", "-")
            close = float(p.replace(",", ""))
            if close > 0:
                rows.append({"date": iso, "close": close})
    return rows


def src_coingecko(sym: str, days: int) -> list[dict]:
    # CoinGecko uses coin id (lowercased name), not just ticker. We resolve
    # via /coins/list once. days≤365 returns hourly; >365 returns daily — we
    # always want daily, so cap requests to 365-day chunks isn't viable for
    # 10-year backfill via this endpoint. Workaround: use market_chart/range
    # with from/to unix timestamps which always returns daily.
    coin_id = _coingecko_id_for(sym)
    if not coin_id:
        raise RuntimeError(f"coingecko: no coin matching ticker {sym!r}")
    now = int(time.time())
    frm = now - days * 86400
    url = (
        f"https://api.coingecko.com/api/v3/coins/{urllib.parse.quote(coin_id)}/market_chart/range"
        f"?vs_currency=krw&from={frm}&to={now}"
    )
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    rows: list[dict] = []
    seen: set[str] = set()
    for ms, price in payload.get("prices", []):
        d = datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d")
        if d in seen:
            continue
        seen.add(d)
        rows.append({"date": d, "close": float(price)})
    return rows


_COINGECKO_LIST_CACHE: list[dict] | None = None


def _coingecko_id_for(sym: str) -> str | None:
    global _COINGECKO_LIST_CACHE
    if _COINGECKO_LIST_CACHE is None:
        url = "https://api.coingecko.com/api/v3/coins/list?include_platform=false"
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"Accept": "application/json"}),
            timeout=30,
        ) as resp:
            _COINGECKO_LIST_CACHE = json.loads(resp.read().decode("utf-8"))
    sym_lc = sym.lower()
    # Prefer well-known mappings to avoid alt coins shadowing the canonical id.
    overrides = {"btc": "bitcoin", "eth": "ethereum", "sol": "solana", "xrp": "ripple"}
    if sym_lc in overrides:
        return overrides[sym_lc]
    for c in _COINGECKO_LIST_CACHE:
        if c.get("symbol", "").lower() == sym_lc:
            return c.get("id")
    return None


# ─── Fallback chain ─────────────────────────────────────────────────────


def fetch_history(symbol: str, years: int) -> tuple[list[dict], str]:
    prefix, code = parse_symbol(symbol)
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=years * 366)).isoformat()

    chain: list[tuple[str, callable]] = []
    # KRX:GOLD is a manual symbol (KRX 금현물). FDR would mis-route 'GOLD'
    # to Yahoo as a US gold-miner stock, so handle it explicitly first.
    if symbol == "KRX:GOLD":
        chain = [("naver-finance", lambda: src_naver_krx_gold(years))]
    elif prefix == "KRX":
        chain = [
            ("fdr", lambda: src_fdr_direct(code, start, end)),
            ("pykrx", lambda: src_pykrx(code, start, end)),
            ("yfinance.ks", lambda: src_yfinance(f"{code}.KS", start, end)),
        ]
    elif prefix in ("NASDAQ", "NYSE"):
        chain = [
            ("fdr", lambda: src_fdr_direct(code, start, end)),
            ("yfinance", lambda: src_yfinance(code, start, end)),
            ("stooq.us", lambda: src_fdr_us_stooq(code, start, end)),
        ]
    elif prefix == "CRYPTO":
        chain = [
            ("fdr", lambda: src_fdr_direct(f"{code}/KRW", start, end)),
            ("coingecko", lambda: src_coingecko(code, years * 366)),
            ("yfinance.usd", lambda: src_yfinance(f"{code}-USD", start, end)),
        ]
    else:
        raise ValueError(f"unsupported symbol prefix {prefix!r}")

    last_err: Exception | None = None
    for name, fn in chain:
        try:
            rows = fn()
            if rows:
                print(f"[backfill] {symbol} ← {name} ({len(rows)} rows)", file=sys.stderr)
                return rows, name
            print(f"[backfill] {symbol} {name}: empty result", file=sys.stderr)
        except Exception as e:
            last_err = e
            print(f"[backfill] {symbol} {name} failed: {e}", file=sys.stderr)
            continue
    raise RuntimeError(f"all sources failed for {symbol}: {last_err}")


# ─── DB writes ──────────────────────────────────────────────────────────


def write_to_db(db_path: Path, symbol: str, rows: list[dict], source: str) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(db_path))
    try:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute(
            """CREATE TABLE IF NOT EXISTS tracked_symbols (
                 symbol           TEXT PRIMARY KEY,
                 first_added_at   TEXT NOT NULL,
                 last_close_date  TEXT,
                 source           TEXT,
                 status           TEXT NOT NULL DEFAULT 'pending'
               )"""
        )
        con.execute(
            """CREATE TABLE IF NOT EXISTS price_history (
                 symbol TEXT NOT NULL,
                 date   TEXT NOT NULL,
                 close  REAL NOT NULL,
                 PRIMARY KEY (symbol, date)
               )"""
        )
        con.execute(
            """INSERT INTO tracked_symbols (symbol, first_added_at, status)
               VALUES (?, ?, 'pending')
               ON CONFLICT(symbol) DO NOTHING""",
            (symbol, datetime.now().isoformat()),
        )
        con.executemany(
            "INSERT OR IGNORE INTO price_history (symbol, date, close) VALUES (?, ?, ?)",
            [(symbol, r["date"], r["close"]) for r in rows],
        )
        last_date = max((r["date"] for r in rows), default=None)
        con.execute(
            "UPDATE tracked_symbols SET status='ready', source=?, last_close_date=? WHERE symbol=?",
            (source, last_date, symbol),
        )
        con.commit()
    finally:
        con.close()


def mark_failed(db_path: Path, symbol: str, reason: str) -> None:
    try:
        con = sqlite3.connect(str(db_path))
        con.execute(
            "UPDATE tracked_symbols SET status='failed', source=? WHERE symbol=?",
            (f"error:{reason[:200]}", symbol),
        )
        con.commit()
        con.close()
    except Exception:
        traceback.print_exc()


# ─── Entry ──────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", required=True)
    ap.add_argument("--years", type=int, default=DEFAULT_YEARS)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = ap.parse_args()

    try:
        rows, source = fetch_history(args.symbol, args.years)
    except Exception as e:
        print(f"[backfill] {args.symbol} ALL FAILED: {e}", file=sys.stderr)
        mark_failed(args.db, args.symbol, str(e))
        return 1

    write_to_db(args.db, args.symbol, rows, source)
    print(f"[backfill] {args.symbol} OK source={source} rows={len(rows)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
