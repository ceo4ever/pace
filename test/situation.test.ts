import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { analyzeProject, projectRootForMemory } from "../src/project/situation.ts";
import { tempDir } from "./helpers.ts";

function gitRepo(dir: string, files: string[] = []): void {
  mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q", "-b", "main", dir]);
  for (const f of files) writeFileSync(join(dir, f), "x");
  if (files.length > 0) {
    spawnSync("git", ["-C", dir, "add", "-A"]);
    spawnSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "첫 커밋"]);
  }
}

test("홈 폴더와 그 위는 프로젝트가 아니다 (~/.pace가 있어도)", () => {
  const home = tempDir();
  mkdirSync(join(home, ".pace", "memory"), { recursive: true });
  writeFileSync(join(home, "notes.txt"), "x");
  assert.equal(analyzeProject(home, home).situation, "outside");
  assert.throws(() => projectRootForMemory(home, home), /홈 폴더는 프로젝트가 아니다/);
});

test("상황 판별: 새 프로젝트 / 정의 없음 / PACE 프로젝트", () => {
  const home = tempDir();
  const empty = join(home, "empty");
  mkdirSync(empty);
  assert.equal(analyzeProject(empty, home).situation, "new");

  const freshRepo = join(home, "fresh");
  gitRepo(freshRepo, ["README.md"]);
  assert.equal(analyzeProject(freshRepo, home).situation, "new");

  const code = join(home, "code");
  gitRepo(code, ["main.ts"]);
  const info = analyzeProject(join(code), home);
  assert.equal(info.situation, "undefined");
  assert.equal(info.git?.branch, "main");
  assert.match(info.git?.recent[0] ?? "", /첫 커밋/);

  writeFileSync(join(code, "AGENTS.md"), "# code");
  mkdirSync(join(code, "src"));
  const inside = analyzeProject(join(code, "src"), home);
  assert.equal(inside.situation, "pace");
  assert.equal(inside.root, code);
  assert.equal(inside.git?.dirty, 1, "AGENTS.md가 커밋 안 된 변경");
  assert.equal(projectRootForMemory(join(code, "src"), home), code);
});

test("AGENT 정의만 있는 저장소도 하위 폴더에서 루트를 찾는다", () => {
  const home = tempDir(), v2 = join(home, "v2");
  mkdirSync(join(v2, ".pace"), { recursive: true });
  mkdirSync(join(v2, "src"));
  writeFileSync(join(v2, ".pace", "AGENT.md"), ["---", "pace_agent_version: 2", "workspace_id: 00000000-0000-4000-8000-000000000000", "---", "", "# Jarvis — role", "", "## Mission", "Help.", "", "## Boundaries", "Follow rules.", "", "## Knowledge", "Read memory.", ""].join("\n"));
  const info = analyzeProject(join(v2, "src"), home);
  assert.equal(info.situation, "pace");
  assert.equal(info.root, v2);
});
