import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { tempDir } from "./helpers.ts";
import { install } from "../src/setup/install.ts";

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(walk(dir).map((p) => [relative(dir, p).split(sep).join("/"), createHash("sha256").update(readFileSync(p)).digest("hex")]));

test("설치: pace-playbook-maker가 도구째 설치본·도구 폴더에 들어가고 설치본에서 생성기·코어가 돈다", async () => {
  const home = tempDir("pace-playbook-home-");
  mkdirSync(join(home, ".claude"), { recursive: true });
  // 같은 이름 계열의 기존 사용자 스킬(업무 저장소 프로젝트 스킬을 홈에 둔 경우)과 다른 스킬은 건드리지 않는다.
  const userSkill = join(home, ".claude/skills/opal-auto-flow-maker");
  mkdirSync(userSkill, { recursive: true });
  writeFileSync(join(userSkill, "SKILL.md"), "---\nname: opal-auto-flow-maker\n---\n사용자 스킬\n");
  const before = snapshot(join(home, ".claude/skills"));
  install({ home, repo: resolve(".") });
  const after = snapshot(join(home, ".claude/skills"));
  for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, `기존 항목 변경: ${file}`);
  const added = new Set(Object.keys(after).filter((f) => !(f in before)).map((f) => f.split("/")[0]));
  assert.ok(added.has("pace-playbook-maker"));
  // 추가는 PACE 저장소 skills/가 내는 이름뿐이다(일반 스킬 폴더 + 캔버스 묶음의 하위 스킬 입구).
  const bundle = JSON.parse(readFileSync(resolve("skills/pace-canvas-skills/manifest.json"), "utf8")) as { skills: Record<string, unknown> };
  const own = new Set([...readdirSync(resolve("skills")).filter((n) => existsSync(join(resolve("skills"), n, "SKILL.md"))), ...Object.keys(bundle.skills)]);
  assert.deepEqual([...added].filter((n) => !own.has(n)), [], "PACE 스킬 목록 밖의 항목이 설치됐다");
  assert.ok(!added.has("opal-auto-flow-maker"));

  const app = join(home, ".pace/app/skills/pace-playbook-maker");
  for (const root of [app, join(home, ".claude/skills/pace-playbook-maker")]) {
    for (const file of ["SKILL.md", "references/schema.md", "references/adapter.md", "tools/build.mjs", "tools/capture-core.mjs"]) assert.ok(existsSync(join(root, file)), `${root} ${file}`);
  }

  // 설치본 위치에서 생성기 실행 + 코어 import
  const work = tempDir("pace-playbook-flow-");
  cpSync(resolve("test/fixtures/playbook/sample-flow"), work, { recursive: true });
  const output = execFileSync(process.execPath, [join(app, "tools/build.mjs"), "--dir", work], { encoding: "utf8" });
  assert.match(output, /단계 4개 생성/);
  assert.ok(existsSync(join(work, "flow/overview.md")) && existsSync(join(work, "flow.html")));
  const core = await import(pathToFileURL(join(app, "tools/capture-core.mjs")).href) as { validateMask: (mask: unknown) => void };
  assert.equal(typeof core.validateMask, "function");
  core.validateMask(["td"]);
});
