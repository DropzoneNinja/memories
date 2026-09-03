import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMatCandidates } from './matCandidates.js';
import { hueDelta } from './oklch.js';
import type { Oklch } from './oklch.js';

const vividBlue: Oklch = { l: 0.5, c: 0.15, h: 260 };
const brightPhoto: Oklch = { l: 0.8, c: 0.1, h: 40 };
const darkPhoto: Oklch = { l: 0.15, c: 0.08, h: 200 };

test('always returns 8 candidates', () => {
  assert.equal(generateMatCandidates(vividBlue).length, 8);
});

test('is deterministic for the same input', () => {
  assert.deepEqual(generateMatCandidates(vividBlue), generateMatCandidates(vividBlue));
});

test('complementary candidate sits opposite the dominant hue', () => {
  const complementary = generateMatCandidates(vividBlue).find((c) => c.kind === 'complementary')!;
  assert.ok(hueDelta(complementary.oklch.h, vividBlue.h + 180) < 1);
});

test('analogous candidate sits near the dominant hue, not opposite it', () => {
  const analogous = generateMatCandidates(vividBlue).find((c) => c.kind === 'analogous')!;
  assert.ok(hueDelta(analogous.oklch.h, vividBlue.h) < 40);
  assert.ok(hueDelta(analogous.oklch.h, vividBlue.h + 180) > 100);
});

test('offers near-black (not near-white) for a bright photo', () => {
  const kinds = generateMatCandidates(brightPhoto).map((c) => c.kind);
  assert.ok(kinds.includes('nearBlack'));
  assert.ok(!kinds.includes('nearWhite'));
});

test('offers near-white (not near-black) for a dark photo', () => {
  const kinds = generateMatCandidates(darkPhoto).map((c) => c.kind);
  assert.ok(kinds.includes('nearWhite'));
  assert.ok(!kinds.includes('nearBlack'));
});

test('no candidate is garishly saturated', () => {
  for (const candidate of generateMatCandidates(vividBlue)) {
    assert.ok(candidate.oklch.c <= 0.14, `${candidate.kind} chroma ${candidate.oklch.c} is too high`);
  }
});

test('every candidate has a well-formed hex colour', () => {
  for (const candidate of generateMatCandidates(vividBlue)) {
    assert.match(candidate.hex, /^#[0-9a-f]{6}$/);
  }
});

test('warm and cool neutrals do not depend on the dominant hue', () => {
  const a = generateMatCandidates(vividBlue).find((c) => c.kind === 'warmNeutral')!;
  const b = generateMatCandidates(brightPhoto).find((c) => c.kind === 'warmNeutral')!;
  assert.deepEqual(a.oklch, b.oklch);
});
