// Integration test against a real Immich instance (PROJECT.md §11.1) —
// intentionally not mocked. Skips gracefully if IMMICH_BASE_URL/
// IMMICH_API_KEY aren't set, so it doesn't block anyone without
// credentials configured; exercises the real thing whenever they are.
// These two env vars are test-only now — the running app itself no
// longer reads IMMICH_API_KEY (each user's key lives encrypted in
// Postgres instead, see immich/config.ts), but they're still a convenient
// way to point this specific test at a real instance from a dev machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { ImmichClient } from './ImmichClient.js';
import type { ImmichAlbum, ImmichAsset } from './types.js';

const baseUrl = process.env.IMMICH_BASE_URL;
const apiKey = process.env.IMMICH_API_KEY;
const skip = !baseUrl || !apiKey;

test('Immich integration', { skip }, async (t) => {
  const client = new ImmichClient({ baseUrl: baseUrl!, apiKey: apiKey! });

  let albums: ImmichAlbum[] = [];
  await t.test('lists albums', async () => {
    albums = await client.listAlbums();
    assert.ok(Array.isArray(albums));
  });

  if (albums.length === 0) {
    t.diagnostic('no albums on this Immich instance — skipping asset/thumbnail checks');
    return;
  }

  let assets: ImmichAsset[] = [];
  await t.test("lists an album's assets with EXIF", async () => {
    assets = await client.listAlbumAssets(albums[0].id);
    assert.ok(Array.isArray(assets));
    assert.ok(assets.length > 0, 'expected at least one asset in the album');
  });

  const image = assets.find((a) => a.type === 'IMAGE');
  if (!image) {
    t.diagnostic('no IMAGE-type asset in this album — skipping thumbnail check');
    return;
  }

  await t.test('fetches a thumbnail', async () => {
    const { body, contentType } = await client.fetchThumbnail(image.id, 'preview');
    assert.ok(contentType.startsWith('image/'), `expected an image content-type, got ${contentType}`);
    assert.ok(body.byteLength > 0);
  });

  // Verifies /assets/{id}/video/playback against the real server (post-
  // Phase-8 addition) — this path is only a hypothesis from Immich's
  // public OpenAPI spec (see ImmichClient.fetchVideoStream's comment), and
  // this codebase has already found the real instance disagreeing with the
  // spec once (top-level width/height). This is the actual pre-merge
  // verification step, made durable as a regression test rather than a
  // one-off manual check.
  const video = assets.find((a) => a.type === 'VIDEO');
  if (!video) {
    t.diagnostic('no VIDEO-type asset in this album — skipping video-stream check');
    return;
  }

  await t.test('streams video with Range-request support', async () => {
    const res = await client.fetchVideoStream(video.id, 'bytes=0-1023');
    assert.equal(res.status, 206, `expected a 206 Partial Content response, got ${res.status}`);
    assert.ok(res.headers.get('content-range'), 'expected a content-range header on a ranged response');
    const contentType = res.headers.get('content-type') ?? '';
    assert.ok(contentType.startsWith('video/'), `expected a video content-type, got ${contentType}`);
  });
});
