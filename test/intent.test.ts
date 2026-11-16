import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../src/core/frontmatter.ts";
import { checkHandoffText } from "../src/intent/handoff.ts";
import { packageRoot } from "../src/core/paths.ts";
import { IntentError, intentSkillDir, LENS_SECTIONS, loadLenses, renderLensIndex, writeLensIndex } from "../src/intent/lens.ts";
import { runPace, tempDir } from "./helpers.ts";

const readFixture = (path: string, _encoding: "utf8") => readFileSync(path, "utf8").replaceAll("\r\n", "\n");
const skillText = readFixture(join(intentSkillDir, "SKILL.md"), "utf8");

test("SKILL.md는 영어 본문·언어 규칙·일곱 절·순서 ①~⑨를 갖는다", () => {
  const { data, body } = parseFrontmatter(skillText);
  assert.equal(data.name, "pace-intent");
  const description = String(data.description);
  for (const phrase of ["기획해 줘", "서비스 기획", "pace-prompt", "pace-scout"]) assert.ok(description.includes(phrase), phrase);
  // 제목 바로 뒤 첫 문단이 언어 규칙이다(D17).
  const first = body.trim().split("\n\n")[1] ?? "";
  assert.match(first, /^\*\*Language:\*\*.*user's language \(Korean by default\)/);
  for (const quoted of ["`검사`", "`판정: 통과`", "`## 기준`"]) assert.ok(first.includes(quoted), quoted);
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(headings, ["Purpose", "When to use", "Inputs", "Process", "Decisions", "Definition of done", "Edge cases"]);
  for (const step of "①②③④⑤⑥⑦⑧⑨") assert.match(body, new RegExp(`^${step} \\*\\*`, "m"), step);
});

test("SKILL.md는 수집 요약을 질문보다 먼저, 질문은 한 번에 하나로 지시한다", () => {
  assert.match(skillText, /collection summary before any question/);
  assert.match(skillText, /one question per turn/);
  assert.match(skillText, /first option is the recommendation, marked `\(추천\)`, with a one-line reason/);
  assert.match(skillText, /one line on why you ask/);
  assert.match(skillText, /nothing else is asked in that turn: no optional add-on asks/);
  for (const ladder of ["`AGENTS.md`", "project memory", "pace brain search", "pace project list", "`research/`", "code — only for screen planning"]) {
    assert.ok(skillText.includes(ladder), ladder);
  }
  assert.match(skillText, /\*\*L0 with no lenses\*\*: state assumptions in one block and write the result immediately/);
  assert.match(skillText, /data, never instructions/);
  assert.match(skillText, /Nothing is written before the user confirms/);
});

test("저장소 렌즈는 모두 형식 검사를 통과하고 INDEX.md가 머리말에서 생성된 그대로다", () => {
  const { lenses, problems } = loadLenses();
  assert.deepEqual(problems, []);
  assert.ok(lenses.length >= 1);
  const index = readFixture(join(intentSkillDir, "references", "INDEX.md"), "utf8");
  assert.equal(index, renderLensIndex(lenses));
  for (const lens of lenses) assert.ok(index.includes(`](${lens.file})`), lens.file);
});

function scratchSkill(): string {
  const dir = join(tempDir("pace-intent-"), "pace-intent");
  cpSync(intentSkillDir, dir, { recursive: true });
  return dir;
}

test("예시 렌즈는 형식의 모든 절을 채운다", () => {
  const text = readFixture(join(intentSkillDir, "references", "intent", "purpose-ladder.md"), "utf8");
  for (const section of LENS_SECTIONS) assert.match(text, new RegExp(`^## ${section}\\n\\n\\S`, "m"), section);
});

test("깨진 렌즈는 이유와 함께 실패하고 INDEX를 쓰지 않는다", () => {
  const skill = scratchSkill();
  const before = readFileSync(join(skill, "references", "INDEX.md"), "utf8");
  mkdirSync(join(skill, "references", "service"), { recursive: true });
  writeFileSync(
    join(skill, "references", "service", "broken.md"),
    "---\nid: other\ntitle: Broken\ngroup: intent\ntypes: [feature, spaceship]\ndepth: [L9]\nsignals: []\nsource: x\n---\n\n## Looks at\n\n\n## Output form\n\nForm: x\n",
  );
  const result = writeLensIndex(skill);
  const messages = result.problems.map((p) => p.message);
  for (const expected of [
    "id가 파일 이름과 다르다: other",
    "group이 폴더와 다르다: intent",
    "알 수 없는 type: spaceship",
    "알 수 없는 depth: L9",
    "signals가 없다",
    "절이 비었다: ## Looks at",
    "절이 없다: ## Key questions",
    "Output form에 Link to first layer: 줄이 없다",
  ]) {
    assert.ok(messages.includes(expected), expected);
  }
  assert.ok(result.problems.every((p) => p.file === "service/broken.md"));
  assert.equal(readFileSync(join(skill, "references", "INDEX.md"), "utf8"), before);
});

test("CLI: 새 렌즈를 더하면 index --check가 실패하고 index가 행을 더한다", () => {
  const home = tempDir();
  const skill = scratchSkill();
  const lens = readFileSync(join(skill, "references", "intent", "purpose-ladder.md"), "utf8")
    .replace("id: purpose-ladder", "id: test-lens")
    .replace("title: Purpose ladder (5 Whys)", "title: Test | lens");
  writeFileSync(join(skill, "references", "intent", "test-lens.md"), lens);
  assert.equal(runPace(["intent", "lint", "--skill", skill], { home }).status, 0);
  const stale = runPace(["intent", "index", "--check", "--skill", skill], { home });
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /다시 만든다/);
  assert.equal(runPace(["intent", "index", "--skill", skill], { home }).status, 0);
  const index = readFileSync(join(skill, "references", "INDEX.md"), "utf8");
  assert.ok(index.includes("| [Test \\| lens](intent/test-lens.md) | intent |"));
  assert.equal(runPace(["intent", "index", "--check", "--skill", skill], { home }).status, 0);
  writeFileSync(join(skill, "references", "intent", "test-lens.md"), "---\nid: test-lens\n---\n");
  const lint = runPace(["intent", "lint", "--skill", skill], { home });
  assert.equal(lint.status, 1);
  assert.match(lint.stderr, /intent\/test-lens.md: title이 없다/);
  assert.equal(runPace(["intent", "nope"], { home }).status, 2);
});

test("렌즈 폴더가 심볼릭 링크면 읽지 않고 거부한다", () => {
  const skill = scratchSkill();
  const outside = tempDir("pace-intent-outside-");
  rmSync(join(skill, "references", "platform"), { recursive: true, force: true });
  symlinkSync(outside, join(skill, "references", "platform"));
  assert.throws(() => loadLenses(skill), (e: unknown) => e instanceof IntentError && /심볼릭 링크/.test(e.message));
});

test("그룹 안의 링크·폴더·중복 id·중복 절은 문제로 잡고, 펜스 안 ## 는 절로 보지 않는다", () => {
  const skill = scratchSkill();
  const outside = join(tempDir("pace-intent-outside-"), "x.md");
  const good = readFixture(join(skill, "references", "intent", "purpose-ladder.md"), "utf8");
  writeFileSync(outside, good);
  symlinkSync(outside, join(skill, "references", "intent", "linked.md"));
  mkdirSync(join(skill, "references", "intent", "folder.md"));
  mkdirSync(join(skill, "references", "service"), { recursive: true });
  writeFileSync(join(skill, "references", "service", "purpose-ladder.md"), good.replace("group: intent", "group: service"));
  const fenced = good
    .replace("id: purpose-ladder", "id: fenced")
    .replace("## Closing\n", "## Closing\n\n```md\n## Source\n```\n")
    .replace("## Tensions\n", "## Looks at\n\nagain\n\n## Tensions\n");
  writeFileSync(join(skill, "references", "intent", "fenced.md"), fenced);
  const { problems } = loadLenses(skill);
  const found = problems.map((p) => `${p.file}: ${p.message}`);
  assert.ok(found.includes("intent/linked.md: 일반 파일이 아니다(심볼릭 링크·폴더는 읽지 않는다)"));
  assert.ok(found.includes("intent/folder.md: 일반 파일이 아니다(심볼릭 링크·폴더는 읽지 않는다)"));
  assert.ok(found.includes("service/purpose-ladder.md: id가 intent/purpose-ladder.md와 겹친다: purpose-ladder"));
  assert.ok(found.includes("intent/fenced.md: 절이 두 번 있다: ## Looks at"));
  assert.ok(!found.some((f) => f.startsWith("intent/fenced.md: 절이 두 번 있다: ## Source")));
  const home = tempDir();
  const before = readFileSync(join(skill, "references", "INDEX.md"), "utf8");
  const check = runPace(["intent", "index", "--check", "--skill", skill], { home });
  assert.equal(check.status, 1);
  assert.match(check.stderr, /일반 파일이 아니다/);
  assert.equal(runPace(["intent", "index", "--skill", skill], { home }).status, 1);
  assert.equal(readFileSync(join(skill, "references", "INDEX.md"), "utf8"), before);
});

test("의도·문서 작성·검수 렌즈가 깊이 태그와 함께 INDEX에 있고, 원문 각색은 SOURCES·라이선스에 적힌다", () => {
  const { lenses } = loadLenses();
  const byFile = new Map(lenses.map((l) => [l.file, l]));
  const index = readFixture(join(intentSkillDir, "references", "INDEX.md"), "utf8");
  for (const file of [
    "intent/purpose-ladder.md",
    "intent/jtbd.md",
    "intent/assumption-map.md",
    "writing/audience.md",
    "writing/pyramid-scqa.md",
    "writing/doc-skeletons.md",
    "review/diagnostic-checklist.md",
  ]) {
    const lens = byFile.get(file);
    assert.ok(lens, file);
    assert.ok(index.includes(`](${file}) | ${lens.group} | ${lens.types.join(", ")} | ${lens.depth.join(", ")} |`), file);
  }
  for (const file of ["writing/audience.md", "writing/pyramid-scqa.md"]) assert.ok(byFile.get(file)!.depth.includes("L0"), file);
  const sources = readFixture(join(intentSkillDir, "references", "SOURCES.md"), "utf8");
  const license = readFixture(join(intentSkillDir, "references", "licenses", "prompt-master-MIT.txt"), "utf8");
  assert.match(license, /^MIT License\n\nCopyright \(c\) 2026 Nidhin Joseph Nelson/);
  // 원문을 각색한 렌즈(source에 라이선스 표기)는 모두 SOURCES.md 행·버전 칸·실제 라이선스 파일 링크를 갖는다.
  const adapted = lenses.filter((l) => /\((MIT|CC BY)/.test(l.source));
  assert.ok(adapted.some((l) => l.file === "review/diagnostic-checklist.md"), "prompt-master 각색 렌즈가 라이선스 표기로 걸린다");
  for (const lens of adapted) {
    const row = sources.split("\n").find((line) => line.includes(`](${lens.file})`));
    assert.ok(row, `SOURCES.md 행: ${lens.file}`);
    const cells = row.split("|").map((c) => c.trim());
    assert.match(cells[3] ?? "", /checked \d{4}-\d{2}-\d{2}/, `버전 칸: ${lens.file}`);
    const links = [...row.matchAll(/\]\((licenses\/[^)]+)\)/g)].map((m) => m[1]!);
    assert.ok(links.length > 0, `라이선스 링크: ${lens.file}`);
    for (const link of links) assert.ok(existsSync(join(intentSkillDir, "references", link)), link);
    assert.ok((cells[5] ?? "").length > 20, `바꾼 점: ${lens.file}`);
  }
  const checklistRow = sources.split("\n").find((line) => line.includes("](review/diagnostic-checklist.md)"))!;
  assert.match(checklistRow, /commit `49b3a72469b1e7287d66387004ccfcca90e5968a`/);
});

function sectionOf(file: string, name: string): string {
  const text = readFixture(join(intentSkillDir, "references", file), "utf8");
  const start = text.indexOf(`\n## ${name}\n`);
  assert.ok(start >= 0, `${file} ## ${name}`);
  const rest = text.slice(start + name.length + 5);
  const end = rest.indexOf("\n## ");
  return end < 0 ? rest : rest.slice(0, end);
}

/** 긴장 절의 굵은 이름이 렌즈를 가리키는가 — id(공백은 -)·제목 전체·제목 앞부분·약칭 표만. 부분 문자열은 받지 않는다. */
const LENS_ALIASES: Record<string, string> = { scqa: "pyramid-scqa", "5 whys": "purpose-ladder" };
function namesLens(name: string, lens: { id: string; title: string }): boolean {
  const title = lens.title.toLowerCase();
  return name.replaceAll(" ", "-") === lens.id || title === name || title.startsWith(`${name} `) || LENS_ALIASES[name] === lens.id;
}

/** 질문 예: 선택지 ①부터 2~4개, 첫 선택지에만 (추천 — 이유), 마지막 " — " 뒤에 묻는 이유. */
function assertQuestionExample(file: string): void {
  const example = /Example: "([^"]+)"/.exec(sectionOf(file, "Turning gaps into questions"))?.[1];
  assert.ok(example, `${file}: 질문 예`);
  const marks = [...example.matchAll(/[①②③④⑤⑥]/g)].map((m) => m[0]);
  assert.deepEqual(marks, ["①", "②", "③", "④"].slice(0, marks.length), `${file}: 선택지 번호`);
  assert.ok(marks.length >= 2 && marks.length <= 4, `${file}: 선택지 2~4개`);
  const options = example.split(/[①②③④]/).slice(1);
  assert.match(options[0]!, /\(추천 — [^)]+\)/, `${file}: 첫 선택지 추천+이유`);
  assert.ok(options.slice(1).every((o) => !o.includes("(추천")), `${file}: 추천은 첫 선택지만`);
  const reason = options.at(-1)!.split(" — ").slice(1).join(" — ").trim();
  assert.ok(reason.length >= 8, `${file}: 마지막 — 뒤 묻는 이유`);
}

test("모든 렌즈는 D15 모양 질문 예를 갖고, 긴장 절이 가리키는 이름은 모두 있는 렌즈나 진행 모드다", () => {
  const { lenses } = loadLenses();
  const known = (name: string) => {
    const n = name.toLowerCase().split(" / ")[0]!.trim();
    return ["one-pass mode", "staged mode"].includes(n) || lenses.some((l) => namesLens(n, l));
  };
  for (const lens of lenses) {
    assertQuestionExample(lens.file);
    const names = [...sectionOf(lens.file, "Tensions").matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!);
    assert.ok(names.length > 0, `${lens.file}: 긴장 상대가 없다`);
    for (const name of names) assert.ok(known(name), `${lens.file}: 없는 렌즈 ${name}`);
  }
});

test("서비스·실행 렌즈 8개가 INDEX에 있고, 서로 가리키는 긴장 쌍이 둘 이상이며 질문 예가 있다", () => {
  const { lenses } = loadLenses();
  const t03 = [
    "strategy/alternatives.md",
    "strategy/lean-canvas.md",
    "service/journey-map.md",
    "service/story-map.md",
    "service/moscow.md",
    "execution/gwt.md",
    "execution/decision-record.md",
    "execution/pre-mortem.md",
  ];
  const index = readFixture(join(intentSkillDir, "references", "INDEX.md"), "utf8");
  for (const file of t03) {
    assert.ok(lenses.some((l) => l.file === file), file);
    assert.ok(index.includes(`](${file})`), file);
    assertQuestionExample(file);
    assert.match(sectionOf(file, "Output form"), /Form: .+\nLink to first layer: .+\nWhen to produce: .+/, `${file}: 결과 구조`);
  }
  const mentions = (file: string, other: string) => {
    const lens = lenses.find((l) => l.file === other)!;
    const names = [...sectionOf(file, "Tensions").matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!.toLowerCase().split(" / ")[0]!.trim());
    return names.some((n) => namesLens(n, lens));
  };
  const pairs: string[] = [];
  for (const a of t03) for (const b of t03) if (a < b && mentions(a, b) && mentions(b, a)) pairs.push(`${a}↔${b}`);
  assert.ok(pairs.length >= 2, `긴장 쌍: ${pairs.join(", ")}`);
  assert.ok(pairs.includes("service/moscow.md↔strategy/lean-canvas.md"), "MoSCoW 축소 ↔ 차별화");
});

test("인계 매핑 표는 모든 렌즈 id를 A·B·C 칸과 함께 갖고, 작업 지시서는 prompt-master 출처를 적는다", () => {
  const handoff = readFixture(join(intentSkillDir, "references", "handoff.md"), "utf8");
  const mapping = handoff.slice(handoff.indexOf("## Mapping"), handoff.indexOf("## Proof"));
  for (const lens of loadLenses().lenses) {
    const row = mapping.split("\n").find((line) => line.startsWith(`| ${lens.id} |`));
    assert.ok(row, `매핑 행: ${lens.id}`);
    const cells = row.split("|").slice(1, -1).map((c) => c.trim());
    assert.equal(cells.length, 4, `${lens.id}: 렌즈·A·B·C`);
    assert.ok(cells.every((c) => c.length > 0), `${lens.id}: 빈 칸`);
  }
  for (const route of ["A — conversation", "B — run now", "C — backlog"]) assert.ok(handoff.includes(route), route);
  assert.match(handoff, /Nothing is created before the user confirms/);
  assert.match(handoff, /apply `pace-project-dev` §1 first \(do not redefine it\)/);
  for (const condition of ["purpose, scope, and main decisions are fixed", "planning chain is confirmed", "no `미결` row blocks"]) {
    assert.ok(handoff.includes(condition), condition);
  }
  assert.ok(readFixture(join(intentSkillDir, "SKILL.md"), "utf8").includes("[references/handoff.md](references/handoff.md)"));
  const sources = readFixture(join(intentSkillDir, "references", "SOURCES.md"), "utf8");
  const row = sources.split("\n").find((line) => line.includes("](handoff/work-brief.md)"));
  assert.ok(row && row.includes("Template M") && /commit `49b3a72469b1e7287d66387004ccfcca90e5968a`/.test(row) && row.includes("licenses/prompt-master-MIT.txt"));
  assert.match(readFixture(join(intentSkillDir, "references", "handoff", "work-brief.md"), "utf8"), /^## 완료 기준$/m);
  assert.match(readFixture(join(packageRoot, ".gitignore"), "utf8"), /^backlogs\/\*\/sources\/$/m);
});

test("인계 문서 검사: 빈 칸·주석뿐인 절·없는 절·자리 표시를 잡고, 비고·커밋 빈 칸과 머리말 주석은 둔다", () => {
  const good = [
    "# BL261029_01 쇼츠",
    "",
    "- 상태: 대기",
    "- 작업자: <!-- 비워 둔다 -->",
    "",
    "## 목표",
    "",
    "쇼츠 발행 자동화",
    "",
    "## 진행 현황",
    "",
    "| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |",
    "|---|---|---|---|---|",
    "| [BR01 생성](BR01_생성.md) | 대기 | — | — | |",
    "",
    "## 미결",
    "",
    "| # | 미결 | 영향 | 해결 조건 |",
    "|---|---|---|---|",
    "| U1 | 수익 모델 | 결제 화면 | 착수 전 사용자 결정 |",
  ].join("\n");
  assert.deepEqual(checkHandoffText("BACKLOG.md", good), []);
  const bad = good
    .replace("| U1 | 수익 모델 | 결제 화면 | 착수 전 사용자 결정 |", "| U1 | 수익 모델 |  | <!-- 조건 --> |")
    .replace("쇼츠 발행 자동화", "<!-- 이 백로그가 만드는 결과 -->")
    .replace("## 진행 현황", "## 진행 현황 {{id}}");
  const messages = checkHandoffText("BACKLOG.md", bad).map((p) => `${p.line}:${p.message}`);
  assert.ok(messages.includes("20:빈 칸: 영향"));
  assert.ok(messages.includes("20:빈 칸: 해결 조건"));
  assert.ok(messages.includes("6:절 본문이 안내 주석뿐이다: ## 목표"));
  assert.ok(!messages.includes("6:절이 비었다: ## 목표"), "같은 절을 두 번 보고하지 않는다");
  assert.ok(messages.includes("10:템플릿 자리 표시가 남았다"));
  assert.ok(messages.includes("0:절이 없다: ## 진행 현황"));
  assert.deepEqual(checkHandoffText("BR01_생성.md", "# BR01 생성\n\n## 목적\n\n왜\n\n## 범위\n\n무엇\n"), [{ line: 0, message: "절이 없다: ## 완료 기준" }]);
  assert.equal(checkHandoffText("notes.md", "x")[0]!.line, 0);
  // 펜스 안 예시·CRLF·이스케이프된 파이프·들여쓴 표·모자란 칸·중복 절
  const project = "# P001 x\r\n\r\n## 목적\r\n\r\n왜\r\n\r\n## 재료\r\n\r\n```md\r\n| a | b |\r\n|---|---|\r\n| | {{id}} |\r\n```\r\n\r\n## 기준\r\n\r\n| # | 합격 기준 | 확인 방법 |\r\n|---|---|---|\r\n| P-1 | a \\| b 둘 다 | 테스트 |\r\n";
  assert.deepEqual(checkHandoffText("PROJECT.md", project), []);
  const broken = [
    "# BR01 x", "", "## 목적", "", "왜", "", "## 범위", "", "  | a | b |", "  |---|---|", "  | 1 |  |", "| x | y |", "|---|---|", "| 1 |",
    "", "## 완료 기준", "", "된다", "", "## 범위", "", "다시",
  ].join("\n");
  const found = checkHandoffText("BR01_x.md", broken).map((p) => `${p.line}:${p.message}`);
  assert.deepEqual(found.sort(), ["11:빈 칸: b", "14:칸이 모자라다: 1/2", "20:절이 두 번 있다: ## 범위"].sort());
  // 채우지 않은 프로젝트 템플릿은 실패한다.
  const home = tempDir();
  const template = runPace(["intent", "check", join(packageRoot, "templates", "project", "PROJECT.md")], { home });
  assert.equal(template.status, 1);
  assert.match(template.stderr, /절 본문이 안내 주석뿐이다: ## 목적/);
  assert.equal(runPace(["intent", "check", join(home, "없음.md")], { home }).status, 1);
  const dir = runPace(["intent", "check", home], { home });
  assert.equal(dir.status, 1);
  assert.doesNotMatch(dir.stderr, /EISDIR/);
});

test("예시마다 요청·렌즈·드러날 빈틈·좋은/나쁜 질문·기대 경로·판정·기록이 있고, 발동 경계 표는 세 스킬과 해당 없음을 모두 덮는다", () => {
  const dir = join(intentSkillDir, "references", "examples");
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  const files = [...readme.matchAll(/\]\(([a-z0-9-]+\.md)\)/g)].map((m) => m[1]!);
  assert.deepEqual(files.sort(), ["card-banchan.md", "l0-weekly-report.md", "l1-restock-alert.md", "l2-shorts.md", "opalwrite-review.md", "routing.md", "security-pasted.md"]);
  for (const file of files.filter((f) => f !== "routing.md")) {
    const text = readFixture(join(dir, file), "utf8");
    for (const section of ["## Request", "## Lenses", "## Gaps that must surface", "## Good and bad questions", "## Expected route", "## Judgment"]) assert.ok(text.includes(section), `${file} ${section}`);
    assert.match(text, /## Recorded runs?\n\nValidation run /, `${file}: 기록`);
    const judgment = text.slice(text.indexOf("## Judgment"), text.indexOf("## Recorded"));
    assert.ok((judgment.match(/^- \S/gm) ?? []).length >= 2, `${file}: 판정 기준 항목`);
  }
  const routing = readFileSync(join(dir, "routing.md"), "utf8");
  const rows = routing.split("\n").filter((l) => /^\| [^-#]/.test(l) && !l.startsWith("| Request"));
  assert.equal(rows.length, 26, `사례 ${rows.length}개 — 기준 26개`);
  for (const skill of ["pace-intent", "pace-prompt", "pace-scout", "none"]) assert.ok(rows.some((r) => r.trim().endsWith(`| ${skill} |`) || r.includes(`| ${skill} (`)), skill);
  for (const check of ["pace intent check", "pace project new", "pace intent verify", "secret-scan"]) assert.ok(readme.includes(check), check);
  assert.ok(readFixture(join(intentSkillDir, "SKILL.md"), "utf8").includes("[references/examples/README.md](references/examples/README.md)"));
});

test("L3 렌즈는 L3 예시가 쓴 것만 있고 L3 태그로 INDEX에 나타나며, 쓰지 않은 후보는 만들지 않는다(D9)", () => {
  const { lenses } = loadLenses();
  const l3 = ["strategy/unit-economics.md", "platform/multi-sided-market.md", "platform/network-effects.md", "execution/north-star-okr.md", "execution/now-next-later.md"];
  const index = readFixture(join(intentSkillDir, "references", "INDEX.md"), "utf8");
  for (const file of l3) {
    const lens = lenses.find((l) => l.file === file);
    assert.ok(lens, file);
    assert.deepEqual(lens.depth, ["L3"], `${file}: L3 전용`);
    assert.match(index, new RegExp(`\\]\\(${file.replace(".", "\\.")}\\) \\| [a-z]+ \\| [^|]+ \\| L3 \\|`), file);
  }
  for (const unused of ["strategy/swot-tows.md", "strategy/value-proposition.md", "strategy/bmc.md", "strategy/five-forces.md", "strategy/pest.md", "strategy/wardley-map.md", "platform/ecosystem.md", "service/blueprint.md", "execution/rice.md"]) {
    assert.ok(!lenses.some((l) => l.file === unused), `만들지 않는다: ${unused}`);
  }
  // L3 전용 렌즈 집합은 L3 예시가 쓴 다섯 개와 정확히 같다 — 다른 이름으로 후보를 만들어도 잡힌다.
  assert.deepEqual(lenses.filter((l) => l.depth.length === 1 && l.depth[0] === "L3").map((l) => l.file).sort(), [...l3].sort());
});

test("기억과 학습: 선호는 먼저 읽고 확인 뒤에만 저장하며, 개선 후보는 원인 레이어와 횟수로 기존 항목을 갱신한다", () => {
  const feedback = readFixture(join(intentSkillDir, "references", "feedback.md"), "utf8");
  for (const phrase of [
    "pace memory list --project",
    "Never ask a question a saved preference answers",
    "Save only after the user says yes",
    "no raw request text",
    "no secrets",
    "project memory is committed",
    "pace memory update <slug> --project",
    "pace memory show <slug> --project",
    "`--body` replaces the body",
    "never applied by the skill",
    "do not edit the skill",
    "--project --type idea",
    "--project --type rule",
    "profile `todo`",
    "If the user declines, save nothing",
  ]) {
    assert.ok(feedback.includes(phrase), phrase);
  }
  for (const layer of ["`process`", "`toolbox`", "`proof`"]) assert.ok(feedback.includes(layer), layer);
  assert.match(feedback, /`횟수: 1`/);
  assert.match(feedback, /Do not add a second item: read the current body .+ raise `횟수` by one, append the new case/);
  assert.match(feedback, /명시 규칙으로 바꿀 것을 제안/);
  const skill = readFixture(join(intentSkillDir, "SKILL.md"), "utf8");
  assert.ok(skill.includes("[references/feedback.md](references/feedback.md)"));
  assert.match(skill, /save with `pace memory` only after the user confirms, never the raw request, never secrets/);
});
