#!/usr/bin/env python3
"""Fetch top-N cryptocurrencies from CoinGecko's free public API."""
from __future__ import annotations

import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

OUT_PATH = Path(__file__).resolve().parents[1] / "src/server/data/crypto.json"
URL = (
    "https://api.coingecko.com/api/v3/coins/markets"
    "?vs_currency=krw&order=market_cap_desc&per_page=100&page=1"
)


def main() -> int:
    print("Fetching top 100 cryptos from CoinGecko…", file=sys.stderr)
    req = urllib.request.Request(URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    rows = []
    for coin in data:
        sym = str(coin.get("symbol", "")).upper().strip()
        name = str(coin.get("name", "")).strip()
        if not sym or not name:
            continue
        rows.append({"symbol": f"CRYPTO:{sym}", "name": name, "market": "CoinGecko"})

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "as_of": date.today().isoformat(),
        "count": len(rows),
        "assets": rows,
    }
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"wrote {len(rows)} assets → {OUT_PATH}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
