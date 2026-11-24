import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scaleScore } from './score.ts';

test('multiplies positive scores', () => {
  assert.equal(scaleScore(3, 4), 12);
});

test('returns zero when either input is zero', () => {
  assert.equal(scaleScore(0, 4), 0);
  assert.equal(scaleScore(3, 0), 0);
});

test('preserves the sign of a negative product', () => {
  assert.equal(scaleScore(-3, 4), -12);
  assert.equal(scaleScore(3, -4), -12);
});
