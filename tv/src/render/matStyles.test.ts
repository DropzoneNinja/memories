import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxShadowFor } from './matStyles.js';

test('inner bevel keeps the original raised look: outer shadow layers plus a bright hairline highlight', () => {
  const css = boxShadowFor({ shadow: 'subtle', bevel: 'inner' });
  assert.ok(css.includes('0 3px 14px rgba(0,0,0,0.35)'), 'expected the soft outer cast shadow');
  assert.ok(css.includes('inset 0 0 0 1px rgba(255,255,255,0.07)'), 'expected the bright inset hairline highlight');
  assert.ok(!css.includes('inset 0 0 0 2px'), 'raised look must not include the recessed dark seam');
});

test('recessed bevel drops the outer shadow and uses a deep, three-layer inset shadow instead', () => {
  const css = boxShadowFor({ shadow: 'subtle', bevel: 'recessed' });
  assert.ok(!css.includes('0 3px 14px'), 'recessed must not cast a shadow outward onto the mat');
  assert.ok(!css.includes('rgba(255,255,255,0.07)'), 'recessed must not use the bright "raised" highlight');
  assert.ok(css.startsWith('inset'), 'every layer should be an inset shadow');
  // Locks in "deep" as three distinct layers (tight edge shadow, broad
  // falloff, dark seam) rather than one thin band — a future edit that
  // collapses this back to something subtle should fail here.
  assert.equal(css.split(', ').length, 3, 'expected three layered inset shadows for real depth');
  assert.ok(css.includes('inset 0 0 40px 14px'), 'expected a broad, soft falloff reaching well into the photo');
  assert.ok(css.includes('inset 0 0 0 2px rgba(0,0,0,0.5)'), 'expected a dark 2px seam right at the cut line');
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
