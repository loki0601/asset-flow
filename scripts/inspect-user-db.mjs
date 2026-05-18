#!/usr/bin/env node
// Decode the user's on-device sql.js blob (dumped to /tmp/db-dump.json) and
// dump every kv row that's relevant to portfolio flow debugging.
import fs from 'node:fs';
import initSqlJs from 'sql.js';

const payload = JSON.parse(fs.readFileSync('/tmp/db-dump.json', 'utf-8'));
const b64 = payload.b64;
if (!b64) {
  console.error('no b64 in /tmp/db-dump.json');
  process.exit(1);
}

const buf = Buffer.from(b64, 'base64');
const SQL = await initSqlJs({
  locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
});
const db = new SQL.Database(new Uint8Array(buf));

function rows(sql) {
  const r = db.exec(sql);
  if (r.length === 0) return [];
  return r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]])));
}

const kv = rows("SELECT key, value FROM kv ORDER BY key");
console.log('=== KV keys ===');
for (const row of kv) {
  const v = row.value;
  const preview = v.length > 100 ? v.slice(0, 100) + '...' : v;
  console.log(`  ${row.key} (${v.length}b): ${preview}`);
}

console.log('\n=== Holdings ===');
const holdingsKv = kv.find((r) => /^assetflow:user:[^:]+:holdings$/.test(r.key));
if (holdingsKv) {
  const holdings = JSON.parse(holdingsKv.value);
  for (const h of holdings) {
    console.log(`  symbol=${h.symbol} qty=${h.quantity} avg=${h.avgPrice} createdAt=${h.createdAt}`);
  }
}

console.log('\n=== Transactions ===');
const txKv = kv.find((r) => /^assetflow:user:[^:]+:transactions$/.test(r.key));
if (txKv) {
  const txs = JSON.parse(txKv.value);
  for (const t of txs) {
    console.log(
      `  ${t.type} symbol=${t.symbol} qty=${t.quantity} price=${t.price} occurredAt=${t.occurredAt}`,
    );
  }
}

console.log('\n=== price_history (per symbol min/max/count) ===');
const ph = rows(
  "SELECT symbol, MIN(date) as minD, MAX(date) as maxD, COUNT(*) as cnt FROM price_history GROUP BY symbol",
);
for (const r of ph) {
  console.log(`  ${r.symbol}: ${r.cnt} rows  ${r.minD}..${r.maxD}`);
}

console.log('\n=== Last 10 price_history rows for KRX:005930 ===');
const recent = rows(
  "SELECT date, close FROM price_history WHERE symbol='KRX:005930' ORDER BY date DESC LIMIT 10",
);
for (const r of recent) console.log(`  ${r.date}: ${r.close}`);
