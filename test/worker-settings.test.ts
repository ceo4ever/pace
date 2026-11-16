import { tempDir } from "./helpers.ts";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync, symlinkSync, unlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { readWorkerSettings, resolveWorkerSettings, setWorkerSettings } from "../src/core/worker-settings.ts";

test("작업자 설정 우선순위와 초기화", () => {
  const env = { PACE_HOME: tempDir("pace-worker-") };
  assert.deepEqual(resolveWorkerSettings("codex", undefined, undefined, env), { model: "gpt-6.1-terra", effort: undefined });
  assert.equal(resolveWorkerSettings("claude", undefined, undefined, env).model, "claude-sonnet-5-5");
  setWorkerSettings("codex", "model", "custom", env);
  setWorkerSettings("codex", "effort", "high", env);
  assert.deepEqual(resolveWorkerSettings("codex", undefined, undefined, env), { model: "custom", effort: "high" });
  assert.deepEqual(resolveWorkerSettings("codex", "override", "default", env), { model: "override", effort: undefined });
  setWorkerSettings("codex", "model", undefined, env);
  setWorkerSettings("codex", "effort", undefined, env);
  assert.deepEqual(readWorkerSettings(env), {});
  assert.throws(() => resolveWorkerSettings("codex", "", undefined, env));
  writeFileSync(join(env.PACE_HOME, "worker-settings.json"), '{invalid');
  assert.throws(() => readWorkerSettings(env), /손상/);
  assert.equal(readFileSync(join(env.PACE_HOME, "worker-settings.json"), "utf8"), '{invalid');
});


test("설정 심볼릭 링크는 읽기와 쓰기를 거부하고 대상과 링크를 보존한다", () => {
  const home = tempDir("pace-worker-link-");
  const external = join(tempDir("pace-worker-external-"), "external.json");
  const path = join(home, "worker-settings.json");
  writeFileSync(external, '{"codex":{"model":"external"}}');
  symlinkSync(external, path);
  const env = { PACE_HOME: home };
  assert.throws(() => readWorkerSettings(env), /일반 파일/);
  assert.throws(() => setWorkerSettings("codex", "model", "changed", env), /일반 파일/);
  assert.equal(lstatSync(path).isSymbolicLink(), true);
  assert.equal(readFileSync(external, "utf8"), '{"codex":{"model":"external"}}');
  unlinkSync(path);
});
