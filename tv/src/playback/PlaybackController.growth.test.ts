// A practical stand-in for PROJECT.md §11.1's "no memory leaks across
// days/weeks of continuous operation" and the Phase 8 "memory/resource
// profiling pass on the TV" — this can't reproduce multi-day wall-clock,
// on-device conditions, but it *can* mechanically prove the actual
// invariant that would otherwise leak: driving thousands of advances
// through an ever-growing stream of never-repeated assets (worse than any
// real, finite, looping album) and asserting the in-memory queue and the
// real ImageCache (not a fake — eviction genuinely runs) both stay
// bounded rather than growing with the number of photos ever shown. Real
// multi-day, on-device soak testing (TASKS.md Phase 8) is still a
// separate, real-time activity this can't replace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackController, type ApiLike, type RendererLike } from './PlaybackController.js';
import { ImageCache, type FetchLikeResponse } from '../cache/ImageCache.js';
import type { PlaylistResponse, Presentation } from '../api/types';

const CYCLES = 2000;
const CACHE_CEILING_BYTES = 20 * 1024 * 1024; // small on purpose, to force real eviction
const FAKE_ASSET_BYTES = 500 * 1024;

interface FakeBlob {
  size: number;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Never repeats an id — an endless stream of "new" photos, deliberately
// harder to bound than any real (finite, looping) album.
let nextAssetId = 0;
function freshPresentation(): Presentation {
  const id = `growth-${nextAssetId++}`;
  return {
    presentationId: id,
    duration: 10,
    kind: 'image',
    loop: false,
    layout: { type: 'single', slots: [{ assetId: id, position: 'full' }] },
    background: { type: 'mat', colour: '#111', texture: null },
    frame: { shadow: 'none', bevel: 'none' },
    transition: { type: 'crossfade', duration: 2 },
    assets: [{ id, url: `/assets/${id}`, metadata: {} }],
  };
}

function makeEndlessFakeApi(): ApiLike {
  return {
    async getPlaylist(_deviceId, count = 5): Promise<PlaylistResponse> {
      const items = Array.from({ length: count }, () => freshPresentation());
      return { configurationVersion: 1, items };
    },
    resolveAssetUrl(url) {
      return url;
    },
  };
}

function makeNoopRenderer(): RendererLike {
  return {
    render() {},
    restartTimer() {},
    clearTimer() {},
    pauseMedia() {},
    resumeMedia() {},
    setOnAdvance() {},
  };
}

function makeRealImageCache(): ImageCache<FakeBlob> {
  return new ImageCache<FakeBlob>({
    ceilingBytes: CACHE_CEILING_BYTES,
    fetchFn: async (url): Promise<FetchLikeResponse<FakeBlob>> => ({
      ok: true,
      status: 200,
      blob: async () => ({ size: FAKE_ASSET_BYTES }),
    }),
    createObjectUrl: () => `blob:${Math.random()}`,
    revokeObjectUrl: () => {},
  });
}

test(`queue and image cache both stay bounded across ${CYCLES} advances through never-repeated assets`, async () => {
  const api = makeEndlessFakeApi();
  const imageCache = makeRealImageCache();
  const renderer = makeNoopRenderer();
  const controller = new PlaybackController(api, 'device-growth', {} as HTMLElement, {
    renderer,
    imageCache,
  });

  await controller.start();
  await flush();

  let maxQueueLength = 0;
  let maxCacheEntries = 0;
  let maxCacheBytes = 0;

  for (let i = 0; i < CYCLES; i++) {
    controller.next();
    await flush();

    const snapshot = controller.diagnosticsSnapshot();
    maxQueueLength = Math.max(maxQueueLength, snapshot.queueLength);
    maxCacheEntries = Math.max(maxCacheEntries, imageCache.size());
    maxCacheBytes = Math.max(maxCacheBytes, imageCache.totalBytes());
  }

  // Generous bounds, not exact internal constants — the point is "does not
  // grow with CYCLES / nextAssetId", not pinning today's exact numbers.
  assert.ok(
    maxQueueLength < 50,
    `in-memory queue should stay small and bounded, peaked at ${maxQueueLength} after ${CYCLES} advances`,
  );
  assert.ok(
    maxCacheEntries < 100,
    `image cache entry count should stay bounded, peaked at ${maxCacheEntries} after ${CYCLES} advances`,
  );
  // Eviction only runs *after* a fetch pushes bytes over the ceiling, so a
  // brief, bounded overshoot (at most a handful of images' worth) is
  // expected and fine — this must never scale with how many photos were
  // ever shown.
  assert.ok(
    maxCacheBytes < CACHE_CEILING_BYTES + 10 * FAKE_ASSET_BYTES,
    `image cache bytes should stay near the ${CACHE_CEILING_BYTES}-byte ceiling, peaked at ${maxCacheBytes}`,
  );
  assert.ok(nextAssetId >= CYCLES, 'sanity check: this run must have actually streamed many distinct assets');
});
