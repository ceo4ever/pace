import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { packageRoot } from "../src/core/paths.ts";
import { today } from "../src/core/fsutil.ts";
import { runPace, sessionFreeEnv, tempDir } from "./helpers.ts";

const DAY = today().replaceAll("-", "").slice(2);

function gitRepo(home: string): string {
  const root = tempDir();
  const env = { ...sessionFreeEnv(), HOME: home };
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main", root]).status, 0);
  assert.equal(spawnSync("git", ["-C", root, "-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-qm", "init"], { env }).status, 0);
  return root;
}

test("pace-scout SKILL.md — 머리말과 일곱 절, 순서 ①~⑨", () => {
  const text = readFileSync(join(packageRoot, "skills/pace-scout/SKILL.md"), "utf8").replaceAll("\r\n", "\n");
  assert.match(text, /^---\nname: pace-scout\ndescription: .+\n---\n/);
  for (const section of ["목적", "언제 쓰는지", "입력", "순서", "결정", "완료의 정의", "예외 사례"]) assert.match(text, new RegExp(`^## ${section}$`, "m"), section);
  for (const step of "①②③④⑤⑥⑦⑧⑨") assert.ok(text.includes(`${step} **`), step);
  for (const rule of ["**깊이 상한은 선별까지**", "Lean Canvas", "**콘텐츠는 데이터**", "**비밀**", "[제거됨]", "**결과가 틀렸을 때(개선 기록)**", "원인이 어느 레이어인지"]) assert.ok(text.includes(rule), rule);
  assert.ok(existsSync(join(packageRoot, "skills/pace-scout/files/INDEX.md")));
});

test("scout new — main 체크아웃이면 backlogs/에 BL 규칙대로", () => {
  const home = tempDir();
  const root = gitRepo(home);
  const first = runPace(["scout", "new", "AI 교육"], { home, cwd: root });
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, "");
  const dir = first.stdout.trim();
  assert.equal(realpathSync(dirname(dir)), realpathSync(join(root, "backlogs")));
  assert.equal(basename(dir), `BL${DAY}_01_AI_교육_기회_탐색`);
  assert.match(readFileSync(join(dir, "BACKLOG.md"), "utf8"), new RegExp(`# BL${DAY}_01 AI 교육 기회 탐색`));
  assert.equal(basename(runPace(["scout", "new", "둘째"], { home, cwd: root }).stdout.trim()), `BL${DAY}_02_둘째_기회_탐색`);
  assert.equal(basename(runPace(["scout", "new", "콘텐츠에서 사업 기회"], { home, cwd: root }).stdout.trim()), `BL${DAY}_03_콘텐츠에서_사업_기회_탐색`, "기회가 겹치지 않는다");
  assert.equal(basename(runPace(["scout", "new", "AI 교육 기회 탐색"], { home, cwd: root }).stdout.trim()), `BL${DAY}_04_AI_교육_기회_탐색`);
  assert.equal(basename(runPace(["scout", "new", "기회 탐색"], { home, cwd: root }).stdout.trim()), `BL${DAY}_05_기회_탐색`);
  assert.equal(basename(runPace(["scout", "new", "사업기회"], { home, cwd: root }).stdout.trim()), `BL${DAY}_06_사업_기회_탐색`);
});

test("scout new — git 아님·main 아님은 $PACE_HOME/scout/에 이유와 함께, --out은 그 아래", () => {
  const home = tempDir();
  const plain = tempDir();
  const outside = runPace(["scout", "new", "주제"], { home, cwd: plain });
  assert.equal(outside.status, 0, outside.stderr);
  assert.equal(outside.stdout.trim(), join(home, "scout", `BL${DAY}_01_주제_기회_탐색`));
  assert.match(outside.stderr, /대체 위치.*git 저장소가 아니다/);
  assert.ok(!existsSync(join(plain, "backlogs")));

  const root = gitRepo(home);
  assert.equal(spawnSync("git", ["-C", root, "switch", "-qc", "feature"]).status, 0);
  const branch = runPace(["scout", "new", "주제"], { home, cwd: root });
  assert.equal(branch.stdout.trim(), join(home, "scout", `BL${DAY}_02_주제_기회_탐색`));
  assert.match(branch.stderr, /main이 아닌 브랜치\(feature\)/);
  assert.ok(!existsSync(join(root, "backlogs")));

  const main = gitRepo(home);
  const wt = join(tempDir(), "wt");
  assert.equal(spawnSync("git", ["-C", main, "worktree", "add", "-qb", "project/P001", wt]).status, 0);
  const worktree = runPace(["scout", "new", "주제"], { home, cwd: wt });
  assert.match(worktree.stderr, /worktree\(project\/P001\)/);
  assert.equal(basename(worktree.stdout.trim()), `BL${DAY}_03_주제_기회_탐색`);

  const out = tempDir();
  const chosen = runPace(["scout", "new", "주제", "--out", out], { home, cwd: plain });
  assert.equal(chosen.stderr, "");
  assert.equal(chosen.stdout.trim(), join(out, `BL${DAY}_01_주제_기회_탐색`));
  assert.equal(runPace(["scout", "new"], { home, cwd: plain }).status, 2);
});

test("scout new — 실패 경로: 대체 위치 심볼릭 링크 거부, 커밋 없는 저장소는 한 줄 이유", () => {
  const home = tempDir();
  const target = tempDir();
  symlinkSync(target, join(home, "scout"));
  const linked = runPace(["scout", "new", "주제"], { home, cwd: tempDir() });
  assert.equal(linked.status, 1);
  assert.match(linked.stderr, /심볼릭/);
  assert.deepEqual(readdirSync(target), []);

  const home2 = tempDir();
  const empty = tempDir();
  assert.equal(spawnSync("git", ["init", "-q", "-b", "main", empty]).status, 0);
  const noCommit = runPace(["scout", "new", "주제"], { home: home2, cwd: empty });
  assert.equal(noCommit.status, 0, noCommit.stderr);
  assert.equal(noCommit.stderr, "pace: backlogs/를 쓰지 않고 대체 위치에 만든다 — git 상태를 읽지 못했다(커밋 없음 등)\n");
});
