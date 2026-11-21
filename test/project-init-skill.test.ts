import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declaredCommand, resolveAgent, type ProjectRef, type Repo } from "../src/project/harness.ts";

// P006 T01: pace-project-init의 정의서 크기·분리 기준이 한 곳에 있고, 작성·최신화 절차와 템플릿이 그 기준을 따르는지 본다.
const root = join(import.meta.dirname, "..");
const skillDir = join(root, "skills", "pace-project-init");
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const skill = read(join(skillDir, "SKILL.md"));
const docs = read(join(skillDir, "references", "project-docs.md"));
const CRITERIA = "## 정의서 크기와 분리 기준";
/** 기준 숫자 — 이 문자열이 기준 절 밖에 다시 나오면 정본이 둘이 된다 */
/** 표기 변형(쉼표·띄어쓰기·바이트 표기)까지 */
const NUMBERS = [/16\s?KB/i, /16,?384/, /3,?000\s?자/, /150\s?자/, /24\s?KB/i, /24,?576/];

/** `## 제목`부터 다음 `## ` 앞까지 */
function h2(text: string, heading: string): string {
  const at = text.indexOf(`${heading}\n`);
  assert.ok(at >= 0, `${heading} 절이 없다`);
  const rest = text.slice(at + heading.length + 1);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}
/** `**4-1. …**`처럼 굵은 소제목부터 다음 굵은 소제목 앞까지 */
function bold(text: string, prefix: string): string {
  const at = text.indexOf(`**${prefix}`);
  assert.ok(at >= 0, `${prefix} 소절이 없다`);
  const rest = text.slice(at + 2);
  const end = rest.search(/^\*\*\d-\d\./m);
  return end === -1 ? rest : rest.slice(0, end);
}
/** ```markdown 템플릿 블록 — `## <name>` 제목 뒤 첫 코드 블록(블록 안의 `## `에서 끊지 않는다) */
function template(name: string): string {
  const at = docs.indexOf(`\n## ${name}\n`);
  assert.ok(at >= 0, `## ${name} 절이 없다`);
  const m = /```markdown\n([\s\S]*?)\n```/.exec(docs.slice(at));
  assert.ok(m, `${name} 템플릿 블록이 없다`);
  return m[1]!;
}

test("S-1 정의서 크기·분리 기준은 project-docs.md 한 곳에 숫자로 있다", () => {
  const criteria = h2(docs, CRITERIA);
  for (const n of NUMBERS.slice(0, 5)) assert.match(criteria, n, `기준 절에 ${n} 없음`);
  for (const word of ["지도", "1/4", "최상위 코드 폴더", "SECURITY.md", "원문 그대로", "평면"]) assert.ok(criteria.includes(word), `기준 절에 '${word}' 없음`);
  // 조건 문구 — 하나라도 바뀌면 기준이 달라진다(예외 절 범위, 비율 적용 조건, 좁은 적용 범위, 링크 갱신, 다시 측정)
  for (const rule of [
    "`구성 요소`·`문서` 두 절만 행 수에 비례하므로 절 한도 대신 행 한도로 본다(`환경`을 비롯한 나머지 절은 모두 절 한도)",
    "정의서가 크기 기준을 넘을 때만 본다",
    "`전체`로 두지 않는다",
    "옮긴 절을 가리키던 링크(AGENTS.md·다른 docs·브레인 근거)를 새 위치로 고친다",
    "옮긴 뒤 다시 측정해 기준 안인지 확인한다",
    "상세 문단·표 칸은 고쳐 쓰지 않고 원문 그대로 옮긴다",
  ]) assert.ok(criteria.includes(rule), `기준 절 조건 문구 없음: ${rule}`);
  // 기준 절 밖(project-docs.md의 나머지, SKILL.md, 다른 references)에는 같은 숫자 기준이 없다
  const outside = docs.replace(criteria, "");
  const others = [["SKILL.md", skill], ["project-docs.md(기준 절 밖)", outside], ...readdirSync(join(skillDir, "references")).filter((f) => f !== "project-docs.md").map((f) => [f, read(join(skillDir, "references", f))])];
  for (const [name, text] of others) for (const n of NUMBERS) assert.doesNotMatch(text!, n, `${name}에 기준 숫자 ${n}가 다시 있다`);
});

/** SKILL.md가 기준을 절차로 따르는지 — 절마다 필요한 문구. 반환: 빠진 것 */
const PROCEDURE: [string, (s: string) => string, string[]][] = [
  ["§3 작성", (s) => h2(s, "## 3. 작성 (신규·기존)"), ["정의서 크기와 분리 기준", "최종 초안을 측정", "서브 문서로 분리", "문서 표에 등록", "등록을 마친 정의서를 다시 측정", "넘으면 1로 돌아가"]],
  ["§4-1 정의서 행", (s) => bold(s, "4-1.").split("\n").find((l) => l.startsWith("| 정의서 |")) ?? "", ["정의서 크기와 분리 기준", "정의서 측정", "크기", "절 한도", "구성 요소 비고 칸", "미등록 최상위 코드 폴더", "미등록 문서", "서브 문서 크기"]],
  ["§4-4 경미", (s) => bold(s, "4-4.").split("\n").find((l) => l.startsWith("| 경미 |")) ?? "", ["반영 예정본", "기준 안"]],
  ["§4-4 대규모", (s) => bold(s, "4-4.").split("\n").find((l) => l.startsWith("| 대규모 |")) ?? "", ["정의서 크기와 분리 기준", "확정 전 진행 금지", "구체적 분리 제안", "옮길 절", "서브 문서 이름", "승인되면", "문서 표 등록", "다시 측정", "하네스 선언 보존"]],
  ["§5 진행 상황", (s) => h2(s, "## 5. 마무리"), ["분리가 거부·미확정이면 \"완료\"로 적지 않고 정의서 미확정과 남긴 `issue`를 함께 적는다"]],
  ["§4-5 반영", (s) => bold(s, "4-5."), ["한 단위", "함께 승인·반영", "일부만 승인할 수 없다", "실제 반영본을 다시 측정", "승인 범위와 관계없이", "확정하지 않고", "정의서 측정:", "정의서 분리 제안"]],
];
function procedureIssues(text: string): string[] {
  return PROCEDURE.flatMap(([name, pick, phrases]) => { const part = pick(text); return phrases.filter((p) => !part.includes(p)).map((p) => `${name}: '${p}'`); });
}

test("S-2 SKILL.md §3·§4-1·§4-4·§4-5가 기준을 절차(측정 → 분리·등록 → 다시 측정, 승인 전 변경 금지)로 따른다", () => {
  assert.deepEqual(procedureIssues(skill), []);
  // 최신화 절대 규칙이 남아 있다(문구 존재 검사의 한계 — 모순 문장 삽입은 S-5 reviewer·S-8 진행으로 본다)
  assert.match(h2(skill, "## 4. 최신화"), /\*\*절대 규칙\*\*: 자동으로 덮어쓰지 않는다\. 보고하고 승인받은 것만 고친다\./);
  assert.doesNotMatch(skill, /승인 (없이|전에) (바로 )?(고쳐|반영해|분리해)도 된다/);
  // 변이: 필요한 문구를 하나씩 지운 사본은 검사가 잡아야 한다(이름만 언급해도 통과하는 검사가 아님)
  for (const [name, pick, phrases] of PROCEDURE) {
    const part = pick(skill);
    for (const phrase of phrases) {
      const mutated = skill.replace(part, part.replaceAll(phrase, "…"));
      assert.ok(procedureIssues(mutated).some((i) => i.startsWith(`${name}: '${phrase}'`)), `${name}의 '${phrase}' 삭제를 잡지 못한다`);
    }
  }
});

test("S-3 정의서 템플릿은 구성 요소 한 줄+링크, AGENTS 템플릿 더 보기는 읽는 시점이다", () => {
  const def = template("docs/README.md");
  const comp = h2(def, "## 구성 요소");
  assert.match(comp, /^\| 요소 \| 경로 \| 스택·형식 \| 요약 · 상세 \|$/m);
  const rows = comp.split("\n").filter((l) => l.startsWith("|") && !/^\|[-| ]+\|$/.test(l)).slice(1);
  assert.ok(rows.length >= 2);
  // 링크가 있는 예시와, 상세 문서가 없어 `—`인 예시가 모두 있다(없는 문서로 링크를 만들지 않게)
  assert.ok(rows.some((r) => /\]\([^)]+\.md\)/.test(r.split(" | ")[3] ?? "")), "링크 예시 행이 없다");
  assert.ok(rows.some((r) => / · — /.test(r)), "상세 문서 없는 `—` 예시 행이 없다");
  assert.match(h2(docs, CRITERIA), /링크는 실제로 있거나 이번에 함께 만들기로 승인된 문서만/);
  const more = h2(template("AGENTS.md"), "## 더 보기");
  assert.match(more, /작업 시작 때: docs\/README\.md/);
  assert.match(more, /경로를 고칠 때: .*문서 표.*적용 범위/);
  assert.doesNotMatch(more, /^- docs\/\{문서\}\.md — \{한 줄\}$/m, "문서 나열 형식이 남아 있다");
  assert.match(h2(docs, "## 역할 경계"), /\| 길이 \| 60줄 이내 \| .*\(#정의서-크기와-분리-기준\)/);
});

test("S-7 기준이 하네스 선언 보존을 규정하고, 템플릿 선언은 하네스가 읽으며, 작업자 도구는 분리 전후 같은 값으로 골라진다", () => {
  const criteria = h2(docs, CRITERIA);
  for (const word of ["하네스 선언 보존", "값:", "형식:", "유일성:", "`작업자 도구:`", "- 작업자 도구: codex", "첫 `` `명령` ``"]) assert.ok(criteria.includes(word), `기준 절에 '${word}' 없음`);
  // 남김 규정은 줄 단위로 본다 — `작업자 도구:`가 값 줄에도 있어 낱말 검사로는 남김 줄 삭제를 못 잡는다
  assert.match(criteria, /^- 남김: 라벨 `검사`·`보안 검사`·`worktree 준비`·`의존성 감사`의 행과 `작업자 도구:` 줄은 정의서에 남긴다\.$/m);
  const tmp = mkdtempSync(join(tmpdir(), "pace-init-skill-"));
  try {
    const at = (name: string, readme: string) => { const dir = join(tmp, name); mkdirSync(join(dir, "docs"), { recursive: true }); writeFileSync(join(dir, "docs/README.md"), readme); return dir; };
    const def = template("docs/README.md");
    const expected: Record<string, string> = { "검사": "npm run check", "보안 검사": 'npx secretlint "**/*"', "worktree 준비": "npm ci --no-audit --no-fund", "의존성 감사": "npm audit --omit=dev" };
    const original = at("original", def);
    for (const [label, cmd] of Object.entries(expected)) assert.equal(declaredCommand(original, label), cmd, label);
    // 형식을 깨면(백틱 제거·같은 라벨을 앞에 추가) 다른 값이 읽혀 이 검사가 잡는다
    const unquoted = at("unquoted", def.replace("| 검사 | `npm run check`", "| 검사 | npm run check"));
    assert.notEqual(declaredCommand(unquoted, "검사"), expected["검사"]);
    const duplicated = at("duplicated", def.replace("## 환경", "- 검사: `echo skip`\n\n## 환경"));
    assert.equal(declaredCommand(duplicated, "검사"), "echo skip");

    // 작업자 도구: 백틱 없는 선언을 둔 저장소에서 분리 전후 resolveAgent 결과가 같아야 한다
    const worker = (readme: string) => def.replace(/^- 작업자 도구: .*$/m, readme);
    const pick = (name: string, readme: string) => {
      const dir = at(name, readme);
      mkdirSync(join(dir, "projects", "P001_260101_시험"), { recursive: true });
      writeFileSync(join(dir, "projects", "P001_260101_시험", "PROJECT.md"), "# P001 시험\n\n- 상태: 진행\n- 작업자:\n\n## 목적\n");
      const repo: Repo = { root: dir, mainRoot: dir, inWorktree: false } as Repo;
      const ref: ProjectRef = { id: "P001", dir: "P001_260101_시험", name: "시험", branch: "project/P001", worktree: "" };
      return resolveAgent(repo, ref, { env: {} } as Parameters<typeof resolveAgent>[2]);
    };
    const before = worker("- 작업자 도구: codex");
    assert.deepEqual(pick("worker-before", before), { agent: "codex", source: "저장소 기본값" });
    // 기준의 옮기는 방법대로 분리한 사본: 상세(하네스 라벨 설명 문단·용어 표)를 원문 그대로 서브 문서에 쓰고,
    // 정의서에는 링크를 남기고 문서 표에 등록한다. 작업 프로세스 핵심 줄·작업자 도구·라벨 행은 남긴다
    const labelNote = /\*\*하네스 라벨\*\*[\s\S]*?\n\n/.exec(before)![0];
    const glossary = /## 용어\n([\s\S]*)$/.exec(before)![1]!;
    const split = before
      .replace(labelNote, "하네스 라벨 설명은 [WORK-PROCESS](WORK-PROCESS.md).\n\n")
      .replace(/## 용어\n[\s\S]*$/, "## 용어\n상세는 [GLOSSARY](GLOSSARY.md).\n")
      .replace(/(## 문서\n(?:\|.*\n)+)/, "$1| `docs/WORK-PROCESS.md` | 하네스 라벨 설명 | convention | `projects/**` | 작업 시 |\n| `docs/GLOSSARY.md` | 용어 | — | `docs/**` | 요청 시 |\n");
    assert.notEqual(split, before, "분리 사본이 원본과 같다");
    const moved = (name: string) => {
      const dir = at(name, split);
      writeFileSync(join(dir, "docs/WORK-PROCESS.md"), `# 작업 프로세스 세부\n\n${labelNote}`);
      writeFileSync(join(dir, "docs/GLOSSARY.md"), `# 용어\n\n${glossary}`);
      return dir;
    };
    const splitDir = moved("split-docs");
    // 옮긴 원문이 서브 문서에 그대로 있고, 서브 문서가 문서 표에 등록돼 있다
    assert.ok(readFileSync(join(splitDir, "docs/WORK-PROCESS.md"), "utf8").includes(labelNote.trim()));
    assert.ok(readFileSync(join(splitDir, "docs/GLOSSARY.md"), "utf8").includes(glossary.trim()));
    for (const f of ["WORK-PROCESS.md", "GLOSSARY.md"]) assert.match(h2(split, "## 문서"), new RegExp(`^\\| \`docs/${f}\` \\|`, "m"));
    // 분리 뒤에도 하네스가 같은 값을 고른다
    for (const label of Object.keys(expected)) assert.equal(declaredCommand(splitDir, label), expected[label], `분리 뒤 ${label}`);
    mkdirSync(join(splitDir, "projects", "P001_260101_시험"), { recursive: true });
    writeFileSync(join(splitDir, "projects", "P001_260101_시험", "PROJECT.md"), "# P001 시험\n\n- 상태: 진행\n- 작업자:\n\n## 목적\n");
    assert.deepEqual(resolveAgent({ root: splitDir, mainRoot: splitDir, inWorktree: false } as Repo, { id: "P001", dir: "P001_260101_시험", name: "시험", branch: "project/P001", worktree: "" }, { env: {} } as Parameters<typeof resolveAgent>[2]), { agent: "codex", source: "저장소 기본값" });
    // 선언을 바꾸거나 지우면 결과가 달라진다(이 비교가 보존 위반을 잡는다)
    assert.notDeepEqual(pick("worker-changed", worker("- 작업자 도구: claude")), { agent: "codex", source: "저장소 기본값" });
    assert.notDeepEqual(pick("worker-removed", worker("")), { agent: "codex", source: "저장소 기본값" });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
