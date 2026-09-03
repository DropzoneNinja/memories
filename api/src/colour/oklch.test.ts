import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgbToOklch, oklchToRgb, rgbToHex, oklchToHex, combineOklch, hueDelta, normalizeHue } from './oklch.js';
import type { Rgb } from './oklch.js';

function assertRgbClose(actual: Rgb, expected: Rgb, tolerance = 2): void {
  assert.ok(Math.abs(actual.r - expected.r) <= tolerance, `r: ${actual.r} vs ${expected.r}`);
  assert.ok(Math.abs(actual.g - expected.g) <= tolerance, `g: ${actual.g} vs ${expected.g}`);
  assert.ok(Math.abs(actual.b - expected.b) <= tolerance, `b: ${actual.b} vs ${expected.b}`);
}

const SAMPLES: Rgb[] = [
  { r: 255, g: 255, b: 255 }, // white
  { r: 0, g: 0, b: 0 }, // black
  { r: 128, g: 128, b: 128 }, // mid grey
  { r: 255, g: 0, b: 0 }, // red
  { r: 0, g: 255, b: 0 }, // green
  { r: 0, g: 0, b: 255 }, // blue
  { r: 214, g: 122, b: 40 }, // an arbitrary warm orange
  { r: 40, g: 90, b: 214 }, // an arbitrary blue
];

for (const rgb of SAMPLES) {
  test(`round-trips RGB(${rgb.r},${rgb.g},${rgb.b}) through OKLCH`, () => {
    const oklch = rgbToOklch(rgb);
    assertRgbClose(oklchToRgb(oklch), rgb);
  });
}

test('rgbToHex/oklchToHex agree for the same colour', () => {
  const rgb = { r: 214, g: 122, b: 40 };
  assert.equal(oklchToHex(rgbToOklch(rgb)), rgbToHex(rgb));
});

test('hex output is a well-formed #rrggbb string', () => {
  const hex = oklchToHex(rgbToOklch({ r: 12, g: 200, b: 5 }));
  assert.match(hex, /^#[0-9a-f]{6}$/);
});

test('white and black have ~zero chroma', () => {
  assert.ok(rgbToOklch({ r: 255, g: 255, b: 255 }).c < 0.01);
  assert.ok(rgbToOklch({ r: 0, g: 0, b: 0 }).c < 0.01);
});

test('white has higher OKLCH lightness than black', () => {
  const white = rgbToOklch({ r: 255, g: 255, b: 255 });
  const black = rgbToOklch({ r: 0, g: 0, b: 0 });
  assert.ok(white.l > black.l);
});

test('hueDelta takes the shortest path around the wheel', () => {
  assert.equal(hueDelta(10, 350), 20);
  assert.equal(hueDelta(0, 180), 180);
  assert.equal(hueDelta(90, 90), 0);
});

test('normalizeHue wraps into [0, 360)', () => {
  assert.equal(normalizeHue(370), 10);
  assert.equal(normalizeHue(-10), 350);
});

test('combineOklch of a single colour returns that colour', () => {
  const c = rgbToOklch({ r: 200, g: 50, b: 90 });
  const combined = combineOklch([c]);
  assert.ok(Math.abs(combined.l - c.l) < 1e-9);
});

test('combineOklch averages hue correctly across the 0/360 wrap (not naively)', () => {
  // Two colours with hues straddling 0deg (e.g. 10deg and 350deg) should
  // average to ~0deg, not ~180deg (which a naive numeric average of the
  // raw hue values would produce).
  const a = { l: 0.6, c: 0.1, h: 10 };
  const b = { l: 0.6, c: 0.1, h: 350 };
  const combined = combineOklch([a, b]);
  assert.ok(hueDelta(combined.h, 0) < 5, `expected combined hue near 0, got ${combined.h}`);
});

test('combineOklch of near-identical colours stays close to both', () => {
  const a = rgbToOklch({ r: 100, g: 150, b: 200 });
  const b = rgbToOklch({ r: 110, g: 140, b: 195 });
  const combined = combineOklch([a, b]);
  assert.ok(Math.abs(combined.l - (a.l + b.l) / 2) < 0.01);
});
