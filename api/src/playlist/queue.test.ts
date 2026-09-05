// Unit tests for the video queue-building path (post-Phase-8 addition).
// buildVideoQueueRows() is deliberately I/O-free (only reads its
// arguments) so it's testable the same way groupForComposition() is,
// without mocking Prisma/Immich — see queue.ts's comment on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Configuration } from '@prisma/client';
import { buildVideoQueueRows } from './queue.js';
import type { ImmichAsset } from '../immich/types.js';

function asset(id: string, type: 'IMAGE' | 'VIDEO' = 'VIDEO'): ImmichAsset {
  return { id, originalFileName: `${id}.mp4`, type };
}

function fakeConfig(overrides: Partial<Configuration> = {}): Configuration {
  return {
    id: 'config-1',
    tvId: 'tv-1',
    version: 1,
    albumIds: ['album-1'],
    intervalSeconds: 600,
    playbackMode: 'SEQUENTIAL',
    matMode: 'AUTOMATIC',
    displayMode: 'VIDEO',
    loop: false,
    disconnectedBehavior: 'CONTINUE_QUEUE',
    cacheSize: 8,
    maxCollageImages: 6,
    collageFrequency: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    immichOwnerId: 'user-1',
    ...overrides,
  };
}

test('filters out IMAGE assets — only VIDEO assets become queue rows', () => {
  const assets = [asset('v0'), asset('i0', 'IMAGE'), asset('v1')];
  const rows = buildVideoQueueRows('tv-1', fakeConfig(), 'Album', assets);
  assert.equal(rows.length, 2);
});

test('SEQUENTIAL preserves input order', () => {
  const assets = [asset('v0'), asset('v1'), asset('v2')];
  const rows = buildVideoQueueRows('tv-1', fakeConfig({ playbackMode: 'SEQUENTIAL' }), 'Album', assets);
  assert.deepEqual(
    rows.map((r) => r.position),
    [0, 1, 2],
  );
  const assetsInPresentation = rows.map((r) => (r.assets as { id: string }[])[0].id);
  assert.deepEqual(assetsInPresentation, ['v0', 'v1', 'v2']);
});

test('SHUFFLE is deterministic for the same tvId/version — same order every time', () => {
  const assets = [asset('v0'), asset('v1'), asset('v2'), asset('v3'), asset('v4')];
  const config = fakeConfig({ playbackMode: 'SHUFFLE', version: 7 });
  const first = buildVideoQueueRows('tv-1', config, 'Album', assets).map((r) => (r.assets as { id: string }[])[0].id);
  const second = buildVideoQueueRows('tv-1', config, 'Album', assets).map((r) => (r.assets as { id: string }[])[0].id);
  assert.deepEqual(first, second);
});

test('every row carries displayMode VIDEO and the config\'s loop value', () => {
  const assets = [asset('v0'), asset('v1')];
  const rows = buildVideoQueueRows('tv-1', fakeConfig({ loop: true }), 'Album', assets);
  assert.ok(rows.every((r) => r.displayMode === 'VIDEO'));
  assert.ok(rows.every((r) => r.loop === true));
});

test('an album with no videos produces an empty queue, not an error', () => {
  const rows = buildVideoQueueRows('tv-1', fakeConfig(), 'Album', [asset('i0', 'IMAGE')]);
  assert.deepEqual(rows, []);
});
