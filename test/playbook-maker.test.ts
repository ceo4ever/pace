import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * pace-playbook-maker의 생성기·캡처 코어·스킬 문서 검사는 `.mjs` 테스트(test/playbook/)다.
 * PACE 실행기는 test/**\/*.test.ts만 도므로 여기서 한 번에 돌리고, 실제로 실행됐는지 건수로 확인한다.
 */
const dir = resolve("test/playbook");
const files = readdirSync(dir).filter((name) => name.endsWith(".test.mjs")).map((name) => resolve(dir, name));

test("playbook-maker .mjs 테스트가 실제로 실행되고 모두 통과한다", () => {
  assert.deepEqual(files.map((f) => f.split(/[\\/]/).pop()).sort(), ["build.test.mjs", "capture-core.test.mjs", "skill-doc.test.mjs"]);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // 중첩 실행이 부모 러너에 묻히지 않게
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files], { encoding: "utf8", env });
  const out = result.stdout;
  const count = (name: string) => Number(new RegExp(`^# ${name} (\\d+)`, "m").exec(out)?.[1] ?? Number.NaN);
  assert.equal(result.status, 0, out.slice(-2000) + result.stderr.slice(-500));
  assert.equal(count("fail"), 0);
  assert.ok(count("tests") >= 48, `실행된 테스트 ${count("tests")}건 — 검사가 빠졌다`);
  assert.equal(count("pass"), count("tests"));
});
