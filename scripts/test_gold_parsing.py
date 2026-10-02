"""Tests for the KRX:GOLD price source.

Symptom: from 2026-09-18 the 자산 흐름 chart froze gold at its 09-17 close and
/api/catalog served KRX:GOLD currentPrice=0 (so the header fell back to the
holding's avgPrice). Naver's legacy HTML page
finance.naver.com/marketindex/goldDailyQuote.naver started returning HTTP 410.

The fix moves to Naver's JSON API (api.stock.naver.com, 국내 금 M04020000).
`parse_naver_gold_prices()` holds the pure parsing and is what we test here.
"""

import importlib
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

fp = importlib.import_module("fetch-prices")

SAMPLE = [
    {
        "localTradedAt": "2026-10-02T00:00:00+09:00",
        "closePrice": "182,770",
        "fluctuationsType": {"code": "5", "text": "하락", "name": "FALLING"},
        "fluctuations": "-710",
        "fluctuationsRatio": "-0.39",
    },
    {
        "localTradedAt": "2026-10-01T00:00:00+09:00",
        "closePrice": "183,480",
        "fluctuationsType": {"code": "2", "text": "상승", "name": "RISING"},
        "fluctuations": "540",
        "fluctuationsRatio": "0.30",
    },
]


class ParseNaverGoldTest(unittest.TestCase):
    def test_returns_dated_closes_newest_first(self):
        rows = fp.parse_naver_gold_prices(SAMPLE)
        self.assertEqual(rows[0]["date"], "2026-10-02")
        self.assertEqual(rows[0]["close"], 182770.0)
        self.assertEqual(rows[1]["date"], "2026-10-01")
        self.assertEqual(rows[1]["close"], 183480.0)

    def test_carries_signed_change_and_pct(self):
        rows = fp.parse_naver_gold_prices(SAMPLE)
        self.assertEqual(rows[0]["change"], -710.0)
        self.assertAlmostEqual(rows[0]["changePct"], -0.39)
        self.assertEqual(rows[1]["change"], 540.0)

    def test_skips_malformed_rows(self):
        rows = fp.parse_naver_gold_prices([{"localTradedAt": "", "closePrice": ""}, *SAMPLE])
        self.assertEqual(len(rows), 2)

    def test_empty_payload(self):
        self.assertEqual(fp.parse_naver_gold_prices([]), [])
        self.assertEqual(fp.parse_naver_gold_prices(None), [])


if __name__ == "__main__":
    unittest.main()
