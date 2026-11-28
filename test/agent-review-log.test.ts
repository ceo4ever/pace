import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AgentError, normalizeResult, type Executor } from "../src/agent/contract.ts";
import { reviewNoteCommand, verifyCommand } from "../src/agent/verify-cli.ts";
import { acquireLock, lineDiff, parseVerdict, readLedger, reviewStage, textHash, type LedgerEntry, type ReviewEntry } from "../src/agent/review-log.ts";
import { readReviewBudget, reserveReviewCall, reviewBudgetScope } from "../src/agent/review-budget.ts";
import { reviewHash } from "../src/project/pre-review.ts";
import { runPace, scopedReviewFixture, tempDir } from "./helpers.ts";

/** 받은 프롬프트를 기록하고 정해진 결과를 차례로 돌려주는 가짜 codex 실행기 */
function harness() {
  const dir = tempDir("pace-rl-");
  const target = join(dir, "TASK.md");
  const prompts: string[] = [];
  const replies: string[] = [];
  const out: string[] = [];
  const executor: Executor = {
    agent: "codex", mode: "p",
    capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
    async run(request) {
      prompts.push(request.prompt);
      return normalizeResult(request, { text: replies.shift() ?? "x\nfail", provider: "openai", model: "gpt-6", sessionId: "sess-123" }, { durationMs: 1, enforcement: "fake" });
    },
  };
  let available = true;
  const deps = { executors: () => (available ? [executor] : []), write: (t: string) => out.push(t) };
  const set = (text: string) => writeFileSync(target, text);
  const verify = async (reply: string, extra: string[] = []) => {
    replies.push(reply);
    out.length = 0;
    const code = await verifyCommand(["--author-agent", "claude", "--kind", "task", "--target", target, "--purpose", "목적", ...extra], deps);
    return { code, json: JSON.parse(out.join("")) };
  };
  const note = async (args: string[]) => { out.length = 0; const code = await reviewNoteCommand(["--target", target, ...args], deps); return { code, json: JSON.parse(out.join("")) }; };
  const ledger = (): LedgerEntry[] => (existsSync(join(dir, "REVIEW-LOG.jsonl")) ? readFileSync(join(dir, "REVIEW-LOG.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
  return { dir, target, prompts, verify, note, ledger, set, offline: () => { available = false; } };
}

const FIRST = /이전 지적과 그 대응 문서는 받거나 읽지 않는다/;
const REREVIEW = /판정 범위: 직전 검토의 blocking이 해소됐는지/;

test("general review recommends a troubleshooter only on the second valid failure", async () => {
  const h = harness();
  h.set("initial");
  const first = await h.verify("F1 [blocking] example\nfail");
  assert.equal(first.json.troubleshooterSignals, undefined);
  h.set("first change");
  const second = await h.verify("F2 [blocking] example\nfail");
  assert.deepEqual(second.json.troubleshooterSignals, [{
    kind: "review_failures", unit: { kind: "artifact", ref: "TASK.md" },
    evidence: [first.json.review.record, second.json.review.record],
  }]);
  assert.equal(h.ledger().filter((row) => row.type === "review").length, 2);
  h.set("second change");
  const third = await h.verify("F3 [blocking] example\nfail");
  assert.equal(third.json.troubleshooterSignals, undefined);
  assert.equal(third.json.escalation.stage, "diagnose");
  const offline = harness();
  offline.set("offline");
  offline.offline();
  assert.equal((await offline.verify("unavailable")).json.troubleshooterSignals, undefined);
});

function budgetHarness() {
  const dir = tempDir("pace-review-budget-");
  const task = join(dir, "projects/P013_budget/tasks/T01_budget");
  const backlog = join(dir, "backlogs/BL261126_01_budget");
  mkdirSync(join(task, "evidence"), { recursive: true });
  mkdirSync(backlog, { recursive: true });
  writeFileSync(join(task, "TASK.md"), "합성 검토 조건과 관측 기준\n");
  writeFileSync(join(backlog, "BACKLOG.md"), "합성 백로그의 수용 기준\n");
  const prompts: string[] = [];
  const review = async (target: string, reply: string, kind = "goal", provider = "openai", wait?: () => Promise<void>) => {
    const executor: Executor = {
      agent: provider === "openai" ? "codex" : "claude", mode: "p",
      capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
      async run(request) {
        prompts.push(request.prompt);
        await wait?.();
        return normalizeResult(request, { text: scopedReviewFixture(request.prompt, reply), provider, outputTokens: 23 }, { durationMs: 17, enforcement: "fake" });
      },
    };
    const output: string[] = [];
    const code = await verifyCommand(["--author-agent", provider === "openai" ? "claude" : "codex", "--target", target, "--purpose", "목적", "--kind", kind], {
      executors: () => [executor], write: (text) => output.push(text),
    });
    return { code, json: JSON.parse(output.join("")) };
  };
  return { task, backlog, prompts, review };
}

test("verify reports the repeated file area before spending the second valid review round", async () => {
  const h = budgetHarness();
  writeFileSync(join(h.task, "TASK.md"), "## 기준\n\n| # | 완료 기준 |\n|---|---|\n| T-1 | 입력 검증 |\n| T-2 | 기록 보존 |\n");
  const target = join(h.task, "evidence/implementation.patch");
  const raw = (id: string, line: number, complete: boolean) => [
    "```pace-review", JSON.stringify({
      version: 2, findings: [{
        id, severity: "should_fix", category: "criteria", location: `src/codec.ts:${line}`,
        scenario: "유효하지 않은 값을 거부하지 않는다", reproduction: "검증 시험에 빈 값을 준다",
        confidence: "high", impact: "criterion", criterion: "T-1", safety_path: null,
      }, ...(complete ? [{
        id: "F8", severity: "blocking", category: "criteria", location: "src/storage.ts:5",
        scenario: "기존 기록을 지운다", reproduction: "두 기록을 보존하는 고정 시험 실행",
        confidence: "high", impact: "criterion", criterion: "T-2", safety_path: null,
      }] : [])],
      criteria: [
        { id: "T-1", state: "present", observation: "빈 입력을 호출했다" },
        ...(complete ? [{ id: "T-2", state: "present", observation: "실패한 기록 바이트가 유지됐다" }] : []),
      ],
    }), "```", "fail",
  ].join("\n");
  const patch = (value: string) => `diff --git a/src/codec.ts b/src/codec.ts\n--- a/src/codec.ts\n+++ b/src/codec.ts\n@@ -12 +12 @@\n-original\n+${value}\n`;
  writeFileSync(target, patch("first edit"));
  const before = await h.review(target, raw("F1", 12, false));
  assert.equal(before.json.review.verdict, "unknown");
  assert.equal(before.json.troubleshooterSignals, undefined);
  writeFileSync(target, patch("second edit"));
  const after = await h.review(target, raw("F7", 16, true));
  assert.equal(after.json.review.verdict, "fail");
  assert.equal(after.json.budget.rounds, 1);
  assert.equal(after.json.budget.exhausted, null);
  assert.deepEqual(after.json.troubleshooterSignals, ["recurring_area", "superficial_fix"].map((kind) => ({
    kind, unit: { kind: "task", ref: "T01_budget/post" }, file: "src/codec.ts",
    evidence: [before.json.review.record, after.json.review.record],
  })));
  const records = readLedger(target).filter((entry) => entry.type === "review");
  assert.deepEqual(records.map((item) => item.verdict), ["unknown", "fail"]);
  assert.ok(records.every((item) => !Object.hasOwn(item, "troubleshooterSignals")));
  writeFileSync(join(h.task, "evidence", after.json.review.record), "{}");
  writeFileSync(target, patch("change following a damaged record"));
  const damaged = await h.review(target, raw("F9", 16, true));
  assert.equal(damaged.code, 2);
  assert.equal(damaged.json.troubleshooterSignals, undefined);
});

test("P013 T01: 같은 태스크의 두 원장이 구현 후 예산을 공유하고 사전 예산과 분리한다", async () => {
  const h = budgetHarness();
  const first = join(h.task, "change.patch");
  const second = join(h.task, "evidence/TASK.md");
  writeFileSync(first, "시작 상태\n");
  writeFileSync(second, "고친 상태\n");
  assert.equal((await h.review(first, "F1 [blocking] 고칠 부분\nfail")).code, 0);
  const resolved = await h.review(second, "pass", "goal", "anthropic");
  assert.equal(resolved.code, 0);
  assert.match(h.prompts.at(-1)!, REREVIEW);
  assert.match(h.prompts.at(-1)!, /## 직전 검토 원문\nF1 \[blocking\]/);
  assert.match(h.prompts.at(-1)!, /- 시작 상태\n\+ 고친 상태/);
  writeFileSync(second, "바뀐 상태\n");
  const blocked = await h.review(second, "never");
  assert.equal(blocked.code, 16);
  assert.equal(blocked.json.reason, "budget_exhausted");
  assert.equal(blocked.json.ran, false);
  assert.equal(blocked.json.budget.stage, "post");
  assert.equal(blocked.json.budget.rounds, 2);
  assert.equal(blocked.json.budget.calls, 2);
  assert.equal(h.prompts.length, 2);
  assert.equal((await h.review(second, "never", "task")).code, 2, "구현 diff를 사전 검토로 열 수 없다");
  const renamed = join(h.task, "evidence/implementation-diff.md");
  writeFileSync(renamed, readFileSync(second));
  assert.equal((await h.review(renamed, "never", "task")).code, 2, "Markdown 사본도 구현 후 대상이다");
  assert.equal((await h.review(renamed, "never", "goal")).code, 16, "같은 단계에서 대상 경로와 확장자가 바뀌어도 소진 상태다");
  assert.equal(h.prompts.length, 2);

  const plan = join(h.task, "TASK.md");
  writeFileSync(plan, "계획 1\n");
  assert.equal((await h.review(plan, "pass", "task")).code, 0);
  const recorded = readLedger(plan).findLast((entry): entry is ReviewEntry => entry.type === "review")!;
  assert.equal(recorded.duration_ms, 17);
  assert.deepEqual(recorded.usage, { input_tokens: null, output_tokens: 23 });
  writeFileSync(plan, "계획 2\n");
  assert.equal((await h.review(plan, "pass", "task")).code, 0);
  assert.match(h.prompts.at(-1)!, REREVIEW, "pass 뒤 같은 단계도 범위 재검토다");
  writeFileSync(plan, "계획 3\n");
  const exhausted = await h.review(plan, "never", "goal");
  assert.equal(exhausted.code, 16, "TASK.md의 종류를 goal로 바꿔도 사전 검토 예산이 유지된다");
  assert.equal(exhausted.json.budget.stage, "pre");
  assert.equal(h.prompts.length, 4);
});

test("P013 T01: 백로그 파일과 종류를 바꾸어도 한 예산에서 끝난다", async () => {
  const h = budgetHarness();
  const plan = join(h.backlog, "BACKLOG.md"), brief = join(h.backlog, "BR02_example.md");
  writeFileSync(plan, "계획\n");
  writeFileSync(brief, "재료\n");
  assert.equal((await h.review(plan, "F1 [blocking] 근거\nfail")).code, 0);
  assert.equal((await h.review(brief, "pass", "task")).code, 0);
  assert.match(h.prompts.at(-1)!, REREVIEW);
  const exhausted = await h.review(brief, "never", "goal");
  assert.equal(exhausted.code, 16);
  assert.equal(exhausted.json.budget.unit, "backlog");
  assert.equal(exhausted.json.budget.stage, "backlog");
  assert.equal(h.prompts.length, 2);
});

test("P013 T01: 옛 원장의 판정 두 건은 pm 결정과 pass 뒤에도 소급해 센다", async () => {
  const h = budgetHarness();
  const plan = join(h.task, "TASK.md");
  writeFileSync(plan, "새 계획\n");
  const legacy = (n: number, verdict: "pass" | "fail"): ReviewEntry => ({
    type: "review", at: "2026-01-01", kind: "task", target: "TASK.md", hash: "old",
    verdict, verifier: "codex", provider: "openai", rereview_of: null, record: `review-records/R${n}.json`, result_hash: "1".repeat(64),
  });
  const decision: LedgerEntry = { type: "decision", at: "2026-01-01", target: "TASK.md", by: "pm", choice: "재검토", summary: "기존 기록", file: "why.md" };
  writeFileSync(join(h.task, "REVIEW-LOG.jsonl"), [legacy(1, "fail"), decision, legacy(2, "fail")].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  assert.equal(readLedger(plan).length, 3);
  const blocked = await h.review(plan, "never", "task");
  assert.equal(blocked.code, 16);
  assert.deepEqual([blocked.json.budget.exhausted, blocked.json.budget.rounds, blocked.json.budget.calls], ["rounds", 2, 2]);
  assert.equal(h.prompts.length, 0);
  writeFileSync(join(h.task, "REVIEW-LOG.jsonl"), [legacy(1, "pass"), decision, legacy(2, "fail")].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  assert.equal((await h.review(plan, "never", "task")).code, 16, "기존 pass도 판정 예산을 쓴다");
  assert.equal(h.prompts.length, 0);
});

test("P013 T01: 옛 evidence/TASK.md의 goal·task 판정과 복구는 사전 예산을 쓰지 않는다", async () => {
  const h = budgetHarness();
  const plan = join(h.task, "TASK.md");
  const result = join(h.task, "evidence/TASK.md");
  writeFileSync(plan, "사전 계획\n");
  writeFileSync(result, "구현 검토 기록\n");
  const entries = [1, 2].map((n): ReviewEntry => ({
    type: "review", at: "2026-01-01", kind: n === 1 ? "goal" : "task", target: "TASK.md", hash: "old",
    verdict: "fail", verifier: "codex", provider: "openai", rereview_of: null,
    record: `review-records/R${n}.json`, result_hash: "1".repeat(64),
  }));
  writeFileSync(join(h.task, "evidence/REVIEW-LOG.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  mkdirSync(join(h.task, "evidence/review-records"));
  writeFileSync(join(h.task, "evidence/review-records/R3.json"), JSON.stringify({ pending: true, review: { target: "TASK.md", hash: "old" } }));
  const pre = await h.review(plan, "pass", "task");
  assert.equal(pre.code, 0, "같은 파일명이라도 루트 TASK.md의 첫 사전 판정은 실행한다");
  assert.deepEqual([pre.json.budget.calls, pre.json.budget.rounds], [1, 1]);
  const recovered = readLedger(result).at(-1) as ReviewEntry;
  assert.equal(recovered.kind, "goal");
  assert.equal(recovered.interrupted, true);
  const post = await h.review(result, "never", "goal");
  assert.equal(post.code, 16);
  assert.deepEqual([post.json.budget.stage, post.json.budget.calls, post.json.budget.rounds], ["post", 3, 2]);
  assert.equal(h.prompts.length, 1);
});

test("P013 T01: 무효·중단·unknown은 판정 없이 공유 예약 수만 쓴다", async () => {
  const h = budgetHarness();
  const patch = join(h.task, "change.patch"), second = join(h.task, "evidence/change.patch");
  writeFileSync(patch, "첫 대상\n");
  writeFileSync(second, "다른 대상\n");
  assert.equal((await h.review(patch, "F1 [blocking] 잘못된 도구 출력\nfail")).code, 0);
  const reason = join(h.task, "reason.md");
  writeFileSync(reason, "무효의 원인과 재현\n");
  assert.equal(await reviewNoteCommand(["--target", patch, "--void", "--record", "review-records/R1.json", "--summary", "도구 출력 무효", "--file", reason], {
    executors: () => [], write: () => {},
  }), 0);
  const scope = reviewBudgetScope(second)!;
  const release = acquireLock(scope.lockTarget);
  try {
    const reservation = reserveReviewCall(scope, new Date());
    assert.ok(reservation.callId);
    const records = join(h.task, "evidence/review-records");
    mkdirSync(records);
    writeFileSync(join(records, "R1.json"), JSON.stringify({ pending: true, review: {
      target: "change.patch", kind: "goal", hash: "before", call_id: reservation.callId,
    } }));
    assert.ok(reserveReviewCall(scope, new Date()).callId, "판정 없이 끝난 외부 넘김도 호출 수에 남는다");
  } finally {
    release();
  }
  const attempt = await h.review(patch, "판정 단어 없음");
  assert.equal(attempt.code, 0);
  assert.equal(attempt.json.review.verdict, "unknown");
  assert.match(attempt.json.recovered[0], /실행 중 중단/);
  assert.deepEqual([attempt.json.budget.exhausted, attempt.json.budget.rounds, attempt.json.budget.calls], ["calls", 0, 4]);
  const exhausted = await h.review(second, "never");
  assert.equal(exhausted.code, 16);
  assert.equal(exhausted.json.ran, false);
  assert.equal(h.prompts.length, 2);
});

test("P013 T01: 마지막 판정 자리는 두 원장에서 동시에 실행되지 않는다", async () => {
  const h = budgetHarness();
  const first = join(h.task, "change.patch"), second = join(h.task, "evidence/change.patch");
  writeFileSync(first, "첫 대상\n");
  writeFileSync(second, "다른 대상\n");
  await h.review(first, "pass");
  const started = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
  const inFlight = h.review(second, "pass", "goal", "openai", async () => {
    started.resolve();
    await resume.promise;
  });
  await started.promise;
  try {
    const concurrent = await h.review(first, "never");
    assert.equal(concurrent.code, 2);
    assert.match(concurrent.json.error.message, /진행 중/);
  } finally {
    resume.resolve();
  }
  assert.equal((await inFlight).code, 0);
  assert.equal((await h.review(first, "never")).code, 16);
  assert.equal(h.prompts.length, 2);
});

test("P013 T01: 교차 검토 미실행과 실행된 B1 폴백은 각 호출·판정에 반영한다", async () => {
  const h = budgetHarness();
  const plan = join(h.task, "TASK.md"); writeFileSync(plan, "계획\n");
  const args = ["--author-agent", "codex", "--target", plan, "--purpose", "목적"];
  const out: string[] = [];
  const same: Executor = {
    agent: "codex", mode: "p",
    capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
    async run(request) {
      return normalizeResult(request, { text: scopedReviewFixture(request.prompt, "pass"), provider: "openai", inputTokens: 0 }, { durationMs: 1, enforcement: "fake" });
    },
  };
  const deps = { executors: () => [same], write: (t: string) => out.push(t) };
  assert.equal(await verifyCommand(args, deps), 10);
  assert.equal(await verifyCommand([...args, "--allow-same-provider"], deps), 0);
  const result = JSON.parse(out[1]!);
  assert.equal(result.cross, false);
  assert.equal(result.review.verdict, "pass");
  assert.deepEqual([result.budget.calls, result.budget.rounds], [2, 1]);
  assert.deepEqual(result.result.usage, { input_tokens: 0, output_tokens: null });
});

test("P013 T01: 사전 검토의 구조 누락이 첫 전체 판정을 소비하지 않는다", async () => {
  const h = budgetHarness();
  const plan = join(h.task, "TASK.md");
  writeFileSync(plan, "- TASK 형식: v2\n## 목적\n안전한 처리\n");
  const structural = await h.review(plan, "never");
  assert.equal(structural.code, 2);
  assert.match(structural.json.error.message, /증명 범위/);
  assert.equal(h.prompts.length, 0);
  writeFileSync(plan, "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 필요 — 시험 고정본\n## 목적\n안전한 처리\n## 기준\n| T-1 | 안전 출력 확인 |\n");
  const first = await h.review(plan, "pass");
  assert.equal(first.code, 0);
  assert.equal(first.json.review.rereview_of, null);
  assert.deepEqual([first.json.budget.calls, first.json.budget.rounds], [2, 1]);
  assert.match(h.prompts[0]!, FIRST);
});

test("P013 T01: 옛 구조 전용 판정은 근거가 확인되면 호출로만 보존한다", async () => {
  const h = budgetHarness();
  const plan = join(h.task, "TASK.md");
  const snapshot = "- TASK 형식: v2\n## 목적\n안전한 처리\n";
  const text = "F1 [blocking] 증명 범위 누락\nfail";
  const record = "review-records/R1.json";
  const entry: ReviewEntry = {
    type: "review", at: "2026-01-01", kind: "task", target: "TASK.md", hash: reviewHash(snapshot),
    verdict: "fail", verifier: "codex", provider: "openai", rereview_of: null, record, result_hash: textHash(text),
  };
  mkdirSync(join(h.task, "review-records"));
  writeFileSync(join(h.task, record), JSON.stringify({ review: { snapshot }, result: { text } }));
  writeFileSync(join(h.task, "REVIEW-LOG.jsonl"), JSON.stringify(entry) + "\n");
  writeFileSync(plan, "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 필요 — 시험 고정본\n## 목적\n안전한 처리\n## 기준\n| T-1 | 안전 출력 확인 |\n");
  const full = await h.review(plan, "F1 [blocking] 안전 누락\nfail", "task");
  assert.equal(full.code, 0);
  assert.equal(full.json.review.rereview_of, null);
  assert.deepEqual([full.json.budget.calls, full.json.budget.rounds], [2, 1]);
  writeFileSync(plan, readFileSync(plan, "utf8") + "안전 기준 보완\n");
  const narrow = await h.review(plan, "pass", "task");
  assert.equal(narrow.code, 0);
  assert.equal(narrow.json.review.rereview_of, "review-records/R2.json");
  assert.match(h.prompts.at(-1)!, REREVIEW);

  const post = join(h.task, "evidence/TASK.md");
  mkdirSync(join(h.task, "evidence/review-records"));
  writeFileSync(join(h.task, "evidence", record), JSON.stringify({ review: { snapshot }, result: { text } }));
  writeFileSync(join(h.task, "evidence/REVIEW-LOG.jsonl"), JSON.stringify(entry) + "\n");
  writeFileSync(post, "구현 후 변경\n");
  const postFull = await h.review(post, "pass", "goal");
  assert.equal(postFull.code, 0);
  assert.equal(postFull.json.review.rereview_of, null, "옛 구조 전용 판정은 구현 후 전체 판정 자리도 소비하지 않는다");
  assert.deepEqual([postFull.json.budget.calls, postFull.json.budget.rounds], [2, 1]);
});

test('결정 주체 pm/user 필수·근거·옛 결정 unknown과 단계 호환', async () => {
  for (const by of ['pm', 'user', 'legacy']) {
    const h = harness();
    for (let i = 1; i <= 3; i++) { h.set(`v${i}\n`); await h.verify('F1 [blocking] gap\nfail'); }
    const diagnosis = await h.note(['--diagnosis', '--layer', 'design', '--summary', '갭']);
    assert.equal(diagnosis.code, 0);
    const opened = await h.verify('F1 [blocking] 남은 갭\nfail');
    assert.equal(opened.code, 0);
    assert.equal(opened.json.escalation.stage, 'ask_user');
    assert.match(opened.json.escalation.next, /decision-rights\.md B.*A로 결정 주체/);
    assert.match(opened.json.escalation.next, /A에 해당할 때만 수정 전 owner 결정.*원문과 대상/);
    assert.match(opened.json.escalation.next, /A 밖 조치는 PM.*전체 재검증/);
    const evidence = join(h.dir, 'choice.md'); writeFileSync(evidence, '분류 이유와 조치 / 합성 사용자 원문');
    const args = ['--decision', '--choice', '고치고 재검토', '--summary', '사유', '--file', evidence];
    const before = readFileSync(join(h.dir, 'REVIEW-LOG.jsonl'), 'utf8');
    for (const actor of [[], ['--by', 'admin'], ['--by', 'unknown']]) {
      assert.equal((await h.note([...args, ...actor])).code, 2);
      assert.equal(readFileSync(join(h.dir, 'REVIEW-LOG.jsonl'), 'utf8'), before);
    }
    for (const actor of ['pm', 'user']) {
      for (const bad of ['', '  \n']) {
        writeFileSync(evidence, bad);
        assert.equal((await h.note([...args, '--by', actor])).code, 2);
      }
      assert.equal((await h.note([...args.slice(0, -2), '--file', h.target, '--by', actor])).code, 2);
    }
    writeFileSync(evidence, '분류 이유와 조치 / 합성 승인 원문');
    if (by === 'legacy') {
      const old = { type: 'decision', at: '', target: 'TASK.md', choice: '옛 선택', summary: '옛 기록', file: evidence };
      writeFileSync(join(h.dir, 'REVIEW-LOG.jsonl'), before + JSON.stringify(old) + '\n');
      assert.equal(reviewStage(readLedger(h.target), 'TASK.md').last_decision_by, 'unknown');
      assert.equal(readLedger(h.target).at(-1)?.type, 'decision');
    } else {
      const noted = await h.note([...args, '--by', by]);
      assert.equal(noted.code, 0);
      assert.equal(noted.json.entry.by, by);
    }
    const info = reviewStage(readLedger(h.target), 'TASK.md');
    assert.equal(info.stage, 'normal'); assert.equal(info.consecutive_fails, 0); assert.equal(info.base, null);
    const full = await h.verify('pass');
    assert.equal(full.json.review.rereview_of, null);
    assert.equal(full.json.last_decision_by, by === 'legacy' ? 'unknown' : by);
    assert.doesNotMatch(h.prompts.at(-1)!, REREVIEW);
    const raw = readFileSync(join(h.dir, 'REVIEW-LOG.jsonl'), 'utf8');
    const lines = raw.trim().split('\n').map(line => JSON.parse(line));
    const decision = lines.find((e) => e.type === 'decision');
    decision.by = 'admin';
    writeFileSync(join(h.dir, 'REVIEW-LOG.jsonl'), lines.map(e => JSON.stringify(e)).join('\n') + '\n');
    assert.throws(() => readLedger(h.target), /손상/);
  }
  const h = harness(); h.set('v1');
  assert.equal((await h.note(['--diagnosis', '--by', 'pm', '--layer', 'design', '--summary', 'x'])).code, 2);
  assert.equal((await h.note(['--void', '--by', 'user', '--summary', 'x'])).code, 2);
});

test('v2 구조 누락을 채운 뒤에는 억제됐던 목적·안전까지 전체 검토한다', async () => {
  const h = harness();
  h.set('- TASK 형식: v2\n## 목적\n안전한 처리\n');
  await h.verify('F1 [blocking] 증명 범위 누락\nfail');
  h.set('- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n## 목적\n안전한 처리\n');
  const full = await h.verify('F1 [blocking] 안전 누락\nfail');
  assert.equal(full.json.review.rereview_of, null);
  assert.doesNotMatch(h.prompts.at(-1)!, REREVIEW);
  h.set(readFileSync(h.target, 'utf8') + '\n안전 기준 보완\n');
  const narrow = await h.verify('안전 보완 확인\npass');
  assert.equal(narrow.json.review.rereview_of, 'review-records/R2.json');
  assert.match(h.prompts.at(-1)!, REREVIEW);
});

test("S-1 직전 fail이면 원장 기준점의 원문·바뀐 줄로 재검토하고 원장·기록을 남긴다", async () => {
  const h = harness();
  h.set("# T\n- 상태: 진행\n기준 A\n접근 X\n");
  const r1 = await h.verify("F1 [blocking] 기준 A가 모호\nfail");
  assert.equal(r1.code, 0);
  assert.match(h.prompts[0]!, FIRST);
  assert.doesNotMatch(h.prompts[0]!, REREVIEW);
  h.set("# T\n- 상태: 진행\n기준 A2\n접근 X\n");
  const r2 = await h.verify("해소\nfail");
  assert.equal(r2.code, 0);
  const p = h.prompts[1]!;
  assert.match(p, REREVIEW);
  assert.match(p, /## 직전 검토 원문\nF1 \[blocking\] 기준 A가 모호/);
  assert.match(p, /- 기준 A\n\+ 기준 A2/);
  assert.doesNotMatch(p, FIRST, "1단계 문구 없음");
  assert.doesNotMatch(p, /이 호출만으로 두 단계가 실행됐다고 주장하지 않는다/);
  assert.match(p, /작성자 마감·자체 판정·지적 대응 문서는 받거나 읽지 않는다/, "작성자 자료 제한 유지");
  assert.match(p, /노출 범위에 직전 검토 원문/);
  const l = h.ledger() as ReviewEntry[];
  assert.deepEqual(l.map((e) => [e.type, e.verdict, e.rereview_of, e.record]), [["review", "fail", null, "review-records/R1.json"], ["review", "fail", "review-records/R1.json", "review-records/R2.json"]]);
  assert.deepEqual(readdirSync(join(h.dir, "review-records")).sort(), ["R1.json", "R2.json"]);
  const rec = JSON.parse(readFileSync(join(h.dir, "review-records/R2.json"), "utf8"));
  assert.equal(rec.review.snapshot, "# T\n- 상태: 진행\n기준 A2\n접근 X\n");
  assert.equal(rec.result.session_id, null, "기록에 세션 ID를 남기지 않는다(가짜 실행기는 sess-123을 돌려준다)");
  assert.ok(!readFileSync(join(h.dir, "review-records/R2.json"), "utf8").includes("sess-123"));
  assert.ok(!readFileSync(join(h.dir, "REVIEW-LOG.jsonl"), "utf8").includes("sess-123"));
  assert.equal(r2.json.review.rereview_of, "review-records/R1.json");
});

test("S-2 기준점은 구간의 가장 최근 fail — unknown은 건너뛴다", async () => {
  const a = harness();
  a.set("v1\n"); await a.verify("A1\nfail");
  a.set("v2\n"); await a.verify("A2\nfail");
  a.set("v3\n"); await a.verify("A3\nfail");
  assert.match(a.prompts[2]!, /## 직전 검토 원문\nA2/);
  assert.match(a.prompts[2]!, /- v2\n\+ v3/);
  assert.equal((a.ledger()[2] as ReviewEntry).rereview_of, "review-records/R2.json");

  const b = harness();
  b.set("v1\n"); await b.verify("B1\nfail");
  b.set("v2\n"); const u = await b.verify("판정 없음\nrevise");
  assert.equal(u.json.review.verdict, "unknown");
  assert.match(u.json.warning, /unknown/);
  b.set("v3\n"); await b.verify("B3\nfail");
  assert.match(b.prompts[2]!, /## 직전 검토 원문\nB1/);
  assert.match(b.prompts[2]!, /- v1\n\+ v3/);
  assert.equal((b.ledger()[2] as ReviewEntry).rereview_of, "review-records/R1.json");
});

test("S-3 대상 무변경·기록 삭제·기록 변조면 실행기를 부르지 않는다", async () => {
  const h = harness();
  h.set("v1\n"); await h.verify("x\nfail");
  const n = h.prompts.length;
  const same = await h.verify("y\nfail");
  assert.equal(same.code, 2); assert.match(same.json.error.message, /바뀌지 않았다/);
  h.set("v2\n");
  const recFile = join(h.dir, "review-records/R1.json");
  const saved = readFileSync(recFile, "utf8");
  const tampered = JSON.parse(saved); tampered.review.snapshot = "다른 내용\n";
  writeFileSync(recFile, JSON.stringify(tampered));
  const bad = await h.verify("z\nfail");
  assert.equal(bad.code, 2); assert.match(bad.json.error.message, /원장과 맞지 않는다/);
  const textTampered = JSON.parse(saved); textTampered.result.text = "바꾼 검토 원문\nfail";
  writeFileSync(recFile, JSON.stringify(textTampered));
  const bad2 = await h.verify("z\nfail");
  assert.equal(bad2.code, 2, "검토 원문 교체도 거부"); assert.match(bad2.json.error.message, /원장과 맞지 않는다/);
  rmSync(recFile);
  const gone = await h.verify("z\nfail");
  assert.equal(gone.code, 2); assert.match(gone.json.error.message, /기록 파일이 없다/);
  assert.equal(h.prompts.length, n, "실행기 호출 없음");
  assert.equal(h.ledger().length, 1, "원장 불변");
});

test("S-4 판정 파싱: 마지막 비어 있지 않은 줄 pass·fail, 그 밖은 unknown", async () => {
  assert.equal(parseVerdict("본문\n\npass\n"), "pass");
  assert.equal(parseVerdict("본문\n**fail**"), "fail");
  assert.equal(parseVerdict("본문\nrevise"), "unknown");
  const h = harness();
  h.set("v1\n");
  const r = await h.verify("좋다\npass");
  assert.equal(r.json.review.verdict, "pass");
  assert.equal(r.json.warning, undefined);
});

test("S-5 3회 fail → 진단 → 진단 뒤 fail → 사용자 결정 → 재개 전체 전이", async () => {
  const h = harness();
  h.set("v1\n"); assert.equal((await h.verify("a\nfail")).json.escalation, undefined);
  h.set("v2\n"); await h.verify("b\nfail");
  h.set("v3\n");
  const third = await h.verify("c\nfail");
  assert.equal(third.code, 0);
  assert.equal(third.json.escalation.stage, "diagnose");
  assert.equal(third.json.escalation.consecutive_fails, 3);
  let calls = h.prompts.length;
  h.set("v4\n");
  const blocked = await h.verify("d\nfail");
  assert.equal(blocked.code, 16); assert.equal(blocked.json.escalation.stage, "diagnose");
  assert.match(blocked.json.escalation.next, /decision-rights\.md B.*허브와 원인.*A에 해당할 때만 조치 전 owner 결정/);
  assert.match(blocked.json.escalation.next, /review-note.*--diagnosis.*전체 검토/);
  assert.equal(h.prompts.length, calls, "차단 때 실행기 호출 0");
  assert.equal(h.ledger().length, 3);

  assert.equal((await h.note(["--diagnosis", "--layer", "design", "--summary", "문서 동기화"])).code, 0);
  const afterDiag = await h.verify("e\nfail");
  assert.equal(afterDiag.code, 0);
  assert.doesNotMatch(h.prompts.at(-1)!, REREVIEW, "진단 뒤 첫 검토는 전체");
  assert.doesNotMatch(h.prompts.at(-1)!, /## 직전 검토 원문/);
  assert.equal(afterDiag.json.escalation.stage, "ask_user");
  calls = h.prompts.length;
  h.set("v5\n");
  const blocked2 = await h.verify("f\nfail");
  assert.equal(blocked2.code, 16); assert.equal(blocked2.json.escalation.stage, "ask_user");
  assert.equal(h.prompts.length, calls);

  const decision = join(h.dir, "decision.md"); writeFileSync(decision, "캡틴: 예외 승인으로 진행");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "예외 승인", "--summary", "세부 갈래만 남음", "--file", decision])).code, 0);
  const resumed = await h.verify("g\npass");
  assert.equal(resumed.code, 0);
  assert.doesNotMatch(h.prompts.at(-1)!, REREVIEW, "결정 뒤 첫 검토도 전체");
  assert.equal(resumed.json.escalation, undefined);
  assert.deepEqual(h.ledger().map((e) => e.type), ["review", "review", "review", "diagnosis", "review", "decision", "review"]);
});

test("S-6 단계 계산: pass가 연속을 초기화하고 unknown은 연속을 유지한다", () => {
  const r = (verdict: "pass" | "fail" | "unknown", n: number): ReviewEntry => ({ type: "review", at: "", kind: "task", target: "T.md", hash: "h", verdict, verifier: "codex", provider: "openai", rereview_of: null, record: `review-records/R${n}.json`, result_hash: "0".repeat(64) });
  assert.equal(reviewStage([r("fail", 1), r("fail", 2), r("pass", 3), r("fail", 4), r("fail", 5)], "T.md").stage, "normal");
  const s = reviewStage([r("fail", 1), r("unknown", 2), r("fail", 3), r("unknown", 4), r("fail", 5)], "T.md");
  assert.equal(s.stage, "diagnose"); assert.equal(s.consecutive_fails, 3); assert.equal(s.base?.record, "review-records/R5.json");
  assert.equal(reviewStage([r("fail", 1), r("fail", 2), r("fail", 3)], "OTHER.md").stage, "normal", "대상별로 센다");
});

test("S-7 손상 원장·잠금이 있으면 실행하지 않고, 원장 기록 실패는 종료 2로 알린다", async () => {
  const h = harness();
  h.set("v1\n");
  writeFileSync(join(h.dir, "REVIEW-LOG.jsonl"), "{깨진 줄\n");
  const broken = await h.verify("x\nfail");
  assert.equal(broken.code, 2); assert.match(broken.json.error.message, /손상.*:1/);
  for (const line of [JSON.stringify({ type: "memo", target: "TASK.md", at: "" }), JSON.stringify({ type: "decision", target: "TASK.md", at: "" })]) {
    writeFileSync(join(h.dir, "REVIEW-LOG.jsonl"), line + "\n");
    const r = await h.verify("x\nfail");
    assert.equal(r.code, 2, "알 수 없는 종류·필수 필드 없는 항목은 손상"); assert.match(r.json.error.message, /손상.*:1/);
  }
  rmSync(join(h.dir, "REVIEW-LOG.jsonl"));
  mkdirSync(join(h.dir, "review-records")); writeFileSync(join(h.dir, "review-records/R1.json"), "{깨짐");
  const orphan = await h.verify("x\nfail");
  assert.equal(orphan.code, 2, "읽을 수 없는 고아 기록은 멈춘다"); assert.match(orphan.json.error.message, /원장에 없는 검토 기록을 읽을 수 없다/);
  assert.equal(h.prompts.length, 0);
  rmSync(join(h.dir, "review-records"), { recursive: true });
  // 남은 잠금: 살아 있는 PID면 진행 중, 없는 PID면 치우고 진행
  writeFileSync(join(h.dir, "REVIEW-LOG.lock"), String(process.pid));
  assert.equal((await h.verify("x\nfail")).code, 2, "살아 있는 프로세스의 잠금");
  writeFileSync(join(h.dir, "REVIEW-LOG.lock"), "2147483646");
  const staleRun = await h.verify("x\nfail");
  assert.equal(staleRun.code, 0, "죽은 프로세스의 잠금은 치운다");
  assert.ok(!existsSync(join(h.dir, "REVIEW-LOG.lock")));
  rmSync(join(h.dir, "review-records"), { recursive: true }); rmSync(join(h.dir, "REVIEW-LOG.jsonl"));
  const runs = h.prompts.length;
  writeFileSync(join(h.dir, "REVIEW-LOG.lock"), "");
  const locked = await h.verify("x\nfail");
  assert.equal(locked.code, 2); assert.match(locked.json.error.message, /진행 중/);
  assert.equal(h.prompts.length, runs);
  rmSync(join(h.dir, "REVIEW-LOG.lock"));
  if (process.platform !== "win32") {
    mkdirSync(join(h.dir, "REVIEW-LOG.jsonl")); // 파일 자리에 폴더 — 읽기 단계에서 멈춘다
    const unreadable = await h.verify("x\nfail");
    assert.equal(unreadable.code, 2); assert.match(unreadable.json.error.message, /읽을 수 없다/);
    assert.equal(h.prompts.length, runs);
    rmSync(join(h.dir, "REVIEW-LOG.jsonl"), { recursive: true });
    writeFileSync(join(h.dir, "REVIEW-LOG.jsonl"), "");
    chmodSync(join(h.dir, "REVIEW-LOG.jsonl"), 0o444); // 읽기는 되고 덧붙이기는 실패
    const fail = await h.verify("x\nfail");
    chmodSync(join(h.dir, "REVIEW-LOG.jsonl"), 0o644);
    assert.equal(fail.code, 2); assert.match(fail.json.error.message, /원장 기록에 실패/);
    assert.ok(!existsSync(join(h.dir, "REVIEW-LOG.lock")), "실패해도 잠금을 푼다");
  }
});

test("S-8 review-note는 단계 안에서만, 결정은 비어 있지 않은 근거 파일이 있어야 기록한다", async () => {
  const h = harness();
  h.set("v1\n");
  assert.equal((await h.note(["--diagnosis", "--layer", "design", "--summary", "x"])).code, 2, "normal에서 진단 거부");
  await h.verify("a\nfail"); h.set("v2\n"); await h.verify("b\nfail"); h.set("v3\n"); await h.verify("c\nfail");
  const empty = join(h.dir, "empty.md"); writeFileSync(empty, "");
  const real = join(h.dir, "decision.md"); writeFileSync(real, "캡틴 결정 원문");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "x", "--summary", "y", "--file", real])).code, 2, "diagnose에서 결정 거부(근거가 정상이어도)");
  assert.equal((await h.note(["--diagnosis", "--layer", "nope", "--summary", "x"])).code, 2, "층 이름 검사");
  assert.equal(h.ledger().length, 3, "거부 때 원장 불변");
  assert.equal((await h.note(["--diagnosis", "--layer", "structure", "--summary", "검토 방식"])).code, 0);
  await h.verify("d\nfail");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "x", "--summary", "y", "--file", empty])).code, 2, "빈 결정 원문 거부");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "x", "--summary", "y"])).code, 2, "결정 원문 필수");
  const blank = join(h.dir, "blank.md"); writeFileSync(blank, "  \n");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "x", "--summary", "y", "--file", blank])).code, 2, "공백뿐인 원문 거부");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "x", "--summary", "y", "--file", h.dir])).code, 2, "폴더 거부");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "x", "--summary", "y", "--file", h.target])).code, 2, "검토 대상 자체 거부");
  assert.equal((await h.note(["--diagnosis", "--layer", "design", "--summary", "x"])).code, 2, "ask_user에서 진단 거부");
  assert.equal(h.ledger().length, 5);
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "x", "--summary", "y", "--file", real])).code, 0);
});

test("S-9 --out이 대상·원장 경로면 실행하지 않는다", async () => {
  const h = harness();
  h.set("v1\n");
  mkdirSync(join(h.dir, "review-records"), { recursive: true });
  for (const out of [h.target, join(h.dir, "REVIEW-LOG.jsonl"), join(h.dir, "REVIEW-LOG.lock"), join(h.dir, "review-records", "R1.json")]) {
    const r = await h.verify("x\nfail", ["--out", out]);
    assert.equal(r.code, 2);
  }
  assert.equal(h.prompts.length, 0);
  assert.ok(!existsSync(join(h.dir, "REVIEW-LOG.lock")), "잠금 경로 --out 거부 뒤 잠금이 남지 않는다");
  rmSync(join(h.dir, "review-records"), { recursive: true });
  const extra = join(h.dir, "copy.json");
  await h.verify("x\nfail", ["--out", extra]);
  assert.equal(JSON.parse(readFileSync(extra, "utf8")).review.verdict, "fail", "--out은 추가 사본");
});

test("S-9d 미실행(종료 10)은 원장에 적지 않고 --out에 사유를 남긴다", async () => {
  const h = harness();
  h.set("v1\n"); h.offline();
  const out = join(h.dir, "copy.json");
  const r = await h.verify("x\nfail", ["--out", out]);
  assert.equal(r.code, 10);
  assert.ok(!existsSync(join(h.dir, "REVIEW-LOG.jsonl")), "원장 없음");
  assert.ok(!existsSync(join(h.dir, "review-records")), "기록 없음");
  assert.match(readFileSync(out, "utf8"), /교차 검증 미실행/);
});

test("S-9e 링크 별칭으로 열어도 같은 원장을 쓴다", async () => {
  if (process.platform === "win32") return;
  const h = harness();
  h.set("v1\n"); await h.verify("a\nfail"); h.set("v2\n"); await h.verify("b\nfail"); h.set("v3\n"); await h.verify("c\nfail");
  const other = tempDir("pace-rl-alias-");
  const alias = join(other, "ALIAS.md"); symlinkSync(h.target, alias);
  {
    const r = await verifyCommand(["--author-agent", "claude", "--target", alias, "--purpose", "목적"], { executors: () => [], write: () => {} });
    assert.equal(r, 16, "별칭으로도 diagnose 단계에서 막힌다");
  }
  assert.ok(!existsSync(join(other, "REVIEW-LOG.jsonl")));
});

test("S-9f 쓰기 오류는 종료 2, --out 사본은 원장 확정 뒤에만, 쓰기는 rename 교체라 링크·하드링크 너머를 고치지 않는다", async () => {
  if (process.platform === "win32") return;
  const h = harness();
  h.set("v1\n");
  // 링크 --out
  const real = join(h.dir, "real.json"); writeFileSync(real, "{}");
  const link = join(h.dir, "link.json"); symlinkSync(real, link);
  // 쓰기는 rename 교체 — 링크·하드링크 --out이어도 너머의 파일 내용은 바뀌지 않는다
  const hard = join(h.dir, "hard.json"); linkSync(h.target, hard);
  const viaLink = await h.verify("x\nfail", ["--out", link]);
  assert.equal(viaLink.code, 0);
  assert.equal(readFileSync(real, "utf8"), "{}", "링크 너머 파일 불변");
  h.set("v1b\n");
  const recHard = join(h.dir, "rec-hard.json"); linkSync(join(h.dir, "review-records/R1.json"), recHard);
  const recBefore = readFileSync(join(h.dir, "review-records/R1.json"), "utf8");
  await h.verify("y\nfail", ["--out", recHard]);
  assert.equal(readFileSync(join(h.dir, "review-records/R1.json"), "utf8"), recBefore, "기록 하드링크 --out도 기록 불변");
  h.set("v1c\n");
  const viaHard = await h.verify("z\nfail", ["--out", hard]);
  assert.equal(viaHard.code, 0, "실제로 --out 사본을 쓰는 경로");
  assert.equal(readFileSync(h.target, "utf8"), "v1c\n", "대상 하드링크 --out도 대상 불변");
  for (const p of [hard, recHard, link]) rmSync(p, { force: true });
  rmSync(join(h.dir, "review-records"), { recursive: true, force: true }); rmSync(join(h.dir, "REVIEW-LOG.jsonl"), { force: true });
  const calls0 = h.prompts.length;
  // 원장 덧붙이기 실패 → --out 사본을 쓰지 않는다
  writeFileSync(join(h.dir, "REVIEW-LOG.jsonl"), ""); chmodSync(join(h.dir, "REVIEW-LOG.jsonl"), 0o444);
  const out = join(h.dir, "copy.json");
  const failed = await h.verify("x\nfail", ["--out", out]);
  chmodSync(join(h.dir, "REVIEW-LOG.jsonl"), 0o644);
  assert.equal(failed.code, 2);
  assert.ok(!existsSync(out), "원장 확정 전에는 --out 사본이 없다");
  assert.equal(h.prompts.length, calls0 + 1);
  rmSync(join(h.dir, "review-records"), { recursive: true, force: true });
  // 기록 자리 쓰기 실패 → 종료 2, 실행기 호출 없음
  const calls = h.prompts.length;
  mkdirSync(join(h.dir, "review-records")); chmodSync(join(h.dir, "review-records"), 0o555);
  const noRecord = await h.verify("x\nfail");
  chmodSync(join(h.dir, "review-records"), 0o755);
  assert.equal(noRecord.code, 2); assert.match(noRecord.json.error.message, /기록 자리/);
  assert.equal(h.prompts.length, calls);
  // 잠금 생성 실패(폴더 쓰기 불가) → 종료 2
  chmodSync(h.dir, 0o555);
  const noLock = await h.verify("x\nfail");
  chmodSync(h.dir, 0o755);
  assert.equal(noLock.code, 2); assert.match(noLock.json.error.message, /잠금을 만들 수 없다/);
});

test("S-9g review-note: 원장 쓰기 오류는 종료 2, 진단 근거가 비면 거부", async () => {
  const h = harness();
  h.set("v1\n"); await h.verify("a\nfail"); h.set("v2\n"); await h.verify("b\nfail"); h.set("v3\n"); await h.verify("c\nfail");
  const empty = join(h.dir, "empty.md"); writeFileSync(empty, " \n");
  assert.equal((await h.note(["--diagnosis", "--layer", "design", "--summary", "x", "--file", empty])).code, 2, "빈 진단 근거 거부");
  if (process.platform === "win32") return;
  chmodSync(join(h.dir, "REVIEW-LOG.jsonl"), 0o444);
  const r = await h.note(["--diagnosis", "--layer", "design", "--summary", "x"]);
  chmodSync(join(h.dir, "REVIEW-LOG.jsonl"), 0o644);
  assert.equal(r.code, 2); assert.match(r.json.error.message, /원장 기록에 실패/);
  assert.equal(h.ledger().length, 3);
});

test("S-9h 실행기 오류·미실행 --out 쓰기 오류·너무 큰 변경", async () => {
  const h = harness();
  h.set("v1\n");
  // 실행기가 오류로 끝나면 기록 자리를 치우고 그 오류 코드로 끝난다
  const boom: Executor = { agent: "codex", mode: "p", capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true }, async run() { throw new AgentError("agent_failed", "실패"); } };
  const out: string[] = [];
  const code = await verifyCommand(["--author-agent", "claude", "--target", h.target, "--purpose", "목적"], { executors: () => [boom], write: (t) => out.push(t) });
  assert.equal(code, 7);
  assert.ok(!existsSync(join(h.dir, "review-records")), "기록 자리 정리");
  assert.equal(h.ledger().length, 0);
  // 미실행 경로의 --out 쓰기 오류는 종료 2
  if (process.platform !== "win32") {
    const ro = join(h.dir, "ro"); mkdirSync(ro); chmodSync(ro, 0o555);
    h.offline();
    const r = await h.verify("x\nfail", ["--out", join(ro, "o.json")]);
    chmodSync(ro, 0o755);
    assert.equal(r.code, 2);
  }
  // 아주 크게 바뀌어도 막다른 길 없이 재검토한다(거친 비교로 바뀐 구간을 통째로 준다)
  const g = harness();
  g.set(["머리", ...Array.from({ length: 2100 }, (_, i) => "a" + i), "꼬리"].join("\n")); await g.verify("x\nfail");
  g.set(["머리", ...Array.from({ length: 2100 }, (_, i) => "b" + i), "꼬리"].join("\n"));
  const big = await g.verify("y\nfail");
  assert.equal(big.code, 0);
  assert.match(g.prompts[1]!, REREVIEW);
  assert.match(g.prompts[1]!, /  머리\n- a0\n- a1/);
  assert.match(g.prompts[1]!, /\+ b2099\n  꼬리/);
});

test("S-9i 일반 대상의 중단 복구는 기존 진단에 남고 재검토 기준점에서 빠진다", async () => {
  const h = harness();
  h.set("v1\n"); await h.verify("A1\nfail");
  h.set("v2\n"); await h.verify("A2\nfail");
  // 세 번째 검토가 실행 중 중단돼 pending만 남은 상황
  writeFileSync(join(h.dir, "review-records/R3.json"), JSON.stringify({ pending: true, review: { target: "TASK.md", hash: "x" } }));
  h.set("v3\n");
  const r = await h.verify("never");
  assert.equal(r.code, 16, "예산 단위 밖의 일반 대상은 기존 진단 단계를 유지한다");
  assert.match(r.json.recovered[0], /R3\.json\(TASK\.md\): 실행 중 중단/);
  const l = h.ledger() as ReviewEntry[];
  assert.equal(l.length, 3); assert.equal(l[2]!.interrupted, true); assert.equal(l[2]!.verdict, "fail");
  assert.equal(h.prompts.length, 2);
  // 판정 있는 기록의 복구와, 중단 항목이 기준점에서 빠지는지
  const k = harness();
  k.set("v1\n"); await k.verify("K1\nfail");
  const rec = JSON.parse(readFileSync(join(k.dir, "review-records/R1.json"), "utf8"));
  writeFileSync(join(k.dir, "REVIEW-LOG.jsonl"), ""); // 원장 추가가 끊긴 상황
  writeFileSync(join(k.dir, "review-records/R2.json"), JSON.stringify({ pending: true, review: { target: "TASK.md", hash: "y" } }));
  k.set("v2\n");
  const r2 = await k.verify("K3\nfail");
  assert.equal(r2.code, 0);
  assert.equal(r2.json.recovered.length, 2);
  const kl = k.ledger() as ReviewEntry[];
  assert.deepEqual(kl.map((e) => [e.record, e.verdict, e.interrupted ?? false]), [["review-records/R1.json", "fail", false], ["review-records/R2.json", "fail", true], ["review-records/R3.json", "fail", false]]);
  assert.equal(kl[2]!.rereview_of, "review-records/R1.json", "중단 항목은 기준점이 되지 않는다");
  assert.match(k.prompts.at(-1)!, /## 직전 검토 원문\nK1/);
  void rec;
});

test("S-9k 자동 복구는 기록을 검증한다: 위조 판정은 fail(중단)으로, 맞는 pass·unknown은 그 판정과 rereview_of로, 번호 순으로", async () => {
  // 위조: diagnose 단계에서 pass로 바꾼 고아 기록을 넣어도 차단이 풀리지 않는다
  const h = harness();
  h.set("v1\n"); await h.verify("a\nfail"); h.set("v2\n"); await h.verify("b\nfail"); h.set("v3\n"); await h.verify("c\nfail");
  writeFileSync(join(h.dir, "review-records/R4.json"), JSON.stringify({ result: { text: "…\nfail" }, review: { verdict: "pass", hash: "", snapshot: "" } }));
  h.offline();
  const forged = await h.verify("x\nfail");
  assert.equal(forged.code, 16, "차단 유지");
  assert.match(forged.json.recovered[0], /서로 맞지 않는다/);
  assert.equal((h.ledger().at(-1) as ReviewEntry).interrupted, true);
  // 맞는 기록은 그 판정(pass·unknown)과 rereview_of로, 여러 개면 번호 순
  const k = harness();
  k.set("v1\n"); await k.verify("K1\nfail");
  k.set("v2\n"); await k.verify("K2\nrevise");
  k.set("v3\n"); await k.verify("K3\npass");
  const recs = [1, 2, 3].map((n) => readFileSync(join(k.dir, `review-records/R${n}.json`), "utf8"));
  rmSync(join(k.dir, "review-records"), { recursive: true }); mkdirSync(join(k.dir, "review-records"));
  // R1→R9, R2→R10, R3→R11로 옮겨 사전순과 번호순이 다르게
  const order = [[recs[0]!, 9], [recs[1]!, 10], [recs[2]!, 11]] as const;
  for (const [text, n] of order) writeFileSync(join(k.dir, `review-records/R${n}.json`), text.replace(/review-records\/R1\.json/g, "review-records/R9.json"));
  writeFileSync(join(k.dir, "REVIEW-LOG.jsonl"), "");
  k.set("v4\n");
  const r = await k.verify("K4\nfail");
  assert.equal(r.code, 0);
  const kl = k.ledger() as ReviewEntry[];
  assert.deepEqual(kl.slice(0, 3).map((e) => [e.record, e.verdict, e.interrupted ?? false]), [["review-records/R9.json", "fail", false], ["review-records/R10.json", "unknown", false], ["review-records/R11.json", "pass", false]]);
  assert.equal(kl[1]!.rereview_of, "review-records/R9.json", "복구 항목의 rereview_of 보존");
  assert.equal(kl[3]!.rereview_of, null, "pass 뒤라 처음 검토");
});

test("S-9l 원장 검증·잠금 PID·판정 구분자", async () => {
  const h = harness();
  h.set("v1\n");
  const bad = { type: "review", at: "", kind: "task", target: "TASK.md", hash: "h", verdict: "pass", verifier: "x", provider: null, rereview_of: null, record: "review-records/R1.json", result_hash: "0".repeat(64), interrupted: true };
  writeFileSync(join(h.dir, "REVIEW-LOG.jsonl"), JSON.stringify(bad) + "\n");
  assert.equal((await h.verify("x\nfail")).code, 2, "interrupted는 fail만");
  rmSync(join(h.dir, "REVIEW-LOG.jsonl"));
  // 실행 중 잠금 파일에는 이 프로세스 PID가 있다
  let lockText = "";
  const peek: Executor = { agent: "codex", mode: "p", capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true }, async run(request) { lockText = readFileSync(join(h.dir, "REVIEW-LOG.lock"), "utf8"); return normalizeResult(request, { text: "x\nfail", provider: "openai", model: "gpt-6" }, { durationMs: 1, enforcement: "fake" }); } };
  await verifyCommand(["--author-agent", "claude", "--target", h.target, "--purpose", "목적"], { executors: () => [peek], write: () => {} });
  assert.equal(lockText, String(process.pid));
  // 살아 있지만 권한이 없는 프로세스(EPERM)는 진행 중으로 본다 — PID 1
  if (process.platform !== "win32" && process.getuid?.() !== 0) {
    writeFileSync(join(h.dir, "REVIEW-LOG.lock"), "1");
    h.set("v2\n");
    assert.equal((await h.verify("y\nfail")).code, 2, "PID 1 잠금은 남은 잠금이 아니다");
    rmSync(join(h.dir, "REVIEW-LOG.lock"));
  }
  assert.equal(parseVerdict("본문\nx|fail"), "unknown");
  // 미실행(종료 10) 출력에도 복구 안내가 붙는다
  const g = harness();
  g.set("v1\n"); mkdirSync(join(g.dir, "review-records"));
  writeFileSync(join(g.dir, "review-records/R1.json"), JSON.stringify({ pending: true, review: { target: "TASK.md", hash: "z" } }));
  g.offline();
  const nr = await g.verify("x\nfail");
  assert.equal(nr.code, 10); assert.match(nr.json.recovered[0], /R1\.json/);
});

test("S-9j 판정 단어 변형·대소문자만 다른 --out", async () => {
  assert.equal(parseVerdict("본문\n판정: fail"), "fail");
  assert.equal(parseVerdict("본문\n**판정: PASS**"), "pass");
  assert.equal(parseVerdict("본문\nfailure"), "unknown");
  const h = harness();
  h.set("v1\n");
  const r = await h.verify("x\nfail", ["--out", join(h.dir, "review-log.JSONL")]);
  assert.equal(r.code, 2, "대소문자만 다른 원장 경로");
  assert.equal(h.prompts.length, 0);
});

test("S-9m 도구 결함으로 무효인 검토(void)는 횟수·기준점에서 빠지고, 대상이 그대로여도 다시 검토할 수 있다", async () => {
  const h = harness();
  h.set("v1\n"); await h.verify("A1 열람 불가\nfail");
  // 도구만 고침(대상 그대로) — 그냥 다시 부르면 무변경 거부
  assert.equal((await h.verify("x\nfail")).code, 2);
  const why = join(h.dir, "tool-fix.md"); writeFileSync(why, "verify 프롬프트가 열람을 막던 결함을 고쳤다");
  assert.equal((await h.note(["--void", "--record", "review-records/R9.json", "--summary", "없음", "--file", why])).code, 2, "원장에 없는 검토");
  assert.equal((await h.note(["--void", "--record", "review-records/R1.json", "--summary", "도구 결함", "--file", join(h.dir, "nope.md")])).code, 2, "근거 필수");
  assert.equal((await h.note(["--void", "--record", "review-records/R1.json", "--summary", "도구 결함", "--file", why])).code, 0);
  assert.equal((await h.note(["--void", "--record", "review-records/R1.json", "--summary", "도구 결함", "--file", why])).code, 2, "중복 무효");
  const again = await h.verify("B1\nfail");
  assert.equal(again.code, 0, "대상이 그대로여도 전체 검토로 다시 연다");
  assert.equal(again.json.review.rereview_of, null);
  // 무효 검토는 세지 않는다: 이후 fail 2회로는 진단 단계가 아니다
  h.set("v2\n"); const r = await h.verify("B2\nfail");
  assert.equal(r.json.escalation, undefined);
  assert.equal(r.json.review.rereview_of, "review-records/R2.json", "기준점은 무효가 아닌 가장 최근 fail");
  // 열린 단계(diagnose·ask_user)에서는 무효 처리로 빠져나갈 수 없다
  h.set("v3\n"); const third = await h.verify("B3\nfail");
  assert.equal(third.json.escalation.stage, "diagnose");
  assert.equal((await h.note(["--void", "--record", "review-records/R4.json", "--summary", "도구 결함", "--file", why])).code, 2, "diagnose 단계 무효 거부");
  assert.equal((await h.note(["--diagnosis", "--layer", "design", "--summary", "x"])).code, 0);
  h.set("v4\n"); const afterDiag = await h.verify("B4\nfail");
  assert.equal(afterDiag.json.escalation.stage, "ask_user");
  assert.equal((await h.note(["--void", "--record", "review-records/R5.json", "--summary", "도구 결함", "--file", why])).code, 2, "ask_user 단계 무효 거부");
});

test("S-9n 무효 처리는 이 대상의 실행된 fail 검토만", async () => {
  const h = harness();
  const why = join(h.dir, "why.md"); writeFileSync(why, "근거");
  h.set("v1\n"); await h.verify("ok\npass");
  assert.equal((await h.note(["--void", "--record", "review-records/R1.json", "--summary", "x", "--file", why])).code, 2, "pass는 무효 처리하지 않는다");
  // 같은 폴더의 다른 대상 검토 record
  const other = join(h.dir, "OTHER.md"); writeFileSync(other, "o\n");
  await verifyCommand(["--author-agent", "claude", "--target", other, "--purpose", "목적"], { executors: () => [{ agent: "codex", mode: "p", capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true }, async run(request) { return normalizeResult(request, { text: "x\nfail", provider: "openai", model: "gpt-6" }, { durationMs: 1, enforcement: "fake" }); } }], write: () => {} });
  assert.equal((await h.note(["--void", "--record", "review-records/R2.json", "--summary", "x", "--file", why])).code, 2, "다른 대상의 검토는 무효 처리하지 않는다");
  // 중단 복구 항목
  writeFileSync(join(h.dir, "review-records/R3.json"), JSON.stringify({ pending: true, review: { target: "TASK.md", hash: "q" } }));
  h.set("v2\n"); h.offline(); await h.verify("x\nfail");
  assert.equal((await h.note(["--void", "--record", "review-records/R3.json", "--summary", "x", "--file", why])).code, 2, "중단 복구는 무효 처리하지 않는다");
});

test("S-9o 중단 복구는 기록의 대상에 귀속한다(같은 폴더의 다른 대상)", async () => {
  const h = harness();
  h.set("v1\n"); mkdirSync(join(h.dir, "review-records"));
  // 구현 diff 검토가 중단돼 남은 pending
  writeFileSync(join(h.dir, "review-records/R1.json"), JSON.stringify({ pending: true, review: { target: "impl-diff.patch", hash: "d" } }));
  const r = await h.verify("A1\nfail");
  assert.equal(r.code, 0);
  assert.match(r.json.recovered[0], /R1\.json\(impl-diff\.patch\)/);
  const l = h.ledger() as ReviewEntry[];
  assert.deepEqual(l.map((e) => [e.target, e.verdict, e.interrupted ?? false]), [["impl-diff.patch", "fail", true], ["TASK.md", "fail", false]]);
  assert.equal(r.json.review.rereview_of, null, "TASK.md에는 다른 대상의 중단이 들어오지 않는다");
  // 다른 대상의 판정 있는 기록(pass)도 그 대상에 귀속 — 지금 대상의 구간을 초기화하지 않는다
  const k = harness();
  const other = join(k.dir, "impl-diff.patch"); writeFileSync(other, "d1\n");
  await verifyCommand(["--author-agent", "claude", "--target", other, "--purpose", "목적"], { executors: () => [{ agent: "codex", mode: "p", capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true }, async run(request) { return normalizeResult(request, { text: "좋다\npass", provider: "openai", model: "gpt-6" }, { durationMs: 1, enforcement: "fake" }); } }], write: () => {} });
  writeFileSync(join(k.dir, "REVIEW-LOG.jsonl"), ""); // impl-diff의 pass 기록이 원장에서 끊긴 상황
  k.set("v1\n"); await k.verify("A\nfail"); k.set("v2\n"); await k.verify("B\nfail");
  k.set("v3\n"); const third = await k.verify("C\nfail");
  assert.equal(third.json.escalation.stage, "diagnose", "다른 대상의 pass가 이 대상의 연속 fail을 끊지 않는다");
  const kl = k.ledger() as ReviewEntry[];
  assert.deepEqual([kl[0]!.target, kl[0]!.verdict], ["impl-diff.patch", "pass"]);
});

test("S-9c 실제 진입점: fail 3줄 원장이면 실행기 탐색 전에 종료 16", () => {
  const home = tempDir();
  const bin = join(home, "empty"); mkdirSync(bin);
  const target = join(home, "TASK.md"); writeFileSync(target, "v\n");
  const line = (n: number) => JSON.stringify({ type: "review", at: "", kind: "task", target: "TASK.md", hash: "h", verdict: "fail", verifier: "codex", provider: "openai", rereview_of: null, record: `review-records/R${n}.json`, result_hash: "0".repeat(64) });
  writeFileSync(join(home, "REVIEW-LOG.jsonl"), [1, 2, 3].map(line).join("\n") + "\n");
  const r = runPace(["agent", "verify", "--author-agent", "claude", "--target", target, "--purpose", "목적"], { home, env: { PATH: bin } });
  assert.equal(r.status, 16);
  assert.equal(JSON.parse(r.stdout).escalation.stage, "diagnose");
});

test("lineDiff는 바뀐 줄과 앞뒤 1줄 맥락만 낸다", () => {
  const d = lineDiff("a\nb\nc\nd\ne\nf\n", "a\nb\nC\nd\ne\nf\n");
  assert.equal(d, "  b\n- c\n+ C\n  d");
  assert.equal(lineDiff("x\n", "x\n"), "(바뀐 줄 없음)");
});


test("P017 T01 S-5: legacyStructureOnly 판정은 reviewer 줄과 무관하게 그대로다", () => {
  const seed = (snapshot: string) => {
    const h = budgetHarness();
    const text = "F1 [blocking] 계획 누락\nfail";
    const record = "review-records/R1.json";
    const entry: ReviewEntry = {
      type: "review", at: "2026-01-01", kind: "task", target: "TASK.md", hash: reviewHash(snapshot),
      verdict: "fail", verifier: "codex", provider: "openai", rereview_of: null, record, result_hash: textHash(text),
    };
    mkdirSync(join(h.task, "review-records"));
    writeFileSync(join(h.task, record), JSON.stringify({ review: { snapshot }, result: { text } }));
    writeFileSync(join(h.task, "REVIEW-LOG.jsonl"), JSON.stringify(entry) + "\n");
    const status = readReviewBudget(reviewBudgetScope(join(h.task, "TASK.md"))!).status;
    return [status.rounds, status.calls];
  };
  // 증명 범위는 온전하고 reviewer 줄만 없는 옛 v2 fail — 구조 전용이 아니므로 판정 회차로 센다.
  assert.deepEqual(seed("- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n## 목적\n안전한 처리\n"), [1, 1]);
  // 증명 범위가 없는 옛 v2 fail — 여전히 구조 전용이라 호출로만 센다.
  assert.deepEqual(seed("- TASK 형식: v2\n## 목적\n안전한 처리\n"), [0, 1]);
});
