import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { normalizeResult, type Executor } from "../src/agent/contract.ts";
import { buildVerifyPrompt, REVIEWER_FACT_QUESTIONS } from "../src/agent/verify.ts";
import { reviewNoteCommand, verifyCommand } from "../src/agent/verify-cli.ts";
import { ledgerPath, readLedger, textHash, type LedgerEntry } from "../src/agent/review-log.ts";
import { assessStructuredReview } from "../src/agent/structured-review.ts";
import { POST_BUNDLE_ITEMS, reviewCriteria } from "../src/agent/review-criteria.ts";
import { reviewBudgetScope } from "../src/agent/review-budget.ts";
import type { ReviewBudgetScope } from "../src/agent/review-budget.ts";
import { reviewHash } from "../src/project/pre-review.ts";
import { assertPostBundlePrompt, evidenceReviewFixture, POST_REMOVED_SENTENCES, tempDir } from "./helpers.ts";

const questions = {
  backlog: "이 백로그로 프로젝트에 착수하면 owner에게 다시 묻지 않고 합의한 목표까지 갈 수 있는가?",
  pre: "이 계획이 목적을 증명할 수 있는가?",
  post: "이 변경을 내보내도 되는가?",
} as const;

for (const stage of ["backlog", "pre", "post"] as const) {
  test(`T03 ${stage} 프롬프트는 해당 질문과 하위 항목을 쓴다`, () => {
    const prompt = buildVerifyPrompt("상위 목적", "대상", "본문", stage === "pre" ? "task" : "goal", undefined, stage);
    assert.ok(prompt.includes(questions[stage]));
    for (const [other, question] of Object.entries(questions)) {
      if (other !== stage) assert.ok(!prompt.includes(question));
    }
    assert.ok(prompt.includes("```pace-review"));
    assert.ok(!prompt.includes("전략에 다른 길"));
  });
}

const finding = {
  id: "F1", severity: "blocking", category: "defect", location: "src/output.ts:12",
  scenario: "빈 입력에서 저장 결과가 사라진다", reproduction: "빈 입력을 저장하고 다시 열어 본다", confidence: "high",
};
/** 구현 후 묶음 점검의 질문 안 지적(흐름) */
const flow = { ...finding, category: "flow" };
/** 구현 후 reviewer 대상은 diff다 */
const diffOf = (line: string) => `diff --git a/src/output.ts b/src/output.ts\n--- a/src/output.ts\n+++ b/src/output.ts\n@@ -12 +12 @@\n-old\n+${line}\n`;
function structured(findings: unknown[], footer: string) {
  return ["독립 검토 본문", "```pace-review", JSON.stringify({ version: 1, findings }), "```", footer].join("\n");
}

function fixture(stage: "backlog" | "pre" | "post") {
  const root = tempDir("pace-structured-");
  const target = stage === "backlog" ? join(root, "backlogs/BL261126_01_test/BACKLOG.md") :
    join(root, "projects/P013_test/tasks/T03_test", stage === "pre" ? "TASK.md" : "evidence/impl.diff");
  mkdirSync(dirname(target), { recursive: true });
  const contract = stage === "post" ? join(dirname(dirname(target)), "TASK.md") : target;
  if (stage === "post") writeFileSync(contract, "합성 검토 기준\n");
  writeFileSync(target, stage === "post" ? diffOf("대상 1") : "대상 1\n");
  const prompts: string[] = [];
  const verify = async (text: string) => {
    const output: string[] = [];
    const executor: Executor = {
      agent: "codex", mode: "p",
      capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
      async run(request) {
        prompts.push(request.prompt);
        return normalizeResult(request, { text: evidenceReviewFixture(request.prompt, text), provider: "openai" }, { durationMs: 1, enforcement: "fake" });
      },
    };
    const code = await verifyCommand(["--author-agent", "claude", "--target", target, "--purpose", "상위 목적"], {
      executors: () => [executor], write: (value) => output.push(value),
    });
    return { code, output: JSON.parse(output.join("")) };
  };
  const note = async (args: string[]) => {
    const output: string[] = [];
    const code = await reviewNoteCommand(["--target", target, "--summary", "실제 A-3 선택의 합성 시험", ...args], {
      executors: () => [], write: (value) => output.push(value),
    });
    return { code, output: JSON.parse(output.join("")) };
  };
  return { target, contract, verify, prompts, note };
}

test("사전 검토의 구현 지적만 있으면 pass와 구현 후 인계를 기록한다", async () => {
  const h = fixture("pre");
  const result = await h.verify(structured([{ ...finding, category: "implementation" }], "fail"));
  assert.equal(result.code, 0);
  assert.equal(result.output.review.verdict, "pass");
  const row = result.output.assessment.findings[0];
  assert.deepEqual([row.severity, row.effective, row.reason, row.handoff],
    ["blocking", "note", "outside_question", "implementation_review"]);
});

test("백로그의 설계 지적만 있으면 pass와 프로젝트 설계 인계를 기록한다", async () => {
  const h = fixture("backlog");
  const result = await h.verify(structured([{ ...finding, category: "design" }], "fail"));
  assert.equal(result.output.review.verdict, "pass");
  assert.equal(result.output.assessment.findings[0].handoff, "project_design");
  assert.equal(result.output.assessment.findings[0].effective, "note");
});

test("구현 후 검토에서 증거가 갖춰진 blocking은 보고된 pass와 관계없이 fail이다", async () => {
  const h = fixture("post");
  const response = structured([flow], "pass");
  const result = await h.verify(response);
  assert.equal(result.output.review.verdict, "fail");
  assert.deepEqual([result.output.assessment.reported_verdict, result.output.assessment.differs], ["pass", true]);
  assert.match(result.output.warning, /원문 마지막 판정과 도구 판정이 다르다/);
  const stored = JSON.parse(readFileSync(join(dirname(h.target), result.output.review.record), "utf8"));
  assert.equal(stored.result.text, evidenceReviewFixture(h.prompts[0]!, response));
  assert.equal(stored.assessment.findings[0].effective, "blocking");
  const review = readLedger(h.target).at(-1);
  assert.equal(review?.type, "review");
  if (review?.type === "review") assert.deepEqual([review.verdict, review.structured_stage], ["fail", "post"]);
});

test("선택 재발 표지는 판정, 적용 등급 및 기존 검토 원장의 의미를 바꾸지 않는다", async () => {
  const old = fixture("post");
  const current = fixture("post");
  writeFileSync(old.contract, twoCriteria);
  writeFileSync(current.contract, twoCriteria);
  const rows = [
    { ...flow, impact: "criterion", criterion: "RC-1" },
    { ...flow, id: "F2", impact: "goal", category: "implementation" },
    { ...flow, id: "F3", impact: "minor" },
    { ...flow, id: "F4", impact: "goal", reproduction: null },
  ];
  const hints = ["same_class", "superficial_fix", "same_class", "superficial_fix"];
  const withHints = rows.map((item, index) => ({ ...item, recurrence: hints[index] }));
  const before = await old.verify(evidenceResponse(rows, completeEvidence));
  const after = await current.verify(evidenceResponse(withHints, completeEvidence));
  assert.equal(before.code, 0);
  assert.equal(after.code, 0);
  assert.deepEqual(after.output.review, before.output.review);
  const { findings: afterFindings, ...afterAssessment } = after.output.assessment;
  const { findings: beforeFindings, ...beforeAssessment } = before.output.assessment;
  assert.deepEqual(afterAssessment, beforeAssessment);
  assert.deepEqual(afterFindings.map(({ recurrence }: { recurrence: unknown }) => recurrence), hints);
  assert.deepEqual(afterFindings.map(({ recurrence: _, ...item }: Record<string, unknown>) => item), beforeFindings);
  assert.deepEqual(afterFindings.map(({ effective, reason }: Record<string, unknown>) => [effective, reason]), [
    ["blocking", null], ["note", "outside_question"], ["should_fix", "minor_impact"], ["should_fix", "missing_evidence"],
  ]);
  assert.deepEqual([after.output.budget.rounds, after.output.budget.calls], [before.output.budget.rounds, before.output.budget.calls]);

  const recorded = JSON.parse(readFileSync(join(dirname(current.target), after.output.review.record), "utf8"));
  assert.deepEqual(recorded.assessment, after.output.assessment);
  const beforeLedger = readLedger(old.target).at(-1);
  const afterLedger = readLedger(current.target).at(-1);
  assert.ok(beforeLedger?.type === "review" && afterLedger?.type === "review");
  const { at: _oldTime, call_id: _oldCall, result_hash: _oldHash, ...beforeStable } = beforeLedger;
  const { at: _newTime, call_id: _newCall, result_hash: newHash, ...afterStable } = afterLedger;
  assert.deepEqual(afterStable, beforeStable);
  assert.equal(newHash, textHash(recorded.result.text));
});

test("구판 v1은 기존 판정을 유지하고 해석할 수 없는 선택 재발 표지는 건너뛴다", () => {
  const baseline = assessStructuredReview("post", structured([finding], "fail"));
  const current = assessStructuredReview("post", structured([{ ...finding, recurrence: "same_class" }], "fail"));
  assert.deepEqual(current, { ...baseline, findings: [{ ...baseline.findings![0], recurrence: "same_class" }] });
  for (const recurrence of [null, "other", { same_class: true }, ["same_class"]]) {
    assert.deepEqual(assessStructuredReview("post", structured([{ ...finding, recurrence }], "fail")), baseline);
  }
});

for (const field of ["location", "scenario", "reproduction"] as const) {
  test(`구현 후 blocking의 ${field} 근거가 없으면 should_fix로 기록한다`, async () => {
    const h = fixture("post");
    const { output } = await h.verify(structured([{ ...flow, [field]: null }], "fail"));
    assert.equal(output.review.verdict, "pass");
    assert.deepEqual([output.assessment.findings[0].effective, output.assessment.findings[0].reason], ["should_fix", "missing_evidence"]);
  });
}

test("빈 지적의 판정을 계산하고, 거짓 footer 차이를 보존한다", async () => {
  const h = fixture("post");
  const { output } = await h.verify(structured([], "fail"));
  assert.deepEqual([output.review.verdict, output.assessment.reported_verdict, output.assessment.differs], ["pass", "fail", true]);
});

test("질문 연결이나 구조를 판독할 수 없으면 footer를 유효 판정으로 쓰지 않는다", async () => {
  for (const response of ["원문만\npass", structured([{ ...flow, category: undefined }], "pass"),
    structured([{ ...flow, category: "made_up" }], "pass"), structured([flow, flow], "pass")]) {
    const h = fixture("post");
    const { output } = await h.verify(response);
    assert.deepEqual([output.review.verdict, output.budget.rounds, output.budget.calls], ["unknown", 0, 1]);
    assert.equal(output.assessment.findings, null);
  }
});

test("고아 구조화 기록과 재검토는 원문 footer 대신 같은 기계 판정을 쓴다", async () => {
  const h = fixture("post");
  const first = await h.verify(structured([{ ...flow, category: "other" }], "fail"));
  assert.equal(first.output.review.verdict, "pass");
  writeFileSync(ledgerPath(h.target), readLedger(h.target).filter((entry) => entry.type !== "review").map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  writeFileSync(h.target, diffOf("대상 2"));
  const next = await h.verify(structured([], "pass"));
  assert.match(next.output.recovered[0], /판정\(pass\)/);
  assert.match(h.prompts.at(-1)!, /도구 판정에 반영된 기존 blocking\n없음/);
  assert.equal(next.output.review.rereview_of, first.output.review.record);
});

test("줄 범위나 여러 파일 위치도 재현 가능한 blocking이다", async () => {
  for (const location of ["src/output.ts:12-14", "src/output.ts:12-14, src/input.ts:6"]) {
    const h = fixture("post");
    const { output } = await h.verify(structured([{ ...flow, location }], "fail"));
    assert.equal(output.review.verdict, "fail");
    assert.equal(output.assessment.findings[0].location, location);
  }
});

test("충돌하는 중복 JSON 키는 마지막 값의 순서와 관계없이 unknown이다", async () => {
  const valid = JSON.stringify([flow]);
  for (const fields of [
    `"findings":${valid},"findings":[]`,
    `"findings":[],"findings":${valid}`,
    `"findings":${valid},"\\u0066indings":[]`,
  ]) {
    const h = fixture("post");
    const response = ["```pace-review", `{"version":1,${fields}}`, "```", "pass"].join("\n");
    const { output } = await h.verify(response);
    assert.deepEqual([output.review.verdict, output.budget.rounds, output.budget.calls], ["unknown", 0, 1]);
  }
});

test("고아 기록의 구조화 판정을 다시 계산해 일치하지 않은 pass를 복구하지 않는다", async () => {
  for (const removed of [[], ["stage"], ["stage", "assessment"]]) {
    const h = fixture("post");
    const first = await h.verify(structured([flow], "pass"));
    const record = join(dirname(h.target), first.output.review.record);
    const saved = JSON.parse(readFileSync(record, "utf8"));
    saved.review.verdict = "pass";
    if (removed.includes("stage")) delete saved.review.structured_stage;
    if (removed.includes("assessment")) delete saved.assessment;
    writeFileSync(record, JSON.stringify(saved));
    writeFileSync(ledgerPath(h.target), readLedger(h.target).filter((entry) => entry.type !== "review").map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    writeFileSync(h.target, diffOf("새 대상"));
    const next = await h.verify(structured([], "pass"));
    assert.match(next.output.recovered[0], /서로 맞지 않는다/);
    assert.equal(next.output.review.rereview_of, null);
    assert.deepEqual([next.output.budget.calls, next.output.budget.rounds], [2, 1]);
  }
});

test("직전 구조화 기록 단계가 원장과 다르면 재검토를 거부한다", async () => {
  const h = fixture("post");
  const first = await h.verify(structured([], "pass"));
  const file = join(dirname(h.target), first.output.review.record);
  const record = JSON.parse(readFileSync(file, "utf8"));
  record.review.structured_stage = "pre";
  writeFileSync(file, JSON.stringify(record));
  writeFileSync(h.target, diffOf("새 대상"));
  const next = await h.verify(structured([], "pass"));
  assert.equal(next.code, 2);
  assert.match(next.output.error.message, /기준점의 단계/);
  assert.equal(h.prompts.length, 1);
});

test("재검토 기준점의 단계 표지가 빠지거나 구조화 판정이 다르면 호출을 거부한다", async () => {
  for (const removeStage of [true, false]) {
    const h = fixture("post");
    const first = await h.verify(structured([flow], "pass"));
    const file = join(dirname(h.target), first.output.review.record);
    const record = JSON.parse(readFileSync(file, "utf8"));
    const entries = readLedger(h.target);
    for (const entry of entries) {
      if (entry.type !== "review") continue;
      if (removeStage) delete entry.structured_stage;
      entry.verdict = "pass";
    }
    if (removeStage) {
      delete record.review.structured_stage;
      delete record.assessment;
    }
    record.review.verdict = "pass";
    writeFileSync(file, JSON.stringify(record));
    writeFileSync(ledgerPath(h.target), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    writeFileSync(h.target, diffOf("새 대상"));
    const next = await h.verify(structured([], "pass"));
    assert.equal(next.code, 2);
    assert.match(next.output.error.message, removeStage ? /기준점의 단계|원장이 손상됐다/ : /기준점의 판정/);
    assert.equal(h.prompts.length, 1);
  }
});

const twoCriteria = "## 기준\n| # | 완료 기준 |\n|---|---|\n| T-1 | 빈 입력의 결과를 보존한다 |\n| T-2 | 목록에서 다시 열 수 있다 |\n";
const BUNDLE_IDS = ["RA-1", "RA-2", "RA-3", "RA-4", "RB-1", "RB-2", "RB-3", "RB-4", "RC-1", "RC-2", "RC-3", "RC-4"];
/** 구현 후 12항목 모두 따라가 본 경로가 있는 없음 */
const completeEvidence = BUNDLE_IDS.map((id) => ({ id, state: "none", observation: `${id} 경로를 diff에서 따라가 확인했다` }));
const withSecond = (row: unknown) => completeEvidence.map((item, index) => index === 1 ? row : item);
const evidenceResponse = (findings: unknown[], criteria?: unknown, footer = "pass") => [
  "```pace-review", JSON.stringify({ version: 2, findings, ...(criteria === undefined ? {} : { criteria }) }), "```", footer,
].join("\n");

test("T04는 재현이 있어도 영향이 작을 때 낮추고 합의 기준의 실제 연결을 확인한다", async () => {
  for (const [impact, criterion, reproduction, verdict, reason] of [
    ["minor", null, flow.reproduction, "pass", "minor_impact"],
    ["criterion", "RC-1", flow.reproduction, "fail", null],
    ["criterion", "T-1", flow.reproduction, "unknown", "unknown_criterion"],
    ["goal", null, null, "pass", "missing_evidence"],
  ] as const) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const result = await h.verify(evidenceResponse([{ ...flow, impact, criterion, reproduction }], completeEvidence));
    assert.equal(result.output.review.verdict, verdict);
    assert.deepEqual([result.output.assessment.findings[0].impact, result.output.assessment.findings[0].reason], [impact, reason]);
  }
});

test("T04는 안전 경로가 완전할 때만 직접 실행 없는 차단을 인정한다", async () => {
  const path = { input: "빈 가시 상태", reached: "저장 접근의 판정 위치", result: "보존 기준 위반으로 종료" };
  for (const [field, verdict] of [[null, "fail"], ["input", "unknown"], ["reached", "unknown"], ["result", "unknown"], ["location", "unknown"]] as const) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const observed = field && field !== "location" ? { ...path, [field]: "" } : path;
    const result = await h.verify(evidenceResponse([{
      ...flow, category: "state", impact: "data_loss", reproduction: null, scenario: null,
      location: field === "location" ? null : flow.location, safety_path: observed,
    }], completeEvidence));
    assert.equal(result.output.review.verdict, verdict);
    assert.equal(result.output.assessment.findings[0].effective, verdict === "fail" ? "blocking" : "unverified");
    if (verdict === "unknown") assert.deepEqual(result.output.evidence_action.gaps, ["safety_unverified"]);
    else assert.deepEqual(result.output.assessment.findings[0].safety_path, path);
  }
});

test("T04는 빈 기준·미확인·누락·여분 ID로 증거의 pass를 만들지 않는다", async () => {
  for (const [criteria, second] of [
    [completeEvidence, "none"],
    [withSecond({ id: "RA-2", state: "absent", observation: "기능을 호출할 수 없었다" }), "unverified"],
    [withSecond({ id: "RA-2", state: "unverified", observation: null }), "unverified"],
    [[completeEvidence[0]], "unverified"],
    [undefined, "unverified"],
    [withSecond({ id: "RA-2", state: "none", observation: " " }), "unverified"],
    [[...completeEvidence, { id: "T-3", state: "none", observation: "정본에는 없는 항목" }], "none"],
  ] as const) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const result = await h.verify(evidenceResponse([], criteria));
    assert.deepEqual(result.output.assessment.evidence.criteria.slice(0, 2).map(({ id, state }: { id: string; state: string }) => [id, state]),
      [["RA-1", criteria === undefined ? "unverified" : "none"], ["RA-2", second]]);
    assert.equal(result.output.review.verdict, criteria === completeEvidence ? "pass" : "unknown");
    if (criteria !== completeEvidence) {
      assert.equal(result.output.evidence_action.action, "collect_evidence");
      assert.equal(result.output.evidence_action.if_proceed_without_evidence, "A-3");
      assert.equal(result.output.followup, undefined);
    }
  }

  const unreadable = fixture("post");
  writeFileSync(unreadable.contract, "- TASK 형식: v2\n## 목적\n계약 기재가 불충분하다\n");
  const noBasis = await unreadable.verify(evidenceResponse([], []));
  assert.equal(noBasis.output.review.verdict, "unknown");
  // 구현 후 항목은 TASK 기준 표와 무관한 고정 12개다 — 답하지 않은 항목이 그대로 결손이다
  assert.deepEqual(noBasis.output.evidence_action.gaps, BUNDLE_IDS);
});

test("T04 증거 보완은 같은 대상의 직전 기준별 상태를 이어서 스스로 재검토한다", async () => {
  const h = fixture("post");
  writeFileSync(h.contract, twoCriteria);
  const incomplete = await h.verify(evidenceResponse([], [completeEvidence[0]]));
  assert.deepEqual([incomplete.output.review.verdict, incomplete.output.budget.rounds], ["unknown", 0]);
  const completed = await h.verify(evidenceResponse([], completeEvidence));
  assert.equal(completed.output.review.verdict, "pass");
  assert.equal(completed.output.review.rereview_of, incomplete.output.review.record);
  assert.match(h.prompts.at(-1)!, /직전 기준별 증거 상태\n.*RA-2.*unverified/);
  assert.match(h.prompts.at(-1)!, /재검토와 수정 확인에서도 12항목 전체를 diff 전체에 대해 다시 답하고/);
  assert.doesNotMatch(h.prompts.at(-1)!, /바뀐 증거와 그 영향만 새로 관측/);
  assert.deepEqual([completed.output.budget.calls, completed.output.budget.rounds], [2, 1]);
});

test("T04의 실제 A-3 제안과 승인 증거는 원래 미확인 기록을 바꾸지 않는다", async () => {
  const h = fixture("post");
  writeFileSync(h.contract, twoCriteria);
  const result = await h.verify(evidenceResponse([], [completeEvidence[0]]));
  const record = join(dirname(h.target), result.output.review.record);
  const original = readFileSync(record, "utf8");
  const proposal = join(dirname(h.target), "proposal.json");
  const owner = join(dirname(h.target), "owner.md");
  const choice = "미확인 증거 수용";
  const propose = (...gaps: string[]) => {
    writeFileSync(proposal, JSON.stringify({ choices: [choice, "증거 보완"],
      assessments: gaps.map((finding) => ({ finding, decision: "A-3", reason: "필수 관측이 아직 없다" })) }));
    return h.note(["--request-waiver", "weaken", "--choice", choice, "--file", proposal]);
  };
  assert.equal((await propose("없는 기준")).code, 2);
  // 답하지 않은 11개 항목이 모두 결손이라 제안도 각각을 평가해야 한다
  assert.equal((await propose("RA-2")).code, 2);
  const request = await propose(...BUNDLE_IDS.slice(1));
  assert.equal(request.output.followup.decision, "A-3");
  writeFileSync(owner, "합성 owner 결정의 영수증");
  const resultNote = await h.note(["--decision", "--by", "user", "--choice", choice, "--file", owner]);
  assert.equal(resultNote.output.entry.evidence, "evidence/owner.md");
  assert.equal(readFileSync(record, "utf8"), original);
  assert.equal(JSON.parse(original).assessment.evidence.criteria[1].state, "unverified");
});

test("T04의 고아·연결 기록은 원장 형식 표지와 증거 조건을 따라 구버전 pass로 승격되지 않는다", async () => {
  for (const orphan of [true, false]) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const result = await h.verify(evidenceResponse([], [completeEvidence[0]]));
    const record = join(dirname(h.target), result.output.review.record);
    const raw = JSON.parse(readFileSync(record, "utf8"));
    delete raw.assessment;
    delete raw.review.required_criteria;
    raw.review.verdict = "pass";
    raw.result.text = structured([], "pass");
    writeFileSync(record, JSON.stringify(raw));
    const ledger = readLedger(h.target).flatMap<LedgerEntry>((row) => {
      if (row.type !== "review") return [row];
      if (orphan) return [];
      delete row.required_criteria;
      row.result_hash = textHash(raw.result.text);
      row.verdict = "pass";
      return [row];
    });
    writeFileSync(ledgerPath(h.target), ledger.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    writeFileSync(h.target, diffOf("현재 변경"));
    const next = await h.verify(evidenceResponse([], completeEvidence));
    if (orphan) {
      assert.match(next.output.recovered[0], /중단으로 원장에 복구/);
      assert.deepEqual([next.output.budget.calls, next.output.budget.rounds, next.output.review.rereview_of], [2, 1, null]);
    } else {
      assert.equal(next.code, 2);
      assert.match(next.output.error.message, /필수 기준 기록과 검토 원장/);
      assert.equal(h.prompts.length, 1);
    }
  }
});

test("T04는 버전 1 원장 기준점을 해석하고 현재 버전에서는 같은 승인 해시를 새 관측으로 판정한다", async () => {
  const h = fixture("post");
  writeFileSync(h.contract, twoCriteria);
  const snapshot = "옛 검토 대상\n";
  const hash = reviewHash(snapshot);
  const text = structured([finding], "fail");
  const record = "review-records/R1.json";
  mkdirSync(join(dirname(h.target), "review-records"));
  writeFileSync(join(dirname(h.target), record), JSON.stringify({ review: { snapshot, hash, structured_stage: "post" }, result: { text } }));
  writeFileSync(ledgerPath(h.target), JSON.stringify({ type: "review", at: "2026-11-25", target: "impl.diff", kind: "goal",
    hash, record, verifier: "codex", provider: "openai", rereview_of: null, result_hash: textHash(text), verdict: "fail", structured_stage: "post" }) + "\n");
  const current = await h.verify(evidenceResponse([], completeEvidence));
  assert.equal(current.output.review.verdict, "pass");
  assert.equal(current.output.review.rereview_of, record);
  assert.equal(current.output.budget.rounds, 2);
  assert.match(h.prompts.at(-1)!, /F1 \[blocking\] src\/output\.ts:12/);
});

test("T04는 형식 전체나 안전 판단이 미확인인 첫 응답을 범위 재검토 기준점으로 쓰지 않는다", async () => {
  const responses = [
    "형식 없는 응답\npass",
    evidenceResponse([{ ...flow, category: "boundary", impact: "security", reproduction: null }], completeEvidence),
  ];
  for (const response of responses) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const first = await h.verify(response);
    assert.equal(first.output.review.verdict, "unknown");
    const next = await h.verify(evidenceResponse([], completeEvidence));
    assert.equal(next.output.review.verdict, "pass");
    assert.equal(next.output.review.rereview_of, null);
    assert.match(h.prompts.at(-1)!, /지금은 구현 후 묶음 점검이다/);
    assert.doesNotMatch(h.prompts.at(-1)!, /판정 범위: 직전 검토의 blocking/);
  }
});

test("T04는 합쳐진 완료 기준 절과 단계별 관측 방법을 프롬프트에 넣는다", async () => {
  const backlog = fixture("backlog");
  writeFileSync(backlog.target, "# BR02 합성 브리프\n## 범위와 완료 기준\n- 두 파일의 출처를 확인한다\n");
  const evidence = [{ id: "C-1", state: "present", observation: "첨부 문서의 확인 경로를 읽었다" }];
  assert.equal((await backlog.verify(evidenceResponse([], evidence))).output.review.verdict, "pass");
  assert.match(backlog.prompts[0]!, /\[필수 기준 C-1\] 두 파일의 출처/);
  assert.match(backlog.prompts[0]!, /인계 원문에서 기준의 뜻/);
  const pre = fixture("pre");
  writeFileSync(pre.target, twoCriteria);
  const taskEvidence = [
    { id: "T-1", state: "present", observation: "저장 시험 S-1에서 내용이 보존됐다" },
    { id: "T-2", state: "present", observation: "다시 열기 시험 S-2에서 같은 결과를 읽었다" },
  ];
  assert.equal((await pre.verify(evidenceResponse([], taskEvidence))).output.review.verdict, "pass");
  assert.match(pre.prompts[0]!, /시험이 그 조건의 실패를 잡는지.*구현 결과는 요구하지 않는다/);
});

test("T04는 A-1 계약 변경 뒤 과거 증거 미확인을 건너뛰고 전체 검토로 시작한다", async () => {
  const h = fixture("post");
  writeFileSync(h.contract, twoCriteria);
  const first = await h.verify(evidenceResponse([], [completeEvidence[0]]));
  assert.equal(first.output.review.verdict, "unknown");
  const root = dirname(dirname(h.target));
  writeFileSync(h.target, diffOf("승인된 새 계약을 반영한 변경"));
  const hash = reviewHash(readFileSync(h.target, "utf8"));
  const approval = join(dirname(h.target), "approved.md");
  writeFileSync(approval, "합성 owner 원문과 이전·현재 계약 지문\n");
  const reset = {
    type: "contract_reset", at: "2026-11-26T13:00:00+09:00", id: "reset",
    stage: "post", target: "evidence/impl.diff", hash, evidence: "evidence/approved.md",
    evidence_hash: textHash(readFileSync(approval, "utf8")), summary: "대상자의 확인된 합의 변경",
    trigger: "synthetic-upper", contract: textHash("changed contract"), finish: true,
    offsets: { "evidence/TASK.md": readLedger(h.target).length },
  };
  writeFileSync(join(root, "REVIEW-FOLLOWUPS.jsonl"), JSON.stringify(reset) + "\n");
  const changed = await h.verify(evidenceResponse([], completeEvidence));
  assert.equal(changed.output.review.verdict, "pass");
  assert.equal(changed.output.review.rereview_of, null);
  assert.match(h.prompts.at(-1)!, /지금은 구현 후 묶음 점검이다/);
  assert.doesNotMatch(h.prompts.at(-1)!, /직전 기준별 증거 상태/);
  assert.deepEqual([changed.output.budget.calls, changed.output.budget.rounds], [1, 1]);
});

test("P017 T01 S-6: 사전 reviewer·breadth 범주는 질문 안이고 인수 사례 (가)~(라)의 TASK 입력을 가른다", () => {
  // 사례마다 실제 TASK 원문을 만들고 기준 ID·지적 위치·프롬프트를 그 원문에서 얻는다.
  const task = (declaration: string, t2: string, outside: string) => [
    "# T09 설정 저장", "", "- TASK 형식: v2", "", "## 증명 범위", "", "- 판정 주체: 자동 테스트",
    `- 구현 후 reviewer: ${declaration}`, "- 포함(변경 영향 경로): 설정 저장 버튼", `- 범위 밖: ${outside}`, "",
    "## 기준", "", "| # | 완료 기준 |", "|---|---|", "| T-1 | 저장 버튼이 설정을 파일에 영속 쓰기하고 다시 읽는다 |", `| T-2 | ${t2} |`, "",
  ].join("\n");
  const own = "저장 뒤 화면에 저장됨 표시가 뜬다";
  const wide = "저장 뒤 화면 표시와 기존 목록 화면 전체의 정렬·필터가 그대로다";
  const old = "기존 목록 화면 — 기존 회귀 시험";
  const ga = task("생략 — 문구만 바뀐다", own, old);
  const na = task("필요 — 상태(B) 영속 쓰기", own, old);
  const da = task("필요 — 상태(B) 영속 쓰기", wide, "없음");
  const ra = task("필요 — 상태(B) 영속 쓰기", own, old);
  const at = (text: string, needle: string) => `TASK.md:${text.split("\n").findIndex((row) => row.includes(needle)) + 1}`;
  const criteriaOf = (text: string) => reviewCriteria({ stage: "pre" } as ReviewBudgetScope, text).map((criterion) => criterion.id);
  const assess = (text: string, findings: unknown[]) => {
    const criteria = criteriaOf(text);
    const evidence = criteria.map((id) => ({ id, state: "present", observation: `${id} 시험이 있다` }));
    return assessStructuredReview("pre", evidenceResponse(findings, evidence), criteria);
  };
  // 입력 차이: (가)→(나)는 선언 줄만, (다)→(라)는 넓힌 T-2와 범위 밖 줄만 다르다.
  const changed = (a: string, b: string) => a.split("\n").flatMap((row, i) => row === b.split("\n")[i] ? [] : [i + 1]);
  assert.deepEqual(changed(ga, na), [Number(at(ga, "구현 후 reviewer").slice(8))]);
  assert.deepEqual(changed(da, ra), [Number(at(da, "범위 밖").slice(8)), Number(at(da, "| T-2").slice(8))]);
  for (const text of [ga, na, da, ra]) {
    assert.deepEqual(criteriaOf(text), ["T-1", "T-2"]);
    const prompt = buildVerifyPrompt("상위 목적", "TASK.md", text, "task", undefined, "pre");
    // 사례를 가르는 선언 줄·넓힌 T-2·범위 밖 줄을 포함해 TASK 원문 전체가 사전 reviewer 입력에 실린다.
    for (const row of text.split("\n").filter(Boolean)) assert.ok(prompt.includes(row), row);
  }
  // (가) 생략 + T-1 영속 쓰기 → 선언 줄의 유효 blocking, fail
  const mismatch = {
    id: "F1", severity: "blocking", category: "reviewer", location: at(ga, "구현 후 reviewer"), confidence: "high", impact: "goal", criterion: null,
    scenario: "생략인데 상태(B) '영속 데이터를 쓰거나 지우나?'가 예다", reproduction: `${at(ga, "| T-1")} T-1이 파일 영속 쓰기를 적는다`,
  };
  assert.ok(ga.includes("영속 쓰기") && ga.includes("생략 —"));
  const a = assess(ga, [mismatch]);
  assert.deepEqual([a.verdict, a.findings![0]!.effective, a.findings![0]!.reason], ["fail", "blocking", null]);
  // (나) 필요로 고친 판 → 지적 없음, pass
  const b = assess(na, []);
  assert.equal(b.verdict, "pass");
  assert.equal(b.findings!.length, 0);
  // (다) 작성자가 넓힌 T-2 → 그 줄·기준의 blocking 유지, fail. should_fix로 낮추면 안 된다.
  const widened = {
    id: "F2", severity: "blocking", category: "breadth", location: at(da, "| T-2"), confidence: "high", impact: "criterion", criterion: "T-2",
    scenario: "T-2가 이 변경이 건드리지 않는 기존 목록 화면까지 요구한다", reproduction: "포함 줄의 변경 영향 경로에 목록 화면이 없다",
  };
  assert.ok(da.includes(wide));
  const c = assess(da, [widened]);
  assert.deepEqual([c.verdict, c.findings![0]!.effective, c.findings![0]!.reason], ["fail", "blocking", null]);
  // (라) 좁힌 판: 넓힌 문장이 없고 기존 경로는 범위 밖 줄에 있다 → 그 줄의 반례(검토자의 확대 요구)는 유효 should_fix, pass
  assert.ok(!ra.includes(wide) && ra.includes(old));
  const d = assess(ra, [{ ...widened, severity: "should_fix", location: at(ra, "범위 밖"), criterion: null, impact: "goal",
    scenario: "기존 목록 화면 회귀도 이 태스크에서 보면 좋다" }]);
  assert.deepEqual([d.verdict, d.findings![0]!.effective, d.findings![0]!.category], ["pass", "should_fix", "breadth"]);
  for (const result of [a, c, d]) assert.ok(result.findings!.every((finding) => finding.reason !== "outside_question" && finding.handoff === null));
});

test("P017 T01 S-6: v2 사전 프롬프트에 두 하위 확인·사실 질문 11개·필요/생략과 넓힘 등급 규칙이 있다", () => {
  const task = "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 생략 — 문구만\n## 기준\n| T-1 | 결과 |\n";
  const prompt = buildVerifyPrompt("상위 목적", "TASK.md", task, "task", undefined, "pre");
  assert.match(prompt, /^- reviewer: /m);
  assert.match(prompt, /^- breadth: /m);
  for (const question of REVIEWER_FACT_QUESTIONS) assert.ok(prompt.includes(`- ${question}`), question);
  assert.equal(REVIEWER_FACT_QUESTIONS.length, 11);
  assert.deepEqual(["경계(A)", "상태(B)", "흐름(C)"].map((bundle) => REVIEWER_FACT_QUESTIONS.filter((q) => q.startsWith(bundle)).length), [4, 3, 4]);
  assert.match(prompt, /`생략`인데 위 질문 중 하나라도 TASK 내용상 "예"이면 blocking이다\. impact는 goal, location은 그 줄의 `TASK\.md:줄`/);
  assert.match(prompt, /예측해 "예"로 만들지 않는다/);
  assert.match(prompt, /작성자가 기준을 기존 경로까지 넓혔으면 blocking이다\. impact는 criterion, criterion과 location은 넓어진 `T-n`/);
  assert.match(prompt, /검토자가 범위 밖으로 넓히라고 요구하는 지적은 위 증명 범위 규칙대로 should_fix다/);
  const legacy = buildVerifyPrompt("상위 목적", "TASK.md", "## 기준\n| T-1 | 결과 |\n", "task", undefined, "pre");
  assert.ok(!legacy.includes(REVIEWER_FACT_QUESTIONS[0]));
});

// ── P017 T02: 구현 후 reviewer 묶음 점검 ──────────────────────────────────────

const bundleTask = (declaration: string) => [
  "# T02 합성", "", "- TASK 형식: v2", "", "## 증명 범위", "", "- 판정 주체: 자동 테스트", `- 구현 후 reviewer: ${declaration}`, "",
  "## 기준", "", "| # | 완료 기준 |", "|---|---|", "| T-1 | 저장 뒤 다시 읽는다 |", "",
].join("\n");
const bundleDiff = diffOf("저장 뒤 다시 읽는다");
function postScope(task: string) {
  const root = tempDir("pace-bundle-");
  const directory = join(root, "projects/P900_bundle/tasks/T01_bundle");
  mkdirSync(join(directory, "evidence"), { recursive: true });
  writeFileSync(join(directory, "TASK.md"), task);
  writeFileSync(join(directory, "evidence/impl.diff"), bundleDiff);
  return reviewBudgetScope(join(directory, "evidence/impl.diff"))!;
}
const askedSection = (prompt: string) => prompt.slice(prompt.indexOf("## 묻는 것"), prompt.indexOf("## 태스크 계약"));
const bundleRows = (state: (id: string) => object = () => ({})) =>
  BUNDLE_IDS.map((id) => ({ id, state: "none", observation: `${id} 경로를 diff에서 따라갔다`, ...state(id) }));
const bundleAnswer = (findings: unknown[], criteria: unknown) =>
  ["```pace-review", JSON.stringify({ version: 2, findings, criteria }), "```", "pass"].join("\n");

test("P017 T02 S-1: 구현 후 필수 항목은 고정 12개 점검 항목이고 TASK 줄 값이 필요·생략이어도 같다", () => {
  const prompts = ["필요 — 흐름이 바뀐다", "생략 — 문구만"].map((declaration) => {
    const task = bundleTask(declaration);
    const scope = postScope(task);
    assert.equal(scope.stage, "post");
    const criteria = reviewCriteria(scope, bundleDiff);
    assert.deepEqual(criteria.map(({ id }) => id), BUNDLE_IDS);
    assert.deepEqual(criteria, [...POST_BUNDLE_ITEMS]);
    for (const { id } of criteria) {
      assert.doesNotMatch(id, /^(?:T|A|B|C)-/);
    }
    const prompt = buildVerifyPrompt("상위 목적", "evidence/impl.diff", bundleDiff, "goal", undefined, "post", undefined, criteria, false, undefined, task);
    assert.match(prompt, /^- boundary: 경계\(A\)/m);
    assert.match(prompt, /^- state: 상태\(B\)/m);
    assert.match(prompt, /^- flow: 흐름\(C\)/m);
    assert.doesNotMatch(prompt, /^- (?:criteria|defect|safety): /m);
    assert.doesNotMatch(prompt, /\[(?:필수 기준|점검 항목) T-/);
    return askedSection(prompt);
  });
  assert.equal(prompts[0], prompts[1]);
});

test("P017 T02 S-2: 12항목 답 상태가 모두 있고 유효 blocking이 없으면 pass, 결손은 unknown이다", () => {
  const nonBlocking = { ...flow, id: "F1", severity: "should_fix", category: "state", impact: "criterion", criterion: "RB-1", safety_path: null };
  const mixed = bundleRows((id) => id === "RA-2" ? { state: "not_applicable", observation: "새 진입점이 없다" }
    : id === "RB-1" ? { state: "defect", observation: "감사 행이 빠진다" } : {});
  const mixedResult = assessStructuredReview("post", bundleAnswer([nonBlocking], mixed), BUNDLE_IDS);
  assert.equal(mixedResult.verdict, "pass");
  assert.deepEqual(mixedResult.evidence!.criteria.filter(({ state }) => state !== "none").map(({ id, state }) => [id, state]),
    [["RA-2", "not_applicable"], ["RB-1", "defect"]]);
  // 실행 증거가 없다는 관측만으로는 결손이 아니다
  const noRun = bundleRows(() => ({ observation: "실행하지 않았다. diff만 읽어 쓰기 경로를 따라갔다" }));
  assert.equal(assessStructuredReview("post", bundleAnswer([], noRun), BUNDLE_IDS).verdict, "pass");

  const gaps: [string, unknown, unknown[]][] = [
    ...BUNDLE_IDS.map((missing): [string, unknown, unknown[]] => [`${missing} 누락`, bundleRows().filter(({ id }) => id !== missing), []]),
    ["경로 없는 none", bundleRows((id) => id === "RC-2" ? { observation: " " } : {}), []],
    ["이유 없는 not_applicable", bundleRows((id) => id === "RA-1" ? { state: "not_applicable", observation: null } : {}), []],
    ["지적 없는 defect", bundleRows((id) => id === "RB-2" ? { state: "defect" } : {}), []],
    ["질문 밖 지적만 단 defect", bundleRows((id) => id === "RB-2" ? { state: "defect" } : {}),
      [{ ...flow, severity: "note", category: "other", impact: "criterion", criterion: "RB-2", safety_path: null }]],
    ["옛 상태 present", bundleRows((id) => id === "RA-3" ? { state: "present" } : {}), []],
    ["상태 이름만 쓴 none", bundleRows((id) => id === "RC-2" ? { observation: "없음" } : {}), []],
    ["상태 이름만 쓴 not_applicable", bundleRows((id) => id === "RA-1" ? { state: "not_applicable", observation: "해당 없음." } : {}), []],
    ["위치 없는 지적만 단 defect", bundleRows((id) => id === "RB-1" ? { state: "defect", observation: "감사 행이 빠진다" } : {}),
      [{ ...nonBlocking, location: null }]],
    ["관측 없는 defect", bundleRows((id) => id === "RB-1" ? { state: "defect", observation: null } : {}), [nonBlocking]],
    ["상태 이름만 쓴 defect", bundleRows((id) => id === "RB-1" ? { state: "defect", observation: "결함" } : {}), [nonBlocking]],
  ];
  for (const [label, criteria, findings] of gaps) {
    const result = assessStructuredReview("post", bundleAnswer(findings, criteria), BUNDLE_IDS);
    assert.equal(result.verdict, "unknown", label);
  }
  // 묶음 답 상태는 구현 후 단계에서만 쓴다 — 다른 단계 기준 표가 같은 ID를 써도 기존 답 상태로 판독한다
  const asPre = (state: string) => assessStructuredReview("pre", bundleAnswer([], bundleRows(() => ({ state }))), BUNDLE_IDS).evidence!.issues;
  assert.ok(asPre("none").includes("invalid_criterion"));
  assert.ok(!asPre("present").includes("invalid_criterion"));
});

test("P017 T02 S-3: 인수 사례 T06 R1 — 교착은 흐름, 소급 변경은 상태 항목의 blocking으로 낼 때만 fail이다", () => {
  const deadlock = { id: "F2", severity: "blocking", category: "flow", location: "src/ledger/close.ts:42",
    scenario: "마감과 정정이 두 잠금을 반대 순서로 잡아 교착한다", reproduction: "두 요청을 동시에 보내 잠금 획득 순서를 관측한다",
    confidence: "high", impact: "criterion", criterion: "RC-1", safety_path: null };
  const retroactive = { id: "F1", severity: "blocking", category: "state", location: "src/ledger/correct.ts:18",
    scenario: "확정된 지난달 원장 행을 정정이 덮어쓴다", reproduction: "확정 뒤 정정을 실행하고 지난달 행을 다시 조회한다",
    confidence: "high", impact: "criterion", criterion: "RB-2", safety_path: null };
  for (const finding of [deadlock, retroactive]) {
    const rows = bundleRows((id) => id === finding.criterion ? { state: "defect", observation: finding.scenario } : {});
    const result = assessStructuredReview("post", bundleAnswer([finding], rows), BUNDLE_IDS);
    assert.equal(result.verdict, "fail", finding.id);
    assert.deepEqual([result.findings![0]!.effective, result.findings![0]!.reason], ["blocking", null]);
  }
  const outside = [
    { ...deadlock, severity: "note", category: "implementation" },
    { ...retroactive, severity: "note", category: "design" },
    { ...deadlock, category: "implementation" },
    { ...retroactive, category: "design" },
    { ...retroactive, id: "F3", category: "other", scenario: "T-1 기준을 다시 판정하면 미달이다", criterion: null, impact: "goal" },
    { ...deadlock, id: "F4", category: "other", scenario: "계획의 단계 순서가 타당하지 않다", criterion: null, impact: "goal" },
  ];
  for (const finding of outside) {
    const result = assessStructuredReview("post", bundleAnswer([finding], bundleRows()), BUNDLE_IDS);
    assert.equal(result.verdict, "pass", `${finding.id} ${finding.category}`);
    assert.deepEqual([result.findings![0]!.effective, result.findings![0]!.reason], ["note", "outside_question"]);
  }
});

test("P017 T02 S-4: 구현 후 프롬프트는 모든 모드에서 TASK·diff·12항목 전체를 싣고 main의 7문장이 없다", () => {
  const task = bundleTask("필요 — 흐름이 바뀐다");
  const criteria = [...POST_BUNDLE_ITEMS];
  const previous = { previousText: "F1 [blocking] src/output.ts:12 — 재현\nfail", diff: "- 이전\n+ 지금" };
  const modes = {
    first: buildVerifyPrompt("상위 목적", "evidence/impl.diff", bundleDiff, "goal", undefined, "post", undefined, criteria, false, undefined, task),
    rereview: buildVerifyPrompt("상위 목적", "evidence/impl.diff", bundleDiff, "goal", previous, "post", undefined, criteria, false, undefined, task),
    afterPass: buildVerifyPrompt("상위 목적", "evidence/impl.diff", bundleDiff, "goal", { ...previous, previousPassed: true }, "post", undefined, criteria, false, undefined, task),
    focused: buildVerifyPrompt("상위 목적", "evidence/impl.diff", bundleDiff, "goal", previous, "post",
      "수정 확인의 지적은 F1의 원래 위치 src/output.ts:12이다. 해소 여부와 수정 영향(저장 경로)을 함께 판정한다.", criteria, false, undefined, task),
  };
  for (const [mode, prompt] of Object.entries(modes)) {
    assertPostBundlePrompt(prompt, task, bundleDiff);
    assert.ok(prompt.includes("재검토와 수정 확인에서도 12항목 전체를 diff 전체에 대해 다시 답하고"), mode);
  }
  assert.match(modes.first, /지금은 구현 후 묶음 점검이다/);
  assert.match(modes.rereview, /직전 검토의 blocking 각각이 해소됐는지도 답한다/);
  assert.match(modes.focused, /수정 확인의 지적은 F1/);
  // 사전 단계는 그대로 1단계·범위 문장을 쓴다(음성 대조: 사후 분기가 단계 밖으로 새면 실패)
  const pre = buildVerifyPrompt("상위 목적", "TASK.md", "## 기준\n| T-1 | 결과 |\n", "task", previous, "pre", undefined, [{ id: "T-1", text: "결과" }]);
  assert.ok(pre.includes(POST_REMOVED_SENTENCES[3]));
  assert.ok(pre.includes(POST_REMOVED_SENTENCES[5]));
  assert.ok(!pre.includes("## 태스크 계약"));
});

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

test("P017 T02 S-6: 백로그·사전·scope 없는 프롬프트와 review-admission은 변경 전과 바이트가 같다", () => {
  // 기대값은 변경 전 커밋(070f105)의 소스로 같은 입력을 계산한 것이다(evidence/s6-baseline-head.json).
  const criteria = [{ id: "T-1", text: "빈 입력의 결과를 보존한다" }, { id: "T-2", text: "목록에서 다시 열 수 있다" }];
  const backlogCriteria = [{ id: "B-1", text: "상위 목적과 owner 합의에서 목표가 확인된다" }];
  const v2task = "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 생략 — 문구만\n## 기준\n| T-1 | 결과 |\n";
  const rereview = { previousText: "F1 [blocking] a.ts:1 — 재현\nfail", diff: "- 이전\n+ 지금" };
  const prompts: Record<string, string> = {
    backlog: buildVerifyPrompt("상위 목적", "BACKLOG.md", "# BL261126_01 합성\n## 목표\n목표\n", "goal", undefined, "backlog", undefined, backlogCriteria),
    backlogRereview: buildVerifyPrompt("상위 목적", "BACKLOG.md", "# BL261126_01 합성\n", "goal", rereview, "backlog", undefined, backlogCriteria),
    pre: buildVerifyPrompt("상위 목적", "TASK.md", v2task, "task", undefined, "pre", undefined, criteria, true),
    preRereview: buildVerifyPrompt("상위 목적", "TASK.md", v2task, "task", rereview, "pre", undefined, criteria, true),
    preFocus: buildVerifyPrompt("상위 목적", "TASK.md", v2task, "task", rereview, "pre", "수정 확인의 지적은 F1이다. 지정한 지적과 적용한 수정의 영향만 판정한다.", criteria, true),
    general: buildVerifyPrompt("상위 목적", "notes.md", "일반 산출물\n", "goal"),
    generalRereview: buildVerifyPrompt("상위 목적", "notes.md", "일반 산출물\n", "goal", rereview),
    generalTask: buildVerifyPrompt("상위 목적", "plan.md", "계획\n", "task"),
  };
  assert.deepEqual(Object.fromEntries(Object.entries(prompts).map(([key, value]) => [key, sha(value)])), {
    backlog: "866de7f202abb8d2ff4d4e5cdf41ed4de81666c94f7e9085b6939fc5559ca600",
    backlogRereview: "01b8a6b02dc87594df1dbe318e91423e6f08156dc51af327b3ad96cdaf6b8f79",
    pre: "081cadae336088d1a48e6def83351235accc9c4b3f8f7653e1b895c385e03b6d",
    preRereview: "1a2175e097b1e529795381b80dcac7f805bed8b634bdeb90a35f8196e9dfd59e",
    preFocus: "eaca60449822560c4f90ee579c3f077770edc349335a52618e18c8db72777e1c",
    general: "ff02cd2aebc42bf52868d13c41697d83f0a2adf4c63c84c0762fa2f45bc81b07",
    generalRereview: "2e3da9a6a652b2a044a3d5400b03e2b6053336075960aa198e7201fac55ca52a",
    generalTask: "05f8c95cc248e28d3cbefe42a2f11d139e0d5315bc9de42cf9b427807881fe90",
  });
  assert.equal(sha(readFileSync(new URL("../src/agent/review-admission.ts", import.meta.url), "utf8")),
    "517127ebfb4a6ba733dc3e1157541b3e21ea728e1a5356474348e9c9d8c7fdf3");
});

test("P017 T02 S-6: 이 프로젝트 T01의 옛 사후 기록 R1~R5는 다시 판정해도 저장된 판정과 같다", () => {
  const projects = new URL("../projects/", import.meta.url);
  const project = readdirSync(projects).find((name) => name.startsWith("P017_"))!;
  const tasks = new URL(`${project}/tasks/`, projects);
  const t01 = readdirSync(tasks).find((name) => name.startsWith("T01_"))!;
  for (const n of [1, 2, 3, 4, 5]) {
    const record = JSON.parse(readFileSync(new URL(`${t01}/evidence/review-records/R${n}.json`, tasks), "utf8"));
    assert.deepEqual(record.review.required_criteria, ["T-1", "T-2", "T-3", "T-4", "T-5", "T-6", "T-7"]);
    const again = assessStructuredReview(record.review.structured_stage, record.result.text, record.review.required_criteria);
    assert.deepEqual(again, record.assessment, `R${n}`);
    assert.equal(again.verdict, "fail");
  }
});
