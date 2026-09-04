import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDelay } from './backoff.js';

test('doubles each attempt starting from baseMs', () => {
  const opts = { baseMs: 1000, capMs: 30_000 };
  assert.equal(nextDelay(1, opts), 1000);
  assert.equal(nextDelay(2, opts), 2000);
  assert.equal(nextDelay(3, opts), 4000);
  assert.equal(nextDelay(4, opts), 8000);
});

test('clamps to capMs once the doubled value would exceed it', () => {
  const opts = { baseMs: 1000, capMs: 5000 };
  assert.equal(nextDelay(3, opts), 4000);
  assert.equal(nextDelay(4, opts), 5000);
  assert.equal(nextDelay(10, opts), 5000);
});

test('attempt 0 or negative is treated the same as attempt 1', () => {
  const opts = { baseMs: 1000, capMs: 30_000 };
  assert.equal(nextDelay(0, opts), 1000);
  assert.equal(nextDelay(-5, opts), 1000);
});
