"""Regression tests for the duplicate-momentum-event bug.

Symptom: the same QCOM / NXPI / etc surge showed up as separate events
on consecutive KST dates whenever the cron fired during a US market
closure (weekend / US holiday). NASDAQ's API serves the most recent
trading-day's `percentageChange` until a new session ticks, so the
scanner kept re-recording it under each new KST date.

The fix adds is_new_us_session() — when the top-N symbols all carry
the same pct as yesterday's stored snapshot, the scanner is short-
circuited and no events are produced for that day.
"""

import os
import sqlite3
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))

# Module under test. Import lazily so the test still loads even if the
# function doesn't exist yet (allowing the red-then-green workflow).
import importlib

fre = importlib.import_module("fetch-reference-events")


def make_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE nasdaq100_daily (
          symbol         TEXT NOT NULL,
          date           TEXT NOT NULL,
          mcap_usd       REAL,
          last_price     REAL,
          rank_by_mcap   INTEGER NOT NULL,
          day_change_pct REAL,
          PRIMARY KEY (symbol, date)
        )
        """
    )
    return conn


def seed_yesterday(conn: sqlite3.Connection, today: date, rows: list[tuple[str, float, float]]) -> None:
    """rows = [(symbol, last_price, pct), ...]"""
    yesterday = (today.toordinal() - 1)
    yesterday_iso = date.fromordinal(yesterday).isoformat()
    for rank, (sym, price, pct) in enumerate(rows, 1):
        conn.execute(
            "INSERT INTO nasdaq100_daily (symbol, date, mcap_usd, last_price, rank_by_mcap, day_change_pct) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (sym, yesterday_iso, 1e12 / rank, price, rank, pct),
        )
    conn.commit()


def snapshot(rows: list[tuple[str, float, float]]) -> list[dict]:
    """rows = [(symbol, last_price, pct), ...] → snapshot dicts in rank order."""
    out = []
    for rank, (sym, price, pct) in enumerate(rows, 1):
        out.append(
            {
                "symbol": sym,
                "name": sym,
                "mcap": 1e12 / rank,
                "price": price,
                "pct": pct,
                "rank": rank,
            }
        )
    return out


# Build a top-20 fixture that mirrors realistic NDX values. The exact
# numbers don't matter — what matters is the pct vector identity check.
TOP20 = [
    ("AAPL", 220.0, 0.5),
    ("MSFT", 430.0, 0.3),
    ("NVDA", 130.0, 2.1),
    ("AMZN", 200.0, -0.8),
    ("META", 540.0, 1.2),
    ("GOOG", 175.0, 0.6),
    ("GOOGL", 173.0, 0.6),
    ("TSLA", 250.0, -1.5),
    ("AVGO", 170.0, 3.0),
    ("COST", 880.0, 0.1),
    ("NFLX", 700.0, 0.4),
    ("AMD", 160.0, 1.8),
    ("PEP", 165.0, -0.2),
    ("ADBE", 510.0, 0.9),
    ("CSCO", 56.0, -0.1),
    ("LIN", 460.0, 0.3),
    ("INTU", 660.0, 1.1),
    ("AMAT", 200.0, 1.7),
    ("TMUS", 220.0, 0.5),
    ("QCOM", 175.0, 11.60),
]


class IsNewUsSessionTest(unittest.TestCase):
    def test_no_baseline_returns_true(self):
        conn = make_conn()
        self.assertTrue(
            fre.is_new_us_session(snapshot(TOP20), conn, date(2026, 5, 24))
        )

    def test_identical_pct_vector_returns_false(self):
        """The weekend/US-holiday case: same pct as yesterday → not a new session."""
        conn = make_conn()
        seed_yesterday(conn, date(2026, 5, 25), TOP20)
        self.assertFalse(
            fre.is_new_us_session(snapshot(TOP20), conn, date(2026, 5, 25))
        )

    def test_pct_vector_changed_returns_true(self):
        """Real new trading day — pct values shift across the board."""
        conn = make_conn()
        seed_yesterday(conn, date(2026, 5, 26), TOP20)
        new_top20 = [(s, p, pct + 0.5) for (s, p, pct) in TOP20]
        self.assertTrue(
            fre.is_new_us_session(snapshot(new_top20), conn, date(2026, 5, 26))
        )

    def test_partial_change_still_returns_false(self):
        """A handful of symbols with new pct (data corrections, late prints)
        shouldn't unfreeze the scanner — only a real session does."""
        conn = make_conn()
        seed_yesterday(conn, date(2026, 5, 25), TOP20)
        mutated = list(TOP20)
        # Change just 2 of the top-20 → 90% match → still "same session"
        mutated[5] = (mutated[5][0], mutated[5][1], mutated[5][2] + 0.5)
        mutated[6] = (mutated[6][0], mutated[6][1], mutated[6][2] + 0.5)
        self.assertFalse(
            fre.is_new_us_session(snapshot(mutated), conn, date(2026, 5, 25))
        )

    def test_empty_snapshot_returns_false(self):
        conn = make_conn()
        seed_yesterday(conn, date(2026, 5, 25), TOP20)
        self.assertFalse(
            fre.is_new_us_session([], conn, date(2026, 5, 25))
        )

    def test_skips_pre_today_dates_too(self):
        """If yesterday's cron didn't run, fall back to the most recent
        snapshot strictly before today rather than failing open."""
        conn = make_conn()
        # Seed snapshot 3 days ago instead of yesterday
        three_days_ago_iso = date(2026, 5, 22).isoformat()
        for rank, (sym, price, pct) in enumerate(TOP20, 1):
            conn.execute(
                "INSERT INTO nasdaq100_daily (symbol, date, mcap_usd, last_price, rank_by_mcap, day_change_pct) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (sym, three_days_ago_iso, 1e12 / rank, price, rank, pct),
            )
        conn.commit()
        # Same pct vector as the 3-day-ago snapshot → still the same US session
        self.assertFalse(
            fre.is_new_us_session(snapshot(TOP20), conn, date(2026, 5, 25))
        )


def make_events_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE reference_events (
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


def seed_event(
    conn: sqlite3.Connection,
    *,
    symbol: str,
    tag: str,
    event_date: str,
    kind: str = "momentum",
) -> None:
    """Insert a momentum event with the given tag stored in `tags` (the
    real script stores `[tag, ...categoryTags]` as JSON; the matcher
    only needs the tag substring)."""
    import json

    conn.execute(
        "INSERT INTO reference_events (id, kind, symbol, name, date, title, detail, "
        "impact, confidence, source, tags, added_at) VALUES "
        "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            f"{kind}|{symbol}|{event_date}|{tag}",
            kind,
            symbol,
            symbol,
            event_date,
            f"{symbol} test",
            "",
            "neutral",
            "estimated",
            "test",
            json.dumps([tag]),
            event_date + "T00:00:00",
        ),
    )
    conn.commit()


class AlreadyEmittedRecentlyTest(unittest.TestCase):
    """Regression for the APP/Applovin duplicate bug. 5/29 and 5/30 both
    fired a `top30-breakout` event because the 5-day-ago rank lookback
    was still pre-breakout on both days, so the scanner re-emitted the
    same milestone every day until the lookback caught up.

    The fix adds already_emitted_recently(conn, symbol, tag, days) — once
    a "state-change" momentum event has fired in the last N days, it's
    suppressed so the holdings card shows a single entry."""

    def test_no_prior_event_returns_false(self):
        conn = make_conn()
        make_events_table(conn)
        self.assertFalse(
            fre.already_emitted_recently(conn, "APP", "top30-breakout", days=30)
        )

    def test_recent_same_tag_returns_true(self):
        conn = make_conn()
        make_events_table(conn)
        seed_event(conn, symbol="APP", tag="top30-breakout", event_date="2026-05-29")
        # Cron the next day at the default 30-day cooldown — should
        # suppress so the same milestone doesn't re-fire.
        self.assertTrue(
            fre.already_emitted_recently(
                conn, "APP", "top30-breakout", days=30, today=date(2026, 5, 30)
            )
        )

    def test_old_event_outside_window_returns_false(self):
        conn = make_conn()
        make_events_table(conn)
        # Same milestone fired 40 days ago — outside the 30-day window,
        # so a fresh breakout is allowed again.
        seed_event(conn, symbol="APP", tag="top30-breakout", event_date="2026-04-20")
        self.assertFalse(
            fre.already_emitted_recently(
                conn, "APP", "top30-breakout", days=30, today=date(2026, 5, 30)
            )
        )

    def test_different_tag_does_not_suppress(self):
        conn = make_conn()
        make_events_table(conn)
        # Yesterday's price surge shouldn't block today's breakout — the
        # two are independent signals.
        seed_event(conn, symbol="APP", tag="price-up-1d", event_date="2026-05-29")
        self.assertFalse(
            fre.already_emitted_recently(
                conn, "APP", "top30-breakout", days=30, today=date(2026, 5, 30)
            )
        )

    def test_different_symbol_does_not_suppress(self):
        conn = make_conn()
        make_events_table(conn)
        seed_event(conn, symbol="MSFT", tag="top30-breakout", event_date="2026-05-29")
        self.assertFalse(
            fre.already_emitted_recently(
                conn, "APP", "top30-breakout", days=30, today=date(2026, 5, 30)
            )
        )

    def test_missing_table_returns_false_defensively(self):
        # First-ever cron run — reference_events table doesn't exist yet.
        # Shouldn't crash; absence means "no prior event" → allow emit.
        conn = make_conn()
        self.assertFalse(
            fre.already_emitted_recently(conn, "APP", "top30-breakout", days=30)
        )


if __name__ == "__main__":
    unittest.main()
