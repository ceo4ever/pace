import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeResult, type Executor } from "../src/agent/contract.ts";
import { buildVerifyPrompt } from "../src/agent/verify.ts";
import { reviewNoteCommand, verifyCommand } from "../src/agent/verify-cli.ts";
import { ledgerPath, readLedger, textHash, type LedgerEntry } from "../src/agent/review-log.ts";
import { assessStructuredReview } from "../src/agent/structured-review.ts";
import { reviewHash } from "../src/project/pre-review.ts";
import { evidenceReviewFixture, tempDir } from "./helpers.ts";

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
  writeFileSync(target, "대상 1\n");
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
  const response = structured([finding], "pass");
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
    { ...finding, impact: "criterion", criterion: "T-1" },
    { ...finding, id: "F2", impact: "goal", category: "implementation" },
    { ...finding, id: "F3", impact: "minor" },
    { ...finding, id: "F4", impact: "goal", reproduction: null },
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
    const { output } = await h.verify(structured([{ ...finding, [field]: null }], "fail"));
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
  for (const response of ["원문만\npass", structured([{ ...finding, category: undefined }], "pass"),
    structured([{ ...finding, category: "made_up" }], "pass"), structured([finding, finding], "pass")]) {
    const h = fixture("post");
    const { output } = await h.verify(response);
    assert.deepEqual([output.review.verdict, output.budget.rounds, output.budget.calls], ["unknown", 0, 1]);
    assert.equal(output.assessment.findings, null);
  }
});

test("고아 구조화 기록과 재검토는 원문 footer 대신 같은 기계 판정을 쓴다", async () => {
  const h = fixture("post");
  const first = await h.verify(structured([{ ...finding, category: "other" }], "fail"));
  assert.equal(first.output.review.verdict, "pass");
  writeFileSync(ledgerPath(h.target), readLedger(h.target).filter((entry) => entry.type !== "review").map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  writeFileSync(h.target, "대상 2\n");
  const next = await h.verify(structured([], "pass"));
  assert.match(next.output.recovered[0], /판정\(pass\)/);
  assert.match(h.prompts.at(-1)!, /도구 판정에 반영된 기존 blocking\n없음/);
  assert.equal(next.output.review.rereview_of, first.output.review.record);
});

test("줄 범위나 여러 파일 위치도 재현 가능한 blocking이다", async () => {
  for (const location of ["src/output.ts:12-14", "src/output.ts:12-14, src/input.ts:6"]) {
    const h = fixture("post");
    const { output } = await h.verify(structured([{ ...finding, location }], "fail"));
    assert.equal(output.review.verdict, "fail");
    assert.equal(output.assessment.findings[0].location, location);
  }
});

test("충돌하는 중복 JSON 키는 마지막 값의 순서와 관계없이 unknown이다", async () => {
  const valid = JSON.stringify([finding]);
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
    const first = await h.verify(structured([finding], "pass"));
    const record = join(dirname(h.target), first.output.review.record);
    const saved = JSON.parse(readFileSync(record, "utf8"));
    saved.review.verdict = "pass";
    if (removed.includes("stage")) delete saved.review.structured_stage;
    if (removed.includes("assessment")) delete saved.assessment;
    writeFileSync(record, JSON.stringify(saved));
    writeFileSync(ledgerPath(h.target), readLedger(h.target).filter((entry) => entry.type !== "review").map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    writeFileSync(h.target, "새 대상\n");
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
  writeFileSync(h.target, "새 대상\n");
  const next = await h.verify(structured([], "pass"));
  assert.equal(next.code, 2);
  assert.match(next.output.error.message, /기준점의 단계/);
  assert.equal(h.prompts.length, 1);
});

test("재검토 기준점의 단계 표지가 빠지거나 구조화 판정이 다르면 호출을 거부한다", async () => {
  for (const removeStage of [true, false]) {
    const h = fixture("post");
    const first = await h.verify(structured([finding], "pass"));
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
    writeFileSync(h.target, "새 대상\n");
    const next = await h.verify(structured([], "pass"));
    assert.equal(next.code, 2);
    assert.match(next.output.error.message, removeStage ? /기준점의 단계|원장이 손상됐다/ : /기준점의 판정/);
    assert.equal(h.prompts.length, 1);
  }
});

const twoCriteria = "## 기준\n| # | 완료 기준 |\n|---|---|\n| T-1 | 빈 입력의 결과를 보존한다 |\n| T-2 | 목록에서 다시 열 수 있다 |\n";
const completeEvidence = [
  { id: "T-1", state: "present", observation: "저장 시험 S-1에서 내용이 보존됐다" },
  { id: "T-2", state: "present", observation: "다시 열기 시험 S-2에서 같은 결과를 읽었다" },
];
const evidenceResponse = (findings: unknown[], criteria?: unknown, footer = "pass") => [
  "```pace-review", JSON.stringify({ version: 2, findings, ...(criteria === undefined ? {} : { criteria }) }), "```", footer,
].join("\n");

test("T04는 재현이 있어도 영향이 작을 때 낮추고 합의 기준의 실제 연결을 확인한다", async () => {
  for (const [impact, criterion, reproduction, verdict, reason] of [
    ["minor", null, finding.reproduction, "pass", "minor_impact"],
    ["criterion", "T-1", finding.reproduction, "fail", null],
    ["criterion", "T-3", finding.reproduction, "unknown", "unknown_criterion"],
    ["goal", null, null, "pass", "missing_evidence"],
  ] as const) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const result = await h.verify(evidenceResponse([{ ...finding, impact, criterion, reproduction }], completeEvidence));
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
      ...finding, category: "safety", impact: "data_loss", reproduction: null, scenario: null,
      location: field === "location" ? null : finding.location, safety_path: observed,
    }], completeEvidence));
    assert.equal(result.output.review.verdict, verdict);
    assert.equal(result.output.assessment.findings[0].effective, verdict === "fail" ? "blocking" : "unverified");
    if (verdict === "unknown") assert.deepEqual(result.output.evidence_action.gaps, ["safety_unverified"]);
    else assert.deepEqual(result.output.assessment.findings[0].safety_path, path);
  }
});

test("T04는 빈 기준·미확인·누락·여분 ID로 증거의 pass를 만들지 않는다", async () => {
  for (const [criteria, second] of [
    [completeEvidence, "present"],
    [[completeEvidence[0], { id: "T-2", state: "absent", observation: "기능을 호출할 수 없었다" }], "absent"],
    [[completeEvidence[0], { id: "T-2", state: "unverified", observation: null }], "unverified"],
    [[completeEvidence[0]], "unverified"],
    [undefined, "unverified"],
    [[completeEvidence[0], { id: "T-2", state: "present", observation: " " }], "unverified"],
    [[...completeEvidence, { id: "T-3", state: "present", observation: "정본에는 없는 항목" }], "present"],
  ] as const) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const result = await h.verify(evidenceResponse([], criteria));
    assert.deepEqual(result.output.assessment.evidence.criteria.map(({ id, state }: { id: string; state: string }) => [id, state]),
      [["T-1", criteria === undefined ? "unverified" : "present"], ["T-2", second]]);
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
  assert.ok(noBasis.output.evidence_action.gaps.includes("required_criteria_unavailable"));
});

test("T04 증거 보완은 같은 대상의 직전 기준별 상태를 이어서 스스로 재검토한다", async () => {
  const h = fixture("post");
  writeFileSync(h.contract, twoCriteria);
  const incomplete = await h.verify(evidenceResponse([], [completeEvidence[0]]));
  assert.deepEqual([incomplete.output.review.verdict, incomplete.output.budget.rounds], ["unknown", 0]);
  const completed = await h.verify(evidenceResponse([], completeEvidence));
  assert.equal(completed.output.review.verdict, "pass");
  assert.equal(completed.output.review.rereview_of, incomplete.output.review.record);
  assert.match(h.prompts.at(-1)!, /직전 기준별 증거 상태\n.*T-2.*unverified/);
  assert.match(h.prompts.at(-1)!, /바뀐 증거와 그 영향만 새로 관측/);
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
  const propose = (finding: string) => {
    writeFileSync(proposal, JSON.stringify({ choices: [choice, "증거 보완"],
      assessments: [{ finding, decision: "A-3", reason: "필수 관측이 아직 없다" }] }));
    return h.note(["--request-waiver", "weaken", "--choice", choice, "--file", proposal]);
  };
  assert.equal((await propose("없는 기준")).code, 2);
  const request = await propose("T-2");
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
    writeFileSync(h.target, "현재 변경\n");
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
    evidenceResponse([{ ...finding, category: "safety", impact: "security", reproduction: null }], completeEvidence),
  ];
  for (const response of responses) {
    const h = fixture("post");
    writeFileSync(h.contract, twoCriteria);
    const first = await h.verify(response);
    assert.equal(first.output.review.verdict, "unknown");
    const next = await h.verify(evidenceResponse([], completeEvidence));
    assert.equal(next.output.review.verdict, "pass");
    assert.equal(next.output.review.rereview_of, null);
    assert.match(h.prompts.at(-1)!, /1단계 독립 목표 대조/);
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
  assert.equal((await pre.verify(evidenceResponse([], completeEvidence))).output.review.verdict, "pass");
  assert.match(pre.prompts[0]!, /시험이 그 조건의 실패를 잡는지.*구현 결과는 요구하지 않는다/);
});

test("T04는 A-1 계약 변경 뒤 과거 증거 미확인을 건너뛰고 전체 검토로 시작한다", async () => {
  const h = fixture("post");
  writeFileSync(h.contract, twoCriteria);
  const first = await h.verify(evidenceResponse([], [completeEvidence[0]]));
  assert.equal(first.output.review.verdict, "unknown");
  const root = dirname(dirname(h.target));
  writeFileSync(h.target, "승인된 새 계약을 반영한 변경\n");
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
  assert.match(h.prompts.at(-1)!, /1단계 독립 목표 대조/);
  assert.doesNotMatch(h.prompts.at(-1)!, /직전 기준별 증거 상태/);
  assert.deepEqual([changed.output.budget.calls, changed.output.budget.rounds], [1, 1]);
});
