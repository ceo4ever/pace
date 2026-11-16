import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { newBacklog, newBrief, resolveBacklog } from "../src/project/backlog.ts";
import type { Repo } from "../src/project/harness.ts";
import { runPace, sessionFreeEnv, tempDir } from "./helpers.ts";

function fixture(): Repo {
  const root = tempDir();
  return { root, mainRoot: root, branch: "main", base: "main", inWorktree: false };
}

test("백로그 일자별 번호·이름 정리·템플릿과 브리프 다음 번호", () => {
  const repo = fixture();
  const a = newBacklog(repo, '새 /기능', "2026-10-25");
  assert.equal(basename(a), "BL261025_01_새_기능");
  assert.match(readFileSync(join(a, "BACKLOG.md"), "utf8"), /# BL261025_01 새 기능/);
  assert.equal(basename(newBacklog(repo, "둘", "2026-10-25")), "BL261025_02_둘");
  assert.equal(basename(newBacklog(repo, "셋", "2026-10-26")), "BL261026_01_셋");
  const first = newBrief(repo, "BL261025_01", "시작 구현");
  assert.equal(basename(first), "BR01_시작_구현.md");
  assert.match(readFileSync(first, "utf8"), /- 상태: 대기/);
  assert.equal(basename(newBrief(repo, a, "둘째")), "BR02_둘째.md");
  assert.match(readFileSync(join(a, "BACKLOG.md"), "utf8"), /\[BR02 둘째\]\(BR02_둘째.md\) \| 대기/);
  assert.throws(() => newBacklog(repo, ".."));
  assert.throws(() => newBacklog({ ...repo, inWorktree: true }, "거부"), /main/);
});

test("완료 백로그·모호한 앞부분·파일·외부 심볼릭 링크를 무변경 거부", () => {
  const repo = fixture();
  const a = newBacklog(repo, "하나", "2026-10-25");
  const brief = newBrief(repo, a, "첫째");
  assert.throws(() => resolveBacklog(repo.root, brief), /브리프/);
  mkdirSync(join(repo.root, "backlogs/BL261025_01_중복"));
  assert.throws(() => resolveBacklog(repo.root, "BL261025_01"), /2개/);
  const path = join(a, "BACKLOG.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("상태: 대기", "상태: 완료"));
  const before = readdirSync(a);
  assert.throws(() => newBrief(repo, a, "막힘"), /끝난/);
  assert.deepEqual(readdirSync(a), before);
  const outside = tempDir();
  symlinkSync(outside, join(repo.root, "backlogs/BL261025_03_밖"));
  assert.throws(() => resolveBacklog(repo.root, "BL261025_03"), /밖/);
  const repo2 = fixture();
  symlinkSync(outside, join(repo2.root, "backlogs"));
  assert.throws(() => newBacklog(repo2, "밖"), /심볼릭/);
});

test("CLI backlog new·brief·오류 — 임시 저장소와 PACE_HOME", () => {
  const repo = fixture();
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main", repo.root]).status, 0);
  const home = tempDir();
  assert.equal(spawnSync("git", ["-C", repo.root, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-qm", "init"], { env: { ...sessionFreeEnv(), HOME: home } }).status, 0);
  const created = runPace(["backlog", "new", "CLI"], { home, cwd: repo.root });
  assert.equal(created.status, 0, created.stderr);
  const dir = created.stdout.trim();
  const added = runPace(["backlog", "brief", dir, "브리프"], { home, cwd: repo.root });
  assert.equal(added.status, 0, added.stderr);
  assert.equal(basename(added.stdout.trim()), "BR01_브리프.md");
  assert.equal(runPace(["backlog", "brief", "BL000000_01", "없음"], { home, cwd: repo.root }).status, 1);
});

test("backlog new 도움말은 저장소 밖에서도 파일을 만들지 않는다", () => {
  const cwd = tempDir();
  const home = tempDir();
  for (const flag of ["--help", "-h"]) {
    const result = runPace(["backlog", "new", flag], { home, cwd });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /pace backlog new/);
    assert.deepEqual(readdirSync(cwd), []);
  }
});

test("brief는 backlogs 루트가 외부 링크이면 외부 파일을 바꾸지 않는다", () => {
  const target = fixture();
  const dir = newBacklog(target, "밖", "2026-10-25");
  const repo = fixture();
  symlinkSync(join(target.root, "backlogs"), join(repo.root, "backlogs"));
  const before = readFileSync(join(dir, "BACKLOG.md"), "utf8");
  assert.throws(() => newBrief(repo, "BL261025_01", "거부"), /심볼릭/);
  assert.deepEqual(readdirSync(dir), ["BACKLOG.md"]);
  assert.equal(readFileSync(join(dir, "BACKLOG.md"), "utf8"), before);
});

test("CRLF BACKLOG.md에서도 브리프·현황 행을 만든다", () => {
  const repo = fixture();
  const dir = newBacklog(repo, "윈도우", "2026-10-25");
  const path = join(dir, "BACKLOG.md");
  writeFileSync(path, readFileSync(path, "utf8").replace(/\r?\n/g, "\r\n"));
  newBrief(repo, dir, "첫째");
  assert.match(readFileSync(path, "utf8"), /BR01 첫째/);
});

test("BL 절대 별칭은 검증한 실제 백로그를 반환한다", () => {
  const repo = fixture();
  const first = newBacklog(repo, "하나", "2026-10-25");
  newBacklog(repo, "둘", "2026-10-25");
  const alias = join(tempDir(), "BL261025_02_둘");
  symlinkSync(first, alias);
  assert.equal(realpathSync(resolveBacklog(repo.root, alias)), realpathSync(first));
});
