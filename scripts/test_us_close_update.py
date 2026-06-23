"""Tests for the post-US-close price refresh (`fetch-prices.py --us-only`).

Symptom: at ~08:00 KST the app showed a stale US close (e.g. GOOGL 368.03,
Friday's close) because the only daily batch runs at 15:35 KST — *before*
the US session for that KST day opens (US opens 22:30 KST). So US symbols
always lagged a full session until the next day's 15:35 run.

The fix adds a US-only refresh that runs right after US close (~05:30 KST)
and merges fresh US closes into the existing prices.json without disturbing
the KRX / crypto / fx entries written at 15:35. `merge_us_prices()` holds
the pure merge logic and is what we unit-test here.
"""

import importlib
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

fp = importlib.import_module("fetch-prices")


class MergeUsPricesTest(unittest.TestCase):
    def test_overwrites_existing_us_symbol(self):
        existing = {
            "NASDAQ:GOOGL": {"price": 368.03, "change": 4.24, "changePct": 1.16},
        }
        fresh = {
            "NASDAQ:GOOGL": {"price": 348.78, "change": -18.68, "changePct": -5.08},
        }
        merged = fp.merge_us_prices(existing, fresh)
        self.assertEqual(merged["NASDAQ:GOOGL"]["price"], 348.78)
        self.assertEqual(merged["NASDAQ:GOOGL"]["changePct"], -5.08)

    def test_preserves_non_us_entries(self):
        existing = {
            "KRX:005930": {"price": 80000, "change": 100, "changePct": 0.12},
            "CRYPTO:BTC": {"price": 90000000, "change": 0, "changePct": 0},
            "NASDAQ:GOOGL": {"price": 368.03, "change": 4.24, "changePct": 1.16},
        }
        fresh = {"NASDAQ:GOOGL": {"price": 348.78, "change": -18.68, "changePct": -5.08}}
        merged = fp.merge_us_prices(existing, fresh)
        self.assertEqual(merged["KRX:005930"]["price"], 80000)
        self.assertEqual(merged["CRYPTO:BTC"]["price"], 90000000)

    def test_adds_new_us_symbol(self):
        existing = {"KRX:005930": {"price": 80000, "change": 0, "changePct": 0}}
        fresh = {"NYSE:BRK-B": {"price": 500, "change": 5, "changePct": 1.0}}
        merged = fp.merge_us_prices(existing, fresh)
        self.assertIn("NYSE:BRK-B", merged)
        self.assertIn("KRX:005930", merged)

    def test_empty_fresh_leaves_prices_unchanged(self):
        existing = {"NASDAQ:GOOGL": {"price": 368.03, "change": 4.24, "changePct": 1.16}}
        merged = fp.merge_us_prices(existing, {})
        self.assertEqual(merged, existing)

    def test_does_not_mutate_inputs(self):
        existing = {"NASDAQ:GOOGL": {"price": 368.03, "change": 4.24, "changePct": 1.16}}
        fresh = {"NASDAQ:GOOGL": {"price": 348.78, "change": -18.68, "changePct": -5.08}}
        fp.merge_us_prices(existing, fresh)
        self.assertEqual(existing["NASDAQ:GOOGL"]["price"], 368.03)


if __name__ == "__main__":
    unittest.main()
