import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxShadowFor } from './matStyles.js';

test('inner bevel keeps the original raised look: outer shadow layers plus a bright hairline highlight', () => {
  const css = boxShadowFor({ shadow: 'subtle', bevel: 'inner' });
  assert.ok(css.includes('0 3px 14px rgba(0,0,0,0.35)'), 'expected the soft outer cast shadow');
  assert.ok(css.includes('inset 0 0 0 1px rgba(255,255,255,0.07)'), 'expected the bright inset hairline highlight');
  assert.ok(!css.includes('inset 0 0 0 2px'), 'raised look must not include the recessed dark seam');
});

test('recessed bevel drops the "raised" outer cast shadow, but keeps one outer layer for the bevel-reveal ring', () => {
  const css = boxShadowFor({ shadow: 'subtle', bevel: 'recessed' });
  assert.ok(!css.includes('0 3px 14px'), 'recessed must not cast the "raised" shadow outward onto the mat');
  assert.ok(!css.includes('rgba(255,255,255,0.07)'), 'recessed must not use the "raised" bright hairline highlight');
});

test('recessed bevel is a deep, four-layer shadow: bright reveal ring, dark seam, tight shadow, broad falloff', () => {
  const css = boxShadowFor({ shadow: 'subtle', bevel: 'recessed' });
  const layers = css.split(', ');
  // Locks in "deep" as four distinct layers rather than one thin band — a
  // future edit that collapses this back to something subtle should fail
  // here. Three of the four must be inset (painted over the photo); the
  // bevel-reveal ring is deliberately an outer (non-inset) layer so it
  // lands in the mat margin instead of over the photo.
  assert.equal(layers.length, 4, 'expected four layered shadows for real depth');
  assert.equal(layers.filter((l) => l.startsWith('inset')).length, 3, 'expected three inset (over-the-photo) layers');
  assert.ok(css.includes('0 0 0 2px rgba(255,255,255,0.6)'), 'expected a bright bevel-reveal ring outside the window');
  assert.ok(css.includes('inset 0 0 0 2px rgba(0,0,0,0.65)'), 'expected a dark, crisp seam right at the cut line');
  assert.ok(css.includes('inset 0 0 32px 14px'), 'expected a broad, soft falloff reaching well into the photo');
});

test('recessed bevel with shadow "none" produces no layers at all', () => {
  assert.equal(boxShadowFor({ shadow: 'none', bevel: 'recessed' }), '');
});

test('bevel "none" produces no layers regardless of shadow', () => {
  assert.equal(boxShadowFor({ shadow: 'none', bevel: 'none' }), '');
  assert.equal(
    boxShadowFor({ shadow: 'subtle', bevel: 'none' }),
    '0 3px 14px rgba(0,0,0,0.35), 0 14px 54px rgba(0,0,0,0.3), 0 0 0 1px rgba(0,0,0,0.08)',
  );
});
