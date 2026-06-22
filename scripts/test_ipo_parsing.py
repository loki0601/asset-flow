"""Regression tests for the NASDAQ IPO calendar row extraction.

Symptom: SpaceX (SPCX) — and every other "상장 예정" company — never appeared
in the Insights IPO feed. Root cause: NASDAQ nests the upcoming section under
`data.upcoming.upcomingTable.rows`, but the scraper read `data.upcoming.rows`
(which doesn't exist), silently dropping ALL upcoming IPOs. Only already-priced
deals were captured, so a deal pricing today/this week was invisible.
"""

import importlib
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

fre = importlib.import_module("fetch-reference-events")


class ExtractIpoRowsTest(unittest.TestCase):
    def test_priced_rows_are_read_directly(self):
        data = {"priced": {"rows": [{"proposedTickerSymbol": "AAA", "companyName": "A Inc"}]}}
        rows = fre.extract_ipo_rows(data)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["_section"], "priced")

    def test_upcoming_is_nested_under_upcomingTable(self):
        # The exact shape that hid SpaceX.
        data = {
            "upcoming": {
                "upcomingTable": {
                    "rows": [
                        {
                            "proposedTickerSymbol": "SPCX",
                            "companyName": "SPACE EXPLORATION TECHNOLOGIES CORP",
                            "expectedPriceDate": "6/12/2026",
                        }
                    ]
                }
            }
        }
        rows = fre.extract_ipo_rows(data)
        syms = [r["proposedTickerSymbol"] for r in rows]
        self.assertIn("SPCX", syms)
        self.assertEqual(rows[0]["_section"], "upcoming")

    def test_filed_and_withdrawn_are_skipped(self):
        data = {
            "filed": {"rows": [{"proposedTickerSymbol": "FFF"}]},
            "withdrawn": {"rows": [{"proposedTickerSymbol": "WWW"}]},
        }
        self.assertEqual(fre.extract_ipo_rows(data), [])

    def test_both_sections_combined(self):
        data = {
            "priced": {"rows": [{"proposedTickerSymbol": "PPP"}]},
            "upcoming": {"upcomingTable": {"rows": [{"proposedTickerSymbol": "UUU"}]}},
        }
        sections = {r["proposedTickerSymbol"]: r["_section"] for r in fre.extract_ipo_rows(data)}
        self.assertEqual(sections, {"PPP": "priced", "UUU": "upcoming"})

    def test_empty_data_yields_nothing(self):
        self.assertEqual(fre.extract_ipo_rows({}), [])
        self.assertEqual(fre.extract_ipo_rows({"upcoming": None}), [])


class IsSpacTest(unittest.TestCase):
    def test_spacex_is_not_a_spac(self):
        # "SPACE" contains the substring "spac" — must not be treated as a SPAC.
        self.assertFalse(fre.is_spac("SPACE EXPLORATION TECHNOLOGIES CORP", "SPCX"))

    def test_space_prefixed_operating_company_ok(self):
        self.assertFalse(fre.is_spac("Spacelabs Healthcare Inc", "SLAB"))

    def test_literal_spac_word_still_flagged(self):
        self.assertTrue(fre.is_spac("Pono Capital SPAC Inc", None))

    def test_acquisition_corp_still_flagged(self):
        self.assertTrue(fre.is_spac("Ajax Acquisition Corp", "AJAXU"))

    def test_blank_check_still_flagged(self):
        self.assertTrue(fre.is_spac("Generic Blank Check Co", None))


class RowsToIpoEventsTest(unittest.TestCase):
    def test_spacex_upcoming_row_produces_an_event(self):
        row = {
            "_section": "upcoming",
            "proposedTickerSymbol": "SPCX",
            "companyName": "SPACE EXPLORATION TECHNOLOGIES CORP",
            "expectedPriceDate": "6/12/2026",
            "proposedSharePrice": "135.00",
            "sharesOffered": "555,555,555",
            "dollarValueOfSharesOffered": "$86,249,999,880.00",
        }
        events = fre.rows_to_ipo_events([row], set())
        ipos = [e for e in events if e["kind"] == "ipo"]
        self.assertEqual(len(ipos), 1)
        self.assertEqual(ipos[0]["symbol"], "SPCX")
        self.assertEqual(ipos[0]["date"], "2026-06-12")


if __name__ == "__main__":
    unittest.main()
