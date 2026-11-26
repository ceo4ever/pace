import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeResult, type Executor } from "../src/agent/contract.ts";
import { reviewHash, reviewIssues } from "../src/project/pre-review.ts";
import { ledgerPath, readLedger, textHash } from "../src/agent/review-log.ts";
import { verifyCommand } from "../src/agent/verify-cli.ts";
import { effectiveBlocking } from "../src/agent/structured-review.ts";
import { readAgentCalls, recordAgentCall, unknownCallValue, type AgentCall } from "../src/project/agent-calls.ts";
import { reviewArtifactCommand } from "../src/agent/review-hand.ts";
import { tryRecordCall } from "../src/agent/call-context.ts";
import { evidenceReviewFixture, runPace, sessionFreeEnv, tempDir } from "./helpers.ts";

const initial = "# T06 검토\n- 상태: 진행\n- 사전 검토: v1\n- TASK 형식: v2\n\n## 목적\n기존 결과를 확인한다.\n\n## 증명 범위\n- 판정 주체: 자동 시험\n\n## 기준\n\n| # | 기준 |\n|---|---|\n| T-1 | 실제 결과가 보인다 |\n\n## 접근\n순서 A를 확인한다.\n";
const grant = { mode: "implementation", paths: [], protected: [{ from: 7, to: 7 }] };
const blocking = { id: "F1", severity: "blocking", category: "scope", location: "TASK.md:7",
  scenario: "대상 결과를 확인하지 못한다", reproduction: "주어진 계획으로 결과 관측 조건을 실행한다", confidence: "high" };

function raw(findings: unknown[] = [], footer = "pass") {
  return ["독립 검토", "```pace-review", JSON.stringify({ version: 1, findings, permission: grant }), "```", footer].join("\n");
}

function fixture() {
  const root = tempDir("pace-review-hand-");
  const paceHome = tempDir("pace-review-hand-home-");
  const directory = join(root, "projects/P013_fixture/tasks/T06_fixture");
  const target = join(directory, "TASK.md");
  const evidence = join(directory, "evidence");
  const other = join(evidence, "impl.diff");
  const purpose = join(root, "purpose.md");
  const submitted = join(root, "submitted.md");
  const prePath = join(directory, "PRE-REVIEW.json");
  const records = join(directory, "review-records");
  mkdirSync(evidence, { recursive: true });
  writeFileSync(target, initial);
  writeFileSync(other, "구현 전후 차이");
  writeFileSync(purpose, "상위 목적과 합의된 검토 범위를 확인한다.\n");
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-C", root, "-c", "user.name=fixture", "-c", "user.email=test@example.com", ...args],
      { env: sessionFreeEnv(), encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  const call = (action: string, flags: string[], file = target) => {
    const r = runPace(["agent", action, "--target", file, ...flags], { cwd: root, home: paceHome });
    let body;
    try { body = JSON.parse(r.stdout); } catch { body = r.stdout + r.stderr; }
    return { status: r.status, body, output: r.stdout + r.stderr };
  };
  const hand = (file = target) => call("review-hand", ["--author-provider", "openai", "--purpose-file", purpose], file);
  const setReply = (saved: string, response: string) => writeFileSync(submitted,
    evidenceReviewFixture(JSON.parse(readFileSync(saved, "utf8")).prompt, response));
  const record = (id: string, flags: string[] = [], file = target) => call("review-record", [
    "--hand", id, "--provider", "anthropic", "--reviewer", "claude", "--result-file", submitted, ...flags,
  ], file);
  const pre = () => call("review-pre", ["--author-provider", "openai"]);
  const note = (flags: string[]) => call("review-note", ["--summary", "합성 결정의 경계 시험", ...flags]);
  const verify = async (response: string, file = target) => {
    let output = "", executed = 0;
    const agent: Executor = {
      agent: "claude", mode: "p",
      capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
      async run(request) {
        executed++;
        return normalizeResult(request, { text: evidenceReviewFixture(request.prompt, response), provider: "anthropic" },
          { durationMs: 10, enforcement: "fixture" });
      },
    };
    const status = await verifyCommand(["--target", file, "--author-agent", "codex", "--purpose-file", purpose], {
      executors: () => [agent], write: (value) => { output += value; },
    });
    return { status, body: JSON.parse(output), executed };
  };
  const edit = (text: string) => writeFileSync(target, initial.replace("순서 A", text));
  return { root, directory, target, evidence, other, purpose, submitted, prePath, records, git, call, hand, record, setReply, pre, note, verify, edit };
}

test("T06 혼합 예산: verify 1회와 고정 3회, 판정 2회, 소진 뒤 고정·원장 변경 없음", async () => {
  const h = fixture();
  const native = await h.verify(raw());
  assert.equal(native.body.review.verdict, "pass", native.body.error?.message);
  const hands = [h.hand(), h.hand(), h.hand()];
  for (const [index, fixed] of hands.entries()) {
    assert.equal(fixed.status, 0, fixed.output);
    assert.deepEqual([fixed.body.budget.calls, fixed.body.budget.rounds], [index + 2, 1]);
  }
  const reserve = hands[0]!.body;
  h.setReply(reserve.snapshot, raw());
  const stored = h.record(reserve.hand);
  assert.equal(stored.status, 0, stored.output);
  assert.deepEqual([stored.body.budget.calls, stored.body.budget.rounds], [4, 2]);
  const pieces = readdirSync(h.records);
  const journal = readFileSync(ledgerPath(h.target), "utf8");
  const denied = h.hand();
  assert.equal(denied.status, 16, denied.output);
  assert.deepEqual([denied.body.ran, denied.body.reason, denied.body.next_command], [false, "budget_exhausted", "pace agent verify"]);
  assert.equal(h.record(hands[1]!.body.hand).status, 16);
  assert.equal(h.record(reserve.hand).status, 2);
  assert.equal(readFileSync(ledgerPath(h.target), "utf8"), journal);
  assert.deepEqual(readdirSync(h.records), pieces);
});

test("T06 미완료 고정만 호출 한도를 소진하고 판정 횟수는 0으로 남긴다", () => {
  const h = fixture();
  for (let index = 1; index <= 4; index++) {
    const fixed = h.hand();
    assert.equal(fixed.status, 0, fixed.output);
    assert.deepEqual([fixed.body.budget.calls, fixed.body.budget.rounds], [index, 0]);
  }
  const denied = h.hand();
  assert.equal(denied.status, 16, denied.output);
  assert.equal(denied.body.budget.exhausted, "calls");
  assert.equal(readdirSync(h.records).length, 4);
});

test("T06 고정: 미예약·다른 단계·변조 입력과 링크를 거부하고 변경 전 원문을 보존한다", () => {
  const h = fixture();
  writeFileSync(h.submitted, raw());
  const unknown = "4b425098-d77b-47bc-a47c-be836f14422b";
  assert.equal(h.record(unknown).status, 2);
  assert.equal(existsSync(ledgerPath(h.target)), false);
  const foreign = h.hand(h.other);
  assert.equal(foreign.status, 0, foreign.output);
  assert.equal(h.record(foreign.body.hand).status, 2);
  assert.equal(existsSync(ledgerPath(h.target)), false);
  const fixed = h.hand();
  assert.equal(fixed.status, 0, fixed.output);
  const stated = readFileSync(fixed.body.snapshot, "utf8");
  const before = readFileSync(ledgerPath(h.target), "utf8");
  writeFileSync(fixed.body.snapshot, stated.replace("순서 A", "변조"));
  assert.match(h.record(fixed.body.hand).body.error.message, /지문과 다르다/);
  assert.equal(readFileSync(ledgerPath(h.target), "utf8"), before);
  writeFileSync(fixed.body.snapshot, stated);
  h.edit("순서 B");
  h.setReply(fixed.body.snapshot, raw([{ ...blocking, severity: "should_fix", location: "TASK.md:18" }]));
  const archived = h.record(fixed.body.hand);
  assert.equal(archived.status, 0, archived.output);
  assert.deepEqual([archived.body.review.hash, archived.body.review.verdict, archived.body.assessment.verdict], [reviewHash(initial), "unknown", "pass"]);
  assert.deepEqual([archived.body.budget.calls, archived.body.budget.rounds], [1, 0]);
  assert.equal(archived.body.review.permission, undefined);
  assert.equal(JSON.parse(readFileSync(join(h.directory, archived.body.review.record), "utf8")).review.snapshot, initial);
  assert.equal(h.pre().status, 2);
  assert.equal(existsSync(h.prePath), false);

  if (process.platform !== "win32") {
    const isolated = fixture();
    mkdirSync(join(isolated.root, "outside"));
    symlinkSync(join(isolated.root, "outside"), isolated.records);
    assert.equal(isolated.hand().status, 2);
    assert.deepEqual(readdirSync(join(isolated.root, "outside")), []);
    assert.equal(existsSync(ledgerPath(isolated.target)), false);
  }
});

test("T06 외부 판정은 말미 대신 구조화 blocking·필수 증거 및 구현 지적을 계산한다", () => {
  for (const [read, evidenceMissing, expected] of [
    [raw([blocking]), false, "fail"],
    [raw(), true, "unknown"],
    [raw([{ ...blocking, category: "implementation" }], "fail"), false, "pass"],
  ] as const) {
    const h = fixture();
    const fixed = h.hand();
    assert.equal(fixed.status, 0, fixed.output);
    h.setReply(fixed.body.snapshot, read);
    if (evidenceMissing) {
      writeFileSync(h.submitted, readFileSync(h.submitted, "utf8").replace('"state":"present"', '"state":"unverified"'));
    }
    const archived = h.record(fixed.body.hand);
    assert.equal(archived.status, 0, archived.output);
    assert.equal(archived.body.review.verdict, expected);
    assert.deepEqual([archived.body.budget.calls, archived.body.budget.rounds], [1, expected === "unknown" ? 0 : 1]);
    assert.equal(archived.body.source, "external");
    if (expected === "pass") {
      assert.equal(archived.body.assessment.findings[0].effective, "note");
      assert.equal(archived.body.review.permission.base, h.git("rev-parse", "HEAD"));
    }
  }
});

test("T06 외부 재검토는 직전 검토의 미확인 증거 상태를 함께 고정한다", () => {
  const h = fixture();
  const fixed = h.hand();
  assert.equal(fixed.status, 0, fixed.output);
  h.setReply(fixed.body.snapshot, raw());
  writeFileSync(h.submitted, readFileSync(h.submitted, "utf8").replace('"state":"present"', '"state":"unverified"'));
  const unknown = h.record(fixed.body.hand);
  assert.equal(unknown.body.review.verdict, "unknown");
  const next = h.hand();
  assert.equal(next.status, 0, next.output);
  const snapshot = JSON.parse(readFileSync(next.body.snapshot, "utf8"));
  assert.equal(snapshot.rereview_of, unknown.body.review.record);
  assert.match(snapshot.prompt, /직전 기준별 증거 상태/);
  h.setReply(next.body.snapshot, raw());
  assert.equal(h.record(next.body.hand).body.review.verdict, "pass");
});

test("T06 중단 복구도 고정 원문이 맞는 외부 판정만 되살린다", () => {
  for (const mode of ["pass", "stale", "tampered", "pending"] as const) {
    const h = fixture();
    const fixed = h.hand();
    assert.equal(fixed.status, 0, fixed.output);
    h.setReply(fixed.body.snapshot, raw());
    if (mode === "stale") h.edit("고정 이후 대상 변경");
    const recorded = h.record(fixed.body.hand);
    assert.equal(recorded.body.review.verdict, mode === "stale" ? "unknown" : "pass");
    const journal = ledgerPath(h.target);
    writeFileSync(journal, readLedger(h.target).filter((row) => row.type !== "review").map((row) => JSON.stringify(row)).join("\n") + "\n");
    if (mode === "tampered") writeFileSync(fixed.body.snapshot, readFileSync(fixed.body.snapshot, "utf8") + " ");
    if (mode === "pending") {
      const file = join(h.directory, recorded.body.review.record);
      const archive = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ pending: true, review: archive.review }));
    }
    const recovered = h.pre();
    assert.equal(recovered.status, mode === "pass" ? 0 : 2, recovered.output);
    const verdict = readLedger(h.target).at(-1);
    if (verdict?.type !== "review") assert.fail("외부 판정 복구 기록이 없다");
    assert.deepEqual([verdict.verdict, verdict.interrupted, verdict.stale], mode === "pass" ? ["pass", undefined, undefined] :
      mode === "stale" ? ["unknown", undefined, true] : ["fail", true, undefined]);
    assert.equal(existsSync(h.prePath), mode === "pass");
  }
});

test("T06 PRE 생성: 실패 뒤 대체 검토의 연속성·허가, 수기 결과, 무효·중단, 쓰기 경계", async () => {
  const h = fixture();
  const failed = await h.verify(raw([blocking]));
  assert.equal(failed.body.review.verdict, "fail", JSON.stringify(failed.body));
  h.edit("수정된 순서 B");
  const fixed = h.hand();
  assert.equal(fixed.status, 0, fixed.output);
  h.setReply(fixed.body.snapshot, raw());
  const unavailable = join(h.root, "unavailable.json");
  writeFileSync(unavailable, JSON.stringify({ ran: false, provider: "anthropic", reason: "합성 교차 실행기 연결 실패" }));
  const accepted = h.call("review-record", ["--hand", fixed.body.hand, "--provider", "openai", "--reviewer", "codex",
    "--result-file", h.submitted, "--unavailable-file", unavailable]);
  assert.equal(accepted.status, 0, accepted.output);
  const original = readFileSync(h.target, "utf8");
  const manual = { version: 1, author: "openai", attempts: [
    { hash: failed.body.review.hash, provider: "anthropic", cross: true, status: "fail", blocking: 1, evidence: failed.body.review.record, continuity: "new" },
    { hash: fixed.body.hash, provider: "anthropic", cross: true, status: "unavailable", blocking: 0, evidence: accepted.body.review.record, continuity: "changed", reason: "합성 교차 실행기 연결 실패" },
    { hash: fixed.body.hash, provider: "openai", cross: false, status: "pass", blocking: 0, evidence: accepted.body.review.record, continuity: "changed",
      reason: "원장 기준점에서 재검토", permission: accepted.body.review.permission },
  ] };
  writeFileSync(h.prePath, JSON.stringify(manual));
  const manualIssues = reviewIssues(h.directory, original);
  assert.deepEqual(manualIssues, []);
  const generated = h.pre();
  assert.equal(generated.status, 0, generated.output);
  assert.equal(generated.body.pre_review_ok, true);
  const attempts = JSON.parse(readFileSync(h.prePath, "utf8")).attempts;
  assert.equal(attempts[2].continuity, "changed");
  assert.equal(attempts[2].source, "external");
  assert.deepEqual(attempts[2].permission, accepted.body.review.permission);
  assert.deepEqual(reviewIssues(h.directory, original), manualIssues);

  const proof = join(h.evidence, "void.md");
  writeFileSync(proof, "합성 무효 조건을 직접 확인했다.");
  assert.equal(h.note(["--void", "--record", failed.body.review.record, "--file", proof]).status, 0);
  const last = readLedger(h.target).find((row) => row.type === "review");
  assert.equal(last?.type, "review");
  if (last?.type === "review") {
    const interrupted = { ...last, record: "review-records/R999.json", interrupted: true, result_hash: textHash("") };
    writeFileSync(ledgerPath(h.target), JSON.stringify(interrupted) + "\n", { flag: "a" });
  }
  assert.equal(h.pre().body.attempts, 2);

  if (process.platform !== "win32") {
    const external = join(h.root, "existing.json");
    const state = "이 파일을 보존한다";
    writeFileSync(external, state);
    renameSync(h.prePath, join(h.directory, "PRE-BACKUP.json"));
    symlinkSync(external, h.prePath);
    assert.equal(h.pre().status, 2);
    assert.equal(readFileSync(external, "utf8"), state);
    rmSync(h.prePath);
    const alias = fixture();
    renameSync(alias.directory, alias.directory + "-old");
    symlinkSync(h.directory, alias.directory);
    assert.equal(alias.pre().status, 2);
    assert.equal(existsSync(h.prePath), false);
  }
});

test("T06 PRE 생성: 유효한 사용자 예외만 그대로 보존한다", async () => {
  const h = fixture();
  const attempted = await h.verify(raw([blocking]));
  assert.equal(attempted.body.review.verdict, "fail");
  const empty = h.pre();
  assert.equal(empty.status, 0, empty.output);
  assert.equal(empty.body.pre_review_ok, false);
  const manual = JSON.parse(readFileSync(h.prePath, "utf8"));
  const receipt = join(h.evidence, "owner.md");
  writeFileSync(receipt, "합성 사용자 원문 · 현재 결과의 미충족을 허가함");
  const waiver = { by: "user", date: "2026-11-26", reason: "명시적 사용자 결정", evidence: "evidence/owner.md", hash: reviewHash(initial) };
  writeFileSync(h.prePath, JSON.stringify({ ...manual, waiver }));
  const retained = h.pre();
  assert.equal(retained.body.waiver, "retained", retained.output);
  assert.equal(retained.body.pre_review_ok, true);
  assert.deepEqual(JSON.parse(readFileSync(h.prePath, "utf8")).waiver, waiver);
  h.edit("다른 계약");
  const invalid = h.pre();
  assert.equal(invalid.body.waiver, "inactive_preserved");
  assert.equal(invalid.body.pre_review_ok, false);
  assert.equal(JSON.parse(readFileSync(h.prePath, "utf8")).waiver, undefined);
  assert.deepEqual(JSON.parse(readFileSync(h.prePath, "utf8")).inactive_waiver, waiver);
  writeFileSync(h.target, initial);
  assert.equal(h.pre().body.waiver, "retained");
});

test("T06 PRE 생성: 옛 원장의 검토에서 수기 기록과 같은 판정을 낸다", () => {
  const h = fixture();
  mkdirSync(h.records);
  const prior = initial.replace("순서 A", "직전 실패 순서");
  const failures = "- [blocking] 관측 결과가 누락됨\nfail";
  const passing = "관측 결과가 확인됐다.\npass";
  const rows = [
    { record: "review-records/R1.json", snapshot: prior, text: failures, verdict: "fail", rereview_of: null },
    { record: "review-records/R2.json", snapshot: initial, text: passing, verdict: "pass", rereview_of: "review-records/R1.json" },
  ];
  for (const [i, { record, snapshot, text, verdict, rereview_of }] of rows.entries()) {
    const hash = reviewHash(snapshot);
    const common = { target: "TASK.md", hash, kind: "task", verdict, rereview_of };
    writeFileSync(join(h.directory, record), JSON.stringify({ verifier: "claude", cross: true,
      result: { text, provider: { value: "anthropic" } }, review: { ...common, snapshot } }));
    writeFileSync(ledgerPath(h.target), JSON.stringify({ ...common, type: "review", at: `2026-11-26T00:00:0${i}Z`,
      verifier: "claude", provider: "anthropic", record, result_hash: textHash(text) }) + "\n", { flag: "a" });
  }
  writeFileSync(h.prePath, JSON.stringify({ version: 1, author: "openai", attempts: rows.map((row, index) => ({
    hash: reviewHash(row.snapshot), provider: "anthropic", cross: true, status: row.verdict, blocking: index === 0 ? 1 : 0,
    evidence: row.record, continuity: index === 0 ? "new" : "changed", ...(index ? { reason: "직전 원장 기준점" } : {}),
  })) }));
  assert.deepEqual(reviewIssues(h.directory, initial), []);
  const generated = h.pre();
  assert.equal(generated.status, 0, generated.output);
  assert.equal(generated.body.pre_review_ok, true);
  assert.deepEqual(reviewIssues(h.directory, initial), []);
  assert.equal(JSON.parse(readFileSync(h.prePath, "utf8")).attempts[1].continuity, "changed");
});

test("T06 공동 복구 허가는 기존 verify에만 적용하고 외부 일반 고정은 거부한다", async () => {
  const h = fixture();
  assert.equal((await h.verify(raw([blocking]))).body.review.verdict, "fail");
  h.edit("두 번째 계획");
  assert.equal((await h.verify(raw([blocking]))).body.review.verdict, "fail");
  h.edit("공동 복구 계획");
  const proof = join(h.evidence, "joint.md");
  writeFileSync(proof, "합성 공동 복구와 확인할 조건");
  const joint = h.note(["--joint", "--choice", "수정 확인", "--file", proof]);
  assert.equal(joint.status, 0, joint.output);
  const before = readFileSync(ledgerPath(h.target), "utf8");
  assert.equal(h.hand().status, 16);
  assert.equal(readFileSync(ledgerPath(h.target), "utf8"), before);
  const native = await h.verify(raw());
  assert.equal(native.executed, 1);
  assert.equal(native.body.review.verdict, "pass", JSON.stringify(native.body));
  assert.equal(native.body.followup.type, "joint");
});

test("T06 기존 고정 뒤 상위 조치가 열리면 일반 고정과 판정 제출을 함께 멈춘다", async () => {
  const h = fixture();
  assert.equal((await h.verify(raw([blocking]))).body.review.verdict, "fail");
  const proof = join(h.evidence, "diagnosis.md");
  writeFileSync(proof, "구조 원인을 분리해 합의 범위에서 보완한다.");
  const diagnosis = h.note(["--diagnosis", "--layer", "structure", "--file", proof]);
  assert.equal(diagnosis.status, 0, diagnosis.output);
  h.edit("진단 뒤 계획");
  const fixed = h.hand();
  assert.equal(fixed.status, 0, fixed.output);
  h.setReply(fixed.body.snapshot, raw());
  const failed = await h.verify(raw([{ ...blocking, category: "defect", location: "src/main.ts:1" }]), h.other);
  assert.equal(failed.body.escalation.stage, "upper_review", JSON.stringify(failed.body));
  const before = readFileSync(ledgerPath(h.target), "utf8");
  const newHand = h.hand(), lateRecord = h.record(fixed.body.hand);
  assert.deepEqual([newHand.status, lateRecord.status, newHand.body.reason, lateRecord.body.reason],
    [16, 16, "upper_review", "upper_review"]);
  assert.equal(lateRecord.body.budget.rounds, 1);
  assert.equal(readFileSync(ledgerPath(h.target), "utf8"), before);
});

test("T06 구현 후 고정은 TASK 기준 내용의 변경도 판정 때 대조한다", () => {
  for (const changed of [false, true]) {
    const h = fixture();
    const fixed = h.hand(h.other);
    assert.equal(fixed.status, 0, fixed.output);
    h.setReply(fixed.body.snapshot, raw());
    if (changed) writeFileSync(h.target, initial.replace("실제 결과가 보인다", "추가 결과까지 관측한다"));
    const done = h.record(fixed.body.hand, [], h.other);
    assert.equal(done.status, 0, done.output);
    assert.equal(done.body.review.verdict, changed ? "unknown" : "pass");
    assert.equal(done.body.budget.rounds, changed ? 0 : 1);
    assert.equal(done.body.review.stale, changed ? true : undefined);
  }
});

test("T06 기존 고정 뒤 A-3 회신이 열리면 제출을 멈추고 승인 회차는 기존 verify에서 실행한다", async () => {
  const h = fixture();
  const failed = await h.verify(raw([blocking]));
  assert.equal(failed.body.review.verdict, "fail");
  h.edit("결정 검토 계획");
  const fixed = h.hand();
  assert.equal(fixed.status, 0, fixed.output);
  h.setReply(fixed.body.snapshot, raw());
  const proposal = join(h.evidence, "proposal.json");
  const choice = "기존 범위에서 다시 확인";
  writeFileSync(proposal, JSON.stringify({ choices: [choice, "보류"], assessments: [
    { finding: effectiveBlocking(failed.body.assessment)[0], decision: "A-3", reason: "합성 잔여 위험" },
  ] }));
  const requested = h.note(["--request-waiver", "weaken", "--choice", choice, "--file", proposal]);
  assert.equal(requested.status, 0, requested.output);
  const original = readFileSync(ledgerPath(h.target), "utf8");
  const paused = h.record(fixed.body.hand);
  assert.equal(paused.status, 16, paused.output);
  assert.equal(paused.body.reason, "owner_decision_required");
  assert.equal(readFileSync(ledgerPath(h.target), "utf8"), original);

  const receipt = join(h.evidence, "approved.md");
  writeFileSync(receipt, "합성 owner 결정 · 현재 계획의 필요한 재검증 1회");
  const decided = h.note(["--decision", "--by", "user", "--resume", "--choice", choice, "--file", receipt]);
  assert.equal(decided.status, 0, decided.output);
  assert.equal(h.hand().status, 16);
  const native = await h.verify(raw());
  assert.equal(native.executed, 1);
  assert.equal(native.body.review.verdict, "pass", JSON.stringify(native.body));
  assert.equal(native.body.followup.type, "owner");
});

test("T07 S-5: 외부 판정과 다른 호출을 연결하지 않고 부분 실패 뒤 같은 판정을 연결한다", () => {
  const h = fixture();
  const directory = "projects/P013_fixture";
  const project = join(h.root, directory), target = { root: h.root, directory, task: "T06" };
  writeFileSync(join(project, "PROJECT.md"), "# P013 fixture\n");
  const first = h.hand();
  assert.equal(first.status, 0, first.output);
  const competing = h.hand();
  assert.equal(competing.status, 0, competing.output);
  assert.equal(readAgentCalls(target), null, "발급은 새 에이전트 실행이 아니다");
  h.setReply(first.body.snapshot, raw());
  const u = unknownCallValue;
  const actual: AgentCall = {
    version: 1, id: "a".repeat(32), at: new Date().toISOString(), task: target.task, agent: "claude", engine: "claude", route: "native",
    status: "completed", reason: null, replacement_reason: null, ref: null, model: { requested: u, actual: u }, effort: { requested: u, actual: u },
    duration_ms: { value: 79, source: "host" }, tokens: { input: u, output: u, total: { value: 204, source: "host" } },
  };
  for (const [changes, idPart] of [
    [{ task: "T05" }, "b"], [{ agent: "pace-irrelevant" }, "c"], [{ engine: "codex" }, "d"],
    [{ at: "2020-01-01T00:00:00.000Z" }, "e"], [{ at: "2090-01-01T00:00:00.000Z" }, "f"],
  ] as const) {
    const value = { ...actual, ...changes, id: idPart.repeat(32) };
    recordAgentCall({ ...target, task: value.task }, value);
    assert.equal(h.record(first.body.hand, ["--call-id", value.id]).status, 2);
  }
  assert.equal(h.record(first.body.hand, ["--call-id", "0".repeat(32)]).status, 2);
  assert.equal(readLedger(h.target).filter((e) => e.type === "review").length, 0);
  recordAgentCall(target, actual);
  const count = readAgentCalls(target)!.length;
  const lock = join(project, "calls", ".write.local.json");
  let output = "";
  const partial = reviewArtifactCommand("review-record", ["--target", h.target, "--hand", first.body.hand, "--provider", "anthropic",
    "--reviewer", "claude", "--result-file", h.submitted, "--call-id", actual.id], {
    write: (line) => { output += line; },
    writeCall(target, value) {
      writeFileSync(lock, `pace-agent-calls-v1 ${process.pid}\n`);
      try { return tryRecordCall(target, value); } finally { unlinkSync(lock); }
    },
  });
  assert.equal(partial, 0, output);
  assert.equal(JSON.parse(output).agent_call_linked, false);
  assert.equal(readAgentCalls(target)!.find((e) => e.id === actual.id)?.ref, null);
  const originalLedger = readFileSync(ledgerPath(h.target), "utf8");
  assert.equal(readLedger(h.target).filter((e) => e.type === "review").length, 1);
  assert.equal(readLedger(h.target).filter((e) => e.type === "call").length, 2);
  const otherHand = h.record(competing.body.hand, ["--call-id", actual.id]);
  assert.equal(otherHand.status, 2);
  assert.match(otherHand.body.error.message, /호출에 외부 검토를 예약할 수 없다/);
  assert.equal(h.record(first.body.hand, ["--call-id", "b".repeat(32)]).status, 2);
  const retry = h.record(first.body.hand, ["--call-id", actual.id]);
  assert.equal(retry.status, 0, retry.output);
  assert.equal(retry.body.agent_call_retry, true);
  assert.equal(retry.body.agent_call_linked, true);
  assert.equal(h.record(first.body.hand, ["--call-id", actual.id]).status, 0);
  assert.equal(readFileSync(ledgerPath(h.target), "utf8"), originalLedger);
  const row = readAgentCalls(target)!.find((e) => e.id === actual.id)!;
  assert.equal(readAgentCalls(target)!.length, count);
  assert.deepEqual(row.duration_ms, actual.duration_ms);
  assert.deepEqual(row.tokens, actual.tokens);
  assert.equal(row.ref, "tasks/T06_fixture/review-records/R1.json");
  assert.deepEqual(retry.body.review.usage, { input_tokens: null, output_tokens: null });
  assert.equal(retry.body.review.duration_ms, undefined);
  const second = h.hand();
  assert.equal(second.status, 0);
  const failed = { ...actual, id: "1".repeat(32), status: "failed", reason: "agent_failed", at: new Date().toISOString(), ref: null };
  recordAgentCall(target, failed);
  assert.equal(readAgentCalls(target)!.find((e) => e.id === failed.id)?.ref, null);
  assert.equal(readLedger(h.target).filter((e) => e.type === "review").length, 1);
});

test("T07 S-5: 백로그 원장은 외부 시도 한 개와 해당 판정 ref를 보존한다", () => {
  const h = fixture(), directory = "backlogs/BL260101_01_fixture", root = join(h.root, directory);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "BACKLOG.md"), "# Backlog\n");
  const brief = join(root, "BR01_fixture.md");
  writeFileSync(brief, "# BR01 fixture\n");
  const first = h.hand(brief);
  assert.equal(first.status, 0, first.output);
  const target = { root: h.root, directory, task: null };
  assert.equal(readAgentCalls(target), null);
  h.setReply(first.body.snapshot, raw());
  const u = unknownCallValue;
  const id = "2".repeat(32);
  recordAgentCall(target, {
    version: 1, id, at: new Date().toISOString(), task: null, agent: "claude", engine: "claude", route: "manual",
    status: "completed", reason: null, replacement_reason: null, ref: null, model: { requested: u, actual: u }, effort: { requested: u, actual: u },
    duration_ms: u, tokens: { input: u, output: u, total: u },
  });
  const verified = h.record(first.body.hand, ["--call-id", id], brief);
  assert.equal(verified.status, 0, verified.output);
  assert.equal(verified.body.agent_call_linked, true);
  assert.equal(readAgentCalls(target)?.length, 1);
  assert.equal(readAgentCalls(target)?.[0]?.ref, "review-records/R1.json");
});
