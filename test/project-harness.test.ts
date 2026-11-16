import { renderDashboardEntry } from '../src/project/dashboard-layout.ts';
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { packageRoot, templatesDir } from "../src/core/paths.ts";
import { canonTouched, declaredCommand, findSecrets } from "../src/project/harness.ts";
import { PACE_BIN, runPace, sessionFreeEnv, tempDir } from "./helpers.ts";

const fixtureContexts = new Map<string, { home: string; bin: string }>();
function gitRun(cwd: string, args: string[], extra: NodeJS.ProcessEnv = {}) {
  const context = [...fixtureContexts].find(([parent]) => cwd.startsWith(parent + sep))?.[1];
  const env = context ? { ...sessionFreeEnv(), HOME: context.home, PACE_HOME: context.home, PATH: `${context.bin}${delimiter}${process.env.PATH}` } : sessionFreeEnv();
  return spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: { ...env, ...extra } });
}
function git(cwd: string, ...args: string[]): string {
  const r = gitRun(cwd, args);
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr} ${r.stdout}`);
  return r.stdout.trim();
}

/** Git 오류를 외부 쉘 스크립트 없이 주입한다. 다른 Git 호출은 실제 실행한다. */
function fakeGitFailure(home: string, condition: string): string {
  const hook = join(home, `git-fault-${Math.random().toString(16).slice(2)}.mjs`);
  writeFileSync(hook, `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; const run=cp.spawnSync; cp.spawnSync=(file,args,options)=>{ if(file==='git' && (${condition})) return {status:1,signal:null,pid:0,output:[],stdout:'',stderr:'injected git failure'}; return run(file,args,options); }; syncBuiltinESMExports();`);
  return `--import=${pathToFileURL(hook).href}`;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function installDashboardFixture(root: string, data = "old"): void {
  write(join(root, "backlogs/README.html"), renderDashboardEntry());
  write(join(root, "backlogs/dashboard/data.js"), data);
}

/** main 브랜치에 AGENTS.md·docs/README.md(검사 선언)가 있는 저장소. */
function repoFixture(): { home: string; main: string } {
  const home = tempDir("pace-home-");
  const main = join(tempDir("pace-harness-"), "app");
  mkdirSync(main);
  const bin = join(home, "bin");
  write(join(bin, "pace"), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${PACE_BIN.replaceAll("'", "'\\''")}' "$@"\n`);
  chmodSync(join(bin, "pace"), 0o755);
  fixtureContexts.set(dirname(main), { home, bin });
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "user.name", "test");
  git(main, "config", "user.email", "test@example.com");
  // 이 픽스처의 기본 파일은 LF다. CRLF는 별도 회귀 사례에서 명시한다.
  git(main, "config", "core.autocrlf", "false");
  write(join(main, "AGENTS.md"), "# app\n");
  write(join(main, "docs", "README.md"), "# app\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n");
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "init");
  return { home, main };
}

// 이 파일의 기존 회귀 사례는 v1 도입 전 태스크의 호환성을 검증한다.
const runCli = (home: string, cwd: string, ...args: string[]) => {
  const result = runPace(["project", ...args], { home, cwd, timeout: 60_000 });
  if (args[0] === "task" && result.status === 0) {
    const path = result.stdout.trim().split(": ").at(-1);
    if (path && existsSync(path)) writeFileSync(path, readFileSync(path, "utf8").replace(/^- 사전 검토: v1\r?\n/m, ""));
  }
  return result;
};

test("CRLF 설치본: BL 프로젝트 생성·예정/추가 태스크·check/done은 줄바꿈과 번호를 보존한다", () => {
  const { home, main } = repoFixture();
  const app = join(home, "app");
  for (const dir of ["bin", "src", "templates"]) cpSync(join(packageRoot, dir), join(app, dir), { recursive: true });
  write(join(app, "package.json"), '{"type":"module"}\n');
  for (const name of readdirSync(join(app, "templates"), { recursive: true, encoding: "utf8" })) {
    if (!name.endsWith(".md")) continue;
    const path = join(app, "templates", name);
    writeFileSync(path, readFileSync(path, "utf8").replace(/\r?\n/g, "\r\n"));
  }
  assert.equal(existsSync(join(app, ".git")), false, "git 없는 설치본을 사용한다");
  const installed = (...args: string[]) => spawnSync(process.execPath, [join(app, "bin", "pace.ts"), "project", ...args], {
    cwd: main, encoding: "utf8", timeout: 60_000,
    env: { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, PACE_HOME: home, PACE_PROFILE: "" },
  });
  const crlf = (text: string) => text.replace(/\r?\n/g, "\r\n");
  const bl = join(main, "backlogs", "BL261105_02_윈도우");
  write(join(bl, "BACKLOG.md"), crlf("# 백로그\n- 상태: 대기\n\n## 진행 현황\n\n| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |\n|---|---|---|---|---|\n| [BR03 예정](BR03_예정.md) | 대기 | — | — | |\n"));
  write(join(bl, "BR03_예정.md"), crlf("# BR03 예정\n- 상태: 대기\n"));
  const created = installed("new", "윈도우", "--from", "BL261105_02");
  assert.equal(created.status, 0, created.stderr + created.stdout);
  const project = join(projectDir(main), "PROJECT.md");
  assert.match(readFileSync(project, "utf8"), /\| T03 \| 예정 \| 대기 \| \|/);
  const planned = installed("task", "P001", "예정");
  assert.equal(planned.status, 0, planned.stderr + planned.stdout);
  const task = join(projectDir(main), "tasks", "T03_예정");
  assert.ok(existsSync(join(task, "TASK.md")), "예정 번호 T03을 사용한다");
  const added = installed("task", "P001", "추가");
  assert.equal(added.status, 0, added.stderr + added.stdout);
  assert.ok(existsSync(join(projectDir(main), "tasks", "T04_추가", "TASK.md")));
  writeFileSync(join(task, "TASK.md"), readFileSync(join(task, "TASK.md"), "utf8").replace(/^- 사전 검토: v1\r?\n/m, ""));
  passTask(task);
  writeFileSync(join(task, "TASK.md"), crlf(readFileSync(join(task, "TASK.md"), "utf8")));
  const close = join(task, "TASK-CLOSE.md");
  writeFileSync(close, crlf(readFileSync(close, "utf8").replace("| T-1 | 통과 |", "| T-1 | 실패 |")));
  assert.equal(installed("check", "P001", "T03").status, 1, "CRLF 기준을 누락해 거짓 통과하지 않는다");
  writeFileSync(close, readFileSync(close, "utf8").replace("| T-1 | 실패 |", "| T-1 | 통과 |"));
  const done = installed("done", "P001", "T03");
  assert.equal(done.status, 0, done.stderr + done.stdout);
  assert.match(readFileSync(project, "utf8"), /\| T03 \| 예정 \| 완료 \|/);
  assert.match(readFileSync(project, "utf8"), /\| T04 \| 추가 \| 진행 \|/);
  assert.match(readFileSync(join(bl, "BR03_예정.md"), "utf8"), /상태: 완료/);
  for (const path of [project, join(task, "TASK.md"), close, join(bl, "BACKLOG.md")]) {
    assert.ok(!/(?<!\r)\n/.test(readFileSync(path, "utf8")), `${path}: CRLF 보존`);
  }
});

test("CRLF 기존 5칸 태스크 표도 예정 번호·상태·열 위치를 보존한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "옛 표").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, [
    "# P001 옛 표", "- 상태: 정의", "- 출처: 대화", "", "## 태스크", "",
    "| T | 이름 | 백로그 단계 | 상태 | 커밋 |", "|---|---|---|---|---|",
    "| T03 | 예정 | — | 대기 | |", "", "## 결정·진행 메모", "", "기존 메모", "",
  ].join("\r\n"));
  const planned = runCli(home, main, "task", "P001", "예정");
  assert.equal(planned.status, 0, planned.stderr + planned.stdout);
  const task = join(projectDir(main), "tasks", "T03_예정");
  assert.ok(existsSync(join(task, "TASK.md")));
  const added = runCli(home, main, "task", "P001", "추가");
  assert.equal(added.status, 0, added.stderr + added.stdout);
  passTask(task);
  const done = runCli(home, main, "done", "P001", "T03");
  assert.equal(done.status, 0, done.stderr + done.stdout);
  const text = readFileSync(project, "utf8");
  assert.match(text, /\| T03 \| 예정 \| — \| 완료 \| \|/);
  assert.match(text, /\| T04 \| 추가 \| — \| 진행 \| \|/);
  assert.ok(text.endsWith("기존 메모\r\n"));
  assert.ok(!/(?<!\r)\n/.test(text));
});

function projectDir(root: string): string {
  const name = readdirSync(join(root, "projects")).find((n) => n.startsWith("P001_"))!;
  return join(root, "projects", name);
}

test("테스트 도우미는 세션 환경 변수를 물려주지 않는다", () => {
  process.env.ORCA_TERMINAL_HANDLE = "term_test";
  process.env.CLAUDE_CONFIG_DIR = "/nowhere";
  try {
    const env = sessionFreeEnv();
    assert.equal(env.ORCA_TERMINAL_HANDLE, undefined);
    assert.equal(env.CLAUDE_CONFIG_DIR, undefined);
    assert.ok(env.PATH);
  } finally {
    delete process.env.ORCA_TERMINAL_HANDLE;
    delete process.env.CLAUDE_CONFIG_DIR;
  }
});

test("프로젝트 전 과정: new → start → task → check → finish → merge", () => {
  const { home, main } = repoFixture();
  writeFileSync(join(main, "docs", "README.md"), readFileSync(join(main, "docs", "README.md"), "utf8") + "- worktree 준비: `true`\n");
  installDashboardFixture(main);
  git(main, "add", "-A");
  git(main, "commit", "-qm", "setup declaration");

  // new (main)
  const created = runCli(home, main, "new", "예약 발송");
  assert.equal(created.status, 0, created.stderr);
  const mainProject = projectDir(main);
  assert.match(basename(mainProject), /^P001_\d{6}_예약_발송$/);
  let project = readFileSync(join(mainProject, "PROJECT.md"), "utf8");
  assert.match(project, /^# P001 예약 발송$/m);
  assert.match(project, /- 출처: 대화 \d{4}-\d{2}-\d{2}/);
  project = project
    .replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 예약을 저장한다 | 테스트 |")
    .replace("| 정본 | 바뀌는 것 |\n|---|---|\n| | |", "| 정본 | 바뀌는 것 |\n|---|---|\n| `docs/README.md` | 예약 안내 |\n| `docs/한글_안내/` | 한글 경로 정본 |");
  assert.match(created.stdout, /바로.*start/);
  assert.match(readFileSync(join(main, "backlogs/dashboard/data.js"), "utf8"), /예약 발송/);
  writeFileSync(join(mainProject, "PROJECT.md"), project);

  // start (main) — 정의 커밋 + worktree
  const started = runCli(home, main, "start", "P001");
  assert.equal(started.status, 0, started.stderr);
  const wt = join(dirname(main), "app.wt", "P001");
  assert.ok(existsSync(join(wt, "AGENTS.md")));
  assert.equal(git(wt, "rev-parse", "--abbrev-ref", "HEAD"), "project/P001");
  assert.match(git(main, "log", "--format=%s"), /docs\(P001\): 정의/);
  assert.match(runCli(home, main, "start", "P001").stdout, /이미 있음/);

  // 위치 규칙
  const finishOnMain = runCli(home, main, "finish", "P001");
  assert.equal(finishOnMain.status, 1);
  assert.match(finishOnMain.stderr, /worktree에서 실행/);

  assert.equal(runCli(home, main, "merge", "P001", "--yes").status, 1);

  // task (worktree)
  const task = runCli(home, wt, "task", "P001", "예약 저장");
  assert.equal(task.status, 0, task.stderr);
  const proj = projectDir(wt);
  const taskDir = join(proj, "tasks", readdirSync(join(proj, "tasks"))[0]!);
  assert.match(basename(taskDir), /^T01_예약_저장$/);
  assert.match(readFileSync(join(proj, "PROJECT.md"), "utf8"), /\| T01 \| 예약 저장 \| 진행 \| \|/);
  writeFileSync(join(taskDir, "TASK.md"), readFileSync(join(taskDir, "TASK.md"), "utf8").replace(/\| T-1 \| <!--.*?--> \|/, "| T-1 | 예약을 저장한다 |"));

  // check — 실패 사례
  write(
    join(taskDir, "TASK-CLOSE.md"),
    "# T01 — 마감\n\n- 태스크: [TASK.md](TASK.md) · 판정: 통과\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| T-1 | 실패 | `evidence/s1.png` |\n\n## 단위 테스트\n\n통과 3\n\n## E2E\n\n## 리뷰\n\nblocking 0\n\n## 남긴 것\n\n없음\n",
  );
  const bad = runCli(home, wt, "check", "P001", "T01");
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /T-1 결과가 통과가 아니다/);
  assert.match(bad.stdout, /증거 파일이 없다 — evidence\/s1\.png/);
  assert.match(bad.stdout, /## E2E 절이 비었다/);

  // check — 통과
  write(join(taskDir, "evidence", "s1.png"), "png");
  writeFileSync(
    join(taskDir, "TASK-CLOSE.md"),
    readFileSync(join(taskDir, "TASK-CLOSE.md"), "utf8").replace("| T-1 | 실패 |", "| T-1 | 통과 |").replace("## E2E\n\n", "## E2E\n\n해당 없음\n\n"),
  );
  const good = runCli(home, wt, "check", "P001", "T01");
  assert.equal(good.status, 0, good.stdout);

  // 구현 커밋 + 정본(docs/README.md) 반영 + 태스크 완료
  write(join(wt, "src", "schedule.ts"), "export const x = 1;\n");
  write(join(wt, ".gitignore"), ".cache/\n");
  writeFileSync(join(wt, "docs", "README.md"), `${readFileSync(join(wt, "docs", "README.md"), "utf8").replaceAll("`true`", "`false`")}\n예약 발송을 쓸 수 있다.\n`);
  write(join(wt, "docs", "한글_안내", "예약.md"), "# 예약\n");
  writeFileSync(join(proj, "PROJECT.md"), readFileSync(join(proj, "PROJECT.md"), "utf8").replace("| T01 | 예약 저장 | 진행 | |", "| T01 | 예약 저장 | 완료 | |"));
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "feat(P001/T01): 예약 저장");
  // 커밋 칸에 지금 해시를 적어 둔다 — finish의 rebase가 낡게 만든다
  const preRebase = git(wt, "log", "-1", "--format=%h");
  writeFileSync(join(proj, "PROJECT.md"), readFileSync(join(proj, "PROJECT.md"), "utf8").replace("| T01 | 예약 저장 | 완료 | |", `| T01 | 예약 저장 | 완료 | ${preRebase} |`));
  git(wt, "commit", "-q", "-am", "chore: 커밋 칸");

  // main과 worktree가 함께 메모리를 바꿔 목차가 충돌하게 한다
  assert.equal(runPace(["memory", "add", "--project", "--type", "note", "--name", "메인 메모", "--description", "main에서"], { home, cwd: main }).status, 0);
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "chore: main 메모");
  assert.equal(runPace(["memory", "add", "--project", "--type", "note", "--name", "작업 메모", "--description", "worktree에서"], { home, cwd: wt }).status, 0);
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "chore: 작업 메모");

  // finish — PROJECT-CLOSE 없음, 비밀 노출
  const noClose = runCli(home, wt, "finish", "P001");
  assert.equal(noClose.status, 1);
  assert.match(noClose.stdout, /PROJECT-CLOSE\.md가 없다/);
  write(
    join(proj, "PROJECT-CLOSE.md"),
    "# P001 — 마감\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | T01 |\n\n## 보안\n\n보안 검사 통과\n\n## 정본 반영\n\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| `docs/README.md` | 반영 | |\n| `docs/한글_안내/` | 반영 | |\n\n## 지표\n[집계](METRICS.md)\n\n질의 대기와 작업 시간을 확인했다.\n",
  );
  const closeFile = join(proj, "PROJECT-CLOSE.md");
  const originalClose = readFileSync(closeFile, "utf8");
  writeFileSync(closeFile, originalClose.replace(/## 지표[\s\S]*/, ""));
  const missingSummary = runCli(home,wt,"finish","P001");
  assert.equal(missingSummary.status,1); assert.match(missingSummary.stdout,/지표 METRICS.md 링크가 없다/);
  writeFileSync(closeFile,originalClose);
  const externalClose = join(home, "external-close.md");
  writeFileSync(externalClose, originalClose + "\nPRIVATE_EXTERNAL_DOCUMENT\n");
  const projectBeforeLink = readFileSync(join(proj, "PROJECT.md"), "utf8");
  rmSync(closeFile); symlinkSync(externalClose, closeFile);
  const linkedFinish = runCli(home, wt, "finish", "P001");
  assert.equal(linkedFinish.status, 1);
  assert.match(linkedFinish.stderr, /일반 파일/);
  assert.ok(lstatSync(closeFile).isSymbolicLink());
  assert.equal(readFileSync(join(proj, "PROJECT.md"), "utf8"), projectBeforeLink);
  assert.equal(readFileSync(externalClose, "utf8"), originalClose + "\nPRIVATE_EXTERNAL_DOCUMENT\n");
  rmSync(closeFile); writeFileSync(closeFile, originalClose);
  write(join(taskDir, "evidence", "log.txt"), "password=supersecret123\n");
  const leak = runCli(home, wt, "finish", "P001");
  assert.equal(leak.status, 1);
  assert.match(leak.stdout, /비밀 노출 의심: .*log\.txt/);
  rmSync(join(taskDir, "evidence", "log.txt"));
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "docs(P001): 마감 문서");

  // finish — 프로젝트 밖의 커밋하지 않은 변경은 마감 커밋에 쓸려 들어가지 않게 멈춘다
  write(join(wt, "scratch.log"), "검사 출력\n");
  const stray = runCli(home, wt, "finish", "P001");
  assert.equal(stray.status, 1);
  assert.match(stray.stdout, /커밋하지 않은 변경이 있다.*scratch\.log/);
  rmSync(join(wt, "scratch.log"));
  // 첫 변경이 unstaged(" M")인 프로젝트 파일이어도 경로 첫 글자를 잃지 않고(rojects/…), 한글 경로도 따옴표 없이 읽는다
  writeFileSync(closeFile, originalClose + "\n추가 기록\n");
  write(join(wt, "docs", "한글_메모.txt"), "메모\n");
  const pending = runCli(home, wt, "finish", "P001");
  assert.equal(pending.status, 1);
  assert.match(pending.stdout, /커밋하지 않은 변경이 있다 — 태스크 커밋에 넣거나 치운다: docs\/한글_메모\.txt$/m);
  rmSync(join(wt, "docs", "한글_메모.txt"));
  writeFileSync(closeFile, originalClose);
  // 증거 폴더의 심볼릭 링크(바깥·순환)는 따라가지 않는다
  symlinkSync(home, join(taskDir, "evidence", "home-link"));
  symlinkSync(".", join(taskDir, "evidence", "loop"));
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "test: 링크");

  // finish — 통과 (목차 충돌은 재생성)
  // 사용자 git 설정(core.quotepath=false 등)에 기대지 않는다 — 기본값이면 한글 경로가 이스케이프된다
  const finished = runPace(["project", "finish", "P001"], { home, cwd: wt, timeout: 60_000, env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  assert.match(finished.stdout, /main 위로 rebase/);
  assert.match(finished.stdout + finished.stderr, /worktree 선언이 다름/);
  assert.match(finished.stdout + finished.stderr, /실행: true/);
  assert.match(finished.stdout, /목차 충돌 재생성/);
  assert.match(readFileSync(join(proj, "PROJECT.md"), "utf8"), /^- 상태: 병합 대기$/m);
  assert.match(readFileSync(join(wt, "backlogs/dashboard/data.js"), "utf8"), /병합 대기/);
  assert.match(git(wt, "show", "HEAD:backlogs/dashboard/data.js"), /병합 대기/);
  // 커밋 칸은 rebase 뒤 해시로 바뀌고, 마감 커밋에 들어간다
  const postRebase = git(wt, "log", "-1", "--format=%h", "-F", "--grep=(P001/T01)");
  assert.notEqual(postRebase, preRebase);
  assert.match(git(wt, "show", "HEAD:" + join("projects", basename(proj), "PROJECT.md").split(sep).join("/")), new RegExp(`^\\| T01 \\| 예약 저장 \\| 완료 \\| ${postRebase} \\|$`, "m"));
  assert.match(finished.stdout, new RegExp(`커밋 칸: T01 ${postRebase}`));
  const index = readFileSync(join(wt, ".pace", "memory", "INDEX.md"), "utf8");
  assert.match(index, /메인 메모/);
  assert.match(index, /작업 메모/);

  const generatedClose = readFileSync(join(proj, "PROJECT-CLOSE.md"), "utf8");
  assert.equal((generatedClose.match(/^## 지표$/gm) ?? []).length, 1);
  assert.match(generatedClose, /\[집계\]\(METRICS.md\)/);
  const generatedMetrics = readFileSync(join(proj,"METRICS.md"),"utf8");
  assert.match(generatedMetrics, /프로젝트 기준 집계[\s\S]*태스크 기준 집계/);
  assert.match(generatedMetrics, /태스크 밖/);
  const comparison = readFileSync(join(wt,"projects","METRICS.md"),"utf8");
  assert.match(comparison,/P001.*METRICS.md/);
  assert.equal(git(wt,"show","HEAD:projects/METRICS.md"),comparison.trim());
  assert.match(git(wt, "show", "HEAD:" + join("projects", basename(proj), "PROJECT-CLOSE.md").split(sep).join("/")), /## 지표/);

  // Metrics: public command boundaries only, finish remains clean for merge.
  const metrics = JSON.parse(runCli(home, wt, "stats", "P001", "--json").stdout);
  assert.equal(metrics.project.source, "events");
  const fromMain = JSON.parse(runCli(home, main, "stats", "P001", "--json").stdout);
  const stable = (s: typeof metrics) => ({ ...s, project: { ...s.project, approvalWaitMs: 0, mergeWaitMs: 0 } });
  assert.deepEqual(stable(fromMain), stable(metrics));
  assert.ok(Math.abs(fromMain.project.mergeWaitMs - metrics.project.mergeWaitMs) < 5000);
  assert.ok(readFileSync(join(proj, "log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).some((e) => e.type === "merge" && e.ok === false));

  assert.ok(metrics.project.gateFailures >= 4);
  const events = readFileSync(join(proj, "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.type === "start" && e.ok && e.msg.includes("launch") && e.src));
  assert.ok(events.some((e) => e.type === "decision" && e.by === "cli" && e.src.startsWith("대화") && e.msg.includes("착수 결정")));
  assert.equal(events.some((e) => e.type === "approval"), false);
  assert.ok(events.every((e) => e.p === "P001" && typeof e.msg === "string" && ["cli", "user"].includes(e.by)));
  assert.ok(events.some((e) => e.type === "task_done" && e.t === "T01") === false); // This legacy flow marks its task state manually.

  assert.ok(events.some((e) => e.type === "task_start" && e.t === "T01" && e.ok));
  assert.ok(events.some((e) => e.type === "finish" && e.ok));
  assert.equal(git(wt, "status", "--porcelain"), "");

  // merge — 위치 규칙, 미리보기, 실행
  const mergeInWt = runCli(home, wt, "merge", "P001");
  assert.equal(mergeInWt.status, 1);
  assert.match(mergeInWt.stderr, /main 체크아웃에서만/);
  for (let i = 0; i < 23; i++) write(join(wt, ".cache", `한글 ${i}.txt`), "ignored");
  // 무시 폴더 안 파일 이름이 spawnSync 기본 출력 상한(1MB)을 넘어도 미리보기가 막히지 않는다
  for (let i = 0; i < 6000; i++) writeFileSync(join(wt, ".cache", `${String(i).padStart(4, "0")}${"x".repeat(200)}`), "");
  const head = git(main, "rev-parse", "HEAD");
  const preview = runCli(home, main, "merge", "P001");
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /미리보기/);
  assert.match(preview.stdout, /환경 선언 변경/);
  assert.match(preview.stdout, /검사: true → false/);
  assert.match(preview.stdout, /보안 검사: true → false/);
  assert.match(preview.stdout, /worktree 준비: true → false/);
  assert.match(preview.stdout, /함께 지워질 무시 항목: 1곳/);
  assert.match(preview.stdout, /^  \.cache\/$/m);
  assert.doesNotMatch(preview.stdout, /한글 0\.txt/);
  assert.match(preview.stdout, /feat\(P001\/T01\): 예약 저장/);
  assert.equal(git(main, "rev-parse", "HEAD"), head);
  assert.ok(existsSync(wt), "미리보기는 worktree를 남긴다");
  assert.notEqual(git(main, "branch", "--list", "project/P001"), "");
  // A committed stale index proves merge really rebuilds it, even when normal summary cells would not change.
  writeFileSync(join(wt,"projects","METRICS.md"),"STALE_COMPARISON\n");
  git(wt,"add","projects/METRICS.md");git(wt,"commit","-qm","test: stale comparison");
  const merged = runCli(home, main, "merge", "P001", "--yes");
  assert.equal(merged.status, 0, merged.stderr);
  const mergeEvent = readFileSync(join(mainProject, "log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((e) => e.type === "merge" && e.ok);
  const mergedMetrics = readFileSync(join(mainProject,"METRICS.md"),"utf8");
  assert.notEqual(mergedMetrics,generatedMetrics,"merge regenerates metrics");
  const mergedComparison=readFileSync(join(main,"projects","METRICS.md"),"utf8");
  assert.equal(git(main,"show","HEAD:projects/METRICS.md"),mergedComparison.trim());
  assert.match(mergedComparison,/P001.*METRICS.md/);
  assert.ok(!mergedComparison.includes("STALE_COMPARISON"));
  assert.equal(git(main,"show",`HEAD:projects/${basename(proj)}/METRICS.md`),mergedMetrics.trim());
  const finishEvent = events.filter(e => e.type === "finish" && e.ok).at(-1);
  const wait = (Date.parse(mergeEvent.ts)-Date.parse(finishEvent.ts))/60_000;
  // Finish snapshot and finish event differ by a few milliseconds; compare displayed precision (0.1분) with tolerance.
  const waitMatch = /\| 병합 승인 대기 \| ([0-9.]+)분 \|/.exec(mergedMetrics);
  assert.ok(waitMatch); assert.ok(Math.abs(Number(waitMatch[1])-wait)<0.1);
  assert.match(mergedMetrics,/\| 전체 경과 \| [0-9.]+분 \|/);
  assert.equal(mergeEvent.data.approved, 1);
  assert.ok(mergeEvent.data.commits > 0);
  assert.ok(existsSync(join(main, "src", "schedule.ts")));
  assert.ok(!existsSync(wt), "worktree 제거");
  assert.equal(git(main, "branch", "--list", "project/P001"), "");
  assert.match(readFileSync(join(projectDir(main), "PROJECT.md"), "utf8"), /^- 상태: 완료$/m);
  const snapshot = readFileSync(join(main, "backlogs/dashboard/data.js"), "utf8");
  assert.match(snapshot, /상태: 완료/);
  assert.equal(git(main, "show", "HEAD:backlogs/dashboard/data.js"), snapshot.trim());
  assert.equal(git(main, "status", "--porcelain"), "");
  assert.match(runCli(home, main, "list").stdout, /P001 예약 발송 · 완료/);
});

test("list는 진행 중 프로젝트의 브랜치 상태와 진행 태스크를 보여 준다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "알림").status, 0);
  assert.match(runCli(home, main, "list").stdout, /P001 알림 · 정의/);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  assert.equal(runCli(home, wt, "task", "P001", "보내기").status, 0);
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "wip");
  assert.match(runCli(home, main, "list").stdout, /P001 알림 · 진행 · T01 보내기 진행 · .*app\.wt\/P001/);
  assert.equal(runCli(home, main, "new", "두 번째").status, 0);
  assert.match(readdirSync(join(main, "projects")).join(" "), /P002_\d{6}_두_번째/);
});

test("등록된 worktree가 사라져도 기존 경로를 안내한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "이동된 worktree").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  renameSync(wt, `${wt}-moved`);
  const again = runCli(home, main, "start", "P001");
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /이미 있음/);
  assert.ok(existsSync(`${wt}-moved`));
});

test("task: 표에 계획된 대기 행은 그 번호로 열고, 새 태스크는 계획 번호와 겹치지 않는다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "계획").status, 0);
  const projMain = projectDir(main);
  const planned = readFileSync(join(projMain, "PROJECT.md"), "utf8").replaceAll("\r\n", "\n").replace(
    "| T | 이름 | 상태 | 커밋 |\n|---|---|---|---|",
    "| T | 이름 | 백로그 단계 | 상태 | 커밋 |\n|---|---|---|---|---|\n| T01 | 하나 | 01 | 대기 | |\n|T02|  둘 |02|대기||\n| T05 | 넷 | 05 | 보류 | |",
  );
  writeFileSync(join(projMain, "PROJECT.md"), planned);
  // 하네스 이전 형식: 계획 행 폴더에 README만 있다(P001 재구축처럼)
  write(join(projMain, "tasks", "T01_하나", "README.md"), "백로그 링크");
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  const proj = projectDir(wt);
  const second = runCli(home, wt, "task", "P001", "둘");
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /P001 T02:/);
  const more = runCli(home, wt, "task", "P001", "셋");
  assert.match(more.stdout, /P001 T06:/, "폴더 없는 계획 행(T01·T05)의 번호도 비켜 간다");
  const held = runCli(home, wt, "task", "P001", "넷");
  assert.match(held.stdout, /P001 T07:/, "보류 행은 다시 열지 않고 새 번호");
  const first = runCli(home, wt, "task", "P001", "하나");
  assert.match(first.stdout, /P001 T01: .*T01_하나[\\/]TASK\.md/, "TASK.md 없는 계획 폴더는 그 폴더로 연다");
  assert.ok(existsSync(join(proj, "tasks", "T01_하나", "README.md")), "기존 파일은 둔다");
  assert.deepEqual(readdirSync(join(proj, "tasks")).sort(), ["T01_하나", "T02_둘", "T06_셋", "T07_넷"]);
  const text = readFileSync(join(proj, "PROJECT.md"), "utf8");
  assert.match(text, /^\| T01 \| 하나 \| 01 \| 진행 \| \|$/m);
  assert.match(text, /^\|T02\|  둘 \|02\| 진행 \|\|$/m, "칸 공백이 달라도 상태를 바꾼다");
  assert.match(text, /^\| T05 \| 넷 \| 05 \| 보류 \| \|$/m);
  assert.match(text, /^\| T06 \| 셋 \| — \| 진행 \| \|$/m);
  assert.equal(text.match(/^\| ?T02 ?\|/gm)?.length, 1, "계획 행을 새로 더하지 않는다");
  // 이미 폴더가 있는 태스크를 다시 열면 거부
  assert.match(runCli(home, wt, "task", "P001", "둘").stderr, /이미 있다/);
});

test("check: 템플릿 주석이 남아도 통과하고, 빠진 기준·판정 실패는 잡는다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "점검").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  assert.equal(runCli(home, wt, "task", "P001", "하나").status, 0);
  const proj = projectDir(wt);
  const taskDir = join(proj, "tasks", readdirSync(join(proj, "tasks"))[0]!);
  writeFileSync(join(taskDir, "TASK.md"), readFileSync(join(taskDir, "TASK.md"), "utf8").replace(/\| T-1 \| <!--.*?--> \|/, "| T-1 | 하나 |\n| T-2 | 둘 |"));
  // 템플릿을 채워 쓴다 — 안내 주석(evidence/… 포함)은 그대로 둔다
  const filled = readFileSync(join(templatesDir, "project", "TASK-CLOSE.md"), "utf8").replaceAll("\r\n", "\n")
    .replace("{{taskId}} {{taskName}}", "T01 하나")
    .replace("판정: <!-- 통과 | 막힘 -->", "판정: 통과")
    .replace(/\| T-1 \| <!--.*?--> \| <!--.*?--> \|/, "| T-1 | 통과 | S-1 |")
    .replace(/(## 단위 테스트\n\n<!--[\s\S]*?-->)/, "$1\n통과 2")
    .replace(/(## E2E\n\n<!--[\s\S]*?-->)/, "$1\n해당 없음")
    .replace(/(## 리뷰\n\n<!--[\s\S]*?-->)/, "$1\nblocking 0")
    .replace(/(## 남긴 것\n\n<!--[\s\S]*?-->)/, "$1\n없음");
  writeFileSync(join(taskDir, "TASK-CLOSE.md"), filled);
  const missing = runCli(home, wt, "check", "P001", "T01");
  assert.equal(missing.status, 1);
  assert.doesNotMatch(missing.stdout, /증거 파일이 없다/, "주석 속 evidence/… 는 경로가 아니다");
  assert.match(missing.stdout, /기준 대조에 T-2가 없다/);
  writeFileSync(join(taskDir, "TASK-CLOSE.md"), filled.replace("| T-1 | 통과 | S-1 |", "| T-1 | 통과 | S-1 |\n| T-2 | 통과 | S-2 |"));
  assert.equal(runCli(home, wt, "check", "P001", "T01").status, 0);
  // 증거를 마크다운 링크로 적어도 경로 하나로 읽는다
  mkdirSync(join(taskDir, "evidence"), { recursive: true });
  writeFileSync(join(taskDir, "evidence", "S-1.md"), "출력");
  writeFileSync(join(taskDir, "evidence", "S-2.log"), "로그");
  // 기준 표의 T-n이 아닌 행은 기준으로 세지 않는다
  writeFileSync(join(taskDir, "TASK.md"), readFileSync(join(taskDir, "TASK.md"), "utf8").replace("| T-2 | 둘 |", "| T-2 | 둘 |\n| 참고 | 기준 아님 |"));
  const linked = filled.replace(
    "| T-1 | 통과 | S-1 |",
    "| T-1 | 통과 | [evidence/S-1.md](evidence/S-1.md), `evidence/S-2.log` |\n| T-2 | 통과 | S-2 — [로그](./evidence/S-1.md), evidence/S-2.log. 끝 evidence/S-1.md: |",
  );
  writeFileSync(join(taskDir, "TASK-CLOSE.md"), linked);
  const linkCheck = runCli(home, wt, "check", "P001", "T01");
  assert.equal(linkCheck.status, 0, linkCheck.stdout);
  assert.match(linkCheck.stdout, /^- 확인: 판정 통과 · 기준 2개\(T-1, T-2\) 모두 통과 · 절 4개 · 증거 파일 2개$/m, "무엇을 확인했는지 보여 준다 — 같은 경로는 한 번");
  writeFileSync(join(taskDir, "TASK-CLOSE.md"), linked.replace("[로그](./evidence/S-1.md)", "[로그](evidence/없음.md), `./evidence/없음.md`"));
  const missingEvidence = runCli(home, wt, "check", "P001", "T01").stdout;
  assert.match(missingEvidence, /증거 파일이 없다 — evidence\/없음\.md$/m);
  assert.doesNotMatch(missingEvidence, /확인:/, "실패하면 요약을 내지 않는다");
  assert.equal(missingEvidence.match(/증거 파일이 없다/g)?.length, 1, "같은 경로는 한 번만 보고");
  writeFileSync(join(taskDir, "TASK-CLOSE.md"), filled.replace("판정: 통과", "판정: 막힘").replace("| T-1 | 통과 | S-1 |", "| T-1 | 통과 | S-1 |\n| T-2 | 통과 | S-2 |"));
  assert.match(runCli(home, wt, "check", "P001", "T01").stdout, /판정이 "통과"가 아니다/);
  // task·check는 그 프로젝트의 worktree에서만
  assert.match(runCli(home, main, "check", "P001", "T01").stderr, /worktree에서 실행/);
  assert.match(runCli(home, main, "task", "P001", "둘").stderr, /worktree에서 실행/);
});

/** 통과하는 TASK-CLOSE를 쓴다(기준 T-1 하나). */
function passTask(taskDir: string): void {
  writeFileSync(join(taskDir, "TASK.md"), readFileSync(join(taskDir, "TASK.md"), "utf8").replace(/\| T-1 \| <!--.*?--> \|/, "| T-1 | 된다 |"));
  write(
    join(taskDir, "TASK-CLOSE.md"),
    "# 마감\n\n- 태스크: [TASK.md](TASK.md) · 판정: 통과\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| T-1 | 통과 | S-1 |\n\n## 단위 테스트\n\n통과 1\n\n## E2E\n\n해당 없음\n\n## 리뷰\n\nblocking 0\n\n## 남긴 것\n\n없음\n",
  );
}

test("done: check 통과 때만 상태·백로그·커밋 칸을 한 번에 맞추고, 실패하면 아무것도 바꾸지 않는다", () => {
  const { home, main } = repoFixture();
  installDashboardFixture(main);
  const backlog = join(main, "backlogs", "261001_알림");
  write(join(backlog, "02_보내기.md"), "# 02 보내기\n\n- 상태: 진행 (실측은 07)\n- 선행: 01\n");
  write(join(backlog, "03_받기.md"), "# 03 받기\n\n- 상태: 대기\n");
  write(join(backlog, "05_표_밖.md"), "# 05 표 밖\n\n- 상태: 대기\n");
  write(
    join(backlog, "00_현황.md"),
    "# 알림\n\n## 참고\n\n| 단계 | 메모 | 상태 |\n|---|---|---|\n| 02 | 다른 표 | 진행 |\n\n## 진행 현황\n\n| 단계 | 백로그 | 상태 | 선행 | 비고 |\n|---|---|---|---|---|\n| 01 | [만들기](01_만들기.md) | 완료 | — | |\n|02|[보내기](02_보내기.md)|진행|01||\n| 03 | [받기](03_받기.md) | 대기 | 02 | |\n\n## 진행 기록\n\n| 단계 | 내용 | 상태 |\n|---|---|---|\n| 02 | 기록 | 진행 |\n",
  );
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "백로그");
  assert.equal(runCli(home, main, "new", "알림").status, 0);
  const projMain = projectDir(main);
  writeFileSync(
    join(projMain, "PROJECT.md"),
    readFileSync(join(projMain, "PROJECT.md"), "utf8").replaceAll("\r\n", "\n").replace(
      "| T | 이름 | 상태 | 커밋 |\n|---|---|---|---|",
      "| T | 이름 | 백로그 단계 | 상태 | 커밋 |\n|---|---|---|---|---|\n| T01 | 보내기 | 02 | 대기 | |\n| T02 | 다듬기 | — | 대기 | |\n| T03 | 받기 | 09 | 대기 | |\n| T04 | 표 밖 | 05 | 대기 | |",
    ),
  );
  writeFileSync(join(projMain, "PROJECT.md"), readFileSync(join(projMain, "PROJECT.md"), "utf8").replace(/^- 출처: .*$/m, "- 출처: [알림](../../backlogs/261001_알림/02_보내기.md)"));
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  const proj = projectDir(wt);
  const projectPath = join(proj, "PROJECT.md");
  const read = (path: string) => readFileSync(path, "utf8");
  assert.equal(runCli(home, wt, "task", "P001", "보내기").status, 0);
  const t01 = join(proj, "tasks", "T01_보내기");
  // 태스크 문서의 출처 링크는 태스크 폴더 기준으로 맞는다
  const link = /백로그: \[[^\]]+\]\(([^)]+)\)/.exec(read(join(t01, "TASK.md")))?.[1];
  assert.ok(link !== undefined && existsSync(join(t01, link)), `TASK.md 출처 링크: ${link}`);

  // 실패 — check가 통과하지 않으면 바이트 하나 바꾸지 않는다
  passTask(t01);
  writeFileSync(join(t01, "TASK-CLOSE.md"), read(join(t01, "TASK-CLOSE.md")).replace("판정: 통과", "판정: 막힘"));
  const backlogFiles = ["02_보내기.md", "00_현황.md"].map((n) => join(wt, "backlogs", "261001_알림", n));
  const dashboardBefore = read(join(wt, "backlogs/dashboard/data.js"));
  const before = [read(join(t01, "TASK.md")), read(projectPath), ...backlogFiles.map(read)];
  const bad = runCli(home, wt, "done", "P001", "T01");
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /판정이 "통과"가 아니다/);
  assert.deepEqual([read(join(t01, "TASK.md")), read(projectPath), ...backlogFiles.map(read)], before);
  assert.equal(read(join(wt, "backlogs/dashboard/data.js")), dashboardBefore);

  // 통과 — TASK.md·표·백로그 단계 파일·00 표, 커밋하지 않음
  passTask(t01);
  const commits = git(wt, "rev-list", "--count", "HEAD");
  const good = runCli(home, wt, "done", "P001", "T01");
  assert.equal(good.status, 0, good.stdout + good.stderr);
  assert.match(good.stdout, /바뀐 파일\(커밋은 직접\): .*TASK\.md.*PROJECT\.md.*02_보내기\.md.*00_현황\.md/);
  assert.equal(git(wt, "rev-list", "--count", "HEAD"), commits, "커밋하지 않는다");
  assert.match(read(join(t01, "TASK.md")), /^- 상태: 완료$/m);
  assert.match(read(join(wt, "backlogs/dashboard/data.js")), /상태: 완료/);
  assert.match(read(projectPath), /^\| T01 \| 보내기 \| 02 \| 완료 \| \|$/m, "자기 커밋은 아직 없다 — 칸은 비워 둔다");
  assert.match(read(join(wt, "backlogs", "261001_알림", "02_보내기.md")), /^- 상태: 완료 \(실측은 07\)\n- 선행: 01$/m, "상태 뒤 메모는 남긴다");
  const overview = read(join(wt, "backlogs", "261001_알림", "00_현황.md"));
  assert.match(overview, /^\|02\|\[보내기\]\(02_보내기\.md\)\| 완료 \|01\|\|$/m);
  assert.match(overview, /^\| 02 \| 다른 표 \| 진행 \|$/m, "진행 현황 절 밖의 표는 건드리지 않는다");
  assert.match(overview, /^\| 02 \| 기록 \| 진행 \|$/m, "뒤 절의 표도 건드리지 않는다");
  assert.match(overview, /^\| 03 \| \[받기\]\(03_받기\.md\) \| 대기 \| 02 \| \|$/m, "다른 행은 그대로");
  assert.match(read(join(wt, "backlogs", "261001_알림", "03_받기.md")), /- 상태: 대기/);
  assert.match(runCli(home, wt, "done", "P001", "T01").stdout, /바뀐 파일 없음/);
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "feat(P001/T01): 보내기");
  // 같은 태스크의 뒤 커밋이 있으면 가장 최근 것, 완료가 아닌 태스크의 커밋은 채우지 않는다
  writeFileSync(join(wt, "fix.txt"), "고침\n");
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "fix(P001/T01): 고침");
  const t01Hash = git(wt, "log", "-1", "--format=%h");
  // 커밋 칸 동기화 검사용 우회 이력 — 완료 전 태스크의 커밋도 기존 이력으로 읽는다.
  git(wt, "-c", "core.hooksPath=/dev/null", "commit", "-q", "--allow-empty", "-m", "docs(P001/T03): 미리");

  // 백로그 칸이 `—`면 백로그는 그대로, 앞 태스크 커밋 칸은 채운다
  assert.equal(runCli(home, wt, "task", "P001", "다듬기").status, 0);
  const t02 = join(proj, "tasks", "T02_다듬기");
  passTask(t02);
  // 이 태스크의 중간 커밋 — 자기 커밋 칸은 아직 채우지 않는다
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "wip(P001/T02): 중간");
  const backlogBefore = read(join(wt, "backlogs", "261001_알림", "00_현황.md"));
  const second = runCli(home, wt, "done", "P001", "T02");
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout, new RegExp(`커밋 칸 T01 ${t01Hash}`));
  assert.doesNotMatch(second.stdout, /00_개요/);
  assert.equal(read(join(wt, "backlogs", "261001_알림", "00_현황.md")), backlogBefore);
  assert.match(read(projectPath), new RegExp(`^\\| T01 \\| 보내기 \\| 02 \\| 완료 \\| ${t01Hash} \\|$`, "m"));
  assert.match(read(projectPath), /^\| T02 \| 다듬기 \| — \| 완료 \| \|$/m);
  assert.match(read(projectPath), /^\| T03 \| 받기 \| 09 \| 대기 \| \|$/m, "완료가 아닌 행은 채우지 않는다");
  // 손으로 적은 해시 아닌 커밋 칸은 덮어쓰지 않는다
  writeFileSync(projectPath, read(projectPath).replace(`| 완료 | ${t01Hash} |`, "| 완료 | 메모 |"));
  assert.equal(runCli(home, wt, "done", "P001", "T02").status, 0);
  assert.match(read(projectPath), /^\| T01 \| 보내기 \| 02 \| 완료 \| 메모 \|$/m);

  // 백로그 단계 파일이 없으면 실패하고 아무것도 바꾸지 않는다
  assert.equal(runCli(home, wt, "task", "P001", "받기").status, 0);
  const t03 = join(proj, "tasks", "T03_받기");
  passTask(t03);
  assert.match(runCli(home, wt, "list").stdout, /T03 받기/);
  assert.match(runCli(home, wt, "finish", "P001").stdout, /T03: 상태가 완료가 아니다 \(진행\)/);
  const projectBefore = read(projectPath);
  const missing = runCli(home, wt, "done", "P001", "T03");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /백로그 단계 파일이 없다: backlogs\/261001_알림\/09_\*\.md/);
  assert.equal(read(projectPath), projectBefore);
  assert.match(read(join(t03, "TASK.md")), /^- 상태: 진행$/m);
  // 단계 파일은 있는데 진행 현황 표에 행이 없어도 실패하고 아무것도 바꾸지 않는다
  assert.equal(runCli(home, wt, "task", "P001", "표 밖").status, 0);
  const t04 = join(proj, "tasks", "T04_표_밖");
  passTask(t04);
  const stepFive = join(wt, "backlogs", "261001_알림", "05_표_밖.md");
  const snapshot = [read(projectPath), read(join(t04, "TASK.md")), read(stepFive), ...backlogFiles.map(read)];
  const noRow = runCli(home, wt, "done", "P001", "T04");
  assert.equal(noRow.status, 1);
  assert.match(noRow.stderr, /진행 현황 표에 05 행이 없다/);
  assert.deepEqual([read(projectPath), read(join(t04, "TASK.md")), read(stepFive), ...backlogFiles.map(read)], snapshot);
  // main 체크아웃에서는 하지 않는다, 태스크 번호는 T##만
  assert.match(runCli(home, main, "done", "P001", "T01").stderr, /worktree에서 실행/);
  assert.match(runCli(home, wt, "done", "P001", "T0.*").stderr, /태스크 번호 형식이 아니다/);

  // 출처가 백로그가 아니면 단계 칸이 번호라도 백로그를 건드리지 않는다
  assert.equal(runCli(home, main, "new", "대화로").status, 0);
  const p2Main = join(main, "projects", readdirSync(join(main, "projects")).find((n) => n.startsWith("P002_"))!);
  writeFileSync(
    join(p2Main, "PROJECT.md"),
    read(join(p2Main, "PROJECT.md")).replace(/\r\n/g, "\n").replace("| T | 이름 | 상태 | 커밋 |\n|---|---|---|---|", "| T | 이름 | 백로그 단계 | 상태 | 커밋 |\n|---|---|---|---|---|\n| T01 | 보내기 | 03 | 대기 | |"),
  );
  assert.equal(runCli(home, main, "start", "P002").status, 0);
  const wt2 = join(dirname(main), "app.wt", "P002");
  assert.equal(runCli(home, wt2, "task", "P002", "보내기").status, 0);
  const p2 = join(wt2, "projects", basename(p2Main));
  passTask(join(p2, "tasks", "T01_보내기"));
  const p2Done = runCli(home, wt2, "done", "P002", "T01");
  assert.equal(p2Done.status, 0, p2Done.stdout + p2Done.stderr);
  assert.doesNotMatch(p2Done.stdout, /backlogs/);
  // 출처 링크가 backlogs/ 밖이면(문서 링크) 백로그로 보지 않는다
  writeFileSync(join(p2, "PROJECT.md"), read(join(p2, "PROJECT.md")).replace(/^- 출처: .*$/m, "- 출처: [안내](../../docs/README.md)"));
  writeFileSync(join(p2, "PROJECT.md"), read(join(p2, "PROJECT.md")).replace("| T01 | 보내기 | 03 | 완료 | |", "| T01 | 보내기 | 02 | 완료 | |"));
  const docsDone = runCli(home, wt2, "done", "P002", "T01");
  assert.equal(docsDone.status, 0, docsDone.stdout + docsDone.stderr);
  assert.match(read(join(wt2, "backlogs", "261001_알림", "02_보내기.md")), /- 상태: 진행/);
  // 출처가 backlogs/ 아래인데 가리킨 파일이 없으면 멈춘다
  writeFileSync(join(p2, "PROJECT.md"), read(join(p2, "PROJECT.md")).replace(/^- 출처: .*$/m, "- 출처: [옛 단계](../../backlogs/261001_알림/02_옛이름.md)"));
  assert.match(runCli(home, wt2, "done", "P002", "T01").stderr, /출처의 백로그가 없다/);
  // backlogs/ 안의 링크가 바깥을 가리키면 따라가지 않는다
  const outside = tempDir("pace-outside-");
  write(join(outside, "02_밖.md"), "- 상태: 진행\n");
  symlinkSync(outside, join(wt2, "backlogs", "밖"));
  writeFileSync(join(p2, "PROJECT.md"), read(join(p2, "PROJECT.md")).replace(/^- 출처: .*$/m, "- 출처: [밖](../../backlogs/밖/02_밖.md)"));
  assert.match(runCli(home, wt2, "done", "P002", "T01").stderr, /backlogs\/ 밖을 가리킨다/);
  assert.match(read(join(outside, "02_밖.md")), /- 상태: 진행/);
  rmSync(join(wt2, "backlogs", "밖"));
  // 앵커·인코딩이 붙은 링크도 파일로 읽는다
  writeFileSync(join(p2, "PROJECT.md"), read(join(p2, "PROJECT.md")).replace(/^- 출처: .*$/m, "- 출처: [보내기](../../backlogs/261001_%EC%95%8C%EB%A6%BC/02_보내기.md#목표)"));
  const anchored = runCli(home, wt2, "done", "P002", "T01");
  assert.equal(anchored.status, 0, anchored.stdout + anchored.stderr);
  assert.match(read(join(wt2, "backlogs", "261001_알림", "02_보내기.md")), /- 상태: 완료/);
  assert.match(read(join(wt2, "backlogs", "261001_알림", "03_받기.md")), /- 상태: 대기/);
});

test("도움말에 project done이 있다", () => {
  const help = runPace(["--help"], { home: tempDir("pace-home-") });
  assert.match(help.stdout, /pace project done <P###> <T##>/);
});

test("new·start·merge 위치와 상태 규칙: 브랜치 번호, 하위 폴더, 준비 명령, ff 불가·더러운 작업 트리", () => {
  const { home, main } = repoFixture();
  writeFileSync(join(main, "docs", "README.md"), `${readFileSync(join(main, "docs", "README.md"), "utf8")}- worktree 준비: \`echo ready > .prepared\`\n`);
  git(main, "commit", "-q", "-am", "준비 명령 선언");
  // 브랜치만 남은 번호도 건너뛴다
  git(main, "branch", "project/P004");
  mkdirSync(join(main, "src"), { recursive: true });
  const created = runCli(home, join(main, "src"), "new", "다섯째");
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /P005_/);
  const started = runCli(home, main, "start", "P005");
  assert.equal(started.status, 0, started.stderr);
  const wt = join(dirname(main), "app.wt", "P005");
  assert.equal(readFileSync(join(wt, ".prepared"), "utf8").trim(), "ready", "준비 명령 실행");
  assert.match(started.stderr + started.stdout, /실행:.*echo ready/);
  assert.match(runCli(home, wt, "new", "안 됨").stderr, /main 체크아웃에서만/);
  // --base는 git 옵션으로 읽힐 값을 거부한다
  assert.match(runCli(home, main, "list", "--base=--exec=touch x").stderr, /기준 브랜치 이름이 아니다/);

  // 병합 대기로 만들기 (태스크 없는 프로젝트)
  const dir = join(wt, "projects", readdirSync(join(wt, "projects")).find((n) => n.startsWith("P005_"))!);
  writeFileSync(join(dir, "PROJECT.md"), readFileSync(join(dir, "PROJECT.md"), "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 된다 | 기록 |").replace(/^- 상태: .+$/m, "- 상태: 병합 대기"));
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-m", "마감");

  // worktree가 더러우면 merge 거부 — 아무것도 바뀌지 않는다
  write(join(wt, "scratch.txt"), "임시");
  const dirty = runCli(home, main, "merge", "P005", "--yes");
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /worktree에 커밋하지 않은 변경/);
  assert.ok(existsSync(wt));
  assert.notEqual(git(main, "branch", "--list", "project/P005"), "");
  rmSync(join(wt, "scratch.txt"));

  // main이 앞서 가면 ff 불가로 거부
  write(join(main, "later.txt"), "앞서 감");
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "main 앞서 감");
  assert.match(runCli(home, main, "merge", "P005").stderr, /fast-forward가 안 된다/);

  // main 작업 트리가 더러우면 거부
  write(join(main, "wip.txt"), "작업 중");
  assert.match(runCli(home, main, "merge", "P005").stderr, /main 작업 트리에 커밋하지 않은 변경/);
});

test("비밀 노출 탐지: JSON·Bearer·JWT는 잡고, 환경 변수 이름 참조와 바이너리는 넘긴다", () => {
  const dir = tempDir("pace-secret-");
  write(join(dir, "a.json"), '{"password": "hunter2hunter2"}');
  write(join(dir, "b.har"), "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123");
  write(join(dir, "c"), "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N");
  write(join(dir, "ok.md"), "api_key: E2E_API_KEY\nid_ref: E2E_LOGIN_ID\npassword: ${E2E_PW}\n");
  writeFileSync(join(dir, "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0x70, 0x61, 0x73, 0x73]));
  assert.deepEqual(findSecrets(dir).sort(), ["a.json", "b.har", "c"]);
});

/** 호출 인자를 기록하는 가짜 orca. mode=fail이면 worker-start가 실패한다. */
function fakeOrca(mode: "ok" | "fail" | "runId" = "ok"): { bin: string; log: string; preload: string } {
  const dir = tempDir("pace-fake-orca-");
  const log = join(dir, "calls.log");
  const bin = join(dir, "orca");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs=require("node:fs"), a=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(log)},a.join(" ").replace(/\\n/g," ")+"\\n");
if(a[1]==="run-current") console.log(JSON.stringify(${mode === "runId"} ? {ok:true,result:{runId:"run_x"}} : {ok:true,result:{run:null}}));
else if(a[1]==="run-create") console.log(JSON.stringify({ok:true,result:{run:{id:"run1"}}}));
else if(a[1]==="worker-start") { if(${mode === "fail"}) { console.log(JSON.stringify({ok:false,error:{message:"no agent"}})); process.exitCode=1; } else console.log(JSON.stringify({ok:true,result:{dispatch:{id:"d1"}}})); }
`,
    { mode: 0o755 },
  );
  const hook = join(dir, "preload.mjs");
  writeFileSync(hook, `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; const run=cp.spawnSync; cp.spawnSync=(file,args,options)=>file===${JSON.stringify(bin)} ? run(process.execPath,[file,...args],options) : run(file,args,options); syncBuiltinESMExports();`);
  return { bin, log, preload: process.platform === "win32" ? `--import=${pathToFileURL(hook).href}` : "" };
}

const calls = (log: string) => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);

test("Orca 안이면 start가 작업자 세션을 띄우고, 다시 start·--no-launch·Orca 밖에서는 띄우지 않는다", () => {
  const { home, main } = repoFixture();
  const orca = fakeOrca();
  const inOrca = { TERM_PROGRAM: "Orca", ORCA_CLI_COMMAND: orca.bin, ...(orca.preload ? { NODE_OPTIONS: orca.preload } : {}) };
  const startIn = (...args: string[]) => runPace(["project", "start", ...args], { home, cwd: main, timeout: 60_000, env: inOrca });

  assert.equal(runCli(home, main, "new", "알림").status, 0);
  const started = startIn("P001");
  assert.equal(started.status, 0, started.stderr);
  const wt = join(dirname(main), "app.wt", "P001");
  const log = calls(orca.log);
  assert.deepEqual(log.map((l) => l.split(" ").slice(0, 2).join(" ")), ["orchestration run-current", "orchestration run-create", "orchestration worker-start"]);
  const worker = log[2]!;
  // git은 실제 경로를 준다(macOS /var → /private/var) — 끝부분으로 확인한다.
  assert.match(worker, /--worktree path:\S*[\\/]app\.wt[\\/]P001 --agent claude/);
  assert.ok(existsSync(wt));
  assert.match(worker, /--agent claude/);
  assert.match(worker, /--model claude-sonnet-5-5/);
  assert.doesNotMatch(worker, /--effort/);
  assert.match(worker, /P001 알림 프로젝트를 이어서 수행한다/);
  assert.match(worker, /\(main 판단\)/);
  assert.match(worker, /worker_done/);
  assert.match(started.stdout, /이 세션은 코디네이터다/);
  assert.match(started.stdout, /coordinator\.md/);

  // 이미 있는 worktree는 다시 띄우지 않는다
  assert.match(startIn("P001").stdout, /이미 있음/);
  assert.equal(calls(orca.log).length, 3);
  // 명시하면(--launch) 이미 있는 worktree에도 띄운다
  const relaunched = startIn("P001", "--launch", "--model", "custom-model", "--effort", "high");
  assert.equal(relaunched.status, 0, relaunched.stderr);
  assert.match(relaunched.stdout, /이 세션은 코디네이터다/);
  assert.equal(calls(orca.log).filter((l) => l.startsWith("orchestration worker-start")).length, 2);
  assert.match(calls(orca.log).at(-1)!, /--model custom-model --effort high/);
  const before = calls(orca.log).length;

  // --no-launch, --agent
  assert.equal(runCli(home, main, "new", "둘").status, 0);
  const noLaunch = startIn("P002", "--no-launch");
  assert.equal(noLaunch.status, 0, noLaunch.stderr);
  assert.match(noLaunch.stdout, /--no-launch[\s\S]*직접 열기: cd '.*app\.wt[\\/]P002' && 'claude'/);
  assert.equal(calls(orca.log).length, before);

  // Orca 밖
  assert.equal(runCli(home, main, "new", "셋").status, 0);
  const outside = runPace(["project", "start", "P003", "--agent", "codex"], { home, cwd: main, timeout: 60_000, env: { ORCA_CLI_COMMAND: orca.bin, ...(orca.preload ? { NODE_OPTIONS: orca.preload } : {}) } });
  assert.equal(outside.status, 0, outside.stderr);
  assert.match(outside.stdout, /Orca 밖[\s\S]*직접 열기: cd '.*app\.wt[\\/]P003' && 'codex'/);
  assert.equal(calls(orca.log).length, before);
});

test("Orca 채팅 세션에서도 작업자를 띄우고, 현재 run(runId)이 있으면 새로 만들지 않는다", () => {
  const { home, main } = repoFixture();
  const orca = fakeOrca("runId");
  assert.equal(runCli(home, main, "new", "채팅").status, 0);
  const started = runPace(["project", "start", "P001"], { home, cwd: main, timeout: 60_000, env: { ORCA_STRUCTURED_SESSION: "1", ORCA_CLI_COMMAND: orca.bin, ...(orca.preload ? { NODE_OPTIONS: orca.preload } : {}) } });
  assert.equal(started.status, 0, started.stderr);
  assert.deepEqual(calls(orca.log).map((l) => l.split(" ").slice(0, 2).join(" ")), ["orchestration run-current", "orchestration worker-start"]);
  assert.match(started.stdout, /Orca 채팅 세션: 작업자가 보고하면 Orca가 깨운다/);
  assert.doesNotMatch(started.stdout, /check --wait/);
});

test("작업자 설정 CLI와 실행별 우선순위 및 사전 오류", () => {
  const { home, main } = repoFixture();
  const orca = fakeOrca();
  const run = (...args: string[]) => runPace(args, { home, cwd: main, timeout: 60_000, env: { TERM_PROGRAM: "Orca", ORCA_CLI_COMMAND: orca.bin, ...(orca.preload ? { NODE_OPTIONS: orca.preload } : {}) } });
  assert.equal(run("worker", "set", "codex", "effort", "high").status, 0);
  assert.equal(run("worker", "set", "codex", "model", "custom").status, 0);
  assert.match(run("worker", "show").stdout, /custom/);
  assert.equal(runCli(home, main, "new", "설정").status, 0);
  assert.equal(run("project", "start", "P001", "--agent", "codex").status, 0);
  assert.match(calls(orca.log).at(-1)!, /--model custom --effort high/);
  assert.equal(run("project", "start", "P001", "--launch", "--agent", "codex", "--effort", "default").status, 0);
  assert.doesNotMatch(calls(orca.log).at(-1)!, /--effort/);
  assert.equal(run("worker", "reset", "codex", "model").status, 0);
  assert.match(run("worker", "show").stdout, /gpt-6\.1-terra/);
  assert.equal(runCli(home, main, "new", "오류").status, 0);
  assert.notEqual(run("project", "start", "P002", "--model", "").status, 0);
  assert.equal(existsSync(join(dirname(main), "app.wt", "P002")), false);
  const manual = run("project", "start", "P002", "--agent", "codex", "--no-launch", "--model", "model'$(touch SHOULD_NOT_EXIST)", "--effort", "high");
  assert.equal(manual.status, 0, manual.stderr);
  assert.match(manual.stdout, /model'\\''\$\(touch SHOULD_NOT_EXIST\)/);
  assert.match(manual.stdout, /model_reasoning_effort=/);
  const bin = join(home, "manual-bin");
  mkdirSync(bin);
  const argsFile = join(home, "manual-args");
  write(join(bin, "codex"), `#!/bin/sh\nprintf '%s\\n' "$@" > "$ARGS_FILE"\n`);
  chmodSync(join(bin, "codex"), 0o755);
  const command = manual.stdout.split("직접 열기: ")[1]!.trim();
  const shell = process.platform === "win32"
    ? join(spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim(), "../../..", "bin", "sh.exe")
    : "sh";
  const executed = spawnSync(shell, ["-c", command], { cwd: main, env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, ARGS_FILE: argsFile }, encoding: "utf8" });
  assert.equal(executed.status, 0, executed.stderr);
  assert.deepEqual(readFileSync(argsFile, "utf8").trim().split("\n"), ["--model", "model'$(touch SHOULD_NOT_EXIST)", "--config", 'model_reasoning_effort="high"']);
  assert.equal(existsSync(join(dirname(main), "app.wt", "P002", "SHOULD_NOT_EXIST")), false);
  assert.equal(runCli(home, main, "new", "명시옵션").status, 0);
  assert.equal(run("project", "start", "P003", "--agent", "codex", "--model", "explicit", "--effort", "low").status, 0);
  assert.match(calls(orca.log).at(-1)!, /--model explicit --effort low/);
  assert.equal(runCli(home, main, "new", "손상").status, 0);
  write(join(home, "worker-settings.json"), "broken");
  const head = git(main, "rev-parse", "HEAD");
  const commits = git(main, "rev-list", "--count", "HEAD");
  const status = git(main, "status", "--porcelain");
  const hook = git(main, "rev-parse", "--git-path", "hooks/commit-msg");
  const hookPath = hook.startsWith("/") ? hook : join(main, hook);
  const beforeHook = existsSync(hookPath) ? readFileSync(hookPath, "utf8") : null;
  assert.notEqual(run("project", "start", "P004").status, 0);
  assert.equal(existsSync(join(dirname(main), "app.wt", "P004")), false);
  assert.equal(git(main, "rev-parse", "HEAD"), head);
  assert.equal(git(main, "rev-list", "--count", "HEAD"), commits);
  assert.equal(git(main, "status", "--porcelain"), status);
  assert.equal(existsSync(hookPath) ? readFileSync(hookPath, "utf8") : null, beforeHook);
});

test("작업자 세션을 띄우지 못해도 start는 성공하고 직접 여는 방법을 알려 준다", () => {
  const { home, main } = repoFixture();
  const orca = fakeOrca("fail");
  assert.equal(runCli(home, main, "new", "실패").status, 0);
  const r = runPace(["project", "start", "P001"], { home, cwd: main, timeout: 60_000, env: { TERM_PROGRAM: "Orca", ORCA_CLI_COMMAND: orca.bin, ...(orca.preload ? { NODE_OPTIONS: orca.preload } : {}) } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /작업자 세션을 띄우지 못했다: worker-start 실패/);
  assert.match(r.stdout, /직접 열기: cd '.*app\.wt[\\/]P001' && 'claude'/);
  assert.ok(existsSync(join(dirname(main), "app.wt", "P001")));
});

test("테스트 도우미는 TERM_PROGRAM도 물려주지 않는다 (테스트가 실제 Orca를 부르지 않게)", () => {
  const saved = process.env.TERM_PROGRAM;
  process.env.TERM_PROGRAM = "Orca";
  try {
    assert.equal(sessionFreeEnv().TERM_PROGRAM, undefined);
  } finally {
    if (saved === undefined) delete process.env.TERM_PROGRAM;
    else process.env.TERM_PROGRAM = saved;
  }
});

test("Orca 실행 파일과 작업자 도구를 고른다", async () => {
  const { orcaCommand, detectAgent } = await import("../src/project/harness.ts");
  assert.equal(orcaCommand({}), null, "Orca 밖");
  assert.equal(orcaCommand({ TERM_PROGRAM: "Orca", ORCA_CLI_COMMAND: "/x/orca" }), "/x/orca");
  assert.equal(orcaCommand({ ORCA_STRUCTURED_SESSION: "1", ORCA_CLI_COMMAND: "/x/orca" }), "/x/orca", "Orca 채팅 세션");
  assert.equal(orcaCommand({ ORCA_CLI_COMMAND: "/x/orca" }), null, "ORCA_CLI_COMMAND만으로는 밖(WSL 관리 세션)");
  assert.equal(orcaCommand({ ORCA_STRUCTURED_SESSION: "0", ORCA_CLI_COMMAND: "/x/orca" }), null);
  const binDir = tempDir("pace-orca-bin-");
  writeFileSync(join(binDir, "orca"), "#!/bin/sh\n", { mode: 0o755 });
  assert.equal(orcaCommand({ ORCA_WORKSPACE_ID: "w", ORCA_CLI_BIN_DIR: binDir }), join(binDir, "orca"), "Orca가 알려 준 위치");
  assert.equal(orcaCommand({ TERM_PROGRAM: "Orca", ORCA_CLI_BIN_DIR: join(binDir, "없음") }), "orca", "위치에 없으면 PATH");
  assert.deepEqual(detectAgent({ CLAUDECODE: "1" }), { agent: "claude", guessed: false });
  assert.deepEqual(detectAgent({ CODEX_THREAD_ID: "t" }), { agent: "codex", guessed: false });
  assert.deepEqual(detectAgent({ CURSOR_AGENT: "1" }), { agent: "cursor", guessed: false });
  assert.deepEqual(detectAgent({}), { agent: "claude", guessed: true });
});

test("declaredCommand: 표 칸·목록 항목 맨 앞의 라벨만 읽고, 설명 문장 속 라벨은 무시한다", () => {
  const root = tempDir("pace-declared-");
  write(
    join(root, "docs", "README.md"),
    [
      "# app",
      "하네스는 `검사`·`보안 검사` 라벨을 읽는다. 보안 검사 `rm -rf /`는 예시일 뿐이다.",
      "",
      "| 구분 | 명령 / 값 | 확인 |",
      "|---|---|---|",
      "| **검사** | `npm run check` — 타입 | ✅ |",
      "| 보안 검사 | (선언 없음) | `확인 칸` |",
      "| worktree 준비 | `npm ci` | |",
      "",
      "- 실행: `npm run dev`",
      "| 린트 | `eslint . \\| tee lint.log` | |",
      "",
      "**하네스 라벨** — `보안 검사`: `make sec` 같은 명령 · `worktree 준비`: `npm ci`",
    ].join("\n"),
  );
  assert.equal(declaredCommand(root, "검사"), "npm run check");
  assert.equal(declaredCommand(root, "보안 검사"), null, "빈 행과 설명 문장은 선언이 아니다");
  assert.equal(declaredCommand(root, "worktree 준비"), "npm ci");
  assert.equal(declaredCommand(root, "실행"), "npm run dev");
  assert.equal(declaredCommand(root, "린트"), "eslint . | tee lint.log", "표 칸 안의 \\| 는 파이프");
});

test("작업자 도구: --agent > PROJECT.md `- 작업자:` > 정의서 `작업자 도구:` > 지금 세션, 오타는 worktree 전에 거부", () => {
  const { home, main } = repoFixture();
  const orca = fakeOrca();
  const env = { TERM_PROGRAM: "Orca", ORCA_CLI_COMMAND: orca.bin, ...(orca.preload ? { NODE_OPTIONS: orca.preload } : {}), CLAUDECODE: "1" };
  const start = (...args: string[]) => runPace(["project", "start", ...args], { home, cwd: main, timeout: 60_000, env });
  const lastAgent = () => /--agent (\S+)/.exec(calls(orca.log).filter((l) => l.includes("worker-start")).at(-1) ?? "")?.[1];
  const projectMd = (id: string) => join(main, "projects", readdirSync(join(main, "projects")).find((n) => n.startsWith(`${id}_`))!, "PROJECT.md");
  writeFileSync(join(main, "docs", "README.md"), `${readFileSync(join(main, "docs", "README.md"), "utf8")}\n## 작업 프로세스\n\n- 작업자 도구: \`codex\`\n`);
  git(main, "commit", "-q", "-am", "작업자 도구 선언");

  // 템플릿 그대로(주석뿐) → 정의서 codex
  assert.equal(runCli(home, main, "new", "하나").status, 0);
  const one = start("P001");
  assert.equal(one.status, 0, one.stderr);
  assert.equal(lastAgent(), "codex");
  assert.match(one.stdout, /codex \(저장소 기본값\)/);

  // 프로젝트 줄 → cursor, --agent가 이긴다
  assert.equal(runCli(home, main, "new", "둘").status, 0);
  writeFileSync(projectMd("P002"), readFileSync(projectMd("P002"), "utf8").replace(/^- 작업자: .*$/m, "- 작업자: cursor"));
  assert.equal(start("P002").status, 0);
  assert.equal(lastAgent(), "cursor");
  assert.match(start("P002", "--launch", "--agent", "claude").stdout, /claude \(명령 옵션\)/);
  assert.equal(lastAgent(), "claude");

  // 선언 없음 → 지금 세션(CLAUDECODE)
  writeFileSync(join(main, "docs", "README.md"), readFileSync(join(main, "docs", "README.md"), "utf8").replace("- 작업자 도구: `codex`\n", ""));
  git(main, "commit", "-q", "-am", "선언 제거");
  assert.equal(runCli(home, main, "new", "셋").status, 0);
  const three = start("P003");
  assert.equal(three.status, 0, three.stderr);
  assert.match(three.stdout, /claude \(지금 세션\)/);

  // 백틱·"없음"·본문의 같은 글자, 백틱 없는 정의서 선언
  assert.equal(runCli(home, main, "new", "다섯").status, 0);
  writeFileSync(projectMd("P004"), readFileSync(projectMd("P004"), "utf8").replace(/^- 작업자: .*$/m, "- 작업자: `codex`"));
  assert.equal(start("P004").status, 0);
  assert.equal(lastAgent(), "codex");
  assert.equal(runCli(home, main, "new", "여섯").status, 0);
  writeFileSync(projectMd("P005"), readFileSync(projectMd("P005"), "utf8").replace(/^- 작업자: .*$/m, "- 작업자: 없음").replace("## 목적", "## 목적\n\n- 작업자: kodex (본문 목록 — 읽지 않는다)"));
  writeFileSync(join(main, "docs", "README.md"), `${readFileSync(join(main, "docs", "README.md"), "utf8")}\n- 작업자 도구: antigravity\n`);
  git(main, "commit", "-q", "-am", "백틱 없는 선언");
  const six = start("P005");
  assert.equal(six.status, 0, six.stderr);
  assert.equal(lastAgent(), "antigravity");
  assert.match(six.stdout, /antigravity \(저장소 기본값\)/);

  // 오타 — worktree·정의 커밋 전에 거부
  assert.equal(runCli(home, main, "new", "넷").status, 0);
  const headBefore = git(main, "rev-parse", "HEAD");
  const typo = start("P006", "--agent", "clade");
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /받을 수 없다: "clade" \(명령 옵션\) — 받는 이름: claude, codex/);
  assert.ok(!existsSync(join(dirname(main), "app.wt", "P006")));
  writeFileSync(projectMd("P006"), readFileSync(projectMd("P006"), "utf8").replace(/^- 작업자: .*$/m, "- 작업자: kodex"));
  const typo2 = start("P006");
  assert.equal(typo2.status, 1);
  assert.match(typo2.stderr, /"kodex" \(프로젝트\)/);
  assert.ok(!existsSync(join(dirname(main), "app.wt", "P006")));
  assert.equal(git(main, "rev-parse", "HEAD"), headBefore, "정의 커밋도 하지 않는다");
  // 이미 있는 worktree에서 띄우지 않을 때는 잘못된 값이 있어도 막지 않는다
  writeFileSync(projectMd("P001"), readFileSync(projectMd("P001"), "utf8").replace(/^- 작업자: .*$/m, "- 작업자: kodex"));
  const again = start("P001");
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /이미 있음/);
});

test("브레인 활용: new는 관련 페이지 후보를 재료에 넣고, finish는 PROJECT-CLOSE 브레인 행을 확인한다", async () => {
  const { checkBrainRow } = await import("../src/project/harness.ts");
  const { home, main } = repoFixture();
  const projectMd = (id: string) => join(main, "projects", readdirSync(join(main, "projects")).find((n) => n.startsWith(`${id}_`))!, "PROJECT.md");
  // 브레인 없음 — 재료에 아무것도 넣지 않는다
  assert.equal(runCli(home, main, "new", "예약 발송").status, 0);
  assert.doesNotMatch(readFileSync(projectMd("P001"), "utf8"), /- 브레인/);
  // 브레인 있음 — 관련 페이지 후보, 없으면 "관련 페이지 없음"
  assert.equal(runPace(["brain", "init"], { home, cwd: main }).status, 0);
  const added = runPace(["brain", "add", "--type", "concept", "--title", "예약 발송 큐", "--summary", "예약 메시지는 큐로 보낸다", "--body", "## 결정\n예약 발송은 큐로", "--sources", "대화:2026-10-24", "--file", "schedule-queue"], { home, cwd: main });
  assert.equal(added.status, 0, added.stderr + added.stdout);
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "브레인");
  assert.equal(runCli(home, main, "new", "예약 발송 재시도").status, 0);
  const two = readFileSync(projectMd("P002"), "utf8");
  assert.match(two, /## 재료[\s\S]*- 브레인 \(`pace project new` 자동 검색[\s\S]*`\.pace[\\/]brain[\\/]pages[\\/]concept[\\/]schedule-queue\.md` — 예약 발송 큐: 예약 메시지는 큐로 보낸다[\s\S]*## 기준/);
  assert.equal(runCli(home, main, "new", "전혀 무관한 일").status, 0);
  assert.match(readFileSync(projectMd("P003"), "utf8"), /- 브레인: 관련 페이지 없음/);
  // BL 폴더의 BACKLOG.md 제목으로 후보를 검색한다.
  write(join(main, "backlogs", "BL261025_01_예약", "BACKLOG.md"), "# 예약 발송\n");
  assert.equal(runCli(home, main, "new", "폴더 출처", "--from", "BL261025_01").status, 0);
  assert.match(readFileSync(projectMd("P004"), "utf8"), /schedule-queue/);
  const briefOnly = join(main, "backlogs", "BL261025_02_범용");
  write(join(briefOnly, "BACKLOG.md"), "# 범용\n");
  write(join(briefOnly, "BR01_키워드.md"), "# 예약 발송 큐\n");
  assert.equal(runCli(home, main, "new", "일반", "--from", briefOnly).status, 0);
  assert.match(readFileSync(projectMd("P005"), "utf8"), /schedule-queue/, "BR 제목만의 키워드로도 후보를 찾는다");
  assert.match(readFileSync(projectMd("P005"), "utf8"), /출처: .*\(\.\.\/\.\.\/backlogs\/BL261025_02_범용\/BACKLOG\.md\)/, "절대 경로 별칭도 저장소 안 상대 출처로 만든다");

  // finish의 브레인 행 확인
  const none = new Set<string>();
  const touched = new Set([".pace/brain/pages/concept/x.md"]);
  assert.match(checkBrainRow(main, [["`docs/README.md`", "반영", ""]], none).join(), /브레인 행이 없다/);
  assert.match(checkBrainRow(main, [["브레인(`.pace/brain/`)", "해당 없음", ""]], none).join(), /이유를 비고에/);
  assert.deepEqual(checkBrainRow(main, [["브레인(`.pace/brain/`)", "해당 없음", "새 결정 없음"]], none), []);
  assert.match(checkBrainRow(main, [["브레인", "반영", "큐 결정"]], none).join(), /바뀌지 않았다/);
  assert.match(checkBrainRow(main, [["`templates/RULES.md` 브레인 절", "반영", ""]], none).join(), /브레인 행이 없다/, "다른 행의 '브레인' 글자는 브레인 행이 아니다");
  assert.deepEqual(checkBrainRow(main, [["브레인", "반영", "큐 결정"]], touched), []);
  assert.match(checkBrainRow(main, [["브레인(`.pace/brain/`)", "<!-- 반영 · 해당 없음 -->", ""]], none).join(), /"반영" 또는 "해당 없음"/);
  // 브레인이 없는 저장소는 확인하지 않는다
  const { main: plain } = repoFixture();
  assert.deepEqual(checkBrainRow(plain, [], none), []);
});

test("정본 반영 표: 템플릿 브레인 행만 남은 표는 비었다고 본다, main 직접 프로젝트도 브레인 행을 확인한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "직접").status, 0);
  const dir = join(main, "projects", readdirSync(join(main, "projects")).find((n) => n.startsWith("P001_"))!);
  writeFileSync(join(dir, "PROJECT.md"), readFileSync(join(dir, "PROJECT.md"), "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 된다 | 기록 |").replace(/## 태스크[\s\S]*?(?=## 결정)/, ""));
  const close = readFileSync(join(templatesDir, "project", "PROJECT-CLOSE.md"), "utf8")
    .replace("{{projectId}} {{projectName}}", "P001 직접").replace("{{date}}", "2026-10-24")
    .replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 통과 | 기록 |")
    .replace(/(## 보안\n\n<!--[\s\S]*?-->)/, "$1\n보안 검사 통과")
    .replace("## 지표", "## 지표\n\n시간과 리뷰를 확인했다.");
  writeFileSync(join(dir, "PROJECT-CLOSE.md"), close);
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "main 직접");
  const empty = runCli(home, main, "finish", "P001");
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /정본 반영 표가 비었다/);
  // 브레인이 있으면 main 직접 프로젝트도 브레인 행을 본다
  assert.equal(runPace(["brain", "init"], { home, cwd: main }).status, 0);
  writeFileSync(join(dir, "PROJECT-CLOSE.md"), close.replace("| | <!-- 반영 · 해당 없음 --> | |", "| `docs/README.md` | 해당 없음 | 문서 변경 없음 |"));
  git(main, "add", "-A");
  git(main, "commit", "-q", "-m", "브레인");
  const brain = runCli(home, main, "finish", "P001");
  assert.equal(brain.status, 1);
  assert.match(brain.stdout, /브레인 행의 반영 칸은/);
});


test("finish: changed sources produce candidate notes and every waived page must be mentioned", async () => {
  const { checkBrainRow } = await import("../src/project/harness.ts");
  const { home, main } = repoFixture();
  assert.equal(runPace(["brain", "init"], { home, cwd: main }).status, 0);
  for (const name of ["one", "two"]) {
    const added = runPace(["brain", "add", "--type", "concept", "--title", name, "--file", name, "--summary", "decision", "--body", "## Reason\nA reason.", "--sources", "doc:docs/README.md:12"], { home, cwd: main });
    assert.equal(added.status, 0, added.stderr);
  }
  git(main, "add", "-A"); git(main, "commit", "-qm", "wiki");
  assert.equal(runCli(home, main, "new", "source change").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8") + "\n| 2026-10-24 | 계약 승인(루카스) |\n");
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  writeFileSync(join(wt, "docs", "README.md"), "# changed\n");
  git(wt, "add", "docs/README.md"); git(wt, "commit", "-qm", "source changed");
  const result = runCli(home, wt, "finish", "P001");
  assert.equal(result.status, 1, "unfinished contract still blocks");
  assert.match(result.stdout, /브레인 갱신 후보: .pace[\\/]brain[\\/]pages[\\/]concept[\\/]one.md/);
  assert.match(result.stdout, /브레인 갱신 후보: .pace[\\/]brain[\\/]pages[\\/]concept[\\/]two.md/);
  const changed = new Set(["docs/README.md"]);
  const row = (reason: string) => [["브레인", "해당 없음", reason]];
  assert.equal(checkBrainRow(wt, row("새 결정 없음"), changed).length, 2);
  const one = ".pace/brain/pages/concept/one.md", two = ".pace/brain/pages/concept/two.md";
  assert.equal(checkBrainRow(wt, row(`${one} 검토: 여전히 유효`), changed).length, 1);
  assert.deepEqual(checkBrainRow(wt, row(`${one}, ${two} 검토: 주장이 바뀌지 않음`), changed), []);
  assert.equal(checkBrainRow(wt, row(`<!-- ${one} ${two} --> 아직 없음`), changed).length, 2);
  assert.deepEqual(checkBrainRow(wt, [["브레인", "반영", "updated"]], new Set([...changed, one])), []);
});


test("start: 긴 백로그·대화 출처도 착수 결정을 남기고 전체 근거는 PROJECT.md로 가리킨다", () => {
  for (const source of ["[단계](../../backlogs/261024_" + "긴_이름_".repeat(30) + "/01.md)", "대화 2026-10-24 — " + "확정된 요청 ".repeat(30), ""]) {
    const { home, main } = repoFixture();
    assert.equal(runCli(home, main, "new", "긴 출처").status, 0);
    const contract = join(projectDir(main), "PROJECT.md");
    writeFileSync(contract, readFileSync(contract, "utf8").replace(/^- 출처: .*$/m, `- 출처: ${source}`));
    const started = runCli(home, main, "start", "P001");
    assert.equal(started.status, 0, started.stderr);
    const wt = join(dirname(main), "app.wt", "P001");
    const events = readFileSync(join(projectDir(wt), "log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const decision = events.find((e) => e.type === "decision" && e.msg.includes("착수 결정"));
    assert.ok(decision);
    assert.equal(decision.src, source ? source.slice(0, 60) : "출처 미기재");
    assert.equal(decision.ref, "PROJECT.md");
    assert.ok(readFileSync(join(projectDir(wt), decision.ref), "utf8").includes(source));
    assert.equal(events.some((e) => e.type === "approval"), false);
  }
});


test("start: 기존 브랜치가 바꾼 worktree 준비 대신 base 선언을 실행한다", () => {
  const { home, main } = repoFixture();
  const doc = join(main, "docs", "README.md");
  writeFileSync(doc, readFileSync(doc, "utf8") + "- worktree 준비: `echo trusted > .prepared`\n");
  git(main, "commit", "-qam", "base setup");
  assert.equal(runCli(home, main, "new", "준비 보호").status, 0);
  git(main, "add", "-A"); git(main, "commit", "-qm", "definition");
  git(main, "checkout", "-qb", "project/P001");
  writeFileSync(doc, readFileSync(doc, "utf8").replace("echo trusted > .prepared", "false"));
  git(main, "commit", "-qam", "changed setup");
  git(main, "checkout", "-q", "main");
  const started = runCli(home, main, "start", "P001");
  assert.equal(started.status, 0, started.stderr);
  assert.match(started.stderr, /worktree 선언이 다름/);
  assert.match(started.stderr, /실행: echo trusted/);
  assert.equal(readFileSync(join(dirname(main), "app.wt", "P001", ".prepared"), "utf8").trim(), "trusted");
});

test("finish: 의존성 감사는 잠금 파일이 base 대비 바뀐 브랜치에서만 실행한다", async () => {
  const { changedLockFiles } = await import("../src/project/harness.ts");
  assert.deepEqual(changedLockFiles(["package-lock.json", "web/pnpm-lock.yaml", "src/a.ts", "docs/package-lock.json.md"]), ["package-lock.json", "web/pnpm-lock.yaml"]);
  for (const lockChanged of [false, true]) {
    const { home, main } = repoFixture();
    // 감사 명령은 실패하게 선언 — 실행됐는지가 결과로 드러난다
    writeFileSync(join(main, "docs", "README.md"), readFileSync(join(main, "docs", "README.md"), "utf8") + "- 의존성 감사: `false`\n");
    git(main, "commit", "-qam", "audit declaration");
    assert.equal(runCli(home, main, "new", "audit").status, 0);
    const contract = join(projectDir(main), "PROJECT.md");
    writeFileSync(contract, readFileSync(contract, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | audit | CLI |"));
    assert.equal(runCli(home, main, "start", "P001").status, 0);
    const wt = join(dirname(main), "app.wt", "P001");
    writeFileSync(join(wt, "src.txt"), "change\n");
    if (lockChanged) writeFileSync(join(wt, "package-lock.json"), "{\"lockfileVersion\":3}\n");
    write(join(projectDir(wt), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| src.txt | 해당 없음 | 시험 |\n## 지표\n[집계](METRICS.md)\n작업 시간을 확인했다.\n");
    git(wt, "add", "-A"); git(wt, "commit", "-qm", "work");
    const result = runCli(home, wt, "finish", "P001");
    if (lockChanged) {
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.ok(result.stdout.includes("의존성 감사 실패 (package-lock.json): false"), result.stdout);
    } else {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /의존성 감사 생략: 잠금 파일이 base와 같다/);
      assert.doesNotMatch(result.stderr, /실행: false/);
    }
  }
});

test("finish: base에 선언이 없으면 worktree 명령을 실행하고 실패를 보존한다", () => {
  for (const label of ["검사", "보안 검사"]) {
  const { home, main } = repoFixture();
  writeFileSync(join(main, "docs", "README.md"), "# app\n");
  git(main, "commit", "-qam", "no declarations");
  assert.equal(runCli(home, main, "new", "fallback").status, 0);
  const contract = join(projectDir(main), "PROJECT.md");
  writeFileSync(contract, readFileSync(contract, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | fallback | CLI |"));
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  writeFileSync(join(wt, "docs", "README.md"), `# app\n- 검사: \`${label === "검사" ? "false" : "true"}\`\n- 보안 검사: \`${label === "보안 검사" ? "false" : "true"}\`\n`);
  write(join(projectDir(wt), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 반영 | 선언 |\n## 지표\n[집계](METRICS.md)\n작업 시간을 확인했다.\n");
  git(wt, "add", "-A"); git(wt, "commit", "-qm", "local check");
  const result = runCli(home, wt, "finish", "P001");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(`${label} 실패: false`));
  assert.match(result.stderr, /실행: false/);
  if (label === "검사") assert.match(result.stderr, /실행: true[\s\S]*실행: false/);
  assert.doesNotMatch(result.stderr, /worktree 선언이 다름/);
  }
});


test("start: base에 준비 선언이 없으면 worktree 선언을 실행하고 실패를 보존한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "준비 fallback").status, 0);
  git(main, "add", "-A"); git(main, "commit", "-qm", "definition");
  git(main, "checkout", "-qb", "project/P001");
  const doc = join(main, "docs", "README.md");
  writeFileSync(doc, readFileSync(doc, "utf8") + "- worktree 준비: `false`\n");
  git(main, "commit", "-qam", "local setup");
  git(main, "checkout", "-q", "main");
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /준비 명령이 실패했다: false/);
  assert.match(result.stderr, /실행: false/);
  assert.doesNotMatch(result.stderr, /worktree 선언이 다름/);
});


test("선언 명령: base 조회 오류는 선언 부재로 취급하지 않고 실행 전에 중단한다", () => {
  const { home, main } = repoFixture();
  const doc = join(main, "docs", "README.md");
  writeFileSync(doc, readFileSync(doc, "utf8") + "- worktree 준비: `touch executed`\n");
  git(main, "commit", "-qam", "setup");
  assert.equal(runCli(home, main, "new", "조회 오류").status, 0);
  const preload = fakeGitFailure(home, `args.includes('show') && args.includes('main:docs/README.md')`);
  const result = runPace(["project", "start", "P001"], { home, cwd: main, env: { NODE_OPTIONS: preload } });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /git show main:docs\/README.md 실패/);
  assert.doesNotMatch(result.stderr, /실행:/);
  assert.equal(existsSync(join(dirname(main), "app.wt", "P001", "executed")), false);
});


test("commit gate: start 설치·갱신, check 실패/성공, 무관 커밋과 복수 태그", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "commit gate").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const hook = join(main, ".git", "hooks", "commit-msg");
  assert.ok(existsSync(hook));
  const content = readFileSync(hook, "utf8");
  assert.match(content, /PACE commit gate/);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  assert.equal(readFileSync(hook, "utf8"), content);
  const wt = join(dirname(main), "app.wt", "P001");
  assert.equal(runCli(home, wt, "task", "P001", "검사").status, 0);
  git(wt, "add", "-A");
  const before = git(wt, "rev-parse", "HEAD");
  const rejected = gitRun(wt, ["commit", "-qm", "feat(P001/T01): incomplete"]);
  assert.notEqual(rejected.status, 0);
  assert.equal(git(wt, "rev-parse", "HEAD"), before);
  assert.match(rejected.stdout + rejected.stderr, /TASK-CLOSE/);
  git(wt, "commit", "-qm", "wip: no tag");
  const task = join(projectDir(wt), "tasks", "T01_검사");
  passTask(task);
  git(wt, "add", "-A");
  git(wt, "commit", "-qm", "feat(P001/T01): complete");
  assert.equal(git(wt, "status", "--porcelain"), "", "훅 check는 로그를 바꾸지 않는다");
  const multi = gitRun(wt, ["commit", "--allow-empty", "-qm", "fix(P001/T01): valid (P001/T99)"]);
  assert.notEqual(multi.status, 0, "복수 태그를 모두 검사한다");
  const reversed = gitRun(wt, ["commit", "--allow-empty", "-qm", "fix(P001/T00): invalid then valid (P001/T01)"]);
  assert.notEqual(reversed.status, 0, "마지막 태그만 검사해도 실패한다");
  git(main, "commit", "--allow-empty", "-qm", "docs(P001/T99): non-project branch");
});


test("commit gate: 사용자 훅·링크·외부 hooksPath 보존, PACE 훅만 갱신", () => {
  for (const kind of ["user", "link", "directory-link", "external", "relative", "legacy", "owned"]) {
    const { home, main } = repoFixture();
    assert.equal(runCli(home, main, "new", "훅 보존").status, 0);
    const hookDir = join(main, ".git", "hooks");
    const hook = join(hookDir, "commit-msg");
    const outside = join(home, "outside");
    write(outside, "#!/bin/sh\nexit 0\n"); chmodSync(outside, 0o755);
    if (kind === "user") write(hook, "#!/bin/sh\n# user hook\nexit 0\n");
    if (kind === "link") symlinkSync(outside, hook);
    if (kind === "directory-link") {
      rmSync(hookDir, { recursive: true });
      mkdirSync(join(home, "outside-hooks"));
      symlinkSync(join(home, "outside-hooks"), hookDir);
    }
    if (kind === "external") git(main, "config", "core.hooksPath", join(home, "custom-hooks"));
    if (kind === "relative") git(main, "config", "core.hooksPath", ".git/hooks");
    if (kind === "legacy") write(hook, "#!/bin/sh\n# OTHER commit gate v1\n# legacy\n");
    if (kind === "owned") write(hook, "#!/bin/sh\n# PACE commit gate v1\n# stale\n");
    const started = runCli(home, main, "start", "P001");
    assert.equal(started.status, 0, started.stderr);
    if (kind !== "owned") assert.match(started.stderr, /훅 설치 생략/);
    if (kind === "user") assert.equal(readFileSync(hook, "utf8"), "#!/bin/sh\n# user hook\nexit 0\n");
    if (kind === "legacy") assert.equal(readFileSync(hook, "utf8"), "#!/bin/sh\n# OTHER commit gate v1\n# legacy\n");
    if (kind === "link") assert.ok(lstatSync(hook).isSymbolicLink());
    if (kind === "directory-link") assert.equal(existsSync(join(home, "outside-hooks", "commit-msg")), false);
    if (kind === "external") assert.equal(existsSync(join(home, "custom-hooks")), false);
    if (kind === "relative") {
      assert.match(started.stderr, /상대 hooksPath/);
      assert.equal(git(main, "config", "--get", "core.hooksPath"), ".git/hooks");
      assert.equal(existsSync(hook), false);
    }
    if (kind === "owned") {
      assert.doesNotMatch(readFileSync(hook, "utf8"), /stale/);
      if (process.platform !== "win32") assert.ok((lstatSync(hook).mode & 0o111) !== 0);
    }
    assert.equal(readFileSync(outside, "utf8"), "#!/bin/sh\nexit 0\n");
  }
});

test("commit gate: pace 부재는 경고 후 커밋 허용", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "pace 부재").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const tools = join(home, "tools-without-pace"); mkdirSync(tools);
  let cleanPath = tools;
  if (process.platform === "win32") {
    const found = spawnSync("where.exe", ["git"], { encoding: "utf8" });
    assert.equal(found.status, 0, found.stderr);
    const gitPath = found.stdout.trim().split(/\r?\n/)[0]!;
    const execPath = spawnSync(gitPath, ["--exec-path"], { encoding: "utf8" });
    assert.equal(execPath.status, 0, execPath.stderr);
    const shellDir = join(resolve(execPath.stdout.trim(), "../../.."), "usr", "bin");
    assert.ok(existsSync(join(shellDir, "sh.exe")), "Git의 훅 실행 셸이 있어야 한다");
    for (const dir of [dirname(gitPath), shellDir]) for (const name of ["pace", "pace.exe", "pace.cmd", "pace.bat"]) {
      assert.ok(!existsSync(join(dir, name)), "시험 경로에 pace가 없어야 한다");
    }
    cleanPath = [dirname(gitPath), shellDir].join(delimiter);
  } else for (const name of ["git", "grep", "sort", "tr", "cut"]) {
    const path = spawnSync("which", [name], { encoding: "utf8" }).stdout.trim();
    symlinkSync(path, join(tools, name));
  }
  const wt = join(dirname(main), "app.wt", "P001");
  // Git for Windows adds $HOME/bin to the hook PATH even when PATH is clean.
  const result = gitRun(wt, ["commit", "--allow-empty", "-qm", "feat(P001/T99): missing pace"], { PATH: cleanPath, HOME: tools });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stderr, /pace를 찾지 못해.*건너뜀/);
});

test("finish: 완료 태스크의 태그 커밋 누락 차단, 태그 커밋 후 통과", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "커밋 존재").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | commit | CLI |"));
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  assert.equal(runCli(home, wt, "task", "P001", "작업").status, 0);
  passTask(join(projectDir(wt), "tasks", "T01_작업"));
  assert.equal(runCli(home, wt, "done", "P001", "T01").status, 0);
  write(join(projectDir(wt), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 변경 없음 |\n## 지표\n[집계](METRICS.md)\n작업 시간을 확인했다.\n");
  git(wt, "add", "-A"); git(wt, "commit", "-qm", "docs: 태그 없는 완료");
  const rejected = runCli(home, wt, "finish", "P001");
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /T01: 태스크 커밋이 없다.*P001\/T01/);
  assert.match(readFileSync(join(projectDir(wt), "PROJECT.md"), "utf8"), /- 상태: 진행/);
  git(wt, "checkout", "-qb", "unrelated-task-tag");
  git(wt, "commit", "--allow-empty", "-qm", "feat(P001/T01): 다른 브랜치에만 있는 태그");
  git(wt, "checkout", "project/P001");
  const unrelated = runCli(home, wt, "finish", "P001");
  assert.equal(unrelated.status, 1, "HEAD의 조상이 아닌 태그는 인정하지 않는다");
  assert.match(unrelated.stdout, /T01: 태스크 커밋이 없다/);
  git(wt, "commit", "--allow-empty", "-qm", "feat(P001/T01): 태그 커밋");
  const accepted = runCli(home, wt, "finish", "P001");
  assert.equal(accepted.status, 0, accepted.stderr + accepted.stdout);
});

test("finish: main에 선반영된 HEAD 조상의 태스크 커밋을 인정한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "선반영 커밋").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | commit | CLI |"));
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  assert.equal(runCli(home, wt, "task", "P001", "작업").status, 0);
  passTask(join(projectDir(wt), "tasks", "T01_작업"));
  assert.equal(runCli(home, wt, "done", "P001", "T01").status, 0);
  git(wt, "add", "-A");
  git(wt, "commit", "-qm", "feat(P001/T01): 승인된 구현 선반영");
  git(main, "merge", "--ff-only", "project/P001");
  assert.equal(git(wt, "log", "--format=%h", "main..HEAD"), "");
  write(join(projectDir(wt), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 변경 없음 |\n## 지표\n[집계](METRICS.md)\n작업 시간을 확인했다.\n");
  const finished = runCli(home, wt, "finish", "P001");
  assert.equal(finished.status, 0, finished.stderr + finished.stdout);
  assert.match(readFileSync(join(projectDir(wt), "PROJECT.md"), "utf8"), /- 상태: 병합 대기/);
});

test("start는 비활성 대시보드의 미리 스테이징된 초안을 커밋하지 않는다", () => {
  const { home, main } = repoFixture();
  const dashboard = join(main, "backlogs/dashboard/data.js");
  write(dashboard, "original\n");
  git(main, "add", "-A"); git(main, "commit", "-qm", "대시보드 없음");
  assert.equal(runCli(home, main, "new", "초안 보존").status, 0);
  writeFileSync(dashboard, "STAGED_USER_DRAFT\n"); git(main, "add", "backlogs/dashboard/data.js");
  const started = runCli(home, main, "start", "P001");
  assert.equal(started.status, 0, started.stdout + started.stderr);
  assert.equal(git(main, "show", "HEAD:backlogs/dashboard/data.js"), "original");
  assert.equal(git(main, "show", ":backlogs/dashboard/data.js"), "STAGED_USER_DRAFT");
});

test("P025 실패 복구: index에만 있는 BACKLOG 초안을 보존한다", () => {
  const { home, main } = repoFixture();
  const path = join(main, "backlogs/BL261108_01_실패/BACKLOG.md");
  const original = "# 백로그\n- 상태: 대기\n";
  write(path, original); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "실패", "--from", "BL261108_01").status, 0);
  writeFileSync(path, original + "STAGED_DRAFT\n"); git(main, "add", path); writeFileSync(path, original);
  const staged = git(main, "show", ":backlogs/BL261108_01_실패/BACKLOG.md");
  assert.equal(runCli(home, main, "start", "P001").status, 1);
  assert.equal(git(main, "show", ":backlogs/BL261108_01_실패/BACKLOG.md"), staged);
  assert.equal(readFileSync(path, "utf8"), original);
});

test("P025 실패 복구: 활성 dashboard 경로 오류는 start 성공을 막는다", () => {
  const { home, main } = repoFixture();
  const path = join(main, "backlogs/BL261108_01_실패/BACKLOG.md");
  write(path, "# 백로그\n- 상태: 대기\n");
  write(join(main, "backlogs/README.html"), "dashboard");
  const outside = join(home, "outside"); write(outside, "EXTERNAL");
  mkdirSync(join(main, "backlogs/dashboard"), { recursive: true });
  symlinkSync(outside, join(main, "backlogs/dashboard/data.js"));
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "실패", "--from", "BL261108_01").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 1);
  assert.equal(readFileSync(path, "utf8"), "# 백로그\n- 상태: 대기\n");
  assert.equal(readFileSync(outside, "utf8"), "EXTERNAL");
});

test("P025 실패 복구: 동기화 커밋 실패 후 start 재시도는 양쪽 상태를 맞춘다", () => {
  const { home, main } = repoFixture();
  const path = join(main, "backlogs/BL261108_01_실패/BACKLOG.md");
  write(path, "# 백로그\n- 상태: 대기\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "실패", "--from", "BL261108_01").status, 0);
  const hook = join(main, ".git/hooks/commit-msg");
  write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"백로그와 대시보드 갱신"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  assert.equal(runCli(home, main, "start", "P001").status, 1);
  write(hook, "#!/bin/sh\nexit 0\n");
  const retry = runCli(home, main, "start", "P001");
  assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  const wt = join(dirname(main), "app.wt/P001");
  assert.equal(readFileSync(path, "utf8"), "# 백로그\n- 상태: 진행\n");
  assert.equal(readFileSync(join(wt, "backlogs/BL261108_01_실패/BACKLOG.md"), "utf8"), readFileSync(path, "utf8"));
});

test("P025 실패 복구: 직접 finish 최종 커밋 실패는 거짓 완료를 남기지 않는다", () => {
  const { home, main } = repoFixture();
  const path = join(main, "backlogs/BL261108_01_실패/BACKLOG.md");
  write(path, "# 백로그\n- 상태: 대기\n");
  write(join(main, "backlogs/README.html"), "dashboard"); write(join(main, "backlogs/dashboard/data.js"), "old");
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "실패", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  git(main, "add", "-A"); git(main, "commit", "-qm", "프로젝트");
  const before = [path, project, join(main, "backlogs/dashboard/data.js")].map((p) => readFileSync(p, "utf8"));
  const hook = join(main, ".git/hooks/commit-msg"); write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"마감"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  const result = runCli(home, main, "finish", "P001");
  assert.equal(result.status, 1);
  assert.deepEqual([path, project, join(main, "backlogs/dashboard/data.js")].map((p) => readFileSync(p, "utf8")), before);
  assert.equal(git(main, "diff", "--cached", "--name-only"), "");
});

test("P025 실패 복구: main 직접 finish는 범위 밖 초안을 거부한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "실패").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  write(join(main, "draft.txt"), "PRIVATE_DRAFT");
  assert.equal(runCli(home, main, "finish", "P001").status, 1);
  assert.equal(readFileSync(join(main, "draft.txt"), "utf8"), "PRIVATE_DRAFT");
  assert.equal(git(main, "log", "--format=%s"), "init");
});

test("P025 실패 복구: 준비 실패 후 고친 설정으로 재시도한다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_실패/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n");
  const docs = join(main, "docs/README.md");
  writeFileSync(docs, readFileSync(docs, "utf8") + "- worktree 준비: `false`\n");
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "실패", "--from", "BL261108_01").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 1);
  assert.match(readFileSync(bl, "utf8"), /상태: 대기/);
  writeFileSync(docs, readFileSync(docs, "utf8").replace("`false`", "`true`"));
  git(main, "add", "docs/README.md"); git(main, "commit", "-qm", "준비 수정");
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /작업자 세션:|직접 열기/);
  assert.match(readFileSync(bl, "utf8"), /상태: 진행/);
  assert.equal(readFileSync(join(dirname(main), "app.wt/P001/backlogs/BL261108_01_실패/BACKLOG.md"), "utf8"), readFileSync(bl, "utf8"));
});

test("P025 실패 복구: fast-forward 실패를 알리고 재시도한다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_실패/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "실패", "--from", "BL261108_01").status, 0);
  const preload = fakeGitFailure(home, `args.includes('merge') && args.includes('--ff-only')`);
  const failed = runPace(["project", "start", "P001"], { home, cwd: main, env: { NODE_OPTIONS: preload }, timeout: 60_000 });
  assert.equal(failed.status, 1, failed.stdout + failed.stderr);
  assert.match(failed.stderr, /재시도/);
  assert.match(readFileSync(bl, "utf8"), /상태: 진행/);
  const wtBl = join(dirname(main), "app.wt/P001/backlogs/BL261108_01_실패/BACKLOG.md");
  assert.match(readFileSync(wtBl, "utf8"), /상태: 대기/);
  const retried = runCli(home, main, "start", "P001");
  assert.equal(retried.status, 0, retried.stdout + retried.stderr);
  assert.equal(readFileSync(wtBl, "utf8"), readFileSync(bl, "utf8"));
});

test("P025 실패 복구: 다른 백로그의 staged 초안은 대시보드에 넣지 않는다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_실패/BACKLOG.md");
  const other = join(main, "backlogs/BL261108_02_초안/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); write(other, "# 초안\n- 상태: 대기\n");
  write(join(main, "backlogs/README.html"), "dashboard"); write(join(main, "backlogs/dashboard/data.js"), "old");
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "실패", "--from", "BL261108_01").status, 0);
  writeFileSync(other, "# PRIVATE_STAGED_DRAFT\n- 상태: 대기\n"); git(main, "add", other);
  const before = git(main, "show", ":backlogs/BL261108_02_초안/BACKLOG.md");
  assert.equal(runCli(home, main, "start", "P001").status, 1);
  assert.equal(git(main, "show", ":backlogs/BL261108_02_초안/BACKLOG.md"), before);
  assert.match(readFileSync(bl, "utf8"), /상태: 대기/);
  assert.doesNotMatch(git(main, "show", "HEAD:backlogs/dashboard/data.js"), /PRIVATE_STAGED_DRAFT/);
});

test("P025 실패 복구: 보류 백로그는 시작과 완료에서 유지된다", () => {
  for (const action of ["start", "finish"]) {
    const { home, main } = repoFixture();
    const path = join(main, "backlogs/BL261108_01_보류/BACKLOG.md");
    write(path, "# 백로그\n- 상태: 보류 (사유)\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
    assert.equal(runCli(home, main, "new", "보류", "--from", "BL261108_01").status, 0);
    const result = runCli(home, main, action, "P001");
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /보류/);
    assert.equal(readFileSync(path, "utf8"), "# 백로그\n- 상태: 보류 (사유)\n");
  }
});

test("P025 실패 복구: BL 기존 브랜치는 안전한 조상인 경우 복구한다", () => {
  const { home, main } = repoFixture();
  const path = join(main, "backlogs/BL261108_01_복구/BACKLOG.md");
  write(path, "# 백로그\n- 상태: 대기\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "복구", "--from", "BL261108_01").status, 0);
  const hook = join(main, ".git/hooks/commit-msg");
  write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"백로그와 대시보드 갱신"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  assert.equal(runCli(home, main, "start", "P001").status, 1);
  const wt = join(dirname(main), "app.wt/P001");
  git(main, "worktree", "remove", "--force", wt);
  write(hook, "#!/bin/sh\nexit 0\n");
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(wt, "backlogs/BL261108_01_복구/BACKLOG.md"), "utf8"), readFileSync(path, "utf8"));
  assert.match(readFileSync(path, "utf8"), /상태: 진행/);
});

test("P025 실패 복구: 비main 브랜치 직접 finish는 거부한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "실패").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  const close = join(projectDir(main), "PROJECT-CLOSE.md");
  write(close, "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  git(main, "add", "-A"); git(main, "commit", "-qm", "완료 가능한 정의");
  git(main, "checkout", "-qb", "feature/unrelated");
  const before = [git(main, "rev-parse", "HEAD"), git(main, "diff", "--cached", "--name-only"), readFileSync(project, "utf8"), readFileSync(close, "utf8")];
  const result = runCli(home, main, "finish", "P001");
  assert.equal(result.status, 1);
  assert.deepEqual([git(main, "rev-parse", "HEAD"), git(main, "diff", "--cached", "--name-only"), readFileSync(project, "utf8"), readFileSync(close, "utf8")], before);
});

test("P025 실패 복구: 동기화된 기존 BL worktree의 추가 커밋을 보존한다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_복구/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "복구", "--from", "BL261108_01").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt/P001");
  write(join(wt, "추가.txt"), "작업 중\n"); git(wt, "add", "-A"); git(wt, "commit", "-qm", "작업");
  const head = git(wt, "rev-parse", "HEAD");
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(wt, "rev-parse", "HEAD"), head);
});

test("P025 실패 복구: 활성 dashboard 오류면 직접 finish도 완료하지 않는다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_오류/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); write(join(main, "backlogs/README.html"), "dashboard");
  const external = join(home, "external-data"); write(external, "EXTERNAL");
  mkdirSync(join(main, "backlogs/dashboard"), { recursive: true }); symlinkSync(external, join(main, "backlogs/dashboard/data.js"));
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "오류", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  const before = readFileSync(project, "utf8");
  assert.equal(runCli(home, main, "finish", "P001").status, 1);
  assert.equal(readFileSync(bl, "utf8"), "# 백로그\n- 상태: 대기\n");
  assert.equal(readFileSync(project, "utf8"), before);
  assert.equal(readFileSync(external, "utf8"), "EXTERNAL");
});

test("P025 실패 복구: 보류 태스크의 BR은 전체 완료에서도 보류로 남는다", () => {
  const { home, main } = repoFixture();
  const folder = join(main, "backlogs/BL261108_01_보류");
  const bl = join(folder, "BACKLOG.md"); const br = join(folder, "BR01_보류.md");
  write(bl, "# 백로그\n- 상태: 진행\n\n## 진행 현황\n\n| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |\n|---|---|---|---|---|\n| [BR01 보류](BR01_보류.md) | 보류 | — | — | |\n");
  write(br, "# BR01 보류\n- 상태: 보류\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "보류", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |").replace("| T01 | 보류 | 대기 | |", "| T01 | 보류 | 보류 | |"));
  write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  git(main, "rm", br); git(main, "commit", "-qm", "브리프 누락 재현");
  const missing = runCli(home, main, "finish", "P001");
  assert.equal(missing.status, 1, missing.stdout + missing.stderr);
  assert.match(readFileSync(bl, "utf8"), /상태: 진행/);
  writeFileSync(br, "# BR01 보류\n- 상태: 진행\n");
  git(main, "add", br); git(main, "commit", "-qm", "불일치 재현");
  const mismatch = runCli(home, main, "finish", "P001");
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stdout, /BR01.*일치하지 않는다/);
  assert.match(readFileSync(bl, "utf8"), /상태: 진행/);
  writeFileSync(br, "# BR01 보류\n- 상태: 보류\n");
  git(main, "add", br); git(main, "commit", "-qm", "보류 복구");
  const result = runCli(home, main, "finish", "P001");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(readFileSync(bl, "utf8"), /상태: 완료/);
  assert.equal(readFileSync(br, "utf8"), "# BR01 보류\n- 상태: 보류\n");
  assert.match(readFileSync(bl, "utf8"), /BR01_보류.md\) \| 보류 \|/);
});

test("P025 실패 복구: 병합 최종 커밋 거부는 FF 뒤 진행 상태를 복원한다", () => {
  for (const branchOnly of [false, true]) {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_병합/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); write(join(main, "backlogs/README.html"), "dashboard"); write(join(main, "backlogs/dashboard/data.js"), "old");
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "병합", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt/P001");
  write(join(projectDir(wt), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  const finish = runCli(home, wt, "finish", "P001"); assert.equal(finish.status, 0, finish.stdout + finish.stderr);
  const wtHead = git(wt, "rev-parse", "HEAD");
  if (branchOnly) git(main, "worktree", "remove", wt);
  const hook = join(main, ".git/hooks/commit-msg"); write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"병합 완료"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  const result = runCli(home, main, "merge", "P001", "--yes");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /fast-forward는 완료/);
  assert.equal(git(main, "rev-parse", "HEAD"), wtHead);
  assert.match(readFileSync(bl, "utf8"), /상태: 진행/);
  assert.match(readFileSync(join(projectDir(main), "PROJECT.md"), "utf8"), /상태: 병합 대기/);
  assert.equal(git(main, "diff", "--cached", "--name-only"), "");
  assert.match(result.stderr, /pace project finish P001/);
  write(hook, "#!/bin/sh\nexit 0\n");
  if (branchOnly) {
    const log = join(projectDir(main), "log.jsonl"); git(main, "add", log); git(main, "commit", "-qm", "실패 기록 보존");
    assert.match(result.stderr, /pace project start P001 --no-launch/);
    assert.match(result.stderr, /병합 대기 상태는 유지.*착수 결정 사건/);
    const decisionCount = readFileSync(log, "utf8").split("착수 결정 — 출처에 따라 바로 수행").length;
    const startCount = readFileSync(log, "utf8").split('"type":"start"').length;
    const restarted = runCli(home, main, "start", "P001", "--no-launch"); assert.equal(restarted.status, 0, restarted.stdout + restarted.stderr);
    assert.match(restarted.stdout, /--no-launch/);
    assert.match(readFileSync(join(projectDir(wt), "PROJECT.md"), "utf8"), /상태: 병합 대기/);
    assert.equal(readFileSync(join(projectDir(wt), "log.jsonl"), "utf8").split("착수 결정 — 출처에 따라 바로 수행").length, decisionCount + 1);
    assert.equal(readFileSync(join(projectDir(wt), "log.jsonl"), "utf8").split('"type":"start"').length, startCount + 1);
  }
  const recovered = runCli(home, wt, "finish", "P001"); assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
  const merged = runCli(home, main, "merge", "P001", "--yes"); assert.equal(merged.status, 0, merged.stdout + merged.stderr);
  const payload = JSON.parse(/^window\.PACE_DATA = (.+);$/m.exec(readFileSync(join(main, "backlogs/dashboard/data.js"), "utf8"))![1]!) as { files: Record<string, string> };
  assert.equal(payload.files["backlogs/BL261108_01_병합/BACKLOG.md"], readFileSync(bl, "utf8"));
  assert.match(readFileSync(bl, "utf8"), /상태: 완료/);  }
});

test("P025 실패 복구: BL 브리프를 프로젝트 출처로 위장하면 시작하지 않는다", () => {
  const { home, main } = repoFixture();
  const folder = join(main, "backlogs/BL261108_01_출처");
  const bl = join(folder, "BACKLOG.md"); const br = join(folder, "BR01_작업.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); write(br, "# BR01 작업\n- 상태: 대기\n");
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "출처", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace("BACKLOG.md)", "BR01_작업.md)"));
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(readFileSync(bl, "utf8"), "# 백로그\n- 상태: 대기\n");
});

test("P025 실패 복구: 시작 시 프로젝트 부분 스테이징 초안을 보존한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "부분 초안").status, 0);
  const file = join(projectDir(main), "PROJECT.md");
  git(main, "add", "projects"); git(main, "commit", "-qm", "프로젝트");
  const original = readFileSync(file, "utf8");
  writeFileSync(file, original + "STAGED_PROJECT_DRAFT\n"); git(main, "add", file); writeFileSync(file, original);
  const rel = `projects/${basename(projectDir(main))}/PROJECT.md`;
  const staged = git(main, "show", `:${rel}`);
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(git(main, "show", `:${rel}`), staged);
  assert.equal(readFileSync(file, "utf8"), original);
});

test("P025 실패 복구: 직접 finish 첫 커밋 실패도 프로젝트 인덱스를 복원한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "실패").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  const close = join(projectDir(main), "PROJECT-CLOSE.md");
  write(close, "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  const hook = join(main, ".git/hooks/commit-msg"); write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"목차 갱신"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  const before = git(main, "diff", "--cached", "--name-only");
  assert.equal(runCli(home, main, "finish", "P001").status, 1);
  assert.equal(git(main, "diff", "--cached", "--name-only"), before);
  assert.ok(existsSync(close));
});

test("P025 실패 복구: 프로젝트 바이너리와 파일 권한을 정확히 보존한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "실패").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  const binary = join(projectDir(main), "sample.bin");
  const bytes = Buffer.from([0, 255, 128, 65]); writeFileSync(binary, bytes); chmodSync(binary, 0o700);
  const hook = join(main, ".git/hooks/commit-msg"); write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"목차 갱신"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  assert.equal(runCli(home, main, "finish", "P001").status, 1);
  assert.deepEqual(readFileSync(binary), bytes);
  if (process.platform !== "win32") assert.equal(lstatSync(binary).mode & 0o777, 0o700);
  assert.equal(git(main, "diff", "--cached", "--name-only"), "");
});

test("P025 실패 복구: start 첫 커밋 실패도 프로젝트 상태와 인덱스를 복원한다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "실패").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  const original = readFileSync(project, "utf8");
  const hook = join(main, ".git/hooks/commit-msg"); write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"정의 — 착수"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  const before = git(main, "diff", "--cached", "--name-only");
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 1);
  assert.equal(readFileSync(project, "utf8"), original);
  assert.equal(git(main, "diff", "--cached", "--name-only"), before);
});

test("P025 v2: 분기된 동기화 worktree는 start와 launch로 재개한다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_분기/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "분기", "--from", "BL261108_01").status, 0);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt/P001");
  write(join(wt, "작업.txt"), "작업"); git(wt, "add", "-A"); git(wt, "commit", "-qm", "작업");
  write(join(main, "별도.txt"), "별도"); git(main, "add", "별도.txt"); git(main, "commit", "-qm", "별도");
  const before = [git(main, "rev-parse", "HEAD"), git(wt, "rev-parse", "HEAD")];
  for (const args of [["start", "P001"], ["start", "P001", "--launch"]]) {
    const result = runCli(home, main, ...args);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual([git(main, "rev-parse", "HEAD"), git(wt, "rev-parse", "HEAD")], before);
  }
});

test("P025 v2: 직접 finish 중간 커밋 뒤 최종 실패는 삭제 staged 없이 재시도한다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs/BL261108_01_중간/BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n"); write(join(main, "backlogs/README.html"), "dashboard"); write(join(main, "backlogs/dashboard/data.js"), "old");
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "중간", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
  write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  const hook = join(main, ".git/hooks/commit-msg"); write(hook, '#!/bin/sh\ncase "$(cat "$1")" in *"마감"*) exit 1;; esac\nexit 0\n'); chmodSync(hook, 0o755);
  const failed = runCli(home, main, "finish", "P001"); assert.equal(failed.status, 1);
  assert.equal(git(main, "diff", "--cached", "--diff-filter=D", "--name-only"), "");
  write(hook, "#!/bin/sh\nexit 0\n");
  const retry = runCli(home, main, "finish", "P001"); assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  assert.match(readFileSync(bl, "utf8"), /상태: 완료/);
});

test("P025 v2: 다른 BR이 있어도 누락된 BR은 완료를 막는다", () => {
  const { home, main } = repoFixture();
  const folder = join(main, "backlogs/BL261108_01_누락");
  const bl = join(folder, "BACKLOG.md"); const br1 = join(folder, "BR01_하나.md");
  write(bl, "# 백로그\n- 상태: 진행\n\n## 진행 현황\n\n| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |\n|---|---|---|---|---|\n| [BR01 하나](BR01_하나.md) | 보류 | — | — | |\n| [BR02 둘](BR02_둘.md) | 보류 | — | — | |\n");
  write(br1, "# BR01 하나\n- 상태: 보류\n"); write(join(folder, "BR02_둘.md"), "# BR02 둘\n- 상태: 보류\n");
  git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
  assert.equal(runCli(home, main, "new", "누락", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |").replace("| T01 | 하나 | 대기 | |", "| T01 | 하나 | 보류 | |").replace("| T02 | 둘 | 대기 | |", "| T02 | 둘 | 보류 | |"));
  write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
  git(main, "rm", br1); git(main, "commit", "-qm", "누락 재현");
  const head = git(main, "rev-parse", "HEAD"); const before = readFileSync(bl, "utf8");
  const result = runCli(home, main, "finish", "P001");
  assert.equal(result.status, 1); assert.match(result.stdout, /BR01.*없거나 중복/);
  assert.match(result.stdout, /같은 번호 BR.*번호가 다르거나 충돌하면 중단.*완료 BL에는 추가하지 않는다/);
  assert.equal(readFileSync(bl, "utf8"), before); assert.equal(git(main, "rev-parse", "HEAD"), head);
});

test("P025 v2: 병합 기록 EIO는 소유 임시 파일을 정리하고 복구 명령으로 완료한다", () => {
  for (const mode of ["metrics", "dashboard"]) for (const branchOnly of [false, true]) {
    const { home, main } = repoFixture();
    const bl = join(main, "backlogs/BL261108_01_EIO/BACKLOG.md");
    write(bl, "# 백로그\n- 상태: 대기\n"); write(join(main, "backlogs/README.html"), "dashboard"); write(join(main, "backlogs/dashboard/data.js"), "old");
    git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
    assert.equal(runCli(home, main, "new", "EIO", "--from", "BL261108_01").status, 0);
    const project = join(projectDir(main), "PROJECT.md");
    writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
    assert.equal(runCli(home, main, "start", "P001").status, 0);
    const wt = join(dirname(main), "app.wt/P001");
    write(join(projectDir(wt), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
    const ready = runCli(home, wt, "finish", "P001"); assert.equal(ready.status, 0, ready.stdout + ready.stderr);
    if (branchOnly) git(main, "worktree", "remove", wt);
    const injection = join(home, "fault.mjs");
    write(injection, `import fs from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nconst original = fs.renameSync; let fired = false;\nfs.renameSync = function(src, dest) {\n const complete = (() => { try { return fs.readFileSync(process.env.P025_FAULT_BACKLOG, 'utf8').includes('- 상태: 완료'); } catch { return false; } })();\n const matches = process.env.P025_FAULT_MODE === 'metrics' ? String(dest).endsWith('METRICS.md') : String(dest).endsWith('data.js') && complete;\n if (!fired && matches) { fired = true; const error = new Error('P025_INJECTED_EIO'); error.code = 'EIO'; throw error; }\n return original.call(this, src, dest);\n};\nsyncBuiltinESMExports();\n`);
    const failed = runPace(["project", "merge", "P001", "--yes"], { home, cwd: main, timeout: 60_000, env: { NODE_OPTIONS: `--import=${pathToFileURL(injection).href}`, P025_FAULT_MODE: mode, P025_FAULT_BACKLOG: bl } });
    assert.equal(failed.status, 1, failed.stdout + failed.stderr); assert.match(failed.stderr, /P025_INJECTED_EIO/);
    assert.match(failed.stderr, /pace project finish P001/); assert.match(readFileSync(bl, "utf8"), /상태: 진행/);
    assert.deepEqual(readdirSync(projectDir(main)).filter((n) => /^\.[0-9a-f]{12}\.tmp$/.test(n)), []);
    assert.deepEqual(readdirSync(join(main, "projects")).filter((n) => /^\.[0-9a-f]{12}\.tmp$/.test(n)), []);
    if (branchOnly) {
      const log = join(projectDir(main), "log.jsonl"); git(main, "add", log); git(main, "commit", "-qm", "실패 기록 보존");
      const restarted = runCli(home, main, "start", "P001"); assert.equal(restarted.status, 0, restarted.stdout + restarted.stderr);
    }
    const recovered = runCli(home, wt, "finish", "P001"); assert.equal(recovered.status, 0, recovered.stdout + recovered.stderr);
    const merged = runCli(home, main, "merge", "P001", "--yes"); assert.equal(merged.status, 0, merged.stdout + merged.stderr);
    const data = JSON.parse(/^window\.PACE_DATA = (.+);$/m.exec(readFileSync(join(main, "backlogs/dashboard/data.js"), "utf8"))![1]!) as { files: Record<string, string> };
    assert.equal(data.files["backlogs/BL261108_01_EIO/BACKLOG.md"], readFileSync(bl, "utf8"));
    assert.match(readFileSync(bl, "utf8"), /상태: 완료/);
  }
});

test("P025 v2: BR·태스크·현황의 중복 번호를 거부한다", () => {
  for (const kind of ["brief", "task", "row"]) {
    const { home, main } = repoFixture();
    const folder = join(main, "backlogs/BL261108_01_중복"); const bl = join(folder, "BACKLOG.md");
    const row = "| [BR01 하나](BR01_하나.md) | 보류 | — | — | |\n";
    write(bl, "# 백로그\n- 상태: 진행\n\n## 진행 현황\n\n| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |\n|---|---|---|---|---|\n" + row);
    write(join(folder, "BR01_하나.md"), "# BR01 하나\n- 상태: 보류\n"); git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
    assert.equal(runCli(home, main, "new", "중복", "--from", "BL261108_01").status, 0);
    const project = join(projectDir(main), "PROJECT.md");
    let content = readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |").replace("| T01 | 하나 | 대기 | |", "| T01 | 하나 | 보류 | |");
    if (kind === "task") content = content.replace("| T01 | 하나 | 보류 | |", "| T01 | 하나 | 보류 | |\n| T01 | 중복 | 보류 | |");
    writeFileSync(project, content);
    if (kind === "row") writeFileSync(bl, readFileSync(bl, "utf8") + row);
    if (kind === "brief") write(join(folder, "BR01_중복.md"), "# 중복\n- 상태: 보류\n");
    if (kind !== "task") { git(main, "add", "backlogs"); git(main, "commit", "-qm", "중복 재현"); }
    write(join(projectDir(main), "PROJECT-CLOSE.md"), "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
    const head = git(main, "rev-parse", "HEAD"); const before = readFileSync(bl, "utf8");
    const result = runCli(home, main, "finish", "P001");
    assert.equal(result.status, 1); assert.match(result.stdout + result.stderr, /중복/);
    assert.equal(readFileSync(bl, "utf8"), before); assert.equal(git(main, "rev-parse", "HEAD"), head);
  }
});

test("BL 생명주기 start는 전체 상태를 진행으로 기록한다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs", "BL261108_01_생명주기");
  write(join(bl, "BACKLOG.md"), "# 백로그\r\n- 상태: 대기 (메모)\r\n");
  git(main, "add", "backlogs"); git(main, "commit", "-qm", "백로그");
  assert.equal(runCli(home, main, "new", "생명주기", "--from", "BL261108_01").status, 0);
  const result = runCli(home, main, "start", "P001");
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(readFileSync(join(bl, "BACKLOG.md"), "utf8"), "# 백로그\r\n- 상태: 진행 (메모)\r\n");
  const wt = join(dirname(main), "app.wt", "P001");
  assert.equal(readFileSync(join(wt, "backlogs", basename(bl), "BACKLOG.md"), "utf8"), "# 백로그\r\n- 상태: 진행 (메모)\r\n");
});

test("BL 출처는 슬래시로 기록하고 기존 Windows 백슬래시 링크도 읽는다", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs", "BL261108_01_이전_링크", "BACKLOG.md");
  write(bl, "# 백로그\n- 상태: 대기\n");
  git(main, "add", "backlogs"); git(main, "commit", "-qm", "백로그");
  assert.equal(runCli(home, main, "new", "이전 링크", "--from", "BL261108_01").status, 0);
  const project = join(projectDir(main), "PROJECT.md");
  const content = readFileSync(project, "utf8");
  assert.match(content, /\]\(\.\.\/\.\.\/backlogs\/BL261108_01_이전_링크\/BACKLOG\.md\)/);
  assert.match(content, /worktree: `\.\.\/app\.wt\/P001\//);
  writeFileSync(project, content.replace("../../backlogs/BL261108_01_이전_링크/BACKLOG.md", "..\\..\\backlogs\\BL261108_01_이전_링크\\BACKLOG.md"));
  const started = runCli(home, main, "start", "P001");
  assert.equal(started.status, 0, started.stderr + started.stdout);
  assert.match(readFileSync(bl, "utf8"), /상태: 진행/);
});

test("BL 생명주기: finish와 실제 merge에서만 완료하며 미리보기는 변경하지 않는다", () => {
  for (const mode of ["worktree", "branch-only", "direct"]) {
    const direct = mode === "direct";
    const { home, main } = repoFixture();
    const bl = join(main, "backlogs", "BL261108_01_생명주기");
    write(join(bl, "BACKLOG.md"), "# 백로그\n- 상태: 대기\n");
    write(join(main, "backlogs/README.html"), "dashboard");
    write(join(main, "backlogs/dashboard/data.js"), "old");
    git(main, "add", "-A"); git(main, "commit", "-qm", "백로그");
    assert.equal(runCli(home, main, "new", "생명주기", "--from", "BL261108_01").status, 0);
    const project = join(projectDir(main), "PROJECT.md");
    writeFileSync(project, readFileSync(project, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 결과 | CLI |"));
    if (!direct) assert.equal(runCli(home, main, "start", "P001").status, 0);
    const root = direct ? main : join(dirname(main), "app.wt", "P001");
    const close = join(projectDir(root), "PROJECT-CLOSE.md");
    write(close, "# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간 확인.\n");
    const finished = runCli(home, root, "finish", "P001");
    assert.equal(finished.status, 0, finished.stdout + finished.stderr);
    const overview = join(root, "backlogs", basename(bl), "BACKLOG.md");
    assert.match(readFileSync(overview, "utf8"), direct ? /상태: 완료/ : /상태: 진행/);
    if (!direct) {
      const before = readFileSync(join(bl, "BACKLOG.md"), "utf8");
      assert.equal(runCli(home, main, "merge", "P001").status, 0);
      assert.equal(readFileSync(join(bl, "BACKLOG.md"), "utf8"), before);
      if (mode === "branch-only") git(main, "worktree", "remove", root);
      const merged = runCli(home, main, "merge", "P001", "--yes");
      assert.equal(merged.status, 0, merged.stdout + merged.stderr);
      assert.match(readFileSync(join(bl, "BACKLOG.md"), "utf8"), /상태: 완료/);
    }
    const dashboard = readFileSync(join(main, "backlogs/dashboard/data.js"), "utf8");
    const payload = JSON.parse(/^window\.PACE_DATA = (.+);$/m.exec(dashboard)![1]!) as { files: Record<string, string> };
    assert.equal(payload.files[`backlogs/${basename(bl)}/BACKLOG.md`], readFileSync(join(bl, "BACKLOG.md"), "utf8"));
  }
});

test("BL 생명주기: 잘못된 상태와 시작 준비 실패는 원본 상태를 바꾸지 않는다", () => {
  for (const badState of [true, false]) {
    const { home, main } = repoFixture();
    const bl = join(main, "backlogs", "BL261108_01_생명주기");
    const original = badState ? "# 백로그\n- 상태: 미정\n" : "# 백로그\n- 상태: 대기\n";
    write(join(bl, "BACKLOG.md"), original);
    if (!badState) writeFileSync(join(main, "docs/README.md"), readFileSync(join(main, "docs/README.md"), "utf8") + "- worktree 준비: `false`\n");
    git(main, "add", "-A"); git(main, "commit", "-qm", "준비");
    assert.equal(runCli(home, main, "new", "생명주기", "--from", "BL261108_01").status, 0);
    const result = runCli(home, main, "start", "P001");
    assert.equal(result.status, 1);
    assert.equal(readFileSync(join(bl, "BACKLOG.md"), "utf8"), original);
  }
});

test("BL 출처: 같은 번호 태스크 생성·done BR/BACKLOG 동기화와 실패 무변경", () => {
  const { home, main } = repoFixture();
  const bl = join(main, "backlogs", "BL261025_01_알림");
  write(join(bl, "BACKLOG.md"), "# 알림\n\n- 상태: 진행\n\n## 진행 현황\n\n| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |\n|---|---|---|---|---|\n| [BR01 보내기](BR01_보내기.md) | 진행 | — | — | |\n| [BR03 받기](BR03_받기.md) | 대기 | 01 | — | |\n");
  write(join(bl, "BR01_보내기.md"), "# BR01 보내기\n\n- 상태: 진행 (실측)\n");
  write(join(bl, "BR03_받기.md"), "# BR03 받기\n\n- 상태: 대기\n");
  const invalid = runCli(home, main, "new", "파일 거부", "--from", join(bl, "BR01_보내기.md"));
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /브리프 파일/);
  assert.ok(!existsSync(join(main, "projects")), "실패 시 프로젝트 파일도 만들지 않는다");
  mkdirSync(join(main, "backlogs", "BL261025_01_중복"));
  assert.match(runCli(home, main, "new", "모호", "--from", "BL261025_01").stderr, /2개/);
  rmSync(join(main, "backlogs", "BL261025_01_중복"), { recursive: true });
  const outsideSource = tempDir();
  const outsideResult = runCli(home, main, "new", "외부", "--from", outsideSource);
  assert.equal(outsideResult.status, 1);
  assert.match(outsideResult.stderr, /밖/);
  assert.ok(!existsSync(join(main, "projects")));
  git(main, "add", "backlogs");
  git(main, "commit", "-qm", "백로그");
  const created = runCli(home, main, "new", "알림", "--from", "BL261025_01");
  assert.equal(created.status, 0, created.stderr);
  const p = projectDir(main);
  const initial = readFileSync(join(p, "PROJECT.md"), "utf8");
  assert.match(initial, /출처: .*BACKLOG\.md/);
  assert.match(initial, /^\| T01 \| 보내기 \| 대기 \| \|$/m);
  assert.match(initial, /^\| T03 \| 받기 \| 대기 \| \|$/m);
  assert.doesNotMatch(initial, /백로그 단계/);
  assert.equal(runCli(home, main, "start", "P001").status, 0);
  const wt = join(dirname(main), "app.wt", "P001");
  assert.equal(runCli(home, wt, "task", "P001", "보내기").status, 0);
  const task = join(projectDir(wt), "tasks", "T01_보내기");
  passTask(task);
  const br = join(wt, "backlogs", basename(bl), "BR01_보내기.md");
  const overview = join(wt, "backlogs", basename(bl), "BACKLOG.md");
  const original = readFileSync(overview, "utf8");
  writeFileSync(overview, original.replace("BR01 보내기", "BR02 보내기"));
  const projectPath = join(projectDir(wt), "PROJECT.md");
  const before = [projectPath, join(task, "TASK.md"), br, overview].map((f) => readFileSync(f, "utf8"));
  assert.equal(runCli(home, wt, "done", "P001", "T01").status, 1);
  assert.deepEqual([projectPath, join(task, "TASK.md"), br, overview].map((f) => readFileSync(f, "utf8")), before);
  writeFileSync(overview, original);
  // 개요·BR 파일이 누락되어도 태스크·프로젝트를 완료로 바꾸지 않는다.
  const projectOriginal = readFileSync(projectPath, "utf8");
  const taskOriginal = readFileSync(join(task, "TASK.md"), "utf8");
  writeFileSync(projectPath, projectOriginal.replace("/BACKLOG.md)", "/)"));
  rmSync(overview);
  const folderSource = readFileSync(projectPath, "utf8");
  assert.equal(runCli(home, wt, "done", "P001", "T01").status, 1);
  assert.equal(readFileSync(projectPath, "utf8"), folderSource);
  assert.equal(readFileSync(join(task, "TASK.md"), "utf8"), taskOriginal);
  writeFileSync(overview, original);
  writeFileSync(projectPath, projectOriginal);
  const briefOriginal = readFileSync(br, "utf8");
  rmSync(br);
  const missingBrief = runCli(home, wt, "done", "P001", "T01");
  assert.equal(missingBrief.status, 1);
  assert.match(missingBrief.stderr, /main에서 같은 번호 BR.*번호가 다르거나 충돌하면 중단.*완료 BL에는 추가하지 않는다/);
  assert.equal(readFileSync(projectPath, "utf8"), projectOriginal);
  assert.equal(readFileSync(join(task, "TASK.md"), "utf8"), taskOriginal);
  writeFileSync(br, briefOriginal);
  writeFileSync(overview, original.replaceAll("\n", "\r\n"));
  const good = runCli(home, wt, "done", "P001", "T01");
  assert.equal(good.status, 0, good.stderr + good.stdout);
  assert.match(readFileSync(br, "utf8"), /상태: 완료 \(실측\)/);
  assert.match(readFileSync(overview, "utf8"), /BR01_보내기.md\) \| 완료 \|/);
  assert.match(readFileSync(overview, "utf8"), /BR03_받기.md\) \| 대기 \|/);
  assert.ok(!/(?<!\r)\n/.test(readFileSync(overview, "utf8")), "CRLF를 보존한다");
  assert.match(runCli(home, wt, "done", "P001", "T01").stdout, /바뀐 파일 없음/);
  // BR 파일의 외부 링크도 쓰기 전에 거부한다.
  const outside = join(tempDir(), "outside.md");
  writeFileSync(outside, "# BR01 보내기\n- 상태: 진행\n");
  rmSync(br);
  symlinkSync(outside, br);
  assert.equal(runCli(home, wt, "done", "P001", "T01").status, 1);
  assert.match(readFileSync(outside, "utf8"), /상태: 진행/);
});

test("새 태스크 이름의 백로그 단계 문구를 옛 표 헤더로 오인하지 않는다", () => {
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, "new", "이름 충돌").status, 0);
  assert.equal(runCli(home, main, "task", "P001", "백로그 단계 정리").status, 0);
  assert.match(runCli(home, main, "list").stdout, /T01 백로그 단계 정리/);
  assert.match(runCli(home, main, "task", "P001", "백로그 단계 정리").stderr, /이미 있다/);
  const task = join(projectDir(main), "tasks", "T01_백로그_단계_정리");
  passTask(task);
  assert.equal(runCli(home, main, "done", "P001", "T01").status, 0);
  assert.match(readFileSync(join(projectDir(main), "PROJECT.md"), "utf8"), /T01 \| 백로그 단계 정리 \| 완료/);
});

test("정본 반영: 바뀐 파일 대조 — 같은 파일·폴더 접두·glob", () => {
  const changed = ["skills/pace-memory/SKILL.md", "test/memory.test.ts", "src/a.b.ts"];
  assert.equal(canonTouched("test/memory.test.ts", changed), true);
  assert.equal(canonTouched("skills/pace-memory", changed), true, "폴더 접두");
  assert.equal(canonTouched("skills/pace-memory/**", changed), true, "** 여러 단계");
  assert.equal(canonTouched("test/memory*.ts", changed), true, "* 한 단계");
  assert.equal(canonTouched("test/*.ts", ["test/sub/x.ts"]), false, "*는 /를 넘지 않는다");
  assert.equal(canonTouched("skills/**/SKILL.md", changed), true);
  assert.equal(canonTouched("src/a?b.ts", ["src/axb.ts"]), false, "glob 아닌 정규식 문자는 글자 그대로");
  assert.equal(canonTouched("src/a*.ts", ["src/a.b.ts"]), true);
  assert.equal(canonTouched("skills/pace-brain/**", changed), false);
});

test('동시 프로젝트: 한쪽 병합 후 다른 쪽 finish는 생성 자료만 재생성하고 미추적 초안을 커밋하지 않는다', () => {
  const { home, main } = repoFixture();
  installDashboardFixture(main);
  const originalEntry = readFileSync(join(main, "backlogs/README.html"));
  git(main, 'add', '-A'); git(main, 'commit', '-qm', 'dashboard');
  const start = (name: string, id: string) => {
    assert.equal(runCli(home, main, 'new', name).status, 0);
    const dir = join(main, 'projects', readdirSync(join(main, 'projects')).find((n) => n.startsWith(id + '_'))!);
    const project = join(dir, 'PROJECT.md');
    writeFileSync(project, readFileSync(project, 'utf8').replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, '| P-1 | 결과 | CLI |'));
    const result = runCli(home, main, 'start', id, '--no-launch');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    return join(dirname(main), 'app.wt', id);
  };
  const wt1 = start('하나', 'P001');
  write(join(main, 'backlogs/BL_draft/BACKLOG.md'), 'UNTRACKED_PRIVATE_DRAFT');
  writeFileSync(join(main, 'backlogs/README.html'), 'UNSTAGED_TRACKED_DRAFT');
  const wt2 = start('둘', 'P002');
  assert.doesNotMatch(git(main, 'show', 'HEAD:backlogs/dashboard/data.js'), /UNTRACKED_PRIVATE_DRAFT|UNSTAGED_TRACKED_DRAFT/);
  writeFileSync(join(main, 'backlogs/README.html'), originalEntry);
  rmSync(join(main, 'backlogs/BL_draft'), { recursive: true });
  const prepare = (wt: string, id: string) => {
    assert.equal(runCli(home, wt, 'task', id, '작업').status, 0);
    const project = join(wt, 'projects', readdirSync(join(wt, 'projects')).find((n) => n.startsWith(id + '_'))!);
    passTask(join(project, 'tasks/T01_작업'));
    const done = runCli(home, wt, 'done', id, 'T01'); assert.equal(done.status, 0, done.stderr + done.stdout);
    git(wt, 'add', '-A'); git(wt, 'commit', '-qm', `feat(${id}/T01): 작업`);
    write(join(project, 'PROJECT-CLOSE.md'), '# 마감\n## 기준 대조\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | CLI |\n## 보안\n검사\n## 정본 반영\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| docs/README.md | 해당 없음 | 없음 |\n## 지표\n[집계](METRICS.md)\n시간을 확인했다.\n');
  };
  prepare(wt1, 'P001'); prepare(wt2, 'P002');
  const finish2 = runCli(home, wt2, 'finish', 'P002'); assert.equal(finish2.status, 0, finish2.stdout + finish2.stderr);
  const beforeRead = readFileSync(join(main, 'backlogs/dashboard/data.js'), 'utf8');
  assert.equal(runCli(home, main, 'list').status, 0);
  const preview2 = runCli(home, main, 'merge', 'P002'); assert.equal(preview2.status, 0, preview2.stdout + preview2.stderr);
  assert.equal(readFileSync(join(main, 'backlogs/dashboard/data.js'), 'utf8'), beforeRead);
  const merge2 = runCli(home, main, 'merge', 'P002', '--yes'); assert.equal(merge2.status, 0, merge2.stdout + merge2.stderr);
  const finish1 = runCli(home, wt1, 'finish', 'P001'); assert.equal(finish1.status, 0, finish1.stdout + finish1.stderr);
  assert.equal(git(wt1, 'status', '--porcelain'), '');
  assert.match(readFileSync(join(wt1, 'backlogs/dashboard/data.js'), 'utf8'), /병합 대기/);
});

test('start 준비 명령 실패 시 대시보드는 쓰거나 커밋하지 않는다', () => {
  const { home, main } = repoFixture();
  installDashboardFixture(main);
  writeFileSync(join(main, 'docs/README.md'), readFileSync(join(main, 'docs/README.md'), 'utf8') + '- worktree 준비: `false`\n');
  git(main, 'add', '-A'); git(main, 'commit', '-qm', 'setup');
  assert.equal(runCli(home, main, 'new', '실패').status, 0);
  const before = readFileSync(join(main, 'backlogs/dashboard/data.js'), 'utf8');
  const result = runCli(home, main, 'start', 'P001', '--no-launch');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /준비 명령이 실패/);
  assert.equal(readFileSync(join(main, 'backlogs/dashboard/data.js'), 'utf8'), before);
  assert.doesNotMatch(git(main, 'show', '--name-only', '--format=', 'HEAD'), /backlogs\/dashboard\/data\.js/);
});

test('start 자동 커밋 자료는 작업본에서만 삭제된 인덱스 문서를 포함한다', () => {
  const { home, main } = repoFixture();
  installDashboardFixture(main);
  write(join(main, 'backlogs/BL_EXISTING/BACKLOG.md'), 'INDEX_EXISTING');
  git(main, 'add', '-A'); git(main, 'commit', '-qm', 'dashboard');
  assert.equal(runCli(home, main, 'new', '인덱스').status, 0);
  rmSync(join(main, 'backlogs/BL_EXISTING/BACKLOG.md'));
  const result = runCli(home, main, 'start', 'P001', '--no-launch');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(main, 'show', 'HEAD:backlogs/BL_EXISTING/BACKLOG.md'), 'INDEX_EXISTING');
  assert.match(git(main, 'show', 'HEAD:backlogs/dashboard/data.js'), /INDEX_EXISTING/);
  assert.match(git(main, 'diff', '--name-only'), /backlogs\/BL_EXISTING\/BACKLOG\.md/);
  assert.doesNotMatch(git(main, 'diff', '--cached', '--name-only'), /backlogs\/BL_EXISTING\/BACKLOG\.md/);
});

test('신규 태스크 사전 검토 게이트는 check와 done을 막고 기록 뒤 통과한다', async () => {
  const { reviewHash } = await import('../src/project/pre-review.ts');
  const { home, main } = repoFixture();
  assert.equal(runCli(home, main, 'new', '검토 게이트').status, 0);
  assert.equal(runCli(home, main, 'start', 'P001').status, 0);
  const wt = join(dirname(main), 'app.wt', 'P001');
  const created = runPace(['project', 'task', 'P001', '검토'], { home, cwd: wt, timeout: 60_000 });
  assert.equal(created.status, 0);
  const dir = join(projectDir(wt), 'tasks', 'T01_검토');
  passTask(dir);
  const task = readFileSync(join(dir, 'TASK.md'), 'utf8');
  assert.match(task, /사전 검토: v1/);
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 1);
  assert.equal(runCli(home, wt, 'done', 'P001', 'T01').status, 1);
  assert.match(readFileSync(join(dir, 'TASK.md'), 'utf8'), /상태: 진행/);
  write(join(dir, 'evidence', 'review.md'), '독립 검토 결과');
  write(join(dir, 'PRE-REVIEW.json'), JSON.stringify({ version: 1, author: 'openai', attempts: [{ hash: reviewHash(task), provider: 'anthropic', cross: true, status: 'pass', blocking: 0, evidence: 'evidence/review.md', continuity: 'new' }] }));
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 0);
  assert.equal(runCli(home, wt, 'done', 'P001', 'T01').status, 0);
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 0);
  writeFileSync(join(dir, 'TASK.md'), readFileSync(join(dir, 'TASK.md'), 'utf8') + '\n변경\n');
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 1);
  const beforeProject = readFileSync(join(projectDir(wt), 'PROJECT.md'), 'utf8');
  const finish = runCli(home, wt, 'finish', 'P001');
  assert.notEqual(finish.status, 0);
  assert.match(finish.stdout + finish.stderr, /사전 검토/);
  assert.equal(readFileSync(join(projectDir(wt), 'PROJECT.md'), 'utf8'), beforeProject);
  assert.equal(runCli(home, wt, 'done', 'P001', 'T01').status, 1);
  assert.equal(readFileSync(join(projectDir(wt), 'PROJECT.md'), 'utf8'), beforeProject);
  git(wt, 'add', '-A');
  const commit = gitRun(wt, ['commit', '-m', 'feat(P001/T01): invalid review']);
  assert.notEqual(commit.status, 0);
  assert.match(commit.stdout + commit.stderr, /사전 검토/);
  const current = readFileSync(join(dir, 'TASK.md'), 'utf8');
  const newAttempt = { hash: reviewHash(current), provider: 'anthropic', cross: true, status: 'pass', blocking: 0, evidence: 'evidence/review.md', continuity: 'same' };
  const record = { version: 1, author: 'openai', attempts: [{ ...newAttempt, hash: reviewHash(task), status: 'fail', blocking: 1, continuity: 'new' }, newAttempt] };
  writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify(record));
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 0);
  for (const bad of [
    { ...record, version: 2 },
    { ...record, attempts: [{ ...newAttempt, status: 'fail', blocking: 1 }] },
    { ...record, attempts: [{ ...newAttempt, blocking: 2 }] },
    { ...record, attempts: [{ ...newAttempt, evidence: 'evidence/missing' }] },
    { ...record, attempts: [{ ...newAttempt, evidence: '../outside' }] },
  ]) {
    writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify(bad));
    assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 1);
    assert.equal(runCli(home, wt, 'done', 'P001', 'T01').status, 1);
    assert.equal(readFileSync(join(projectDir(wt), 'PROJECT.md'), 'utf8'), beforeProject);
  }
  writeFileSync(join(dir, 'PRE-REVIEW.json'), '{');
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 1);
  rmSync(join(dir, 'PRE-REVIEW.json'));
  symlinkSync('evidence/review.md', join(dir, 'PRE-REVIEW.json'));
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 1);
  rmSync(join(dir, 'PRE-REVIEW.json'));
  symlinkSync('evidence', join(dir, 'linked'));
  writeFileSync(join(dir, 'PRE-REVIEW.json'), JSON.stringify({ ...record, attempts: [{ ...newAttempt, evidence: 'linked/review.md' }] }));
  assert.equal(runCli(home, wt, 'check', 'P001', 'T01').status, 1);
});
