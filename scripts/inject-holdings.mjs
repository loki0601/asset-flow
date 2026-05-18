#!/usr/bin/env node
// Inject the holdings batch from the user's message into the device's
// sql.js DB. Reads /tmp/db-current.json (b64 blob), writes /tmp/db-patched.txt
// for cdp-push-blob.py to push back. Each holding also gets a matching
// buy transaction so the asset-flow chart reflects the correct cost basis.

import fs from 'node:fs';
import initSqlJs from 'sql.js';
import { createId } from '@paralleldrive/cuid2';

const USER_ID = 'fhbrtmomxsejc87sh3sf0f4r';

const ACCOUNTS = {
  KB_KR:   'c0c0jq8y1fp81whxieem13bu', // KB증권 국내주식
  KB_US:   'u5t9328tyw5xpztxrae0c6kd', // KB증권 해외주식
  KB_GOLD: 'nkc4xtlhl2o8gtm7mjzhrwjv', // KB증권 금현물
};

const HOLDINGS = [
  { accountId: ACCOUNTS.KB_KR,   symbol: 'KRX:005930',   quantity: 249,  avgPrice: 145648,    date: '2025-01-31' },

  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:ARKX',  quantity: 14,   avgPrice: 32.4971,   date: '2024-01-01' },
  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:GOOGL', quantity: 41,   avgPrice: 214.2966,  date: '2024-01-01' },
  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:AAPL',  quantity: 37,   avgPrice: 272.0743,  date: '2024-01-01' },
  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:AVGO',  quantity: 33,   avgPrice: 191.0364,  date: '2024-01-01' },
  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:META',  quantity: 12,   avgPrice: 621.0658,  date: '2024-01-01' },
  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:MSFT',  quantity: 17,   avgPrice: 428.4088,  date: '2024-01-01' },
  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:NVDA',  quantity: 60,   avgPrice: 139.7000,  date: '2024-01-01' },
  { accountId: ACCOUNTS.KB_US,   symbol: 'NASDAQ:TSLA',  quantity: 32,   avgPrice: 336.9672,  date: '2024-01-01' },

  { accountId: ACCOUNTS.KB_GOLD, symbol: 'KRX:GOLD',     quantity: 44,   avgPrice: 223372,    date: '2025-01-01' },
];

const SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
const buf = Buffer.from(JSON.parse(fs.readFileSync('/tmp/db-current.json', 'utf-8')).b64, 'base64');
const db = new SQL.Database(new Uint8Array(buf));

function rows(sql) {
  const r = db.exec(sql);
  return r.length === 0 ? [] : r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]])));
}

const holdingsKey = `assetflow:user:${USER_ID}:holdings`;
const txKey = `assetflow:user:${USER_ID}:transactions`;
const existingH = JSON.parse(rows(`SELECT value FROM kv WHERE key = '${holdingsKey}'`)[0].value);
const existingTx = JSON.parse(rows(`SELECT value FROM kv WHERE key = '${txKey}'`)[0].value);
console.log(`existing holdings: ${existingH.length}, transactions: ${existingTx.length}`);

const newHoldings = [...existingH];
const newTxs = [...existingTx];

for (const h of HOLDINGS) {
  const occurredAt = new Date(h.date + 'T00:00:00Z').toISOString();
  const amount = Math.round(h.quantity * h.avgPrice);
  const holdingId = createId();
  newHoldings.push({
    id: holdingId,
    userId: USER_ID,
    accountId: h.accountId,
    symbol: h.symbol,
    quantity: h.quantity,
    avgPrice: h.avgPrice,
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  newTxs.push({
    id: createId(),
    userId: USER_ID,
    accountId: h.accountId,
    symbol: h.symbol,
    type: 'buy',
    quantity: h.quantity,
    price: h.avgPrice,
    amount,
    occurredAt,
  });
}

db.run('UPDATE kv SET value = ? WHERE key = ?', [JSON.stringify(newHoldings), holdingsKey]);
db.run('UPDATE kv SET value = ? WHERE key = ?', [JSON.stringify(newTxs), txKey]);

const out = Buffer.from(db.export()).toString('base64');
fs.writeFileSync('/tmp/db-patched.txt', out);
console.log(`new holdings: ${newHoldings.length}, transactions: ${newTxs.length}`);
console.log(`wrote ${out.length}b to /tmp/db-patched.txt`);
