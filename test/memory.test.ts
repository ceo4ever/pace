import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createProfile } from "../src/profile/profile.ts";
import {
  addMemory,
  bootView,
  completeMemory,
  listMemories,
  MEMORY_LIMITS,
  profileMemoryDir,
  projectMemoryDir,
  readHistory,
  readMemory,
  rebuildMemoryIndex,
  removeMemory,
  setStatus,
  STALE_DAYS,
  updateMemory,
} from "../src/memory/memory.ts";
import { ALTU, PACE_BIN, tempDir, spawnTestChild as spawn } from "./helpers.ts";

test("프로필: 추가·수정·삭제마다 목차가 다시 만들어진다", () => {
  const dir = profileMemoryDir(createProfile(tempDir(), ALTU));
  const entry = addMemory(dir, "profile", { type: "rule", name: "확인 후 커밋", description: "승인 뒤에만 커밋한다", body: "**왜:** 사용자 주권" });
  assert.equal(entry.slug, "확인-후-커밋");
  assert.match(rebuildMemoryIndex(dir, "profile"), /## 지킬 것 · 하지 말 것\n\n- \[확인 후 커밋\]\(확인-후-커밋\.md\) — 승인 뒤에만 커밋한다/);
  updateMemory(dir, "profile", entry.slug, { description: "승인 뒤에만 커밋·푸시한다" });
  assert.match(rebuildMemoryIndex(dir, "profile"), /승인 뒤에만 커밋·푸시한다/);
  removeMemory(dir, "profile", entry.slug);
  assert.equal(listMemories(dir).length, 0);
});

test("범위별 종류를 지킨다: 이슈는 프로젝트에만, user는 프로필에만", () => {
  const profile = profileMemoryDir(createProfile(tempDir(), ALTU));
  const project = projectMemoryDir(tempDir());
  assert.throws(() => addMemory(profile, "profile", { type: "issue", name: "x", description: "x" }), /프로필 메모리 type은 user \| rule \| todo/);
  assert.throws(() => addMemory(project, "project", { type: "user", name: "x", description: "x" }), /프로젝트 메모리 type은 status/);
  addMemory(project, "project", { type: "issue", name: "x", description: "x" });
  assert.throws(() => addMemory(project, "project", { type: "issue", name: "x", description: "y" }), /이미 있는 기억/);
});

test("진행 상황은 하나만 유지되고 덮어쓴다", () => {
  const dir = projectMemoryDir(tempDir());
  setStatus(dir, "06 설치 진행 중");
  addMemory(dir, "project", { type: "status", name: "무시됨", description: "요약", body: "07 검증 시작" });
  const statuses = listMemories(dir).filter((e) => e.type === "status");
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0]!.body, "07 검증 시작");
});

test("done은 이슈·할 일·아이디어만 닫고 이력에 결과를 남긴다", () => {
  const dir = projectMemoryDir(tempDir());
  addMemory(dir, "project", { type: "issue", name: "Codex 알림 미확인", description: "화면 표시 확인 필요" });
  addMemory(dir, "project", { type: "rule", name: "BOM 유지", description: "install.ps1은 BOM 유지" });
  completeMemory(dir, "project", "codex-알림-미확인", "TUI에서 경고로 표시됨");
  assert.ok(!existsSync(join(dir, "codex-알림-미확인.md")));
  assert.match(readHistory(dir, 3)[0]!, /\[issue\] Codex 알림 미확인 — TUI에서 경고로 표시됨$/);
  assert.throws(() => completeMemory(dir, "project", "bom-유지"), /닫을 수 없는 종류\(rule\)/);
});

test("부트 요약: 상태·규칙 제목·요약(본문 없음), 열린 이슈·할 일(오래된 것 표시), 메모는 제목, 아이디어는 개수, 최근 완료", () => {
  const dir = projectMemoryDir(tempDir());
  setStatus(dir, "06 진행 중 · 다음: 07");
  addMemory(dir, "project", { type: "rule", name: "main 직접 커밋 금지", description: "브랜치에서 작업", body: "**왜:** 리뷰" });
  addMemory(dir, "project", { type: "issue", name: "오래된 이슈", description: "근거 확인 필요" });
  addMemory(dir, "project", { type: "todo", name: "검증표 채우기", description: "07", due: "2026-10-30" });
  addMemory(dir, "project", { type: "note", name: "Node 25", description: "타입 제거 실행" });
  addMemory(dir, "project", { type: "idea", name: "MCP 서버", description: "2차" });
  addMemory(dir, "project", { type: "todo", name: "끝난 일", description: "x" });
  completeMemory(dir, "project", "끝난-일", "완료");
  // 오래된 이슈로 만든다.
  const path = join(dir, "오래된-이슈.md");
  writeFileSync(path, readFileSync(path, "utf8").replace(/created: \S+/, "created: 2026-01-01"));

  const view = bootView(dir, "project", new Date("2026-10-22T12:00:00"));
  for (const part of [
    "### 진행 상황",
    "06 진행 중 · 다음: 07",
    "- **main 직접 커밋 금지** — 브랜치에서 작업\n",
    "### 열린 이슈",
    "오래된 이슈 [오래된-이슈]",
    "⚠ 오래됨",
    "검증표 채우기 [검증표-채우기] — 07 (마감 2026-10-30)",
    "- Node 25 — 타입 제거 실행",
    "### 개선 아이디어: 1건",
    "### 최근 완료",
  ]) {
    assert.ok(view.text.includes(part), part);
  }
  assert.ok(!view.text.includes("MCP 서버"), "아이디어는 개수만");
  assert.ok(!view.text.includes("**왜:** 리뷰"), "규칙 본문은 부트에 넣지 않는다");
  assert.deepEqual(view.counts, { rules: 1, issues: 1, todos: 1, stale: 1, hasStatus: true, empty: false });
  assert.ok(STALE_DAYS > 0);
});

test("여러 프로세스가 동시에 기억을 추가해도 모두 남는다", async () => {
  const home = tempDir();
  const dir = profileMemoryDir(createProfile(home, ALTU));
  const count = 8;
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [PACE_BIN, "memory", "add", "--type", "rule", "--name", `동시 기억 ${i}`, "--description", `설명 ${i}`],
          { env: { ...process.env, PACE_HOME: home, PACE_PROFILE: "" }, stdio: ["ignore", "ignore", "pipe"] },
        );
        let err = "";
        child.stderr.on("data", (d: Buffer) => (err += d.toString()));
        child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(err))));
      }),
    ),
  );
  assert.equal(listMemories(dir).length, count);
  const view = bootView(dir, "profile").text;
  for (let i = 0; i < count; i++) assert.match(view, new RegExp(`동시 기억 ${i}`));
});

test("부트 요약 축약: maxItems면 목록 절마다 앞에서 N개와 '외 N건' 줄", () => {
  const dir = projectMemoryDir(tempDir());
  for (let i = 0; i < 5; i++) {
    addMemory(dir, "project", { type: "todo", name: `할 일 ${i}`, description: `d${i}` });
    addMemory(dir, "project", { type: "rule", name: `규칙 ${i}`, description: `r${i}` });
  }
  const full = bootView(dir, "project").text;
  assert.doesNotMatch(full, /외 \d+건/);
  const short = bootView(dir, "project", new Date(), { maxItems: 3 }).text;
  assert.equal(short.match(/- … 외 2건 — `pace memory list --project`/g)?.length, 2, short);
  assert.match(short, /규칙 2/);
  assert.doesNotMatch(short, /규칙 3|할 일 3/);
  assert.equal(bootView(dir, "project", new Date(), { maxItems: 3 }).counts.todos, 5, "개수는 전체");
  // 오래된 항목은 마감 있는 새 항목보다 앞 — 줄여도 묻히지 않는다
  addMemory(dir, "project", { type: "todo", name: "오래된 할 일", description: "o" });
  const old = join(dir, "오래된-할-일.md");
  writeFileSync(old, readFileSync(old, "utf8").replace(/created: \S+/, "created: 2026-01-01"));
  for (let i = 0; i < 3; i++) addMemory(dir, "project", { type: "todo", name: `마감 ${i}`, description: `m${i}`, due: "2026-01-02" });
  const capped = bootView(dir, "project", new Date("2026-10-22T12:00:00"), { maxItems: 1 }).text;
  assert.match(capped, /### 할 일\n- 오래된 할 일 \[오래된-할-일\].*⚠ 오래됨\n- … 외 8건/, capped);
});

const rejects = (fn: () => unknown, ...parts: RegExp[]) =>
  assert.throws(fn, (e: Error) => {
    assert.match(e.message, /기억을 저장하지 않았다/);
    assert.match(e.message, /--force/);
    for (const p of parts) assert.match(e.message, p);
    return true;
  });

test("가드 ①: 가변값(term_ 핸들·UUID·40자 해시)은 거부, 짧은 커밋 해시는 허용", () => {
  const dir = projectMemoryDir(tempDir());
  rejects(() => addMemory(dir, "project", { type: "note", name: "코디네이터", description: "핸들 term_754cb9c5-3e84 로 보낸다" }), /가변값 — 터미널 핸들/, /변하지 않는 사실만/);
  rejects(() => addMemory(dir, "project", { type: "note", name: "세션", description: "세션", body: "id 4b9ec6a2-d4d6-4c80-8044-f273bdc80044" }), /UUID/);
  rejects(() => addMemory(dir, "project", { type: "issue", name: "회귀", description: "x", body: `커밋 ${"a".repeat(40)}` }), /40자 해시/);
  rejects(() => addMemory(dir, "project", { type: "note", name: "코디 term_754cb9c5", description: "코디네이터 핸들" }), /터미널 핸들/); // 이름만
  assert.equal(listMemories(dir).length, 0, "거부하면 파일을 쓰지 않는다");
  addMemory(dir, "project", { type: "issue", name: "회귀", description: "부트 순서 회귀", body: "근거: 커밋 4fbbfd19" });
  // 경계: 39·41·64자 hex는 40자 해시가 아니다, term_ 뒤가 16진수가 아니면 핸들이 아니다
  for (const [n, c] of [[39, "b"], [41, "c"], [64, "d"]] as const) addMemory(dir, "project", { type: "note", name: `hex ${n}`, description: `값 ${c.repeat(n)}` });
  addMemory(dir, "project", { type: "note", name: "낱말", description: "term_project 변수, term_decaffeinated" });
  addMemory(dir, "project", { type: "note", name: "짧은 핸들 꼴", description: "term_ab12 예시" }); // 16진수 6자 미만
  assert.equal(listMemories(dir).length, 6);
  addMemory(dir, "project", { type: "note", name: "코디네이터", description: "핸들 term_754cb9c5", body: "" }, { force: true });
  assert.equal(listMemories(dir).length, 7);
});

test("가드 ②: 같은 범위·종류의 같은 제목·거의 같은 요약은 거부하고 update를 알린다", () => {
  const dir = projectMemoryDir(tempDir());
  addMemory(dir, "project", { type: "rule", name: "GitHub 계정 먼저 묻기", description: "gh 작업 전 계정을 묻고 활성 계정은 바꾸지 않는다" });
  rejects(
    () => addMemory(dir, "project", { type: "rule", name: "GitHub계정 먼저묻기", description: "다른 요약" }), // 띄어쓰기만 달라 slug는 다르다
    /중복 — 같은 rule에 제목이 같은 기억 \[github-계정-먼저-묻기\]/,
    /`pace memory update github-계정-먼저-묻기 --project`/,
  );
  rejects(
    () => addMemory(dir, "project", { type: "rule", name: "계정 확인", description: "gh 작업 전에 계정을 묻고 활성 계정은 바꾸지 않는다." }),
    /요약이 거의 같은 기억 \[github-계정-먼저-묻기\]/,
  );
  // 유사도 경계(0.85): 수치만 다른 요약은 같은 사실의 갱신이라 거부, 뜻이 바뀐 요약은 통과
  addMemory(dir, "project", { type: "rule", name: "예산 8000", description: "부트 출력은 8000자 이하로 유지한다" });
  rejects(
    () => addMemory(dir, "project", { type: "rule", name: "예산 6000", description: "부트 출력은 6000자 이하로 유지한다" }), // 0.875
    /요약이 거의 같은 기억 \[예산-8000\]/,
    /update 예산-8000/,
  );
  // 유사도 0.95여도 정규화 12자 미만이면 같을 때만 중복
  addMemory(dir, "project", { type: "rule", name: "짧은 1", description: "abcdefghij" });
  addMemory(dir, "project", { type: "rule", name: "짧은 2", description: "abcdefghijk" });
  // 유사도 0.811·0.776(12자 이상) — 0.85 아래라 통과
  addMemory(dir, "project", { type: "rule", name: "계정 전환", description: "gh 작업 전 계정을 묻고 활성 계정은 바꾼다" });
  addMemory(dir, "project", { type: "rule", name: "커밋 전 검사 lint", description: "커밋 전에 npm run lint를 돌리고 실패하면 멈춘다" });
  // 다른 종류, 짧고 다른 요약, 비슷하지만 다른 긴 요약은 통과
  addMemory(dir, "project", { type: "todo", name: "GitHub 계정 정리", description: "gh 작업 전 계정을 묻고 활성 계정은 바꾸지 않는다" });
  addMemory(dir, "project", { type: "note", name: "a", description: "설명 0" });
  addMemory(dir, "project", { type: "note", name: "b", description: "설명 1" });
  addMemory(dir, "project", { type: "rule", name: "커밋 전 검사", description: "커밋 전에 npm run check를 돌리고 실패하면 멈춘다" });
  // update는 자기 자신과 비교하지 않지만 다른 항목과는 비교한다
  updateMemory(dir, "project", "github-계정-먼저-묻기", { description: "gh 작업 전 계정을 묻고 활성 계정은 바꾸지 않는다" });
  rejects(() => updateMemory(dir, "project", "커밋-전-검사", { name: "GitHub 계정 먼저 묻기" }), /제목이 같은 기억 \[github-계정-먼저-묻기\]/);
  // 종류를 바꾸면 새 종류 안의 중복을 본다
  rejects(() => updateMemory(dir, "project", "github-계정-정리", { type: "rule" }), /같은 rule에 요약이 거의 같은/);
  // 프로필 메모리는 다른 폴더라 비교하지 않는다(범위가 다르면 중복 아님)
  const pdir = profileMemoryDir(createProfile(tempDir(), ALTU));
  addMemory(pdir, "profile", { type: "rule", name: "GitHub 계정 먼저 묻기", description: "gh 작업 전 계정을 묻고 활성 계정은 바꾸지 않는다" });
});

test("가드 ③: 프로필에 프로젝트 범위 내용(P###·BL######·BR##·file:line)은 거부, 프로젝트는 허용", () => {
  const pdir = profileMemoryDir(createProfile(tempDir(), ALTU));
  const cases: [string, RegExp][] = [
    ["P013 부트 예산 지키기", /프로젝트 번호\(P###\) "P013"/],
    ["BL261031_01 먼저 보기", /백로그 번호\(BL######\) "BL261031"/],
    ["BR04 따르기", /브리프 번호\(BR##\) "BR04"/],
    ["src/boot.ts:38 순서 지키기", /파일 위치\(file:line\) "src\/boot\.ts:38"/],
  ];
  for (const [description, why] of cases) {
    rejects(() => addMemory(pdir, "profile", { type: "rule", name: `규칙 ${description}`, description }), why, /--project로/);
  }
  assert.equal(listMemories(pdir).length, 0);
  // 긴 본문도 검사 시간이 묶인다(정규식은 앞 2,000자만)
  const started = Date.now();
  rejects(() => addMemory(pdir, "profile", { type: "rule", name: "긴 본문", description: "x", body: "a.".repeat(40_000) }), /본문 80000자/);
  assert.ok(Date.now() - started < 1000);
  // 한글에 붙은 번호도 잡는다
  rejects(() => addMemory(pdir, "profile", { type: "rule", name: "붙은 번호", description: "프로젝트P013 먼저" }), /"P013"/);
  // 숫자 자리가 다르거나 낱말 안이면 프로젝트 번호가 아니다. 시각·버전·IP·비율은 file:line이 아니다
  addMemory(pdir, "profile", { type: "user", name: "장비", description: "MP0130 키보드, 2026-10-31 기준 v1.2" });
  addMemory(pdir, "profile", { type: "user", name: "환경", description: "회의 10.30:15, node v24.1:2, 프록시 127.0.0.1:8080, 화면 3.5:1" });
  for (const path of ["boot.test.ts:20", "../src/a.ts:3", "/Users/x/a.ts:3", "~/x/a.ts:3", ".pace/memory/x.md:4"]) {
    assert.throws(
      () => addMemory(pdir, "profile", { type: "rule", name: `경로 ${path}`, description: `${path} 기준` }),
      (e: Error) => e.message.includes(`파일 위치(file:line) "${path}"`),
      path,
    );
  }
  const jdir = projectMemoryDir(tempDir());
  for (const [description] of cases) addMemory(jdir, "project", { type: "note", name: `메모 ${description}`, description });
  assert.equal(listMemories(jdir).length, 4);
});

test("가드 ④: 요약 160자·본문 400자 초과는 거부, status와 바꾸지 않는 필드는 검사하지 않는다", () => {
  const dir = projectMemoryDir(tempDir());
  assert.deepEqual(MEMORY_LIMITS, { description: 160, body: 400 });
  addMemory(dir, "project", { type: "note", name: "경계", description: "가".repeat(160), body: "나".repeat(400) });
  rejects(() => addMemory(dir, "project", { type: "note", name: "긴 요약", description: "다".repeat(161) }), /요약 161자 > 160/, /행동 지시형/);
  rejects(() => addMemory(dir, "project", { type: "note", name: "긴 본문", description: "x", body: "라".repeat(401) }), /본문 401자 > 400/, /브레인/);
  setStatus(dir, "마".repeat(2000));
  addMemory(dir, "project", { type: "status", name: "진행 상황", description: "d", body: "바".repeat(2000) });
  // 기존 긴 본문(가드 전 저장)은 소급하지 않는다 — 요약만 바꾸는 update는 통과
  addMemory(dir, "project", { type: "note", name: "옛 기억", description: "y", body: "사".repeat(900) }, { force: true });
  updateMemory(dir, "project", "옛-기억", { description: "짧게 고친 요약" });
  rejects(() => updateMemory(dir, "project", "옛-기억", { body: "아".repeat(401) }), /본문 401자/);
});

test("부트 축약 때 진행 상황은 600자로 자르고 열린 코드 블록을 닫는다", () => {
  const dir = projectMemoryDir(tempDir());
  setStatus(dir, `시작\n\`\`\`\n${"코드 ".repeat(400)}\n\`\`\`\n끝`);
  assert.doesNotMatch(bootView(dir, "project").text, /전체: `pace memory status/, "줄이지 않을 때는 그대로");
  const text = bootView(dir, "project", new Date(), { maxItems: 10 }).text;
  assert.match(text, /코드 ?\n```… \(전체: `pace memory status --project`\)/);
  assert.equal((text.match(/```/g)?.length ?? 0) % 2, 0, "코드 블록이 닫힌다");
});

/** 가짜 토큰 — 소스에 원문을 두지 않으려 런타임에 잇는다(보안 검사 오탐 방지). */
const FAKE_TOKEN = ["gh", "p_", "Zq9".repeat(12)].join("");

test("slug 검증: 경로·대문자·빈 값·예약어 slug는 파일에 닿기 전에 거부, 폴더 밖 파일은 그대로", () => {
  const dir = projectMemoryDir(tempDir());
  addMemory(dir, "project", { type: "issue", name: "한글 이슈", description: "정상 slug" });
  const outside = join(dirname(dir), "outside.md");
  writeFileSync(outside, "---\nname: 미끼\ndescription: 밖\ntype: issue\n---\n비밀 아님\n");
  const indexBefore = readFileSync(join(dir, "INDEX.md"), "utf8");
  completeMemory(dir, "project", "한글-이슈", "닫음");
  addMemory(dir, "project", { type: "issue", name: "두번째", description: "남김" });
  const historyBefore = readFileSync(join(dir, "history.md"), "utf8");
  const bad = ["../outside", "a/b", outside.slice(0, -3), "", "INDEX", "index", "history", "Two", "../../etc/x", "x/../두번째"];
  for (const slug of bad) {
    assert.throws(() => readMemory(dir, slug), /잘못된 slug/, `read ${slug}`);
    assert.throws(() => removeMemory(dir, "project", slug), /잘못된 slug/, `remove ${slug}`);
    assert.throws(() => completeMemory(dir, "project", slug), /잘못된 slug/, `done ${slug}`);
    assert.throws(() => updateMemory(dir, "project", slug, { body: "덮어쓰기" }), /잘못된 slug/, `update ${slug}`);
  }
  assert.ok(existsSync(outside), "폴더 밖 미끼 파일은 지워지지 않는다");
  assert.match(readFileSync(outside, "utf8"), /비밀 아님/);
  assert.equal(readFileSync(join(dir, "history.md"), "utf8"), historyBefore);
  assert.notEqual(indexBefore, "");
  assert.ok(existsSync(join(dir, "INDEX.md")));
  assert.equal(readMemory(dir, "두번째").description, "남김");
});

test("slug 검증: 이름이 예약어(History·Index)인 항목은 만들지 않는다 — 목차·이력 파일을 덮지 않는다", () => {
  const dir = projectMemoryDir(tempDir());
  addMemory(dir, "project", { type: "todo", name: "정상", description: "있음" });
  for (const name of ["History", "index", "INDEX"]) {
    assert.throws(() => addMemory(dir, "project", { type: "todo", name, description: `예약 ${name}` }, { force: true }), /예약된 이름/);
  }
  assert.ok(!existsSync(join(dir, "history.md")));
  assert.deepEqual(readdirSync(dir).filter((f) => f !== "INDEX.md"), ["정상.md"]);
  assert.match(readFileSync(join(dir, "INDEX.md"), "utf8"), /# 메모리 목차/);
});

test("slug 검증: 정상 slug(한글)·status는 그대로 동작하고 slugify는 멱등이다", () => {
  const dir = projectMemoryDir(tempDir());
  setStatus(dir, "진행 중");
  assert.equal(readMemory(dir, "status").body, "진행 중");
  const long = addMemory(dir, "project", { type: "todo", name: `${"가".repeat(79)} 끝`, description: "80자 경계" });
  assert.ok(!long.slug.endsWith("-"), "자른 끝에 - 가 남지 않는다");
  assert.equal(readMemory(dir, long.slug).description, "80자 경계");
  addMemory(dir, "project", { type: "todo", name: "메모리 보안 가드", description: "할 일" });
  updateMemory(dir, "project", "메모리-보안-가드", { description: "고친 할 일" });
  assert.equal(readMemory(dir, "메모리-보안-가드").description, "고친 할 일");
  completeMemory(dir, "project", "메모리-보안-가드", "끝");
  removeMemory(dir, "project", long.slug);
  assert.deepEqual(listMemories(dir).map((e) => e.slug), ["status"]);
});

test("비밀 가드: add·update·status·done 결과의 비밀은 --force로도 거부, 파일·이력·메시지에 원문 없음", () => {
  const dir = projectMemoryDir(tempDir());
  addMemory(dir, "project", { type: "issue", name: "토큰 이슈", description: "정상" });
  const files = () => readdirSync(dir).sort();
  const snapshot = () => files().map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  const before = snapshot();
  const expectSecret = (fn: () => unknown, field: RegExp) =>
    assert.throws(fn, (e: Error) => {
      assert.match(e.message, /비밀로 보이는 값/);
      assert.match(e.message, field);
      assert.ok(!e.message.includes(FAKE_TOKEN), "메시지에 원문이 없다");
      return true;
    });
  expectSecret(() => addMemory(dir, "project", { type: "note", name: "키", description: "요약", body: `token ${FAKE_TOKEN}` }), /본문/);
  expectSecret(() => addMemory(dir, "project", { type: "note", name: "키2", description: `api_key=${"q1w2e3r4t5y6"}` }, { force: true }), /요약/);
  expectSecret(() => addMemory(dir, "project", { type: "note", name: FAKE_TOKEN, description: "요약" }, { force: true }), /제목/);
  expectSecret(() => addMemory(dir, "project", { type: "status", name: "진행", description: "요약", body: FAKE_TOKEN }, { force: true }), /본문/);
  expectSecret(() => updateMemory(dir, "project", "토큰-이슈", { body: FAKE_TOKEN }, { force: true }), /본문/);
  expectSecret(() => setStatus(dir, `다음: ${FAKE_TOKEN}`), /본문/);
  expectSecret(() => updateMemory(dir, "project", "토큰-이슈", { name: FAKE_TOKEN }, { force: true }), /제목/);
  expectSecret(() => updateMemory(dir, "project", "토큰-이슈", { description: `api_key=${"q1w2e3r4t5y6"}` }, { force: true }), /요약/);
  expectSecret(() => setStatus(dir, "정상", `다음 ${FAKE_TOKEN}`), /요약/);
  assert.throws(() => readMemory(dir, `x/${FAKE_TOKEN}`), (e: Error) => /잘못된 slug/.test(e.message) && !e.message.includes(FAKE_TOKEN));
  expectSecret(() => completeMemory(dir, "project", "토큰-이슈", `고침 ${FAKE_TOKEN}`), /결과/);
  assert.equal(snapshot(), before, "파일·목차·이력이 바뀌지 않는다");
  assert.ok(!existsSync(join(dir, "history.md")));
  // 환경 변수 이름·자리표시는 비밀이 아니다
  addMemory(dir, "project", { type: "note", name: "키 위치", description: "token=GITHUB_TOKEN 으로 읽는다" });
});

test("보안 후속: 대소문자 접기로 예약 파일에 닿는 slug(hiſtory·ſtatus·ındex)는 거부한다", () => {
  const dir = projectMemoryDir(tempDir());
  addMemory(dir, "project", { type: "issue", name: "닫을 것", description: "이력용" });
  completeMemory(dir, "project", "닫을-것", "끝");
  setStatus(dir, "진행");
  const history = readFileSync(join(dir, "history.md"), "utf8");
  for (const slug of ["hiſtory", "ſtatus", "ındex"]) {
    assert.throws(() => readMemory(dir, slug), /잘못된 slug/, slug);
    assert.throws(() => removeMemory(dir, "project", slug), /잘못된 slug/, slug);
    assert.throws(() => updateMemory(dir, "project", slug, { body: "덮어쓰기" }), /잘못된 slug/, slug);
    assert.throws(() => addMemory(dir, "project", { type: "todo", name: slug, description: `접기 ${slug}` }, { force: true }), /예약된 이름/, slug);
  }
  assert.equal(readFileSync(join(dir, "history.md"), "utf8"), history);
  assert.equal(readMemory(dir, "status").body, "진행");
});

test("보안 후속: read·remove는 NFC로 맞춘 이름이 정확히 같은 파일만 — 대소문자 접기(ſ→s)로 다른 파일에 닿지 않고, NFD 한글 파일은 다룰 수 있다", () => {
  const dir = projectMemoryDir(tempDir());
  addMemory(dir, "project", { type: "note", name: "stuff", description: "접기 대상" });
  const folds = existsSync(join(dir, "ſtuff.md")); // 대소문자를 무시하는 파일 시스템(macOS APFS·Windows)
  for (const slug of ["ſtuff"]) {
    assert.throws(() => readMemory(dir, slug), /없는 기억/, `fold=${folds}`);
    assert.throws(() => removeMemory(dir, "project", slug), /없는 기억/);
    assert.throws(() => updateMemory(dir, "project", slug, { body: "덮어쓰기" }), /없는 기억/);
  }
  assert.equal(readMemory(dir, "stuff").body, "");
  assert.ok(readdirSync(dir).includes("stuff.md"));

  const nfd = "가나".normalize("NFD");
  writeFileSync(join(dir, `${nfd}.md`), "---\nname: 가나\ndescription: NFD\ntype: note\n---\nNFD 본문\n");
  assert.ok(listMemories(dir).some((e) => e.slug === "가나"), "목록에는 NFC slug로");
  assert.equal(readMemory(dir, "가나").body, "NFD 본문");
  updateMemory(dir, "project", "가나", { body: "고침" });
  assert.equal(readMemory(dir, "가나").body, "고침");
  assert.equal(readdirSync(dir).filter((f) => f.normalize("NFC") === "가나.md").length, 1, "중복 파일을 만들지 않는다");
  removeMemory(dir, "project", "가나");
  assert.ok(!readdirSync(dir).some((f) => f.normalize("NFC") === "가나.md"));

  mkdirSync(join(dir, "폴더.md"));
  assert.throws(() => readMemory(dir, "폴더"), /일반 파일이 아닌 기억/);
  assert.throws(() => removeMemory(dir, "project", "폴더"), /파일이 아닌 기억/);
  assert.ok(!listMemories(dir).some((e) => e.slug === "폴더"));
});

test("보안 후속: 메모리 폴더의 심볼릭 링크는 읽지 않고, 목록·부트에서 빠지며, 깨진 링크도 부트를 막지 않는다", () => {
  const root = tempDir();
  const dir = projectMemoryDir(root);
  addMemory(dir, "project", { type: "issue", name: "정상", description: "보임" });
  const outside = join(root, "outside.md");
  writeFileSync(outside, "---\nname: 밖\ndescription: 밖 요약\ntype: status\n---\nOUTSIDE CONTENT\n");
  symlinkSync(outside, join(dir, "link.md"));
  symlinkSync(join(root, "없음.md"), join(dir, "broken.md"));
  assert.throws(() => readMemory(dir, "link"), /일반 파일이 아닌 기억/);
  assert.deepEqual(listMemories(dir).map((e) => e.slug), ["정상"]);
  const view = bootView(dir, "project");
  assert.ok(!view.text.includes("OUTSIDE CONTENT") && !view.text.includes("밖 요약"));
  assert.match(view.text, /정상/);
  removeMemory(dir, "project", "link");
  assert.ok(!existsSync(join(dir, "link.md")) && existsSync(outside), "링크만 지우고 대상은 그대로");

  // status.md 링크: setStatus는 링크를 따라가 읽지 않고(created 복사 없음) 바깥 파일도 바꾸지 않는다
  const outsideStatus = join(root, "outside-status.md");
  const outsideText = "---\nname: 밖\ndescription: 밖\ntype: status\ncreated: LEAKED-VALUE\nupdated: x\n---\n밖 본문\n";
  writeFileSync(outsideStatus, outsideText);
  symlinkSync(outsideStatus, join(dir, "status.md"));
  const status = setStatus(dir, "진행");
  assert.notEqual(status.created, "LEAKED-VALUE");
  assert.equal(readFileSync(outsideStatus, "utf8"), outsideText);
  assert.equal(readMemory(dir, "status").body, "진행");
});

test("보안 후속: history.md가 심볼릭 링크면 done은 폴더 밖에 덧붙이지 않고 부트 최근 완료에도 쓰지 않는다", () => {
  const root = tempDir();
  const dir = projectMemoryDir(root);
  addMemory(dir, "project", { type: "issue", name: "닫기", description: "링크 이력" });
  const outside = join(root, "rc");
  writeFileSync(outside, "- 바깥 줄\n");
  symlinkSync(outside, join(dir, "history.md"));
  assert.throws(() => completeMemory(dir, "project", "닫기", "끝"), /일반 파일이 아니다/);
  assert.equal(readFileSync(outside, "utf8"), "- 바깥 줄\n");
  assert.ok(existsSync(join(dir, "닫기.md")), "항목도 지우지 않는다");
  assert.deepEqual(readHistory(dir, 3), []);
});

test("보안 후속: 마감(due)은 YYYY-MM-DD만 받는다 — 자유 문자열로 비밀·지시를 넣지 못한다", () => {
  const dir = projectMemoryDir(tempDir());
  const bad = `token=${"abcd1234efgh"}`;
  assert.throws(() => addMemory(dir, "project", { type: "todo", name: "마감", description: "d", due: bad }, { force: true }), /YYYY-MM-DD/);
  assert.ok(!existsSync(join(dir, "마감.md")));
  addMemory(dir, "project", { type: "todo", name: "마감", description: "d", due: "2026-11-01" });
  assert.throws(() => updateMemory(dir, "project", "마감", { due: "내일" }, { force: true }), /YYYY-MM-DD/);
  assert.equal(readMemory(dir, "마감").due, "2026-11-01");
});
