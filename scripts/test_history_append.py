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


class UsCloseRowsTest(unittest.TestCase):
    def test_uses_each_symbols_us_session_date(self):
        us = {
            "NASDAQ:NVDA": {"price": 230.0, "date": "2026-10-01"},
            "NYSE:DELL": {"price": 140.0, "date": "2026-10-01"},
        }
        rows = fp.us_close_rows(us, {"NASDAQ:NVDA", "NYSE:DELL"})
        self.assertEqual(
            sorted(rows),
            [("NASDAQ:NVDA", "2026-10-01", 230.0), ("NYSE:DELL", "2026-10-01", 140.0)],
        )

    def test_skips_rows_without_session_date(self):
        self.assertEqual(fp.us_close_rows({"NASDAQ:NVDA": {"price": 230.0}}, {"NASDAQ:NVDA"}), [])


class KrxTradingDayTest(unittest.TestCase):
    def test_open_when_index_has_todays_bar(self):
        self.assertTrue(fp.is_krx_trading_day("2026-10-02", ["2026-10-01", "2026-10-02"]))

    def test_closed_on_weekend_or_holiday(self):
        self.assertFalse(fp.is_krx_trading_day("2026-10-03", ["2026-10-01", "2026-10-02"]))
        self.assertFalse(fp.is_krx_trading_day("2026-10-03", []))


if __name__ == "__main__":
    unittest.main()
