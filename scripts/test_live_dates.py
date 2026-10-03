"""Tests for fetch-live.py date labelling.

History convention (2026-10 repair): every row is dated by the trading date
of its own market — US closes by the US session date (yfinance index), KRX by
the KRX trading date. The live script used to stamp US ticks with the *next*
KST date and KRX ticks with today even on holidays, and wrote them into the
server's price_history where the official close job could not overwrite them.
"""

import importlib
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(__file__))

fl = importlib.import_module("fetch-live")
KST = timezone(timedelta(hours=9))


class LiveDateTest(unittest.TestCase):
    def test_us_evening_kst_is_same_us_session_date(self):
        # Tue 2026-09-29 23:00 KST = Tue 10:00 ET
        now = datetime(2026, 9, 29, 23, 0, tzinfo=KST)
        self.assertEqual(fl.live_date("NASDAQ:NVDA", now), "2026-09-29")

    def test_us_early_morning_kst_is_previous_us_session_date(self):
        # Wed 2026-09-30 03:00 KST = Tue 14:00 ET
        now = datetime(2026, 9, 30, 3, 0, tzinfo=KST)
        self.assertEqual(fl.live_date("NYSE:DELL", now), "2026-09-29")

    def test_krx_and_crypto_use_kst_date(self):
        now = datetime(2026, 9, 30, 10, 0, tzinfo=KST)
        self.assertEqual(fl.live_date("KRX:005930", now), "2026-09-30")
        self.assertEqual(fl.live_date("CRYPTO:BTC", now), "2026-09-30")


class ParseNaverSiseTest(unittest.TestCase):
    def test_returns_close_and_its_own_trading_date(self):
        body = """[['날짜', '시가', '고가', '저가', '종가', '거래량', '외국인소진율'],
["20260930", 275000, 278000, 274000, 276500, 1000, 50.1]]"""
        self.assertEqual(fl.parse_naver_sise(body), (276500.0, "2026-09-30"))

    def test_holiday_returns_last_trading_date_not_today(self):
        body = '[["20260929", 1, 2, 1, 271000, 10, 1.0]]'
        self.assertEqual(fl.parse_naver_sise(body), (271000.0, "2026-09-29"))

    def test_unparseable(self):
        self.assertIsNone(fl.parse_naver_sise("garbage"))


if __name__ == "__main__":
    unittest.main()
