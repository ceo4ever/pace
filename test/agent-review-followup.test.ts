import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { decideReviewAdmission, type AdmissionState } from "../src/agent/review-admission.ts";
import { AgentError, normalizeResult, type Executor } from "../src/agent/contract.ts";
import { reviewNoteCommand, verifyCommand } from "../src/agent/verify-cli.ts";
import { reviewHash } from "../src/project/pre-review.ts";
import { scopedReviewFixture, tempDir } from "./helpers.ts";

function fixture(unit = "task", artifact?: string) {
  const root = join(tempDir("pace-followup-"), unit === "task"
    ? "projects/P013_review/tasks/T02_followup" : "backlogs/BL261126_01_review");
  mkdirSync(join(root, "evidence"), { recursive: true });
  const target = join(root, artifact ?? (unit === "task" ? "change.patch" : "BACKLOG.md"));
  const proof = join(root, "evidence/finding.md");
  const waiver = join(root, "evidence/waiver.json");
  writeFileSync(proof, "독립 tester의 지적, 재현 조건 V1, 실패 재현 원문\nfail\n");
  const prompts: string[] = [];
  let available = true;
  let tick = 0;
  let alternate: Executor | undefined;
  const run = async (verify: boolean, selected: string, args: string[], reply: string, wait?: () => Promise<void>) => {
    const output: string[] = [];
    const executor: Executor = {
      agent: "codex", mode: "p",
      capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
      async run(request) {
        prompts.push(request.prompt);
        await wait?.();
        const text = reply.includes("```pace-review") ? reply : scopedReviewFixture(request.prompt, reply);
        return normalizeResult(request, { text, provider: "openai" }, { durationMs: 1, enforcement: "fake" });
      },
    };
    const deps = { executors: () => [...(available ? [executor] : []), ...(alternate ? [alternate] : [])],
      write: (text: string) => output.push(text), now: () => new Date(Date.UTC(2026, 10, 26) + tick++) };
    const code = verify
      ? await verifyCommand(["--author-agent", "claude", "--target", selected, "--purpose", "목적", ...args], deps)
      : await reviewNoteCommand(["--target", selected, ...args], deps);
    return { code, json: JSON.parse(output.join("")) };
  };
  const verify = (args: string[] = [], reply = "F1 [blocking] 재현\nfail", selected = target, wait?: () => Promise<void>) => run(true, selected, args, reply, wait);
  const note = (args: string[], selected = target, assessments = [{ finding: "F1 [blocking] fixture.ts:1 — 재현", decision: "A-3", reason: "필수 판정 생략을 제안했다" }]) => {
    let file = proof;
    if (args.includes("--request-waiver")) {
      const recommendation = args.includes("--choice") ? args[args.indexOf("--choice") + 1] : "";
      writeFileSync(waiver, JSON.stringify({ choices: [recommendation, "필수 검증 생략안을 검토한다"], assessments }));
      file = waiver;
    }
    return run(false, selected, [...args, "--summary", "기존 지적의 재현과 조치", ...(args.includes("--file") ? [] : ["--file", file])], "");
  };
  const exhaust = async (selected = target) => {
    writeFileSync(selected, "첫 대상\n");
    assert.equal((await verify([], "F1 [blocking] 재현\nfail", selected)).code, 0);
    writeFileSync(selected, "두 번째 대상\n");
    const second = await verify([], "F1 [blocking] 재현\nfail", selected);
    assert.equal(second.code, 0);
    writeFileSync(selected, "최신 수정\n");
    return second.json.review.record as string;
  };
  const noteBare = (args: string[], selected = target) => run(false, selected, [...args, "--summary", "구조 원인"], "");
  return { root, target, prompts, verify, note, noteBare, exhaust,
    setAvailable: (value: boolean) => { available = value; },
    setAlternate: (value: Executor) => { alternate = value; } };
}

test("필수 검증 생략을 선택하면 A-3 요청 전에는 새 호출을 하지 않는다", async () => {
  const h = fixture();
  await h.exhaust();
  assert.equal((await h.note(["--request-waiver", "skip"])).code, 2, "추천이 빠진 초안은 제출할 수 없다");
  assert.equal((await h.note(["--request-waiver", "recheck", "--choice", "독립 재검증"])).code, 2, "재검증 결론은 A-3으로 제출하지 않는다");
  assert.equal((await h.note(["--request-waiver", "skip", "--choice", "보완 검증"], h.target, [
    { finding: "다른 지적", decision: "A-3", reason: "필수 판정을 건너뜀" },
  ])).code, 2, "최신 독립 지적이 빠진 요청은 제출할 수 없다");
  const request = await h.note(["--request-waiver", "skip", "--choice", "현 변경의 독립 재검증을 권장"]);
  assert.equal(request.code, 0);
  assert.equal(request.json.followup.decision, "A-3");
  assert.equal(request.json.followup.action, "owner_decision_required");
  assert.equal(request.json.followup.request.proposed, "skip");
  assert.equal(request.json.followup.finding_assessments[0].decision, "A-3");
  assert.equal(request.json.followup.finding_assessments[0].reason, "필수 판정 생략을 제안했다");
  assert.equal(request.json.ran, false);
  const blocked = await h.verify();
  assert.equal(blocked.code, 16);
  assert.equal(blocked.json.followup.decision, "A-3");
  assert.equal(h.prompts.length, 2);
  assert.equal((await h.note(["--decision", "--by", "pm", "--choice", "검토 생략"])).code, 2);
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "요청에 없는 선택", "--rounds", "1"])).code, 2);
  assert.equal((await h.verify()).json.reason, "owner_decision_required");
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "현 변경의 독립 재검증을 권장", "--rounds", "1"])).code, 0);
  assert.equal((await h.verify([], "pass")).code, 0);
  assert.equal((await h.note(["--joint", "--choice", "통과 뒤 공동 검토"])).code, 2);
  assert.equal((await h.verify()).code, 16);
  assert.equal(h.prompts.length, 3);
});

test("owner가 생략을 허용하거나 보류한 기록은 명시된 재개 없이 새 검토를 열지 않는다", async () => {
  const h = fixture();
  await h.exhaust();
  assert.equal((await h.note(["--request-waiver", "weaken", "--choice", "근거 보완"])).code, 0);
  const answer = await h.note(["--decision", "--by", "user", "--choice", "필수 검증 생략안을 검토한다"]);
  assert.equal(answer.json.entry.rounds, 0);
  assert.equal((await h.verify()).code, 16);
  assert.equal(h.prompts.length, 2);
});

test("무효 시도만으로 일반 호출 상한을 쓰면 판정 없음의 근거를 저장하고 첫 전체 복구만 연다", async () => {
  const h = fixture();
  for (let n = 1; n <= 4; n++) {
    writeFileSync(h.target, `수정 ${n}\n`);
    const result = await h.verify();
    assert.equal(result.code, 0);
    assert.equal((await h.note(["--void", "--record", result.json.review.record])).code, 0);
  }
  const blocked = await h.verify();
  assert.equal(blocked.code, 16);
  assert.equal(blocked.json.followup.verdict_summary, "유효 판정 없음(중단·무효 4회)");
  assert.equal(blocked.json.followup.voids.length, 4);
  assert.equal(blocked.json.followup.review_history.filter((row: { invalidated: unknown }) => row.invalidated).length, 4);
  assert.deepEqual(blocked.json.followup.finding_assessments, []);
  assert.equal(blocked.json.followup.decision, null);
  assert.equal((await h.note(["--joint", "--choice", "무효 원인을 해결해 첫 판정을 복구"])).code, 0);
  assert.equal(h.prompts.length, 4);
});

test("이미 일반 판정이 통과한 단계는 공동 재검증을 열 수 없다", async () => {
  const h = fixture();
  writeFileSync(h.target, "검토 대상\n");
  assert.equal((await h.verify([], "pass")).code, 0);
  writeFileSync(h.target, "범위 재검토\n");
  assert.equal((await h.verify([], "pass")).code, 0);
  assert.equal((await h.note(["--joint", "--choice", "남은 회차 사용"])).code, 2);
  assert.equal((await h.verify([], "never")).code, 16);
  assert.equal(h.prompts.length, 2);
});

test("소진 보고의 응답과 파일에 그 단계 원장의 진단과 공동 조치를 함께 담는다", async () => {
  const h = fixture("backlog");
  await h.exhaust();
  assert.equal((await h.note(["--joint", "--choice", "첫 원인 확인"])).code, 0);
  assert.equal((await h.verify()).code, 0);
  const diagnosed = await h.note(["--diagnosis", "--layer", "design"]);
  assert.equal(diagnosed.code, 0);
  writeFileSync(h.target, "설계 조치 적용\n");
  assert.equal((await h.note(["--joint", "--choice", "설계 조치 적용"])).code, 0);
  assert.equal((await h.verify()).code, 0);
  const blocked = await h.verify();
  assert.equal(blocked.code, 16);
  assert.deepEqual(blocked.json.followup.diagnoses, [{ ...diagnosed.json.entry, from: "REVIEW-LOG.jsonl" }]);
  assert.deepEqual(blocked.json.followup.joint_decisions.map((row: { choice: string }) => row.choice), ["첫 원인 확인", "설계 조치 적용"]);
  const report = JSON.parse(readFileSync(join(h.root, blocked.json.followup.report), "utf8"));
  assert.deepEqual(report.diagnoses, blocked.json.followup.diagnoses);
});

test("일반 공동 시도는 적용 기록만으로 소모되지 않고 단위별 실제 재검증 두 회에서 멈춘다", async () => {
  for (const unit of ["task", "backlog"]) {
    const h = fixture(unit);
    const first = unit === "task" ? join(h.root, "TASK.md") : h.target;
    const second = unit === "task" ? h.target : join(h.root, "BR01_example.md");
    await h.exhaust(first);
    if (unit === "task") await h.exhaust(second);
    else writeFileSync(second, "두 번째 대상의 수정\n");
    assert.equal((await h.note(["--joint", "--choice", "적용한 조치"], first)).code, 0);
    assert.equal((await h.note(["--joint", "--choice", "더 정확한 적용 기록"], first)).code, 0);
    assert.equal((await h.verify([], "F1 [blocking] 재현\nfail", first)).code, 0);
    assert.equal((await h.note(["--joint", "--choice", "두 번째 조치"], second)).code, 0);
    assert.equal((await h.verify([], "F1 [blocking] 재현\nfail", second)).code, 0);
    assert.equal((await h.note(["--joint", "--choice", "세 번째 조치"], second)).code, 2);
    const blocked = await h.verify([], "never", second);
    assert.equal(blocked.code, 16);
    assert.equal(blocked.json.followup.joint_attempts, 2);
    assert.equal(blocked.json.followup.decision, null);
    assert.equal(blocked.json.followup.action, "confirm_findings");
    assert.equal(JSON.parse(readFileSync(join(h.root, blocked.json.followup.report), "utf8")).action, "confirm_findings");
  }
});

test("유효 판정 없이 일반 호출을 다 쓰면 첫 전체 복구를 공동 시도로 센다", async () => {
  const h = fixture();
  writeFileSync(h.target, "대상\n");
  h.setAvailable(false);
  for (let n = 0; n < 4; n++) assert.equal((await h.verify()).code, 10);
  h.setAvailable(true);
  assert.equal((await h.verify()).code, 16);
  assert.equal((await h.note(["--joint", "--choice", "실행기 오류를 복구했다"])).code, 0);
  const restored = await h.verify([], "fail");
  assert.equal(restored.code, 0);
  assert.equal(restored.json.followup.type, "joint");
  assert.equal(restored.json.review.rereview_of, null);
  assert.equal(restored.json.budget.calls, 4);
  assert.equal(restored.json.budget.rounds, 0);
  const blocked = await h.verify();
  assert.equal(blocked.code, 16);
  assert.equal(blocked.json.followup.joint_attempts, 1);
  assert.equal((await h.note(["--joint", "--choice", "첫 판정 이후 일반 호출 추가"])).code, 2);
  assert.equal(h.prompts.length, 1);
});

test("두 일반 한도가 함께 차도 공동 예산으로 검토한다", async () => {
  const h = fixture();
  writeFileSync(h.target, "첫 변경\n");
  assert.equal((await h.verify()).code, 0);
  writeFileSync(h.target, "두 번째 변경\n");
  h.setAvailable(false);
  assert.equal((await h.verify()).code, 10);
  assert.equal((await h.verify()).code, 10);
  h.setAvailable(true);
  assert.equal((await h.verify()).code, 0);
  writeFileSync(h.target, "공동으로 적용한 변경\n");
  assert.equal((await h.note(["--joint", "--choice", "검토 지적을 함께 해결"])).code, 0);
  const result = await h.verify([], "pass");
  assert.equal(result.code, 0);
  assert.equal(result.json.budget.calls, 4);
  assert.equal(result.json.followup.type, "joint");
});

test("소진 보고의 판정 이력은 두 원장을 실제 시각순으로 합친다", async () => {
  const h = fixture();
  const earlier = join(h.root, "evidence", "earlier.md");
  writeFileSync(earlier, "이전 검토\n");
  assert.equal((await h.verify([], "pass", earlier)).code, 0);
  writeFileSync(h.target, "다음 검토\n");
  assert.equal((await h.verify()).code, 0);
  const report = (await h.verify()).json.followup;
  assert.deepEqual(report.review_history.map((row: { verdict: string }) => row.verdict), ["pass", "fail"]);
  assert.ok(report.review_history[0].at < report.review_history[1].at);
});

test("공동 시도의 B1은 교차 시간 초과 사유를 시도와 원장에 남긴다", async () => {
  const h = fixture();
  await h.exhaust();
  assert.equal((await h.note(["--joint", "--choice", "결함을 수정했다"])).code, 0);
  h.setAlternate({
    agent: "claude", mode: "p",
    capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
    async run(request) {
      return normalizeResult(request, { text: scopedReviewFixture(request.prompt, "pass"), provider: "anthropic" }, { durationMs: 1, enforcement: "fake" });
    },
  });
  h.setAvailable(false);
  assert.equal((await h.verify()).code, 10);
  h.setAvailable(true);
  const result = await h.verify(["--allow-same-provider"], "", h.target, async () => {
    throw new AgentError("timeout", "교차 검토 제한 초과");
  });
  assert.equal(result.code, 0);
  assert.equal(result.json.cross, false);
  const reasons = result.json.cross_unavailable;
  assert.match(reasons[0], /codex: timeout/);
  const record = JSON.parse(readFileSync(join(h.root, result.json.review.record), "utf8"));
  const last = JSON.parse(readFileSync(join(h.root, "REVIEW-LOG.jsonl"), "utf8").trim().split("\n").at(-1)!);
  const exhausted = (await h.verify()).json.followup;
  for (const value of [record, last, result.json.followup, exhausted.review_history.at(-1)]) {
    assert.deepEqual(value.cross_unavailable, reasons);
    assert.equal(value.cross, false);
  }
  assert.equal(exhausted.joint_attempts, 1);
});

const initial: AdmissionState = {
  budget: { rounds: 0, exhausted: null }, pending: false, latestVerdict: null,
  jointAttempts: 0, jointRecorded: false, ownerRounds: null,
};
const exhausted = { budget: { rounds: 2, exhausted: "rounds" }, latestVerdict: "fail" } as const;
const cases: [string, Partial<AdmissionState>, ReturnType<typeof decideReviewAdmission>][] = [
  ["예산 여유", {}, { kind: "ordinary", canJoint: false }],
  ["소진, 미통과, 허브 기록", { ...exhausted, jointRecorded: true }, { kind: "joint", canJoint: true, firstReview: false }],
  ["허브 기록 없음", exhausted, { kind: "exhausted", canJoint: true }],
  ["공동 소진, 수정 확인은 후속 태스크 범위", { ...exhausted, jointAttempts: 2 }, { kind: "exhausted", canJoint: false }],
  ["일반 호출 상한과 유효 판정 없음", { budget: { rounds: 0, exhausted: "calls" }, jointRecorded: true }, { kind: "joint", canJoint: true, firstReview: true }],
  ["두 일반 상한을 함께 소진", { ...exhausted, budget: { rounds: 2, exhausted: "calls" }, jointRecorded: true }, { kind: "joint", canJoint: true, firstReview: false }],
  ["생략·완화 요청 대기", { pending: true, ownerRounds: 1 }, { kind: "owner_pending", canJoint: false }],
  ["owner 승인 회차", { ...exhausted, ownerRounds: 1 }, { kind: "owner", canJoint: false }],
  ["같은 대상의 승인 회차 소진", { ownerRounds: 0 }, { kind: "exhausted", canJoint: false }],
  ["모든 검토 종류의 통과", { ...exhausted, latestVerdict: "pass", jointRecorded: true }, { kind: "exhausted", canJoint: false }],
];
for (const [name, state, expected] of cases) {
  test(`T02a 다음 검토 판정표 — ${name}`, () => {
    assert.deepEqual(decideReviewAdmission({ ...initial, ...state }), expected);
  });
}

function stageFailure(category: string, ...findings: [string, string][]) {
  return ["```pace-review", JSON.stringify({
    version: 1, findings: findings.map(([id, location]) => ({ id, location, category, severity: "blocking", scenario: "재현",
      reproduction: "수정 전 입력을 다시 실행한다", confidence: "high" })),
  }), "```", "fail"].join("\n");
}

async function recoveryFixture(unit = "task", useCallCap = false, finalReply?: string) {
  const h = fixture(unit, unit === "backlog" ? "BR01_example.md" : undefined);
  const contract = join(h.root, unit === "task" ? "TASK.md" : "BACKLOG.md");
  writeFileSync(contract, "합의한 계약과 검증 기준\n");
  writeFileSync(h.target, "수정 전\n");
  if (useCallCap) {
    h.setAvailable(false);
    assert.equal((await h.verify()).code, 10);
    assert.equal((await h.verify()).code, 10);
    h.setAvailable(true);
  }
  await h.exhaust();
  for (const n of [1, 2]) {
    writeFileSync(h.target, `공동 확인 ${n}\n`);
    assert.equal((await h.note(["--joint", "--choice", "독립 지적 보완"])).code, 0);
    assert.equal((await h.verify([], n === 2 ? finalReply : undefined)).code, 0);
  }
  const focus = (id = "F1", location = "fixture.ts:1", impact = "fixture.ts의 저장과 재입력 범위") =>
    h.note(["--confirm", id, "--location", location, "--impact", impact]);
  const proof = (name: string, fields: object) => {
    const path = join(h.root, "evidence", name);
    writeFileSync(path, JSON.stringify(fields));
    return path;
  };
  const recordRoot = (trigger: string, slot: 1 | 2, changes: Record<string, unknown> = {}) => h.note([
    "--upper-review", "--file", proof(`root-${slot}.json`, {
      trigger, slot, reviewer: "independent-reviewer", author: "author", worker: "worker",
      target: relative(h.root, h.target), hash: reviewHash(readFileSync(h.target, "utf8")),
      provider: "openai", context: `independent-context-${slot}`, cross: true, analysis: "원인과 대안 및 포착 범위를 관측했다",
      ...(slot === 2 ? { contract: "태스크의 판정 기준을 대조했다", backlog: "백로그 목적과 인수 기준을 대조했다" } : {}),
      ...changes,
    }),
  ]);
  const recordFix = (upper: string, changes: Record<string, unknown> = {}) => h.note(["--upper-check", "--impact", "fixture.ts 저장과 재입력",
    "--file", proof("root-fix.json", { upper, agreement: "confirmed", verification: "required", change: "저장 기준과 원인 조치", ...changes })]);
  return { ...h, contract, focus, proof, recordRoot, recordFix };
}

async function failThroughDiagnosis(h: Awaited<ReturnType<typeof recoveryFixture>>, diagnosedReply?: string) {
  writeFileSync(h.target, "첫 지적 수정\n");
  const focus = await h.focus();
  assert.equal(focus.code, 0, JSON.stringify(focus.json));
  assert.equal((await h.verify()).json.followup.type, "confirmation");
  writeFileSync(h.target, "구조 원인 수정\n");
  assert.equal((await h.focus()).code, 2);
  assert.match((await h.verify()).json.followup.action, /^diagnose$/);
  const diagnosed = await h.note(["--diagnosis", "--layer", "structure"]);
  assert.equal(diagnosed.code, 0);
  assert.equal(diagnosed.json.entry.type, "diagnosis");
  assert.equal((await h.focus()).json.entry.diagnosed, true);
  const failed = await h.verify([], diagnosedReply);
  assert.equal(failed.json.escalation.stage, "upper_review");
  assert.equal(failed.json.followup.type, "confirmation");
  return (await h.verify()).json.followup;
}

test("T09는 일반·공동 소진 뒤 지적과 수정 영향을 확인하고 미실행은 같은 확인에서 복구한다", async () => {
  const h = await recoveryFixture("task", true);
  writeFileSync(h.target, "diff --git a/fixture.ts b/fixture.ts\n--- a/fixture.ts\n+++ b/fixture.ts\ndiff --git a/save.ts b/save.ts\n--- a/save.ts\n+++ b/save.ts\n");
  assert.equal((await h.focus("F2")).code, 2);
  assert.equal((await h.focus("F1", "fixture.ts:2")).code, 2);
  assert.equal((await h.focus()).code, 2);
  const grant = await h.focus("F1", "fixture.ts:1", "fixture.ts save.ts의 데이터 저장과 재입력을 확인한다");
  assert.equal(grant.code, 0);
  h.setAvailable(false);
  assert.equal((await h.verify()).code, 10);
  h.setAvailable(true);
  const checked = await h.verify();
  assert.equal(checked.code, 0);
  assert.equal(checked.json.followup.id, grant.json.entry.id);
  assert.match(h.prompts.at(-1)!, /F1의 원래 위치 fixture\.ts:1.*수정 영향.*save\.ts/);
  assert.deepEqual([checked.json.budget.calls, checked.json.budget.rounds], [4, 2]);
  const held = await h.verify();
  assert.equal(held.json.followup.confirmation_count, 1);
  assert.equal(held.json.followup.diagnostic_confirmation_count, 0);
  assert.equal(held.json.followup.action, "diagnose");
});

test("T09 수정 확인은 태스크의 사전·사후가 두 회를 나눠 쓴다", async () => {
  const h = await recoveryFixture("task", false, stageFailure("defect", ["F2", "save.ts:2"], ["F3", "load.ts:3"]));
  await h.exhaust(h.contract);
  writeFileSync(h.contract, "사전 지적 변경\n");
  const first = await h.note(["--confirm", "F1", "--location", "fixture.ts:1", "--impact", "사전 기준"], h.contract);
  assert.equal(first.code, 0);
  assert.equal((await h.verify([], "pass", h.contract)).code, 0);
  writeFileSync(h.target, "사후의 두 번째 지적을 수정\n");
  assert.equal((await h.focus("F2", "save.ts:2", "save.ts의 저장 경로")).code, 0);
  assert.equal((await h.verify([], "pass")).code, 0);
  writeFileSync(h.target, "사후의 세 번째 지적을 수정\n");
  const held = await h.verify();
  assert.equal(held.json.followup.confirmation_count, 2);
  assert.equal(held.json.followup.action, "diagnose");
  assert.deepEqual(held.json.followup.confirmation_findings, [{ id: "F3", location: "load.ts:3" }]);
  assert.equal((await h.focus("F3", "load.ts:3", "load.ts의 재입력 경로")).code, 2);
  assert.equal((await h.note(["--diagnosis", "--layer", "design"])).code, 0);
  assert.equal((await h.focus("F3", "load.ts:3", "load.ts의 재입력 경로")).json.entry.diagnosed, true);
});

test("T09는 양쪽 상한을 다 쓴 뒤 진단 재실패로 단위를 상위 검토까지 보류한다", async () => {
  const h = await recoveryFixture("task", true);
  const report = await failThroughDiagnosis(h);
  assert.equal(report.action, "upper_review");
  assert.deepEqual([report.joint_attempts, report.confirmation_count, report.diagnostic_confirmation_count], [2, 1, 1]);
  assert.equal((await h.verify([], "never", h.contract)).json.escalation.stage, "upper_review");
  assert.equal((await h.note(["--joint", "--choice", "다시 검토"], h.contract)).code, 2);
  assert.equal((await h.note(["--void", "--record", report.upper.source])).code, 2);
  assert.equal((await h.recordFix("unknown")).code, 2);
  assert.equal((await h.recordRoot(report.upper.trigger, 1, { reviewer: "worker" })).code, 2);
  assert.equal((await h.recordRoot(report.upper.trigger, 1, { cross: false })).code, 2);
  const root = await h.recordRoot(report.upper.trigger, 1);
  assert.equal(root.code, 0);
  writeFileSync(h.target, "상위에서 확인한 변경\n");
  assert.equal((await h.recordFix(root.json.entry.id, { agreement: "uncertain" })).code, 2);
  assert.equal((await h.recordFix(root.json.entry.id, { verification: "weaken" })).code, 2);
  assert.equal((await h.recordFix(root.json.entry.id)).code, 0);
  const result = await h.verify([], "pass");
  assert.equal(result.code, 0);
  assert.equal(result.json.followup.type, "upper");
  assert.equal(result.json.review.verdict, "pass");
  assert.deepEqual([result.json.budget.calls, result.json.budget.rounds], [4, 2]);
  assert.match(h.prompts.at(-1)!, /상위 근본 검토 해결안의 한정 재검증/);
  assert.equal((await h.verify()).code, 16);
});

test("T09는 별도 2차 상위 근거와 한 번의 확인 뒤 A-1로 종료한다", async () => {
  const h = await recoveryFixture("backlog", true);
  const report = await failThroughDiagnosis(h);
  const first = await h.recordRoot(report.upper.trigger, 1, { root_cause: "입력 누락을 검출하지 못했다" });
  assert.equal(first.code, 0);
  writeFileSync(h.target, "첫 상위 해결안 반영\n");
  assert.equal((await h.recordFix(first.json.entry.id, { change: "누락 입력을 관측했다" })).code, 0);
  assert.equal((await h.verify()).json.escalation.stage, "upper_review");
  assert.equal((await h.recordRoot(report.upper.trigger, 2, { context: "independent-context-1" })).code, 2);
  assert.equal((await h.recordRoot(report.upper.trigger, 2, { backlog: null })).code, 2);
  const second = await h.recordRoot(report.upper.trigger, 2, { root_cause: "합의에 반환 기준이 없다" });
  assert.equal(second.code, 0);
  writeFileSync(h.target, "두 번째 상위 해결안 반영\n");
  assert.equal((await h.recordFix(second.json.entry.id, { change: "현재 계약의 저장 경로를 검증했다",
    recommendation: { choice: "기준 조정", reason: "예외 입력에서 반환 조건의 합의가 필요하다" },
  })).code, 0);
  const failed = await h.verify([], stageFailure("completion", ["F4", "BACKLOG.md:19"]));
  assert.equal(failed.json.escalation.stage, "agreement_required");
  const next = await h.verify();
  assert.equal(next.code, 16);
  assert.equal(next.json.followup.decision, "A-1");
  assert.deepEqual(next.json.followup.choices, ["기준 조정", "보류", "한 번 더"]);
  assert.equal(next.json.followup.upper_reviews.length, 2);
  assert.equal(next.json.followup.confirmation_count, 1);
  assert.deepEqual([next.json.budget.calls, next.json.budget.rounds], [4, 2]);
  const { endpoint } = next.json.followup;
  assert.deepEqual([endpoint.unit.type, endpoint.target, endpoint.stage], ["backlog", "BR01_example.md", "backlog"]);
  assert.deepEqual([endpoint.timeline.ordinary_calls.length, endpoint.timeline.ordinary.length,
    endpoint.timeline.joint.length, endpoint.timeline.confirmation.length], [4, 2, 2, 2]);
  assert.deepEqual(endpoint.timeline.confirmation.map((round: { diagnosed: boolean }) => round.diagnosed), [false, true]);
  assert.deepEqual(endpoint.timeline.upper.map((round: { root_cause: string; applied_solution: string }) =>
    [round.root_cause, round.applied_solution]), [["입력 누락을 검출하지 못했다", "누락 입력을 관측했다"],
    ["합의에 반환 기준이 없다", "현재 계약의 저장 경로를 검증했다"]]);
  assert.equal(endpoint.remaining_failure.findings[0].location, "BACKLOG.md:19");
  assert.equal(endpoint.remaining_failure.findings[0].reproduction, "수정 전 입력을 다시 실행한다");
  assert.deepEqual(endpoint.recommendation, { choice: "기준 조정", reason: "예외 입력에서 반환 조건의 합의가 필요하다", source: "hub" });
  assert.deepEqual(JSON.parse(readFileSync(join(h.root, next.json.followup.report), "utf8")).endpoint, endpoint);
  const another = join(h.root, "BR02_other.md");
  writeFileSync(another, "다른 대상\n");
  const held = await h.verify([], "never", another);
  assert.equal(held.code, 16);
  assert.deepEqual(held.json.followup.endpoint, endpoint);
});

test("T09는 실제 계약 변경과 일치하는 A-1 근거가 있을 때 해당 단계의 일반 예산만 다시 센다", async () => {
  const h = await recoveryFixture("task", true);
  await h.exhaust(h.contract);
  const report = await failThroughDiagnosis(h);
  const root = await h.recordRoot(report.upper.trigger, 1);
  assert.equal(root.code, 0);
  writeFileSync(h.contract, "승인 대상으로 제시한 새 계약\n");
  writeFileSync(h.target, "새 계약을 반영한 변경\n");
  const denied = await h.recordFix(root.json.entry.id);
  assert.equal(denied.code, 2);
  assert.match(denied.json.error.message, /A-1/);
  assert.equal((await h.verify()).code, 16);
  const nextHash = reviewHash(readFileSync(h.contract, "utf8"));
  const agreement = (contract: string) => h.note(["--contract-change", "--file", h.proof("owner-agreement.json", {
    by: "user", decision: "A-1", previous: report.upper.contract, contract, receipt: "합의 변경 원문의 영수증",
  })]);
  assert.equal((await agreement(report.upper.contract)).code, 2);
  const approved = await agreement(nextHash);
  assert.equal(approved.code, 0, JSON.stringify(approved.json));
  assert.equal((await h.recordFix(root.json.entry.id)).code, 0);
  const checked = await h.verify([], "pass");
  assert.equal(checked.code, 0);
  assert.equal(checked.json.followup.type, "upper");
  assert.deepEqual([checked.json.budget.calls, checked.json.budget.rounds], [0, 0]);
  const pre = await h.verify([], "never", h.contract);
  assert.equal(pre.code, 16);
  assert.equal(pre.json.budget.rounds, 2);
  assert.deepEqual([pre.json.followup.joint_attempts, pre.json.followup.confirmation_count], [2, 1]);
  const ordinary = await h.verify([], "pass");
  assert.equal(ordinary.code, 0);
  assert.equal(ordinary.json.review.rereview_of, null);
  assert.deepEqual([ordinary.json.budget.calls, ordinary.json.budget.rounds], [1, 1]);
});

test("T09는 필수 확인을 복구하고 실제 검증 완화나 잔여 blocking 수용은 A-3 요청으로 분리한다", async () => {
  const h = await recoveryFixture();
  const report = await failThroughDiagnosis(h);
  const root = await h.recordRoot(report.upper.trigger, 1);
  assert.equal(root.code, 0);
  writeFileSync(h.target, "새 해결안을 적용했다\n");
  assert.equal((await h.recordFix(root.json.entry.id, { verification: "accept_blocking" })).code, 2);
  const request = await h.note(["--request-waiver", "weaken", "--choice", "필수 증거 확보"]);
  assert.equal(request.code, 0, JSON.stringify(request.json));
  assert.equal(request.json.followup.decision, "A-3");
  assert.equal((await h.verify()).json.followup.action, "owner_decision_required");
  assert.equal((await h.recordFix(root.json.entry.id)).code, 2);
  assert.equal((await h.note(["--decision", "--by", "user", "--choice", "필수 증거 확보"])).code, 0);
  assert.equal((await h.recordFix(root.json.entry.id)).code, 0);
  const out = await h.verify([], "읽을 수 없는 응답");
  assert.equal(out.json.review.verdict, "unknown");
  assert.equal(out.json.escalation, undefined);
  const checked = await h.verify([], "pass");
  assert.equal(checked.json.review.verdict, "pass");
  assert.equal(checked.json.followup.id, out.json.followup.id);
});

test("T09 한정 확인이 실패해도 판정 범위와 원래 유효 지적 목록을 유지한다", async () => {
  const h = await recoveryFixture("task", false, stageFailure("defect", ["F1", "fixture.ts:1"], ["F2", "save.ts:2"]));
  const original = (await h.verify()).json.followup.confirmation_source;
  writeFileSync(h.target, "첫 지적을 확인할 수정\n");
  assert.equal((await h.focus()).code, 0);
  assert.equal((await h.verify([], stageFailure("defect", ["F1", "fixture.ts:1"]))).code, 0);
  const prompt = h.prompts.at(-1)!;
  assert.match(prompt, /지정한 지적과 적용한 수정의 영향만 판정한다/);
  assert.doesNotMatch(prompt, /판정 범위: 직전 검토의 blocking이 해소/);
  const held = (await h.verify()).json.followup;
  assert.equal(held.confirmation_source, original);
  assert.deepEqual(held.confirmation_findings, [{ id: "F1", location: "fixture.ts:1" }, { id: "F2", location: "save.ts:2" }]);
  writeFileSync(h.target, "두 번째 지적을 확인할 수정\n");
  assert.equal((await h.focus("F2", "save.ts:2", "save.ts의 저장과 재입력")).code, 0);
  assert.equal((await h.verify([], "pass")).code, 0);
  assert.deepEqual((await h.verify()).json.followup.confirmation_findings, [{ id: "F1", location: "fixture.ts:1" }]);
});

test("T09는 기존 합의 안의 계약 문구 변경을 실행·보고하며 일반 예산을 다시 열지 않는다", async () => {
  const h = await recoveryFixture();
  const report = await failThroughDiagnosis(h);
  const root = await h.recordRoot(report.upper.trigger, 1);
  writeFileSync(h.contract, "기존 검증 대상의 표현을 명확히 한 계약\n");
  writeFileSync(h.target, "대조한 문구를 반영한 수정\n");
  const current = reviewHash(readFileSync(h.contract, "utf8"));
  assert.equal((await h.recordFix(root.json.entry.id)).code, 2);
  const fixed = await h.recordFix(root.json.entry.id, {
    agreement: "equivalent", previous: report.upper.contract, contract: current,
    comparison: "기준의 대상·동작·필수 검증을 그대로 두고 대상명만 명확히 했다",
  });
  assert.equal(fixed.code, 0, JSON.stringify(fixed.json));
  assert.equal((await h.verify([], "pass")).json.review.verdict, "pass");
  const next = await h.verify();
  assert.equal(next.code, 16);
  assert.deepEqual([next.json.budget.calls, next.json.budget.rounds, next.json.followup.decision], [2, 2, null]);
});

test("T09는 원래 지적을 모두 확인하면 한정 확인 결과를 단계 pass와 구별해 보고한다", async () => {
  const h = await recoveryFixture();
  writeFileSync(h.target, "결함을 고친 변경\n");
  assert.equal((await h.focus()).code, 0);
  const done = await h.verify([], "pass");
  assert.equal(done.json.followup.next, "confirmed_findings");
  const held = await h.verify();
  assert.equal(held.json.followup.action, "confirmed_findings");
  assert.deepEqual(held.json.followup.confirmation_findings, []);
  assert.equal(held.json.followup.confirmations[0].verdict, "pass");
});

test("T09는 상위 검토 전에 확인된 문구 동등성과 진단 실패의 최신 원문을 잇는다", async () => {
  const h = await recoveryFixture();
  const report = await failThroughDiagnosis(h, stageFailure("defect", ["F9", "diagnosis.ts:9"]));
  writeFileSync(h.contract, "합의한 계약과 검증 기준의 용어 명확화\n");
  const current = reviewHash(readFileSync(h.contract, "utf8"));
  assert.equal((await h.recordRoot(report.upper.trigger, 1)).code, 2);
  const root = await h.recordRoot(report.upper.trigger, 1, {
    agreement: "equivalent", previous: report.upper.contract, contract: current,
    comparison: "검증 대상과 성공·실패 조건을 동일하게 유지했다",
  });
  assert.equal(root.code, 0, JSON.stringify(root.json));
  writeFileSync(h.target, "진단 뒤의 새 결함까지 해결한 변경\n");
  assert.equal((await h.recordFix(root.json.entry.id)).code, 0);
  const checked = await h.verify([], "pass");
  assert.equal(checked.code, 0);
  assert.match(h.prompts.at(-1)!, /F9 \[blocking\] diagnosis\.ts:9/);
  assert.equal(checked.json.review.rereview_of, report.upper.source);
});

test("T09 원장 진단 뒤 재실패는 공동 시도가 남아도 즉시 같은 단위를 상위 검토에 보류한다", async () => {
  const h = fixture();
  const pre = join(h.root, "TASK.md");
  writeFileSync(pre, "합의한 사전 기준\n");
  await h.exhaust();
  const missing = await h.noteBare(["--diagnosis", "--layer", "structure"]);
  assert.equal(missing.code, 2);
  assert.match(missing.json.error.message, /근거/);
  const diagnosis = await h.note(["--diagnosis", "--layer", "structure"]);
  assert.equal(diagnosis.code, 0, JSON.stringify(diagnosis.json));
  assert.match(diagnosis.json.entry.recovery_evidence.source, /review-records\/R\d+\.json/);
  assert.match(diagnosis.json.entry.recovery_evidence.evidence_hash, /^[a-f0-9]{64}$/);
  assert.equal((await h.note(["--joint", "--choice", "원장 진단의 조치 적용"])).code, 0);
  const failed = await h.verify();
  assert.equal(failed.code, 0);
  assert.equal(failed.json.escalation.stage, "upper_review");
  const held = await h.verify();
  assert.equal(held.code, 16);
  assert.equal(held.json.followup.upper.trigger, diagnosis.json.entry.recovery_id);
  assert.equal(held.json.followup.joint_attempts, 1);
  assert.equal(held.json.followup.confirmation_count, 0);
  assert.equal((await h.verify([], "never", pre)).json.escalation.stage, "upper_review");
  assert.equal((await h.note(["--joint", "--choice", "남은 공동 회차"])).code, 2);
  assert.equal(h.prompts.length, 3);
});

test("T09는 같은 단위의 다음 유효 검토를 진단과 연결하고 미확인에는 판정을 보류한다", async () => {
  const h = fixture();
  const pre = join(h.root, "TASK.md");
  writeFileSync(pre, "합의한 사전 기준\n");
  writeFileSync(h.target, "검토 대상\n");
  assert.equal((await h.verify()).code, 0);
  assert.equal((await h.note(["--diagnosis", "--layer", "structure"])).code, 0);
  const unknown = await h.verify([], "판독 불가", pre);
  assert.equal(unknown.json.review.verdict, "unknown");
  assert.equal(unknown.json.escalation, undefined);
  const failed = await h.verify([], "F1 [blocking] 재현\nfail", pre);
  assert.equal(failed.json.escalation.stage, "upper_review");
  assert.equal(failed.json.budget.rounds, 1);
  assert.equal(failed.json.budget.exhausted, null);
  const held = await h.verify();
  assert.equal(held.json.followup.upper.target, "TASK.md");
  assert.equal(held.json.followup.joint_attempts, 0);
});

test("T09는 이른 진단의 원문을 요구하고 첫 독립 통과는 그 진단을 닫는다", async () => {
  const h = fixture("backlog");
  writeFileSync(h.target, "첫 확인 대상\n");
  assert.equal((await h.verify()).code, 0);
  assert.equal((await h.noteBare(["--diagnosis", "--layer", "structure"])).code, 2);
  assert.equal((await h.note(["--diagnosis", "--layer", "structure"])).code, 0);
  writeFileSync(h.target, "진단 반영 대상\n");
  const passed = await h.verify([], "pass");
  assert.equal(passed.json.review.verdict, "pass");
  assert.equal(passed.json.escalation, undefined);
  const held = await h.verify();
  assert.equal(held.json.reason, "budget_exhausted");
  assert.equal(held.json.followup.upper, undefined);
});

test("T09는 같은 단위의 다른 대상이 통과해도 원래 진단의 실패 발동을 유지한다", async () => {
  const h = fixture();
  const pre = join(h.root, "TASK.md");
  writeFileSync(pre, "합의한 태스크 기준\n");
  writeFileSync(h.target, "실패한 변경\n");
  assert.equal((await h.verify()).code, 0);
  assert.equal((await h.note(["--diagnosis", "--layer", "structure"])).code, 0);
  const unrelatedPass = await h.verify([], "pass", pre);
  assert.equal(unrelatedPass.json.review.verdict, "pass");
  writeFileSync(h.target, "구조 진단을 반영한 변경\n");
  const failed = await h.verify();
  assert.equal(failed.json.escalation.stage, "upper_review");
  assert.equal((await h.verify([], "never", pre)).code, 16);
});
