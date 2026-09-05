import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVideoPresentation, parseImmichDurationSeconds, VIDEO_WATCHDOG_CEILING_SECONDS } from './presentation.js';
import type { ImmichAsset } from '../immich/types.js';

function videoAsset(overrides: Partial<ImmichAsset> = {}): ImmichAsset {
  return {
    id: 'video-1',
    originalFileName: 'clip.mp4',
    type: 'VIDEO',
    exifInfo: null,
    ...overrides,
  };
}

test('buildVideoPresentation sets kind/loop correctly', () => {
  const looping = buildVideoPresentation(videoAsset(), 'Album', 'tv-1', true);
  assert.equal(looping.kind, 'video');
  assert.equal(looping.loop, true);

  const notLooping = buildVideoPresentation(videoAsset(), 'Album', 'tv-1', false);
  assert.equal(notLooping.loop, false);
});

test('poster (url) and stream (videoUrl) are both present and point at different routes', () => {
  const presentation = buildVideoPresentation(videoAsset(), 'Album', 'tv-1', false);
  const [asset] = presentation.assets;
  assert.equal(presentation.assets.length, 1);
  assert.match(asset.url, /\/thumbnail\?size=preview$/);
  assert.match(asset.videoUrl!, /\/video$/);
  assert.notEqual(asset.url, asset.videoUrl);
});

test('video gets no faux-3D framing (unlike a photo\'s subtle/inner) — there\'s no mat for it to sit on', () => {
  const presentation = buildVideoPresentation(videoAsset(), 'Album', 'tv-1', false);
  assert.deepEqual(presentation.frame, { shadow: 'none', bevel: 'none' });
});

test('layout carries exactly one slot referencing the video\'s own asset id', () => {
  const presentation = buildVideoPresentation(videoAsset({ id: 'abc' }), 'Album', 'tv-1', false);
  assert.equal(presentation.layout.type, 'single');
  assert.deepEqual(presentation.layout.slots, [{ assetId: 'abc', position: 'full' }]);
});

test('duration falls back to the watchdog ceiling when Immich reports no duration', () => {
  const presentation = buildVideoPresentation(videoAsset({ duration: null }), 'Album', 'tv-1', false);
  assert.equal(presentation.duration, VIDEO_WATCHDOG_CEILING_SECONDS);
});

test('duration uses Immich\'s real length when parseable', () => {
  const presentation = buildVideoPresentation(videoAsset({ duration: '0:01:23.456000' }), 'Album', 'tv-1', false);
  assert.equal(presentation.duration, 83);
});

test('parseImmichDurationSeconds tolerates unrecognized shapes', () => {
  assert.equal(parseImmichDurationSeconds(null), null);
  assert.equal(parseImmichDurationSeconds(undefined), null);
  assert.equal(parseImmichDurationSeconds(''), null);
  assert.equal(parseImmichDurationSeconds('not-a-duration'), null);
  assert.equal(parseImmichDurationSeconds('0:00:00'), null, 'a zero duration is not a usable value');
  assert.equal(parseImmichDurationSeconds('1:02:03'), 3723);
  assert.equal(parseImmichDurationSeconds('0:01:23.456000'), 83);
});

test('metadata mapping matches the shared EXIF-derived shape (no GPS fields)', () => {
  const presentation = buildVideoPresentation(
    videoAsset({
      originalFileName: 'birthday.mp4',
      exifInfo: {
        make: 'Apple',
        model: 'iPhone 15',
        lensModel: null,
        fNumber: null,
        exposureTime: null,
        iso: null,
        focalLength: null,
        dateTimeOriginal: '2026-01-01T00:00:00Z',
        orientation: '1',
        exifImageWidth: 1920,
        exifImageHeight: 1080,
        latitude: 12.34,
        longitude: 56.78,
        city: 'Somewhere',
        state: null,
        country: null,
      },
    }),
    'Album',
    'tv-1',
    false,
  );
  const metadata = presentation.assets[0].metadata;
  assert.equal(metadata.filename, 'birthday.mp4');
  assert.equal(metadata.camera, 'Apple iPhone 15');
  assert.equal(metadata.takenAt, '2026-01-01T00:00:00Z');
  assert.ok(!('latitude' in metadata), 'video metadata must never carry GPS fields, same as photos');
});
