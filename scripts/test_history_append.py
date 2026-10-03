"""Tests for which official closes the daily jobs write into price_history.

Bugs fixed (2026-10): the 15:35 KST job ran every day and stamped every
tracked symbol — KRX, US and crypto — with today's KST date, so weekends and
KRX holidays got copies of the previous close and US closes were labelled
with the next KST date. The US-only job did the same with its own KST date.
"""

import importlib
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

fp = importlib.import_module("fetch-prices")

PRICES = {
    "KRX:005930": {"price": 275750.0},
    "KRX:GOLD": {"price": 182770.0},
    "CRYPTO:BTC": {"price": 113000000.0},
    "NASDAQ:NVDA": {"price": 230.0, "date": "2026-10-01"},
    "KRX:000000": {"price": 0.0},
}
READY = {"KRX:005930", "KRX:GOLD", "CRYPTO:BTC", "NASDAQ:NVDA", "KRX:000000"}


class DailyCloseRowsTest(unittest.TestCase):
    def test_krx_trading_day_writes_krx_and_crypto_not_us(self):
        rows = fp.daily_close_rows(PRICES, READY, "2026-10-02", krx_open=True)
        self.assertEqual(
            sorted(rows),
            [
                ("CRYPTO:BTC", "2026-10-02", 113000000.0),
                ("KRX:005930", "2026-10-02", 275750.0),
                ("KRX:GOLD", "2026-10-02", 182770.0),
            ],
        )

    def test_weekend_or_holiday_writes_crypto_only(self):
        rows = fp.daily_close_rows(PRICES, READY, "2026-10-03", krx_open=False)
        self.assertEqual(rows, [("CRYPTO:BTC", "2026-10-03", 113000000.0)])

    def test_untracked_symbols_skipped(self):
        rows = fp.daily_close_rows(PRICES, {"KRX:005930"}, "2026-10-02", krx_open=True)
        self.assertEqual(rows, [("KRX:005930", "2026-10-02", 275750.0)])


class OfficialClosesTest(unittest.TestCase):
    """FDR StockListing at 15:35 KST is not the final close (2026-10-02:
    005930 listed 275,750 / −0.09% while the official close was 276,000 /
    +0.55%). Tracked KRX symbols take Naver's official daily bars instead."""

    NAVER = [
        {"localDate": "20261001", "closePrice": 274500.0},
        {"localDate": "20261002", "closePrice": 276000.0},
        {"localDate": "", "closePrice": 1},
    ]

    def test_parse_naver_daily_ascending(self):
        self.assertEqual(
            fp.parse_naver_daily(self.NAVER),
            [("2026-10-01", 274500.0), ("2026-10-02", 276000.0)],
        )

    def test_apply_official_closes_overrides_snapshot(self):
        prices = {"KRX:005930": {"price": 275750.0, "change": -250.0, "changePct": -0.09}}
        fp.apply_official_closes(prices, "KRX:005930", [("2026-10-01", 274500.0), ("2026-10-02", 276000.0)])
        self.assertEqual(prices["KRX:005930"]["price"], 276000.0)
        self.assertEqual(prices["KRX:005930"]["change"], 1500.0)
        self.assertAlmostEqual(prices["KRX:005930"]["changePct"], 1500 / 274500 * 100)

    def test_apply_official_closes_needs_two_rows(self):
        prices = {"KRX:A": {"price": 1.0, "change": 0.0, "changePct": 0.0}}
        fp.apply_official_closes(prices, "KRX:A", [("2026-10-02", 2.0)])
        self.assertEqual(prices["KRX:A"]["price"], 1.0)

    def test_window_rows_flatten_ready_only(self):
        hist = {"NASDAQ:A": [("2026-09-30", 1.0), ("2026-10-01", 2.0)], "NASDAQ:B": [("2026-10-01", 3.0)]}
        self.assertEqual(
            fp.window_rows(hist, {"NASDAQ:A"}),
            [("NASDAQ:A", "2026-09-30", 1.0), ("NASDAQ:A", "2026-10-01", 2.0)],
        )


class KrxTradingDayTest(unittest.TestCase):
    def test_open_when_index_has_todays_bar(self):
        self.assertTrue(fp.is_krx_trading_day("2026-10-02", ["2026-10-01", "2026-10-02"]))

    def test_closed_on_weekend_or_holiday(self):
        self.assertFalse(fp.is_krx_trading_day("2026-10-03", ["2026-10-01", "2026-10-02"]))
        self.assertFalse(fp.is_krx_trading_day("2026-10-03", []))


if __name__ == "__main__":
    unittest.main()
