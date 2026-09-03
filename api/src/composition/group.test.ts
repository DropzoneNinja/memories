import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupForComposition } from './group.js';
import type { ImmichAsset } from '../immich/types.js';

function asset(id: string, width: number, height: number, orientation = '1'): ImmichAsset {
  return {
    id,
    originalFileName: `${id}.jpg`,
    type: 'IMAGE',
    exifInfo: {
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
    },
  };
}

// Fixed shapes used across tests, named for what they represent. Ratios
// are chosen to match real photo formats, not arbitrary round numbers —
// see preferredGroupSize's comment in group.ts for why that matters.
const landscape = (id: string) => asset(id, 1920, 1080); // 16:9
const square = (id: string) => asset(id, 1000, 1000);
const widePortrait = (id: string) => asset(id, 900, 1000); // ratio 0.9 -> alone
const narrowPortrait = (id: string) => asset(id, 900, 1200); // ratio 0.75 (iPhone) -> pairs
const veryNarrowPortrait = (id: string) => asset(id, 900, 1600); // ratio 0.5625 (9:16) -> triples

function ids(groups: ReturnType<typeof groupForComposition>): string[][] {
  return groups.map((g) => g.slots.map((s) => s.asset.id));
}

test('single-image album: one group, alone', () => {
  const groups = groupForComposition([landscape('a')]);
  assert.deepEqual(ids(groups), [['a']]);
  assert.equal(groups[0].layoutType, 'single');
  assert.equal(groups[0].slots[0].position, 'full');
});

test('empty album: no groups', () => {
  assert.deepEqual(groupForComposition([]), []);
});

test('all-landscape album: every image alone, never paired', () => {
  const groups = groupForComposition([landscape('a'), landscape('b'), landscape('c')]);
  assert.deepEqual(ids(groups), [['a'], ['b'], ['c']]);
  for (const g of groups) assert.equal(g.layoutType, 'single');
});

test('square images are treated like landscape: alone', () => {
  const groups = groupForComposition([square('a'), square('b')]);
  assert.deepEqual(ids(groups), [['a'], ['b']]);
  assert.equal(groups[0].layoutType, 'single');
});

test('all-portrait album (very narrow) groups in triples with a remainder', () => {
  const imgs = ['a', 'b', 'c', 'd'].map(veryNarrowPortrait);
  const groups = groupForComposition(imgs);
  assert.deepEqual(ids(groups), [
    ['a', 'b', 'c'],
    ['d'],
  ]);
  assert.equal(groups[0].layoutType, 'three-portrait');
  assert.equal(groups[1].layoutType, 'single');
});

test('all-portrait album (narrow) groups in pairs with a remainder', () => {
  const imgs = ['a', 'b', 'c', 'd', 'e'].map(narrowPortrait);
  const groups = groupForComposition(imgs);
  assert.deepEqual(ids(groups), [
    ['a', 'b'],
    ['c', 'd'],
    ['e'],
  ]);
  for (const g of groups.slice(0, 2)) assert.equal(g.layoutType, 'two-portrait');
});

test('wide/near-square portraits are shown alone even back-to-back', () => {
  const groups = groupForComposition([widePortrait('a'), widePortrait('b')]);
  assert.deepEqual(ids(groups), [['a'], ['b']]);
  assert.equal(groups[0].layoutType, 'single');
});

test('mixed-orientation album: landscape breaks portrait runs', () => {
  const groups = groupForComposition([
    landscape('l1'),
    narrowPortrait('p1'),
    narrowPortrait('p2'),
    landscape('l2'),
    narrowPortrait('p3'),
  ]);
  assert.deepEqual(ids(groups), [['l1'], ['p1', 'p2'], ['l2'], ['p3']]);
  assert.equal(groups[1].layoutType, 'two-portrait');
});

test('three-portrait slot positions are left/center/right in order', () => {
  const groups = groupForComposition(['a', 'b', 'c'].map(veryNarrowPortrait));
  assert.deepEqual(
    groups[0].slots.map((s) => s.position),
    ['left', 'center', 'right'],
  );
});

test('two-portrait slot positions are left/right in order', () => {
  const groups = groupForComposition(['a', 'b'].map(narrowPortrait));
  assert.deepEqual(
    groups[0].slots.map((s) => s.position),
    ['left', 'right'],
  );
});

test('grouping is deterministic for the same input', () => {
  const imgs = [landscape('a'), narrowPortrait('b'), narrowPortrait('c'), veryNarrowPortrait('d')];
  assert.deepEqual(ids(groupForComposition(imgs)), ids(groupForComposition(imgs)));
});

test('an unusable-dimension asset falls back to landscape and never blocks portrait grouping around it', () => {
  const noDims: ImmichAsset = { id: 'x', originalFileName: 'x.jpg', type: 'IMAGE', exifInfo: null };
  const groups = groupForComposition([narrowPortrait('a'), noDims, narrowPortrait('b')]);
  assert.deepEqual(ids(groups), [['a'], ['x'], ['b']]);
});

// Regression test: real iPhone photos are stored at 4032x3024 with EXIF
// orientation 6 (needs a 90deg rotation to display upright), so the
// *displayed* ratio is 3024/4032 = 0.75 — not the raw stored ratio. An
// earlier version of preferredGroupSize's thresholds classified 0.75 as
// "alone", which meant grouping silently never fired against a real
// photo album (caught by hitting a real Immich instance in Phase 4
// testing, not by these unit tests alone — kept here so it can't regress).
test('real iPhone portrait dimensions (rotated) group in pairs', () => {
  const iphonePortrait = (id: string): ImmichAsset => asset(id, 4032, 3024, '6');
  const groups = groupForComposition([iphonePortrait('a'), iphonePortrait('b')]);
  assert.deepEqual(ids(groups), [['a', 'b']]);
  assert.equal(groups[0].layoutType, 'two-portrait');
});
