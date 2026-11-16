import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cloneProfile,
  createProfile,
  getDefaultProfile,
  listProfiles,
  loadProfile,
  resolveProfileName,
  setDefaultProfile,
} from "../src/profile/profile.ts";
import { addMemory, listMemories, profileMemoryDir } from "../src/memory/memory.ts";
import { ALTU, tempDir } from "./helpers.ts";

test("프로필을 만들면 SOUL·USER·config와 빈 메모리 목차가 생기고 첫 프로필이 기본이 된다", () => {
  // 시스템 규칙(RULES)은 프로필에 두지 않는다 — 부트가 templates/RULES.md에서 읽는다.
  const home = tempDir();
  const dir = createProfile(home, ALTU);
  for (const file of ["SOUL.md", "USER.md", "config.yaml", "memory/INDEX.md"]) {
    assert.ok(existsSync(join(dir, file)), file);
  }
  const soul = readFileSync(join(dir, "SOUL.md"), "utf8");
  assert.match(soul, /^name: 알투$/m);
  assert.match(soul, /^owner_name: 캡틴$/m);
  assert.doesNotMatch(soul, /\{\{/);
  assert.match(soul, /캡틴의 AI 비서 \*\*알투\*\*/);
  assert.ok(!existsSync(join(dir, "RULES.md")));
  assert.equal(getDefaultProfile(home), "default");
  assert.equal(loadProfile(home, "default").displayName, "알투");
});

test("두 번째 프로필은 기본을 바꾸지 않고, use로 바꾼다", () => {
  const home = tempDir();
  createProfile(home, ALTU);
  createProfile(home, { ...ALTU, name: "coder", displayName: "코더" });
  assert.equal(getDefaultProfile(home), "default");
  setDefaultProfile(home, "coder");
  assert.equal(getDefaultProfile(home), "coder");
  assert.deepEqual(listProfiles(home), ["coder", "default"]);
});

test("복제는 정체성·규칙만 가져오고 메모리와 USER는 새로 시작한다", () => {
  const home = tempDir();
  const src = createProfile(home, ALTU);
  addMemory(profileMemoryDir(src), "profile", { type: "rule", name: "확인 후 커밋", description: "승인 뒤에만 커밋" });
  writeFileSync(join(src, "USER.md"), "# 캡틴\n- 비밀 메모\n");
  const dir = cloneProfile(home, "default", "coder", { displayName: "코더" });
  assert.match(readFileSync(join(dir, "SOUL.md"), "utf8"), /^name: 코더$/m);
  assert.match(readFileSync(join(dir, "config.yaml"), "utf8"), /^profile: coder$/m);
  assert.doesNotMatch(readFileSync(join(dir, "USER.md"), "utf8"), /비밀 메모/);
  assert.equal(listMemories(profileMemoryDir(dir)).length, 0);
  assert.equal(listMemories(profileMemoryDir(src)).length, 1);
});

test("PACE_PROFILE 환경변수가 기본 프로필보다 우선한다", () => {
  const home = tempDir();
  createProfile(home, ALTU);
  assert.equal(resolveProfileName(home, {}), "default");
  assert.equal(resolveProfileName(home, { PACE_PROFILE: "coder" }), "coder");
});

test("잘못된 이름과 중복 생성을 거부한다", () => {
  const home = tempDir();
  assert.throws(() => createProfile(home, { ...ALTU, name: "My Agent" }), /영소문자/);
  createProfile(home, ALTU);
  assert.throws(() => createProfile(home, ALTU), /이미 있는 프로필/);
});
