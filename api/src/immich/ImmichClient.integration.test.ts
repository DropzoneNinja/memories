// Integration test against a real Immich instance (PROJECT.md §11.1) —
// intentionally not mocked. Skips gracefully if IMMICH_BASE_URL/
// IMMICH_API_KEY aren't set, so it doesn't block anyone without
// credentials configured; exercises the real thing whenever they are.
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
});
