#!/usr/bin/env node
// Patch the user's on-device sql.js DB to fix the Samsung tx occurredAt
// (and holding.createdAt) so the asset-flow chart starts from the real
// buy date. Reads /tmp/db-dump.json (b64 blob from CDP), modifies kv rows,
// writes the new blob to /tmp/db-patched.txt for CDP to push back.

import fs from 'node:fs';
import initSqlJs from 'sql.js';

const TARGET_TX_DATE = '2026-01-30T00:00:00.000Z';
const TARGET_HOLDING_CREATED = '2026-01-30T00:00:00.000Z';

const payload = JSON.parse(fs.readFileSync('/tmp/db-dump.json', 'utf-8'));
const buf = Buffer.from(payload.b64, 'base64');

const SQL = await initSqlJs({
  locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm',
});
const db = new SQL.Database(new Uint8Array(buf));

function rows(sql) {
  const r = db.exec(sql);
  if (r.length === 0) return [];
  return r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]])));
}

const txKvs = rows("SELECT key, value FROM kv WHERE key LIKE 'assetflow:user:%:transactions'");
let patched = 0;
for (const row of txKvs) {
  const txs = JSON.parse(row.value);
  let changed = false;
  for (const t of txs) {
    if (t.symbol === 'KRX:005930' && t.type === 'buy') {
      console.log(`tx ${t.id}: occurredAt ${t.occurredAt} → ${TARGET_TX_DATE}`);
      t.occurredAt = TARGET_TX_DATE;
      changed = true;
      patched++;
    }
  }
  if (changed) {
    db.run('UPDATE kv SET value = ? WHERE key = ?', [JSON.stringify(txs), row.key]);
  }
}

const holdingKvs = rows("SELECT key, value FROM kv WHERE key LIKE 'assetflow:user:%:holdings'");
for (const row of holdingKvs) {
  const hs = JSON.parse(row.value);
  let changed = false;
  for (const h of hs) {
    if (h.symbol === 'KRX:005930') {
      console.log(`holding ${h.id}: createdAt ${h.createdAt} → ${TARGET_HOLDING_CREATED}`);
      h.createdAt = TARGET_HOLDING_CREATED;
      changed = true;
    }
  }
  if (changed) {
    db.run('UPDATE kv SET value = ? WHERE key = ?', [JSON.stringify(hs), row.key]);
  }
}

console.log(`patched ${patched} tx rows`);

const newBlob = Buffer.from(db.export()).toString('base64');
fs.writeFileSync('/tmp/db-patched.txt', newBlob);
console.log(`wrote ${newBlob.length}b to /tmp/db-patched.txt`);
