import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupForComposition } from './group.js';
import { classifyOrientation } from './orientation.js';
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
      latitude: null,
      longitude: null,
      city: null,
      state: null,
      country: null,
    },
  };
}

// Fixed shapes used across tests, named for what they represent. Ratios
// are chosen to match real photo formats, not arbitrary round numbers —
// see preferredGroupSize's comment in group.ts for why that matters.
const landscape = (id: string) => asset(id, 1920, 1080); // 16:9
const square = (id: string) => asset(id, 1000, 1000);
const widePortrait = (id: string) => asset(id, 900, 1000); // ratio 0.9 -> pairs (never shown alone)
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

// A dangling remainder of 4 narrow-triple portraits would greedily be
// 3+1 — folded (3 -> 2, 1 -> 2) into 2+2 instead of ever leaving 1 alone.
test('all-portrait album (very narrow) with a 3+1 remainder reflows to 2+2, never a lone portrait', () => {
  const imgs = ['a', 'b', 'c', 'd'].map(veryNarrowPortrait);
  const groups = groupForComposition(imgs);
  assert.deepEqual(ids(groups), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
  for (const g of groups) assert.equal(g.layoutType, 'two-portrait');
});

// A dangling remainder of 5 narrow-pair portraits would greedily be
// 2+2+1 — the trailing 1 is folded into the previous pair (2+3) instead.
test('all-portrait album (narrow) with a 2+2+1 remainder folds into 2+3, never a lone portrait', () => {
  const imgs = ['a', 'b', 'c', 'd', 'e'].map(narrowPortrait);
  const groups = groupForComposition(imgs);
  assert.deepEqual(ids(groups), [
    ['a', 'b'],
    ['c', 'd', 'e'],
  ]);
  assert.equal(groups[0].layoutType, 'two-portrait');
  assert.equal(groups[1].layoutType, 'three-portrait');
});

test('wide/near-square portraits are paired, never shown alone, even back-to-back', () => {
  const groups = groupForComposition([widePortrait('a'), widePortrait('b')]);
  assert.deepEqual(ids(groups), [['a', 'b']]);
  assert.equal(groups[0].layoutType, 'two-portrait');
});

// A single portrait sandwiched between two landscapes has no portrait
// neighbour to pair with — merged with the next image (forward) instead of
// ever standing alone; a trailing lone portrait at the very end of the
// album merges backward into whatever preceded it instead.
test('mixed-orientation album: an isolated portrait merges with a neighbouring landscape, never shown alone', () => {
  const groups = groupForComposition([
    landscape('l1'),
    narrowPortrait('p1'),
    narrowPortrait('p2'),
    landscape('l2'),
    narrowPortrait('p3'),
  ]);
  assert.deepEqual(ids(groups), [['l1'], ['p1', 'p2'], ['l2', 'p3']]);
  assert.equal(groups[1].layoutType, 'two-portrait');
  assert.equal(groups[2].layoutType, 'two-portrait');
});

test('an isolated portrait at the start of the album merges forward with the next landscape', () => {
  const groups = groupForComposition([narrowPortrait('p1'), landscape('l1'), landscape('l2')]);
  assert.deepEqual(ids(groups), [['p1', 'l1'], ['l2']]);
  assert.equal(groups[0].layoutType, 'two-portrait');
});

test('an isolated portrait at the end of the album merges backward into the preceding single', () => {
  const groups = groupForComposition([landscape('l1'), landscape('l2'), narrowPortrait('p1')]);
  assert.deepEqual(ids(groups), [['l1'], ['l2', 'p1']]);
  assert.equal(groups[1].layoutType, 'two-portrait');
});

test('two consecutive isolated portraits (separated by one landscape) both get absorbed, none left alone', () => {
  // p1 merges forward with the landscape between them; p2 has no next
  // image, so it grows that same group to three rather than being
  // stranded — no group here is ever left at size 1.
  const groups = groupForComposition([narrowPortrait('p1'), landscape('l1'), narrowPortrait('p2')]);
  assert.deepEqual(ids(groups), [['p1', 'l1', 'p2']]);
  assert.equal(groups[0].layoutType, 'three-portrait');
});

test('a lone portrait in a single-image album is unavoidable — nothing else exists to pair with', () => {
  const groups = groupForComposition([narrowPortrait('a')]);
  assert.deepEqual(ids(groups), [['a']]);
  assert.equal(groups[0].layoutType, 'single');
});

test('no composition in a realistic mixed album is ever a lone portrait', () => {
  const imgs = [
    landscape('l1'),
    narrowPortrait('p1'),
    landscape('l2'),
    widePortrait('p2'),
    narrowPortrait('p3'),
    narrowPortrait('p4'),
    narrowPortrait('p5'),
    landscape('l3'),
    narrowPortrait('p6'),
  ];
  const groups = groupForComposition(imgs);
  for (const g of groups) {
    const portraitCount = g.slots.filter((s) => classifyOrientation(s.asset) === 'portrait').length;
    assert.ok(!(portraitCount === 1 && g.slots.length === 1), `lone portrait composition: ${ids([g])}`);
  }
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

// Both 'a' and 'b' are isolated single-portrait runs (split by the
// landscape-fallback 'x' between them): 'a' merges forward with 'x', and
// 'b' — with no next image — grows that same pair to three rather than
// being left stranded. Also confirms the unusable-dimension asset never
// blocks portrait grouping around it.
test('an unusable-dimension asset falls back to landscape and never leaves a portrait alone around it', () => {
  const noDims: ImmichAsset = { id: 'x', originalFileName: 'x.jpg', type: 'IMAGE', exifInfo: null };
  const groups = groupForComposition([narrowPortrait('a'), noDims, narrowPortrait('b')]);
  assert.deepEqual(ids(groups), [['a', 'x', 'b']]);
  assert.equal(groups[0].layoutType, 'three-portrait');
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

// --- Collage (opt-in via options.collageFrequency/maxCollageImages) ---

test('collageFrequency omitted (default) reproduces normal grouping exactly, no collage ever appears', () => {
  const imgs = [landscape('l1'), narrowPortrait('p1'), narrowPortrait('p2'), landscape('l2')];
  const groups = groupForComposition(imgs);
  for (const g of groups) assert.notEqual(g.layoutType, 'collage');
  assert.deepEqual(ids(groups), [['l1'], ['p1', 'p2'], ['l2']]);
});

test('collage fires on exactly the Kth composition, capped by maxCollageImages', () => {
  const imgs = ['a', 'b', 'c', 'd', 'e', 'f'].map(landscape);
  const groups = groupForComposition(imgs, { collageFrequency: 3, maxCollageImages: 2 });
  assert.deepEqual(ids(groups), [['a'], ['b'], ['c', 'd'], ['e'], ['f']]);
  assert.deepEqual(
    groups.map((g) => g.layoutType),
    ['single', 'single', 'collage', 'single', 'single'],
  );
});

test('collageFrequency: 1 makes every composition a collage, each capped at maxCollageImages', () => {
  const imgs = ['a', 'b', 'c', 'd', 'e'].map(landscape);
  const groups = groupForComposition(imgs, { collageFrequency: 1, maxCollageImages: 3 });
  assert.deepEqual(ids(groups), [
    ['a', 'b', 'c'],
    ['d', 'e'],
  ]);
  for (const g of groups) assert.equal(g.layoutType, 'collage');
});

test('a collage mixes any orientation in array order, bypassing portrait pairing rules', () => {
  const imgs = [landscape('l1'), narrowPortrait('p1'), narrowPortrait('p2'), landscape('l2')];
  const groups = groupForComposition(imgs, { collageFrequency: 1, maxCollageImages: 4 });
  assert.deepEqual(ids(groups), [['l1', 'p1', 'p2', 'l2']]);
  assert.equal(groups[0].layoutType, 'collage');
});

test('a remainder of fewer than 2 images on a collage turn falls back to normal single grouping', () => {
  const imgs = ['a', 'b', 'c'].map(landscape);
  const groups = groupForComposition(imgs, { collageFrequency: 3, maxCollageImages: 5 });
  assert.deepEqual(ids(groups), [['a'], ['b'], ['c']]);
  for (const g of groups) assert.equal(g.layoutType, 'single');
});

test('every slot in a collage group is positioned "grid"', () => {
  const imgs = ['a', 'b', 'c'].map(landscape);
  const groups = groupForComposition(imgs, { collageFrequency: 1, maxCollageImages: 3 });
  assert.deepEqual(
    groups[0].slots.map((s) => s.position),
    ['grid', 'grid', 'grid'],
  );
});
