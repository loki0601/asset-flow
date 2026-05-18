#!/usr/bin/env python3
"""Fetch the US stock catalog: S&P 500 constituents + NASDAQ listing +
US ETFs (ARKX, QQQ, SPY, etc.) — all deduplicated by symbol."""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import FinanceDataReader as fdr

OUT_PATH = Path(__file__).resolve().parents[1] / "src/server/data/us.json"


def main() -> int:
    print("Fetching S&P 500 + NASDAQ + US ETFs…", file=sys.stderr)
    sp = fdr.StockListing("S&P500")
    nq = fdr.StockListing("NASDAQ")
    etfs = fdr.StockListing("ETF/US")
    print(
        f"  S&P500: {len(sp)} / NASDAQ: {len(nq)} / US ETFs: {len(etfs)}",
        file=sys.stderr,
    )

    rows: dict[str, dict] = {}

    for _, row in sp.iterrows():
        sym = str(row.get("Symbol") or row.get("Code") or "").strip()
        name = str(row.get("Name", "")).strip()
        if not sym or not name:
            continue
        rows[sym] = {
            "symbol": f"NASDAQ:{sym}" if sym.isalpha() and len(sym) <= 5 else f"NYSE:{sym}",
            "name": name,
            "market": "S&P500",
        }

    for _, row in nq.iterrows():
        sym = str(row.get("Symbol") or row.get("Code") or "").strip()
        name = str(row.get("Name", "")).strip()
        if not sym or not name:
            continue
        if sym in rows:
            continue
        rows[sym] = {"symbol": f"NASDAQ:{sym}", "name": name, "market": "NASDAQ"}

    # ETFs trade on NYSE Arca / NASDAQ depending on the issuer. The ticker
    # alone is enough for our backfill logic (FDR + yfinance both look up
    # by plain ticker), so route them under NASDAQ:* by default and keep
    # market="ETF" for client-side category detection.
    for _, row in etfs.iterrows():
        sym = str(row.get("Symbol", "")).strip()
        name = str(row.get("Name", "")).strip()
        if not sym or not name:
            continue
        if sym in rows:
            continue
        rows[sym] = {"symbol": f"NASDAQ:{sym}", "name": name, "market": "ETF_US"}

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "as_of": date.today().isoformat(),
        "count": len(rows),
        "assets": list(rows.values()),
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"wrote {len(rows)} assets → {OUT_PATH}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
