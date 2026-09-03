import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOrAnalyzeAssetColour } from './cache.js';
import type { ColourStore } from './cache.js';
import type { Oklch } from './oklch.js';

function fakeStore(initial: Record<string, Oklch> = {}): ColourStore {
  const data = new Map(Object.entries(initial));
  return {
    async get(assetId) {
      return data.get(assetId) ?? null;
    },
    async set(assetId, colour) {
      data.set(assetId, colour);
    },
  };
}

test('returns the cached colour without invoking compute on a hit', async () => {
  const cached: Oklch = { l: 0.5, c: 0.05, h: 10 };
  const store = fakeStore({ 'asset-1': cached });
  let computeCalls = 0;

  const result = await getOrAnalyzeAssetColour(store, 'asset-1', async () => {
    computeCalls += 1;
    return { l: 1, c: 1, h: 1 };
  });

  assert.deepEqual(result, cached);
  assert.equal(computeCalls, 0);
});

test('computes and stores on a miss', async () => {
  const store = fakeStore();
  const computed: Oklch = { l: 0.4, c: 0.1, h: 200 };
  let computeCalls = 0;

  const result = await getOrAnalyzeAssetColour(store, 'asset-2', async () => {
    computeCalls += 1;
    return computed;
  });

  assert.deepEqual(result, computed);
  assert.equal(computeCalls, 1);
  assert.deepEqual(await store.get('asset-2'), computed);
});

test('a second lookup after a miss hits the now-populated cache', async () => {
  const store = fakeStore();
  let computeCalls = 0;
  const compute = async (): Promise<Oklch> => {
    computeCalls += 1;
    return { l: 0.3, c: 0.02, h: 90 };
  };

  await getOrAnalyzeAssetColour(store, 'asset-3', compute);
  await getOrAnalyzeAssetColour(store, 'asset-3', compute);

  assert.equal(computeCalls, 1);
});

test('different assets are cached independently', async () => {
  const store = fakeStore();
  const results = await Promise.all([
    getOrAnalyzeAssetColour(store, 'a', async () => ({ l: 0.1, c: 0, h: 0 })),
    getOrAnalyzeAssetColour(store, 'b', async () => ({ l: 0.9, c: 0, h: 0 })),
  ]);
  assert.notDeepEqual(results[0], results[1]);
});
