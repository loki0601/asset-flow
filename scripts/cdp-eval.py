#!/usr/bin/env python3
"""Connect to Chrome DevTools Protocol over forwarded webview socket and
evaluate a JS expression in the running app. Used to inspect the user's
on-device sql.js state without modifying anything.

Usage: python scripts/cdp-eval.py "<JS expression>"
"""
from __future__ import annotations

import json
import sys
import urllib.request

from websocket import create_connection


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: cdp-eval.py '<js expression>'", file=sys.stderr)
        return 2
    expr = sys.argv[1]

    import os
    port = os.environ.get("CDP_PORT", "9222")
    targets = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read())
    target = next((t for t in targets if "assetflow" in t.get("url", "")), targets[0])
    ws_url = target["webSocketDebuggerUrl"]

    ws = create_connection(
        ws_url,
        origin="",
        header=["Host: localhost"],
        suppress_origin=True,
    )
    try:
        ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": f"(async () => {{ try {{ return JSON.stringify(await ({expr}), null, 2); }} catch (e) {{ return 'ERR: ' + e.message; }} }})()",
                "awaitPromise": True,
                "returnByValue": True,
            },
        }))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == 1:
                result = msg.get("result", {}).get("result", {})
                print(result.get("value", result))
                return 0
    finally:
        ws.close()


if __name__ == "__main__":
    sys.exit(main())
