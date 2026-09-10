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
  for (const mode of [
    'AUTOMATIC',
    'NEUTRAL',
    'WARM',
    'COOL',
    'DARK',
    'LIGHT',
    'COMPLEMENTARY',
    'ANALOGOUS',
    'HIGH_CONTRAST',
    'WHITE',
    'BLACK',
  ] as const) {
    assert.equal(resolveMatTexture(mode), null);
  }
});

test('HIGH_CONTRAST keeps the photo\'s own hue but pushes lightness to whichever extreme contrasts more', () => {
  const highA = resolveMatColour('HIGH_CONTRAST', photoA); // photoA.l = 0.4 -> light mat
  const highB = resolveMatColour('HIGH_CONTRAST', photoB); // photoB.l = 0.7 -> dark mat
  assert.equal(highA.h, photoA.h);
  assert.equal(highB.h, photoB.h);
  assert.ok(highA.l > 0.85, 'a darker photo should get a near-white high-contrast mat');
  assert.ok(highB.l < 0.2, 'a lighter photo should get a near-black high-contrast mat');
});

test('HIGH_CONTRAST is more saturated than every other hue-preserving mode', () => {
  const dominant = photoA;
  const highContrastChroma = resolveMatColour('HIGH_CONTRAST', dominant).c;
  for (const mode of ['DARK', 'LIGHT', 'COMPLEMENTARY', 'ANALOGOUS', 'WARM', 'COOL', 'NEUTRAL'] as const) {
    assert.ok(
      highContrastChroma > resolveMatColour(mode, dominant).c,
      `HIGH_CONTRAST chroma should exceed ${mode}`,
    );
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
