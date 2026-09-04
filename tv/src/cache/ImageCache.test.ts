import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageCache, type FetchLikeResponse } from './ImageCache.js';

interface FakeBlob {
  size: number;
}

function makeHarness(ceilingBytes: number) {
  const fetchCalls: string[] = [];
  const revoked: string[] = [];
  let clock = 0;
  const sizesByUrl = new Map<string, number>();

  const cache = new ImageCache<FakeBlob>({
    ceilingBytes,
    now: () => clock,
    fetchFn: async (url: string): Promise<FetchLikeResponse<FakeBlob>> => {
      fetchCalls.push(url);
      const size = sizesByUrl.get(url) ?? 1000;
      return { ok: true, status: 200, blob: async () => ({ size }) };
    },
    createObjectUrl: (blob) => `blob:${fetchCalls[fetchCalls.length - 1]}:${blob.size}`,
    revokeObjectUrl: (url) => revoked.push(url),
  });

  return {
    cache,
    fetchCalls,
    revoked,
    setSize: (url: string, size: number) => sizesByUrl.set(url, size),
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

test('a cache miss fetches and stores; a hit never re-fetches', async () => {
  const { cache, fetchCalls } = makeHarness(1_000_000);
  const url = 'https://api/assets/a';

  const first = await cache.get(url);
  const second = await cache.get(url);

  assert.equal(first, second);
  assert.deepEqual(fetchCalls, [url]); // only fetched once
  assert.equal(cache.has(url), true);
});

test('totalBytes tracks the sum of every cached blob size', async () => {
  const { cache, setSize } = makeHarness(1_000_000);
  setSize('a', 100);
  setSize('b', 250);

  await cache.get('a');
  await cache.get('b');

  assert.equal(cache.totalBytes(), 350);
  assert.equal(cache.size(), 2);
});

test('evictToFit does nothing while under the byte ceiling', async () => {
  const { cache, setSize, revoked } = makeHarness(1000);
  setSize('a', 500);
  await cache.get('a');

  cache.evictToFit(new Set());

  assert.equal(cache.has('a'), true);
  assert.equal(revoked.length, 0);
});

test('evictToFit removes least-recently-used entries first, until under the ceiling', async () => {
  const { cache, setSize, tick, revoked } = makeHarness(250);
  setSize('a', 100);
  setSize('b', 100);
  setSize('c', 100);

  await cache.get('a');
  tick(10);
  await cache.get('b');
  tick(10);
  await cache.get('c');
  // total = 300, over the 250 ceiling; 'a' is least-recently-used

  cache.evictToFit(new Set());

  assert.equal(cache.has('a'), false, 'oldest entry should be evicted first');
  assert.equal(cache.has('b'), true);
  assert.equal(cache.has('c'), true);
  assert.equal(cache.totalBytes(), 200);
  assert.equal(revoked.length, 1);
});

test('evictToFit never evicts a URL present in keepUrls, even if it is the oldest', async () => {
  const { cache, setSize, tick } = makeHarness(150);
  setSize('a', 100);
  setSize('b', 100);

  await cache.get('a');
  tick(10);
  await cache.get('b');
  // total = 200, over the 150 ceiling; 'a' is oldest but protected

  cache.evictToFit(new Set(['a']));

  assert.equal(cache.has('a'), true, 'protected URL must survive eviction');
  // 'b' had to go since 'a' was protected and we're still over budget
  assert.equal(cache.has('b'), false);
});

test('accessing a cached entry via get() refreshes its LRU position', async () => {
  const { cache, setSize, tick } = makeHarness(250);
  setSize('a', 100);
  setSize('b', 100);
  setSize('c', 100);

  await cache.get('a');
  tick(10);
  await cache.get('b');
  tick(10);
  await cache.get('a'); // touch 'a' again — now 'b' is the oldest
  tick(10);
  await cache.get('c');
  // total = 300, over 250; 'b' should be evicted, not 'a'

  cache.evictToFit(new Set());

  assert.equal(cache.has('a'), true);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('c'), true);
});

test('prefetch fetches misses in the background without throwing on failure', async () => {
  let calls = 0;
  const cache = new ImageCache<FakeBlob>({
    fetchFn: async () => {
      calls += 1;
      throw new Error('network down');
    },
    createObjectUrl: () => 'blob:x',
    revokeObjectUrl: () => {},
  });

  assert.doesNotThrow(() => cache.prefetch(['a', 'b']));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 2);
  assert.equal(cache.size(), 0);
});

test('get() throws on a non-ok fetch response', async () => {
  const cache = new ImageCache<FakeBlob>({
    fetchFn: async () => ({ ok: false, status: 404, blob: async () => ({ size: 0 }) }),
    createObjectUrl: () => 'blob:x',
    revokeObjectUrl: () => {},
  });

  await assert.rejects(() => cache.get('missing'), /404/);
});
