import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOrientation, getDisplayDimensions, aspectRatio } from './orientation.js';
import type { ImmichAsset } from '../immich/types.js';

function asset(width: number | null, height: number | null, orientation: string | null = '1'): ImmichAsset {
  return {
    id: 'a',
    originalFileName: 'a.jpg',
    type: 'IMAGE',
    exifInfo:
      width === null || height === null
        ? null
        : {
            make: null,
            model: null,
            lensModel: null,
            fNumber: null,
            exposureTime: null,
            iso: null,
            focalLength: null,
            dateTimeOriginal: null,
            orientation,
            exifImageWidth: width,
            exifImageHeight: height,
            latitude: null,
            longitude: null,
            city: null,
            state: null,
            country: null,
          },
  };
}

test('classifyOrientation: landscape close to 16:9', () => {
  assert.equal(classifyOrientation(asset(1920, 1080)), 'landscape');
});

test('classifyOrientation: portrait', () => {
  assert.equal(classifyOrientation(asset(1080, 1920)), 'portrait');
});

test('classifyOrientation: square', () => {
  assert.equal(classifyOrientation(asset(1000, 1000)), 'square');
});

test('classifyOrientation: near-square within tolerance still counts as square', () => {
  assert.equal(classifyOrientation(asset(1030, 1000)), 'square');
  assert.equal(classifyOrientation(asset(1000, 1030)), 'square');
});

test('classifyOrientation: just outside tolerance is landscape/portrait', () => {
  assert.equal(classifyOrientation(asset(1100, 1000)), 'landscape');
  assert.equal(classifyOrientation(asset(1000, 1100)), 'portrait');
});

test('classifyOrientation: panoramic (very wide) is landscape', () => {
  assert.equal(classifyOrientation(asset(6000, 1500)), 'landscape');
});

test('classifyOrientation: very small image still classifies by ratio', () => {
  assert.equal(classifyOrientation(asset(20, 40)), 'portrait');
});

test('classifyOrientation: missing EXIF/dimensions falls back to landscape', () => {
  assert.equal(classifyOrientation(asset(null, null)), 'landscape');
});

test('classifyOrientation: zero/negative dimensions fall back to landscape', () => {
  assert.equal(classifyOrientation(asset(0, 0)), 'landscape');
});

test('EXIF orientation 6 (90deg rotation) swaps displayed width/height', () => {
  // Stored as a wide sensor image but rotated 90deg for display — should
  // read as portrait once the rotation is accounted for.
  const rotated = asset(4000, 3000, '6');
  assert.deepEqual(getDisplayDimensions(rotated), { width: 3000, height: 4000 });
  assert.equal(classifyOrientation(rotated), 'portrait');
});

test('EXIF orientation 1 (no rotation) leaves dimensions as-is', () => {
  const upright = asset(4000, 3000, '1');
  assert.deepEqual(getDisplayDimensions(upright), { width: 4000, height: 3000 });
});

test('aspectRatio matches display dimensions, falls back to 16:9', () => {
  assert.equal(aspectRatio(asset(1000, 2000)), 0.5);
  assert.equal(aspectRatio(asset(null, null)), 16 / 9);
});
