import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatCandidate, selectBestMat } from './matScoring.js';
import { generateMatCandidates } from './matCandidates.js';
import type { Oklch } from './oklch.js';

const photo: Oklch = { l: 0.45, c: 0.09, h: 210 };

test('selectBestMat is deterministic for the same input', () => {
  const candidates = generateMatCandidates(photo);
  assert.deepEqual(selectBestMat(candidates, photo), selectBestMat(candidates, photo));
});

test('selectBestMat picks one of the generated candidates', () => {
  const candidates = generateMatCandidates(photo);
  const chosen = selectBestMat(candidates, photo);
  assert.ok(candidates.some((c) => c.kind === chosen.kind));
});

test('a candidate that nearly matches the photo (hue and lightness) scores lower than a clearly-contrasting one', () => {
  const nearlyInvisible = {
    kind: 'analogous' as const,
    oklch: { l: photo.l + 0.05, c: 0.08, h: photo.h + 5 },
    hex: '#000000',
  };
  const clearlyContrasting = {
    kind: 'complementary' as const,
    oklch: { l: clampToRange(photo.l + 0.35), c: 0.06, h: photo.h + 180 },
    hex: '#ffffff',
  };

  const scoreInvisible = scoreMatCandidate(nearlyInvisible, photo);
  const scoreContrasting = scoreMatCandidate(clearlyContrasting, photo);
  assert.ok(
    scoreContrasting > scoreInvisible,
    `expected contrasting candidate (${scoreContrasting}) to outscore the near-invisible one (${scoreInvisible})`,
  );
});

test('an extremely saturated candidate scores worse than an otherwise-identical low-chroma one', () => {
  const base = { kind: 'complementary' as const, oklch: { l: 0.8, c: 0.02, h: photo.h + 180 }, hex: '#fff' };
  const garish = { kind: 'complementary' as const, oklch: { l: 0.8, c: 0.3, h: photo.h + 180 }, hex: '#fff' };
  assert.ok(scoreMatCandidate(base, photo) > scoreMatCandidate(garish, photo));
});

function clampToRange(v: number): number {
  return Math.min(0.95, Math.max(0.05, v));
}
