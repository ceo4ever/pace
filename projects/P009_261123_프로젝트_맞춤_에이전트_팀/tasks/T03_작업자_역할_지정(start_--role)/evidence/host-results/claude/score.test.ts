import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleScore } from "./score.ts";

test("정상 값은 곱을 반환한다", () => {
  assert.equal(scaleScore(3, 4), 12);
});

test("0을 보존한다", () => {
  assert.equal(scaleScore(0, 5), 0);
  assert.equal(scaleScore(7, 0), 0);
});

test("음수를 보존한다", () => {
  assert.equal(scaleScore(-2, 3), -6);
  assert.equal(scaleScore(2, -3), -6);
  assert.equal(scaleScore(-2, -3), 6);
});
