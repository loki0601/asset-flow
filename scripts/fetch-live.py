"""
Live-quote fetcher for the manual "시세 동기화" button.

Usage:
  python scripts/fetch-live.py --symbols NASDAQ:AAPL,KRX:005930,CRYPTO:BTC

Output (stdout, JSON):
  {
    "asOf": "2026-05-18T14:00:00+09:00",
    "prices": {
      "NASDAQ:AAPL": {"price": 230.12, "change": 1.23, "changePct": 0.54, "date": "2026-05-19"},
      "KRX:005930": {"price": 72500, "change": -500, "changePct": -0.69, "date": "2026-05-18"}
    },
    "skipped": [
      {"symbol": "KRX:GOLD", "reason": "market-closed"}
    ]
  }

Side effect: upserts the same rows into server.db.price_history so the
asset-flow chart includes the live tick.

Market-hour gating mirrors src/lib/marketHours.ts (KRX weekday 09:00–15:30
KST, US KST 22:30–05:00 weekday US session, crypto 24/7). When a symbol's
market is closed, we report 'market-closed' and skip the upstream fetch
entirely to keep yfinance/Naver from rate-limiting us on no-op requests.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
DB_PATH = Path(__file__).resolve().parents[1] / "data/server.db"


# ─── Market classification & windows (mirror src/lib/marketHours.ts) ────

def classify(symbol: str) -> str:
    if symbol.startswith("KRX:"):
        return "KRX"
    if symbol.startswith("NASDAQ:") or symbol.startswith("NYSE:"):
        return "US"
    if symbol.startswith("CRYPTO:") or ":" not in symbol:
        return "CRYPTO"
    return "UNKNOWN"


def in_live_window(symbol: str, now: datetime) -> bool:
    kind = classify(symbol)
    if kind == "CRYPTO":
        return True
    if kind == "UNKNOWN":
        return False
    kst = now.astimezone(KST)
    wd = kst.weekday()  # Mon=0 ... Sun=6
    minutes = kst.hour * 60 + kst.minute
    if kind == "KRX":
        if wd >= 5:  # Sat/Sun
            return False
        return 9 * 60 <= minutes <= 15 * 60 + 30
    # US: KR weekday Mon (US Sun=no session); use cron convention.
    if minutes >= 22 * 60 + 30:
        # KR evening — US session just opened today (US trading day = KR today).
        # Block KR Sat (=US Fri close already done) and KR Sun (=US Sat, no session).
        if wd == 5 or wd == 6:
            return False
        return True
    if minutes < 5 * 60:
        # KR early morning — US session of "yesterday US" still running.
        # Block KR Sun (US-Sat) and KR Mon (US-Sun).
        if wd == 6 or wd == 0:
            return False
        return True
    return False


def live_date(symbol: str, now: datetime) -> str:
    kst = now.astimezone(KST)
    if classify(symbol) != "US":
        return kst.date().isoformat()
    minutes = kst.hour * 60 + kst.minute
    if minutes >= 22 * 60 + 30:
        return (kst.date() + timedelta(days=1)).isoformat()
    return kst.date().isoformat()


# ─── Upstream fetchers ─────────────────────────────────────────────────


def previous_close(conn: sqlite3.Connection, symbol: str, before_date: str) -> float | None:
    cur = conn.execute(
        "SELECT close FROM price_history WHERE symbol = ? AND date < ? "
        "ORDER BY date DESC LIMIT 1",
        (symbol, before_date),
    )
    row = cur.fetchone()
    return float(row[0]) if row else None


def fetch_us(symbols: list[str]) -> dict[str, float]:
    """Return {symbol: live_price} via yfinance bulk download."""
    if not symbols:
        return {}
    try:
        import yfinance as yf
    except ImportError as e:
        print(f"yfinance not available: {e}", file=sys.stderr)
        return {}
    tickers = [s.split(":", 1)[1] for s in symbols]
    try:
        # Use fast_info per ticker — bulk download often returns end-of-day
        # bars only. fast_info gives the live last price.
        out: dict[str, float] = {}
        for sym, tk in zip(symbols, tickers):
            try:
                fi = yf.Ticker(tk).fast_info
                px = float(fi.get("last_price") or fi.get("lastPrice"))
                if px > 0:
                    out[sym] = px
            except Exception as e:
                print(f"  yfinance live {tk} failed: {e}", file=sys.stderr)
        return out
    except Exception as e:
        print(f"yfinance bulk live failed: {e}", file=sys.stderr)
        return {}


def fetch_krx(symbols: list[str]) -> dict[str, float]:
    """Naver finance live JSON per ticker. KRX:005930 → code 005930."""
    out: dict[str, float] = {}
    headers = {
        "User-Agent": "Mozilla/5.0 AssetFlow/1.0",
        "Referer": "https://finance.naver.com/",
    }
    for s in symbols:
        if s == "KRX:GOLD":
            # Naver finance gold daily-quote scrape — same as cron path.
            try:
                req = urllib.request.Request(
                    "https://finance.naver.com/marketindex/goldDailyQuote.naver",
                    headers=headers,
                )
                html = urllib.request.urlopen(req, timeout=8).read().decode("euc-kr", errors="replace")
                m = re.search(r'<td class="num">([\d,\.]+)</td>', html)
                if m:
                    out[s] = float(m.group(1).replace(",", ""))
            except Exception as e:
                print(f"  KRX:GOLD live failed: {e}", file=sys.stderr)
            continue
        code = s.split(":", 1)[1]
        try:
            url = f"https://api.finance.naver.com/siseJson.naver?symbol={code}&requestType=0&count=1&timeframe=day"
            req = urllib.request.Request(url, headers=headers)
            body = urllib.request.urlopen(req, timeout=6).read().decode("euc-kr", errors="replace")
            # Response columns: [date, open, high, low, CLOSE, volume, foreign%].
            # During intraday the "close" column is the live current price,
            # which is what we want — not the open.
            m = re.search(
                r'\[\s*"\d{8}"\s*,\s*[\d\.]+\s*,\s*[\d\.]+\s*,\s*[\d\.]+\s*,\s*([\d\.]+)',
                body,
            )
            if m:
                out[s] = float(m.group(1))
        except Exception as e:
            print(f"  KRX {code} live failed: {e}", file=sys.stderr)
    return out


def fetch_crypto(symbols: list[str]) -> dict[str, float]:
    """CoinGecko spot. Symbol convention: CRYPTO:BTC → coingecko id 'bitcoin'.
    The catalog already maps ticker→id; we keep a tiny inline mapping for the
    common ones to avoid an extra round-trip."""
    ID_MAP = {
        "BTC": "bitcoin", "ETH": "ethereum", "USDT": "tether", "BNB": "binancecoin",
        "SOL": "solana", "XRP": "ripple", "USDC": "usd-coin", "ADA": "cardano",
        "DOGE": "dogecoin", "AVAX": "avalanche-2", "TRX": "tron", "DOT": "polkadot",
        "MATIC": "matic-network", "LINK": "chainlink", "TON": "the-open-network",
    }
    if not symbols:
        return {}
    ids: list[str] = []
    sym_to_id: dict[str, str] = {}
    for s in symbols:
        ticker = s.split(":", 1)[1] if ":" in s else s
        cid = ID_MAP.get(ticker)
        if cid:
            sym_to_id[s] = cid
            ids.append(cid)
    if not ids:
        return {}
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={','.join(ids)}&vs_currencies=krw"
        body = urllib.request.urlopen(urllib.request.Request(url), timeout=6).read().decode()
        data = json.loads(body)
        out: dict[str, float] = {}
        for sym, cid in sym_to_id.items():
            px = data.get(cid, {}).get("krw")
            if px:
                out[sym] = float(px)
        return out
    except Exception as e:
        print(f"crypto live failed: {e}", file=sys.stderr)
        return {}


# ─── Main ──────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", required=True, help="Comma-separated list")
    args = ap.parse_args()

    symbols = [s.strip() for s in args.symbols.split(",") if s.strip()]
    if not symbols:
        json.dump({"asOf": datetime.now(KST).isoformat(), "prices": {}, "skipped": []}, sys.stdout)
        return 0

    now = datetime.now(KST)

    # Partition symbols by (market, in_window).
    eligible: dict[str, list[str]] = {"KRX": [], "US": [], "CRYPTO": []}
    skipped: list[dict] = []
    for s in symbols:
        kind = classify(s)
        if kind == "UNKNOWN":
            skipped.append({"symbol": s, "reason": "unknown-market"})
            continue
        if not in_live_window(s, now):
            skipped.append({"symbol": s, "reason": "market-closed"})
            continue
        eligible[kind].append(s)

    live_prices = {}
    if eligible["US"]:
        live_prices.update(fetch_us(eligible["US"]))
    if eligible["KRX"]:
        live_prices.update(fetch_krx(eligible["KRX"]))
    if eligible["CRYPTO"]:
        live_prices.update(fetch_crypto(eligible["CRYPTO"]))

    # Upsert into price_history, compute dailyChange via previous_close.
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS price_history ("
            "symbol TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, "
            "PRIMARY KEY (symbol, date))"
        )
        result: dict[str, dict] = {}
        for sym, px in live_prices.items():
            d = live_date(sym, now)
            prev = previous_close(conn, sym, d) or px
            change = px - prev
            change_pct = (change / prev) * 100 if prev else 0.0
            conn.execute(
                "INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?) "
                "ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close",
                (sym, d, px),
            )
            result[sym] = {
                "price": px,
                "change": change,
                "changePct": change_pct,
                "date": d,
            }
        conn.commit()
    finally:
        conn.close()

    # Anything we tried to fetch but upstream returned nothing — surface it.
    for s in symbols:
        if s in result or any(sk["symbol"] == s for sk in skipped):
            continue
        skipped.append({"symbol": s, "reason": "fetch-failed"})

    json.dump(
        {"asOf": now.isoformat(), "prices": result, "skipped": skipped},
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
