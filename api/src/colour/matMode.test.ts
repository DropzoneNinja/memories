import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMatColour, resolveMatTexture } from './matMode.js';
import { generateMatCandidates } from './matCandidates.js';
import { selectBestMat } from './matScoring.js';
import type { Oklch } from './oklch.js';

const photoA: Oklch = { l: 0.4, c: 0.1, h: 30 };
const photoB: Oklch = { l: 0.7, c: 0.05, h: 300 };

test('AUTOMATIC matches selectBestMat over generateMatCandidates', () => {
  const expected = selectBestMat(generateMatCandidates(photoA), photoA).oklch;
  assert.deepEqual(resolveMatColour('AUTOMATIC', photoA), expected);
});

test('COMPLEMENTARY returns exactly the complementary candidate', () => {
  const expected = generateMatCandidates(photoA).find((c) => c.kind === 'complementary')!.oklch;
  assert.deepEqual(resolveMatColour('COMPLEMENTARY', photoA), expected);
});

test('ANALOGOUS returns exactly the analogous candidate', () => {
  const expected = generateMatCandidates(photoA).find((c) => c.kind === 'analogous')!.oklch;
  assert.deepEqual(resolveMatColour('ANALOGOUS', photoA), expected);
});

test('DARK and LIGHT return the darker/lighter candidates', () => {
  const darker = generateMatCandidates(photoA).find((c) => c.kind === 'darker')!.oklch;
  const lighter = generateMatCandidates(photoA).find((c) => c.kind === 'lighter')!.oklch;
  assert.deepEqual(resolveMatColour('DARK', photoA), darker);
  assert.deepEqual(resolveMatColour('LIGHT', photoA), lighter);
});

test('WARM and COOL return fixed-hue neutrals regardless of the photo', () => {
  const warmA = resolveMatColour('WARM', photoA);
  const warmB = resolveMatColour('WARM', photoB);
  assert.deepEqual(warmA, warmB);

  const coolA = resolveMatColour('COOL', photoA);
  const coolB = resolveMatColour('COOL', photoB);
  assert.deepEqual(coolA, coolB);

  assert.notDeepEqual(warmA, coolA);
});

test('WHITE, BLACK, WOOD, CORK, and COTTON are fixed and ignore the photo entirely', () => {
  for (const mode of ['WHITE', 'BLACK', 'WOOD', 'CORK', 'COTTON'] as const) {
    assert.deepEqual(resolveMatColour(mode, photoA), resolveMatColour(mode, photoB));
  }
});

test('resolveMatTexture returns a texture only for the three material modes', () => {
  assert.equal(resolveMatTexture('WOOD'), 'wood');
  assert.equal(resolveMatTexture('CORK'), 'cork');
  assert.equal(resolveMatTexture('COTTON'), 'cotton');
  for (const mode of ['AUTOMATIC', 'NEUTRAL', 'WARM', 'COOL', 'DARK', 'LIGHT', 'COMPLEMENTARY', 'ANALOGOUS', 'WHITE', 'BLACK'] as const) {
    assert.equal(resolveMatTexture(mode), null);
  }
});

test('WHITE is very light, BLACK is very dark, WOOD is in between', () => {
  const white = resolveMatColour('WHITE', photoA);
  const black = resolveMatColour('BLACK', photoA);
  const wood = resolveMatColour('WOOD', photoA);
  assert.ok(white.l > 0.9);
  assert.ok(black.l < 0.2);
  assert.ok(wood.l > black.l && wood.l < white.l);
});

test('NEUTRAL is low-chroma', () => {
  const neutral = resolveMatColour('NEUTRAL', photoA);
  assert.ok(neutral.c < 0.02);
});

test('resolveMatColour is deterministic', () => {
  assert.deepEqual(resolveMatColour('AUTOMATIC', photoA), resolveMatColour('AUTOMATIC', photoA));
});
