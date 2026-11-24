import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleScore } from "./score.ts";

test("scaleScore multiplies base by multiplier", () => {
  assert.equal(scaleScore(10, 3), 30);
  assert.equal(scaleScore(2.5, 2), 5);
  assert.equal(scaleScore(7, 0), 0);
  assert.equal(scaleScore(-4, 2), -8);
});
