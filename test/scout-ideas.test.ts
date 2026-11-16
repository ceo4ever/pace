import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { cardFileName, renderCard } from "../src/scout/card.ts";
import { loadSchema, type Report } from "../src/scout/report.ts";
import { validate } from "../src/scout/schema.ts";
import { checkDates, checkEstimates, checkIdeaSignals, checkRefs, checkScores } from "../src/scout/verify.ts";
import { runPace, tempDir } from "./helpers.ts";

const SKILL = join(packageRoot, "skills/pace-scout");
const EXAMPLE = join(packageRoot, "templates/scout/example-report.json");

function example(): Report {
  return JSON.parse(readFileSync(EXAMPLE, "utf8")) as Report;
}

test("툴박스 — 파일·INDEX 행이 있고 SKILL·INDEX의 링크가 모두 열린다", () => {
  const index = readFileSync(join(SKILL, "files/INDEX.md"), "utf8");
  for (const file of ["rules/signal-taxonomy.md", "prompts/generate-ideas.md", "prompts/critique-ideas.md", "rules/scoring-rubric.md", "rules/writing-rules.md", "rules/source-collection.md", "rules/source-credibility.md", "prompts/extract-claims.md"]) {
    assert.ok(existsSync(join(SKILL, "files", file)), file);
    assert.ok(index.includes(`](${file})`), `INDEX 행: ${file}`);
  }
  assert.ok(existsSync(join(packageRoot, "templates/scout/idea-card.md")));
  assert.match(index, /\| `pace scout card <폴더> <I#>` \(틀: 앱 `templates\/scout\/idea-card\.md`\) \| 명령·카드 틀 \| ⑨ \|/);
  for (const [doc, base] of [["SKILL.md", SKILL], ["files/INDEX.md", join(SKILL, "files")]] as const) {
    const text = readFileSync(join(SKILL, doc), "utf8");
    for (const m of text.matchAll(/\]\(([^)#]+\.md)\)/g)) assert.ok(existsSync(join(base, m[1]!)), `${doc} → ${m[1]}`);
  }
  for (const word of ["폭발적 성장", "혁신적"]) assert.ok(readFileSync(join(SKILL, "files/rules/writing-rules.md"), "utf8").includes(word));
  for (const type of ["`problem`", "`behavior`", "`technology`", "`regulation`", "`money`"]) assert.ok(readFileSync(join(SKILL, "files/rules/signal-taxonomy.md"), "utf8").includes(type), type);
});

test("examples — 루카스가 만족한 보고서와 좋았던 이유, 데이터는 schema·검사 ②~⑥ 통과", () => {
  const dir = join(SKILL, "examples/소상공인_AI_지원사업");
  const readme = readFileSync(join(dir, "README.md"), "utf8");
  assert.match(readme, /^## 좋았던 이유$/m);
  assert.match(readme, /루카스/);
  for (const file of ["report.json", "report.html", "idea-3.md"]) assert.ok(existsSync(join(dir, file)), file);
  assert.ok(!existsSync(join(dir, "sources")), "원문은 넣지 않는다(D12)");
  const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as Report;
  assert.deepEqual(validate(loadSchema(), report), []);
  for (const c of [checkIdeaSignals(report), checkScores(report), checkEstimates(report, new Map()), checkDates(report, "2026-10-29")]) assert.equal(c.status, "pass", `${c.name}: ${c.detail ?? ""}`);
  const refs = checkRefs(report, new Map());
  assert.equal(refs.status, "unknown", `원문 없는 예시의 시간 참조는 확인 못 함: ${refs.detail ?? ""}`);
  assert.match(readme, /스크립트로 분석/, "유튜브는 자막판");
  assert.ok(report.sources.some((s) => s.kind === "video" && s.claims.some((c) => c.time)), "영상 주장에 시간이 있다");
  assert.match(readFileSync(join(SKILL, "SKILL.md"), "utf8"), /examples\//, "SKILL이 예시를 가리킨다");
});

test("평가 기준표 — 6개 기준마다 1·3·5점 정의, 가중치 합 100, 예시 criteria와 같다", () => {
  const rubric = readFileSync(join(SKILL, "files/rules/scoring-rubric.md"), "utf8");
  const rows = [...rubric.matchAll(/^\| `([a-z_]+)` \| ([^|]+) \| (\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)];
  assert.equal(rows.length, 6);
  for (const row of rows) for (const cell of [row[4], row[5], row[6]]) assert.ok(cell!.trim().length > 5, `${row[1]} 점수 정의`);
  assert.equal(rows.reduce((sum, r) => sum + Number(r[3]), 0), 100);
  assert.deepEqual(rows.map((r) => ({ id: r[1], name: r[2]!.trim(), weight: Number(r[3]) })), example().criteria);
  assert.match(rubric, /사용자가 확인했다\(2026-10-28\)/);
});

test("아이디어 카드 — 혼자 읽히는 칸과 근거 출처 펼침, 추천이 아니면 실험 미정", () => {
  const r = example();
  const card = renderCard(r, "I1", "BL_x");
  for (const heading of ["문제", "대상 고객", "해결 방식", "근거 출처", "수익 모델 가설", "핵심 가정 (틀리면 접는다)", "미결", "1주 검증 실험"]) assert.match(card, new RegExp(`^## ${heading.replace(/[()]/g, "\\$&")}$`, "m"), heading);
  assert.match(card, /^# 아이디어 카드: AI 학습 주간 요약 리포트$/m);
  const idea = r.ideas[0]!;
  for (const [heading, value] of [["문제", idea.problem], ["대상 고객", idea.customer], ["해결 방식", idea.solution], ["수익 모델 가설", idea.revenue]] as const) {
    assert.ok(card.includes(`## ${heading}\n\n${value}\n`), `${heading} 칸 내용`);
  }
  assert.match(card, /- 보고서에서 확인하지 못한 것: AI 튜터 앱의 대화 기록 내보내기 지원 여부/);
  assert.match(card, /후보 I1 · 추천/);
  assert.match(card, /- \[S3\] AI 튜터 리뷰 영상 — https:\/\/example\.com\/video\/review \(발행 2026-09-01/);
  assert.match(card, /  - 사실 03:41: 리뷰한 앱 3개 모두 부모용 리포트가 없다 — "세 앱 모두 부모용 리포트는 없었어요"/);
  assert.match(card, /- 신호 G2 부모는 학습 내용을 모른다/);
  assert.match(card, /- AI 튜터 앱이 대화 기록을 내보내게 해 준다\(앱 내보내기 기능/);
  assert.match(card, /- 추정: 월 구독 9,900원은 출처가 아닌 추정/);
  assert.match(card, /- 판정: 1주 안에 대기 신청 30명 이상이면 계속, 10~29명이면/);
  assert.match(card, /가중 합계 3\.25/);
  assert.doesNotMatch(card, /\{\{\w+\}\}/);
  const other = renderCard(r, "I2");
  assert.match(other, /정하지 않음 — 보고서 추천\(I1\)이 아니다/);
  assert.doesNotMatch(other, /\[S2\] 아이 AI 공부/, "근거 신호에 없는 출처는 넣지 않는다");
  r.ideas[1]!.kill_assumptions = ["무료 비교 글보다 낫다 [S2]"];
  assert.match(renderCard(r, "I2"), /- \[S2\] 아이 AI 공부, 부모는 깜깜이 — https:\/\/example\.com\/blog\/parent-notes/, "가정 속 출처도 펼친다");
  const scoredOnly = example();
  scoredOnly.scores.find((s) => s.idea === "I2" && s.criterion === "differentiation")!.refs = ["S3 03:41"];
  assert.match(renderCard(scoredOnly, "I2"), /- \[S3\] AI 튜터 리뷰 영상/, "점수 근거 출처도 펼친다");
  assert.throws(() => renderCard(r, "I9"), /후보가 없다: I9/);
  assert.throws(() => cardFileName("../x"), /후보 번호가 아니다/);
  assert.equal(cardFileName("I12"), "idea-12.md");
});

test("CLI scout card — idea-{n}.md를 쓰고 없는 후보·schema 오류·링크는 거부", () => {
  const home = tempDir();
  const dir = runPace(["scout", "new", "카드", "--out", tempDir()], { home }).stdout.trim();
  writeFileSync(join(dir, "report.json"), readFileSync(EXAMPLE, "utf8"));
  const out = runPace(["scout", "card", dir, "I2"], { home });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout.trim(), join(dir, "idea-2.md"));
  assert.match(readFileSync(join(dir, "idea-2.md"), "utf8"), /^# 아이디어 카드: 부모용 AI 튜터 비교 가이드/);
  assert.equal(runPace(["scout", "card", dir, "I9"], { home }).status, 1);
  assert.equal(runPace(["scout", "card", dir, "../x"], { home }).status, 1);
  assert.ok(!existsSync(join(dirname(dir), "x.md")));
  const outside = join(tempDir(), "o.md");
  writeFileSync(outside, "원본");
  symlinkSync(outside, join(dir, "idea-1.md"));
  assert.equal(runPace(["scout", "card", dir, "I1"], { home }).status, 1);
  assert.equal(readFileSync(outside, "utf8"), "원본");
  writeFileSync(join(dir, "report.json"), "{}");
  assert.match(runPace(["scout", "card", dir, "I2"], { home }).stderr, /schema에 맞지 않다/);
});
