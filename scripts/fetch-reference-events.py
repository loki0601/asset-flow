"""
Daily collector for "reference events" — the date-bound market signals the
Insights tab will surface. Runs from launchd once a day.

Event kinds:
  - ipo            : priced IPOs (NASDAQ IPO calendar)
  - lockup_expiry  : 10-day warning + D-Day, only for NASDAQ-100 members
  - index_addition : NASDAQ-100 / S&P 500 inclusions (manual seed for now —
                     index providers don't expose a public API)
  - index_removal  : same source as index_addition
  - earnings       : reserved (not yet pulled)

Sources currently used:
  - https://api.nasdaq.com/api/ipo/calendar (priced + upcoming)
  - https://api.nasdaq.com/api/quote/list-type/nasdaq100 (NDX members)
  - https://ir.nasdaq.com/rss/news-releases.xml (NDX rebalance announcements)
    Parsed via local `codex exec` for format-tolerant extraction.

Lock-up policy: a 180-day post-pricing lockup is only meaningful for names
the market actually watches, so we restrict lockup_expiry events to NASDAQ-100
members and emit two rows per qualifying IPO — D-10 (warning) and D-Day. The
NDX membership table is refreshed every run, so additions/removals propagate
within a day.

The script is idempotent: INSERT OR REPLACE on (id) keeps last-known state
fresh and prunes stale lock-up dates if an IPO date got corrected.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))
DB_PATH = Path(__file__).resolve().parents[1] / "data/server.db"

# Static seed events used until we wire up a press-release scraper. Edit
# this list whenever NASDAQ-100 announces a rebalance — the cron picks it up
# next run.
SEED_EVENTS: list[dict] = [
    # Example structure; uncomment and fill in real entries.
    # {
    #     "kind": "index_addition",
    #     "symbol": "PLTR",
    #     "name": "Palantir Technologies",
    #     "date": "2026-12-19",
    #     "title": "NASDAQ-100 annual rebalance — PLTR 편입 후보",
    #     "detail": "2026 연말 리밸런싱에서 PLTR 편입 후보. 편입 시 QQQ가 약 ~$N 매수.",
    #     "impact": "bullish",
    #     "confidence": "estimated",
    #     "source": "https://indexes.nasdaqomx.com",
    #     "tags": ["nasdaq100", "rebalance"],
    # },
]


# ─── Fetchers ──────────────────────────────────────────────────────────


def fetch_nasdaq_ipos(month_iso: str) -> list[dict]:
    """Returns the priced + upcoming IPO entries for the given YYYY-MM."""
    url = f"https://api.nasdaq.com/api/ipo/calendar?date={month_iso}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 AssetFlow/1.0",
            "Accept": "application/json",
            "Origin": "https://www.nasdaq.com",
            "Referer": "https://www.nasdaq.com/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8")
    except urllib.error.URLError as e:
        print(f"  ipo fetch {month_iso} failed: {e}", file=sys.stderr)
        return []
    try:
        data = json.loads(body).get("data") or {}
    except json.JSONDecodeError as e:
        print(f"  ipo decode {month_iso} failed: {e}", file=sys.stderr)
        return []
    return extract_ipo_rows(data)


def _section_rows(block: object) -> list[dict]:
    """NASDAQ is inconsistent about where a section's rows live: `priced` and
    `filed` expose `rows` directly, but `upcoming` nests them one level deeper
    under `upcomingTable.rows`. Return rows from whichever shape is present."""
    if not isinstance(block, dict):
        return []
    if isinstance(block.get("rows"), list):
        return block["rows"]
    for value in block.values():
        if isinstance(value, dict) and isinstance(value.get("rows"), list):
            return value["rows"]
    return []


def extract_ipo_rows(data: dict) -> list[dict]:
    """priced + upcoming IPO rows, each tagged with `_section`.

    The "filed" section is intentionally skipped — S-1 filings can be 6–18
    months out and rarely drive short-term action; they used to dominate the
    IPO category as noise. "priced" (deal closed) + "upcoming" (pricing this
    week — where e.g. SpaceX/SPCX shows up) are what we keep.
    """
    out: list[dict] = []
    for key in ("priced", "upcoming"):
        for row in _section_rows(data.get(key)):
            # Common fields: proposedTickerSymbol, companyName, pricedDate
            # (priced) or expectedPriceDate (upcoming), proposedSharePrice
            row["_section"] = key
            out.append(row)
    return out


def fetch_nasdaq100_rows() -> list[dict]:
    """Fetch NASDAQ-100 components from api.nasdaq.com, returning the raw rows
    (symbol, companyName, marketCap, lastSalePrice, …). Empty list on failure."""
    url = "https://api.nasdaq.com/api/quote/list-type/nasdaq100"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 AssetFlow/1.0",
            "Accept": "application/json",
            "Origin": "https://www.nasdaq.com",
            "Referer": "https://www.nasdaq.com/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8")
    except urllib.error.URLError as e:
        print(f"  nasdaq100 fetch failed: {e}", file=sys.stderr)
        return []
    try:
        data = json.loads(body).get("data") or {}
    except json.JSONDecodeError as e:
        print(f"  nasdaq100 decode failed: {e}", file=sys.stderr)
        return []
    return (data.get("data") or {}).get("rows") or []


def fetch_nasdaq100_members() -> set[str]:
    """Convenience wrapper: just the ticker set."""
    rows = fetch_nasdaq100_rows()
    return {(r.get("symbol") or "").strip().upper() for r in rows if r.get("symbol")}


def top_ndx_by_mcap(rows: list[dict], n: int) -> list[tuple[str, str, float]]:
    """Pick the top N NDX members by market cap. Rows missing/unparsable mcap
    drop to the bottom."""
    out: list[tuple[str, str, float]] = []
    for r in rows:
        sym = (r.get("symbol") or "").strip().upper()
        if not sym:
            continue
        name = (r.get("companyName") or sym).strip()
        # Strip "Common Stock" suffix that NASDAQ tacks on to most names.
        name = re.sub(r"\s+Common Stock$", "", name)
        mcap = parse_amount(str(r.get("marketCap") or ""))
        out.append((sym, name, mcap))
    out.sort(key=lambda x: x[2], reverse=True)
    return out[:n]


def parse_us_date(s: str | None) -> str | None:
    """NASDAQ returns dates like '5/16/2026' or 'MM/DD/YYYY'."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ─── Mapping IPO rows → events ─────────────────────────────────────────


def make_id(kind: str, symbol: str | None, date_iso: str, suffix: str = "") -> str:
    raw = f"{kind}|{symbol or '-'}|{date_iso}|{suffix}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


SPAC_PATTERNS = (
    "acquisition corp",
    "acquisition holdings",
    "acquisition company",
    "acquisition i corp",   # roman numeral variants
    "acquisition ii corp",
    "acquisition iii corp",
    "acquisition iv corp",
    "acquisition v corp",
    "acquisition vi corp",
    "blank check",
    "capital acquisition",
    "silverbox corp",      # numbered SPAC sponsors
    "gigcapital",
    "concord acquisition",
    "ajax capital",
)
MIN_IPO_RAISE_USD = 100_000_000  # $100M minimum raise — filters out micro-IPOs


def is_spac(name: str, symbol: str | None = None) -> bool:
    n = name.lower()
    if any(p in n for p in SPAC_PATTERNS):
        return True
    # The literal acronym "SPAC" as a whole word — NOT as a substring, or
    # "SPACE EXPLORATION TECHNOLOGIES" (SpaceX) gets misflagged via "spac"⊂"space".
    if re.search(r"\bspac\b", n):
        return True
    # Generic catch: company name contains the word "acquisition" — SPACs are
    # the only common entity type that bakes that word into the corporate name.
    if " acquisition" in n or n.startswith("acquisition "):
        return True
    # Ticker pattern: SPAC units almost always end in U (e.g., NWAXU, SBXEU).
    # Real operating companies almost never have this suffix on NASDAQ.
    if symbol:
        s = symbol.upper()
        if s.endswith("U") and len(s) >= 4 and not s.endswith("EU") and not s in {"NPSCU"}:
            return True
        if s.endswith("WS") or s.endswith("RT"):  # warrants/rights
            return True
    return False


def parse_amount(s: str) -> float:
    """'10,000,000' or '$1.5B' or '15.50' → float (best-effort)."""
    if not s:
        return 0.0
    s = s.strip().replace("$", "").replace(",", "").replace(" ", "")
    mult = 1.0
    if s.endswith("B") or s.endswith("b"):
        mult = 1e9
        s = s[:-1]
    elif s.endswith("M") or s.endswith("m"):
        mult = 1e6
        s = s[:-1]
    elif s.endswith("K") or s.endswith("k"):
        mult = 1e3
        s = s[:-1]
    try:
        return float(s) * mult
    except ValueError:
        return 0.0


def rows_to_ipo_events(rows: list[dict], nasdaq100: set[str]) -> list[dict]:
    """Convert NASDAQ IPO calendar rows → ipo + lockup_expiry events.

    Lockup events are only emitted for symbols in `nasdaq100` (current NDX
    members), and we emit two per qualifying IPO: D-10 warning and D-Day.
    Past lockup dates are skipped — they're not actionable.
    """
    today = date.today()
    events: list[dict] = []
    for row in rows:
        section = row.get("_section", "")
        symbol = (row.get("proposedTickerSymbol") or "").strip().upper() or None
        name = (row.get("companyName") or "").strip()
        if not name:
            continue
        # Filter 1: SPACs / blank-check companies — almost always noise for
        # the retail investor we serve.
        if is_spac(name, symbol):
            continue
        d = parse_us_date(
            row.get("pricedDate") or row.get("expectedPriceDate") or row.get("filedDate"),
        )
        if not d:
            continue
        price = (row.get("proposedSharePrice") or "").strip()
        shares = (row.get("sharesOffered") or "").strip()

        # Filter 2: raise amount threshold. Some rows lack share count
        # (filed-only) — in that case we keep them since we can't decide.
        raise_usd = 0.0
        # nasdaq sometimes pre-computes the deal value in `dollarValueOfSharesOffered`
        explicit_value = (
            row.get("dollarValueOfSharesOffered")
            or row.get("dealAmount")
            or ""
        )
        if explicit_value:
            raise_usd = parse_amount(explicit_value)
        elif price and shares:
            raise_usd = parse_amount(price) * parse_amount(shares)
        if raise_usd > 0 and raise_usd < MIN_IPO_RAISE_USD:
            continue

        title_kind = {
            "priced": "IPO 가격 확정",
            "upcoming": "IPO 예정",
            "filed": "S-1 접수",
        }.get(section, "IPO 이벤트")
        title_sym = f" · {symbol}" if symbol else ""
        title = f"{name}{title_sym} — {title_kind}"
        detail_parts = [f"{name}"]
        if symbol:
            detail_parts.append(f"심볼 {symbol}")
        if price:
            detail_parts.append(f"공모가 {price}")
        if shares:
            detail_parts.append(f"발행 {shares}주")
        detail = " · ".join(detail_parts)

        events.append({
            "id": make_id("ipo", symbol, d, section),
            "kind": "ipo",
            "symbol": symbol,
            "name": name,
            "date": d,
            "title": title,
            "detail": detail,
            "impact": "neutral",
            "confidence": "confirmed" if section == "priced" else "estimated",
            "source": "https://www.nasdaq.com/market-activity/ipos",
            "tags": json.dumps([section]),
        })

        # Derive lock-up expiry for priced IPOs that joined NASDAQ-100.
        # Two events per qualifying IPO: D-10 (warning) and D-Day.
        if section == "priced" and symbol and symbol in nasdaq100:
            pricing_dt = datetime.strptime(d, "%Y-%m-%d").date()
            dday = pricing_dt + timedelta(days=180)
            d10 = dday - timedelta(days=10)
            common_detail = (
                f"{name}({symbol}) IPO 후 180일 락업 해제 — 인사이더·VC 보유분의 "
                f"매도 가능 시점. NASDAQ-100 편입 종목이라 공급 충격이 지수 차원의 "
                f"수급에 영향을 줄 수 있음."
            )
            for event_date, suffix, title_suffix in (
                (d10, "d10", "락업 해제 D-10"),
                (dday, "dday", "락업 해제 당일"),
            ):
                if event_date < today:
                    continue
                events.append({
                    "id": make_id("lockup_expiry", symbol, event_date.isoformat(), suffix),
                    "kind": "lockup_expiry",
                    "symbol": symbol,
                    "name": name,
                    "date": event_date.isoformat(),
                    "title": f"{name}{title_sym} — {title_suffix}",
                    "detail": common_detail,
                    "impact": "bearish",
                    "confidence": "estimated",
                    "source": "https://www.nasdaq.com/market-activity/ipos",
                    "tags": json.dumps(["lockup", "post-ipo", "nasdaq100", suffix]),
                })
    return events


# ─── Persistence ───────────────────────────────────────────────────────


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reference_events (
          id          TEXT PRIMARY KEY,
          kind        TEXT NOT NULL,
          symbol      TEXT,
          name        TEXT NOT NULL,
          date        TEXT NOT NULL,
          title       TEXT NOT NULL,
          detail      TEXT,
          impact      TEXT NOT NULL DEFAULT 'neutral',
          confidence  TEXT NOT NULL DEFAULT 'estimated',
          source      TEXT,
          tags        TEXT,
          added_at    TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reference_events_date ON reference_events (date)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reference_events_kind_date ON reference_events (kind, date)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS nasdaq100_members (
          symbol         TEXT PRIMARY KEY,
          last_seen_date TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS nasdaq100_daily (
          symbol         TEXT NOT NULL,
          date           TEXT NOT NULL,
          mcap_usd       REAL NOT NULL,
          last_price     REAL,
          rank_by_mcap   INTEGER NOT NULL,
          day_change_pct REAL,
          PRIMARY KEY (symbol, date)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ndx_daily_date ON nasdaq100_daily (date)"
    )
    conn.commit()


def upsert_nasdaq100_members(conn: sqlite3.Connection, members: set[str]) -> None:
    """Replace the NASDAQ-100 snapshot with the current member set.

    Naive INSERT OR UPDATE leaves removed symbols in the table forever,
    which made `diff_nasdaq100_events` re-fire the same removal day
    after day — once CSGP exits the index, the diff still sees it in
    `previous` (loaded from this table) AND missing from `current`,
    so it triggers a removal event every run.

    Replacing the entire set each run means `previous` accurately
    reflects yesterday's actual NDX-100 composition, and diff events
    fire exactly once at the membership transition.
    """
    if not members:
        return
    today_iso = date.today().isoformat()
    conn.execute("DELETE FROM nasdaq100_members")
    conn.executemany(
        "INSERT INTO nasdaq100_members (symbol, last_seen_date) VALUES (?, ?)",
        [(s, today_iso) for s in members],
    )
    conn.commit()


def load_nasdaq100_members(conn: sqlite3.Connection) -> set[str]:
    """Return the last persisted NDX-100 membership (or empty if first run /
    a previous fetch failed)."""
    rows = conn.execute("SELECT symbol FROM nasdaq100_members").fetchall()
    return {r[0] for r in rows}


def diff_nasdaq100_events(
    previous: set[str], current: set[str], today: date
) -> list[dict]:
    """Compare yesterday's snapshot vs today's. Anything in current but not
    previous = addition (effective today); anything in previous but not
    current = removal (effective today).

    Caller should skip the first run (previous empty) — otherwise the entire
    seed would look like additions.
    """
    if not previous:
        return []
    today_iso = today.isoformat()
    events: list[dict] = []
    for sym in sorted(current - previous):
        events.append({
            "id": make_id("index_addition", sym, today_iso, "ndx-diff"),
            "kind": "index_addition",
            "symbol": sym,
            "name": sym,
            "date": today_iso,
            "title": f"{sym} — NASDAQ-100 편입",
            "detail": (
                f"{sym} 가 오늘부로 NASDAQ-100 구성종목에 편입됨. "
                "QQQ 등 추종 ETF의 강제 매수 수요가 발생."
            ),
            "impact": "bullish",
            "confidence": "confirmed",
            "source": "https://www.nasdaq.com/market-activity/quotes/nasdaq-100-index",
            "tags": json.dumps(["nasdaq100", "diff", "addition"]),
        })
    for sym in sorted(previous - current):
        events.append({
            "id": make_id("index_removal", sym, today_iso, "ndx-diff"),
            "kind": "index_removal",
            "symbol": sym,
            "name": sym,
            "date": today_iso,
            "title": f"{sym} — NASDAQ-100 제외",
            "detail": (
                f"{sym} 가 오늘부로 NASDAQ-100 구성종목에서 제외됨. "
                "QQQ 등 추종 ETF의 강제 매도 수요가 발생."
            ),
            "impact": "bearish",
            "confidence": "confirmed",
            "source": "https://www.nasdaq.com/market-activity/quotes/nasdaq-100-index",
            "tags": json.dumps(["nasdaq100", "diff", "removal"]),
        })
    return events


def purge_lockup_events(conn: sqlite3.Connection) -> int:
    """Drop today-or-later lockup_expiry rows so we can rebuild them from
    current NDX membership. Past lockup events stay in the table until the
    90-day prune, so the app's "지난 이벤트 보기" toggle can surface them."""
    cur = conn.execute(
        "DELETE FROM reference_events WHERE kind = 'lockup_expiry' AND date >= ?",
        (date.today().isoformat(),),
    )
    conn.commit()
    return cur.rowcount


def upsert_events(conn: sqlite3.Connection, events: list[dict]) -> int:
    if not events:
        return 0
    now = datetime.now(KST).isoformat()
    cur = conn.cursor()
    cur.executemany(
        """
        INSERT INTO reference_events
          (id, kind, symbol, name, date, title, detail, impact, confidence, source, tags, added_at)
        VALUES
          (:id, :kind, :symbol, :name, :date, :title, :detail, :impact, :confidence, :source, :tags, :added_at)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          symbol = excluded.symbol,
          name = excluded.name,
          date = excluded.date,
          title = excluded.title,
          detail = excluded.detail,
          impact = excluded.impact,
          confidence = excluded.confidence,
          source = excluded.source,
          tags = excluded.tags
        """,
        [{**e, "added_at": now} for e in events],
    )
    conn.commit()
    return cur.rowcount


def prune_old(conn: sqlite3.Connection, days_back: int = 90) -> int:
    """Delete events older than today - days_back. Keeps the table tight."""
    cutoff = (date.today() - timedelta(days=days_back)).isoformat()
    cur = conn.execute("DELETE FROM reference_events WHERE date < ?", (cutoff,))
    conn.commit()
    return cur.rowcount


# ─── Macro scanner (US + key central bank events) ─────────────────────


MACRO_WINDOW_DAYS = 60

# Exact-match whitelist (country lower, event_name lower) → short Korean
# explainer. Names are compared lowercased after stripping whitespace, so the
# API's case variants (e.g., "PCE price index" vs "PCE Price Index") still
# collapse to the same key. The explainer doubles as the description shown
# in the timeline detail.
MACRO_SIGNALS: dict[tuple[str, str], str] = {
    # ── United States ────────────────────────────────────────────────
    ("united states", "fed funds rate"): "미국 기준금리 결정 — 시장 최대 임팩트",
    ("united states", "fed interest rate decision"): "미국 기준금리 결정 — 시장 최대 임팩트",
    ("united states", "nonfarm payrolls"): "미국 비농업 고용 — 노동시장 강도 핵심 지표",
    ("united states", "non-farm payrolls"): "미국 비농업 고용 — 노동시장 강도 핵심 지표",
    ("united states", "core cpi"): "미국 근원 소비자물가 — 변동성 큰 식품·에너지 제외 인플레",
    ("united states", "cpi"): "미국 소비자물가 — 인플레이션 헤드라인",
    ("united states", "core pce price index"): "미국 근원 PCE — Fed 가장 중시하는 인플레 지표",
    ("united states", "gdp"): "미국 경제성장률 — 분기 발표 헤드라인",
    ("united states", "ism manufacturing pmi"): "미국 제조업 PMI — 경기 선행 지표 (50 기준)",
    ("united states", "retail sales"): "미국 소매판매 — 소비 지출 트렌드",
    ("united states", "retail sales (mom)"): "미국 소매판매 — 소비 지출 트렌드",
    # ── South Korea ──────────────────────────────────────────────────
    ("south korea", "interest rate decision"): "한국 기준금리 결정",
    # ── Eurozone ─────────────────────────────────────────────────────
    ("euro area", "interest rate decision"): "ECB 기준금리 결정",
    ("euro area", "deposit facility rate"): "ECB 예금금리 결정",
    # ── China ────────────────────────────────────────────────────────
    ("china", "nbs manufacturing pmi"): "중국 공식 제조업 PMI — 글로벌 위험자산 심리",
}


_COUNTRY_KO = {
    "United States": "미국",
    "South Korea": "한국",
    "Euro Area": "유로존",
    "China": "중국",
}


def fetch_macro_for_day(day_iso: str) -> list[dict]:
    url = f"https://api.nasdaq.com/api/calendar/economicevents?date={day_iso}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 AssetFlow/1.0",
            "Accept": "application/json",
            "Origin": "https://www.nasdaq.com",
            "Referer": "https://www.nasdaq.com/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8")
    except urllib.error.URLError as e:
        print(f"  macro {day_iso} fetch failed: {e}", file=sys.stderr)
        return []
    try:
        data = json.loads(body).get("data") or {}
    except json.JSONDecodeError:
        return []
    return (data.get("rows") or [])


def _clean_value(s: str) -> str:
    """Strip HTML entities and whitespace from API actual/consensus fields."""
    if not s:
        return ""
    return s.replace("&nbsp;", "").replace("&amp;", "&").strip()


def _macro_description(country: str, event_name: str) -> str | None:
    """Return the Korean explainer if (country, event_name) matches an
    accepted signal, otherwise None."""
    key = (country.strip().lower(), event_name.strip().lower())
    return MACRO_SIGNALS.get(key)


def scan_macro_events(today: date, window_days: int = MACRO_WINDOW_DAYS) -> list[dict]:
    """Walk the economic calendar one day at a time, keeping only events that
    exact-match the curated whitelist. Dedups per (country, signal-key, date)
    so case variants of the same metric collapse to one event."""
    events: list[dict] = []
    seen: set[tuple[str, str, str]] = set()  # (country, lower-name, date)
    for offset in range(window_days):
        d = today + timedelta(days=offset)
        rows = fetch_macro_for_day(d.isoformat())
        for row in rows:
            country = (row.get("country") or "").strip()
            name = (row.get("eventName") or "").strip()
            if not country or not name:
                continue
            description = _macro_description(country, name)
            if not description:
                continue
            key = (country.lower(), name.lower(), d.isoformat())
            if key in seen:
                continue
            seen.add(key)
            gmt_time = (row.get("gmt") or "").strip()
            consensus = _clean_value(row.get("consensus") or "")
            previous = _clean_value(row.get("previous") or "")
            country_ko = _COUNTRY_KO.get(country, country)
            detail_parts: list[str] = [description]
            if gmt_time:
                detail_parts.append(f"GMT {gmt_time}")
            if consensus:
                detail_parts.append(f"컨센 {consensus}")
            if previous:
                detail_parts.append(f"이전 {previous}")
            events.append({
                "id": make_id("macro", country, d.isoformat(), name[:48]),
                "kind": "macro",
                "symbol": None,
                "name": name,
                "date": d.isoformat(),
                "title": f"{name} · {country_ko}",
                "detail": " · ".join(detail_parts),
                "impact": "neutral",
                "confidence": "estimated",
                "source": "https://www.nasdaq.com/market-activity/economic-calendar",
                "tags": json.dumps(
                    ["macro", country.replace(" ", "-").lower()]
                ),
            })
    return events


# ─── Earnings scanner (top-30 NDX-100 by mcap) ─────────────────────────


EARNINGS_WINDOW_DAYS = 60  # how far forward to scan the calendar


def fetch_earnings_for_day(day_iso: str) -> list[dict]:
    """One day of api.nasdaq.com earnings calendar. Empty on failure."""
    url = f"https://api.nasdaq.com/api/calendar/earnings?date={day_iso}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 AssetFlow/1.0",
            "Accept": "application/json",
            "Origin": "https://www.nasdaq.com",
            "Referer": "https://www.nasdaq.com/",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8")
    except urllib.error.URLError as e:
        print(f"  earnings {day_iso} fetch failed: {e}", file=sys.stderr)
        return []
    try:
        data = json.loads(body).get("data") or {}
    except json.JSONDecodeError:
        return []
    return (data.get("rows") or [])


_EARNINGS_TIME_KO = {
    "time-pre-market": "장 시작 전",
    "time-after-hours": "장 마감 후",
    "time-not-supplied": "시간 미정",
}


def scan_earnings_events(
    top30: list[tuple[str, str, float]],
    today: date,
    window_days: int = EARNINGS_WINDOW_DAYS,
) -> list[dict]:
    """Walk the earnings calendar one day at a time, keeping only rows whose
    symbol is in our top-30 NDX set. Each match becomes one earnings event."""
    if not top30:
        return []
    top_set = {sym for sym, _, _ in top30}
    name_lookup = {sym: name for sym, name, _ in top30}
    events: list[dict] = []
    seen_keys: set[tuple[str, str]] = set()  # (symbol, date) — each earnings reported once
    for offset in range(window_days):
        d = today + timedelta(days=offset)
        rows = fetch_earnings_for_day(d.isoformat())
        for row in rows:
            sym = (row.get("symbol") or "").strip().upper()
            if sym not in top_set:
                continue
            key = (sym, d.isoformat())
            if key in seen_keys:
                continue
            seen_keys.add(key)
            name = name_lookup.get(sym) or (row.get("name") or sym).strip()
            time_slot = _EARNINGS_TIME_KO.get(row.get("time") or "", "")
            eps_fc = (row.get("epsForecast") or "").strip()
            last_eps = (row.get("lastYearEPS") or "").strip()
            quarter = (row.get("fiscalQuarterEnding") or "").strip()
            detail_parts = [f"{quarter} 실적" if quarter else "분기 실적"]
            if time_slot:
                detail_parts.append(time_slot)
            if eps_fc:
                detail_parts.append(f"EPS 컨센 {eps_fc}")
            if last_eps:
                detail_parts.append(f"전년 EPS {last_eps}")
            events.append({
                "id": make_id("earnings", sym, d.isoformat(), "ndx30"),
                "kind": "earnings",
                "symbol": sym,
                "name": name,
                "date": d.isoformat(),
                "title": f"{name} ({sym}) — 실적 발표",
                "detail": " · ".join(detail_parts),
                "impact": "neutral",
                "confidence": "estimated",
                "source": f"https://www.nasdaq.com/market-activity/stocks/{sym.lower()}/earnings",
                "tags": json.dumps(["earnings", "ndx30"]),
            })
    return events


# ─── Momentum scanner (rank/price moves within NDX-100) ───────────────


# Conservative thresholds — chosen so the timeline doesn't drown in noise.
# At these levels we expect a few signals per week during volatile periods
# and near-zero during calm tape.
MOMENTUM_1D_PRICE_PCT = 5.0   # |day_change_pct| ≥ this triggers mcap-surge
MOMENTUM_1D_RANK_JUMP = 10    # rank improved by this many in 1d
MOMENTUM_5D_RANK_JUMP = 20    # rank improved by this many in 5d
TOP_BREAKOUT_BAND = 30        # crossing into/out of the top-N

# Hand-maintained sector map for cluster signals. NASDAQ's API leaves
# `sector` blank, so we fall back to a static dict. Only covers tickers
# whose group co-moves enough that "3 of these moved together" is a
# useful signal — pure individual names are left ungrouped.
SECTOR_MAP: dict[str, str] = {
    # Memory / storage
    "MU": "memory", "SNDK": "memory", "WDC": "memory", "STX": "memory",
    # Logic / CPU / GPU / accelerators
    "NVDA": "compute", "AMD": "compute", "INTC": "compute",
    "ARM": "compute", "AVGO": "compute", "MRVL": "compute", "QCOM": "compute",
    # Semi capital equipment
    "ASML": "semi-equip", "LRCX": "semi-equip", "AMAT": "semi-equip",
    "KLAC": "semi-equip",
    # Analog / power
    "TXN": "analog", "ADI": "analog", "MCHP": "analog", "ON": "analog",
    # Cybersecurity
    "CRWD": "cyber", "PANW": "cyber", "ZS": "cyber", "FTNT": "cyber",
    # Mega-cap platforms
    "GOOG": "platform", "GOOGL": "platform", "META": "platform",
    "AMZN": "platform", "MSFT": "platform", "AAPL": "platform",
}


def parse_pct(s: str) -> float | None:
    """'-6.62%' / '+5.21%' / '5.21%' → float (signed). None if unparseable."""
    if not s:
        return None
    m = re.search(r"-?\+?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        v = float(m.group(0).replace("+", ""))
    except ValueError:
        return None
    # The first character of the original after stripping whitespace tells
    # us the explicit sign if present.
    return v


def upsert_nasdaq100_daily(
    conn: sqlite3.Connection,
    rows: list[dict],
    today: date,
) -> list[dict]:
    """Persist a daily snapshot and return a list of {symbol, mcap, price,
    rank, day_change_pct} dicts in rank order."""
    today_iso = today.isoformat()
    enriched: list[dict] = []
    for r in rows:
        sym = (r.get("symbol") or "").strip().upper()
        if not sym:
            continue
        mcap = parse_amount(str(r.get("marketCap") or ""))
        price_str = str(r.get("lastSalePrice") or "")
        price_val = parse_amount(price_str) if price_str else None
        pct = parse_pct(str(r.get("percentageChange") or ""))
        name = (r.get("companyName") or sym).strip()
        name = re.sub(r"\s+Common Stock(?:\s+\([A-Z]{2}\))?$", "", name)
        name = re.sub(r"\s+(?:American Depositary Shares|New York Registry Shares|"
                      r"Ordinary Shares|Class A Common Stock(?: New)?|Class C Capital Stock)$",
                      "", name)
        enriched.append({
            "symbol": sym,
            "mcap": mcap,
            "price": price_val,
            "pct": pct,
            "name": name,
        })
    enriched.sort(key=lambda x: x["mcap"], reverse=True)
    for idx, e in enumerate(enriched, 1):
        e["rank"] = idx
    if enriched:
        conn.executemany(
            """
            INSERT INTO nasdaq100_daily
              (symbol, date, mcap_usd, last_price, rank_by_mcap, day_change_pct)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol, date) DO UPDATE SET
              mcap_usd       = excluded.mcap_usd,
              last_price     = excluded.last_price,
              rank_by_mcap   = excluded.rank_by_mcap,
              day_change_pct = excluded.day_change_pct
            """,
            [
                (e["symbol"], today_iso, e["mcap"], e["price"], e["rank"], e["pct"])
                for e in enriched
            ],
        )
        conn.commit()
    return enriched


def load_rank_history(
    conn: sqlite3.Connection,
    days_ago: int,
) -> dict[str, int]:
    """Return {symbol: rank} from the snapshot stored closest to
    `today - days_ago`. Returns the most recent snapshot at-or-before that
    target so weekends don't blank the lookup."""
    target = (date.today() - timedelta(days=days_ago)).isoformat()
    cutoff_low = (date.today() - timedelta(days=days_ago + 7)).isoformat()
    rows = conn.execute(
        """
        SELECT symbol, rank_by_mcap
        FROM nasdaq100_daily
        WHERE date <= ? AND date >= ?
          AND date = (
            SELECT MAX(date) FROM nasdaq100_daily d2
            WHERE d2.symbol = nasdaq100_daily.symbol AND d2.date <= ?
          )
        """,
        (target, cutoff_low, target),
    ).fetchall()
    return {sym: rank for sym, rank in rows}


# Number of top-by-mcap symbols to compare when deciding whether the NDX
# snapshot reflects a new US trading session. Pulling from the top keeps
# the comparison stable — those names always have fresh prices when the
# market trades, and they're never thinly-traded enough to skip a print.
_SESSION_PROBE_SIZE = 20
# Fraction of probed symbols that must match yesterday's pct for the
# snapshot to count as "same session" (US market hasn't traded since).
# 0.8 tolerates a handful of late-prints / data corrections without
# unfreezing the scanner.
_SESSION_SAME_THRESHOLD = 0.8
# Lookback budget when yesterday's row is missing (cron failure, fresh DB).
# We walk back at most this many days looking for *any* prior snapshot.
_SESSION_LOOKBACK_DAYS = 14


def is_new_us_session(
    snapshot: list[dict], conn: sqlite3.Connection, today: date
) -> bool:
    """Returns True iff `snapshot` represents a US trading day that hasn't
    yet been processed.

    Without this guard, weekend & US-holiday cron runs re-record the most
    recent Friday surge under each fresh KST date, producing duplicate
    momentum events (the cron fires daily; NASDAQ keeps serving the same
    `percentageChange` until a new US session ticks).

    Heuristic: if the top-N symbols' pct values match the most recent
    prior snapshot to within 0.01pp, the US market hasn't moved and we
    short-circuit. When no prior snapshot exists (fresh DB), fail open
    so the very first run still produces events.
    """
    if not snapshot:
        return False
    cur_by_symbol = {e["symbol"]: e.get("pct") for e in snapshot}
    today_iso = today.isoformat()
    # Walk back through dates looking for the latest stored snapshot
    # strictly before today. Skip today itself — upsert_nasdaq100_daily
    # writes today's row right before we're called, so reading `date < today`
    # is what gives us "yesterday's" baseline.
    cursor = conn.execute(
        "SELECT date FROM nasdaq100_daily WHERE date < ? "
        "ORDER BY date DESC LIMIT 1",
        (today_iso,),
    )
    row = cursor.fetchone()
    if row is None:
        return True  # no baseline — first run, treat as new session
    prev_date = row[0]
    # Bail if the only prior snapshot is way too old to compare against.
    try:
        prev_d = date.fromisoformat(prev_date)
        if (today - prev_d).days > _SESSION_LOOKBACK_DAYS:
            return True
    except ValueError:
        return True
    cursor = conn.execute(
        "SELECT symbol, day_change_pct FROM nasdaq100_daily WHERE date = ?",
        (prev_date,),
    )
    prev_pct = {sym: pct for sym, pct in cursor.fetchall()}
    if not prev_pct:
        return True
    # Probe the top-N by mcap from today's snapshot.
    probes = sorted(snapshot, key=lambda e: e.get("mcap") or 0, reverse=True)[:_SESSION_PROBE_SIZE]
    compared = 0
    matches = 0
    for e in probes:
        cur = cur_by_symbol.get(e["symbol"])
        prv = prev_pct.get(e["symbol"])
        if cur is None or prv is None:
            continue
        compared += 1
        if abs(cur - prv) < 0.01:
            matches += 1
    if compared < _SESSION_PROBE_SIZE // 2:
        # Too little overlap with the prior snapshot — symbol set drift,
        # treat as new session rather than silently skipping.
        return True
    return matches / compared < _SESSION_SAME_THRESHOLD


# How long a "milestone" momentum signal stays suppressed after first
# firing.  Top-30 breakout and 5-day rank jumps both rely on a lookback
# window, so the same condition persists for several consecutive days —
# without a cooldown the holdings card shows the same milestone every
# day for ~5 days (5d signals) or until the symbol falls back out of
# the top-30 (breakout).
MILESTONE_COOLDOWN_DAYS = 30


def already_emitted_recently(
    conn: sqlite3.Connection,
    symbol: str,
    tag: str,
    days: int = MILESTONE_COOLDOWN_DAYS,
    today: date | None = None,
) -> bool:
    """Returns True when the same (symbol, tag) momentum event has
    already been emitted in the last `days` days. Used to gate
    state-change signals like top-N breakout and 5d rank jumps so
    they don't re-fire every cron run while the trigger condition
    still holds.

    Defensive: returns False (allow emit) when the reference_events
    table doesn't exist yet — that's the first-ever cron run.
    """
    today = today or date.today()
    cutoff = (today - timedelta(days=days)).isoformat()
    try:
        cur = conn.execute(
            "SELECT 1 FROM reference_events WHERE kind = 'momentum' "
            "AND symbol = ? AND tags LIKE ? AND date >= ? LIMIT 1",
            (symbol, f'%"{tag}"%', cutoff),
        )
    except sqlite3.OperationalError:
        return False
    return cur.fetchone() is not None


def scan_momentum_events(
    snapshot: list[dict], conn: sqlite3.Connection, today: date
) -> list[dict]:
    """Build momentum events using today's snapshot + stored history.

    On the first run there's no history, so only the 1d price-change signals
    fire (they come from the live API field, not from our DB). Rank-jump
    signals start working from day 2; 5d rank-jumps from day 6.
    """
    if not snapshot:
        return []
    today_iso = today.isoformat()
    prev_1d = load_rank_history(conn, 1)
    prev_5d = load_rank_history(conn, 5)
    events: list[dict] = []

    for e in snapshot:
        sym, name = e["symbol"], e["name"]
        cur_rank = e["rank"]
        pct = e["pct"]
        sector = SECTOR_MAP.get(sym)
        tags_base = ["momentum"]
        if sector:
            tags_base.append(f"sector-{sector}")

        # 1d price surge (works on day 1)
        if pct is not None and abs(pct) >= MOMENTUM_1D_PRICE_PCT:
            direction = "급등" if pct > 0 else "급락"
            detail_parts = [
                f"단일 일 종가 기준 {direction} {abs(pct):.2f}%",
                f"시총 순위 {cur_rank}위",
            ]
            if sector:
                detail_parts.append(f"섹터: {_SECTOR_KO.get(sector, sector)}")
            detail_parts.append("단기 수급/뉴스 모멘텀 점검 필요")
            events.append(_mk_momentum_event(
                sym, name, today_iso,
                tag=f"price-{('up' if pct > 0 else 'down')}-1d",
                title=f"{name} ({sym}) — 단일 일 {direction} ({pct:+.2f}%)",
                detail=" · ".join(detail_parts),
                impact="bullish" if pct > 0 else "bearish",
                tags=tags_base,
            ))

        # 1d rank jump (requires day-2+)
        prev = prev_1d.get(sym)
        if prev:
            delta = prev - cur_rank  # positive = jumped up
            if delta >= MOMENTUM_1D_RANK_JUMP:
                events.append(_mk_momentum_event(
                    sym, name, today_iso,
                    tag="rank-up-1d",
                    title=f"{name} ({sym}) — 1일 만에 +{delta}랭크 점프 ({prev}→{cur_rank}위)",
                    detail=(
                        f"시총 순위 어제 {prev}위 → 오늘 {cur_rank}위 · "
                        f"+{delta} 상승 · 단기 자금 유입 시그널"
                    ),
                    impact="bullish",
                    tags=tags_base,
                ))
            elif -delta >= MOMENTUM_1D_RANK_JUMP:
                events.append(_mk_momentum_event(
                    sym, name, today_iso,
                    tag="rank-down-1d",
                    title=f"{name} ({sym}) — 1일 만에 -{-delta}랭크 하락 ({prev}→{cur_rank}위)",
                    detail=(
                        f"시총 순위 어제 {prev}위 → 오늘 {cur_rank}위 · "
                        f"{delta} 하락 · 단기 자금 유출 시그널"
                    ),
                    impact="bearish",
                    tags=tags_base,
                ))

        # 5d rank jump (requires day-6+). The 5-day window means the
        # same jump satisfies the threshold for ~5 consecutive cron
        # runs, so guard with the milestone cooldown to emit once per
        # episode rather than once per day.
        prev5 = prev_5d.get(sym)
        if prev5:
            delta5 = prev5 - cur_rank
            if delta5 >= MOMENTUM_5D_RANK_JUMP and not already_emitted_recently(
                conn, sym, "rank-up-5d", today=today
            ):
                events.append(_mk_momentum_event(
                    sym, name, today_iso,
                    tag="rank-up-5d",
                    title=f"{name} ({sym}) — 5일간 +{delta5}랭크 급등 ({prev5}→{cur_rank}위)",
                    detail=(
                        f"시총 순위 5일 전 {prev5}위 → 오늘 {cur_rank}위 · "
                        f"+{delta5} 상승 · 중기 자금 유입"
                    ),
                    impact="bullish",
                    tags=tags_base,
                ))

        # Top-N breakout (entered top-30 within the last day or 5 days).
        # Same problem as rank-up-5d — the "was outside ≤5 days ago"
        # condition lingers, so without a cooldown the same milestone
        # cards stack up day after day (5/29 APP + 5/30 APP regression).
        breakout_tag = f"top{TOP_BREAKOUT_BAND}-breakout"
        if cur_rank <= TOP_BREAKOUT_BAND:
            was_outside = (prev and prev > TOP_BREAKOUT_BAND) or (
                prev5 and prev5 > TOP_BREAKOUT_BAND
            )
            if was_outside and not already_emitted_recently(
                conn, sym, breakout_tag, today=today
            ):
                events.append(_mk_momentum_event(
                    sym, name, today_iso,
                    tag=breakout_tag,
                    title=f"{name} ({sym}) — NASDAQ-100 시총 TOP{TOP_BREAKOUT_BAND} 돌파",
                    detail=(
                        f"오늘 시총 {cur_rank}위 · TOP{TOP_BREAKOUT_BAND} 신규 진입 · "
                        "메가캡 그룹 합류"
                    ),
                    impact="bullish",
                    tags=tags_base,
                ))
    return events


SECTOR_CLUSTER_MIN = 3   # require this many same-direction movers to fire


def scan_sector_cluster_events(
    momentum_events: list[dict], today: date
) -> list[dict]:
    """Aggregate per-symbol momentum into sector-level meta signals.

    Returns one event per (sector, direction) pair where at least
    SECTOR_CLUSTER_MIN distinct symbols moved the same way today.
    """
    if not momentum_events:
        return []
    today_iso = today.isoformat()
    groups: dict[tuple[str, str], set[str]] = {}
    for e in momentum_events:
        sym = e.get("symbol")
        if not sym:
            continue
        sector = SECTOR_MAP.get(sym)
        if not sector:
            continue
        impact = e.get("impact")
        if impact == "bullish":
            direction = "up"
        elif impact == "bearish":
            direction = "down"
        else:
            continue
        groups.setdefault((sector, direction), set()).add(sym)

    clusters: list[dict] = []
    for (sector, direction), symbols in groups.items():
        if len(symbols) < SECTOR_CLUSTER_MIN:
            continue
        sec_ko = _SECTOR_KO.get(sector, sector)
        dir_ko = "동반 상승" if direction == "up" else "동반 하락"
        sym_list = sorted(symbols)
        clusters.append({
            "id": make_id("momentum", sector, today_iso, f"cluster-{direction}"),
            "kind": "momentum",
            "symbol": None,
            "name": sec_ko,
            "date": today_iso,
            "title": f"{sec_ko} 섹터 {dir_ko} ({len(sym_list)}종목)",
            "detail": (
                f"{dir_ko} {len(sym_list)}종목: {', '.join(sym_list)} · "
                "섹터 단위 자금 흐름 · 섹터 로테이션 가능성"
            ),
            "impact": "bullish" if direction == "up" else "bearish",
            "confidence": "confirmed",
            "source": None,
            "tags": json.dumps(
                ["momentum", "sector-cluster", f"sector-{sector}", direction]
            ),
        })
    return clusters


_SECTOR_KO = {
    "memory": "메모리",
    "compute": "연산/GPU/CPU",
    "semi-equip": "반도체 장비",
    "analog": "아날로그/전력",
    "cyber": "사이버보안",
    "platform": "메가캡 플랫폼",
}


def _mk_momentum_event(
    sym: str, name: str, date_iso: str,
    *, tag: str, title: str, detail: str, impact: str, tags: list[str],
) -> dict:
    return {
        "id": make_id("momentum", sym, date_iso, tag),
        "kind": "momentum",
        "symbol": sym,
        "name": name,
        "date": date_iso,
        "title": title,
        "detail": detail,
        "impact": impact,
        "confidence": "confirmed",
        "source": f"https://www.nasdaq.com/market-activity/stocks/{sym.lower()}",
        "tags": json.dumps([tag] + tags),
    }


# ─── Press release scanner (NDX advance-notice events) ────────────────


NDX_PRESS_FEED_URL = "https://ir.nasdaq.com/rss/news-releases.xml"
CODEX_BIN = "codex"
CODEX_PROMPT = (
    "Parse this NASDAQ press release announcing changes to the Nasdaq-100 Index. "
    "Output ONLY a single-line JSON object, no preamble, no markdown fence. "
    'Schema: {"announcement_date":"YYYY-MM-DD","effective_date":"YYYY-MM-DD",'
    '"index":"NDX","additions":[{"symbol":"X","name":"Y"}],'
    '"removals":[{"symbol":"X","name":"Y"}]}. '
    'If no changes can be parsed, output {"error":"unparseable"}.'
)


def fetch_ndx_press_items() -> list[dict]:
    """Return list of {title, description, link, pub_date} items from the IR
    feed whose title mentions 'Nasdaq-100'. Description alone is usually rich
    enough for codex to extract additions/removals — we skip the full HTML
    fetch because ir.nasdaq.com pages tend to fail under non-browser clients.
    """
    req = urllib.request.Request(
        NDX_PRESS_FEED_URL,
        headers={"User-Agent": "Mozilla/5.0 AssetFlow/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            xml_body = r.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        print(f"  press feed fetch failed: {e}", file=sys.stderr)
        return []

    items: list[dict] = []
    for m in re.finditer(r"<item[^>]*>(.*?)</item>", xml_body, re.S):
        body = m.group(1)
        title = _xml_tag(body, "title")
        if not title or "nasdaq-100" not in title.lower():
            continue
        items.append({
            "title": title,
            "description": _xml_tag(body, "description"),
            "link": _xml_tag(body, "link"),
            "pub_date": _xml_tag(body, "pubDate"),
        })
    return items


def _xml_tag(body: str, name: str) -> str:
    m = re.search(rf"<{name}[^>]*>([^<]+)</{name}>", body, re.S)
    if not m:
        return ""
    s = m.group(1).strip()
    # Strip CDATA wrappers if present.
    s = re.sub(r"^<!\[CDATA\[|\]\]>$", "", s).strip()
    return s


def codex_parse_press_release(item: dict) -> dict | None:
    """Pipe an RSS item to `codex exec` and parse its JSON output.

    Returns None on any failure. Codex may emit logging chrome around the
    JSON, so we pull the last `{...}` block from stdout.
    """
    if not shutil.which(CODEX_BIN):
        return None
    payload = (
        f"TITLE: {item.get('title','')}\n"
        f"PUBLISHED: {item.get('pub_date','')}\n"
        f"BODY: {item.get('description','')}\n"
    )
    try:
        proc = subprocess.run(
            [CODEX_BIN, "exec", "-s", "read-only", CODEX_PROMPT],
            input=payload,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        print(f"  codex exec failed: {e}", file=sys.stderr)
        return None
    if proc.returncode != 0:
        print(f"  codex rc={proc.returncode}: {proc.stderr[:200]}", file=sys.stderr)
        return None
    # Codex emits the schema example earlier in the prompt echo; the real
    # answer is the last balanced `{...}` on stdout. Scan back-to-front
    # collecting balanced top-level objects.
    candidates = _find_balanced_json_objects(proc.stdout)
    for raw in reversed(candidates):
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict):
            continue
        if "error" in obj:
            return None
        if "additions" in obj or "removals" in obj:
            return obj
    return None


def _find_balanced_json_objects(text: str) -> list[str]:
    """Return every top-level `{...}` substring with balanced braces.
    Handles nested objects (which a non-greedy regex can't)."""
    out: list[str] = []
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    out.append(text[start : i + 1])
                    start = -1
    return out


def press_release_to_events(parsed: dict, source_link: str) -> list[dict]:
    """Convert a codex-parsed press release into reference_events rows.

    Effective date drives the event date so the timeline points at the
    actual rebalance day. Confidence is `announced` (vs `confirmed` from
    the live diff) to mark these as pre-effect signals.
    """
    eff = parsed.get("effective_date") or parsed.get("announcement_date")
    if not eff:
        return []
    try:
        datetime.strptime(eff, "%Y-%m-%d")
    except ValueError:
        return []
    events: list[dict] = []
    for add in parsed.get("additions") or []:
        sym = (add.get("symbol") or "").strip().upper()
        name = (add.get("name") or sym).strip()
        if not sym:
            continue
        events.append({
            "id": make_id("index_addition", sym, eff, "press"),
            "kind": "index_addition",
            "symbol": sym,
            "name": name,
            "date": eff,
            "title": f"{name} ({sym}) — NASDAQ-100 편입",
            "detail": (
                f"NASDAQ 공식 발표 · {eff} 시장 개장 전 편입 · "
                "QQQ 등 추종 자금 강제 매수 수요 발생"
            ),
            "impact": "bullish",
            "confidence": "announced",
            "source": source_link or "https://ir.nasdaq.com/news-releases",
            "tags": json.dumps(["nasdaq100", "press-release", "addition"]),
        })
    for rem in parsed.get("removals") or []:
        sym = (rem.get("symbol") or "").strip().upper()
        name = (rem.get("name") or sym).strip()
        if not sym:
            continue
        events.append({
            "id": make_id("index_removal", sym, eff, "press"),
            "kind": "index_removal",
            "symbol": sym,
            "name": name,
            "date": eff,
            "title": f"{name} ({sym}) — NASDAQ-100 제외",
            "detail": (
                f"NASDAQ 공식 발표 · {eff} 시장 개장 전 제외 · "
                "QQQ 등 추종 자금 강제 매도 수요 발생"
            ),
            "impact": "bearish",
            "confidence": "announced",
            "source": source_link or "https://ir.nasdaq.com/news-releases",
            "tags": json.dumps(["nasdaq100", "press-release", "removal"]),
        })
    return events


def scan_press_releases() -> list[dict]:
    """End-to-end: fetch feed → filter → codex parse → events."""
    items = fetch_ndx_press_items()
    if not items:
        return []
    print(f"NDX press feed: {len(items)} matching items", file=sys.stderr)
    events: list[dict] = []
    for item in items:
        parsed = codex_parse_press_release(item)
        if not parsed:
            print(f"  skipped (no parse): {item['title'][:80]}", file=sys.stderr)
            continue
        new = press_release_to_events(parsed, item.get("link") or "")
        if new:
            print(
                f"  parsed: {item['title'][:60]} → "
                f"+{len([e for e in new if e['kind']=='index_addition'])} "
                f"-{len([e for e in new if e['kind']=='index_removal'])}",
                file=sys.stderr,
            )
            events.extend(new)
    return events


# ─── Main ──────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--months",
        type=int,
        default=8,
        help="Months of IPO calendar to fetch forward + backward (default 8)",
    )
    args = ap.parse_args()

    today = date.today()
    months_to_fetch = []
    for offset in range(-6, args.months + 1):
        d = today.replace(day=1) + timedelta(days=32 * offset)
        d = d.replace(day=1)
        months_to_fetch.append(d.strftime("%Y-%m"))
    months_to_fetch = sorted(set(months_to_fetch))

    print(f"Fetching IPO calendar for months: {months_to_fetch[0]} ~ {months_to_fetch[-1]}", file=sys.stderr)

    all_rows: list[dict] = []
    for m in months_to_fetch:
        rows = fetch_nasdaq_ipos(m)
        if rows:
            print(f"  {m}: {len(rows)} rows", file=sys.stderr)
            all_rows.extend(rows)

    conn = sqlite3.connect(str(DB_PATH))
    try:
        ensure_schema(conn)

        ndx_rows = fetch_nasdaq100_rows()
        diff_events: list[dict] = []
        momentum_events: list[dict] = []
        top30: list[tuple[str, str, float]] = []
        if ndx_rows:
            members = {(r.get("symbol") or "").strip().upper() for r in ndx_rows if r.get("symbol")}
            previous = load_nasdaq100_members(conn)
            upsert_nasdaq100_members(conn, members)
            diff_events = diff_nasdaq100_events(previous, members, date.today())
            top30 = top_ndx_by_mcap(ndx_rows, 30)
            snapshot = upsert_nasdaq100_daily(conn, ndx_rows, date.today())
            if is_new_us_session(snapshot, conn, date.today()):
                momentum_events = scan_momentum_events(snapshot, conn, date.today())
                momentum_events.extend(
                    scan_sector_cluster_events(momentum_events, date.today())
                )
                skipped_momentum = False
            else:
                skipped_momentum = True
            print(
                f"NASDAQ-100 members refreshed: {len(members)} "
                f"(prev {len(previous)}, diff events {len(diff_events)}, top30 mcap range "
                f"${top30[0][2]/1e9:.0f}B–${top30[-1][2]/1e9:.0f}B, "
                f"momentum {'skipped (same US session as prior snapshot)' if skipped_momentum else len(momentum_events)})",
                file=sys.stderr,
            )
        else:
            members = load_nasdaq100_members(conn)
            print(f"NASDAQ-100 fetch failed; using cached {len(members)}", file=sys.stderr)

        ipo_events = rows_to_ipo_events(all_rows, members)

        seed_events = []
        for s in SEED_EVENTS:
            # Assign deterministic ids for seed events too.
            seed = {**s}
            seed["id"] = make_id(s["kind"], s.get("symbol"), s["date"], s.get("title", "")[:32])
            seed.setdefault("tags", json.dumps([]))
            seed_events.append(seed)

        press_events = scan_press_releases()
        earnings_events = scan_earnings_events(top30, date.today())
        if earnings_events:
            print(f"Earnings: {len(earnings_events)} events (top-30 by mcap)", file=sys.stderr)
        macro_events = scan_macro_events(date.today())
        if macro_events:
            print(f"Macro: {len(macro_events)} events (high-impact whitelist)", file=sys.stderr)

        # Press releases announce a membership change ~10 days before the
        # API actually flips, so the press event and the diff event sit on
        # different dates.  Match by (kind, symbol) within a ±21d window
        # — long enough to cover the typical advance-notice period.  Press
        # wins (richer detail, fires earlier).
        DEDUP_WINDOW_DAYS = 21
        def _drop_redundant_diffs(
            diffs: list[dict], press: list[dict], window: int,
        ) -> list[dict]:
            by_key: dict[tuple[str, str], list[date]] = {}
            for e in press:
                key = (e["kind"], e["symbol"] or "")
                by_key.setdefault(key, []).append(
                    datetime.strptime(e["date"], "%Y-%m-%d").date()
                )
            out: list[dict] = []
            for e in diffs:
                key = (e["kind"], e["symbol"] or "")
                d = datetime.strptime(e["date"], "%Y-%m-%d").date()
                if any(abs((d - pd).days) <= window for pd in by_key.get(key, [])):
                    continue
                out.append(e)
            return out
        diff_events = _drop_redundant_diffs(diff_events, press_events, DEDUP_WINDOW_DAYS)

        all_events = (
            ipo_events + diff_events + press_events + earnings_events
            + momentum_events + macro_events + seed_events
        )
        print(
            f"Resolved {len(all_events)} events "
            f"({len(ipo_events)} IPO/lockup + {len(diff_events)} NDX diff + "
            f"{len(press_events)} press + {len(earnings_events)} earnings + "
            f"{len(momentum_events)} momentum + {len(macro_events)} macro + "
            f"{len(seed_events)} seed)",
            file=sys.stderr,
        )

        # Rebuild lockup + earnings events from scratch each run so they
        # reflect the current NDX membership / confirmed earnings calendar.
        dropped = purge_lockup_events(conn)
        if dropped:
            print(f"Purged {dropped} stale lockup rows", file=sys.stderr)
        dropped_e = conn.execute(
            "DELETE FROM reference_events WHERE kind = 'earnings' AND date >= ?",
            (date.today().isoformat(),),
        ).rowcount
        if dropped_e:
            print(f"Purged {dropped_e} future earnings rows", file=sys.stderr)
        dropped_macro = conn.execute(
            "DELETE FROM reference_events WHERE kind = 'macro' AND date >= ?",
            (date.today().isoformat(),),
        ).rowcount
        if dropped_macro:
            print(f"Purged {dropped_macro} future macro rows", file=sys.stderr)
        # Momentum is also derived freshly each run — purge today's rows
        # so re-runs don't accumulate duplicates from intra-day changes.
        dropped_m = conn.execute(
            "DELETE FROM reference_events WHERE kind = 'momentum' AND date = ?",
            (date.today().isoformat(),),
        ).rowcount
        if dropped_m:
            print(f"Purged {dropped_m} today's momentum rows", file=sys.stderr)
        conn.commit()

        upsert_events(conn, all_events)
        pruned = prune_old(conn)
        print(f"Pruned {pruned} stale events", file=sys.stderr)
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
