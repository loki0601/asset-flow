import { getServerSession } from '@/lib/auth';
import { readJSON, userKey, writeJSON } from '@/lib/storage';
import { applyBuy, applySell } from '@/lib/trade';
import type { Holding, Transaction } from '@/lib/schema';

export type ChangeKind = 'upsert' | 'delete';
export type PendingChange = { collection: string; entityId: string; kind: ChangeKind; baseVersion: number; payload?: Record<string, unknown>; clientUpdatedAt: string };
type SyncState = { cursor: number; versions: Record<string, number>; outbox: PendingChange[]; seeded: boolean };
const stateKey = (userId: string) => userKey(userId, 'change-sync');
const empty = (): SyncState => ({ cursor: 0, versions: {}, outbox: [], seeded: false });
const versionKey = (collection: string, id: string) => `${collection}:${id}`;
const syncedCollections = ['members', 'accounts', 'holdings', 'transactions', 'loans', 'retirementTargets'] as const;
const asRecord = (value: object): Record<string, unknown> => ({ ...value });

function syncState(userId: string): SyncState {
  const state = readJSON<Partial<SyncState>>(stateKey(userId), empty());
  return { cursor: state.cursor ?? 0, versions: state.versions ?? {}, outbox: state.outbox ?? [], seeded: state.seeded ?? false };
}

export function queueLocalChange(userId: string, collection: string, entityId: string, kind: ChangeKind, payload?: Record<string, unknown>): void {
  const state = syncState(userId);
  const key = versionKey(collection, entityId);
  const existing = state.outbox.find((change) => change.collection === collection && change.entityId === entityId);
  const next: PendingChange = { collection, entityId, kind, payload, baseVersion: existing?.baseVersion ?? state.versions[key] ?? 0, clientUpdatedAt: new Date().toISOString() };
  state.outbox = existing ? state.outbox.map((change) => change === existing ? next : change) : [...state.outbox, next];
  writeJSON(stateKey(userId), state);
}

/** Adds the existing device ledger to the feed exactly once after migration. */
export function seedChangeFeed(userId: string): void {
  const state = syncState(userId);
  if (state.seeded) return;
  state.seeded = true;
  writeJSON(stateKey(userId), state);
  for (const collection of syncedCollections) {
    const rows = readJSON<Array<Record<string, unknown> & { id: string }>>(userKey(userId, collection), []);
    for (const row of rows) queueLocalChange(userId, collection, row.id, 'upsert', row);
  }
}

// The server route hard-rejects any single request carrying more than this
// many changes (400). A first sync for an existing account (seedChangeFeed
// queues every local row at once) can easily exceed it, so the outbox is
// flushed in batches rather than one all-or-nothing POST.
const MAX_CHANGES_PER_REQUEST = 100;

export async function flushChangeOutbox(userId: string): Promise<void> {
  const session = getServerSession();
  if (!session || session.user.id !== userId) return;
  let state = syncState(userId);
  while (state.outbox.length) {
    const submitted = state.outbox.slice(0, MAX_CHANGES_PER_REQUEST);
    const response = await fetch('/api/sync/changes', { method: 'POST', headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: submitted }) });
    if (!response.ok) throw new Error('변경분 동기화에 실패했습니다.');
    const body = await response.json() as { results: Array<{ ok: boolean; cursor?: number; version?: number }> };
    submitted.forEach((change, index) => {
      const result = body.results[index];
      if (result?.ok && result.version != null && result.cursor != null) {
        state.versions[versionKey(change.collection, change.entityId)] = result.version;
        // Do not advance the pull cursor here. A concurrently committed remote
        // change can have an earlier cursor than this acknowledgement; skipping
        // directly to our cursor would permanently miss that remote change.
      }
    });
    const conflicts = submitted.filter((change, index) => !body.results[index]?.ok);
    const acknowledged = new Set(
      submitted.filter((_, index) => body.results[index]?.ok).map((change) => versionKey(change.collection, change.entityId) + '@' + change.clientUpdatedAt),
    );
    state.outbox = state.outbox.filter((change) => !acknowledged.has(versionKey(change.collection, change.entityId) + '@' + change.clientUpdatedAt));
    writeJSON(stateKey(userId), state);
    if (conflicts.length) {
      await pullChangeFeed(userId, new Set(conflicts.map((change) => versionKey(change.collection, change.entityId))));
      reapplyHoldingConflicts(userId, conflicts, submitted, body.results);
      state = syncState(userId);
    }
  }
}

export function rebaseHoldingFromTransaction(remote: Holding, transaction: Transaction): Holding | null {
  if (!transaction.quantity) return remote;
  return transaction.type === 'buy'
    ? applyBuy(remote, { quantity: transaction.quantity, price: transaction.price ?? 0 })
    : transaction.type === 'sell'
      ? applySell(remote, { quantity: transaction.quantity })
      : remote;
}

function reapplyHoldingConflicts(userId: string, conflicts: PendingChange[], submitted: PendingChange[], results: Array<{ ok: boolean }>): void {
  const transactions = submitted.filter((change, index) => change.collection === 'transactions' && results[index]?.ok)
    .map((change) => change.payload as unknown as Transaction);
  for (const conflict of conflicts.filter((change) => change.collection === 'holdings')) {
    const original = conflict.payload as Holding | undefined;
    const remote = readJSON<Holding[]>(userKey(userId, 'holdings'), []).find((holding) => holding.id === conflict.entityId);
    const trade = transactions.find((tx) => tx.accountId === (original?.accountId ?? remote?.accountId) && tx.symbol === (original?.symbol ?? remote?.symbol));
    if (!remote || !trade || !trade.quantity) continue;
    const rebased = rebaseHoldingFromTransaction(remote, trade);
    // The old pending mutation still carries the stale base version. Remove
    // precisely that operation before queuing the rebased value, so the
    // retry uses the version learned from the forced pull.
    const state = syncState(userId);
    state.outbox = state.outbox.filter((pending) => !(
      pending.collection === conflict.collection
      && pending.entityId === conflict.entityId
      && pending.clientUpdatedAt === conflict.clientUpdatedAt
    ));
    writeJSON(stateKey(userId), state);
    if (rebased) {
      const rows = readJSON<Holding[]>(userKey(userId, 'holdings'), []);
      writeJSON(userKey(userId, 'holdings'), rows.map((row) => row.id === rebased.id ? rebased : row));
      queueLocalChange(userId, 'holdings', rebased.id, 'upsert', asRecord(rebased));
    } else {
      const rows = readJSON<Holding[]>(userKey(userId, 'holdings'), []);
      writeJSON(userKey(userId, 'holdings'), rows.filter((row) => row.id !== remote.id));
      queueLocalChange(userId, 'holdings', remote.id, 'delete');
    }
  }
}

export async function pullChangeFeed(userId: string, overwriteLocalEntities = new Set<string>()): Promise<boolean> {
  const session = getServerSession();
  if (!session || session.user.id !== userId) return false;
  const state = syncState(userId);
  const response = await fetch(`/api/sync/changes?cursor=${state.cursor}`, { headers: { Authorization: `Bearer ${session.token}` } });
  if (!response.ok) throw new Error('변경분을 불러오지 못했습니다.');
  const body = await response.json() as { cursor: number; changes: Array<{ cursor: number; collection: string; entityId: string; kind: ChangeKind; version: number; payload: Record<string, unknown> | null }> };
  for (const change of body.changes) {
    const entityKey = versionKey(change.collection, change.entityId);
    const hasPendingLocalEdit = state.outbox.some((pending) => versionKey(pending.collection, pending.entityId) === entityKey);
    const key = userKey(userId, change.collection);
    const rows = readJSON<Array<Record<string, unknown> & { id: string }>>(key, []);
    if (!hasPendingLocalEdit || overwriteLocalEntities.has(entityKey)) {
      const next = change.kind === 'delete'
        ? rows.filter((row) => row.id !== change.entityId)
        : [...rows.filter((row) => row.id !== change.entityId), change.payload as Record<string, unknown> & { id: string }];
      writeJSON(key, next);
    }
    state.versions[entityKey] = change.version;
    state.cursor = Math.max(state.cursor, change.cursor);
  }
  state.cursor = Math.max(state.cursor, body.cursor);
  writeJSON(stateKey(userId), state);
  return body.changes.length > 0;
}
