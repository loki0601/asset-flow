#!/usr/bin/env python3
"""Fetch daily-close prices for every catalog symbol and emit
`src/server/data/prices.json`.

Cadence: run once a day after KRX close (≥15:30 KST). The Next.js server
reads the JSON at boot/refresh and serves it joined with the catalog.

Coverage:
  - KR stocks (KOSPI/KOSDAQ/KONEX): fdr.StockListing("KRX") — bulk
  - KR ETFs (KODEX/TIGER/etc.):     fdr.StockListing("ETF/KR") — bulk
  - Crypto (top 100):               CoinGecko /coins/markets — bulk
  - US stocks (NASDAQ/S&P500):      [TODO] FDR listings carry no price
    column, and per-ticker DataReader is too slow for 4k symbols.
    Tracked as a follow-up — add yfinance.download(...) batch later.
"""
from __future__ import annotations

import json
import math
import os
import re
import sqlite3
import sys
import urllib.request
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

import FinanceDataReader as fdr

OUT_PATH = Path(__file__).resolve().parents[1] / "src/server/data/prices.json"
SERVER_DB = Path(__file__).resolve().parents[1] / "data" / "server.db"
KST = timezone(timedelta(hours=9))
COINGECKO_URL = (
    "https://api.coingecko.com/api/v3/coins/markets"
    "?vs_currency=krw&order=market_cap_desc&per_page=100&page=1"
)


def safe_num(v) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(f) or math.isinf(f):
        return 0.0
    return f


def fetch_krx_stocks(prices: dict[str, dict]) -> None:
    df = fdr.StockListing("KRX")
    print(f"  KRX stocks: {len(df)}", file=sys.stderr)
    for _, row in df.iterrows():
        code = str(row["Code"]).strip()
        if not code:
            continue
        prices[f"KRX:{code}"] = {
            "price": safe_num(row.get("Close")),
            "change": safe_num(row.get("Changes")),
            "changePct": safe_num(row.get("ChagesRatio")),  # sic — FDR's typo
        }


def fetch_krx_etfs(prices: dict[str, dict]) -> None:
    df = fdr.StockListing("ETF/KR")
    print(f"  KRX ETFs:   {len(df)}", file=sys.stderr)
    for _, row in df.iterrows():
        code = str(row["Symbol"]).strip()
        if not code:
            continue
        prices[f"KRX:{code}"] = {
            "price": safe_num(row.get("Price")),
            "change": safe_num(row.get("Change")),
            "changePct": safe_num(row.get("ChangeRate")),
        }


def fetch_fx_rates() -> dict[str, float]:
    """Daily USD/KRW (and any other pairs added later). Also appends every
    fetched date into server.db.fx_history so the asset-flow chart can
    use per-day rates instead of one snapshot. FDR's 'USD/KRW' goes through
    Yahoo and trades 24/5 — weekend carries Friday's close."""
    try:
        start = (date.today() - timedelta(days=10)).isoformat()
        df = fdr.DataReader("USD/KRW", start)
        if df.empty:
            return {}
        # Persist every row in this window to fx_history (idempotent).
        if SERVER_DB.exists():
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
                pairs = []
                for ts, row in df.iterrows():
                    rate = float(row.get("Close", 0) or 0)
                    if rate <= 0 or math.isnan(rate):
                        continue
                    d = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
                    pairs.append(("USDKRW", d, rate))
                if pairs:
                    con.executemany(
                        "INSERT OR REPLACE INTO fx_history (pair, date, rate) VALUES (?, ?, ?)",
                        pairs,
                    )
                    con.commit()
                    print(f"  fx_history: upserted {len(pairs)} USDKRW rows", file=sys.stderr)
            finally:
                con.close()
        last = float(df["Close"].iloc[-1])
        print(f"  USD/KRW: {last:.2f}", file=sys.stderr)
        return {"USDKRW": last}
    except Exception as e:
        print(f"  USD/KRW fetch failed: {e}", file=sys.stderr)
        return {}


NAVER_GOLD_URL = (
    "https://api.stock.naver.com/marketindex/metals/M04020000/prices?page={page}&pageSize={size}"
)


def _num(s: object) -> float:
    return float(str(s).replace(",", ""))


def parse_naver_gold_prices(payload: object) -> list[dict]:
    """Naver 국내 금 (KRX 금현물, KRW/g) daily rows → [{date, close, change,
    changePct}], newest first. Malformed rows are skipped."""
    if not isinstance(payload, list):
        return []
    out: list[dict] = []
    for r in payload:
        try:
            date = str(r["localTradedAt"])[:10]
            close = _num(r["closePrice"])
        except (KeyError, TypeError, ValueError):
            continue
        if len(date) != 10 or close <= 0:
            continue
        try:
            change = _num(r.get("fluctuations", 0))
            pct = _num(r.get("fluctuationsRatio", 0))
        except ValueError:
            change, pct = 0.0, 0.0
        out.append({"date": date, "close": close, "change": change, "changePct": pct})
    return out


def fetch_naver_gold_rows(page: int = 1, size: int = 20) -> list[dict]:
    req = urllib.request.Request(
        NAVER_GOLD_URL.format(page=page, size=size), headers={"User-Agent": "Mozilla/5.0"}
    )
    return parse_naver_gold_prices(json.loads(urllib.request.urlopen(req, timeout=15).read()))


def fetch_krx_gold(prices: dict[str, dict]) -> None:
    """KRX 금현물 (KRW/g) via Naver's market-index JSON API. The legacy HTML
    page (goldDailyQuote.naver) returns HTTP 410 since 2026-09-18."""
    try:
        rows = fetch_naver_gold_rows()
    except Exception as e:
        print(f"  KRX:GOLD fetch failed: {e}", file=sys.stderr)
        return
    if not rows:
        print("  KRX:GOLD: no rows parsed", file=sys.stderr)
        return
    latest = rows[0]
    prices["KRX:GOLD"] = {
        "price": latest["close"],
        "change": latest["change"],
        "changePct": latest["changePct"],
    }
    print(
        f"  KRX:GOLD: {latest['close']} (Δ {latest['change']:+.2f}, "
        f"{latest['changePct']:+.2f}%, as of {latest['date']})",
        file=sys.stderr,
    )


def fetch_us_tracked(prices: dict[str, dict]) -> None:
    """Latest close (USD) for every NASDAQ:/NYSE: symbol that's marked
    status='ready' in tracked_symbols. Uses yfinance.bulk download — fast
    enough for the family-sized portfolio. Skips silently when server.db
    isn't present or no tracked US symbols exist yet."""
    if not SERVER_DB.exists():
        return
    con = sqlite3.connect(str(SERVER_DB))
    try:
        rows = con.execute(
            "SELECT symbol FROM tracked_symbols WHERE status='ready' AND "
            "(symbol LIKE 'NASDAQ:%' OR symbol LIKE 'NYSE:%')"
        ).fetchall()
    finally:
        con.close()
    # Keep each symbol's own exchange prefix — NYSE:DELL used to be written
    # back as NASDAQ:DELL, so the NYSE series silently stopped updating.
    symbols_of: dict[str, list[str]] = {}
    for (sym,) in rows:
        symbols_of.setdefault(sym.split(":", 1)[1], []).append(sym)
    tickers = list(symbols_of)
    if not tickers:
        return
    try:
        import yfinance as yf

        df = yf.download(
            " ".join(tickers), period="3d", progress=False, auto_adjust=False, group_by="ticker"
        )
    except Exception as e:
        print(f"  US bulk fetch failed: {e}", file=sys.stderr)
        return
    if df.empty:
        print("  US bulk: empty frame", file=sys.stderr)
        return
    appended = 0
    for tk in tickers:
        try:
            # yfinance group_by="ticker" gives df[ticker]['Close']; single
            # ticker collapses to df['Close'].
            ser = df[tk]["Close"] if (tk, "Close") in df.columns else df["Close"]
            valid = ser.dropna()
            if len(valid) < 2:
                continue
            close = float(valid.iloc[-1])
            prev = float(valid.iloc[-2])
            change = close - prev
            pct = (change / prev) * 100.0 if prev > 0 else 0.0
            ts = valid.index[-1]
            session = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
            for sym in symbols_of[tk]:
                prices[sym] = {
                    "price": close,
                    "change": change,
                    "changePct": pct,
                    "date": session,  # US session date of this close
                }
            appended += 1
        except Exception as e:
            print(f"  US:{tk} skipped: {e}", file=sys.stderr)
    print(f"  US tracked: {appended}/{len(tickers)} symbols", file=sys.stderr)


def merge_us_prices(prices: dict[str, dict], us_prices: dict[str, dict]) -> dict[str, dict]:
    """Return a new prices map with `us_prices` overlaid on `prices`.

    US (NASDAQ:/NYSE:) entries are replaced/added from the fresh post-close
    fetch; every other entry (KRX, crypto, …) is carried over untouched.
    Pure — neither input is mutated."""
    merged = dict(prices)
    merged.update(us_prices)
    return merged


def fetch_crypto(prices: dict[str, dict]) -> None:
    req = urllib.request.Request(COINGECKO_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    print(f"  Crypto:     {len(data)}", file=sys.stderr)
    for coin in data:
        sym = str(coin.get("symbol", "")).upper().strip()
        if not sym:
            continue
        price = safe_num(coin.get("current_price"))
        pct = safe_num(coin.get("price_change_percentage_24h"))
        change = price * pct / 100.0 if price else 0.0
        prices[f"CRYPTO:{sym}"] = {
            "price": price,
            "change": change,
            "changePct": pct,
        }


NAVER_KRX_BAR_URL = (
    "https://api.finance.naver.com/siseJson.naver"
    "?symbol=005930&requestType=0&count=1&timeframe=day"
)


def is_krx_trading_day(today: str, bar_dates: list[str]) -> bool:
    return today in set(bar_dates)


def latest_krx_bar_dates() -> list[str]:
    """Date of the newest KRX daily bar (Samsung Electronics as the probe —
    it trades every KRX session). On weekends/holidays this is the previous
    trading day, so `today in …` tells whether KRX traded today."""
    req = urllib.request.Request(
        NAVER_KRX_BAR_URL,
        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"},
    )
    body = urllib.request.urlopen(req, timeout=10).read().decode("euc-kr", errors="replace")
    return [f"{y}-{m}-{d}" for y, m, d in re.findall(r'"(\d{4})(\d{2})(\d{2})"', body)]


def krx_open_today(today_kst: str) -> bool:
    try:
        return is_krx_trading_day(today_kst, latest_krx_bar_dates())
    except Exception as e:
        weekday = date.fromisoformat(today_kst).weekday() < 5
        print(f"  KRX trading-day probe failed ({e}); weekday fallback={weekday}", file=sys.stderr)
        return weekday


def daily_close_rows(
    prices: dict[str, dict], ready: set[str], today_kst: str, krx_open: bool
) -> list[tuple[str, str, float]]:
    """Official closes the 15:35 KST job owns: KRX (only on KRX trading days)
    and crypto (24/7, KST date). US closes belong to the post-US-close job,
    dated by their US session."""
    rows: list[tuple[str, str, float]] = []
    for symbol in sorted(ready):
        p = prices.get(symbol)
        close = float((p or {}).get("price") or 0)
        if close <= 0:
            continue
        if symbol.startswith("CRYPTO:") or (symbol.startswith("KRX:") and krx_open):
            rows.append((symbol, today_kst, close))
    return rows


def us_close_rows(us_prices: dict[str, dict], ready: set[str]) -> list[tuple[str, str, float]]:
    rows: list[tuple[str, str, float]] = []
    for symbol, p in sorted(us_prices.items()):
        close = float(p.get("price") or 0)
        session = p.get("date")
        if symbol in ready and close > 0 and session:
            rows.append((symbol, str(session), close))
    return rows


def _connect_history() -> sqlite3.Connection:
    SERVER_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(SERVER_DB))
    con.execute("PRAGMA journal_mode=WAL")
    con.execute(
        """CREATE TABLE IF NOT EXISTS tracked_symbols (
             symbol TEXT PRIMARY KEY,
             first_added_at TEXT NOT NULL,
             last_close_date TEXT,
             source TEXT,
             status TEXT NOT NULL DEFAULT 'pending'
           )"""
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS price_history ("
        "symbol TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, "
        "PRIMARY KEY (symbol, date))"
    )
    con.execute("CREATE TABLE IF NOT EXISTS kr_business_days (date TEXT PRIMARY KEY)")
    return con


def ready_symbols() -> set[str]:
    if not SERVER_DB.exists():
        return set()
    con = _connect_history()
    try:
        return {r[0] for r in con.execute("SELECT symbol FROM tracked_symbols WHERE status='ready'")}
    finally:
        con.close()


def write_closes(rows: list[tuple[str, str, float]], krx_business_day: str | None = None) -> None:
    """Upsert official closes. Must OVERWRITE: an existing row for the same
    date can only be a stale value, and INSERT OR IGNORE used to keep it."""
    con = _connect_history()
    try:
        con.executemany(
            "INSERT INTO price_history (symbol, date, close) VALUES (?, ?, ?) "
            "ON CONFLICT(symbol, date) DO UPDATE SET close = excluded.close",
            rows,
        )
        con.executemany(
            "UPDATE tracked_symbols SET last_close_date = ? WHERE symbol = ? "
            "AND (last_close_date IS NULL OR last_close_date < ?)",
            [(d, s, d) for s, d, _ in rows],
        )
        if krx_business_day:
            con.execute("INSERT OR IGNORE INTO kr_business_days (date) VALUES (?)", (krx_business_day,))
        con.commit()
    finally:
        con.close()
    print(f"  wrote {len(rows)} official closes", file=sys.stderr)


def load_env_local(path: Path) -> dict[str, str]:
    """Tiny .env reader — supports KEY=VALUE per line, no quoting subtleties."""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def build_fcm_payload(action: str, title: str | None, body: str | None) -> dict:
    """Build the JSON body for /api/fcm/send. When title/body are both None
    the push is data-only (silent) — the client still runs its syncPrices
    handler but no notification is shown. Used by the dawn US-close refresh
    so it can update prices in the background without pinging the user."""
    payload: dict = {"action": action}
    if title is not None:
        payload["title"] = title
    if body is not None:
        payload["body"] = body
    return payload


def notify_devices_via_fcm(
    title: str | None = "AssetFlow",
    body: str | None = "장마감 시세가 업데이트됐어요",
) -> None:
    """POST /api/fcm/send with action=syncPrices so every registered device
    auto-runs the price sync after the bulk fetch finishes. Pass title=body=None
    for a silent (data-only) push. Best-effort: any failure (server down,
    secret missing, no tokens) is logged and skipped."""
    project_root = Path(__file__).resolve().parents[1]
    env = load_env_local(project_root / ".env.local")
    secret = env.get("FCM_SEND_SECRET") or os.environ.get("FCM_SEND_SECRET")
    if not secret:
        print("[fcm] FCM_SEND_SECRET missing; skipping push", file=sys.stderr)
        return
    body_bytes = json.dumps(build_fcm_payload("syncPrices", title, body)).encode()
    # Hit the local prod server directly so Cloudflare's WAF doesn't flag
    # the python User-Agent. Override via FCM_SEND_URL in .env.local if the
    # box runs the Next.js server on a different port.
    url = env.get("FCM_SEND_URL", "http://127.0.0.1:3500/api/fcm/send")
    req = urllib.request.Request(
        url,
        data=body_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
            "User-Agent": "AssetFlow-Cron/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            print(f"[fcm] {payload}", file=sys.stderr)
    except Exception as e:
        print(f"[fcm] send failed: {e}", file=sys.stderr)


def main() -> int:
    print("Fetching daily-close prices…", file=sys.stderr)
    global prices
    prices = {}
    fetch_krx_stocks(prices)
    fetch_krx_etfs(prices)
    fetch_krx_gold(prices)
    fetch_us_tracked(prices)
    fetch_crypto(prices)
    fx = fetch_fx_rates()

    today_kst = datetime.now(KST).date().isoformat()
    krx_open = krx_open_today(today_kst)
    print(f"  KRX trading day {today_kst}: {krx_open}", file=sys.stderr)
    write_closes(
        daily_close_rows(prices, ready_symbols(), today_kst, krx_open),
        krx_business_day=today_kst if krx_open else None,
    )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "as_of": datetime.now(KST).isoformat(timespec="seconds"),
        "count": len(prices),
        "prices": prices,
        "fx": fx,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"wrote {len(prices)} prices → {OUT_PATH}", file=sys.stderr)

    notify_devices_via_fcm()
    return 0


def run_us_only() -> int:
    """Post-US-close refresh (~05:40 KST). The 15:35 batch runs before the
    US session for that KST day opens (US opens 22:30 KST), so US symbols
    always lag a full session until next day's batch. This re-fetches only
    US closes and merges them into the existing prices.json, leaving KRX /
    crypto / fx untouched. Sends a *silent* (data-only) FCM push so devices
    background-refresh without a dawn notification."""
    print("Refreshing US closes (post-market)…", file=sys.stderr)
    if not OUT_PATH.exists():
        print("  prices.json missing — running full fetch instead", file=sys.stderr)
        return main()
    payload = json.loads(OUT_PATH.read_text())
    base_prices = payload.get("prices", {})
    us_prices: dict[str, dict] = {}
    fetch_us_tracked(us_prices)
    if not us_prices:
        print("  no US prices fetched; leaving prices.json unchanged", file=sys.stderr)
        return 0
    merged = merge_us_prices(base_prices, us_prices)
    payload["prices"] = merged
    payload["count"] = len(merged)
    payload["as_of"] = datetime.now(KST).isoformat(timespec="seconds")
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"  updated {len(us_prices)} US prices → {OUT_PATH}", file=sys.stderr)
    write_closes(us_close_rows(us_prices, ready_symbols()))
    # Silent push (no title/body) — refresh in the background, no dawn ping.
    notify_devices_via_fcm(title=None, body=None)
    return 0


if __name__ == "__main__":
    if "--us-only" in sys.argv[1:]:
        sys.exit(run_us_only())
    sys.exit(main())
