#!/usr/bin/env python3
"""Fetch the full KRX stock + ETF catalog via FinanceDataReader and emit
`src/server/data/krx.json` for the Next.js server.

Why both Stock and ETF feeds?
`StockListing('KRX')` returns only listed companies (KOSPI/KOSDAQ/KONEX
stocks). ETFs (KODEX/TIGER/SOL/RISE/PLUS/ACE/etc.) live in a separate
`StockListing('ETF/KR')` feed. The user-facing catalog needs both —
otherwise pension-relevant products (채권혼합·TDF·국공채 ETF 등)
disappear.
"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import FinanceDataReader as fdr

OUT_PATH = Path(__file__).resolve().parents[1] / "src/server/data/krx.json"

# FDR's MarketId column on the stocks feed → canonical market name.
MARKET_ID_TO_NAME = {
    "STK": "KOSPI",
    "KSQ": "KOSDAQ",
    "KNX": "KONEX",
}


def fetch_stocks() -> list[dict]:
    df = fdr.StockListing("KRX")
    print(f"  stocks: {len(df)} tickers", file=sys.stderr)
    rows = []
    for _, row in df.iterrows():
        code = str(row["Code"]).strip()
        name = str(row["Name"]).strip()
        market_id = str(row.get("MarketId", "")).strip()
        market = MARKET_ID_TO_NAME.get(market_id, market_id or "KRX")
        if not code or not name:
            continue
        rows.append({"symbol": f"KRX:{code}", "name": name, "market": market})
    return rows


def fetch_etfs() -> list[dict]:
    df = fdr.StockListing("ETF/KR")
    print(f"  ETFs:   {len(df)} tickers", file=sys.stderr)
    rows = []
    for _, row in df.iterrows():
        code = str(row["Symbol"]).strip()
        name = str(row["Name"]).strip()
        if not code or not name:
            continue
        rows.append({"symbol": f"KRX:{code}", "name": name, "market": "ETF"})
    return rows


def main() -> int:
    print("Fetching KRX listing via FinanceDataReader…", file=sys.stderr)
    stocks = fetch_stocks()
    etfs = fetch_etfs()

    # Dedup by symbol (some ETFs may show up in both feeds).
    seen: set[str] = set()
    assets: list[dict] = []
    for row in stocks + etfs:
        if row["symbol"] in seen:
            continue
        seen.add(row["symbol"])
        assets.append(row)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "as_of": date.today().isoformat(),
        "count": len(assets),
        "assets": assets,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"wrote {len(assets)} assets → {OUT_PATH}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
