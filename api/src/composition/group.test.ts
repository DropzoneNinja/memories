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
// neighbour to pair with. A portrait may only ever share a composition
// with another portrait — never a landscape/square — so it's shown alone
// instead of being merged with whichever non-portrait image is adjacent.
test('mixed-orientation album: an isolated portrait is shown alone, never paired with a landscape', () => {
  const groups = groupForComposition([
    landscape('l1'),
    narrowPortrait('p1'),
    narrowPortrait('p2'),
    landscape('l2'),
    narrowPortrait('p3'),
  ]);
  assert.deepEqual(ids(groups), [['l1'], ['p1', 'p2'], ['l2'], ['p3']]);
  assert.equal(groups[1].layoutType, 'two-portrait');
  assert.equal(groups[2].layoutType, 'single');
  assert.equal(groups[3].layoutType, 'single');
});

test('an isolated portrait at the start of the album is shown alone, not merged with the next landscape', () => {
  const groups = groupForComposition([narrowPortrait('p1'), landscape('l1'), landscape('l2')]);
  assert.deepEqual(ids(groups), [['p1'], ['l1'], ['l2']]);
  for (const g of groups) assert.equal(g.layoutType, 'single');
});

test('an isolated portrait at the end of the album is shown alone, not merged into the preceding single', () => {
  const groups = groupForComposition([landscape('l1'), landscape('l2'), narrowPortrait('p1')]);
  assert.deepEqual(ids(groups), [['l1'], ['l2'], ['p1']]);
  for (const g of groups) assert.equal(g.layoutType, 'single');
});

test('an isolated portrait looks ahead past an intervening landscape to pair with a later portrait', () => {
  const groups = groupForComposition([narrowPortrait('p1'), landscape('l1'), narrowPortrait('p2')]);
  assert.deepEqual(ids(groups), [
    ['p1', 'p2'],
    ['l1'],
  ]);
  assert.equal(groups[0].layoutType, 'two-portrait');
  assert.equal(groups[1].layoutType, 'single');
});

test('lookahead pairing skips past multiple intervening non-portraits, not just one', () => {
  const groups = groupForComposition([
    narrowPortrait('p1'),
    landscape('l1'),
    landscape('l2'),
    landscape('l3'),
    narrowPortrait('p2'),
  ]);
  assert.deepEqual(ids(groups), [['p1', 'p2'], ['l1'], ['l2'], ['l3']]);
  assert.equal(groups[0].layoutType, 'two-portrait');
});

test('a portrait pulled forward via lookahead is never duplicated in a later collage, which backfills instead', () => {
  const groups = groupForComposition(
    [
      narrowPortrait('p1'),
      landscape('l1'),
      landscape('l2'),
      narrowPortrait('p2'),
      landscape('l3'),
      landscape('l4'),
    ],
    { collageFrequency: 2, maxCollageImages: 3 },
  );
  assert.deepEqual(ids(groups), [
    ['p1', 'p2'],
    ['l1', 'l2', 'l3'],
    ['l4'],
  ]);
  assert.equal(groups[0].layoutType, 'two-portrait');
  assert.equal(groups[1].layoutType, 'collage');
  assert.equal(groups[2].layoutType, 'single');
});

test('a lone portrait in a single-image album is unavoidable — nothing else exists to pair with', () => {
  const groups = groupForComposition([narrowPortrait('a')]);
  assert.deepEqual(ids(groups), [['a']]);
  assert.equal(groups[0].layoutType, 'single');
});

test('no multi-slot composition ever mixes a portrait with a non-portrait', () => {
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
    if (g.slots.length < 2) continue;
    const orientations = new Set(g.slots.map((s) => classifyOrientation(s.asset)));
    assert.equal(orientations.size, 1, `mixed-orientation composition: ${ids([g])}`);
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

// 'x' has no usable dimensions, so it falls back to being classified
// "landscape" — which breaks the portrait run on either side of it, so
// 'a' and 'b' are each isolated single-portrait runs. Lookahead still
// finds 'b' as 'a's partner past 'x', pairing them and leaving 'x' on its
// own, rather than ever merging a portrait with 'x' itself.
test('an unusable-dimension asset falls back to landscape and never gets merged into a portrait group', () => {
  const noDims: ImmichAsset = { id: 'x', originalFileName: 'x.jpg', type: 'IMAGE', exifInfo: null };
  const groups = groupForComposition([narrowPortrait('a'), noDims, narrowPortrait('b')]);
  assert.deepEqual(ids(groups), [
    ['a', 'b'],
    ['x'],
  ]);
  assert.equal(groups[0].layoutType, 'two-portrait');
  assert.equal(groups[1].layoutType, 'single');
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
