import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { applyAdoptOpal, planAdoptOpal } from "../src/project/adopt-opal.ts";
import { agentKind } from "../src/project/agent-definition.ts";
import { createCandidate, listCandidates, registerWorkspace } from "../src/project/workspace-registry.ts";
import { runPace, tempDir } from "./helpers.ts";

const ID = "3f2b8c1e-7d4a-4e5b-9a6c-1d2e3f4a5b6c";
const OPAL_AGENT = `---
opal_agent_version: 2
workspace_id: ${ID}
---

# 지니 — project role

## Mission

Help the user.

## Boundaries

Follow AGENTS.md.

## Knowledge

Read project memory in \`.opal/memory/\` and the brain in \`.opal/brain/\`.
`;

function git(root: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.autocrlf=false", "-C", root, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function fixture(files: Record<string, string> = {}): { root: string; home: string } {
  const root = realpathSync.native(tempDir("pace-adopt-repo-")), home = tempDir("pace-adopt-home-");
  git(root, "init", "-q");
  const all: Record<string, string> = {
    ".opal/AGENT.md": OPAL_AGENT,
    ".opal/memory/rule-a.md": "---\nname: rule-a\n---\n본문\n",
    ".opal/brain/SCHEMA.md": "# 브레인\n",
    "AGENTS.md": "# 프로젝트\n",
    ".gitignore": ".opal/run/\n",
    ...files,
  };
  for (const [name, text] of Object.entries(all)) {
    const path = join(root, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, text);
  }
  git(root, "add", "-A"); git(root, "commit", "-qm", "init");
  mkdirSync(join(root, ".opal", "run"), { recursive: true }); writeFileSync(join(root, ".opal", "run", "ignored.json"), "{}");
  writeFileSync(join(root, "untracked-outside.txt"), "u");
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

const snapshot = (root: string) => tree(root) + (existsSync(join(root, ".git")) ? git(root, "status", "--porcelain") + git(root, "rev-parse", "HEAD") : "") + (existsSync(join(root, ".pace")) ? "P" : "") + (existsSync(join(root, ".opal")) ? "O" : "");

test("S-1 미리보기는 아무것도 바꾸지 않고 목록을 보여 준다", () => {
  const { root, home } = fixture();
  const before = snapshot(root);
  const r = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /미리보기/); assert.match(r.stdout, /\.opal → \.pace/); assert.match(r.stdout, new RegExp(ID));
  assert.equal(snapshot(root), before);
  assert.deepEqual(listCandidates(home), []);
});

test("S-2 apply는 git mv로 옮기고 표지를 바꾸며 ID를 이어받아 등록한다 — 커밋 없음", () => {
  const { root, home } = fixture();
  const head = git(root, "rev-parse", "HEAD");
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(root, ".opal")));
  const text = readFileSync(join(root, ".pace", "AGENT.md"), "utf8");
  assert.match(text, /^pace_agent_version: 2$/m); assert.doesNotMatch(text, /opal/i);
  assert.match(text, /`\.pace\/memory\/`/);
  assert.equal(agentKind(root), "v2");
  assert.ok(existsSync(join(root, ".pace", "memory", "rule-a.md")));
  assert.match(git(root, "status", "--porcelain"), /^R .*\.opal\/memory\/rule-a\.md -> \.pace\/memory\/rule-a\.md/m);
  assert.equal(git(root, "rev-parse", "HEAD"), head);
  const entries = listCandidates(home);
  assert.equal(entries.length, 1); assert.equal(entries[0]!.id, ID); assert.equal(entries[0]!.active, true);
});

test("S-3 재실행은 변경 없이 성공하고 빠진 등록만 복구한다", () => {
  const { root, home } = fixture();
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  const before = snapshot(root), registry = JSON.stringify(listCandidates(home));
  const again = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(again.status, 0, again.stderr); assert.match(again.stdout, /이미 가져온/);
  assert.equal(snapshot(root), before); assert.equal(JSON.stringify(listCandidates(home)), registry);
  // 다른 PC처럼 등록부가 비어 있는 경우
  const home2 = tempDir("pace-adopt-home-");
  const fresh = runPace(["adopt", "opal", "--apply"], { home: home2, cwd: root });
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(listCandidates(home2)[0]?.id, ID);
  assert.equal(snapshot(root), before);
});

function stops(name: string, make: () => { root: string; home: string }, reason: RegExp) {
  test(`S-4 멈춤: ${name}`, () => {
    const { root, home } = make();
    const before = snapshot(root), agent = existsSync(join(root, ".opal", "AGENT.md")) ? readFileSync(join(root, ".opal", "AGENT.md"), "utf8") : "";
    const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
    assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stdout, reason);
    assert.equal(snapshot(root), before);
    if (agent) assert.equal(readFileSync(join(root, ".opal", "AGENT.md"), "utf8"), agent);
    assert.equal(listCandidates(home).some((e) => e.path === root), false);
  });
}

stops(".pace와 .opal이 함께 있다", () => fixture({ ".pace/x.md": "x" }), /\.pace\/가 이미 있다/);
stops(".opal에 커밋 안 한 변경", () => { const f = fixture(); writeFileSync(join(f.root, ".opal", "memory", "rule-a.md"), "수정"); return f; }, /커밋 안 한 변경/);
stops("v1(MEMORY.json)", () => fixture({ ".opal/MEMORY.json": "{}" }), /v1/);
stops("버전 없는 AGENT", () => fixture({ ".opal/AGENT.md": "# 옛 형식\n" }), /v2 형식이 아니다/);
stops("AGENT에 필수 절 없음", () => fixture({ ".opal/AGENT.md": `---\nopal_agent_version: 2\nworkspace_id: ${ID}\n---\n\n# x\n` }), /바꿀 수 없다/);
stops("git 저장소가 아님", () => { const home = tempDir("pace-adopt-home-"), root = realpathSync.native(tempDir("pace-adopt-plain-")); mkdirSync(join(root, ".opal")); return { root, home }; }, /git 저장소가 아니다/);
stops("다른 경로에 같은 ID가 등록됨", () => {
  const f = fixture();
  const other = fixture();
  assert.equal(runPace(["adopt", "opal", "--apply"], { home: f.home, cwd: other.root }).status, 0);
  return { root: f.root, home: f.home };
}, /다른 위치/);

test("S-4 멈춤: .opal 안의 링크", (t) => {
  const { root, home } = fixture();
  try { symlinkSync(join(root, "AGENTS.md"), join(root, ".opal", "link.md")); } catch { t.skip("심볼릭 링크 권한 없음"); return; }
  git(root, "add", "-A"); git(root, "commit", "-qm", "link");
  const plan = planAdoptOpal(root, home);
  assert.match(plan.blockers.join(), /링크/);
});

test("S-5 단계별 실패는 인덱스·무관한 변경까지 적용 전으로 되돌린다", () => {
  for (const stage of ["rewrite", "register"] as const) {
    const { root, home } = fixture();
    writeFileSync(join(root, "unrelated.txt"), "u"); writeFileSync(join(root, "staged.txt"), "s"); git(root, "add", "staged.txt");
    const before = snapshot(root), cached = git(root, "diff", "--cached", "--name-status");
    const plan = planAdoptOpal(root, home);
    const result = applyAdoptOpal(root, home, plan, stage === "rewrite"
      ? { rewriteAgent: () => { throw new Error("주입된 실패"); } }
      : { register: () => { throw new Error("주입된 실패"); } });
    assert.match(result.blockers.join(), /되돌렸다.*주입된 실패/);
    assert.equal(snapshot(root), before); assert.equal(git(root, "diff", "--cached", "--name-status"), cached);
    assert.equal(readFileSync(join(root, ".opal", "AGENT.md"), "utf8"), OPAL_AGENT);
    assert.equal(readFileSync(join(root, "unrelated.txt"), "utf8"), "u");
    assert.deepEqual(listCandidates(home), []);
  }
});

test("S-5 부분 변경 뒤 실패(AGENT 일부 기록·등록부 기록)도 바이트 단위로 되돌린다", () => {
  for (const stage of ["rewrite", "register"] as const) {
    const { root, home } = fixture();
    const before = snapshot(root), registry = JSON.stringify(listCandidates(home));
    const plan = planAdoptOpal(root, home);
    const result = applyAdoptOpal(root, home, plan, stage === "rewrite"
      ? { rewriteAgent: (path) => { writeFileSync(path, "---\n반쪽"); throw new Error("부분 기록 뒤 실패"); } }
      : { register: () => { throw new Error("등록 시작 전 실패"); } });
    assert.match(result.blockers.join(), /되돌렸다.*실패/);
    assert.equal(snapshot(root), before);
    assert.equal(JSON.stringify(listCandidates(home)), registry);
    assert.equal(git(root, "diff", "--cached", "--name-status"), "");
  }
});

test("S-6 AGENT만 바뀌면 커밋 안 한 변경으로 멈춘다", () => {
  const { root, home } = fixture();
  const plan = planAdoptOpal(root, home);
  writeFileSync(join(root, ".opal", "AGENT.md"), OPAL_AGENT + "추가\n");
  const before = snapshot(root);
  assert.match(applyAdoptOpal(root, home, plan).blockers.join(), /커밋 안 한 변경/);
  assert.equal(snapshot(root), before);
});

test("S-1 무시된 파일을 함께 옮긴다고 경고한다", () => {
  const { root, home } = fixture();
  assert.match(planAdoptOpal(root, home).warnings.join(), /.gitignore에 걸린 파일 1개/);
});

test("S-5 복구까지 실패하면 실패한 항목을 보고한다", () => {
  const { root, home } = fixture();
  const plan = planAdoptOpal(root, home);
  // 등록 실패 뒤 복구 전에 .opal 자리를 막아 git mv 되돌리기를 실패시킨다
  const result = applyAdoptOpal(root, home, plan, { register: () => { writeFileSync(join(root, ".opal"), "x"); throw new Error("주입된 실패"); } });
  assert.match(result.blockers.join(), /되돌리지 못한 것.*git mv 되돌리기 실패/);
});

test("S-6 미리보기 뒤 등록부가 바뀌면 멈춘다", () => {
  const { root, home } = fixture();
  const plan = planAdoptOpal(root, home);
  registerWorkspace(home, { path: tempDir("pace-adopt-other-"), name: "다른", summary: "" }, 1500);
  const before = snapshot(root);
  const result = applyAdoptOpal(root, home, plan);
  assert.match(result.blockers.join(), /상태가 바뀌었다/);
  assert.equal(snapshot(root), before);
});

test("S-2 맥락 보존: AGENT 외 파일은 그대로, AGENT는 허용한 치환뿐", () => {
  const { root, home } = fixture({ ".opal/memory/한글-메모.md": "---\nname: 한글\n---\n.opal/ 언급은 그대로\n", ".opal/run/state.json": "{}" });
  const read = (dir: string) => Object.fromEntries(readdirSync(join(root, dir), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => { const p = join(e.parentPath, e.name); return [p.slice(join(root, dir).length + 1).replaceAll("\\", "/"), readFileSync(p, "utf8")]; }));
  const before = read(".opal");
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  git(root, "add", "-A");
  const after = read(".pace");
  const { "AGENT.md": a0, ...rest0 } = before, { "AGENT.md": a1, ...rest1 } = after;
  assert.deepEqual(rest1, rest0);
  assert.equal(a1, a0!.replace("opal_agent_version", "pace_agent_version").replaceAll(".opal/", ".pace/"));
  assert.equal(listCandidates(home)[0]!.id, ID);
  assert.match(a1!, new RegExp("workspace_id: " + ID));
});

test("S-3 같은 경로·다른 ID는 거부한다", () => {
  const { root, home } = fixture();
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  const file = join(home, "projects", ID + ".json");
  const entry = JSON.parse(readFileSync(file, "utf8"));
  const other = "11111111-2222-4333-8444-555555555555";
  writeFileSync(join(home, "projects", other + ".json"), JSON.stringify({ ...entry, id: other }));
  rmSync(file);
  const r = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(r.status, 1); assert.match(r.stdout, /다른 workspace_id/);
});

test("S-4 멈춤: staged 변경·untracked 파일·하위 폴더 실행·무효 .pace", () => {
  let f = fixture(); writeFileSync(join(f.root, ".opal", "memory", "rule-a.md"), "수정"); git(f.root, "add", "-A");
  assert.match(planAdoptOpal(f.root, f.home).blockers.join(), /커밋 안 한 변경/);
  f = fixture(); writeFileSync(join(f.root, ".opal", "memory", "new.md"), "새");
  assert.match(planAdoptOpal(f.root, f.home).blockers.join(), /커밋 안 한 변경/);
  f = fixture();
  assert.match(planAdoptOpal(join(f.root, ".opal"), f.home).blockers.join(), /저장소 루트에서/);
  f = fixture({ ".pace/AGENT.md": "# 망가진 정의\n" }); git(f.root, "mv", ".opal/AGENT.md", ".opal/AGENT.md.bak".replace("opal/", "opal/"));
  const g = fixture({ ".pace/AGENT.md": "# 망가진 정의\n" });
  git(g.root, "rm", "-rq", ".opal"); rmSync(join(g.root, ".opal"), { recursive: true, force: true });
  assert.match(planAdoptOpal(g.root, g.home).blockers.join(), /PACE v2 형식이 아니라/);
});

test("S-7 복구는 그 사이 다른 작업이 등록한 항목을 지우지 않는다", () => {
  const { root, home } = fixture();
  const plan = planAdoptOpal(root, home);
  let otherId = "";
  const result = applyAdoptOpal(root, home, plan, { register: (h, input) => {
    void input;
    otherId = registerWorkspace(h, { path: tempDir("pace-adopt-other-"), name: "다른", summary: "" }, 1500).id;
    throw new Error("등록 뒤 실패");
  } });
  assert.match(result.blockers.join(), /되돌렸다/);
  assert.deepEqual(listCandidates(home).map((e) => e.id), [otherId]);
});

test("S-6 계획 뒤 .opal의 staged·untracked 변경도 멈춘다", () => {
  for (const mutate of [(r: string) => { writeFileSync(join(r, ".opal", "memory", "rule-a.md"), "수정"); git(r, "add", "-A"); }, (r: string) => writeFileSync(join(r, ".opal", "memory", "new.md"), "새")]) {
    const { root, home } = fixture();
    const plan = planAdoptOpal(root, home);
    mutate(root);
    const before = snapshot(root);
    assert.match(applyAdoptOpal(root, home, plan).blockers.join(), /커밋 안 한 변경/);
    assert.equal(snapshot(root), before);
  }
});

test("S-5 git mv 실패는 이동 전·이동 뒤 모두 적용 전 상태로 돌린다", () => {
  for (const partial of [false, true]) {
    const { root, home } = fixture();
    const before = snapshot(root);
    const plan = planAdoptOpal(root, home);
    const result = applyAdoptOpal(root, home, plan, { move: (r) => {
      if (partial) git(r, "mv", ".opal", ".pace");
      return { ok: false, out: "주입된 mv 실패" };
    } });
    assert.match(result.blockers.join(), /되돌렸다.*git mv 실패/);
    assert.equal(snapshot(root), before);
    assert.equal(git(root, "diff", "--cached", "--name-status"), "");
    assert.deepEqual(listCandidates(home), []);
  }
});

test("S-7 등록 직전에 경쟁 실행이 같은 ID를 먼저 등록한 뒤 이번이 실패해도 그 항목은 그대로다", () => {
  const { root, home } = fixture();
  const plan = planAdoptOpal(root, home);
  const result = applyAdoptOpal(root, home, plan, {
    rewriteAgent: (path, text) => { writeFileSync(path, text); createCandidate(home, { path: root, name: "경쟁", summary: "" }, ID); },
    register: () => { throw new Error("등록 실패"); },
  });
  assert.match(result.blockers.join(), /되돌렸다/);
  assert.deepEqual(listCandidates(home).map((e) => e.id), [ID]);
});
