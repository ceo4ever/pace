import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * P001 T06 시범 측정 도구(projects/P001…/tasks/T06…/pilot/harness/)의 단위 시험 — 정답 판정기·세션 기록 해석·기록 가리기.
 * 네트워크·브라우저 없이 합성 값만 쓴다. PACE 실행기는 test/**\/*.test.ts만 돌므로 여기서 실행하고 건수로 확인한다.
 */
const projects = resolve("projects");
const p001 = existsSync(projects) ? readdirSync(projects).find((n) => n.startsWith("P001_")) : undefined;
const t06 = p001 ? readdirSync(join(projects, p001, "tasks")).find((n) => n.startsWith("T06")) : undefined;
const dir = p001 && t06 ? join(projects, p001, "tasks", t06, "pilot", "harness") : "";

test("T06 측정 도구 단위 시험이 실제로 실행되고 모두 통과한다", { skip: dir && existsSync(dir) ? false : "T06 측정 도구 폴더가 없다" }, () => {
  const files = readdirSync(dir).filter((n) => n.endsWith(".test.mjs")).map((n) => join(dir, n));
  assert.deepEqual(files.map((f) => f.split(/[\\/]/).pop()).sort(), ["analyze.test.mjs", "score.test.mjs", "scrub.test.mjs"]);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files], { encoding: "utf8", env });
  const out = result.stdout;
  const count = (name: string) => Number(new RegExp(`^# ${name} (\\d+)`, "m").exec(out)?.[1] ?? Number.NaN);
  assert.equal(result.status, 0, out.slice(-2000) + result.stderr.slice(-500));
  assert.equal(count("fail"), 0);
  assert.ok(count("tests") >= 13, `실행된 테스트 ${count("tests")}건`);
  assert.equal(count("pass"), count("tests"));
});
