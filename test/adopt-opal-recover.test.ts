import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { applyAdoptOpal, planAdoptOpal } from "../src/project/adopt-opal.ts";
import { listCandidates } from "../src/project/workspace-registry.ts";
import { runPace, tempDir } from "./helpers.ts";

// .opal이 정본인데 PACE 메모리 명령이 .pace/memory를 먼저 만든 저장소(다른 PC에서 OPAL 프로젝트에 pace memory를 쓴 경우)

const ID = "5a1c2e3f-4b5d-4e6f-8a7b-9c0d1e2f3a4b";
const AGENT = `---\nopal_agent_version: 2\nworkspace_id: ${ID}\n---\n\n# 역할\n\n## Mission\n\nHelp.\n\n## Boundaries\n\nAGENTS.md.\n\n## Knowledge\n\nRead \`.opal/memory/\`.\n`;
const memo = (name: string, type: string, body: string) => `---\nname: ${name}\ndescription: ${name} 요약\ntype: ${type}\ncreated: 2026-11-16\nupdated: 2026-11-16\n---\n\n${body}\n`;
const OLD_STATUS = memo("진행 상황", "status", "예전 진행(OPAL)");
const NEW_STATUS = memo("진행 상황", "status", "새 진행(PACE)");
const RULE = memo("규칙 A", "rule", "본문");
const ISSUE = memo("새 이슈", "issue", "PACE로 남긴 이슈");

function git(root: string, args: string[], env: Record<string, string> = {}): string {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.autocrlf=false", "-C", root, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function write(root: string, files: Record<string, string>): void {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
}

/** 첫 커밋은 OPAL 정의, 두 번째 커밋은 PACE 메모리 명령이 만든 .pace/memory. */
function fixture(pace: Record<string, string> = {}): { root: string; home: string } {
  const root = realpathSync.native(tempDir("pace-adopt-recover-")), home = tempDir("pace-adopt-recover-home-");
  git(root, ["init", "-q"]);
  write(root, { ".opal/AGENT.md": AGENT, ".opal/memory/status.md": OLD_STATUS, ".opal/memory/rule-a.md": RULE, ".opal/brain/SCHEMA.md": "# 브레인\n", "AGENTS.md": "# 프로젝트\n" });
  git(root, ["add", "-A"]); git(root, ["commit", "-qm", "opal"], { GIT_COMMITTER_DATE: "2026-11-15T00:00:00+0900" });
  write(root, { ".pace/memory/status.md": NEW_STATUS, ".pace/memory/new-issue.md": ISSUE, ".pace/memory/INDEX.md": "# 메모리 목차\n", ".pace/memory/rule-a.md": RULE, ...pace });
  git(root, ["add", "-A"]); git(root, ["commit", "-qm", "pace memory"], { GIT_COMMITTER_DATE: "2026-11-16T00:00:00+0900" });
  return { root, home };
}

function tree(root: string, dir = ""): string {
  const out: string[] = [];
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (e.name === ".git") continue;
    const rel = dir ? dir + "/" + e.name : e.name;
    out.push(e.isDirectory() ? tree(root, rel) : rel + ":" + readFileSync(join(root, rel)).toString("base64"));
  }
  return out.sort().join("|");
}
const snapshot = (root: string) => tree(root) + git(root, ["status", "--porcelain"]);

test("회수: .pace에 메모리만 있으면 .opal에 먼저 합친 뒤 옮기고 목차를 다시 만든다", () => {
  const { root, home } = fixture();
  const preview = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /\.pace\/memory 회수/);
  assert.match(preview.stdout, /new-issue\.md 합침/); assert.match(preview.stdout, /status\.md 최신으로 교체/);
  assert.match(preview.stdout, /rule-a\.md 버림\(같은 내용\)/); assert.match(preview.stdout, /INDEX\.md 버림/);

  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(!existsSync(join(root, ".opal")));
  const mem = join(root, ".pace", "memory");
  assert.equal(readFileSync(join(mem, "status.md"), "utf8"), NEW_STATUS);
  assert.equal(readFileSync(join(mem, "new-issue.md"), "utf8"), ISSUE);
  assert.equal(readFileSync(join(mem, "rule-a.md"), "utf8"), RULE);
  assert.match(readFileSync(join(root, ".pace", "AGENT.md"), "utf8"), /^pace_agent_version: 2$/m);
  assert.ok(existsSync(join(root, ".pace", "brain", "SCHEMA.md")));
  const index = readFileSync(join(mem, "INDEX.md"), "utf8");
  assert.match(index, /새 이슈/); assert.match(index, /규칙 A/);
  assert.equal(listCandidates(home)[0]?.id, ID);
  // 커밋하면 이력이 이어진다: 커밋된 트리에는 .opal이 없고 .pace만 있다
  git(root, ["add", "-A"]); git(root, ["commit", "-qm", "adopt"]);
  const files = git(root, ["ls-files"]);
  assert.doesNotMatch(files, /^\.opal\//m); assert.match(files, /^\.pace\/memory\/new-issue\.md$/m);
});

test("회수: .opal 쪽 진행 상황 커밋이 더 최신이면 .opal 것을 남긴다", () => {
  const { root, home } = fixture();
  const newest = memo("진행 상황", "status", "가장 최신(OPAL)");
  write(root, { ".opal/memory/status.md": newest });
  git(root, ["add", "-A"]); git(root, ["commit", "-qm", "opal later"], { GIT_COMMITTER_DATE: "2026-11-17T00:00:00+0900" });
  const plan = planAdoptOpal(root, home);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.recover.find((x) => x.file === "status.md"), { file: "status.md", action: "drop", reason: ".opal 쪽 커밋이 최신" });
  const result = applyAdoptOpal(root, home, plan);
  assert.deepEqual(result.blockers, []);
  assert.equal(readFileSync(join(root, ".pace", "memory", "status.md"), "utf8"), newest);
});

test("회수 멈춤: 메모리 밖 항목·같은 이름의 다른 메모리·커밋 안 한 변경·추적 안 되는 파일", () => {
  let f = fixture({ ".pace/AGENT.md": "# 다른 정의\n" });
  assert.match(planAdoptOpal(f.root, f.home).blockers.join(), /메모리 밖의 항목\(AGENT\.md\)/);
  f = fixture({ ".pace/memory/rule-a.md": memo("규칙 A", "rule", "다른 본문") });
  assert.match(planAdoptOpal(f.root, f.home).blockers.join(), /같은 이름의 다른 메모리.*memory\/rule-a\.md/);
  f = fixture(); writeFileSync(join(f.root, ".pace", "memory", "new-issue.md"), "수정");
  assert.match(planAdoptOpal(f.root, f.home).blockers.join(), /\.pace에 커밋 안 한 변경/);
  f = fixture(); writeFileSync(join(f.root, ".gitignore"), ".pace/memory/local.md\n"); git(f.root, ["add", ".gitignore"]); git(f.root, ["commit", "-qm", "ignore"]);
  writeFileSync(join(f.root, ".pace", "memory", "local.md"), "로컬");
  assert.match(planAdoptOpal(f.root, f.home).blockers.join(), /추적하지 않는 파일.*local\.md/);
  // 멈추면 아무것도 바꾸지 않는다
  f = fixture({ ".pace/AGENT.md": "# 다른 정의\n" });
  const before = snapshot(f.root);
  assert.equal(runPace(["adopt", "opal", "--apply"], { home: f.home, cwd: f.root }).status, 1);
  assert.equal(snapshot(f.root), before);
});

test("회수 뒤 단계가 실패하면 .opal·.pace 모두 적용 전으로 되돌린다", () => {
  for (const deps of [{ register: () => { throw new Error("주입된 실패"); } }, { rebuildIndex: () => { throw new Error("주입된 실패"); } }, { rewriteAgent: () => { throw new Error("주입된 실패"); } }]) {
    const { root, home } = fixture();
    writeFileSync(join(root, "unrelated.txt"), "u");
    const before = snapshot(root);
    const result = applyAdoptOpal(root, home, planAdoptOpal(root, home), deps);
    assert.match(result.blockers.join(), /되돌렸다.*주입된 실패/);
    assert.equal(snapshot(root), before);
    assert.deepEqual(listCandidates(home), []);
  }
});
