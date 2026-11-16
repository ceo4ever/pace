import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPace, tempDir } from "./helpers.ts";

test("잘못된 작업자 명령은 PACE 사용법을 안내한다", () => {
  const result = runPace(["worker", "bogus"], { home: tempDir() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pace worker show/);
});

test("설치 → 프로필 생성 → 메모리 → 부트 → 브레인 흐름", () => {
  const home = tempDir();

  const noProfile = runPace(["boot", "--host", "plain"], { home });
  assert.match(noProfile.stdout, /pace-onboarding/);

  const create = runPace(
    ["profile", "create", "default", "--display-name", "알투", "--alias", "R2D2", "--owner", "캡틴",
      "--tone", "존댓말 + 친근", "--personality", "꼼꼼함", "--language", "ko"],
    { home, input: "" },
  );
  assert.equal(create.status, 0, create.stderr);
  assert.match(create.stdout, /기본 프로필/);
  assert.match(runPace(["profile", "list"], { home }).stdout, /\* default/);

  const add = runPace(
    ["memory", "add", "--type", "rule", "--name", "확인 후 커밋", "--description", "승인 뒤에만", "--body", "-"],
    { home, input: "**왜:** 사용자 주권\n" },
  );
  assert.equal(add.status, 0, add.stderr);
  assert.match(runPace(["memory", "show", "확인-후-커밋"], { home }).stdout, /사용자 주권/);

  const project = tempDir();
  mkdirSync(join(project, ".git"));
  const sub = join(project, "src");
  mkdirSync(sub);
  assert.equal(runPace(["brain", "init"], { home, cwd: sub }).status, 0);
  const brainAdd = runPace(["brain", "add", "--type", "concept", "--title", "커밋 정책", "--summary", "승인 뒤 커밋", "--body", "## 절차\n승인 뒤 커밋한다", "--sources", "대화:2026-10-22", "--file", "commit-policy"], { home, cwd: project });
  assert.equal(brainAdd.status, 0, brainAdd.stderr + brainAdd.stdout);
  assert.match(brainAdd.stdout, /lint: 오류 0/);
  assert.equal(runPace(["brain", "index"], { home, cwd: project }).status, 0);
  writeFileSync(join(project, ".pace", "brain", "pages", "concept", "broken.md"), "---\ntype: concept\n---\n[[없음]]\n");
  assert.equal(runPace(["brain", "index"], { home, cwd: project }).status, 1, "직접 쓴 잘못된 페이지는 index에서 걸린다");
  assert.equal(runPace(["brain", "lint"], { home, cwd: project }).status, 1);
  assert.match(runPace(["brain", "search", "커밋"], { home, cwd: sub }).stdout, /pages[\\/]concept[\\/]commit-policy\.md/);

  const boot = runPace(["boot", "--host", "plain", "--cwd", sub], { home });
  assert.match(boot.stdout, /# 알투/);
  assert.match(boot.stdout, /확인 후 커밋/);
  assert.match(boot.stdout, /프로젝트 브레인: 있음/);
});

test("사용법 오류는 종료 코드 2", () => {
  const home = tempDir();
  assert.equal(runPace(["nope"], { home }).status, 2);
  assert.equal(runPace(["memory", "list"], { home }).status, 2);
});


test("query → file back: every search mode guides reuse, explicit query logging appends without search writes", () => {
  const home = tempDir(), project = tempDir();
  assert.equal(runPace(["brain", "init"], { home, cwd: project }).status, 0);
  assert.equal(runPace(["brain", "add", "--type", "concept", "--title", "예약 큐", "--summary", "예약을 큐에 보낸 이유", "--body", "## 이유\n재시도 경계를 분리한다.", "--sources", "대화:2026-10-24", "--file", "queue"], { home, cwd: project }).status, 0);
  const dir = join(project, ".pace", "brain");
  const snapshot = () => ["log.md", "index.md", "pages/concept/queue.md"].map((path) => readFileSync(join(dir, path), "utf8"));
  const before = snapshot();
  for (const args of [["예약"], ["예약", "--list"], ["없는단어"]]) {
    const result = runPace(["brain", "search", ...args], { home, cwd: project });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /되적립\(file back\): 이 답을 위해 코드·문서를 더 찾았다면 재사용할 결과를 위키에 남긴다/);
    assert.match(result.stdout, /pace brain add\/update/);
    assert.match(result.stdout, /pace brain log --op query --summary/);
    if (args[0] === "없는단어") assert.match(result.stdout, /결과 없음/);
    else assert.match(result.stdout, /pages[\\/]concept[\\/]queue.md/);
    assert.deepEqual(snapshot(), before, "search remains read-only");
    assert.deepEqual(readdirSync(join(dir, "pages", "concept")), ["queue.md"]);
  }
  const summary = "예약 재시도 — 코드와 문서를 비교해 경계 확인";
  const result = runPace(["brain", "log", "--op", "query", "--summary", summary], { home, cwd: project });
  assert.equal(result.status, 0, result.stderr);
  const after = snapshot();
  assert.equal(after[0]!.slice(0, before[0]!.length), before[0]);
  assert.match(after[0]!.slice(before[0]!.length), /^## \[\d{4}-\d{2}-\d{2}\] query \| 예약 재시도 — 코드와 문서를 비교해 경계 확인\n$/);
  assert.deepEqual(after.slice(1), before.slice(1));
  assert.equal(runPace(["brain", "log", "--op", "query"], { home, cwd: project }).status, 2);
  assert.equal(snapshot()[0], after[0], "invalid log does not write");
  assert.equal(runPace(["brain", "log", "--op", "x | y", "--summary", "invalid"], { home, cwd: project }).status, 2);
  assert.equal(snapshot()[0], after[0], "unknown operation does not write");
  const multiline = runPace(["brain", "log", "--op", "query", "--summary", "question\r\n\n## [2099-01-01] ingest | fake"], { home, cwd: project });
  assert.equal(multiline.status, 0, multiline.stderr);
  const appended = snapshot()[0]!.slice(after[0]!.length);
  assert.match(appended, /^## \[\d{4}-\d{2}-\d{2}\] query \| question ## \[2099-01-01\] ingest \| fake\n$/);
  assert.equal(appended.split("\n").length, 2, "summary cannot forge a second entry");
});

test("CLI memory 가드: 위반은 종료 1·이유·대안·파일 없음, --force면 저장(add·update)", () => {
  const home = tempDir();
  assert.equal(runPace(["profile", "create", "default", "--display-name", "알투", "--owner", "캡틴"], { home, input: "" }).status, 0);
  const add = ["memory", "add", "--type", "rule", "--name", "P013 예산", "--description", "P013 부트 8,000자 이하"];
  const bad = runPace(add, { home });
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stderr, /기억을 저장하지 않았다/);
  assert.match(bad.stderr, /범위 — 프로필에 프로젝트 범위 내용 프로젝트 번호\(P###\) "P013" → 이 프로젝트 한정이면 --project로/);
  assert.match(bad.stderr, /정말 예외면 --force/);
  assert.ok(!readdirSync(join(home, "profiles", "default", "memory")).some((f) => /p013/i.test(f)), "거부하면 파일을 쓰지 않는다");
  const forced = runPace([...add, "--force"], { home });
  assert.equal(forced.status, 0, forced.stderr);
  assert.match(forced.stdout, /기억 추가: p013-예산/);

  const update = ["memory", "update", "p013-예산", "--body", `id term_9974fbbd-130d`];
  const badUpdate = runPace(update, { home });
  assert.equal(badUpdate.status, 1);
  assert.match(badUpdate.stderr, /가변값 — 터미널 핸들/);
  assert.doesNotMatch(runPace(["memory", "show", "p013-예산"], { home }).stdout, /term_/);
  assert.equal(runPace([...update, "--force"], { home }).status, 0);
  assert.match(runPace(["memory", "show", "p013-예산"], { home }).stdout, /term_9974fbbd/);
  assert.match(runPace(["help"], { home }).stdout, /\[--force\][\s\S]*쓰기 원칙/);
});

test("CLI memory 보안: 잘못된 slug·비밀은 종료 1, stderr에 원문 없음, --force로도 저장하지 않음", () => {
  const home = tempDir();
  assert.equal(runPace(["profile", "create", "default", "--display-name", "알투", "--owner", "캡틴"], { home, input: "" }).status, 0);
  const memDir = join(home, "profiles", "default", "memory");
  writeFileSync(join(home, "profiles", "default", "bait.md"), "---\nname: 미끼\ndescription: 밖\ntype: todo\n---\n");
  for (const args of [["show", "../bait"], ["remove", "../bait"], ["done", "a/b"], ["update", "../bait", "--body", "x"]]) {
    const r = runPace(["memory", ...args], { home });
    assert.equal(r.status, 1, `${args.join(" ")}: ${r.stdout}`);
    assert.match(r.stderr, /잘못된 slug/);
  }
  assert.ok(readFileSync(join(home, "profiles", "default", "bait.md"), "utf8").includes("미끼"));

  const token = ["gh", "p_", "Zq9".repeat(12)].join("");
  const add = ["memory", "add", "--type", "todo", "--name", "토큰 정리", "--description", "요약", "--body", `값 ${token}`];
  for (const args of [add, [...add, "--force"]]) {
    const r = runPace(args, { home });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, /비밀로 보이는 값\(본문\)/);
    assert.ok(!r.stderr.includes(token) && !r.stdout.includes(token));
  }
  assert.ok(!readdirSync(memDir).some((f) => f.startsWith("토큰")), "파일을 쓰지 않는다");
  assert.equal(runPace(["memory", "add", "--type", "todo", "--name", "토큰 정리", "--description", "요약"], { home }).status, 0);
  const done = runPace(["memory", "done", "토큰-정리", "--result", `고침 ${token}`], { home });
  assert.equal(done.status, 1);
  assert.match(done.stderr, /비밀로 보이는 값\(결과\)/);
  assert.ok(!done.stderr.includes(token));

  const project = tempDir();
  mkdirSync(join(project, ".git"));
  const status = runPace(["memory", "status", "--project", "--cwd", project, "--body", `다음 ${token}`], { home });
  assert.equal(status.status, 1, status.stdout);
  assert.match(status.stderr, /비밀로 보이는 값\(본문\)/);
  assert.ok(!status.stderr.includes(token));
});
