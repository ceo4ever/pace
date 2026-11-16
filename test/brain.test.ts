import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import {
  addPage,
  formatLint,
  sourcePaths,
  brainUpdateCandidates,
  findBrainRoot,
  ingestScan,
  initBrain,
  lintBrain,
  listPages,
  rebuildBrainIndex,
  searchBrain,
  updatePage,
} from "../src/project/brain.ts";
import { tempDir } from "./helpers.ts";

const PAGE = (fm: string, body: string) => `---\n${fm}\n---\n${body}\n`;
const META = "created: 2026-10-01\nupdated: 2026-10-01\nstatus: active\nsources: [대화:2026-10-01]";

function brain(): string {
  const root = tempDir();
  initBrain(root);
  return root;
}

function write(root: string, folder: string, file: string, content: string): void {
  mkdirSync(join(root, ".pace", "brain", "pages", folder), { recursive: true });
  writeFileSync(join(root, ".pace", "brain", "pages", folder, `${file}.md`), content);
}

test("init: SCHEMA·목차·기록·분류 폴더(term 포함), 두 번째는 건드리지 않음, 하위 폴더에서도 루트 찾기", () => {
  const root = brain();
  for (const p of ["SCHEMA.md", "index.md", "log.md", "pages/concept", "pages/term"]) assert.ok(existsSync(join(root, ".pace", "brain", p)), p);
  assert.equal(initBrain(root).created, false);
  mkdirSync(join(root, "a", "b"), { recursive: true });
  assert.equal(findBrainRoot(join(root, "a", "b")), root);
});

test("v1 페이지 호환: 알 수 없는 폴더도 분류, 들여쓰기 없는 태그, summary 없으면 첫 문단", () => {
  const root = brain();
  write(root, "glossary", "roas", PAGE("type: glossary\ntitle: ROAS\ntags:\n- metric\n" + META, "## 뜻\n광고비 대비 매출."));
  const [page] = listPages(root);
  assert.equal(page!.folder, "glossary");
  assert.deepEqual(page!.tags, ["metric"]);
  assert.equal(page!.summary, "광고비 대비 매출.");
  assert.match(rebuildBrainIndex(root), /## glossary\n\n- \[ROAS\]\(pages\/glossary\/roas\.md\) — 광고비 대비 매출\. #metric/);
});

test("네이티브 페이지 경로: 파일 ID·제목 기본값·폴더 및 기존 링크를 유지하며 추가·수정한다", () => {
  const root = brain();
  const names = ["경로-하나", "경로-둘", "경로-셋"];
  for (const [index, file] of names.entries()) {
    const target = names[(index + 1) % names.length]!;
    write(root, "concept", file, PAGE(`type: concept\ntitle: 문서 ${index + 1}\nsummary: 경로 검사\nrelated: [${target}]\n${META}`, `## 연결\n[[${target}]]`));
  }
  const before = names.map((file) => readFileSync(join(root, ".pace", "brain", "pages", "concept", `${file}.md`), "utf8"));
  const pages = listPages(root);
  assert.deepEqual(pages.map((page) => page.file).sort(), [...names].sort());
  assert.ok(pages.every((page) => page.folder === "concept"));
  assert.deepEqual(lintBrain(root).issues.filter((issue) => issue.severity === "error"), [], "실제 존재하는 related·본문 링크 6개를 찾는다");
  const added = addPage(root, { type: "flow", title: "경로 추가", summary: "새 페이지", body: "## 연결\n[[경로-하나]]", related: ["경로-둘"], sources: ["대화:2026-11-06"] });
  assert.equal(added.lint.issues.filter((issue) => issue.severity === "error").length, 0);
  updatePage(root, "경로-추가", { body: "## 연결\n[[경로-셋]]", related: ["경로-하나"] });
  const addedPage = listPages(root).find((page) => page.file === "경로-추가")!;
  assert.equal(addedPage.folder, "flow");
  assert.equal(addedPage.type, "flow");
  assert.deepEqual(names.map((file) => readFileSync(join(root, ".pace", "brain", "pages", "concept", `${file}.md`), "utf8")), before, "기존 페이지를 고쳐서 링크 오류를 숨기지 않는다");
  assert.match(rebuildBrainIndex(root), /\(pages\/flow\/경로-추가\.md\)/);
  assert.throws(() => addPage(root, { type: "concept", title: "거부할 링크", summary: "없음", body: "[[실제-없는-페이지]]" }), /broken_link/);
  write(root, "concept", "제목-기본값", PAGE(`type: concept\nsummary: 제목 없음\n${META}`, "## 본문\n검사"));
  assert.equal(listPages(root).find((page) => page.file === "제목-기본값")?.title, "제목-기본값");
});

test("검색: 관련 절을 모아 출처와 함께, 페이지당 2절, 상한, 목록 모드", () => {
  const root = brain();
  write(root, "concept", "hooks", PAGE("type: concept\ntitle: 부트 훅\nsummary: 세션 시작 훅\n" + META,
    "## Codex\nCodex는 첫 메시지 때 훅 실행.\n\n## Claude\nClaude는 열 때 훅 실행.\n\n## Cursor\nCursor 훅은 호출 안 됨.\n\n## 무관\n다른 이야기."));
  write(root, "concept", "other", PAGE("type: concept\ntitle: 설치\nsummary: 설치 이야기\n" + META, "## 설치\n훅 등록."));
  const result = searchBrain(root, "훅 실행");
  assert.ok(result.sections.length >= 2);
  assert.ok(result.sections.every((s) => s.heading !== "무관"), "검색어 없는 절은 빼고");
  assert.ok(result.sections.filter((s) => s.page.file === "hooks").length <= 2, "페이지당 2절");
  assert.ok(result.sections[0]!.text.includes("훅 실행"));
  const small = searchBrain(root, "훅", { budget: 10 });
  assert.equal(small.sections.length, 1, "상한을 넘으면 첫 절만");
  assert.ok(small.truncated);
  assert.deepEqual(searchBrain(root, "설치", { list: true }).pages.map((p) => p.page.file)[0], "other");
});

test("검색: 공백 무시(자동 취소 = 자동취소), type·tag 필터, 초안 용어 기본 제외, 낡은 페이지 감점", () => {
  const root = brain();
  write(root, "concept", "cancel", PAGE("type: concept\ntitle: 주문 자동취소 규칙\nsummary: 미결제 주문\ntags: [order]\n" + META, "## 규칙\n24시간 뒤 자동취소."));
  write(root, "term", "draft-term", PAGE("type: term\ntitle: 자동 취소\nsummary: 용어\n" + META.replace("active", "draft"), "## 뜻\n자동 취소."));
  assert.equal(searchBrain(root, "자동 취소", { list: true }).pages.length, 1, "초안 용어 제외");
  assert.equal(searchBrain(root, "자동 취소", { list: true, includeDraft: true }).pages.length, 2);
  assert.equal(searchBrain(root, "자동취소", { list: true, type: "term", includeDraft: true }).pages[0]!.page.file, "draft-term");
  assert.equal(searchBrain(root, "자동취소", { list: true, tag: "order" }).pages.length, 1);
  assert.equal(searchBrain(root, "없는말").pages.length, 0);
});

test("lint: 오류(frontmatter·끊어진 링크·미실체)와 경고(고아·빠진 링크·근거 없음·summary 없음·낡음), --fix는 형식만", () => {
  const root = brain();
  write(root, "concept", "bad-date", PAGE("type: concept\ntitle: 날짜\nsummary: s\ncreated: 2026/10/01\nupdated: 2026-10-01\nstatus: active\nsources: [x]", "본문"));
  write(root, "entity", "wrong-folder", PAGE("type: concept\ntitle: 폴더 다름\nsummary: s\n" + META, "[[nowhere]] 링크"));
  write(root, "concept", "plan", PAGE("type: concept\ntitle: 결제 개편\nsummary: s\n" + META, "## 향후계획\n언젠가."));
  write(root, "concept", "lonely-old", PAGE("type: concept\ntitle: 혼자 있는 낡은 페이지\ncreated: 2026-10-01\nupdated: 2026-10-01\nstatus: stale\ntags:\n- a", "결제 개편 이야기."));
  const { issues } = lintBrain(root);
  const kinds = (page: string) => issues.filter((i) => i.page.endsWith(`${page}.md`)).map((i) => i.kind).sort();
  assert.deepEqual(kinds("bad-date"), ["frontmatter_invalid", "orphan"]);
  assert.deepEqual(kinds("wrong-folder"), ["broken_link", "frontmatter_invalid", "orphan"]);
  assert.ok(kinds("plan").includes("speculative"));
  assert.deepEqual(kinds("lonely-old"), ["missing_link", "orphan", "stale", "summary_missing", "unsourced"]);
  assert.equal(issues.find((i) => i.kind === "speculative")!.severity, "error");
  assert.equal(issues.find((i) => i.kind === "orphan")!.severity, "warn");

  const fixed = lintBrain(root, { fix: true }).fixed;
  assert.deepEqual(fixed, [".pace/brain/pages/concept/lonely-old.md"]);
  assert.match(readFileSync(join(root, ".pace", "brain", "pages", "concept", "lonely-old.md"), "utf8"), /^tags: \[a\]$/m);
});

test("lint: 제목 정규화와 기존 링크, 자기 자신과 같은 파일명의 페이지를 구분한다", () => {
  const root = brain();
  write(root, "concept", "a", PAGE(`type: concept\ntitle: First Title\nsummary: s\ntags:\n- sample\n${META}`, "second title 및 Third Title, Other Title, AB와 First Title"));
  write(root, "concept", "b", PAGE(`type: concept\ntitle: Second  Title\nsummary: s\n${META}`, "First Title [[a]]"));
  write(root, "concept", "c", PAGE(`type: concept\ntitle: Third Title\nsummary: s\n${META}`, "없음"));
  write(root, "term", "a", PAGE(`type: term\ntitle: Other Title\nsummary: s\n${META}`, "아무것도 없음"));
  write(root, "concept", "short", PAGE(`type: concept\ntitle: AB\nsummary: s\n${META}`, "없음"));
  const result = lintBrain(root);
  assert.deepEqual(result.issues.filter((issue) => issue.kind === "missing_link"), [
    { kind: "missing_link", severity: "warn", page: ".pace/brain/pages/concept/a.md", detail: '본문에 "Second  Title"이 나오지만 [[b]] 링크가 없다' },
    { kind: "missing_link", severity: "warn", page: ".pace/brain/pages/concept/a.md", detail: '본문에 "Third Title"이 나오지만 [[c]] 링크가 없다' },
  ]);
  const fixed = lintBrain(root, { fix: true });
  assert.equal(fixed.fixed.length, 1);
  assert.deepEqual(fixed.issues, result.issues);
});

test("lint: 긴 본문의 큰 브레인에서 반복 정규화 성능 회귀를 막는다", () => {
  const root = brain();
  const body = "근거와 설명을 포함한 자세한 문장입니다. ".repeat(80);
  for (let i = 0; i < 600; i++) {
    write(root, "concept", `page-${i}`, PAGE(`type: concept\ntitle: 독립 제목 ${i}\nsummary: s\n${META}`, body));
  }
  const start = performance.now();
  lintBrain(root);
  assert.ok(performance.now() - start < 5000, "600페이지 lint는 5초 이내여야 한다");
});

test("add: 검사를 통과해야 쓰고, 쓴 뒤 lint·목차·기록 — 미실체는 --force --note로만", () => {
  const root = brain();
  const ok = addPage(root, { type: "concept", title: "부트 결정", summary: "훅으로", body: "## 이유\n확실히 실행.", sources: ["code:src/boot.ts"] });
  assert.equal(ok.page, ".pace/brain/pages/concept/부트-결정.md");
  assert.match(readFileSync(join(root, ".pace", "brain", "index.md"), "utf8"), /부트 결정/);
  assert.match(readFileSync(join(root, ".pace", "brain", "log.md"), "utf8"), /## \[\d{4}-\d{2}-\d{2}\] ingest \| 부트 결정/);

  assert.throws(() => addPage(root, { type: "concept", title: "부트 결정", summary: "x", body: "x" }), /이미 있는 페이지/);
  assert.throws(() => addPage(root, { type: "concept", title: "링크", summary: "x", body: "[[없는-페이지]]" }), /쓰지 않았다[\s\S]*broken_link/);
  assert.throws(() => addPage(root, { type: "concept", title: "미확정 설계", summary: "x", body: "x" }), /speculative/);
  assert.throws(() => addPage(root, { type: "concept", title: "미확정 설계", summary: "x", body: "x" }, { force: true }), /--note/);
  addPage(root, { type: "concept", title: "미확정 설계", summary: "x", body: "x" }, { force: true, note: "사용자 요청" });
  assert.match(readFileSync(join(root, ".pace", "brain", "pages", "concept", "미확정-설계.md"), "utf8"), /speculative_override: true/);
});

test("update: created 보존, updated·sources 갱신, 수정도 검사", () => {
  const root = brain();
  write(root, "concept", "old", PAGE("type: concept\ntitle: 옛 결정\nsummary: s\ncreated: 2026-01-01\nupdated: 2026-01-01\nstatus: active\nsources: [a]", "본문"));
  updatePage(root, "old", { summary: "새 요약", appendSources: ["b"] });
  const [page] = listPages(root);
  assert.equal(page!.created, "2026-01-01");
  assert.notEqual(page!.updated, "2026-01-01");
  assert.deepEqual(page!.sources, ["a", "b"]);
  assert.equal(page!.summary, "새 요약");
  assert.throws(() => updatePage(root, "old", { body: "[[없음]]" }), /broken_link/);
  assert.throws(() => updatePage(root, "nope", {}), /없는 페이지/);
});

test("쓰기 부분 검사는 전체 lint의 새 이슈·바뀐 페이지·양방향 링크와 일치한다", () => {
  const root = brain();
  write(root, "concept", "a", PAGE(`type: concept\ntitle: Alpha Page\nsummary: s\nrelated: [b]\n${META}`, "기존 참조 New Topic과 Revised Topic"));
  write(root, "concept", "b", PAGE(`type: concept\ntitle: Beta Page\nsummary: s\n${META}`, "New Topic과 Revised Topic 및 Alpha Page"));
  write(root, "term", "a", PAGE(`type: term\ntitle: Duplicate File\nsummary: s\n${META}`, "New Topic"));
  const issueKey = (issue: object) => JSON.stringify(issue);
  const verify = (action: () => { page: string; lint: { issues: object[] } }, title: string) => {
    const before = new Set(lintBrain(root).issues.map(issueKey));
    const result = action();
    const full = lintBrain(root).issues;
    const actual = new Set(result.lint.issues.map(issueKey));
    const expected = new Set(full.map(issueKey));
    for (const issue of actual) assert.ok(expected.has(issue), `전체 lint에 없는 이슈: ${issue}`);
    const relevant = new Set<string>();
    for (const issue of full) {
      if (!before.has(issueKey(issue)) || issue.page === result.page || (issue.kind === "missing_link" && issue.detail.includes(`"${title}"`))) {
        relevant.add(issueKey(issue));
      }
    }
    assert.deepEqual(actual, relevant, "관련 이슈는 빠짐없이 보고하고 무관한 이슈는 제외한다");
  };
  verify(() => addPage(root, { type: "concept", title: "New Topic", summary: "s", body: "Alpha Page", sources: ["code:missing.ts"] }), "New Topic");
  verify(() => updatePage(root, "new-topic", { title: "Revised Topic", body: "Beta Page", related: ["a"] }), "Revised Topic");
  verify(() => updatePage(root, "new-topic", { related: [] }), "Revised Topic");
  verify(() => updatePage(root, "a", { related: [] }), "Alpha Page");
  const single = brain();
  write(single, "concept", "only", PAGE(`type: concept\ntitle: Only Page\nsummary: s\n${META}`, "본문"));
  const added = addPage(single, { type: "concept", title: "Second Page", summary: "s", body: "본문" });
  assert.ok(added.lint.issues.some((issue) => issue.kind === "orphan" && issue.page.endsWith("only.md")), "한 페이지에서 두 페이지가 될 때 기존 고아도 보고한다");
});

test("쓰기 오류는 페이지·목차·기록을 보존하고 각 쓰기는 목록을 한 번 읽는다", () => {
  const root = brain();
  const page = addPage(root, { type: "concept", title: "Original Page", summary: "s", body: "본문" });
  const paths = [join(root, page.page), join(root, ".pace", "brain", "index.md"), join(root, ".pace", "brain", "log.md")];
  const before = paths.map((path) => readFileSync(path, "utf8"));
  for (const patch of [{ body: "[[없는-링크]]" }, { title: "미확정 계획" }, { status: "invalid" }]) {
    assert.throws(() => updatePage(root, "original-page", patch), /쓰지 않았다/);
    assert.deepEqual(paths.map((path) => readFileSync(path, "utf8")), before);
  }
  const original = fs.readdirSync;
  let reads = 0;
  try {
    fs.readdirSync = ((path: fs.PathLike, ...args: unknown[]) => {
      if (String(path) === join(root, ".pace", "brain", "pages")) reads++;
      return (original as (...args: unknown[]) => unknown)(path, ...args);
    }) as typeof fs.readdirSync;
    syncBuiltinESMExports();
    updatePage(root, "original-page", { body: "고친 본문" });
    assert.equal(reads, 1, "update의 찾기·검사·목차는 목록을 공유한다");
    reads = 0;
    addPage(root, { type: "concept", title: "Another Page", summary: "s", body: "본문" });
    assert.equal(reads, 1, "add의 검사·목차는 목록을 공유한다");
  } finally {
    fs.readdirSync = original;
    syncBuiltinESMExports();
  }
});

test("CLI 쓰기 결과는 부분 점검과 전체 lint 안내를 보여준다", () => {
  const root = brain();
  for (const [action, args] of [
    ["add", ["--type", "concept", "--title", "CLI Page", "--summary", "s", "--body", "본문"]],
    ["update", ["cli-page", "--body", "고친 본문"]],
  ] as const) {
    const result = spawnSync(process.execPath, [join(process.cwd(), "bin", "pace.ts"), "brain", action, "--cwd", root, ...args], { encoding: "utf8", env: { ...process.env, PACE_HOME: tempDir() } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /전체 점검은 pace brain lint/);
    assert.match(result.stdout, /\[unsourced\]/);
  }
});

test("쓰기 후 목차 순서는 확장자를 포함해 전체 목록을 다시 읽은 순서와 같다", () => {
  const root = brain();
  addPage(root, { type: "concept", title: "Base Topic", file: "brain-lint", summary: "s", body: "본문" });
  addPage(root, { type: "concept", title: "Other Topic", file: "brain", summary: "s", body: "본문" });
  const index = readFileSync(join(root, ".pace", "brain", "index.md"), "utf8");
  assert.ok(index.indexOf("brain-lint.md") < index.indexOf("brain.md"));
  assert.equal(rebuildBrainIndex(root), index);
});

test("쓰기 성능: 긴 본문을 가진 많은 페이지에서도 부분 검사만 한다", () => {
  const root = brain();
  const body = "근거와 설명을 포함한 자세한 문장입니다. ".repeat(100);
  for (let i = 0; i < 600; i++) write(root, "concept", `page-${i}`, PAGE(`type: concept\ntitle: 독립 제목 ${i}\nsummary: s\n${META}`, body));
  const start = performance.now();
  addPage(root, { type: "concept", title: "새로운 기록", summary: "s", body: "본문" });
  assert.ok(performance.now() - start < 5000, "600페이지 쓰기는 5초 이내여야 한다");
});

test("ingest-scan: docs·skills·backlogs 후보, sources에 있으면 이미 담음", () => {
  const root = brain();
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "docs", "PROJECT.md"), "# p");
  mkdirSync(join(root, "skills", "x"), { recursive: true });
  writeFileSync(join(root, "skills", "x", "SKILL.md"), "# s");
  mkdirSync(join(root, "backlogs", "BL261022_01_재구축"), { recursive: true });
  writeFileSync(join(root, "backlogs", "BL261022_01_재구축", "BACKLOG.md"), "# b");
  writeFileSync(join(root, "backlogs", "BL261022_01_재구축", "BR01_시작.md"), "# brief");
  addPage(root, { type: "synthesis", title: "프로젝트 정의 요약", summary: "s", body: "b", sources: ["doc:docs/PROJECT.md"] });
  assert.deepEqual(
    ingestScan(root).map((i) => `${i.kind}:${i.path}:${i.done}`),
    ["doc:docs/PROJECT.md:true", "skill:skills/x/SKILL.md:false", "backlog:backlogs/BL261022_01_재구축/BACKLOG.md:false", "backlog:backlogs/BL261022_01_재구축/BR01_시작.md:false"],
  );
});


test("sources: repository paths and line references, opaque or escaping provenance excluded", () => {
  assert.deepEqual(sourcePaths(["code:src/a.ts", "doc:docs/a.md:12", "backlog:backlogs/b.md", "src/a.ts:2:3", "file:README.md:1", "./docs/한 글.md#L2-L4", "url:https://a/b", "https://a/b", "대화:2026-10-24", "project:P007", "../secret", "code:/tmp/a", "code:../a", "v1:backup/a", "word", "backlog:261022 D8·D15", "code:src/boot.ts bootNotice", "test:test/brain.test.ts:10-20", "src/range.ts:10-20"]),
    ["src/a.ts", "docs/a.md", "backlogs/b.md", "README.md", "docs/한 글.md", "src/boot.ts", "test/brain.test.ts", "src/range.ts"]);
});

test("stale-source: missing and author date changes warn, same/older dates do not, writes succeed", () => {
  const root = brain();
  const git = (...args: string[]) => {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: "2026-10-02T12:00:00+0900", GIT_COMMITTER_DATE: "2026-10-23T12:00:00+0900" } });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q");
  git("config", "user.name", "test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "ref.md"), "reference");
  git("add", "ref.md"); git("commit", "-qm", "source");
  for (const [name, date] of [["old", "2026-10-01"], ["same", "2026-10-02"], ["new", "2026-10-03"]]) {
    write(root, "concept", name!, PAGE(`type: concept\ntitle: ${name}\nsummary: s\ncreated: 2026-10-01\nupdated: ${date}\nstatus: active\nsources: [doc:ref.md:2, code:gone.ts, url:https://example.com/no, 대화:2026-10-01]`, "## Why\nA decision."));
  }
  const stale = lintBrain(root).issues.filter((i) => i.kind === "stale-source");
  assert.equal(stale.length, 4);
  assert.ok(stale.every((i) => i.severity === "warn"));
  assert.equal(stale.filter((i) => i.detail.startsWith("changed:")).length, 1);
  assert.match(stale.find((i) => i.detail.startsWith("changed:"))!.page, /old.md$/);
  assert.match(stale.find((i) => i.detail.startsWith("changed:"))!.detail, /2026-10-02 > 2026-10-01/);
  assert.deepEqual(brainUpdateCandidates(root, new Set(["ref.md"])).length, 3);
  assert.deepEqual(brainUpdateCandidates(root, new Set(["ref.md.extra"])), []);
  write(root, "concept", "directory", PAGE("type: concept\ntitle: directory\nsummary: s\n" + META.replace("대화:2026-10-01", "code:docs/"), "## Why\nReason."));
  assert.deepEqual(brainUpdateCandidates(root, new Set(["docs/a.md"])), [".pace/brain/pages/concept/directory.md"]);
  assert.deepEqual(brainUpdateCandidates(root, new Set(["docs-extra/a.md"])), []);
  const added = addPage(root, { type: "concept", title: "Missing source", summary: "s", body: "## Why\nA reason.", sources: ["code:gone.ts"] });
  assert.ok(added.lint.issues.some((i) => i.kind === "stale-source"));
  updatePage(root, added.page, { body: "## Why\nRechecked." });
});

test("stale-source: without git history, existing files are skipped and missing files still warn", () => {
  const root = brain();
  writeFileSync(join(root, "ref.md"), "reference");
  write(root, "concept", "p", PAGE("type: concept\ntitle: p\nsummary: s\n" + META.replace("대화:2026-10-01", "file:ref.md:1, code:gone.ts"), "## Why\nReason."));
  const stale = lintBrain(root).issues.filter((i) => i.kind === "stale-source");
  assert.equal(stale.length, 1);
  assert.match(stale[0]!.detail, /missing: gone.ts/);
});


test("stale-source: one history walk keeps the latest date per file and directory, not the newest repository date", () => {
  const root = brain();
  const git = (date: string, ...args: string[]) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: `${date}T12:00:00+0900`, GIT_COMMITTER_DATE: "2026-10-23T12:00:00+0900" } });
    assert.equal(r.status, 0, r.stderr);
  };
  git("2026-10-01", "init", "-q");
  git("2026-10-01", "config", "user.name", "test"); git("2026-10-01", "config", "user.email", "test@example.com");
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "old.md"), "old");
  git("2026-10-01", "add", "docs"); git("2026-10-01", "commit", "-qm", "old");
  writeFileSync(join(root, "docs", "new.md"), "new");
  git("2026-10-03", "add", "docs"); git("2026-10-03", "commit", "-qm", "new");
  writeFileSync(join(root, "elsewhere.md"), "unrelated");
  git("2026-10-04", "add", "elsewhere.md"); git("2026-10-04", "commit", "-qm", "unrelated");
  write(root, "concept", "p", PAGE("type: concept\ntitle: p\nsummary: s\n" + META.replace("updated: 2026-10-01", "updated: 2026-10-02").replace("대화:2026-10-01", "doc:docs/old.md, doc:docs/new.md, doc:docs/"), "## Why\nReason."));
  const stale = lintBrain(root).issues.filter((i) => i.kind === "stale-source");
  assert.equal(stale.length, 2);
  assert.ok(stale.every((i) => i.detail.includes("2026-10-03 > 2026-10-02")));
  assert.ok(stale.some((i) => i.detail.startsWith("changed: docs/new.md ")));
  assert.ok(stale.some((i) => i.detail.startsWith("changed: docs (")));
});


test("stale-source: nested wiki paths are relative to the brain root", () => {
  const repo = tempDir();
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", env: { ...process.env, GIT_AUTHOR_DATE: "2026-10-03T12:00:00+0900", GIT_COMMITTER_DATE: "2026-10-04T12:00:00+0900" } });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-q"); git("config", "user.name", "test"); git("config", "user.email", "test@example.com");
  const root = join(repo, "subproject");
  initBrain(root);
  writeFileSync(join(root, "ref.md"), "ref");
  git("add", "subproject/ref.md"); git("commit", "-qm", "ref");
  write(root, "concept", "p", PAGE("type: concept\ntitle: p\nsummary: s\n" + META.replace("대화:2026-10-01", "doc:ref.md"), "## Why\nReason."));
  assert.match(lintBrain(root).issues.find((i) => i.kind === "stale-source")!.detail, /changed: ref.md \(2026-10-03 > 2026-10-01\)/);
});

test("stale-source: git failures are visible but non-repositories remain quiet, missing checks continue", () => {
  const root = brain();
  write(root, "concept", "p", PAGE("type: concept\ntitle: p\nsummary: s\n" + META.replace("대화:2026-10-01", "doc:missing.md"), "## Why\nReason."));
  assert.deepEqual(lintBrain(root).notes, []);
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = "";
    const result = lintBrain(root);
    assert.equal(result.notes.length, 1);
    assert.match(formatLint(result), /stale 날짜 검사를 건너뜀: ENOENT/);
    assert.match(result.issues.find((i) => i.kind === "stale-source")!.detail, /missing: missing.md/);
  } finally { process.env.PATH = savedPath; }
});
