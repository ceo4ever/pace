import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import * as harness from "../src/project/harness.ts";
import { tempDir } from "./helpers.ts";

const api = harness as unknown as {
  runDeclaredShell(cwd: string, command: string, timeoutMs?: number): { ok: boolean; output: string };
  restoreAfterFailure(error: unknown, restore: () => void): never;
  withRestoration<T>(operation: () => T, restore: () => void): T;
  gitShellAt(core: string): { shell?: string; error?: string };
  snapshotOwned(root: string, paths: string[]): () => void;
  spawnFailure(r: { status: number | null; signal?: NodeJS.Signals | null; error?: Error; stdout?: string | null; stderr?: string | null }): string;
};

test("선언 셸: 공백 경로와 인용·환경 변수·한글 및 종료 오류를 보존한다", () => {
  const dir = tempDir("pace-shell space-");
  const key = "PACE_SHELL_TEST_VALUE";
  process.env[key] = "한글 값";
  try {
    const ok = api.runDeclaredShell(dir, `printf '%s' "$${key}" && printf '%s' ' 끝'`);
    assert.equal(ok.ok, true, ok.output);
    assert.equal(ok.output, "한글 값 끝");
    const bad = api.runDeclaredShell(dir, "printf '실패 원문' >&2; exit 7");
    assert.equal(bad.ok, false);
    assert.match(bad.output, /실패 원문/);
    assert.match(bad.output, /종료 코드: 7/);
  } finally { delete process.env[key]; }
});

test("대량 출력 뒤의 오류 원문과 종료 코드를 보존한다", () => {
  const r = api.runDeclaredShell(tempDir(), `node -e "process.stdout.write('x'.repeat(2000000));process.stderr.write('LAST-ERROR');process.exitCode=3"`);
  assert.equal(r.ok, false);
  assert.match(r.output, /LAST-ERROR/);
  assert.match(r.output, /종료 코드: 3/);
});

test("시간 초과와 신호 종료는 이용 가능한 원인을 표시한다", () => {
  const timed = api.runDeclaredShell(tempDir(), "exec sleep 1", 100);
  assert.equal(timed.ok, false);
  assert.match(timed.output, /ETIMEDOUT|timed out/i);
  const signaled = api.runDeclaredShell(tempDir(), "kill -TERM $$");
  assert.equal(signaled.ok, false);
  assert.match(signaled.output, process.platform === "win32" ? /종료 코드: 3840|신호: SIGTERM/ : /신호: SIGTERM/);
});

test("복원만 실패해도 성공으로 처리하지 않는다", () => {
  assert.throws(() => api.withRestoration(() => "완료", () => { throw new Error("복원 오류"); }), /복원 오류/);
  assert.throws(() => api.withRestoration(() => { throw new Error("원래 오류"); }, () => { throw new Error("복원 오류"); }), /원래 오류[\s\S]*복원 오류/);
});

test("Git 셸 경로가 없거나 설치 경계 밖이면 거부한다", () => {
  const root = tempDir();
  const core = join(root, "mingw64", "libexec", "git-core");
  mkdirSync(core, { recursive: true });
  assert.match(api.gitShellAt(core).error ?? "", /찾지 못/);
  assert.match(api.gitShellAt(join(root, "invalid")).error ?? "", /구조/);
  const outside = tempDir();
  writeFileSync(join(outside, "sh.exe"), "fixture");
  symlinkSync(outside, join(root, "bin"), process.platform === "win32" ? "junction" : "dir");
  assert.match(api.gitShellAt(core).error ?? "", /경계 밖/);
});

test("오염된 Git 실행 경로와 작업 디렉터리 sh를 셸로 쓰지 않는다", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "sh.exe"), "not an executable");
  const before = process.env.GIT_EXEC_PATH;
  process.env.GIT_EXEC_PATH = dir;
  try {
    const r = api.runDeclaredShell(dir, "printf 안전");
    assert.equal(r.ok, true, r.output);
    assert.equal(r.output, "안전");
  } finally { if (before === undefined) delete process.env.GIT_EXEC_PATH; else process.env.GIT_EXEC_PATH = before; }
});

test("Windows에서 따옴표로 감싼 Git PATH 항목도 찾는다", () => {
  const before = process.env.PATH;
  try {
    if (process.platform === "win32") {
      const gitDir = (before ?? "").split(";").find((p) => existsSync(join(p, "git.exe")));
      assert.ok(gitDir, "실제 Git 경로 필요");
      process.env.PATH = `"${gitDir}"`;
    }
    const r = api.runDeclaredShell(tempDir(), "printf ok");
    assert.equal(r.ok, true, r.output);
    assert.equal(r.output, "ok");
  } finally { if (before === undefined) delete process.env.PATH; else process.env.PATH = before; }
});

test("셸 부재는 오류 원인을 표시한다", () => {
  const saved = process.env.PATH;
  process.env.PATH = "";
  try { const r = api.runDeclaredShell(tempDir(), "true"); assert.equal(r.ok, false); assert.match(r.output, /ENOENT|찾지 못|없/); }
  finally { if (saved === undefined) delete process.env.PATH; else process.env.PATH = saved; }
});

test("복원 실패는 원래 실패와 함께 보존한다", () => {
  assert.throws(() => api.restoreAfterFailure(new Error("원래 오류"), () => { throw new Error("복원 오류"); }), /원래 오류[\s\S]*복원 오류/);
  assert.throws(() => api.restoreAfterFailure(new Error("원래 오류"), () => {}), /원래 오류/);
});

test("중첩 경로의 파일과 Git 인덱스를 정확히 복원한다", () => {
  const root = tempDir(), relativeFile = join("nested", "file.txt");
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, relativeFile), "original");
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  git("init", "-q");
  git("add", relativeFile);
  const restore = api.snapshotOwned(root, [relativeFile]);
  writeFileSync(join(root, relativeFile), "changed");
  git("add", relativeFile);
  restore();
  assert.equal(git("show", ":nested/file.txt"), "original");
  assert.equal(readFileSync(join(root, relativeFile), "utf8"), "original");
});

test("인덱스 읽기 실패: git 오류 원문을 메시지에 남긴다", () => {
  const root = tempDir("pace-snapshot-fail-");
  writeFileSync(join(root, "a.txt"), "x");
  assert.throws(() => api.snapshotOwned(root, ["a.txt"]), (error: Error) => /인덱스를 읽지 못했다: a\.txt — .*fatal.*종료 코드 128/.test(error.message));
});

test("git 실패 원인: stderr·실행 오류·신호·종료 코드를 한 줄로", () => {
  assert.equal(api.spawnFailure({ status: 128, stderr: " fatal: 잠금 \n", stdout: "" }), "fatal: 잠금 · 종료 코드 128");
  const timeout = Object.assign(new Error("spawnSync git ETIMEDOUT"), { code: "ETIMEDOUT" });
  assert.equal(api.spawnFailure({ status: null, signal: "SIGTERM", error: timeout }), "실행 오류: ETIMEDOUT · 신호 SIGTERM");
  assert.equal(api.spawnFailure({ status: null }), "원인 정보 없음");
});
