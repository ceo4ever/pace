import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { packageRoot } from "../src/core/paths.ts";
import { InputSnapshot } from "../src/core/input-snapshot.ts";
import { textHash, type ReviewEntry } from "../src/agent/review-log.ts";
import { collectReviewLedgerMetrics, formatReviewLedgerMetrics } from "../src/project/review-metrics.ts";
import { collectDashboard, formatDashboard } from "../src/project/metrics-report.ts";
import type { Repo, ProjectRef } from "../src/project/harness.ts";
import { reviewHash } from "../src/project/pre-review.ts";
import { runPace, sessionFreeEnv, tempDir } from "./helpers.ts";

const at = "2026-11-26T00:00:00Z";
const ledger = "REVIEW-LOG.jsonl";
const pass = "확인된 관측 결과\npass";

function file(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function add(dir: string, row: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ledger), JSON.stringify({ at, ...row }) + "\n", { flag: "a" });
}

function review(dir: string, number: number, data: {
  target: string; verdict: "pass" | "fail"; raw?: string; snapshot?: string; extra?: Partial<ReviewEntry>;
}) {
  const record = `review-records/R${number}.json`;
  const snapshot = data.snapshot ?? `합성 대상 ${data.target}\n`, hash = reviewHash(snapshot);
  const raw = data.raw ?? pass;
  const row = {
    type: "review", kind: "goal", target: data.target, hash, verdict: data.verdict,
    verifier: "claude", provider: "anthropic", rereview_of: null, record, result_hash: textHash(raw), ...data.extra,
  };
  if (row.required_criteria) add(dir, { type: "format", target: row.target, hash, record,
    required_criteria: row.required_criteria, permission_basis: row.permission_basis });
  add(dir, row);
  file(join(dir, record), JSON.stringify({ review: { ...row, snapshot }, result: { text: raw } }));
  return record;
}

function fixture() {
  const root = tempDir("pace-review-stats-");
  const home = tempDir("pace-review-stats-home-");
  const name = "P001_261126_통계";
  const project = join(root, "projects", name);
  const task = join(project, "tasks/T01_작업");
  const backlog = join(root, "backlogs/BL261126_01_검토");
  const projectText = "# P001 통계\n\n- 상태: 진행\n- 출처: [검토](../../backlogs/BL261126_01_검토/BACKLOG.md)\n\n## 태스크\n\n| T | 이름 | 상태 | 커밋 |\n|---|---|---|---|\n| T01 | 작업 | 진행 | |\n";
  file(join(project, "PROJECT.md"), projectText);
  file(join(project, "PROJECT-CLOSE.md"), "# 마감\n\n## 지표\n\n[지표](METRICS.md)\n확인\n");
  file(join(backlog, "BACKLOG.md"), "# 백로그\n");
  file(join(task, "TASK.md"), "# 태스크\n- 상태: 진행\n");
  const git = (...args: string[]) => {
    const result = spawnSync("git", ["-C", root, "-c", "user.name=fixture", "-c", "user.email=test@example.com", ...args],
      { encoding: "utf8", env: sessionFreeEnv() });
    assert.equal(result.status, 0, result.stderr);
  };
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  return { root, home, name, project, task, backlog,
    cli: (...args: string[]) => runPace(["project", "stats", "P001", ...args], { cwd: root, home }) };
}

test("검토 원장 stats의 소스·옛 호출·중단·무효·미완료와 단계별 합계 8/5", () => {
  const f = fixture();
  const after = join(f.task, "evidence");
  for (const call_id of ["answered", "left-open", "stopped"]) add(f.task, { type: "call", target: "TASK.md", kind: "task", call_id });
  review(f.task, 1, { target: "TASK.md", verdict: "pass", extra: { call_id: "answered", duration_ms: 100, usage: { input_tokens: 10, output_tokens: null } } });
  review(f.task, 3, { target: "TASK.md", verdict: "pass", extra: { call_id: "answered", duration_ms: 100, usage: { input_tokens: 10, output_tokens: null } } });
  review(f.task, 2, { target: "TASK.md", verdict: "fail", extra: { call_id: "stopped", interrupted: true }, raw: "fail" });
  const invalid = review(after, 1, { target: "impl.diff", verdict: "fail", raw: "- [blocking] 무효 지적\nfail", extra: { duration_ms: 30 } });
  add(after, { type: "void", target: "impl.diff", record: invalid, summary: "시험 도구 오류", file: "void.md" });
  review(after, 2, { target: "impl.diff", verdict: "pass", extra: { followup: { type: "joint", id: "ran-joint" }, duration_ms: 20,
    usage: { input_tokens: 2, output_tokens: 4 } } });
  review(after, 3, { target: "impl.diff", verdict: "pass" });
  add(after, { type: "diagnosis", target: "impl.diff", layer: "structure", summary: "적용한 진단 근거" });
  add(after, { type: "decision", target: "impl.diff", choice: "보완", summary: "별도 결정 사건", file: "decision.md", by: "pm" });
  file(join(f.task, "REVIEW-FOLLOWUPS.jsonl"), [
    { type: "joint", id: "joint-permission", at, stage: "post", target: "evidence/impl.diff", hash: reviewHash("impl"), evidence: "joint.md",
      evidence_hash: textHash("joint"), summary: "공동 검토를 연다", choice: "확인", rounds: 1 },
    { type: "started", id: "joint-start", at, grant: "joint-permission" },
    { type: "root_review", id: "upper-1", at, stage: "post", target: "evidence/impl.diff", hash: reviewHash("impl"), contract: reviewHash("task"),
      evidence: "upper.md", evidence_hash: textHash("upper"), summary: "상위 원인 확인", trigger: "root", slot: 1, reviewer: "second",
      provider: "anthropic", context: "new-context", cross: true },
    { type: "waiver_request", id: "owner-request", at, stage: "post", target: "evidence/impl.diff", hash: reviewHash("impl"),
      evidence: "owner.md", evidence_hash: textHash("owner"), summary: "필수 검사 생략 제안", choice: "보류", proposed: "skip",
      choices: ["보류", "추가 검증"], assessments: [{ finding: "F1", decision: "A-3", reason: "기준 미충족" }] },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n");
  review(f.backlog, 1, { target: "BACKLOG.md", verdict: "pass" });
  review(f.project, 1, { target: "PROJECT.md", verdict: "pass" });
  review(join(after, "cases", "nested"), 1, { target: "fixture.md", verdict: "pass" });
  review(join(f.project, "evidence", "cases", "nested"), 1, { target: "fixture.md", verdict: "pass" });
  file(join(f.project, "log.jsonl"), JSON.stringify({ p: "P001", t: "T01", ts: at, type: "review", by: "agent",
    msg: "reviewer pass blocking 0 should_fix 0", data: { reviewer: 1, pass: 1, blocking: 0, should_fix: 0 } }) + "\n");
  const result = f.cli("--json");
  assert.equal(result.status, 0, result.stderr);
  const all = JSON.parse(result.stdout);
  assert.equal(all.eventCounts.reviews, 1);
  const { reviewLedger: observed } = all;
  assert.deepEqual([observed.calls, observed.rounds, observed.ledgers], [8, 5, 4]);
  assert.deepEqual(observed.callSources, { reserved: 3, unreserved: 5, unfinished: 1, interrupted: 1, voided: 1 });
  assert.deepEqual([observed.jointAttempts, observed.escalations, observed.diagnoses, observed.upperReviews], [1, 1, 1, 1]);
  assert.ok(observed.unobservedFollowupRounds > 0);
  assert.deepEqual(Object.fromEntries(Object.entries(observed.phases).map(([key, value]) => {
    const v = value as { calls: number; rounds: number };
    return [key, [v.calls, v.rounds]];
  })), { pre: [3, 1], post: [3, 2], backlog: [1, 1], project: [1, 1] });
  assert.deepEqual(observed.durationMs, { total: 150, reported: 3, missing: 5 });
  assert.deepEqual(observed.inputTokens, { total: 12, reported: 2, missing: 6 });
  assert.deepEqual(observed.outputTokens, { total: 4, reported: 1, missing: 7 });
  assert.equal(observed.units.find((u: { id: string }) => u.id === "BL261126_01").calls, 1);
  const printed = f.cli();
  assert.match(printed.stdout, /검토 원장 집계[\s\S]*미보고 7회/);
  assert.match(printed.stdout, /1 · 일부 미관측/);
  assert.match(printed.stdout, /사건 수:[^\n]*리뷰 1/);
  const generated = f.cli("--write");
  assert.equal(generated.status, 0, generated.stderr);
  assert.match(readFileSync(join(f.project, "METRICS.md"), "utf8"), /## 검토 원장 집계/);
});

test("기존 stats 값과 출력은 검토 원장이 추가돼도 그대로다", () => {
  const f = fixture();
  const repo: Repo = { root: f.root, mainRoot: f.root, base: "main", branch: "main", inWorktree: false };
  const ref: ProjectRef = { id: "P001", dir: f.name, name: "통계", branch: "project/P001", worktree: "" };
  const before = collectDashboard(repo, ref, { home: f.home, env: {}, now: at });
  review(f.task, 1, { target: "TASK.md", verdict: "pass" });
  const after = collectDashboard(repo, ref, { home: f.home, env: {}, now: at });
  const { reviewLedger: beforeLedger, ...beforeExisting } = before;
  const { reviewLedger: afterLedger, ...afterExisting } = after;
  assert.deepEqual([beforeLedger.calls, afterLedger.calls], [0, 1]);
  assert.deepEqual(afterExisting, beforeExisting);
  const priorText = (stats: typeof before) => formatDashboard(stats).split("\n\n## 검토 원장 집계", 1)[0];
  assert.equal(priorText(after), priorText(before));
});

test("검토 원장 품질은 원문 지문·같은 대상·변경된 수정의 해소 대리 지표와 영향 비용을 구별한다", () => {
  const f = fixture();
  const after = join(f.task, "evidence");
  const section = { structured_stage: "post", required_criteria: ["T-1"] } as const;
  const finding = { id: "F1", severity: "blocking", category: "defect", location: "src.ts:1", scenario: "정상 출력이 누락된다",
    reproduction: "같은 입력으로 다시 실행한다", confidence: "high", impact: "goal", criterion: null };
  const structured = (findings: unknown[], report: string) => ["```pace-review",
    JSON.stringify({ version: 2, criteria: [{ id: "T-1", state: "present", observation: "시험에서 출력을 확인했다" }], findings }), "```", report].join("\n");
  const stamp = { ...section, required_criteria: [...section.required_criteria] };
  const first = review(after, 1, { target: "one.patch", verdict: "fail", raw: structured([finding,
    { ...finding, id: "F2", impact: "minor" }, { ...finding, id: "F3", reproduction: null }], "pass"),
    snapshot: "구현 원문 1\n", extra: stamp });
  review(after, 2, { target: "one.patch", verdict: "pass", raw: structured([], "pass"),
    snapshot: "구현 원문 2\n", extra: { ...stamp, rereview_of: first, duration_ms: 25 } });
  const second = review(after, 3, { target: "two.patch", verdict: "fail", raw: structured([finding], "fail"), extra: stamp });
  review(after, 4, { target: "different.patch", verdict: "pass", raw: structured([], "pass"), extra: { ...stamp, rereview_of: second } });
  review(after, 5, { target: "two.patch", verdict: "pass", raw: structured([], "pass"), extra: { ...stamp, rereview_of: second } });
  const tampered = review(after, 6, { target: "other.patch", verdict: "pass", raw: structured([], "pass"), extra: stamp });
  const path = join(after, tampered);
  file(path, readFileSync(path, "utf8").replace("pass", "tampered-pass"));
  const trace = new InputSnapshot();
  const observed = collectReviewLedgerMetrics(f.root, f.name, trace);
  assert.deepEqual([observed.calls, observed.rounds, observed.blocking, observed.unobservedBlockingRounds], [6, 6, 2, 1]);
  assert.deepEqual(observed.resolutionProxy, { eligible: 2, resolved: 1, ratio: 0.5, unobservedRounds: 1 });
  assert.deepEqual(observed.downgraded, { minor_impact: 1, missing_evidence: 1 });
  assert.deepEqual(observed.rereviewsByImpact.goal, { rounds: 3, durationMs: { total: 25, reported: 1, missing: 2 } });
  assert.deepEqual(observed.rereviewsByImpact.minor, { rounds: 1, durationMs: { total: 25, reported: 1, missing: 0 } });
  assert.ok(trace.files.has(join(after, ledger)) && trace.files.has(path));
  assert.match(formatReviewLedgerMetrics(observed), /결함 확인의 대리 지표[\s\S]*1\/2 \(50\.0%\)/);
});

test("기존 P009 T06의 실제 구현 후 무예약 원장 83회를 대조한다", () => {
  const base = join(packageRoot, "projects");
  const name = readdirSync(base).find((entry) => entry.startsWith("P009_"))!;
  const t06 = readdirSync(join(base, name, "tasks")).find((entry) => entry.startsWith("T06_"))!;
  const original = readFileSync(join(base, name, "tasks", t06, "evidence", ledger), "utf8").split("\n")
    .filter((line) => line.trim()).map((line) => JSON.parse(line))
    .filter((row) => row.type === "review");
  assert.equal(original.length, 83);
  assert.equal(new Set(original.map((row) => row.record)).size, 83);
  assert.equal(original.some((row) => row.call_id), false);
  const stats = collectReviewLedgerMetrics(packageRoot, name);
  const post = stats.units.find((unit) => unit.id === "T06")?.phases.post;
  assert.deepEqual([post?.calls, post?.rounds, post?.callSources.unreserved], [83, 83, 83]);
  assert.equal(post?.inputTokens.total, null);
  assert.ok((stats.phases.project?.calls ?? 0) >= 2, "P009의 프로젝트 S11 원장도 포함한다");
});

test("원장 없음과 손상된 원장을 0회 확인으로 보고하지 않는다", () => {
  const f = fixture();
  const blank = collectReviewLedgerMetrics(f.root, f.name);
  assert.equal(blank.ledgers, 0);
  assert.match(formatReviewLedgerMetrics(blank), /원장 없음/);
  file(join(f.task, ledger), "{broken\n");
  const partial = collectReviewLedgerMetrics(f.root, f.name);
  assert.equal(partial.ledgers, 1);
  assert.match(formatReviewLedgerMetrics(partial), /원장 판독 미확인/);
});
