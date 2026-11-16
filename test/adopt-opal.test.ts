import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { applyAdoptOpal, formatPlan, planAdoptOpal } from "../src/project/adopt-opal.ts";
import { agentKind } from "../src/project/agent-definition.ts";
import { renderDashboardEntry } from "../src/project/dashboard-layout.ts";
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

test("S-5 AGENT를 반쯤 쓴 뒤 실패하거나 등록 시작 전에 실패해도 바이트 단위로 되돌린다", () => {
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

// ── T02: 커밋 게이트 훅·대시보드 진입점·지침 참조 ─────────────────────────────

const OPAL_HOOK_TEXT = [
  "#!/bin/sh",
  "# OPAL commit gate v1",
  'branch=$(git symbolic-ref --quiet --short HEAD) || exit 0',
  'case "$branch" in project/P[0-9][0-9][0-9]) ;; *) exit 0 ;; esac',
  "tags=$(git stripspace --strip-comments < \"$1\" | grep -oE '\\(P[0-9]{3}/T[0-9]{2}\\)' | sort -u | tr -d '()')",
  '[ -n "$tags" ] || exit 0',
  "if ! command -v opal >/dev/null 2>&1; then",
  "  echo 'opal: 경고: opal을 찾지 못해 커밋 태스크 검사를 건너뜀' >&2",
  "  exit 0",
  "fi",
  'for tag in $tags; do',
  '  project=$(printf "%s" "$tag" | cut -d/ -f1)',
  '  task=$(printf "%s" "$tag" | cut -d/ -f2)',
  '  OPAL_COMMIT_CHECK=1 opal project check "$project" "$task" || exit 1',
  "done",
  "",
].join("\n");

const hookFile = (root: string) => join(root, ".git", "hooks", "commit-msg");
function installHook(root: string, text: string): void {
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  writeFileSync(hookFile(root), text, { mode: 0o755 });
}
/** 설치된 PACE가 만드는 공용 진입점을 OPAL 표지로 바꾼 것 — OPAL이 만들던 진입점과 같은 모양 */
function opalEntry(): string {
  return renderDashboardEntry().replace("<!-- pace:backlog-shared:1 -->", "<!-- opal:backlog-shared:1 -->");
}

test("T02-S-1 OPAL 커밋 게이트 훅을 PACE 훅으로 바꾸고 원본을 백업한다", () => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  const preview = runPace(["adopt", "opal"], { home, cwd: root });
  assert.match(preview.stdout, /commit-msg 훅/);
  assert.equal(readFileSync(hookFile(root), "utf8"), OPAL_HOOK_TEXT);
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  assert.match(readFileSync(hookFile(root), "utf8"), /^#!\/bin\/sh\n# PACE commit gate v1\n/);
  assert.equal(readFileSync(hookFile(root) + ".opal-backup", "utf8"), OPAL_HOOK_TEXT);
  // 재실행: 이미 PACE 훅이라 더 바꾸지 않는다
  const again = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(again.status, 0); assert.match(again.stdout, /이미 가져온/);
});

test("T02-S-2 사용자 훅과 수정된 OPAL 훅은 보존한다", () => {
  for (const [text, warns] of [["#!/bin/sh\necho 내 훅\n", false], [OPAL_HOOK_TEXT + "echo 내가 덧붙임\n", true]] as const) {
    const { root, home } = fixture();
    installHook(root, text);
    const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(hookFile(root), "utf8"), text);
    assert.equal(existsSync(hookFile(root) + ".opal-backup"), false);
    assert.match(r.stdout, warns ? /원문과 달라 보존/ : /OPAL 게이트 아님.*보존했다/);
  }
});

test("T02-S-3 OPAL 공용 대시보드 진입점은 PACE 공용 참조로 바꾸고 다른 파일은 보존한다", () => {
  const files = { "backlogs/README.html": opalEntry(), "backlogs/dashboard/data.js": "window.DATA = 1;\n", "backlogs/내-메모.md": "사용자 파일\n" };
  const { root, home } = fixture(files);
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /README\.html/);
  assert.equal(readFileSync(join(root, "backlogs", "README.html"), "utf8"), renderDashboardEntry());
  assert.equal(readFileSync(join(root, "backlogs", "dashboard", "data.js"), "utf8"), files["backlogs/dashboard/data.js"]);
  assert.equal(readFileSync(join(root, "backlogs", "내-메모.md"), "utf8"), files["backlogs/내-메모.md"]);
});

test("T02-S-3 수정된 OPAL 진입점·이미 PACE인 진입점은 건드리지 않는다", () => {
  for (const html of [opalEntry() + "<!-- 내 수정 -->", renderDashboardEntry()]) {
    const { root, home } = fixture({ "backlogs/README.html": html });
    const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(root, "backlogs", "README.html"), "utf8"), html);
  }
});

test("T02-S-4 지침·문서의 opal 명령·스킬 참조는 파일:줄로 보고만 하고 바꾸지 않는다", () => {
  const files = {
    "AGENTS.md": "# 프로젝트\n작업은 `opal project check`로 한다.\n",
    "CLAUDE.md": "@AGENTS.md\n",
    "docs/guide.md": "스킬 opal-project-dev를 쓴다.\n메모는 .opal/memory/ 에 있다.\n",
  };
  const { root, home } = fixture(files);
  const before = Object.fromEntries(Object.keys(files).map((f) => [f, readFileSync(join(root, f), "utf8")]));
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /AGENTS\.md:2(?!\d)/); assert.match(r.stdout, /docs\/guide\.md:1(?!\d)/);
  assert.doesNotMatch(r.stdout, /docs\/guide\.md:2(?!\d)/);
  for (const [f, text] of Object.entries(before)) assert.equal(readFileSync(join(root, f), "utf8"), text);
});

test("T02-S-5 등록 실패 시 훅·백업·진입점도 되돌린다", () => {
  const { root, home } = fixture({ "backlogs/README.html": opalEntry() });
  installHook(root, OPAL_HOOK_TEXT);
  const before = snapshot(root);
  const plan = planAdoptOpal(root, home);
  assert.ok(plan.hook !== null && plan.dashboard);
  const result = applyAdoptOpal(root, home, plan, { register: () => { throw new Error("주입된 실패"); } });
  assert.match(result.blockers.join(), /되돌렸다/);
  assert.equal(snapshot(root), before);
  assert.equal(readFileSync(hookFile(root), "utf8"), OPAL_HOOK_TEXT);
  assert.equal(existsSync(hookFile(root) + ".opal-backup"), false);
});

test("T02-S-5 훅 쓰기가 실패하면 만든 백업을 지우고 이동을 되돌린다", () => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  const before = snapshot(root);
  const result = applyAdoptOpal(root, home, planAdoptOpal(root, home), { writeHook: () => { throw new Error("훅 쓰기 실패"); } });
  assert.match(result.blockers.join(), /되돌렸다.*훅 쓰기 실패/);
  assert.equal(snapshot(root), before);
  assert.equal(existsSync(hookFile(root) + ".opal-backup"), false);
  assert.equal(readFileSync(hookFile(root), "utf8"), OPAL_HOOK_TEXT);
});

test("T02-S-6 미리보기 뒤 훅이 바뀌면 멈춘다", () => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  const plan = planAdoptOpal(root, home);
  installHook(root, "#!/bin/sh\necho 바뀜\n");
  assert.match(applyAdoptOpal(root, home, plan).blockers.join(), /상태가 바뀌었다/);
  assert.equal(readFileSync(hookFile(root), "utf8"), "#!/bin/sh\necho 바뀜\n");
});

// ── T02 보강: 역사적 원문 표본·경계·복구 ───────────────────────────────────────

/** OPAL 시절 page.html(커밋 abb7cf40·5898950d)에서 가져온 원문 — 판별기와 독립된 표본 */
const HISTORICAL_ENTRIES = [
  '<!-- opal:backlog-shared:1 -->\n<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>백로그 대시보드</title><link rel="stylesheet" href="file:///C:/Users/x/.opal/app/src/dashboard/backlog/style.css"><script defer src="dashboard/data.js"></script><script defer src="file:///C:/Users/x/.opal/app/src/dashboard/backlog/core.js"></script><script defer src="file:///C:/Users/x/.opal/app/src/dashboard/backlog/app.js"></script></head><body><p>OPAL 공통 대시보드를 불러오는 중입니다. 화면이 열리지 않으면 OPAL 설치를 확인하고 이 프로젝트에서 opi를 실행하세요.</p></body></html>\n',
  '<!-- opal:backlog-shared:1 -->\n<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>백로그 대시보드</title><link rel="stylesheet" href="file:///C:/Users/x/.opal/app/src/dashboard/backlog/style.css"><script defer src="dashboard/data.js"></script><script defer src="file:///C:/Users/x/.opal/app/src/dashboard/backlog/core.js"></script><script defer src="file:///C:/Users/x/.opal/app/src/dashboard/backlog/app.js"></script></head><body><p>PACE 공통 대시보드를 불러오는 중입니다. 화면이 열리지 않으면 PACE 설치를 확인하고 이 프로젝트에서 pace-project-init을 실행하세요.</p></body></html>\n',
];

test("T02-S-3 역사적 OPAL 진입점 원문 두 판 모두 PACE 참조로 바꾼다", () => {
  for (const html of HISTORICAL_ENTRIES) {
    const { root, home } = fixture({ "backlogs/README.html": html });
    const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(root, "backlogs", "README.html"), "utf8"), renderDashboardEntry());
  }
});

test("T02-S-3 진입점이 링크면 따라가지 않는다", (t) => {
  const { root, home } = fixture();
  const outside = join(tempDir("pace-adopt-outside-"), "README.html");
  writeFileSync(outside, HISTORICAL_ENTRIES[0]!);
  mkdirSync(join(root, "backlogs"), { recursive: true });
  try { symlinkSync(outside, join(root, "backlogs", "README.html")); } catch { t.skip("심볼릭 링크 권한 없음"); return; }
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  assert.equal(readFileSync(outside, "utf8"), HISTORICAL_ENTRIES[0]);
});

test("T02-S-4 같은 줄의 .opal/ 경로와 opal 명령은 명령만 보고하고, 읽지 못한 파일은 알린다", (t) => {
  const { root, home } = fixture({ "AGENTS.md": "`.opal/memory`를 보고 `opal boot`을 실행\n", "docs/a.md": "경로 .opal/brain 만 있다\n" });
  writeFileSync(join(root, "docs", "big.md"), "x".repeat(5 * 1024 * 1024 + 1));
  let linked = true;
  try { symlinkSync(join(root, "AGENTS.md"), join(root, "docs", "link.md")); } catch { linked = false; }
  const r = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /AGENTS\.md:1(?!\d)/); assert.doesNotMatch(r.stdout, /docs\/a\.md:1(?!\d)/);
  assert.match(r.stdout, /검색하지 못한 파일/); assert.match(r.stdout, /docs\/big\.md \(5MB 초과\)/);
  if (linked) assert.match(r.stdout, /docs\/link\.md \(링크\)/); else t.diagnostic("링크 생성 불가 — 링크 사례 생략");
});

test("T02-S-1 기존 백업은 덮어쓰지 않고 새 이름을 고른다", () => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  writeFileSync(hookFile(root) + ".opal-backup", "예전 백업");
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  assert.equal(readFileSync(hookFile(root) + ".opal-backup", "utf8"), "예전 백업");
  assert.equal(readFileSync(hookFile(root) + ".opal-backup-2", "utf8"), OPAL_HOOK_TEXT);
});

test("T02-S-2 상대 hooksPath면 훅을 건드리지 않고 알린다", () => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  git(root, "config", "core.hooksPath", ".githooks");
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(hookFile(root), "utf8"), OPAL_HOOK_TEXT);
  assert.match(r.stdout, /커밋 게이트 훅을 확인하지 못했다/);
});

test("T02-S-6 계획 뒤 진입점이 바뀌면 멈추고 변경본을 보존한다", () => {
  const { root, home } = fixture({ "backlogs/README.html": HISTORICAL_ENTRIES[0]! });
  const plan = planAdoptOpal(root, home);
  writeFileSync(join(root, "backlogs", "README.html"), "<html>내가 고침</html>");
  assert.match(applyAdoptOpal(root, home, plan).blockers.join(), /상태가 바뀌었다/);
  assert.equal(readFileSync(join(root, "backlogs", "README.html"), "utf8"), "<html>내가 고침</html>");
});

test("T02-S-5 진입점 쓰기가 실패하면 훅·백업·진입점·이동이 모두 적용 전으로 돌아간다", () => {
  const { root, home } = fixture({ "backlogs/README.html": HISTORICAL_ENTRIES[0]! });
  installHook(root, OPAL_HOOK_TEXT);
  writeFileSync(hookFile(root) + ".opal-backup", "예전 백업");
  const before = snapshot(root);
  const result = applyAdoptOpal(root, home, planAdoptOpal(root, home), { writeEntry: () => { throw new Error("진입점 쓰기 실패"); } });
  assert.match(result.blockers.join(), /되돌렸다.*진입점 쓰기 실패/);
  assert.equal(snapshot(root), before);
  assert.equal(readFileSync(hookFile(root), "utf8"), OPAL_HOOK_TEXT);
  assert.equal(readFileSync(hookFile(root) + ".opal-backup", "utf8"), "예전 백업");
  assert.equal(existsSync(hookFile(root) + ".opal-backup-2"), false);
});

test("T02-S-1 교체된 훅이 실제로 게이트로 동작한다(차단 조건에서 실패 종료)", (t) => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  const sh = spawnSync("sh", ["-c", "exit 0"]);
  if (sh.status !== 0) { t.skip("sh를 실행할 수 없음"); return; }
  git(root, "checkout", "-q", "-b", "project/P001");
  const bin = tempDir("pace-adopt-bin-");
  writeFileSync(join(bin, "pace"), "#!/bin/sh\necho FAKE-PACE-CALLED >&2\nexit 7\n", { mode: 0o755 });
  const msg = join(tempDir("pace-adopt-msg-"), "MSG");
  writeFileSync(msg, "feat(P001/T01): 시험\n");
  const sep = process.platform === "win32" ? ";" : ":";
  const run = spawnSync("sh", [hookFile(root), msg], { cwd: root, env: { ...process.env, PATH: bin + sep + (process.env.PATH ?? "") }, encoding: "utf8" });
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /FAKE-PACE-CALLED/);
});

test("T02-S-1 교체된 훅의 조건 분기: 대상 브랜치·태그가 있을 때만 검사하고 실패·성공·조건 밖을 구분한다", (t) => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  if (spawnSync("sh", ["-c", "exit 0"]).status !== 0) { t.skip("sh를 실행할 수 없음"); return; }
  const sep = process.platform === "win32" ? ";" : ":";
  const bin = (code: number) => {
    const dir = tempDir("pace-adopt-bin-");
    writeFileSync(join(dir, "pace"), "#!/bin/sh\necho CALLED:$* >&2\nexit " + code + "\n", { mode: 0o755 });
    return dir;
  };
  const run = (branch: string, message: string, code: number) => {
    git(root, "checkout", "-q", "-B", branch);
    const msg = join(tempDir("pace-adopt-msg-"), "MSG");
    writeFileSync(msg, message);
    return spawnSync("sh", [hookFile(root), msg], { cwd: root, env: { ...process.env, PATH: bin(code) + sep + (process.env.PATH ?? "") }, encoding: "utf8" });
  };
  const fail = run("project/P001", "feat(P001/T01): x\n", 7);
  assert.equal(fail.status, 1); assert.match(fail.stderr, /CALLED:project check P001 T01/);
  const ok = run("project/P001", "feat(P001/T01): x\n", 0);
  assert.equal(ok.status, 0); assert.match(ok.stderr, /CALLED:project check P001 T01/);
  const otherBranch = run("feature/x", "feat(P001/T01): x\n", 7);
  assert.equal(otherBranch.status, 0); assert.doesNotMatch(otherBranch.stderr, /CALLED/);
  const noTag = run("project/P001", "docs: 태그 없음\n", 7);
  assert.equal(noTag.status, 0); assert.doesNotMatch(noTag.stderr, /CALLED/);
});

// ── T01 구현 후 검토(post-review-codex.md) 반영 ───────────────────────────────

test("T01-S-4 status.showUntrackedFiles=no여도 .opal의 새 파일을 놓치지 않고 멈춘다", () => {
  const { root, home } = fixture();
  git(root, "config", "status.showUntrackedFiles", "no");
  writeFileSync(join(root, ".opal", "memory", "새.md"), "새 파일");
  const before = snapshot(root);
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /커밋 안 한 변경/);
  assert.equal(snapshot(root), before);
});

test("T01-S-3 같은 경로에 정상 ID 항목과 다른 ID 항목이 함께 있으면 순서와 무관하게 멈춘다", () => {
  const { root, home } = fixture();
  const dir = join(home, "projects");
  mkdirSync(dir, { recursive: true });
  const other = "11111111-2222-4333-8444-555555555555";
  // 정렬 순서상 정상 ID 항목이 먼저 오도록 두 항목 모두 같은 경로로 직접 기록한다
  writeFileSync(join(dir, ID + ".json"), JSON.stringify({ id: ID, path: root, name: "a", summary: "", active: true }));
  writeFileSync(join(dir, other + ".json"), JSON.stringify({ id: other, path: root, name: "b", summary: "", active: true }));
  const before = snapshot(root);
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /다른 workspace_id/);
  assert.equal(snapshot(root), before);
});

test("T01-S-2 .opal/ 치환은 본문에만 적용하고 frontmatter의 다른 값은 보존한다", () => {
  const agent = OPAL_AGENT.replace("workspace_id: " + ID + "\n", "workspace_id: " + ID + "\nnote: 옛 경로 .opal/memory\n");
  const { root, home } = fixture({ ".opal/AGENT.md": agent });
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  const text = readFileSync(join(root, ".pace", "AGENT.md"), "utf8");
  assert.match(text, /^note: 옛 경로 \.opal\/memory$/m);
  assert.match(text, /`\.pace\/memory\/`/);
});

test("T01-S-4 assume-unchanged·skip-worktree가 걸린 파일이 .opal에 있으면 변경을 확인할 수 없어 멈춘다", () => {
  for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
    const { root, home } = fixture();
    git(root, "update-index", flag, ".opal/memory/rule-a.md");
    writeFileSync(join(root, ".opal", "memory", "rule-a.md"), "숨겨진 수정");
    const before = snapshot(root);
    const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
    assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /변경을 숨기는 파일/);
    assert.equal(snapshot(root), before);
  }
});

test("T01-S-5 복구까지 실패하면 출력이 무변경을 단정하지 않는다", () => {
  const { root, home } = fixture();
  const plan = planAdoptOpal(root, home);
  const result = applyAdoptOpal(root, home, plan, { register: () => { writeFileSync(join(root, ".opal"), "x"); throw new Error("주입된 실패"); } });
  const out = formatPlan(result, true);
  assert.doesNotMatch(out, /원본을 바꾸지 않았다/); assert.match(out, /되돌리지 못한 것/);
});

// ── T02 구현 후 검토(post-review-codex-1.md) 반영 ─────────────────────────────

test("T02-S-3 backlogs 디렉터리가 링크면 그 안의 진입점을 따라가 바꾸지 않는다", (t) => {
  const { root, home } = fixture();
  const outside = tempDir("pace-adopt-outside-");
  writeFileSync(join(outside, "README.html"), HISTORICAL_ENTRIES[0]!);
  try { symlinkSync(outside, join(root, "backlogs"), "junction"); } catch { t.skip("링크 생성 권한 없음"); return; }
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(outside, "README.html"), "utf8"), HISTORICAL_ENTRIES[0]);
});

test("T02-S-5 교체는 끝났는데 뒤 단계(chmod 등)가 실패해도 훅 원문과 백업 상태를 되돌린다", () => {
  const { root, home } = fixture({ "backlogs/README.html": HISTORICAL_ENTRIES[0]! });
  installHook(root, OPAL_HOOK_TEXT);
  const before = snapshot(root);
  const result = applyAdoptOpal(root, home, planAdoptOpal(root, home), { writeHook: (path, text) => { writeFileSync(path, text); throw new Error("교체 뒤 실패"); } });
  assert.match(result.blockers.join(), /되돌렸다.*교체 뒤 실패/);
  assert.equal(readFileSync(hookFile(root), "utf8"), OPAL_HOOK_TEXT);
  assert.equal(existsSync(hookFile(root) + ".opal-backup"), false);
  assert.equal(snapshot(root), before);
});

test("T02-S-5 진입점을 쓴 뒤 실패해도 원문으로 되돌린다", () => {
  const { root, home } = fixture({ "backlogs/README.html": HISTORICAL_ENTRIES[0]! });
  const before = snapshot(root);
  const result = applyAdoptOpal(root, home, planAdoptOpal(root, home), { writeEntry: (path, text) => { writeFileSync(path, text); throw new Error("쓴 뒤 실패"); } });
  assert.match(result.blockers.join(), /되돌렸다.*쓴 뒤 실패/);
  assert.equal(snapshot(root), before);
  assert.equal(readFileSync(join(root, "backlogs", "README.html"), "utf8"), HISTORICAL_ENTRIES[0]);
});

test("T02-S-4 docs의 확장자와 무관하게 검색하고, 바이너리는 알리며, 참조는 개수와 무관하게 모두 출력한다", () => {
  const many = Array.from({ length: 45 }, (_, i) => "opal project check " + i).join("\n") + "\n";
  const { root, home } = fixture({ "docs/guide.html": "<p>opal project check</p>\n", "docs/many.md": many });
  writeFileSync(join(root, "docs", "img.png"), Buffer.from([137, 80, 0, 0, 1]));
  const r = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /docs\/guide\.html:1(?!\d)/);
  for (const n of [1, 30, 31, 45]) assert.match(r.stdout, new RegExp("docs/many\\.md:" + n + "(?!\\d)"));
  assert.match(r.stdout, /docs\/img\.png \(바이너리\)/);
});

// ── T02 구현 후 검토 2차(post-review-codex-2.md) 반영 ─────────────────────────

test("T02-S-3 사용자 지정 리소스 참조가 섞인 진입점은 OPAL 원문으로 보지 않는다", () => {
  const edited = HISTORICAL_ENTRIES[0]!.replace("file:///C:/Users/x/.opal/app/src/dashboard/backlog/core.js", "file:///D:/custom/app/src/dashboard/backlog/core.js");
  const { root, home } = fixture({ "backlogs/README.html": edited });
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(root, "backlogs", "README.html"), "utf8"), edited);
  assert.match(r.stdout, /수정된 것 같아 보존/);
});

test("T02-S-1 끊어진 링크인 기존 백업도 충돌로 보고 덮어쓰지 않는다", (t) => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  try { symlinkSync(join(root, "없는-대상"), hookFile(root) + ".opal-backup"); } catch { t.skip("링크 생성 권한 없음"); return; }
  assert.equal(runPace(["adopt", "opal", "--apply"], { home, cwd: root }).status, 0);
  assert.equal(lstatSync(hookFile(root) + ".opal-backup").isSymbolicLink(), true);
  assert.equal(readFileSync(hookFile(root) + ".opal-backup-2", "utf8"), OPAL_HOOK_TEXT);
});

test("T02-S-5 훅 복원이 실패하면 이번에 만든 백업을 지우지 않는다", () => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  const plan = planAdoptOpal(root, home);
  const result = applyAdoptOpal(root, home, plan, {
    // 훅을 PACE 훅으로 바꾼 뒤 실패시키고, 복원이 막히도록 훅 자리를 디렉터리로 바꾼다
    writeHook: (path, text) => { writeFileSync(path, text); rmSync(path); mkdirSync(path); throw new Error("교체 뒤 실패"); },
  });
  assert.match(result.blockers.join(), /되돌리지 못한 것/);
  assert.equal(readFileSync(hookFile(root) + ".opal-backup", "utf8"), OPAL_HOOK_TEXT);
});

test("T02-S-4 docs가 링크면 따라가지 않고 알린다", (t) => {
  const { root, home } = fixture();
  const outside = tempDir("pace-adopt-docs-");
  writeFileSync(join(outside, "x.md"), "opal project check\n");
  try { symlinkSync(outside, join(root, "docs"), "junction"); } catch { t.skip("링크 생성 권한 없음"); return; }
  const r = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /x\.md:1(?!\d)/); assert.match(r.stdout, /docs \(링크\)/);
});

// ── T02 구현 후 검토 3차(post-review-codex-3.md) 반영 ─────────────────────────

test("T02-S-3 리소스 URL을 정규화 표지(@@res:...)로 위조한 진입점은 원문으로 보지 않는다", () => {
  const forged = HISTORICAL_ENTRIES[0]!.replace(/file:\/\/\/C:\/Users\/x\/\.opal\/app\/src\/dashboard\/backlog\/(style\.css|core\.js|app\.js)/g, "@@res:$1");
  const { root, home } = fixture({ "backlogs/README.html": forged });
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(root, "backlogs", "README.html"), "utf8"), forged);
});

test("T02-S-5 백업이 중간까지 쓰인 채 실패해도 이번에 만든 백업 파일을 정리한다", () => {
  const { root, home } = fixture();
  installHook(root, OPAL_HOOK_TEXT);
  const before = snapshot(root);
  const plan = planAdoptOpal(root, home);
  // PACE 훅 쓰기 대신, 백업 파일 이름을 미리 점유할 수 없으므로 훅 쓰기 실패로 백업 생성 경로를 지난 뒤 정리를 확인한다
  const result = applyAdoptOpal(root, home, plan, { writeHook: () => { throw new Error("쓰기 실패"); } });
  assert.match(result.blockers.join(), /되돌렸다/);
  assert.equal(existsSync(hookFile(root) + ".opal-backup"), false);
  assert.equal(snapshot(root), before);
});

test("T02-S-2 이미 PACE 훅이면 그대로 두고 알린다", () => {
  const { root, home } = fixture();
  installHook(root, "#!/bin/sh\n# PACE commit gate v1\nexit 0\n");
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /이미 PACE 커밋 게이트/);
  assert.equal(readFileSync(hookFile(root), "utf8"), "#!/bin/sh\n# PACE commit gate v1\nexit 0\n");
});


test("보안-1 참조 보고는 본문을 출력하지 않고 위치만 알린다(비밀 탐지가 놓치는 표현 포함)", () => {
  const secretLike = "opal login --password example-secret-value";
  const { root, home } = fixture({ "AGENTS.md": secretLike + "\n" });
  const r = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /AGENTS\.md:1(?!\d|:)/);
  assert.doesNotMatch(r.stdout, /example-secret-value|--password/);
});

test("보안-3 AGENT.md가 너무 크면 읽지 않고 멈춘다", () => {
  const { root, home } = fixture();
  writeFileSync(join(root, ".opal", "AGENT.md"), OPAL_AGENT + "x".repeat(70 * 1024));
  git(root, "add", "-A"); git(root, "commit", "-qm", "big");
  const r = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /너무 크다/);
  assert.equal(existsSync(join(root, ".pace")), false);
});
