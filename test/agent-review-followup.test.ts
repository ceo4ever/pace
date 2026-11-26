import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decideReviewAdmission, type AdmissionState } from "../src/agent/review-admission.ts";
import { AgentError, normalizeResult, type Executor } from "../src/agent/contract.ts";
import { reviewNoteCommand, verifyCommand } from "../src/agent/verify-cli.ts";
import { scopedReviewFixture, tempDir } from "./helpers.ts";

function fixture(unit = "task") {
  const root = join(tempDir("pace-followup-"), unit === "task"
    ? "projects/P013_review/tasks/T02_followup" : "backlogs/BL261126_01_review");
  mkdirSync(join(root, "evidence"), { recursive: true });
  const target = join(root, unit === "task" ? "change.patch" : "BACKLOG.md");
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
        return normalizeResult(request, { text: scopedReviewFixture(request.prompt, reply), provider: "openai" }, { durationMs: 1, enforcement: "fake" });
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
  return { root, target, prompts, verify, note, exhaust,
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
    assert.ok(readFileSync(join(h.root, blocked.json.followup.report), "utf8").includes('"classify_followup"'));
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
