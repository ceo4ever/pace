import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scaleScore } from './score.ts';

test('multiplies a score by a positive multiplier', () => {
  assert.equal(scaleScore(6, 2.5), 15);
});

test('returns zero when either input is zero', () => {
  assert.equal(scaleScore(0, 3), 0);
  assert.equal(scaleScore(6, 0), 0);
});

test('preserves the sign of a negative product', () => {
  assert.equal(scaleScore(-6, 3), -18);
  assert.equal(scaleScore(6, -3), -18);
  assert.equal(scaleScore(-6, -3), 18);
});
