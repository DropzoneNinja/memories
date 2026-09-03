import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { kMeansOklab, extractDominantColour, FALLBACK_COLOUR } from './dominantColour.js';
import { oklchToRgb, rgbToOklch } from './oklch.js';
import type { Oklab } from './oklch.js';

test('kMeansOklab finds a dominant cluster and reports its size', () => {
  // 20 points clustered tightly around a "dark" colour, 5 around a
  // "light" colour — the dark cluster should come back as dominant.
  const dark: Oklab = { l: 0.2, a: 0.01, b: -0.01 };
  const light: Oklab = { l: 0.9, a: 0.05, b: 0.05 };
  const jitter = (base: Oklab, i: number): Oklab => ({
    l: base.l + ((i % 3) - 1) * 0.001,
    a: base.a,
    b: base.b,
  });

  const points: Oklab[] = [
    ...Array.from({ length: 20 }, (_, i) => jitter(dark, i)),
    ...Array.from({ length: 5 }, (_, i) => jitter(light, i)),
  ];

  const clusters = kMeansOklab(points, 2);
  assert.equal(
    clusters.reduce((sum, c) => sum + c.count, 0),
    25,
  );

  const dominant = clusters.reduce((best, c) => (c.count > best.count ? c : best), clusters[0]);
  assert.ok(dominant.count >= 20, `expected the dark cluster (20 points) to dominate, got count ${dominant.count}`);
  assert.ok(Math.abs(dominant.centroid.l - dark.l) < 0.01);
});

test('kMeansOklab is deterministic for the same input', () => {
  const points: Oklab[] = Array.from({ length: 50 }, (_, i) => ({
    l: (i % 10) / 10,
    a: 0.02,
    b: -0.03,
  }));
  const a = kMeansOklab(points, 4);
  const b = kMeansOklab(points, 4);
  assert.deepEqual(a, b);
});

test('kMeansOklab handles fewer points than clusters requested', () => {
  const points: Oklab[] = [
    { l: 0.5, a: 0, b: 0 },
    { l: 0.6, a: 0, b: 0 },
  ];
  const clusters = kMeansOklab(points, 5);
  assert.equal(clusters.length, 2);
});

test('kMeansOklab handles an empty input', () => {
  assert.deepEqual(kMeansOklab([], 5), []);
});

test('extractDominantColour recovers a known solid colour from a synthetic image', async () => {
  const target = { r: 214, g: 122, b: 40 };
  const png = await sharp({
    create: { width: 40, height: 40, channels: 3, background: target },
  })
    .png()
    .toBuffer();

  const result = await extractDominantColour(png);
  const rgb = oklchToRgb(result);
  assert.ok(Math.abs(rgb.r - target.r) <= 3, `r: ${rgb.r} vs ${target.r}`);
  assert.ok(Math.abs(rgb.g - target.g) <= 3, `g: ${rgb.g} vs ${target.g}`);
  assert.ok(Math.abs(rgb.b - target.b) <= 3, `b: ${rgb.b} vs ${target.b}`);
});

test('extractDominantColour picks the larger region on a two-colour image', async () => {
  // A 40x10 strip of orange stacked on a 40x30 strip of blue — blue
  // should win as the dominant (larger-area) colour.
  const orange = await sharp({ create: { width: 40, height: 10, channels: 3, background: { r: 230, g: 140, b: 30 } } })
    .png()
    .toBuffer();
  const blue = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 30, g: 60, b: 200 } } })
    .png()
    .toBuffer();
  const composite = await sharp({ create: { width: 40, height: 40, channels: 3, background: 'black' } })
    .composite([
      { input: orange, top: 0, left: 0 },
      { input: blue, top: 10, left: 0 },
    ])
    .png()
    .toBuffer();

  const result = await extractDominantColour(composite);
  const blueOklch = rgbToOklch({ r: 30, g: 60, b: 200 });
  const orangeOklch = rgbToOklch({ r: 230, g: 140, b: 30 });

  const resultAsRgb = oklchToRgb(result);
  const distToBlue = Math.hypot(
    resultAsRgb.r - oklchToRgb(blueOklch).r,
    resultAsRgb.g - oklchToRgb(blueOklch).g,
    resultAsRgb.b - oklchToRgb(blueOklch).b,
  );
  const distToOrange = Math.hypot(
    resultAsRgb.r - oklchToRgb(orangeOklch).r,
    resultAsRgb.g - oklchToRgb(orangeOklch).g,
    resultAsRgb.b - oklchToRgb(orangeOklch).b,
  );
  assert.ok(distToBlue < distToOrange, 'expected the larger blue region to be picked as dominant');
});

test('extractDominantColour falls back gracefully on undecodable bytes', async () => {
  const result = await extractDominantColour(Buffer.from('not an image'));
  assert.deepEqual(result, FALLBACK_COLOUR);
});
