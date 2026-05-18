import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryStore,
  setStorage,
  readJSON,
  writeJSON,
  removeKey,
  userKey,
  globalKey,
} from '@/lib/storage';

beforeEach(() => {
  setStorage(new MemoryStore());
});

describe('userKey', () => {
  it('namespaces collection by user id', () => {
    expect(userKey('alice', 'accounts')).toBe('assetflow:user:alice:accounts');
  });
});

describe('globalKey', () => {
  it('uses the assetflow prefix without a user scope', () => {
    expect(globalKey('session')).toBe('assetflow:session');
  });
});

describe('readJSON / writeJSON', () => {
  it('returns the fallback when nothing is stored', () => {
    expect(readJSON('foo', { x: 1 })).toEqual({ x: 1 });
  });

  it('round-trips arbitrary JSON values', () => {
    writeJSON('foo', { a: 'b', n: 2, list: [1, 2, 3] });
    expect(readJSON('foo', null)).toEqual({ a: 'b', n: 2, list: [1, 2, 3] });
  });

  it('returns the fallback when stored value is invalid JSON', () => {
    const store = new MemoryStore();
    store.setItem('bad', '{not json');
    setStorage(store);
    expect(readJSON('bad', 'fallback')).toBe('fallback');
  });
});

describe('removeKey', () => {
  it('deletes a previously written key', () => {
    writeJSON('foo', 1);
    removeKey('foo');
    expect(readJSON('foo', 'gone')).toBe('gone');
  });
});

describe('user isolation', () => {
  it('keeps each user’s collection separate', () => {
    writeJSON(userKey('alice', 'accounts'), [{ id: 'a1' }]);
    writeJSON(userKey('bob', 'accounts'), [{ id: 'b1' }]);
    expect(readJSON(userKey('alice', 'accounts'), [])).toEqual([{ id: 'a1' }]);
    expect(readJSON(userKey('bob', 'accounts'), [])).toEqual([{ id: 'b1' }]);
  });
});
