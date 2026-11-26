import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeResult, type Executor } from "../src/agent/contract.ts";
import { buildVerifyPrompt } from "../src/agent/verify.ts";
import { verifyCommand } from "../src/agent/verify-cli.ts";
import { ledgerPath, readLedger } from "../src/agent/review-log.ts";
import { tempDir } from "./helpers.ts";

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
  writeFileSync(target, "대상 1\n");
  const prompts: string[] = [];
  const verify = async (text: string) => {
    const output: string[] = [];
    const executor: Executor = {
      agent: "codex", mode: "p",
      capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
      async run(request) {
        prompts.push(request.prompt);
        return normalizeResult(request, { text, provider: "openai" }, { durationMs: 1, enforcement: "fake" });
      },
    };
    const code = await verifyCommand(["--author-agent", "claude", "--target", target, "--purpose", "상위 목적"], {
      executors: () => [executor], write: (value) => output.push(value),
    });
    return { code, output: JSON.parse(output.join("")) };
  };
  return { target, verify, prompts };
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
  assert.equal(stored.result.text, response);
  assert.equal(stored.assessment.findings[0].effective, "blocking");
  const review = readLedger(h.target).at(-1);
  assert.equal(review?.type, "review");
  if (review?.type === "review") assert.deepEqual([review.verdict, review.structured_stage], ["fail", "post"]);
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
    assert.match(next.output.error.message, removeStage ? /기준점의 단계/ : /기준점의 판정/);
    assert.equal(h.prompts.length, 1);
  }
});
