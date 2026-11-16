import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTool, ONBOARD_PROMPT, onboardCommand } from "../src/setup/onboard.ts";

test("도구별 시작 프롬프트 형식 (--help로 확인한 방식)", () => {
  assert.deepEqual(onboardCommand("claude"), ["claude", [ONBOARD_PROMPT]]);
  assert.deepEqual(onboardCommand("claude", ["--permission-mode", "auto"]), ["claude", ["--permission-mode", "auto", ONBOARD_PROMPT]]);
  assert.deepEqual(onboardCommand("codex"), ["codex", [ONBOARD_PROMPT]]);
  assert.deepEqual(onboardCommand("gemini"), ["gemini", ["-i", ONBOARD_PROMPT]]);
  assert.deepEqual(onboardCommand("cursor-agent"), ["cursor-agent", [ONBOARD_PROMPT]]);
});

test("PATH에서 처음 찾은 도구를 고른다", () => {
  assert.equal(detectTool((name) => name === "codex" || name === "gemini"), "codex");
  assert.equal(detectTool(() => false), null);
});
