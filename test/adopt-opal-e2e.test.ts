import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createProfile } from "../src/profile/profile.ts";
import { addMemory, projectMemoryDir } from "../src/memory/memory.ts";
import { initBrain } from "../src/project/brain.ts";
import { ALTU, runPace, tempDir } from "./helpers.ts";

// OPAL 표본은 PACE 도구로 만든 `.pace` 정의를 `.opal`로 옮기고 AGENT 표지를 OPAL 키로 바꾼 것이다.
// 소스 동일성(memory.ts·brain.ts가 OPAL 시절 마지막 소스와 같음)이 근거이며, OPAL이 만든 원본 파일이 아니라는 한계가 있다.

const ID = "3f2b8c1e-7d4a-4e5b-9a6c-1d2e3f4a5b6c";
const ROLE_PHRASE = "ROLE-PHRASE-KOALA";
const ISSUE_TITLE = "표본 이슈 ALPHA";
const TODO_TITLE = "표본 할 일 BETA";
const NOTE_TITLE = "표본 메모 GAMMA";
const BRAIN_TERM = "ZEBRAFISH-7";

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

${ROLE_PHRASE}: read project memory in \`.opal/memory/\` and the brain in \`.opal/brain/\`.
`;

const OPAL_HOOK = [
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

function git(root: string, ...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-C", root, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
function mustGit(root: string, ...args: string[]): string {
  const r = git(root, ...args);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

/** OPAL로 정의된 시험 저장소 + 프로필이 있는 새 PACE_HOME(다른 PC 시나리오). */
function opalRepo(): { root: string; home: string } {
  const home = tempDir("pace-e2e-home-");
  createProfile(home, ALTU);
  const root = realpathSync.native(tempDir("pace-e2e-repo-"));
  mustGit(root, "init", "-q");
  writeFileSync(join(root, "AGENTS.md"), "# 표본 프로젝트\n");
  // PACE 도구로 만든 메모리·브레인을 `.pace`에 두고 OPAL 정의처럼 `.opal`로 옮긴다
  initBrain(root);
  const memories = projectMemoryDir(root);
  addMemory(memories, "project", { type: "issue", name: ISSUE_TITLE, description: "표본 이슈 요약 ALPHA-DESC", body: "원인과 근거" });
  addMemory(memories, "project", { type: "todo", name: TODO_TITLE, description: "표본 할 일 요약 BETA-DESC" });
  addMemory(memories, "project", { type: "note", name: NOTE_TITLE, description: "표본 메모 요약 GAMMA-DESC" });
  const page = join(root, ".pace", "brain", "pages", "concept", "표본-개념.md");
  mkdirSync(join(page, ".."), { recursive: true });
  writeFileSync(page, `---\ntype: concept\ntitle: 표본 개념 페이지\nsummary: "표본 요약 ${BRAIN_TERM}"\ntags: [sample]\nsources: [doc:AGENTS.md]\nrelated: []\ncreated: 2026-11-16\nupdated: 2026-11-16\nstatus: active\n---\n\n본문에 ${BRAIN_TERM} 용어가 있다.\n`);
  writeFileSync(join(root, ".pace", "AGENT.md"), OPAL_AGENT);
  mustGit(root, "add", "-A");
  mustGit(root, "commit", "-qm", "init");
  mustGit(root, "mv", ".pace", ".opal");
  mustGit(root, "commit", "-qm", "OPAL 정의로 이동");
  return { root, home };
}

/** Windows(C:\a\b)와 sh(/c/a/b) 경로 표기를 같은 형태로 맞춘다 */
const norm = (p: string) => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_m, d: string) => "/" + d).toLowerCase();

const boot = (root: string, home: string) => runPace(["boot", "--host", "plain", "--cwd", root], { home, cwd: root, timeout: 30_000 }).stdout;

test("S-1 가져오기 전에는 표본 맥락이 안 보이고, 가져온 뒤 부트·메모리·브레인에 살아난다", () => {
  const { root, home } = opalRepo();
  const before = boot(root, home);
  assert.doesNotMatch(before, new RegExp(`${ROLE_PHRASE}|${ISSUE_TITLE}|${TODO_TITLE}`));
  assert.equal(runPace(["memory", "list", "--project"], { home, cwd: root }).stdout.includes("ALPHA-DESC"), false);
  assert.doesNotMatch(runPace(["brain", "search", BRAIN_TERM], { home, cwd: root }).stdout, /표본 개념 페이지/);

  const preview = runPace(["adopt", "opal"], { home, cwd: root });
  assert.equal(preview.status, 0, preview.stderr);
  const applied = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(applied.status, 0, applied.stderr + applied.stdout);

  const after = boot(root, home);
  assert.match(after, new RegExp(ROLE_PHRASE));          // 프로젝트 역할(AGENT.md 본문)
  assert.match(after, new RegExp(ISSUE_TITLE));          // 메모리 — 이슈
  assert.match(after, new RegExp(TODO_TITLE));           // 메모리 — 할 일
  const listed = runPace(["memory", "list", "--project"], { home, cwd: root }).stdout;
  // memory list는 슬러그(소문자)와 요약을 보여 준다
  for (const marker of ["ALPHA-DESC", "BETA-DESC", "GAMMA-DESC"]) assert.ok(listed.includes(marker), `${marker} 가 memory list에 없다`);
  const found = runPace(["brain", "search", BRAIN_TERM], { home, cwd: root });
  assert.equal(found.status, 0, found.stderr);
  assert.match(found.stdout, /표본 개념 페이지/);
  assert.equal(runPace(["workspace", "list"], { home, cwd: root }).stdout.includes(ID), true);
});

test("S-2 가져온 저장소의 실제 git commit — 교체된 훅이 pace project check를 호출하고 실패를 전달한다", (t) => {
  if (spawnSync("sh", ["-c", "exit 0"]).status !== 0) { t.skip("sh를 실행할 수 없다 — T-2는 이 환경에서 충족으로 인정하지 않는다"); return; }
  const { root, home } = opalRepo();
  mkdirSync(join(root, ".git", "hooks"), { recursive: true });
  const hook = join(root, ".git", "hooks", "commit-msg");

  const fakeBin = (name: string) => {
    const dir = tempDir("pace-e2e-bin-");
    writeFileSync(join(dir, name), '#!/bin/sh\necho "$PWD|$*" >> "$FAKE_LOG"\nexit "${FAKE_CODE:-0}"\n', { mode: 0o755 });
    return dir;
  };
  const sep = process.platform === "win32" ? ";" : ":";
  const commit = (bin: string, branch: string, message: string, code: number) => {
    mustGit(root, "checkout", "-q", "-B", branch);
    const log = join(tempDir("pace-e2e-log-"), "calls.txt");
    writeFileSync(log, "");
    const head = mustGit(root, "rev-parse", "HEAD").trim();
    const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-C", root, "commit", "--allow-empty", "-q", "-m", message], {
      encoding: "utf8",
      env: { ...process.env, PATH: bin + sep + (process.env.PATH ?? ""), FAKE_LOG: log, FAKE_CODE: String(code) },
    });
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
    return { status: r.status, headMoved: mustGit(root, "rev-parse", "HEAD").trim() !== head, calls, stderr: r.stderr };
  };

  // 대조: 가져오기 전 OPAL 훅은 opal 명령을 부른다(pace는 부르지 않는다)
  writeFileSync(hook, OPAL_HOOK, { mode: 0o755 });
  const opalBin = fakeBin("opal");
  const beforeAdopt = commit(opalBin, "project/P001", "feat(P001/T01): x", 3);
  assert.notEqual(beforeAdopt.status, 0); assert.equal(beforeAdopt.headMoved, false);
  assert.equal(beforeAdopt.calls.length, 1); assert.match(beforeAdopt.calls[0]!, /\|project check P001 T01$/);

  mustGit(root, "checkout", "-q", "-B", "main");
  const applied = runPace(["adopt", "opal", "--apply"], { home, cwd: root });
  assert.equal(applied.status, 0, applied.stderr + applied.stdout);
  assert.match(readFileSync(hook, "utf8"), /# PACE commit gate v1/);

  const paceBin = fakeBin("pace");
  // 대상 브랜치 + 태스크 태그: 호출되고 실패가 커밋을 막는다 / 성공이면 커밋된다
  const failing = commit(paceBin, "project/P001", "feat(P001/T01): x", 3);
  assert.notEqual(failing.status, 0); assert.equal(failing.headMoved, false);
  assert.equal(failing.calls.length, 1);
  assert.match(failing.calls[0]!, /\|project check P001 T01$/);
  assert.equal(norm(failing.calls[0]!.split("|")[0]!), norm(root), "게이트가 이 저장소에서 pace를 호출했다");
  const passing = commit(paceBin, "project/P001", "feat(P001/T01): y", 0);
  assert.equal(passing.status, 0, passing.stderr); assert.equal(passing.headMoved, true);
  assert.equal(passing.calls.length, 1);
  // 조건 밖: 브랜치만 바꾼 경우 / 메시지만 바꾼 경우 — 호출 0건, 커밋된다
  const otherBranch = commit(paceBin, "feature/x", "feat(P001/T01): z", 3);
  assert.equal(otherBranch.status, 0, otherBranch.stderr); assert.equal(otherBranch.calls.length, 0); assert.equal(otherBranch.headMoved, true);
  const noTag = commit(paceBin, "project/P001", "docs: 태그 없음", 3);
  assert.equal(noTag.status, 0, noTag.stderr); assert.equal(noTag.calls.length, 0); assert.equal(noTag.headMoved, true);
  // 백업은 원본 OPAL 훅 그대로
  assert.equal(readFileSync(hook + ".opal-backup", "utf8"), OPAL_HOOK);
  assert.equal(existsSync(join(root, ".opal")), false);
});
