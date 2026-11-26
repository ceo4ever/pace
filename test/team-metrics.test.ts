import { readPrivateInput } from "../src/project/handoff-private.ts";
import { reviewHash } from "../src/project/pre-review.ts";
import { recordMetric } from "../src/project/metrics.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { inputHash, InputSnapshot } from "../src/core/input-snapshot.ts";
import { runPace, sessionFreeEnv, tempDir } from "./helpers.ts";

function fixture(check: string | null = "true", security = "true") {
  const root = tempDir("pace-team-metrics-"), home = tempDir("pace-team-metrics-home-");
  const git = (...args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: sessionFreeEnv() });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.name", "SyntheticFixture").status, 0); assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  const checkLine = check === null ? "" : `- 검사: \`${check}\`\n`;
  mkdirSync(join(root, "docs")); writeFileSync(join(root, "docs/README.md"), `# Fixture\n\n## 환경\n\n${checkLine}- 보안 검사: \`${security}\`\n`);
  assert.equal(git("add", "-A").status, 0); assert.equal(git("commit", "-qm", "fixture").status, 0);
  const run = (...args: string[]) => runPace(args, { cwd: root, home }); assert.equal(run("project", "new", "팀 측정 합성").status, 0);
  const dir = join(root, "projects", readdirSync(join(root, "projects")).find((p) => p.startsWith("P001_"))!);
  writeFileSync(join(dir, "log.jsonl"), ""); // Explicit empty collection; missing and corrupt sources have separate negative cases.
  return { root, home, dir, run, git };
}

test("팀 stats는 수신 의도만 있는 요청을 도달로 세지 않고 없는 손작업 총량을0으로 채우지 않는다", () => {
  const f = fixture(), project = join(f.dir, "PROJECT.md"); writeFileSync(project, readFileSync(project, "utf8") + "\n- 팀 측정: v1\n");
  assert.equal(f.run("project", "log", "P001", "--type", "question", "--by", "agent", "--to", "owner", "--request-id", "intent-only", "--msg", "합성 전달 의도").status, 0);
  const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout); assert.ok(data.team, "팀 측정 객체가 있어야 한다");
  assert.equal(data.team.requests.reachedTotal, null); assert.equal(data.team.snapshot.counts.owner_questions, null); assert.equal(data.team.snapshot.observed_counts.owner_questions, 0);
  assert.equal(data.team.requests.reached, 0); assert.equal(data.team.requests.unconfirmed, 1);
  assert.equal(data.team.manual.roleCorrections.total, null); assert.equal(data.team.manual.roleCorrections.observed, null);
});

import { compareTeam, formatTeamComparison } from "../src/project/team-comparison.ts";
import { teamRetrospectiveIssues, adoptTeamMetrics } from "../src/project/team-retrospective.ts";
import { digest } from "../src/project/handoff-files.ts";
import { readEvents, recordEvent, reviewMessageData } from "../src/project/event-log.ts";
import { comparisonContext, EVIDENCE_PURPOSES, MANUAL_KEYS, portableRequestInputHash } from "../src/project/team-input.ts";
import { symlinkSync, linkSync, unlinkSync } from "node:fs";

function receipt(dir: string, name = "proof.json", period?: { start: string | null; end: string; unit: string }, requestId?: string) {
  writeFileSync(join(dir, name), JSON.stringify({ version: 1, kind: "team-evidence", purposes: requestId ? ["owner-answer", "coordinator-answer"] : EVIDENCE_PURPOSES.filter((p) => !["owner-answer", "coordinator-answer"].includes(p)), sourceRef: period?.unit === "representative-task" && !requestId ? "representative-scope:fixture:synthetic-metadata" : "fixture:synthetic-metadata", hash: digest(`synthetic-local-not-copied:${JSON.stringify(period ?? null)}`), ...(requestId ? { requestId } : {}), ...(period ? { period: { start: period.start, end: period.end, unit: period.unit } } : {}) })); return name;
}
function confirmRequestInput(dir: string, run: ReturnType<typeof fixture>["run"], id = "P001"): void {
  const measurement = join(dir, "TEAM-MEASUREMENT.json"), input = JSON.parse(readFileSync(measurement, "utf8"));
  const report = run("project", "stats", id, "--json");
  assert.equal(report.status, 0, report.stderr);
  const hash = JSON.parse(report.stdout).team.requestCoverageInputHash;
  if (hash === null) return;
  assert.match(hash, /^[a-f0-9]{64}$/);
  const support = JSON.parse(readFileSync(join(dir, input.request_coverage.refs[0]), "utf8"));
  const ref = `request-confirmation-${hash.slice(0, 20)}.json`;
  writeFileSync(join(dir, ref), JSON.stringify({ ...support, sourceRef: "request-coverage:fixture:synthetic-confirmation", hash, purposes: ["request-coverage"] }));
  input.request_coverage.confirmationRef = ref;
  writeFileSync(measurement, JSON.stringify(input));
}
function roleReceipt(dir: string, name: string, period: { start: string | null; end: string; unit: string }, role: string, kind: "activity" | "none" | "condition-not-triggered") {
  receipt(dir, name, period);
  const path = join(dir, name), proof = JSON.parse(readFileSync(path, "utf8"));
  proof.sourceRef = `role-observation:${role}:${kind}:fixture:observation`;
  writeFileSync(path, JSON.stringify(proof));
}
function snapshot(repository = "fixture-repo", after = false) {
  const counts: Record<string, number> = Object.fromEntries(MANUAL_KEYS.map((key) => [key, 5]));
  Object.assign(counts, { owner_questions: after ? 1 : 5, failed_only_owner_requests: 0, blocking_sum_stats_events: 3, rereviews_after_fail: 2, review_failures: 0, should_fix_sum_stats_events: 0, gate_failures: 1 });
  return { version: 1, repository, comparison: { study: "team-adoption", conditionCode: after ? "team" : "no-team", definition: "reach-v1", unit: "representative-task", workType: "feature", sizeBand: "small", host: "codex", sampleCount: 2, recordingBoundary: "closed-task", qualitySource: "event-log", qualityScopeHash: digest("same-quality-scope") }, period: { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "completion.json" }, completionProofSha256: undefined as string | undefined, counts, observed_counts: {}, unknown: { request_events: 0 } };
}
function compareFixture() {
  const dir = tempDir("pace-team-comparison-"), before = join(dir, "before.json"), after = join(dir, "after.json");
  const b = snapshot(), a = snapshot("fixture-repo", true); receipt(dir, "completion.json", b.period);
  const group = (s: ReturnType<typeof snapshot>, n: number) => ({ version: 1, samples: Array.from({ length: n }, (_, i) => {
    const period = { ...s.period, start: `2026-01-0${i * 2 + 1 + (s.comparison.conditionCode === "team" ? 4 : 0)}T00:00:00Z`, end: `2026-01-0${i * 2 + 2 + (s.comparison.conditionCode === "team" ? 4 : 0)}T00:00:00Z`, completionRef: `completion-${s.comparison.conditionCode}-${i}.json` };
    receipt(dir, period.completionRef, period);
    return { ...s, period, completionProofSha256: inputHash(readFileSync(join(dir, period.completionRef))) };
  }) });
  const save = (n = 2) => { writeFileSync(before, JSON.stringify(group(b, n))); writeFileSync(after, JSON.stringify(group(a, n))); };
  save(); return { dir, before, after, b, a, save, compare: () => compareTeam(before, after, "team-adoption") };
}
test("팀 비교는 부담 개선·악화·품질 변화 미확인을 분리하며 품질 감소를 개선으로 포장하지 않는다", () => {
  const f = compareFixture(); assert.equal(f.compare().conclusion, "observed-burden-improvement");
  assert.match(formatTeamComparison(f.compare()), /\| 지표 \|[^\n]*\n\|---\|/);
  f.a.counts.owner_questions = 8; f.save(); assert.equal(f.compare().conclusion, "observed-burden-worsening");
  f.a.counts.owner_questions = 1; f.a.counts.blocking_sum_stats_events = 1; f.save();
  const r = f.compare(); assert.equal(r.conclusion, "unknown"); assert.equal(r.rows.find((r) => r.metric === "blocking_sum")?.delta, -4); assert.ok(r.reasons.some((s) => s.includes("품질 지표 변화")));
});
test("표본·정의·범위·저장소 누락/불일치와 혼재 증감을 판정 전에 검출한다", () => {
  const f = compareFixture(); f.a.comparison.sampleCount = 99; f.save(1); assert.equal(f.compare().conclusion, "unknown");
  f.a.comparison.sampleCount = 2; f.a.counts.owner_file_edits = 8; f.save(); assert.match(f.compare().reasons.join(" "), /혼재/);
  f.a.repository = "other-repo"; f.save(); assert.ok(f.compare().rows.every((r) => r.delta === null));
  f.a.repository = "fixture-repo"; f.a.comparison.definition = "different"; f.save(); assert.match(f.compare().reasons.join(" "), /definition 불일치/);
  f.a.comparison.conditionCode = "after-change"; f.save(); assert.throws(() => f.compare(), /목적\/전후 조건/);
});
test("legacy 기준선 원본을 바꾸지 않고 지문 고정 주석을 요구하며 수신 의도를 도달로 승격하지 않는다", () => {
  const f = compareFixture(); const raw = { version: 1, repository: "fixture-repo", condition: "한글 메시지 역할 조건", counts: { captain_questions: 10, captain_questions_range: [10, 12], captain_manual_role_corrections: null, blocking_sum_audited: 48, blocking_sum_stats_events: 31, rereviews_after_fail_audited: 18 }, unknown: { recipient_events: 2 } };
  writeFileSync(f.before, JSON.stringify(raw)); const original = readFileSync(f.before);
  const r = f.compare(); assert.equal(r.conclusion, "unknown"); assert.equal(r.sources.before.counts.owner_questions, null); assert.deepEqual(r.sources.before.range, [10, 12]); assert.equal(r.sources.before.counts.blocking_sum_audited, 48); assert.equal(r.sources.before.counts.blocking_sum_stats_events, 31);
  const ann = join(f.dir, "annotation.json"); writeFileSync(ann, JSON.stringify({ version: 1, sourceSha256: digest("wrong"), sourceRef: "fixture:annotation", comparison: f.b.comparison }));
  assert.throws(() => compareTeam(f.before, f.after, "team-adoption", ann), /지문/);
  writeFileSync(ann, JSON.stringify({ version: 1, sourceSha256: digest(original), sourceRef: "fixture:annotation", comparison: f.b.comparison }));
  assert.equal(compareTeam(f.before, f.after, "team-adoption", ann).sources.before.counts.owner_questions, null); assert.deepEqual(readFileSync(f.before), original);
});
test("회고는 최초 METRICS 생성 전에 metadata 근거로 검증하며 원문 경로·빈 이유·4변경을 거부한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`;
  createTeamMember(f.root, "maker", "maker");
  assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); adoptTeamMetrics(f.root, rel);
  assert.match(teamRetrospectiveIssues(f.root, rel).join(" "), /회고/);
  const proof = receipt(f.dir), close = "## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 합성 범위 검토 |\n";
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), close);
  const data = { version: 1, metricRef: "METRICS.md", unusedRoles: [{ role: "maker", coverage: "unconfirmed", refs: [] }], recurringFindings: [{ code: "scope", count: 2, coverage: "reported", refs: [proof] }], definitionChanges: [] as unknown[], noChangesReasonRef: proof as string | undefined };
  const save = () => writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify(data)); save(); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  data.noChangesReasonRef = ""; save(); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  data.noChangesReasonRef = undefined; data.definitionChanges = Array(4).fill({ role: "maker", changeRef: proof, reasonRef: proof }); save(); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  for (const n of [1, 2, 3]) {
    data.definitionChanges = Array.from({ length: n }, (_, i) => ({
      role: "maker", changeRef: receipt(f.dir, `change-${i}.json`), reasonRef: proof,
    }));
    save();
    assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  }
  data.definitionChanges = [{ role: "not-a-team-role", changeRef: proof, reasonRef: proof }]; save(); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  data.definitionChanges = [{ role: "maker", changeRef: ".git/private.json", reasonRef: proof }]; save(); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  symlinkSync(join(f.dir, proof), join(f.dir, "linked.json")); data.definitionChanges = [{ role: "maker", changeRef: "linked.json", reasonRef: proof }]; save(); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
});
test("새 start 측정 버전은 marker를 지워도 회고를 요구하며 옛 role 없는 start를 소급하지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`;
  // Invalid versioned records cannot silently introduce a different schema.
  assert.equal(recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "start", by: "cli", msg: "합성", data: { teamMetricsVersion: 1 } }), false);
  assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  const role = { name: "maker", source: "option" as const, definition: ".pace/team/maker.md", hash: digest("role"), method: "prompt" as const, model: "synthetic", settingsStatus: "planned" as const, toolsPermissionApplied: false as const, runtimeObserved: false as const };
  assert.equal(recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "start", by: "cli", msg: "새 역할 합성", role, data: { teamMetricsVersion: 1 } }), true);
  assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  adoptTeamMetrics(f.root, rel); const path = join(f.dir, "PROJECT.md"); writeFileSync(path, readFileSync(path, "utf8").replace("- 팀 측정: v1", ""));
  assert.ok(teamRetrospectiveIssues(f.root, rel).length);
});
test("명시 부분 0은 관측0/총량null이고 complete도 닫힌 구간·다른 확인자·영수증이 필요하다", () => {
  const f = fixture(); receipt(f.dir);
  const input = { version: 1, counts: { owner_file_edits: 0 }, observed_counts: { owner_file_edits: 0 }, coverage: { owner_file_edits: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "proof.json", refs: ["proof.json"] } } };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input));
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team;
  assert.equal(t.manual.fileEdits.observed, 0); assert.equal(t.manual.fileEdits.total, null); assert.equal(t.manual.roleCorrections.observed, null); assert.equal(t.ownerInterventionTotal, null);
  writeFileSync(join(f.dir, "raw.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: "local:/secret/original.md", hash: digest("raw"), body: "synthetic raw forbidden" }));
  input.coverage.owner_file_edits.refs = ["raw.json"]; writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input)); assert.equal(f.run("project", "stats", "P001", "--json").status, 2);
});

test("source CLI stats→비교→METRICS→회고→finish를 metadata만으로 완주한다", () => {
  const f = fixture(); createTeamMember(f.root, "maker", "maker");
  assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "synthetic-role-source").status, 0);
  const started = f.run("project", "start", "P001", "--role", "maker", "--agent", "codex", "--no-launch"); assert.equal(started.status, 0, started.stdout + started.stderr);
  const root = `${f.root}.wt/P001`, projectName = f.dir.split("/").at(-1)!;
  f.root = root; f.dir = join(root, "projects", projectName);
  f.run = (...args: string[]) => runPace(args, { cwd: root, home: f.home });
  f.git = (...args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: sessionFreeEnv() });
  const start = readFileSync(join(f.dir, "log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).find((event) => event.type === "start");
  assert.equal(start.role.name, "maker"); assert.equal(start.data.teamMetricsVersion, 1);
  const rel = `projects/${projectName}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  const path = join(f.dir, "PROJECT.md"); writeFileSync(path, readFileSync(path, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 합성 측정 | 시험 |"));
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "# 합성 마감\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | 합성 측정 시험 |\n\n## 보안\n\ntrue 실행\n\n## 정본 반영\n\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| `docs/README.md` | 해당 없음 | 합성 |\n\n## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 합성 metadata 입력 검증 |\n\n## 지표\n\n[지표](METRICS.md)\n\n실제 도입 효과는 이 합성 시험으로 판단하지 않는다.\n");
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const stats = f.run("project", "stats", "P001", "--json"); assert.equal(stats.status, 0, stats.stderr); writeFileSync(join(f.dir, "stats.json"), stats.stdout);
  assert.equal(JSON.parse(stats.stdout).team.requests.reached, 0);
  const comp = f.run("project", "compare-team", "--before", join(f.dir, "stats.json"), "--after", join(f.dir, "stats.json"), "--kind", "team-adoption", "--json"); assert.equal(comp.status, 0, comp.stderr); assert.equal(JSON.parse(comp.stdout).conclusion, "unknown");
  assert.equal(f.run("project", "stats", "P001", "--write").status, 0); assert.match(readFileSync(join(f.dir, "METRICS.md"), "utf8"), /## 팀 측정/); assert.match(readFileSync(join(f.dir, "METRICS.md"), "utf8"), /\| 구분 \| 값 \|\n\|---\|---\|/);
  createTeamMember(f.root, "unused", "reviewer");
  const review = "reviewer fail blocking 3 should_fix 0";
  recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "review", by: "agent", msg: review, data: reviewMessageData(review) });
  assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "synthetic-metrics-flow").status, 0);
  const held = f.run("project", "finish", "P001"); assert.equal(held.status, 1, held.stdout + held.stderr); assert.match(held.stdout + held.stderr, /미사용 검토 후보|반복 지적/);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [{ role: "unused", coverage: "unconfirmed", refs: [] }], recurringFindings: [{ code: "review-blocking", count: 3, coverage: "reported", refs: ["proof.json"] }], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "synthetic-retro-coverage").status, 0);
  const finished = f.run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  assert.doesNotMatch(f.git("ls-files").stdout, /bodies\//);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, comparison: { unit: "representative-task" } }));
  assert.equal(JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team.period.closed, false);
});

import { instructionDigest, proposalDigest } from "../src/team/handoff-model.ts";
import { HandoffStore } from "../src/project/handoff-store.ts";
import { prepareDelivery, deliveryReceipt } from "../src/team/handoff-delivery.ts";
import { collectHandoffs } from "../src/project/handoff-report.ts";

test("도달은 답만·실패 뒤 성공·실패만을 요청별로 분리하고 범위 밖 최초 요청을 제외한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  for (const id of ["answered", "retry", "failed"]) store.record({ protocol: "pace-handoff", v: 1, id: `q-${id}`, kind: "decision_request", from: "coordinator", to: "owner", requestId: id, data: { interpretation: false } }, "SYNTHETIC question");
  store.record({ protocol: "pace-handoff", v: 1, id: "answer-only", kind: "decision_reply", from: "owner", to: "coordinator", requestId: "answered", data: { re: "q-answered", decision: "approve", proposalHash: proposalDigest(store.read().find((r) => r.id === "q-answered")!), sourceRef: "fixture:answer-only" } }, "SYNTHETIC answer");
  const route = { transport: "external", actor: "owner", target: "fixture-human-route", from: "coordinator", sourceRef: "fixture:receipt" };
  for (const id of ["retry", "failed"]) { prepareDelivery(store, `q-${id}`, `${id}-first`, route); deliveryReceipt(store, `${id}-first`, { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef }); }
  prepareDelivery(store, "q-retry", "retry-next", route); deliveryReceipt(store, "retry-next", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseHash: digest("synthetic receipt"), responseId: "fixture-success" });
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team;
  assert.equal(t.requests.ownerIntendedRequests, 3);
  assert.equal(t.requests.reached, 2); assert.equal(t.requests.ownerReply, 1); assert.equal(t.requests.ownerDelivery, 1); assert.equal(t.requests.failedOnly, 1); assert.equal(t.requests.failedAttemptsObserved, 2);
  const end = new Date(Date.now() + 1000).toISOString(), after = new Date(Date.now() + 500).toISOString();
  const scoped = collectHandoffs(f.root, "P001", rel, { start: after, end })!; assert.equal(scoped.requests.total, 0); assert.equal(scoped.records, 0);
});

import { createTeamMember } from "../src/team/store.ts";

test("역할 선언은 실제 시간/출력이나 미사용 증명이 아니며 자체 답도 명시 근거만 센다", () => {
  const f = fixture(); createTeamMember(f.root, "maker", "maker"); receipt(f.dir, "proof.json", undefined, "own-answer");
  const ts = new Date().toISOString();
  recordEvent(f.dir, { ts, p: "P001", type: "question", by: "agent", to: "coordinator", requestId: "own-answer", msg: "합성 질문" });
  recordEvent(f.dir, { ts, p: "P001", type: "answer", by: "coordinator", requestId: "own-answer", msg: "합성 코디네이터 답" });
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team; };
  const old = get(); assert.equal(old.requests.coordinatorOwnAnswerObserved, null); assert.equal(old.requests.reached, 0); assert.equal(old.roles[0].workMs, null); assert.equal(old.unusedRoleCandidates[0].coverage, "unconfirmed");
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "proof.json", refs: ["proof.json"] };
  const period = { start: new Date(Date.parse(ts) - 1000).toISOString(), end: new Date(Date.parse(ts) + 1).toISOString(), unit: "representative-task", closed: false, completionRef: "proof.json" }; receipt(f.dir, "proof.json", period, "own-answer"); roleReceipt(f.dir, "role.json", period, "maker", "activity"); receipt(f.dir, "scope.json", period); period.completionRef = "scope.json";
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, coordinator_answers: [{ requestId: "own-answer", coverage }, { requestId: "own-answer", coverage }], role_observations: [{ role: "maker", workMs: 123, outputTokens: [{ tool: "Codex", output: 42 }], coverage: { ...coverage, confirmationRef: "role.json", refs: ["role.json"] } }] }));
  const updated = get(); assert.equal(updated.requests.coordinatorOwnAnswerObserved, 1); assert.equal(updated.requests.coordinatorOwnAnswerTotal, null); assert.equal(updated.requests.coordinatorIntendedRequests, 1); assert.equal(updated.roles[0].workMs, 123); assert.equal(updated.roles[0].source, "reported-role-binding"); assert.equal(updated.workerContext.attribution, "cwd-window-proxy-not-role");
  assert.deepEqual(updated.roles[0].outputTokens, [{ tool: "Codex", output: 42 }]);
  const rendered = f.run("project", "stats", "P001");
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /maker: 작업 ms 123 · 출력 Codex 42/);
});

function mergeFixture(check: string | null = "true", security = "true", measurement = true) {
  const f = fixture(check, security); const started = f.run("project", "start", "P001", "--agent", "codex", "--no-launch"); assert.equal(started.status, 0, started.stderr);
  const worktree = f.git("worktree", "list", "--porcelain").stdout.split("\n").filter((s) => s.startsWith("worktree ")).map((s) => s.slice(9)).find((s) => s !== f.root)!;
  const run = (...args: string[]) => runPace(args, { cwd: worktree, home: f.home });
  const dir = join(worktree, "projects", f.dir.split("/").at(-1)!); receipt(dir);
  const stats = JSON.parse(run("project", "stats", "P001", "--json").stdout);
  if (measurement) writeFileSync(join(dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period: { start: stats.project.start, end: new Date().toISOString(), unit: "project-start-to-merge", closed: true } }));
  const path = join(dir, "PROJECT.md"); writeFileSync(path, readFileSync(path, "utf8").replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, "| P-1 | 합성 병합 측정 | 시험 |"));
  writeFileSync(join(dir, "PROJECT-CLOSE.md"), "# 합성 마감\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | 합성 병합 구간 |\n\n## 보안\n\ntrue 실행\n\n## 정본 반영\n\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| `docs/README.md` | 해당 없음 | 합성 |\n\n## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 합성 metadata |\n\n## 지표\n\n[지표](METRICS.md)\n\n합성 구간의 병합 후 집계를 확인한다.\n");
  writeFileSync(join(dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-merge-window").status, 0);
  const reviewed = (message: string, ...paths: string[]) => {
    const added = f.git("-C", worktree, "add", "--", ...paths);
    assert.equal(added.status, 0, added.stderr);
    const committed = f.git("-C", worktree, "commit", "-qm", message);
    assert.equal(committed.status, 0, committed.stderr);
  };
  return { f, worktree, run, dir, reviewed };
}

test("필수 역할 표지와 구간 영수증이 세 비참여 상태를 만든다", () => {
  const f = fixture();
  for (const name of ["hub-planner", "conditional-worker", "missing-hub", "regular-worker", "active-hub"]) {
    createTeamMember(f.root, name, "maker");
  }
  const policies = [
    { role: "hub-planner", scope: "hub", conditional: false },
    { role: "conditional-worker", scope: "worktree", conditional: true },
    { role: "missing-hub", scope: "hub", conditional: false },
    { role: "regular-worker", scope: "worktree", conditional: false },
    { role: "active-hub", scope: "hub", conditional: false },
  ];
  writeFileSync(join(f.root, ".pace/team/required-roles.json"), JSON.stringify({ version: 1, roles: policies }));
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "scope.json" };
  receipt(f.dir, "scope.json", period);
  roleReceipt(f.dir, "active.json", period, "active-hub", "activity");
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({
    version: 1, period,
    role_observations: [{
      role: "active-hub", workMs: 42, outputTokens: [{ tool: "Codex", output: 8 }],
      coverage: { status: "partial", reportedBy: "coordinator", refs: ["active.json"] },
    }],
  }));
  const note = (ref: string, ts = "2026-01-01T01:00:00Z") => assert.equal(recordEvent(f.dir, {
    ts, p: "P001", type: "note", by: "coordinator", src: "team-role-nonparticipation", ref, msg: "합성 역할 비참여 관측",
  }), true);
  roleReceipt(f.dir, "condition.json", period, "hub-planner", "condition-not-triggered");
  roleReceipt(f.dir, "unused.json", period, "conditional-worker", "none");
  roleReceipt(f.dir, "other-period.json", { ...period, end: "2026-01-02T01:00:00Z" }, "missing-hub", "none");
  roleReceipt(f.dir, "out-of-window.json", period, "missing-hub", "condition-not-triggered");
  roleReceipt(f.dir, "contradicts-activity.json", period, "active-hub", "none");
  for (const ref of ["condition.json", "unused.json", "other-period.json", "contradicts-activity.json"]) note(ref);
  note("out-of-window.json", "2026-01-03T00:00:00Z");
  const get = () => {
    const report = f.run("project", "stats", "P001", "--json");
    assert.equal(report.status, 0, report.stderr);
    return JSON.parse(report.stdout).team;
  };
  const team = get();
  assert.deepEqual(team.requiredRoleNonParticipation, [
    { role: "conditional-worker", status: "unused", refs: ["unused.json"] },
    { role: "hub-planner", status: "condition-not-triggered", refs: ["condition.json"] },
    { role: "missing-hub", status: "unconfirmed", refs: [] },
  ]);
  assert.deepEqual(team.unusedRoleCandidates.map((entry: { role: string }) => entry.role), ["regular-worker"]);
  assert.equal(team.roles.find((entry: { name: string }) => entry.name === "active-hub").workMs, 42);
  const text = f.run("project", "stats", "P001");
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /conditional-worker: 실제 미사용/);
  assert.match(text.stdout, /hub-planner: 호출 조건 미발생/);
  assert.match(text.stdout, /missing-hub: 기록 부족\(미확인\)/);
  roleReceipt(f.dir, "conflict.json", period, "hub-planner", "none");
  note("conflict.json");
  assert.deepEqual(get().requiredRoleNonParticipation[1], {
    role: "hub-planner", status: "unconfirmed", refs: ["condition.json", "conflict.json"],
  });
});

test("필수 역할 표지의 안전하지 않은 입력은 팀 측정을 보류한다", () => {
  const f = fixture();
  createTeamMember(f.root, "hub", "maker");
  adoptTeamMetrics(f.root, `projects/${f.dir.split("/").at(-1)}`);
  const path = join(f.root, ".pace/team/required-roles.json");
  const role = { role: "hub", scope: "hub", conditional: false };
  const valid = JSON.stringify({ version: 1, roles: [role] });
  for (const data of [
    JSON.stringify({ version: 1, roles: [role, role] }),
    JSON.stringify({ version: 1, roles: [{ ...role, role: "../hub" }] }),
    JSON.stringify({ version: 1, roles: [{ ...role, required: true }] }),
    `{"version":1,"version":1,"roles":[]}`,
    Buffer.from([0xff]),
    valid.padEnd(32769, " "),
  ]) {
    writeFileSync(path, data);
    assert.equal(f.run("project", "stats", "P001", "--json").status, 2);
  }
  const syntheticCredential = ["sk", "a".repeat(24)].join("-");
  writeFileSync(path, JSON.stringify({ version: 1, roles: [{ ...role, role: syntheticCredential }] }));
  const secret = f.run("project", "stats", "P001", "--json");
  assert.equal(secret.status, 2);
  assert.match(secret.stderr + secret.stdout, /비밀 후보/);
  assert.ok(!(secret.stderr + secret.stdout).includes(syntheticCredential));
  const outside = join(tempDir("pace-required-role-marker-"), "roles.json");
  writeFileSync(outside, valid);
  unlinkSync(path);
  linkSync(outside, path);
  assert.equal(f.run("project", "stats", "P001", "--json").status, 2);
  assert.equal(readFileSync(outside, "utf8"), valid);
  if (process.platform !== "win32") {
    unlinkSync(path);
    symlinkSync(outside, path);
    assert.equal(f.run("project", "stats", "P001", "--json").status, 2);
  }
});

test("필수 역할 표지는 finish와 merge에서 비참여를 기록하고 기존 일반 후보를 보호한다", () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture();
  for (const name of ["hub", "conditional-worker", "regular-worker", "unknown-hub", "active-hub"]) createTeamMember(worktree, name, "maker");
  const marker = ".pace/team/required-roles.json";
  writeFileSync(join(worktree, marker), JSON.stringify({ version: 1, roles: [
    { role: "hub", scope: "hub", conditional: false },
    { role: "conditional-worker", scope: "worktree", conditional: true },
    { role: "unknown-hub", scope: "hub", conditional: false },
    { role: "active-hub", scope: "hub", conditional: false },
  ] }));
  const stats = JSON.parse(run("project", "stats", "P001", "--json").stdout);
  const period = { start: stats.project.start, end: new Date().toISOString(), unit: "representative-task", closed: true, completionRef: "scope.json" };
  receipt(dir, "scope.json", period);
  roleReceipt(dir, "active.json", period, "active-hub", "activity");
  roleReceipt(dir, "condition.json", period, "hub", "condition-not-triggered");
  roleReceipt(dir, "unused.json", period, "conditional-worker", "none");
  for (const ref of ["condition.json", "unused.json"]) assert.equal(recordEvent(dir, {
    ts: period.end, p: "P001", type: "note", by: "coordinator", src: "team-role-nonparticipation", ref,
    msg: "합성 역할 비참여 관측",
  }), true);
  writeFileSync(join(dir, "TEAM-MEASUREMENT.json"), JSON.stringify({
    version: 1, period,
    role_observations: [{
      role: "active-hub", workMs: 42, outputTokens: [],
      coverage: { status: "partial", reportedBy: "coordinator", refs: ["active.json"] },
    }],
  }));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-required-role-policies").status, 0);
  const held = run("project", "finish", "P001");
  assert.notEqual(held.status, 0);
  assert.match(held.stdout + held.stderr, /알려진 미사용 검토 후보/);
  const retro = join(dir, "TEAM-RETROSPECTIVE.json");
  const value = JSON.parse(readFileSync(retro, "utf8"));
  value.unusedRoles = [{ role: "regular-worker", coverage: "unconfirmed", refs: [] }];
  writeFileSync(retro, JSON.stringify(value));
  reviewed("synthetic-report-regular-role", retro, join(dir, "log.jsonl"));

  const checkMetrics = (report: string) => {
    assert.match(report, /필수 역할 비참여 hub: 호출 조건 미발생/);
    assert.match(report, /필수 역할 비참여 conditional-worker: 실제 미사용/);
    assert.match(report, /필수 역할 비참여 unknown-hub: 기록 부족\(미확인\)/);
    assert.match(report, /active-hub: 작업 ms 42/);
    assert.doesNotMatch(report, /필수 역할 비참여 active-hub/);
  };
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  checkMetrics(readFileSync(join(dir, "METRICS.md"), "utf8"));
  const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
  const merged = f.run("project", "merge", "P001", "--yes", "--commit", head);
  assert.equal(merged.status, 0, merged.stdout + merged.stderr);
  checkMetrics(readFileSync(join(f.dir, "METRICS.md"), "utf8"));
});

test("필수 역할 표지와 별도 호출 자료는 미채택 프로젝트에 팀 섹션을 만들지 않는다", () => {
  const { f, worktree, dir, run } = mergeFixture("true", "true", false);
  createTeamMember(worktree, "hub", "maker");
  writeFileSync(join(worktree, ".pace/team/required-roles.json"), '{"version":1,"roles":[{"role":"hub","scope":"hub","conditional":false}]}');
  writeFileSync(join(dir, "synthetic-call-metadata.json"), '{"role":"hub","durationMs":42}');
  unlinkSync(join(dir, "TEAM-RETROSPECTIVE.json"));
  const ts = new Date().toISOString();
  assert.equal(recordEvent(dir, { ts, p: "P001", type: "note", by: "agent", src: "agent-call", ref: "synthetic-call-metadata.json", msg: "합성 호출 자료 참조" }), true);
  assert.equal(JSON.parse(run("project", "stats", "P001", "--json").stdout).team, undefined);
  const stats = run("project", "stats", "P001", "--write");
  assert.equal(stats.status, 0, stats.stdout + stats.stderr);
  assert.doesNotMatch(readFileSync(join(dir, "METRICS.md"), "utf8"), /## 팀 측정/);
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-call-metadata").status, 0);
  const finish = run("project", "finish", "P001");
  assert.equal(finish.status, 0, finish.stdout + finish.stderr);
  assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));

  const log = join(dir, "log.jsonl");
  const originalLog = readFileSync(log, "utf8");
  assert.equal(recordEvent(dir, { ts, p: "P001", type: "question", by: "agent", to: "owner", requestId: "actual-question", msg: "합성 소통 사건" }), true);
  const summary = JSON.parse(run("project", "stats", "P001", "--json").stdout).team;
  assert.ok(summary);
  assert.equal(summary.requests.ownerQuestionEvents, 1);
  assert.equal(summary.requiredRoleNonParticipation, undefined);

  writeFileSync(log, originalLog);
  const rel = `projects/${dir.split("/").at(-1)}`;
  const store = new HandoffStore(worktree, "P001", rel);
  store.record({
    protocol: "pace-handoff", v: 1, id: "real-request", kind: "decision_request", from: "coordinator", to: "owner",
    requestId: "real-request", data: { interpretation: false },
  }, "SYNTHETIC actual handoff");
  const ledgerSummary = JSON.parse(run("project", "stats", "P001", "--json").stdout);
  assert.equal(ledgerSummary.team.requests.ownerIntendedRequests, 1);
  assert.equal(ledgerSummary.team.requiredRoleNonParticipation, undefined);
  assert.equal(ledgerSummary.team.requestCoverageInputHash, undefined);
});

test("필수 역할 표지가 Git 검증 대상에서 빠지면 finish를 보류한다", () => {
  const { worktree, run, reviewed } = mergeFixture();
  createTeamMember(worktree, "hub", "maker");
  const marker = ".pace/team/required-roles.json";
  const config = join(worktree, marker);
  const ignore = join(worktree, ".gitignore");
  writeFileSync(ignore, `/${marker}\n`);
  reviewed("synthetic-ignore-required-role-marker", ".pace/team/agents/hub.md", ignore);
  writeFileSync(config, '{"version":1,"roles":[{"role":"hub","scope":"hub","conditional":false}]}');
  const finish = run("project", "finish", "P001");
  assert.notEqual(finish.status, 0);
  assert.match(finish.stdout + finish.stderr, /Git 인덱스에 없다: \.pace\/team\/required-roles\.json/);
});

for (const removeWorktree of [false, true]) test(`project-start-to-merge 선언 입력은 실제 merge 뒤 지표를 생성한다 (worktree 제거=${removeWorktree})`, () => {
  const { f, worktree, run, dir } = mergeFixture();
  const finish = run("project", "finish", "P001"); assert.equal(finish.status, 0, finish.stdout + finish.stderr);
  const sealed = JSON.parse(readFileSync(join(dir, "TEAM-FINISH.json"), "utf8")); assert.equal(sealed.kind, "pace-team-finish"); assert.equal(sealed.checkStatus, "passed");
  const finishedHead = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
  const retrospective = readFileSync(join(dir, "TEAM-RETROSPECTIVE.json"));
  unlinkSync(join(dir, "TEAM-RETROSPECTIVE.json"));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-after-finish-tamper").status, 0);
  const mainBefore = f.git("rev-parse", "HEAD").stdout;
  const rejected = f.run("project", "merge", "P001"); assert.notEqual(rejected.status, 0); assert.match(rejected.stdout + rejected.stderr, /finish 뒤 내용/); assert.equal(f.git("rev-parse", "HEAD").stdout, mainBefore);
  // Restore only this synthetic branch; real project worktrees are never reset.
  assert.equal(f.git("-C", worktree, "reset", "--hard", finishedHead).status, 0); assert.deepEqual(readFileSync(join(dir, "TEAM-RETROSPECTIVE.json")), retrospective);
  if (removeWorktree) {
    assert.equal(f.git("worktree", "remove", worktree).status, 0);
    const status = f.git("status", "--porcelain").stdout;
    assert.equal(f.git("update-ref", "refs/heads/project/P001", mainBefore.trim()).status, 0);
    const sameRef = f.run("project", "merge", "P001", "--yes", "--commit", finishedHead); assert.notEqual(sameRef.status, 0);
    assert.equal(f.git("status", "--porcelain").stdout, status); assert.equal(f.git("rev-parse", "HEAD").stdout, mainBefore);
    assert.equal(f.git("update-ref", "refs/heads/project/P001", finishedHead).status, 0);
  }
  const unbound = f.run("project", "merge", "P001", "--yes"); assert.notEqual(unbound.status, 0); assert.match(unbound.stdout + unbound.stderr, /승인한 SHA/);
  const stale = f.run("project", "merge", "P001", "--yes", "--commit", mainBefore.trim()); assert.notEqual(stale.status, 0);
  assert.equal(f.git("rev-parse", "HEAD").stdout, mainBefore);
  const preview = f.run("project", "merge", "P001"); assert.equal(preview.status, 0, preview.stderr); assert.match(preview.stdout, new RegExp(`--yes --commit ${finishedHead}`)); assert.match(preview.stdout, /팀 전체 검사: 통과/);
  const merge = f.run("project", "merge", "P001", "--yes", "--commit", finishedHead); assert.equal(merge.status, 0, merge.stdout + merge.stderr);
  const after = JSON.parse(f.run("project", "stats", "P001", "--json").stdout); assert.equal(after.team.period.closed, true); assert.equal(after.team.period.end, after.project.merge);
});

for (const ignored of ["TEAM-RETROSPECTIVE.json", "proof.json"]) test(`R24 ignored 검증 자료는 작업 파일이 유효해도 finish tree에 빠질 수 없다: ${ignored}`, () => {
  const { f, worktree, run, dir } = mergeFixture();
  const rel = `projects/${dir.split("/").at(-1)}/${ignored}`, original = readFileSync(join(dir, ignored));
  assert.equal(f.git("-C", worktree, "rm", "--cached", "--", rel).status, 0);
  writeFileSync(join(worktree, ".gitignore"), `${rel}\n`);
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-ignore-proof").status, 0);
  const finish = run("project", "finish", "P001"); assert.notEqual(finish.status, 0); assert.match(finish.stdout + finish.stderr, /Git 인덱스에 없다/);
  assert.deepEqual(readFileSync(join(dir, ignored)), original); assert.equal(f.git("-C", worktree, "ls-files", "--", `projects/${dir.split("/").at(-1)}/TEAM-FINISH.json`).stdout, "");
});
for (const phase of ["check", "security"]) test(`R25 ${phase} 명령의 무관한 staged 자료는 finish 커밋으로 흡수하지 않는다`, () => {
  const { f, worktree, run, dir } = mergeFixture(phase === "check" ? "node check.mjs" : "true", phase === "security" ? "node check.mjs" : "true");
  writeFileSync(join(worktree, "outside.txt"), "synthetic-before");
  writeFileSync(join(worktree, "check.mjs"), 'import {writeFileSync} from "node:fs"; import {execFileSync} from "node:child_process"; writeFileSync("outside.txt","synthetic-after"); execFileSync("git",["add","--","outside.txt"]);');
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-check-side-effect").status, 0);
  const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
  const finish = run("project", "finish", "P001"); assert.notEqual(finish.status, 0); assert.match(finish.stdout + finish.stderr, phase === "check" ? /검사 뒤 staged\/unstaged/ : /보안 검사\/의존성 감사 뒤 자료/);
  assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, head); assert.equal(f.git("-C", worktree, "show", "HEAD:outside.txt").stdout, "synthetic-before");
  assert.equal(f.git("-C", worktree, "show", ":outside.txt").stdout, "synthetic-after"); assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
});
test("R25 반복 지적 산출기가 읽은 ignored TASK-CLOSE도 최종 Git 입력으로 추적한다", () => {
  const { f, worktree, run, dir } = mergeFixture(), task = join(dir, "tasks/T99_synthetic"); mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "TASK-CLOSE.md"), "## 리뷰\n\nblocking 2\n\n## 남긴 것\n\n없음\n");
  const rel = `projects/${dir.split("/").at(-1)}/tasks/T99_synthetic/TASK-CLOSE.md`; writeFileSync(join(worktree, ".gitignore"), `${rel}\n`);
  const retroPath = join(dir, "TEAM-RETROSPECTIVE.json"), retro = JSON.parse(readFileSync(retroPath, "utf8")); retro.recurringFindings = [{ code: "review-blocking", count: 2, coverage: "reported", refs: ["proof.json"] }]; writeFileSync(retroPath, JSON.stringify(retro));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-ignored-insight-source").status, 0);
  const held = run("project", "finish", "P001"); assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /Git 인덱스에 없다.*TASK-CLOSE/);
  assert.equal(f.git("-C", worktree, "add", "-f", "--", rel).status, 0);
  assert.equal(f.git("-C", worktree, "add", "--", join(dir, "log.jsonl")).status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-record-insight-source").status, 0);
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
});
for (const scenario of ["wrong-request", "answer-first", "verified-answer"] as const) test(`R25 ignored 답 영수증은 실제 판정에 쓰일 때만 finish 필수 입력이다 (${scenario})`, () => {
  const { f, worktree, run, dir } = mergeFixture();
  const ref = "irrelevant-answer.json", requestId = "actual-question";
  const outOfOrder = scenario === "answer-first", used = scenario === "verified-answer";
  writeFileSync(join(dir, ref), JSON.stringify({ version: 1, kind: "team-evidence", purposes: ["owner-answer"], sourceRef: "fixture:answer", hash: digest("synthetic answer"), requestId: scenario === "wrong-request" ? "different-question" : requestId }));
  const now = Date.now();
  const question = { ts: new Date(now).toISOString(), p: "P001", type: "question", by: "agent", to: "owner", requestId, msg: "synthetic question" } as const;
  const answer = { ts: new Date(now + (outOfOrder ? 0 : 1)).toISOString(), p: "P001", type: "answer", by: "user", requestId, ref, msg: "synthetic answer report" } as const;
  for (const event of outOfOrder ? [answer, question] : [question, answer]) recordEvent(dir, event);
  writeFileSync(join(worktree, ".gitignore"), `projects/${dir.split("/").at(-1)}/${ref}\n`);
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-unaccepted-proof").status, 0);
  const stats = JSON.parse(run("project", "stats", "P001", "--json").stdout); assert.equal(stats.team.requests.ownerReply, used ? 1 : 0); assert.equal(stats.team.requests.unconfirmed, used ? 0 : 1);
  const finished = run("project", "finish", "P001");
  if (used) {
    assert.notEqual(finished.status, 0);
    assert.match(finished.stderr + finished.stdout, /Git 인덱스에 없다.*irrelevant-answer\.json/);
  } else assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  assert.equal(f.git("-C", worktree, "ls-files", "--", `projects/${dir.split("/").at(-1)}/${ref}`).stdout, "");
});

test("R27 같은 시도 실패만 완료를 취소하고 다른 시도·태스크·프로젝트·legacy 기록은 보존한다", () => {
  const f = fixture(), path = join(f.dir, "PROJECT.md"); writeFileSync(path, readFileSync(path, "utf8").replace(/- 상태: .*/, "- 상태: 병합 대기"));
  assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "chore(P001): 마감").status, 0);
  const a = `finish:${"a".repeat(24)}`, b = `finish:${"b".repeat(24)}`, one = "2026-01-01T00:00:00Z", two = "2026-01-02T00:00:00Z", three = "2026-01-03T00:00:00Z";
  type CaseEvent = { ts: string; ok: boolean; src?: string; project?: string; task?: string };
  const get = (events: CaseEvent[]) => {
    writeFileSync(join(f.dir, "log.jsonl"), "");
    for (const e of events) recordMetric(f.dir, { project: "P001", cmd: "finish", ...e });
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).project;
  };
  const success = { ts: one, ok: true, src: a }, failed = { ts: three, ok: false, src: a };
  let r = get([success, failed]); assert.equal(r.finish, null, "Git 마감 메시지 근사로 취소된 성공을 되살리지 않는다"); assert.equal(r.gateFailures, 1);
  assert.equal(get([success, { ts: two, ok: true, src: b }, failed]).finish, two);
  assert.equal(get([success, { ...failed, src: b }]).finish, one);
  assert.equal(get([{ ts: one, ok: true }, { ts: two, ok: true, src: a }, failed]).finish, one);
  assert.equal(get([{ ts: one, ok: true }, { ts: three, ok: false }]).finish, one);
  assert.equal(get([success, { ...failed, task: "T01" }]).finish, one);
  assert.equal(get([success, { ...failed, project: "P002" }]).finish, one);
});

for (const mainDirect of [false, true]) test(`R27 입력 변경 실패는 동시 로그·다른 성공을 보존하고 자기 시도만 취소한다 (main=${mainDirect})`, () => {
  const fixture = mergeFixture(), f = fixture.f;
  let root = fixture.worktree, dir = fixture.dir;
  if (mainDirect) {
    assert.equal(f.git("merge", "--ff-only", "project/P001").status, 0);
    assert.equal(f.git("worktree", "remove", root).status, 0); assert.equal(f.git("branch", "-d", "project/P001").status, 0);
    root = f.root; dir = join(root, "projects", dir.split("/").at(-1)!);
  }
  const previous = new Date(Date.now() - 100).toISOString(), previousSource = `finish:${"b".repeat(24)}`;
  recordMetric(dir, { ts: previous, project: "P001", cmd: "finish", ok: true, src: previousSource });
  recordMetric(dir, { ts: new Date().toISOString(), project: "P001", cmd: "check", ok: false, reason: "checks" });
  assert.equal(f.git("-C", root, "add", "-A").status, 0); assert.equal(f.git("-C", root, "commit", "-qm", "synthetic-prior-finish").status, 0);
  const head = f.git("-C", root, "rev-parse", "HEAD").stdout;
  const log = join(dir, "log.jsonl"), injected = { ts: new Date().toISOString(), p: "P001", type: "gate", by: "cli", msg: "check: checks", ok: false, data: { check: 1 }, src: "fixture:concurrent" };
  const preload = join(tempDir("pace-finish-injection-"), "inject.mjs");
  writeFileSync(preload, `import cp from 'node:child_process'; import {appendFileSync} from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const original=cp.spawnSync; let fired=false; cp.spawnSync=function(command,args,options){if(!fired && command==='git' && args.includes('add') && args.includes(${JSON.stringify(join(dir, "METRICS.md"))})){fired=true;appendFileSync(${JSON.stringify(log)},${JSON.stringify(JSON.stringify(injected) + "\n")});}return original(command,args,options)};syncBuiltinESMExports();`);
  const finish = runPace(["project", "finish", "P001"], { cwd: root, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.notEqual(finish.status, 0); assert.match(finish.stdout + finish.stderr, /검증한 입력과 고정 Git tree/);
  assert.equal(f.git("-C", root, "rev-parse", "HEAD").stdout, head);
  const events = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(events.some((e) => e.src === "fixture:concurrent"));
  const own = events.find((e) => e.type === "gate" && e.ok && e.data?.finish === 1 && e.src !== previousSource);
  assert.match(own?.src ?? "", /^finish:[a-f0-9]{24}$/);
  assert.ok(events.some((e) => e.type === "gate" && !e.ok && e.data?.finish === 1 && e.src === own.src));
  const result = runPace(["project", "stats", "P001", "--json"], { cwd: root, home: f.home }); assert.equal(result.status, 0, result.stderr);
  const stats = JSON.parse(result.stdout); assert.equal(stats.project.finish, previous); assert.equal(stats.project.gateFailures, 3);
});

test("R27 커밋 뒤 tree 불일치도 로그와 생성 커밋을 보존하고 성공 완료만 취소한다", () => {
  const { f, worktree, dir } = mergeFixture(), log = join(dir, "log.jsonl"), preload = join(tempDir("pace-post-commit-injection-"), "inject.mjs");
  const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
  writeFileSync(preload, `import cp from 'node:child_process'; import {writeFileSync} from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const original=cp.spawnSync; let fired=false; cp.spawnSync=function(command,args,options){const result=original(command,args,options);if(!fired && command==='git' && args.includes('update-ref') && args.includes('commit: chore(P001): 마감') && result.status===0){fired=true;writeFileSync(${JSON.stringify(join(worktree, "concurrent.txt"))},'SYNTHETIC concurrent commit'); original('git',['-C',${JSON.stringify(worktree)},'add','--','concurrent.txt'],options);original('git',['-C',${JSON.stringify(worktree)},'commit','-qm','synthetic-concurrent-commit'],options);}return result};syncBuiltinESMExports();`);
  const finish = runPace(["project", "finish", "P001"], { cwd: worktree, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.notEqual(finish.status, 0); assert.match(finish.stdout + finish.stderr, /마감 커밋 중 입력\/tree/); assert.notEqual(f.git("-C", worktree, "rev-parse", "HEAD").stdout, head);
  assert.equal(f.git("-C", worktree, "show", "HEAD:concurrent.txt").stdout, "SYNTHETIC concurrent commit");
  const events = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)), own = events.find((e) => e.type === "gate" && e.ok && e.data?.finish === 1);
  assert.ok(own); assert.ok(events.some((e) => !e.ok && e.data?.finish === 1 && e.src === own.src));
  const result = runPace(["project", "stats", "P001", "--json"], { cwd: worktree, home: f.home }); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).project.finish, null);
});

test("R27 검증 내용 지문은 나중 작업 파일/인덱스 대신 고정 tree와 대조한다", () => {
  const f = fixture(), path = join(f.dir, "proof.json"); writeFileSync(path, "synthetic-before\r\n");
  assert.equal(f.git("add", "-A").status, 0); const tree = f.git("write-tree").stdout.trim();
  const snapshot = new InputSnapshot(); snapshot.record(path, inputHash(readFileSync(path)));
  const adapter = (args: string[], env: Record<string, string> = {}) => spawnSync("git", ["-C", f.root, ...args], { encoding: "utf8", env: { ...sessionFreeEnv(), ...env } });
  writeFileSync(path, "synthetic-after\n"); assert.equal(f.git("add", "-A").status, 0);
  assert.doesNotThrow(() => assertTeamFinishInputs(f.root, snapshot, adapter, tree));
  assert.throws(() => assertTeamFinishInputs(f.root, snapshot, adapter, f.git("write-tree").stdout.trim()), /검증한 입력과 고정 Git tree/);
  assert.throws(() => snapshot.record(path, inputHash(readFileSync(path))), /검증 중 입력/); assert.throws(() => snapshot.files, /검증 중 입력/); assert.equal(inputHash("same\r\n"), inputHash("same\n"));
});

test("R27 사용자 답은 최초 요청뿐 아니라 직접 참조한 중계 제안 뒤여야 한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = "relay-clock";
  store.record({ protocol: "pace-handoff", v: 1, id: "root-clock", kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC proposal");
  store.record({ protocol: "pace-handoff", v: 1, id: "relay-clock", kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false, relayOf: "root-clock" } }, "SYNTHETIC proposal");
  store.record({ protocol: "pace-handoff", v: 1, id: "reply-clock", kind: "decision_reply", from: "owner", to: "coordinator", requestId, data: { re: "relay-clock", decision: "approve", proposalHash: proposalDigest(store.read()[1]!), sourceRef: "fixture:clock-answer" } }, "SYNTHETIC answer");
  const rows = store.read(); rows[0]!.at = "2026-01-02T10:00:00Z"; rows[1]!.at = "2026-01-02T12:00:00Z"; rows[2]!.at = "2026-01-02T11:00:00Z";
  writeFileSync(join(f.dir, "clock.json"), JSON.stringify({ version: 1, kind: "team-evidence", purposes: ["owner-answer"], sourceRef: "fixture:clock-answer", hash: digest("synthetic"), requestId, decisionReplyId: "reply-clock" }));
  recordEvent(f.dir, { ts: "2026-01-02T11:30:00Z", p: "P001", type: "answer", by: "user", requestId, ref: "clock.json", msg: "synthetic time contradiction" });
  const get = () => { writeFileSync(store.path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const held = get(); assert.equal(held.team.requests.ownerReply, 0); assert.equal(held.team.requests.unconfirmed, 1); assert.equal(held.handoffs.requests.owner_reply, 1, "미채택 legacy 조회를 보존한다");
  rows[2]!.at = "2026-01-02T13:00:00Z"; assert.equal(get().team.requests.ownerReply, 1);
});

test("R27 불완전한 리뷰 로그는 TASK-CLOSE의 반복 지적을 지우지 않고 미확인으로 표시한다", () => {
  const { f, worktree, run, dir } = mergeFixture(), task = join(dir, "tasks/T99_synthetic"); mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "TASK-CLOSE.md"), "## 리뷰\n\nblocking 2\n\n## 남긴 것\n\n없음\n");
  recordEvent(dir, { ts: new Date().toISOString(), p: "P001", t: "T99", type: "review", by: "agent", msg: "reviewer fail" });
  let stats = JSON.parse(run("project", "stats", "P001", "--json").stdout);
  assert.equal(stats.improvements.find((i: { code: string }) => i.code === "blocking")?.count, 2); assert.equal(stats.team.quality.blockingLogged, null);
  assert.ok(stats.improvements.some((i: { code: string }) => i.code === "리뷰 기록 수치 미확인"));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-incomplete-review").status, 0);
  const held = run("project", "finish", "P001"); assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /반복 지적/);
  const retroPath = join(dir, "TEAM-RETROSPECTIVE.json"), retro = JSON.parse(readFileSync(retroPath, "utf8")); retro.recurringFindings = [{ code: "review-blocking", count: 2, coverage: "reported", refs: ["proof.json"] }]; writeFileSync(retroPath, JSON.stringify(retro));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-known-fallback").status, 0);
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  stats = JSON.parse(run("project", "stats", "P001", "--json").stdout); assert.equal(stats.reviews.find((r: { task: string }) => r.task === "T99")?.blocking, 2);
});

for (const adoptedOnBase of [false, true]) test(`R27 보안 검사와 기준 브랜치의 팀 채택을 첫 커밋 전에 검사한다 (기준 채택=${adoptedOnBase})`, () => {
  const { f, worktree, run, dir } = mergeFixture("true", "node check.mjs", false), rel = `projects/${dir.split("/").at(-1)}`;
  writeFileSync(join(worktree, "outside.txt"), "synthetic-before");
  writeFileSync(join(worktree, "check.mjs"), 'import {writeFileSync} from "node:fs"; import {execFileSync} from "node:child_process"; writeFileSync("outside.txt","synthetic-after"); execFileSync("git",["add","--","outside.txt"]);');
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-initial-legacy").status, 0);
  if (adoptedOnBase) {
    adoptTeamMetrics(f.root, rel);
    assert.equal(f.git("add", "-A").status, 0);
    assert.equal(f.git("commit", "-qm", "synthetic-main-adoption").status, 0);
  }
  const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
  const result = run("project", "finish", "P001");
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, adoptedOnBase ? /기준 브랜치에만 팀 채택 이력이 있다/ : /보안 검사\/의존성 감사 뒤 자료/);
  assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, head);
  assert.equal(f.git("-C", worktree, "show", "HEAD:outside.txt").stdout, "synthetic-before");
  assert.equal(f.git("-C", worktree, "show", ":outside.txt").stdout, adoptedOnBase ? "synthetic-before" : "synthetic-after");
});

test("R27 기존 slash 리뷰 구분자는 허용하고 분수·소수·중복은 거부한다", () => {
  assert.equal(reviewMessageData("reviewer pass blocking 0/should_fix 0").blocking, 0);
  for (const msg of ["reviewer pass blocking 1/2 should_fix 0", "reviewer pass blocking 1.2 should_fix 0", "reviewer pass blocking 1 blocking 2 should_fix 0"]) assert.throws(() => reviewMessageData(msg));
});

test("R27 통합 불변식은 같은 요청의 로그/원장부터 비교·회고·Git 마감까지 이어진다", () => {
  const { f, worktree, run, dir } = mergeFixture(), rel = `projects/${dir.split("/").at(-1)}`, store = new HandoffStore(worktree, "P001", rel);
  const nativeStart = JSON.parse(run("project", "stats", "P001", "--json").stdout).project.start, startMs = Date.parse(nativeStart);
  const before: unknown[] = [], after: unknown[] = [];
  let lastInput: Record<string, unknown> = {}, lastRequest = "", lastPeriodStart = 0;
  for (let i = 0; i < 4; i++) {
    const low = startMs + i * 10 + 1, requestId = `invariant-${i}`, message = `invariant-message-${i}`;
    const period = { start: new Date(low).toISOString(), end: new Date(low + 8).toISOString(), unit: "representative-task", closed: true, completionRef: `frame-${i}.json` };
    assert.ok(Date.parse(period.end) < Date.now(), "합성 고정 구간은 실제 조회 시각보다 앞선다");
    store.record({ protocol: "pace-handoff", v: 1, id: message, kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC invariant question");
    const route = { transport: "external", actor: "owner", target: "synthetic-route", from: "coordinator", sourceRef: "fixture:invariant-route" };
    prepareDelivery(store, message, `invariant-attempt-${i}`, route);
    deliveryReceipt(store, `invariant-attempt-${i}`, { phase: i < 2 ? "sent" : "failed", reportedBy: "coordinator", sourceRef: route.sourceRef, ...(i < 2 ? { responseId: `synthetic-message-${i}`, responseHash: digest(`synthetic-receipt-${i}`) } : {}) });
    const rows = store.read();
    for (const row of rows.filter((r) => r.requestId === requestId)) row.at = new Date(low + (row.kind === "decision_request" ? 1 : row.data.phase === "started" ? 3 : 4)).toISOString();
    writeFileSync(store.path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const mirror = `mirror-${i}.json`;
    writeFileSync(join(dir, mirror), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: `handoff:${message}`, hash: rows.find((r) => r.id === message)!.bodyHash, requestId }));
    for (let j = 0; j < 2; j++) recordEvent(dir, { ts: new Date(low + 1 + j).toISOString(), p: "P001", type: "question", by: "agent", to: "owner", requestId, ref: mirror, msg: `synthetic same request ${j}` });
    receipt(dir, period.completionRef, period);
    const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
    const counts = Object.fromEntries(MANUAL_KEYS.map((key) => [key, key === "owner_file_edits" ? i < 2 ? 2 : 1 : 0]));
    lastInput = { version: 1, period, counts, coverage: Object.fromEntries(MANUAL_KEYS.map((key) => [key, coverage])), request_coverage: coverage, log_coverage: coverage, quality_audit: { blocking_sum: 0, rereviews_after_fail: 0, coverage }, comparison: { study: "team-adoption", conditionCode: i < 2 ? "no-team" : "team", definition: "reach-v1", unit: period.unit, workType: "feature", sizeBand: "small", host: "codex", recordingBoundary: "closed-task", qualitySource: "event-log", qualityScopeHash: digest("synthetic-invariant-quality") } };
    writeFileSync(join(dir, "TEAM-MEASUREMENT.json"), JSON.stringify(lastInput));
    confirmRequestInput(dir, run);
    const measured = run("project", "stats", "P001", "--json"); assert.equal(measured.status, 0, measured.stderr); const stats = JSON.parse(measured.stdout);
    assert.equal(stats.team.requests.linked, 1); assert.equal(stats.team.requests.ownerQuestionEvents, 2); assert.equal(stats.team.requests.ownerIntendedRequests, 1);
    assert.equal(stats.team.requests.reachedTotal, i < 2 ? 1 : 0); assert.equal(stats.team.requests.failedOnly, i < 2 ? 0 : 1);
    assert.equal(stats.team.snapshot.unknown.request_events, i < 2 ? 0 : 1);
    (i < 2 ? before : after).push(stats.team.snapshot); lastRequest = requestId; lastPeriodStart = low;
  }
  const beforePath = join(dir, "invariant-before.json"), afterPath = join(dir, "invariant-after.json");
  writeFileSync(beforePath, JSON.stringify({ version: 1, samples: before })); writeFileSync(afterPath, JSON.stringify({ version: 1, samples: after }));
  const compare = () => { const r = run("project", "compare-team", "--before", beforePath, "--after", afterPath, "--kind", "team-adoption", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  let result = compare(); assert.equal(result.conclusion, "unknown"); assert.equal(result.rows.find((r: { metric: string }) => r.metric === "owner_questions").delta, -2); assert.match(result.reasons.join(" "), /실패만 남은/);
  writeFileSync(join(dir, "wrong-answer.json"), JSON.stringify({ version: 1, kind: "team-evidence", purposes: ["owner-answer"], sourceRef: "fixture:wrong-request", hash: digest("synthetic contradiction"), requestId: "different-request" }));
  recordEvent(dir, { ts: new Date(lastPeriodStart + 6).toISOString(), p: "P001", type: "answer", by: "user", requestId: lastRequest, ref: "wrong-answer.json", msg: "synthetic contradictory receipt" });
  writeFileSync(join(dir, "TEAM-MEASUREMENT.json"), JSON.stringify(lastInput));
  const current = JSON.parse(run("project", "stats", "P001", "--json").stdout);
  assert.equal(current.team.requests.linked, 1); assert.equal(current.team.requests.unconfirmed, 1); assert.equal(current.team.requests.reachedTotal, null); assert.equal(current.team.snapshot.counts.owner_questions, null);
  after[1] = current.team.snapshot; writeFileSync(afterPath, JSON.stringify({ version: 1, samples: after })); result = compare(); assert.equal(result.conclusion, "unknown");
  assert.equal(run("project", "stats", "P001", "--write").status, 0); assert.match(readFileSync(join(dir, "METRICS.md"), "utf8"), /비교 미해결 1/);
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-invariant-flow").status, 0);
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, "TEAM-FINISH.json"), "utf8")).kind, "pace-team-finish"); assert.doesNotMatch(f.git("-C", worktree, "ls-files").stdout, /bodies\//);
});

for (const phase of ["sent", "failed"] as const) test(`R27 요청→전달 시작→${phase} 선후를 한 판정에서 대조하고 실패 관측은 보존한다`, () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = `attempt-clock-${phase}`;
  store.record({ protocol: "pace-handoff", v: 1, id: "clock-message", kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC clock request");
  const route = { transport: "external", actor: "owner", target: "synthetic-route", from: "coordinator", sourceRef: "fixture:clock-route" };
  prepareDelivery(store, "clock-message", "clock-attempt", route);
  deliveryReceipt(store, "clock-attempt", { phase, reportedBy: "coordinator", sourceRef: route.sourceRef, ...(phase === "sent" ? { responseId: "synthetic-sent", responseHash: digest("synthetic sent receipt") } : {}) });
  const rows = store.read(); for (const row of rows) row.at = row.kind === "decision_request" ? "2026-01-02T10:00:00Z" : row.data.phase === "started" ? "2026-01-02T12:00:00Z" : "2026-01-02T11:00:00Z";
  const get = () => { writeFileSync(store.path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const held = get(); assert.equal(held.team.requests.ownerDelivery, 0); assert.equal(held.team.requests.failedOnly, 0); assert.equal(held.team.requests.unconfirmed, 1); assert.equal(held.team.requests.failedAttemptsObserved, phase === "failed" ? 1 : 0);
  for (const row of rows) if (row.kind === "delivery" && row.data.phase === phase) row.at = "2026-01-02T13:00:00Z";
  const valid = get(); assert.equal(valid.team.requests.unconfirmed, 0); assert.equal(valid.team.requests.ownerDelivery, phase === "sent" ? 1 : 0); assert.equal(valid.team.requests.failedOnly, phase === "failed" ? 1 : 0);
});

test("R27 예시 marker는 legacy 문서에 Team 문법을 소급하지 않고 실제 모호한 marker만 보류한다", () => {
  const f = fixture(), path = join(f.dir, "PROJECT.md");
  const example = "# Legacy\n\n- 상태: 정의\n\n  ## historical heading\n\n```md\n- 팀 측정: v1\n```\n\n## 목적\n\nlegacy example\n";
  writeFileSync(path, example); const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).team, undefined);
  writeFileSync(path, example.replace("```md", "- 팀 측정: v1\n\n```md"));
  const bodyMarker = f.run("project", "stats", "P001", "--json");
  assert.equal(bodyMarker.status, 2); assert.match(bodyMarker.stderr + bodyMarker.stdout, /열0/);
  writeFileSync(path, "  # ambiguous title\n\n- 팀 측정: v1\n\n## 목적\n");
  assert.notEqual(f.run("project", "stats", "P001", "--json").status, 0);
});

test("R27 finish와 Git merge는 동일한 채택 판정을 쓰며 review의 버전 숫자를 start로 오인하지 않는다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false);
  const msg = "reviewer pass blocking 0 should_fix 0";
  const log = join(dir, "log.jsonl");
  const legacyRow = { ts: new Date().toISOString(), p: "P001", type: "review", by: "agent", msg, data: { ...reviewMessageData(msg), teamMetricsVersion: 1 } };
  writeFileSync(log, readFileSync(log, "utf8") + JSON.stringify(legacyRow) + "\n");
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-non-start-version").status, 0);
  assert.equal(JSON.parse(run("project", "stats", "P001", "--json").stdout).team, undefined);
  const finish = run("project", "finish", "P001"); assert.equal(finish.status, 0, finish.stdout + finish.stderr); assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
  const preview = f.run("project", "merge", "P001"); assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  const merged = f.run("project", "merge", "P001", "--yes"); assert.equal(merged.status, 0, merged.stdout + merged.stderr);
});

test("R27 stats도 같은 영수증을 읽는 중 바뀌면 새 확인을 0 총량으로 승격하지 않는다", () => {
  const f = fixture(), frame = join(f.dir, "changing-frame.json"), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "changing-frame.json" };
  receipt(f.dir, "changing-frame.json", period); const correct = readFileSync(frame, "utf8"), old = JSON.parse(correct); old.period.end = "2026-01-01T12:00:00Z"; writeFileSync(frame, JSON.stringify(old));
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "changing-frame.json", refs: ["changing-frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage }));
  const preload = join(tempDir("pace-proof-injection-"), "inject.mjs");
  writeFileSync(preload, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const original=fs.openSync; let reads=0; fs.openSync=function(path,...rest){if(String(path)===${JSON.stringify(frame)} && ++reads===2)fs.writeFileSync(path,${JSON.stringify(correct)});return original(path,...rest)};syncBuiltinESMExports();`);
  const changed = runPace(["project", "stats", "P001", "--json"], { cwd: f.root, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.notEqual(changed.status, 0); assert.match(changed.stdout + changed.stderr, /검증 중 입력이 바뀌었다/); assert.equal(readFileSync(frame, "utf8"), correct);
  confirmRequestInput(f.dir, f.run);
  const stable = f.run("project", "stats", "P001", "--json"); assert.equal(stable.status, 0, stable.stderr); assert.equal(JSON.parse(stable.stdout).team.requests.reachedTotal, 0);
});

for (const change of ["new-role", "new-input", "new-task-close", "new-review-ledger"] as const) test(`R27 없던 입력/목록이 검증 뒤 Git에 추가돼도 봉인하지 않고 보존한다: ${change}`, () => {
  const { f, worktree, dir } = mergeFixture(), rel = `projects/${dir.split("/").at(-1)}`;
  let path: string, body: string;
  if (change === "new-role") {
    createTeamMember(worktree, "late", "reviewer"); path = join(worktree, ".pace/team/agents/late.md"); body = readFileSync(path, "utf8"); unlinkSync(path);
  } else if (change === "new-input") {
    path = join(dir, "TEAM-MEASUREMENT.json"); unlinkSync(path); adoptTeamMetrics(worktree, rel); body = '{"version":999}';
  } else if (change === "new-review-ledger") {
    path = join(dir, "tasks/T99_late/evidence/REVIEW-LOG.jsonl");
    body = JSON.stringify({ type: "call", at: "2026-11-26T00:00:00Z", target: "impl.diff", kind: "goal", call_id: "late" });
  } else {
    path = join(dir, "tasks/T99_late/TASK-CLOSE.md"); mkdirSync(join(dir, "tasks/T99_late"), { recursive: true }); body = "## 리뷰\n\nblocking 2\n";
  }
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); const staged = f.git("-C", worktree, "diff", "--cached", "--quiet");
  if (staged.status !== 0) assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-pre-listing").status, 0);
  const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout, preload = join(tempDir("pace-new-input-injection-"), "inject.mjs");
  writeFileSync(preload, `import cp from 'node:child_process'; import {mkdirSync,writeFileSync} from 'node:fs'; import {dirname} from 'node:path'; import {syncBuiltinESMExports} from 'node:module'; const original=cp.spawnSync; let fired=false; cp.spawnSync=function(command,args,options){if(!fired && command==='git' && args.includes('add') && args.includes(${JSON.stringify(join(dir, "METRICS.md"))})){fired=true;mkdirSync(dirname(${JSON.stringify(path)}),{recursive:true});writeFileSync(${JSON.stringify(path)},${JSON.stringify(body)});original('git',['-C',${JSON.stringify(worktree)},'add','--',${JSON.stringify(path)}],options);}return original(command,args,options)};syncBuiltinESMExports();`);
  const finished = runPace(["project", "finish", "P001"], { cwd: worktree, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.notEqual(finished.status, 0); assert.match(finished.stdout + finished.stderr, change === "new-input" ? /검증 때 없던 입력/ : /검증 입력 목록/);
  assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, head); assert.equal(readFileSync(path, "utf8"), body);
  const gitPath = path.slice(worktree.length + 1).replaceAll("\\", "/"); assert.equal(f.git("-C", worktree, "show", `:${gitPath}`).stdout, body);
  const log = readFileSync(join(dir, "log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)), own = log.find((e) => e.ok && e.data?.finish === 1);
  assert.ok(own); assert.ok(log.some((e) => !e.ok && e.data?.finish === 1 && e.src === own.src));
});
test("R24 팀 없는 기존 프로젝트의 동명 심볼릭 링크는 finish와 merge를 막지 않는다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false);
  symlinkSync("proof.json", join(dir, "TEAM-FINISH.json"));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-legacy-link").status, 0);
  const finish = run("project", "finish", "P001"); assert.equal(finish.status, 0, finish.stdout + finish.stderr);
  const preview = f.run("project", "merge", "P001"); assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  const merge = f.run("project", "merge", "P001", "--yes"); assert.equal(merge.status, 0, merge.stdout + merge.stderr);
});

import { assertTeamFinishInputs, checkedTeamTarget, writeTeamFinish } from "../src/project/team-finish.ts";
test("R23 팀 finish tree 계산은 실제 인덱스를 보존하고 Git 대상과 다른 작업 파일을 읽지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel);
  assert.equal(f.git("add", "-A").status, 0);
  const adapter = (args: string[], env: Record<string, string> = {}) => spawnSync("git", ["-C", f.root, ...args], { encoding: "utf8", env: { ...sessionFreeEnv(), ...env } });
  writeTeamFinish(f.root, rel, "P001", adapter); assert.equal(f.git("commit", "-qm", "synthetic-seal").status, 0);
  const target = f.git("rev-parse", "HEAD").stdout.trim(), index = readFileSync(join(f.root, ".git/index"));
  writeFileSync(join(f.dir, "PROJECT.md"), "synthetic live file differs from committed target");
  assert.deepEqual(checkedTeamTarget(rel, "P001", target, adapter), { target, checkStatus: "not-run" });
  assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
  assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "synthetic-amended-content").status, 0);
  assert.throws(() => checkedTeamTarget(rel, "P001", f.git("rev-parse", "HEAD").stdout.trim(), adapter), /finish 뒤 내용/);
});
test("R23 팀 finish는 기존 다른 소유자의 파일을 덮어쓰지 않고 팀 없는 프로젝트에 소급하지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, path = join(f.dir, "TEAM-FINISH.json"), foreign = '{"foreign":"synthetic"}\n';
  writeFileSync(path, foreign); assert.equal(f.git("add", "-A").status, 0); assert.equal(f.git("commit", "-qm", "synthetic-foreign-file").status, 0);
  const adapter = (args: string[], env: Record<string, string> = {}) => spawnSync("git", ["-C", f.root, ...args], { encoding: "utf8", env: { ...sessionFreeEnv(), ...env } });
  assert.throws(() => writeTeamFinish(f.root, rel, "P001", adapter)); assert.equal(readFileSync(path, "utf8"), foreign);
  assert.equal(checkedTeamTarget(rel, "P001", f.git("rev-parse", "HEAD").stdout.trim(), adapter), undefined);
});

test("R23 실패만 남은 요청은 도달 감소를 개선으로 승격하지 않고 성공 재시도 결과와 구별한다", () => {
  const f = compareFixture(); f.b.counts.owner_questions = 1; f.a.counts.owner_questions = 0;
  f.a.counts.failed_only_owner_requests = 1; f.a.counts.failed_owner_delivery_attempts = 1; f.save();
  const held = f.compare(); assert.equal(held.conclusion, "unknown"); assert.match(held.reasons.join(" "), /실패만 남은/);
  f.a.counts.failed_only_owner_requests = 0; f.save(); assert.equal(f.compare().conclusion, "observed-burden-improvement");
  delete f.a.counts.failed_only_owner_requests; f.save(); assert.equal(f.compare().conclusion, "unknown");
});

test("R23 사용자 답변 영수증의 응답 ID·선언 구간 모순은 도달 근거가 아니다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel);
  const requestId = "receipt-contradiction", ts = "2026-01-02T12:00:00Z";
  recordEvent(f.dir, { ts: "2026-01-02T11:00:00Z", p: "P001", type: "question", by: "agent", to: "owner", requestId, msg: "synthetic request" });
  recordEvent(f.dir, { ts, p: "P001", type: "answer", by: "user", requestId, ref: "answer.json", msg: "synthetic answer" });
  const proof = { version: 1, kind: "team-evidence", purposes: ["owner-answer"], sourceRef: "fixture:answer", hash: digest("synthetic-answer"), requestId };
  const get = (extra: object) => { writeFileSync(join(f.dir, "answer.json"), JSON.stringify({ ...proof, ...extra })); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team.requests; };
  assert.equal(get({}).ownerReply, 1);
  assert.equal(get({ decisionReplyId: "not-a-real-reply" }).ownerReply, 0);
  assert.equal(get({ period: { start: "2026-02-01T00:00:00Z", end: "2026-02-02T00:00:00Z", unit: "project-start-to-merge" } }).ownerReply, 0);
  assert.equal(get({ period: { start: "2026-01-02T11:00:00Z", end: "2026-01-02T13:00:00Z", unit: "project-start-to-merge" } }).ownerReply, 1);
});
test("R24 영수증이 가리킨 실제 응답도 최초 요청 이전이면 도달 근거가 아니다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = "reply-time";
  store.record({ protocol: "pace-handoff", v: 1, id: "reply-time-q", kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC request");
  store.record({ protocol: "pace-handoff", v: 1, id: "reply-time-a", kind: "decision_reply", from: "owner", to: "coordinator", requestId, data: { re: "reply-time-q", decision: "approve", proposalHash: proposalDigest(store.read()[0]!), sourceRef: "fixture:answer" } }, "SYNTHETIC answer");
  const rows = store.read(); rows[0]!.at = "2026-01-02T11:00:00Z"; rows[1]!.at = "2026-01-02T11:30:00Z";
  writeFileSync(join(f.dir, "proof.json"), JSON.stringify({ version: 1, kind: "team-evidence", purposes: ["owner-answer"], sourceRef: "fixture:answer", hash: digest("synthetic"), requestId, decisionReplyId: "reply-time-a" }));
  recordEvent(f.dir, { ts: "2026-01-02T12:00:00Z", p: "P001", type: "answer", by: "user", requestId, ref: "proof.json", msg: "synthetic answer" });
  const get = () => { writeFileSync(store.path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n"); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team.requests; };
  assert.equal(get().ownerReply, 1); rows[1]!.at = "2026-01-02T10:00:00Z";
  assert.equal(get().ownerReply, 0); assert.equal(get().unconfirmed, 1);
});

test("R23 잘못된 링크 말미를 제목으로 숨기지 않고 유효한 인용 제목만 표시 이름에서 제외한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const check = (summary: string) => { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | ${summary} |\n`); return teamRetrospectiveIssues(f.root, rel); };
  for (const invalid of ['[범위](details.md <span>자료</span>)', '[범위](details.md "title" garbage)', '[범위](<nested<uri>>)', '[범위](details.md (nested(title)))']) assert.ok(check(invalid).length, invalid);
  for (const valid of ['[범위](details.md "<span>자료</span>")', "[범위](details.md 'title')", '[범위](details.md (title))', '[범위](<space in uri> "title")', '[범위](a_(b))']) assert.deepEqual(check(valid), [], valid);
});

test("닫힌 대표 업무의 다른 주체 확인은 신고 총량을 내고 자기 확인은 관측 하한만 낸다", () => {
  const f = fixture(); receipt(f.dir);
  const cov = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "proof.json", refs: ["proof.json"] };
  const input = { version: 1, comparison: { unit: "representative-task" }, period: { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "proof.json" }, counts: { owner_file_edits: 2 }, observed_counts: { owner_file_edits: 1 }, coverage: { owner_file_edits: cov } };
  const get = (bind = false) => { writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input)); if (bind) confirmRequestInput(f.dir, f.run); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team; };
  receipt(f.dir, "proof.json", input.period);
  Object.assign(input, { request_coverage: cov });
  assert.equal(get(true).requests.reachedTotal, 0);
  assert.equal(get().manual.fileEdits.total, 2); cov.verifiedBy = "agent:maker"; assert.equal(get().manual.fileEdits.total, null); assert.equal(get().manual.fileEdits.observed, 1);
});
test("비교 묶음은 신고 N·같은 구간 중복·겹침·조건 혼합으로 표본 수를 부풀리지 못한다", () => {
  const f = compareFixture(); f.save(1); assert.equal(f.compare().conclusion, "unknown");
  writeFileSync(f.before, JSON.stringify({ version: 1, samples: [f.b, f.b] })); assert.throws(() => f.compare(), /중복 표본/);
  const second = structuredClone(f.b); second.period.start = "2026-01-01T12:00:00Z"; second.period.end = "2026-01-03T00:00:00Z";
  writeFileSync(f.before, JSON.stringify({ version: 1, samples: [f.b, second] })); assert.throws(() => f.compare(), /겹치는/);
  second.comparison.host = "claude"; writeFileSync(f.before, JSON.stringify({ version: 1, samples: [f.b, second] })); assert.throws(() => f.compare(), /내부 비교 조건/);
});

test("전3×5·후2×6의 합계 감소는 표본 수가 달라 개선으로 판정하지 않는다", () => {
  const f = compareFixture();
  const group = (after: boolean, n: number) => ({ version: 1, samples: Array.from({ length: n }, (_, i) => {
    const s = snapshot("fixture-repo", after); for (const k of MANUAL_KEYS.slice(0, 4)) s.counts[k] = 0;
    Object.assign(s.counts, { owner_questions: after ? 6 : 5, blocking_sum_stats_events: 0, rereviews_after_fail: 0, gate_failures: 0 });
    s.period.start = new Date(Date.UTC(2026, after ? 1 : 0, i * 2 + 1)).toISOString(); s.period.end = new Date(Date.UTC(2026, after ? 1 : 0, i * 2 + 2)).toISOString(); s.period.completionRef = `sample-${after}-${i}.json`; receipt(f.dir, s.period.completionRef, s.period);
    s.completionProofSha256 = inputHash(readFileSync(join(f.dir, s.period.completionRef)));
    return s;
  }) });
  writeFileSync(f.before, JSON.stringify(group(false, 3))); writeFileSync(f.after, JSON.stringify(group(true, 2)));
  const r = f.compare(); assert.equal(r.rows.find((m) => m.metric === "owner_questions")?.delta, -3); assert.equal(r.conclusion, "unknown"); assert.match(r.reasons.join(" "), /전후 표본 수 불일치/);
});
test("전후 조건 이름만 바꾼 같은 구간·대표 업무 완료 근거 누락은 미확인이다", () => {
  const f = compareFixture(); const b = JSON.parse(readFileSync(f.before, "utf8")), a = JSON.parse(readFileSync(f.after, "utf8"));
  for (let i = 0; i < 2; i++) a.samples[i].period = b.samples[i].period;
  writeFileSync(f.after, JSON.stringify(a)); assert.match(f.compare().reasons.join(" "), /전후 측정 구간 중복/);
  f.save(); const missing = JSON.parse(readFileSync(f.after, "utf8")); for (const s of missing.samples) delete s.period.completionRef;
  writeFileSync(f.after, JSON.stringify(missing)); assert.equal(f.compare().conclusion, "unknown"); assert.match(f.compare().reasons.join(" "), /닫힌 비교 구간/);
});

test("최신 스냅샷 주석 덮어쓰기와 묶음의 같은 끝/시작 경계를 거부한다", () => {
  const f = compareFixture(); writeFileSync(f.before, JSON.stringify(f.b));
  const annotation = join(f.dir, "modern-annotation.json"); writeFileSync(annotation, JSON.stringify({ version: 1, sourceSha256: digest(readFileSync(f.before)), sourceRef: "fixture:modern-override", comparison: f.a.comparison }));
  assert.throws(() => compareTeam(f.before, f.after, "team-adoption", annotation), /legacy 원본에만/);
  const second = structuredClone(f.b); second.period.start = f.b.period.end; second.period.end = "2026-01-03T00:00:00Z";
  writeFileSync(f.before, JSON.stringify({ version: 1, samples: [f.b, second] })); assert.throws(() => f.compare(), /겹치는 측정 구간/);
});
test("미사용 observed-none 신고에는 범위 영수증이 필요하고 unconfirmed는 삭제 증거가 아니다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 범위 |\n");
  const data = { version: 1, metricRef: "METRICS.md", unusedRoles: [{ role: "maker", coverage: "observed-none", refs: [] as string[] }], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" };
  const save = () => writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify(data)); save(); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true }; roleReceipt(f.dir, "proof.json", period, "maker", "none");
  data.unusedRoles[0]!.refs = ["proof.json"]; save(); assert.ok(teamRetrospectiveIssues(f.root, rel).length); assert.deepEqual(teamRetrospectiveIssues(f.root, rel, [], undefined, period), []);
});

test("회고에서 알려진 미사용 역할·반복 지적을 생략하거나 현재 횟수를 축소할 수 없다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); createTeamMember(f.root, "maker", "maker"); receipt(f.dir);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n");
  const data = { version: 1, metricRef: "METRICS.md", unusedRoles: [] as { role: string; coverage: string; refs: string[] }[], recurringFindings: [] as { code: string; count: number; coverage: string; refs: string[] }[], definitionChanges: [], noChangesReasonRef: "proof.json" };
  const save = () => writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify(data)); const known = [{ kind: "review", code: "blocking", count: 3 }];
  save(); assert.ok(teamRetrospectiveIssues(f.root, rel, known).length);
  data.unusedRoles.push({ role: "maker", coverage: "unconfirmed", refs: [] }); save(); assert.ok(teamRetrospectiveIssues(f.root, rel, known).length);
  data.recurringFindings.push({ code: "review-blocking", count: 2, coverage: "reported", refs: ["proof.json"] }); save(); assert.ok(teamRetrospectiveIssues(f.root, rel, known).length);
  data.recurringFindings[0]!.count = 3; save(); assert.deepEqual(teamRetrospectiveIssues(f.root, rel, known), []);
});
test("수기 project-start-to-merge closed만으로 완료 영수증 없이 비교를 승격하지 않는다", () => {
  const f = compareFixture(); for (const path of [f.before, f.after]) { const v = JSON.parse(readFileSync(path, "utf8")); for (const s of v.samples) { s.comparison.unit = "project-start-to-merge"; s.period.unit = "project-start-to-merge"; delete s.period.completionRef; } writeFileSync(path, JSON.stringify(v)); }
  const r = f.compare(); assert.equal(r.conclusion, "unknown"); assert.match(r.reasons.join(" "), /닫힌 비교 구간/);
});

test("팀 marker 활성화는 머리 필드를 사용해 후속 결정 메모 표의 연속성을 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel);
  const r = f.run("project", "log", "P001", "--type", "decision", "--by", "agent", "--src", "자체 판단", "--msg", "합성 결정 연속성"); assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(join(f.dir, "PROJECT.md"), "utf8"); assert.match(text.split("## 목적")[0]!, /^- 팀 측정: v1$/m);
  const notes = text.split("## 결정·진행 메모")[1]!; assert.doesNotMatch(notes, /팀 측정:/); assert.match(notes, /\| 정의 작성 \|\n\| .*합성 결정 연속성 \|/);
});

test("완료 영수증 한 장을 다른 표본 구간에 재사용하거나 비교 단위를 바꿀 수 없다", () => {
  const f = compareFixture(); const v = JSON.parse(readFileSync(f.after, "utf8"));
  v.samples[1].period.completionRef = v.samples[0].period.completionRef; writeFileSync(f.after, JSON.stringify(v));
  assert.equal(f.compare().conclusion, "unknown"); assert.match(f.compare().reasons.join(" "), /닫힌 비교 구간/);
  f.save(); const mixed = JSON.parse(readFileSync(f.after, "utf8")); mixed.samples[0].comparison.unit = "project-start-to-merge"; writeFileSync(f.after, JSON.stringify(mixed));
  assert.throws(() => f.compare(), /표본 구간 단위와 비교 단위 불일치/);
});

test("실제 source stats 스냅샷 네 개를 같은 정의/완료근거로 비교해 신고 부담 증감을 낸다", () => {
  const f = fixture(), before: unknown[] = [], after: unknown[] = [];
  for (const isAfter of [false, true]) for (let i = 0; i < 2; i++) {
    const period = { start: new Date(Date.UTC(2026, isAfter ? 1 : 0, i * 2 + 1)).toISOString(), end: new Date(Date.UTC(2026, isAfter ? 1 : 0, i * 2 + 2)).toISOString(), unit: "representative-task", closed: true, completionRef: `frame-${isAfter}-${i}.json` };
    receipt(f.dir, period.completionRef, period);
    const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
    const requestId = `absorbed-${isAfter}-${i}`; receipt(f.dir, "answer.json", period, requestId);
    const answerCoverage = { ...c, confirmationRef: "answer.json", refs: ["answer.json"] };
    recordEvent(f.dir, { ts: new Date(Date.parse(period.start) + 1000).toISOString(), p: "P001", type: "question", by: "agent", to: isAfter ? "coordinator" : "owner", requestId, msg: "synthetic controlled question" });
    recordEvent(f.dir, { ts: new Date(Date.parse(period.start) + 2000).toISOString(), p: "P001", type: "answer", by: isAfter ? "coordinator" : "user", requestId, ...(!isAfter ? { ref: "answer.json" } : {}), msg: "synthetic controlled answer" });
    const input = { version: 1, comparison: { ...snapshot().comparison, conditionCode: isAfter ? "team" : "no-team", sampleCount: 1 }, period, coordinator_answers: isAfter ? [{ requestId, coverage: answerCoverage }] : [], request_coverage: c, log_coverage: c, counts: { owner_manual_role_corrections: 0, owner_file_edits: isAfter ? 1 : 2, owner_command_runs: 0, coordinator_extra_instructions: 0 }, coverage: Object.fromEntries(MANUAL_KEYS.slice(0, 4).map((key) => [key, c])), quality_audit: { blocking_sum: 0, rereviews_after_fail: 0, coverage: c } };
    writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input)); confirmRequestInput(f.dir, f.run); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr);
    const team = JSON.parse(r.stdout).team; assert.equal(team.requests.unconfirmed, isAfter ? 1 : 0); assert.equal(team.requests.comparisonUnconfirmed, 0); assert.equal(team.requests.coordinatorOwnAnswerObserved, isAfter ? 1 : 0); assert.equal(team.requests.reachedTotal, isAfter ? 0 : 1);
    const s = team.snapshot; assert.equal(s.counts.owner_questions, isAfter ? 0 : 1); assert.equal(s.counts.owner_file_edits, isAfter ? 1 : 2); (isAfter ? after : before).push(s);
  }
  const unproven = JSON.parse(readFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), "utf8")); delete unproven.coordinator_answers; writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(unproven));
  const unknown = JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team; assert.equal(unknown.requests.reachedTotal, null); assert.equal(unknown.snapshot.unknown.request_events, 1);
  const b = join(f.dir, "synthetic-before.json"), a = join(f.dir, "synthetic-after.json"); writeFileSync(b, JSON.stringify({ version: 1, samples: before })); writeFileSync(a, JSON.stringify({ version: 1, samples: after }));
  const r = f.run("project", "compare-team", "--before", b, "--after", a, "--kind", "team-adoption", "--json"); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).conclusion, "observed-burden-improvement");
});

test("코디네이터 자체 답 신고는 수신미상·ref없는 사용자답·사용자의도·중계·pending전달·다른요청 영수증을 덮어쓰지 못한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; createTeamMember(f.root, "maker", "maker"); const store = new HandoffStore(f.root, "P001", rel);
  const ids = ["plain-own", "user-without-ref", "owner-intent", "owner-relay", "owner-pending", "wrong-proof", "owner-reply", "recipient-unknown", "bad-confirmation", "bad-refs"];
  const start = new Date(Date.now() - 10000).toISOString();
  for (const id of ids) {
    recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "question", by: "agent", to: id === "recipient-unknown" ? undefined : id === "owner-intent" ? "owner" : "coordinator", requestId: id, msg: "synthetic own claim question" });
    recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "coordinator", requestId: id, msg: "synthetic own claim answer" });
  }
  recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", requestId: "user-without-ref", msg: "synthetic user answer without receipt" });
  store.record({ protocol: "pace-handoff", v: 1, id: "relay-root", kind: "decision_request", from: "agent:maker", to: "coordinator", requestId: "owner-relay", data: { interpretation: false } }, "synthetic relay");
  store.record({ protocol: "pace-handoff", v: 1, id: "relay-owner", kind: "decision_request", from: "coordinator", to: "owner", requestId: "owner-relay", data: { interpretation: false, relayOf: "relay-root" } }, "synthetic relay");
  store.record({ protocol: "pace-handoff", v: 1, id: "pending-status", kind: "status", from: "coordinator", to: "owner", requestId: "owner-pending", data: {} }, "synthetic pending status");
  prepareDelivery(store, "pending-status", "pending-attempt", { transport: "external", actor: "owner", target: "synthetic-human-route", from: "coordinator", sourceRef: "fixture:pending-only-no-send" });
  receipt(f.dir, "owner-reply.json", undefined, "owner-reply");
  recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", requestId: "owner-reply", ref: "owner-reply.json", msg: "synthetic reported owner reply" });
  const period = { start, end: new Date().toISOString(), unit: "representative-task", closed: true, completionRef: "period.json" }; receipt(f.dir, period.completionRef, period);
  const coverage = (ref: string) => ({ status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: ref, refs: [ref] });
  for (const id of ids) receipt(f.dir, `${id}.json`, period, id === "wrong-proof" ? "plain-own" : id);
  const input = { version: 1, period, request_coverage: coverage("period.json"), coordinator_answers: ids.map((requestId) => { const c = coverage(`${requestId}.json`); if (requestId === "bad-confirmation") c.confirmationRef = "plain-own.json"; if (requestId === "bad-refs") c.refs = ["plain-own.json"]; return { requestId, coverage: c }; }) };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input));
  confirmRequestInput(f.dir, f.run);
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const data = JSON.parse(r.stdout), t = data.team;
  assert.equal(t.requests.linked, 10); assert.equal(t.requests.ownerReply, 1); assert.equal(t.requests.unconfirmed, 9); assert.equal(t.requests.coordinatorOwnAnswerObserved, 1); assert.equal(t.requests.comparisonUnconfirmed, 8); assert.equal(t.requests.reachedTotal, null); assert.equal(t.snapshot.unknown.request_events, 8);
  assert.equal(data.handoffs.requests.unconfirmed, 9, "BR01 원장 분류는 별도 축 보완으로 바꾸지 않는다");
  input.period.closed = false; writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input));
  const open = JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team; assert.equal(open.requests.comparisonUnconfirmed, 9); assert.equal(open.requests.reachedTotal, null);
  input.period.closed = true; input.request_coverage.status = "partial"; writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input));
  const partial = JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team; assert.equal(partial.requests.comparisonUnconfirmed, 9); assert.equal(partial.requests.reachedTotal, null);
});

test("구간 밖 나중 사용자 답은 과거 도달에 더하지 않고 자체 처리 신고의 확신만 철회한다", () => {
  const f = fixture(); const requestId = "late-owner-signal";
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "completion.json" }; receipt(f.dir, "completion.json", period); receipt(f.dir, "answer.json", period, requestId);
  recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "question", by: "agent", to: "coordinator", requestId, msg: "synthetic bounded question" });
  recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", type: "answer", by: "coordinator", requestId, msg: "synthetic own answer" });
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "completion.json", refs: ["completion.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c, coordinator_answers: [{ requestId, coverage: { ...c, confirmationRef: "answer.json", refs: ["answer.json"] } }] }));
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team; };
  confirmRequestInput(f.dir, f.run);
  assert.equal(get().requests.reachedTotal, 0);
  recordEvent(f.dir, { ts: "2026-01-03T01:00:00Z", p: "P001", type: "answer", by: "user", requestId, ref: "answer.json", msg: "synthetic later owner signal" });
  const t = get(); assert.equal(t.requests.reached, 0); assert.equal(t.requests.ownerReply, 0); assert.equal(t.requests.coordinatorOwnAnswerObserved, 0); assert.equal(t.requests.comparisonUnconfirmed, 1); assert.equal(t.requests.reachedTotal, null);
});

test("R7 무관한 PROJECT 파일은 팀 도달 증명이 아니며 옛 소통 집계는 유지한다", () => {
  const f = fixture(), ts = new Date().toISOString();
  recordEvent(f.dir, { ts, p: "P001", type: "question", by: "agent", to: "owner", requestId: "unrelated-ref", msg: "synthetic question" });
  recordEvent(f.dir, { ts, p: "P001", type: "answer", by: "user", requestId: "unrelated-ref", ref: "PROJECT.md", msg: "synthetic unrelated ref" });
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const data = JSON.parse(r.stdout);
  assert.equal(data.team.requests.ownerReply, 0); assert.equal(data.team.requests.unconfirmed, 1); assert.equal(data.handoffs.requests.owner_reply, 1, "미채택 legacy 조회를 보존한다");
  receipt(f.dir, "wrong-reply.json", undefined, "other-request");
  recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", requestId: "unrelated-ref", ref: "wrong-reply.json", msg: "synthetic wrong ID" });
  assert.equal(JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team.requests.ownerReply, 0);
  receipt(f.dir, "right-reply.json", undefined, "unrelated-ref");
  recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", requestId: "unrelated-ref", ref: "right-reply.json", msg: "synthetic linked reply" });
  assert.equal(JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team.requests.ownerReply, 1);
});
test("R7 다른 구간의 확인 영수증은 요청·손작업·품질 총량을 확정하지 않는다", () => {
  const f = fixture(), a = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" }, b = { start: "2026-01-03T00:00:00Z", end: "2026-01-04T00:00:00Z", unit: "representative-task", closed: true, completionRef: "b.json" };
  receipt(f.dir, "a.json", a); receipt(f.dir, "b.json", b); const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "a.json", refs: ["a.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period: b, request_coverage: c, log_coverage: c, counts: { owner_file_edits: 0 }, coverage: { owner_file_edits: c }, quality_audit: { blocking_sum: 0, rereviews_after_fail: 0, coverage: c } }));
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team;
  assert.equal(t.requests.reachedTotal, null); assert.equal(t.manual.fileEdits.total, null); assert.equal(t.quality.blockingAudited, null);
});
test("R7 손상된 사건 행을 지워진 질문0으로 승격하지 않는다", () => {
  const f = fixture(), period = { start: "2026-01-03T00:00:00Z", end: "2026-01-04T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c }));
  const path = join(f.dir, "log.jsonl"); writeFileSync(path, readFileSync(path, "utf8") + '{"ts":"2026-01-03T01:00:00Z","p":"P001","type":"question","by":"agent","to":"owner","msg":"synthetic broken"\n');
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 2); assert.equal(r.stdout, "");
  for (const row of ['{"ts":"2026-01-03T01:00:00Z","p":"P001","p":"P002","type":"question","by":"agent","msg":"synthetic duplicate"}', JSON.stringify({ ts: "2026-01-03T01:00:00Z", p: "P002", type: "question", by: "agent", msg: "synthetic foreign project" })]) { writeFileSync(path, row + "\n"); const bad = f.run("project", "stats", "P001", "--json"); assert.equal(bad.status, 2); assert.equal(bad.stdout, ""); }
});
test("R7 표본별 총량이 관측 하한보다 작으면 합계 이전에 거부한다", () => {
  const f = compareFixture(), v = JSON.parse(readFileSync(f.after, "utf8")); for (const s of v.samples) { s.counts.owner_questions = 0; s.observed_counts.owner_questions = 10; } writeFileSync(f.after, JSON.stringify(v));
  assert.throws(() => f.compare(), /관측|하한/);
});
test("R7 fenced code의 예시 표는 실제 팀 회고 표가 아니다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "## 회고\n\n```md\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 예시일뿐 |\n```\n");
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  assert.ok(teamRetrospectiveIssues(f.root, rel).length);
});
test("R7 팀 맥락 없는 기존 PROJECT 하드링크는 stats·회고 적용 판정을 바꾸지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; linkSync(join(f.dir, "PROJECT.md"), join(f.root, "legacy-project-copy.md"));
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.equal(Object.hasOwn(JSON.parse(r.stdout), "team"), false); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});
test("R7 다른 대표 업무의 역할 시작은 현재 미사용 검토 후보를 숨기지 않는다", () => {
  const f = fixture(); createTeamMember(f.root, "maker", "maker");
  recordEvent(f.dir, { ts: "2026-01-01T00:00:00Z", p: "P001", type: "start", by: "cli", msg: "synthetic past role start", role: { name: "maker", source: "option", definition: ".pace/team/maker.md", hash: digest("old role"), method: "prompt", model: "synthetic", settingsStatus: "planned", toolsPermissionApplied: false, runtimeObserved: false } });
  const period = { start: "2026-01-03T00:00:00Z", end: "2026-01-04T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period }));
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).team.unusedRoleCandidates[0]?.role, "maker");
});

test("R7 로그 미수집과 명시 빈 수집을 구별해 총량0 승격을 막는다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, comparison: { qualitySource: "event-log" }, period, request_coverage: c, log_coverage: c })); unlinkSync(join(f.dir, "log.jsonl"));
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team; };
  const missing = get(); assert.equal(missing.requests.reachedTotal, null); assert.equal(missing.snapshot.counts.blocking_sum, null); assert.match(missing.warnings.join(" "), /미수집/);
  writeFileSync(join(f.dir, "log.jsonl"), ""); confirmRequestInput(f.dir, f.run); const collected = get(); assert.equal(collected.requests.reachedTotal, 0); assert.equal(collected.snapshot.counts.blocking_sum, 0);
});
test("R7 코드 속 회고 heading·틸드/HTML 예시·bare 행은 표가 아니며 실제 표는 통과한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const body of [`\`\`\`md\n## 회고\n${table}\`\`\`\n`, `## 회고\n\n~~~md\n${table}~~~\n`, `## 회고\n\n<pre>\n${table}</pre>\n`, "## 회고\n\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | bare |\n"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), body); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});

test("R8 자체 답은 한 신고 행의 같은 근거가 요청과 구간을 함께 충족해야 한다", () => {
  const f = fixture(), id = "split-own", a = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" }, b = { start: "2026-01-03T00:00:00Z", end: "2026-01-04T00:00:00Z", unit: "representative-task", closed: true, completionRef: "global-b.json" };
  receipt(f.dir, "global-b.json", b); receipt(f.dir, "own-a.json", a, id); receipt(f.dir, "own-b.json", b, id); receipt(f.dir, "other-b.json", b, "other-request");
  recordEvent(f.dir, { ts: "2026-01-03T01:00:00Z", p: "P001", type: "question", by: "agent", to: "coordinator", requestId: id, msg: "synthetic question" });
  recordEvent(f.dir, { ts: "2026-01-03T02:00:00Z", p: "P001", type: "answer", by: "coordinator", requestId: id, msg: "synthetic own answer" });
  const cov = (confirmationRef: string, refs = [confirmationRef]) => ({ status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef, refs });
  const cases = [[{ requestId: id, coverage: cov("own-b.json", ["own-a.json", "other-b.json"]) }], [{ requestId: id, coverage: cov("other-b.json") }, { requestId: id, coverage: cov("own-a.json") }]];
  for (const claims of cases) { writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period: b, request_coverage: cov("global-b.json"), coordinator_answers: claims })); confirmRequestInput(f.dir, f.run); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team; assert.equal(t.requests.reachedTotal, null); assert.equal(t.requests.comparisonUnconfirmed, 1); }
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period: b, request_coverage: cov("global-b.json"), coordinator_answers: [...cases[1]!, { requestId: id, coverage: cov("own-b.json") }] }));
  confirmRequestInput(f.dir, f.run);
  const good = JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team; assert.equal(good.requests.reachedTotal, 0); assert.equal(good.requests.coordinatorOwnAnswerObserved, 1);
});
test("R8 코드 줄의 주석은 닫는 fence가 아니며 예시 회고를 활성화하지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const middle of ["``` <!-- comment -->\n", "``` <!--\nmultiline -->\n"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n\`\`\`md\n${middle}${table}\`\`\`\n`); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n<!-- separate comment -->\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});
test("R8 로그 미수집 품질은 직렬화된 비교에서도 null로 유지한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, comparison: { qualitySource: "event-log" }, period })); unlinkSync(join(f.dir, "log.jsonl"));
  const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); const path = join(f.dir, "missing-stats.json"); writeFileSync(path, result.stdout);
  const compared = compareTeam(path, path, "team-adoption"); assert.equal(compared.rows.find((r) => r.metric === "blocking_sum")?.before, null); assert.equal(compared.rows.find((r) => r.metric === "blocking_sum_stats_events")?.before, null);
});

test("R8 리뷰 수치 누락은 품질0이 아니라 미확인이며 부담 개선을 확정하지 않는다", () => {
  const f = fixture(), before: unknown[] = [], after: unknown[] = [];
  for (const isAfter of [false, true]) for (let i = 0; i < 2; i++) {
    const period = { start: new Date(Date.UTC(2026, isAfter ? 1 : 0, i * 2 + 1)).toISOString(), end: new Date(Date.UTC(2026, isAfter ? 1 : 0, i * 2 + 2)).toISOString(), unit: "representative-task", closed: true, completionRef: `quality-${isAfter}-${i}.json` }; receipt(f.dir, period.completionRef, period);
    if (isAfter) recordEvent(f.dir, { ts: new Date(Date.parse(period.start) + 1000).toISOString(), p: "P001", type: "review", by: "agent", msg: "reviewer fail blocking 2 should_fix 1" });
    const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
    writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, comparison: { ...snapshot().comparison, conditionCode: isAfter ? "team" : "no-team", sampleCount: 1 }, period, request_coverage: c, log_coverage: c, counts: { owner_manual_role_corrections: 0, owner_file_edits: isAfter ? 1 : 2, owner_command_runs: 0, coordinator_extra_instructions: 0 }, coverage: Object.fromEntries(MANUAL_KEYS.slice(0, 4).map((key) => [key, c])), quality_audit: { blocking_sum: 0, rereviews_after_fail: 0, coverage: c } }));
    confirmRequestInput(f.dir, f.run);
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); (isAfter ? after : before).push(JSON.parse(r.stdout).team.snapshot);
  }
  const b = join(f.dir, "quality-before.json"), a = join(f.dir, "quality-after.json"); writeFileSync(b, JSON.stringify({ version: 1, samples: before })); writeFileSync(a, JSON.stringify({ version: 1, samples: after }));
  const result = compareTeam(b, a, "team-adoption"); assert.equal(result.conclusion, "unknown"); assert.equal(result.rows.find((r) => r.metric === "blocking_sum")?.after, null);
});
test("R8 다른 구간의 역할 영수증은 현재 역할 숫자를 확정하지 않는다", () => {
  const f = fixture(); createTeamMember(f.root, "maker", "maker");
  const a = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" }, b = { start: "2026-01-03T00:00:00Z", end: "2026-01-04T00:00:00Z", unit: "representative-task", closed: true, completionRef: "b.json" }; receipt(f.dir, "a.json", a); receipt(f.dir, "b.json", b);
  roleReceipt(f.dir, "a.json", a, "maker", "activity");
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period: b, role_observations: [{ role: "maker", workMs: 500, outputTokens: [{ tool: "Codex", output: 50 }], coverage: { status: "partial", reportedBy: "agent:maker", refs: ["a.json"] } }] }));
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const role = JSON.parse(r.stdout).team.roles[0]; assert.equal(role.workMs, null); assert.deepEqual(role.outputTokens, []); assert.equal(role.source, "unconfirmed");
});
test("R8 코드/주석/본문의 marker 예시는 팀 계약을 활성화하지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, path = join(f.dir, "PROJECT.md"), original = readFileSync(path, "utf8");
  for (const example of ["\n## 예시\n\n```md\n- 팀 측정: v1\n```\n", "\n## 예시\n\n- 팀 측정: v1\n", "\n<!--\n- 팀 측정: v1\n-->\n"]) { writeFileSync(path, original + example); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.equal(Object.hasOwn(JSON.parse(r.stdout), "team"), false); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); }
});

test("R9 주석 뒤 절 제목은 회고 경계를 유지하고 inline 주석 예시는 marker를 숨기지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, project = join(f.dir, "PROJECT.md"), original = readFileSync(project, "utf8"); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const heading of ["## 참고 <!-- comment -->", "## 참고 <!--", "## 참고 `<!--`", "## 참고 <!-- comment --> tail"]) {
    writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n없음\n\n${heading}\n${heading.endsWith("<!--") ? "-->\n" : ""}\n${table}`);
    adoptTeamMetrics(f.root, rel); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  }
  for (const description of ["주석 예시: `<!--`", "주석 예시: `` `<!--` ``", "주석 예시: `<!-- -->`", "<!-- actual -->"]) {
    writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, `$1\n${description}\n- 팀 측정: v1\n`));
    writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "## 회고\n\n없음\n"); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
    writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고 <!-- comment -->\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  }
});

test("R9 계약 반례: 뒤집힌 전후 구간·모순 리뷰·질문 전 답·다른 회고 범위를 확정하지 않는다", () => {
  const cmp = compareFixture(), b = JSON.parse(readFileSync(cmp.before, "utf8")), a = JSON.parse(readFileSync(cmp.after, "utf8"));
  for (const [group, day] of [[b, 11], [a, 1]] as const) for (const [i, s] of group.samples.entries()) {
    s.period.start = `2026-02-${String(day + i * 2).padStart(2, "0")}T00:00:00Z`;
    s.period.end = `2026-02-${String(day + i * 2 + 1).padStart(2, "0")}T00:00:00Z`;
    receipt(cmp.dir, s.period.completionRef, s.period);
    s.completionProofSha256 = inputHash(readFileSync(join(cmp.dir, s.period.completionRef)));
  }
  writeFileSync(cmp.before, JSON.stringify(b)); writeFileSync(cmp.after, JSON.stringify(a)); assert.equal(cmp.compare().conclusion, "unknown"); assert.match(cmp.compare().reasons.join(" "), /전후 순서/);
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, id = "early-answer", period = { start: "2026-01-09T00:00:00Z", end: "2026-01-10T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); receipt(f.dir, "answer.json", period, id);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  recordEvent(f.dir, { ts: "2026-01-09T00:00:01Z", p: "P001", type: "answer", by: "coordinator", requestId: id, msg: "synthetic answer before question" });
  recordEvent(f.dir, { ts: "2026-01-09T00:00:02Z", p: "P001", type: "question", by: "agent", to: "coordinator", requestId: id, msg: "synthetic question" });
  recordEvent(f.dir, { ts: "2026-01-09T00:00:03Z", p: "P001", type: "review", by: "agent", msg: "reviewer fail blocking 2 should_fix 1", data: { reviewer: 1, tester: 0, pass: 1, fail: 0, blocking: 0, should_fix: 0 } });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage, log_coverage: coverage, coordinator_answers: [{ requestId: id, coverage: { ...coverage, confirmationRef: "answer.json", refs: ["answer.json"] } }] }));
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team; assert.equal(t.requests.reachedTotal, null); assert.equal(t.requests.comparisonUnconfirmed, 1); assert.equal(t.quality.blockingLogged, null);
  recordEvent(f.dir, { ts: "2026-01-09T00:00:04Z", p: "P001", type: "answer", by: "coordinator", requestId: id, msg: "synthetic later answer" });
  confirmRequestInput(f.dir, f.run);
  const good = JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team; assert.equal(good.requests.reachedTotal, 0);
  adoptTeamMetrics(f.root, rel); writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n");
  const data = { version: 1, metricRef: "METRICS.md", unusedRoles: [{ role: "maker", coverage: "observed-none", refs: ["old-frame.json"] }], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "frame.json" };
  roleReceipt(f.dir, "old-frame.json", { ...period, start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z" }, "maker", "none"); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify(data)); assert.ok(teamRetrospectiveIssues(f.root, rel, [], [], period).length);
  data.unusedRoles[0]!.refs = ["maker-none.json"]; roleReceipt(f.dir, "maker-none.json", period, "maker", "none"); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify(data)); assert.deepEqual(teamRetrospectiveIssues(f.root, rel, [], ["maker"], period), []);
});

test("owner 식별자는 소통·로그·잠금에 적용되고 기존 user 및 T01 원본 기준선은 보존한다", () => {
  const f = fixture(); assert.equal(f.run("project", "log", "P001", "--type", "question", "--to", "owner", "--msg", "synthetic owner question").status, 0); assert.equal(f.run("project", "log", "P001", "--type", "question", "--to", "captain", "--msg", "synthetic old rejected").status, 1);
  assert.equal(f.run("project", "log", "P001", "--type", "answer", "--by", "user", "--msg", "synthetic existing actor").status, 0);
  for (const file of ["baseline-roblox.json", "baseline-ai-sql-client.json"]) {
    // Locate by the stable task number, preserving the actual Korean folder spelling.
    const tasks = join(import.meta.dirname, "../projects/P009_261123_프로젝트_맞춤_에이전트_팀/tasks"), actual = join(tasks, readdirSync(tasks).find((p) => p.startsWith("T01_"))!, "evidence", file);
    const bytes = readFileSync(actual), copy = join(f.dir, file); writeFileSync(copy, bytes);
    const result = compareTeam(copy, copy, "team-adoption"); assert.equal(result.conclusion, "unknown"); assert.equal(result.sources.before.counts.owner_questions, null); assert.deepEqual(readFileSync(actual), bytes);
    if (file.includes("roblox")) { assert.equal(result.sources.before.counts.blocking_sum_stats_events, 31); assert.equal(result.sources.before.counts.blocking_sum_audited, 48); }
    else assert.equal(result.sources.before.observed.owner_file_edits, 0);
  }
});

test("R10 질문 전 사용자 답은 신고 도달 총량이 아니며 나중 답만 인정한다", () => {
  const f = fixture(), id = "early-owner", period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); receipt(f.dir, "answer.json", period, id);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "answer", by: "user", requestId: id, ref: "answer.json", msg: "synthetic early human answer" });
  recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", type: "question", by: "agent", to: "owner", requestId: id, msg: "synthetic question" });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c }));
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const early = get(); assert.equal(early.team.requests.ownerReply, 0); assert.equal(early.team.requests.reachedTotal, null); assert.equal(early.handoffs.requests.owner_reply, 0); assert.equal(collectHandoffs(f.root, "P001", `projects/${f.dir.split("/").at(-1)}`)!.requests.owner_reply, 1, "직접 legacy 판독은 보존한다");
  recordEvent(f.dir, { ts: "2026-01-01T03:00:00Z", p: "P001", type: "answer", by: "user", requestId: id, ref: "answer.json", msg: "synthetic later human answer" }); confirmRequestInput(f.dir, f.run); assert.equal(get().team.requests.reachedTotal, 1);
});
test("R10 품질0은 현재 구간 로그 수집 확인이 필요하며 미래 비교는 거부한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period);
  recordEvent(f.dir, { ts: "2026-01-03T00:00:00Z", p: "P001", type: "note", by: "agent", msg: "synthetic unrelated frame" });
  const input: Record<string, unknown> = { version: 1, period }; const get = () => { writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input)); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team.quality; };
  assert.equal(get().blockingLogged, null); assert.equal(get().gateFailures, null);
  input.log_coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] }; assert.equal(get().blockingLogged, 0); assert.equal(get().gateFailures, 0);
  const c = compareFixture(), b = JSON.parse(readFileSync(c.before, "utf8")); for (const s of b.samples) { s.period.start = s.period.start.replace("2026", "2099"); s.period.end = s.period.end.replace("2026", "2099"); receipt(c.dir, s.period.completionRef, s.period); } writeFileSync(c.before, JSON.stringify(b)); assert.throws(() => c.compare(), /미래/);
});
test("R10 들여쓴 다음 절·HTML 속성 주석 예시·사용 역할의 관측 없음 신고는 우회하지 못한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, project = join(f.dir, "PROJECT.md"), original = readFileSync(project, "utf8"); receipt(f.dir);
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n", data = { version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }; writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify(data)); adoptTeamMetrics(f.root, rel);
  for (const indent of [" ", "  ", "   "]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n없음\n\n${indent}## 참고\n\n${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n없음\n\n참고\n----\n\n${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true }; receipt(f.dir, "proof.json", period);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table}`); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ ...data, unusedRoles: [{ role: "maker", coverage: "observed-none", refs: ["proof.json"] }] })); assert.ok(teamRetrospectiveIssues(f.root, rel, [], [], period).length);
  unlinkSync(join(f.dir, "TEAM-RETROSPECTIVE.json")); writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, '$1\n<pre data-example="<!--">\nexample\n</pre>\n\n- 팀 측정: v1\n')); assert.ok(teamRetrospectiveIssues(f.root, rel).length); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.ok(JSON.parse(r.stdout).team);
});

test("R11 고아 답은 미확인이며 요청 전 상태 메시지 전송은 요청 도달이 아니다", () => {
  const f = fixture(), id = "orphan-answer", period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); receipt(f.dir, "answer.json", period, id);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] }; recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "answer", by: "user", requestId: id, ref: "answer.json", msg: "synthetic orphan answer" });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c })); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const team = JSON.parse(r.stdout).team; assert.equal(team.requests.reachedTotal, null); assert.equal(team.requests.unconfirmed, 1); assert.equal(team.snapshot.unknown.request_events, 1);
  const g = fixture(), rel = `projects/${g.dir.split("/").at(-1)}`, store = new HandoffStore(g.root, "P001", rel);
  store.record({ protocol: "pace-handoff", v: 1, id: "early-status", kind: "status", from: "coordinator", to: "owner", requestId: "future-request", data: {} }, "SYNTHETIC non-question status");
  const route = { transport: "external", actor: "owner", target: "fixture-human-route", from: "coordinator", sourceRef: "fixture:receipt" }; prepareDelivery(store, "early-status", "early-status-send", route); deliveryReceipt(store, "early-status-send", { phase: "sent", reportedBy: "coordinator", sourceRef: "fixture:receipt", responseHash: digest("synthetic status receipt"), responseId: "fixture-status" });
  store.record({ protocol: "pace-handoff", v: 1, id: "early-status-failed", kind: "status", from: "coordinator", to: "owner", requestId: "future-request", data: {} }, "SYNTHETIC unrelated status failure"); prepareDelivery(store, "early-status-failed", "early-status-fail", route); deliveryReceipt(store, "early-status-fail", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
  store.record({ protocol: "pace-handoff", v: 1, id: "later-request", kind: "decision_request", from: "coordinator", to: "owner", requestId: "future-request", data: { interpretation: false } }, "SYNTHETIC later question");
  const t = JSON.parse(g.run("project", "stats", "P001", "--json").stdout).team; assert.equal(t.requests.ownerDelivery, 0); assert.equal(t.requests.unconfirmed, 1); assert.equal(t.requests.failedAttemptsObserved, 0);
  prepareDelivery(store, "later-request", "actual-request-fail", route); deliveryReceipt(store, "actual-request-fail", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef }); prepareDelivery(store, "later-request", "actual-request-pass", route); deliveryReceipt(store, "actual-request-pass", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseHash: digest("synthetic actual request receipt"), responseId: "fixture-actual-receipt" }); const current = JSON.parse(g.run("project", "stats", "P001", "--json").stdout).team; assert.equal(current.requests.ownerDelivery, 1); assert.equal(current.requests.failedAttemptsObserved, 1);
});
test("R11 소수/음수/중복 리뷰 수치를 자르지 않으며 리뷰 실패 변화와 모순 게이트를 보류한다", () => {
  const f = fixture(); adoptTeamMetrics(f.root, `projects/${f.dir.split("/").at(-1)}`); for (const msg of ["reviewer fail blocking 0.5 should_fix 0", "reviewer fail blocking -1 should_fix 0", "reviewer fail blocking 0e2 should_fix 0", "reviewer fail blocking 0 blocking 2 should_fix 0"]) assert.notEqual(f.run("project", "log", "P001", "--type", "review", "--msg", msg).status, 0, msg);
  const cmp = compareFixture(); cmp.a.counts.review_failures = 2; cmp.save(); const result = cmp.compare(); assert.equal(result.conclusion, "unknown"); assert.match(result.reasons.join(" "), /review_failures.*품질/);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period);
  recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "review", by: "agent", msg: "reviewer fail blocking 0.5 should_fix 0", data: { reviewer: 1, tester: 0, pass: 0, fail: 1, blocking: 0, should_fix: 0 } });
  recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", type: "gate", by: "cli", msg: "check: checks", ok: true, data: { check: 1 } });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, log_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] } })); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team; assert.equal(t.quality.blockingLogged, null); assert.equal(t.quality.gateFailures, null);
});
test("R11 PI/CDATA 예시와 잘못된 회고 제목은 통과하지 않고 팀 없는 여러 줄 코드 예시는 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, path = join(f.dir, "PROJECT.md"), original = readFileSync(path, "utf8"); writeFileSync(path, original + "\n설명 `<!--\n여러 줄 코드\n`\n"); const legacy = f.run("project", "stats", "P001", "--json"); assert.equal(legacy.status, 0, legacy.stderr); assert.equal(Object.hasOwn(JSON.parse(legacy.stdout), "team"), false); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  writeFileSync(path, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n\n---\n- 팀 측정: v1\n")); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  writeFileSync(path, original); adoptTeamMetrics(f.root, rel); receipt(f.dir); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const text of [`## 회고\n\n<?example\n${table}?>\n`, `## 회고\n\n<![CDATA[\n${table}]]>\n`, `## 회고###\n\n${table}`]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), text); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고 ###\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});

test("R12 ID 없는 답도 원장 유무와 무관하게 미수집 요청으로 보존한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] }; recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "answer", by: "user", ref: "frame.json", msg: "synthetic unlinked user answer" });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c }));
  for (const ledger of [false, true]) { if (ledger) writeFileSync(join(f.dir, "handoffs.jsonl"), ""); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team; assert.equal(t.requests.reachedTotal, null); assert.equal(t.snapshot.unknown.request_events, 1); }
});
test("R12 inline 주석 뒤 활성 marker와 파이프 Setext 제목을 올바르게 구별한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, project = join(f.dir, "PROJECT.md"), original = readFileSync(project, "utf8"); writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n- 팀 측정: <!-- 설명 --> v1\n")); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.ok(JSON.parse(r.stdout).team); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  for (const indent of ["  ", "   "]) { writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, `$1\n- 예시\n${indent}- 팀 측정: v1\n`)); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); }
  writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n- 팀 측정: <!-- 설명 --> v1\n"));
  receipt(f.dir); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const underline of ["===", "---"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n없음\n\n| 참고 |\n${underline}\n\n${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});
test("R12 구두점 정수 표기는 보존하고 여러 gate 명령 키는 품질 미확인이다", () => {
  const f = fixture(); assert.equal(f.run("project", "log", "P001", "--type", "review", "--msg", "reviewer fail blocking 0, should_fix 1.").status, 0);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "gate", by: "cli", ok: false, msg: "check: checks", data: { check: 1, finish: 2 } });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, log_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] } })); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).team.quality.gateFailures, null);
});

test("R13 블록 경계의 들여쓴 코드는 주석 상태를 열지 않고 실제 표지와 회고를 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, path = join(f.dir, "PROJECT.md"), original = readFileSync(path, "utf8");
  for (const prefix of ["\n", "\n<pre>example</pre>\n", "\n<?example?>\n", "\n<!-- example -->\n"]) {
    writeFileSync(path, original.replace(/^(# [^\r\n]+)\r?\n/, `$1\n${prefix}    <!-- code example\n\n- 팀 측정: v1\n`)); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.ok(JSON.parse(r.stdout).team); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  }
  receipt(f.dir); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n없음\n\n    <!-- code example\n\n## 참고\n\n${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n    <!-- code example\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});
test("R13 표지는 최상위 열0 필드이며 회고 기계 구간의 Setext/가로선은 명시 보류한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, path = join(f.dir, "PROJECT.md"), original = readFileSync(path, "utf8"); writeFileSync(path, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n- 예시\n  - 팀 측정: v1\n")); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.equal(Object.hasOwn(JSON.parse(r.stdout), "team"), false); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  writeFileSync(path, original); adoptTeamMetrics(f.root, rel); receipt(f.dir); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" })); const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const body of [`## 회고\n\n없음\n\n#참고\n===\n\n${table}`, `## 회고\n\n---\n\n${table}`]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), body); assert.match(teamRetrospectiveIssues(f.root, rel).join(" "), /ATX/); }
});
test("R13 ID 없는 agent 수신 확인은 근거 있는 사용자 도달 총량을 바꾸지 않는다", () => {
  const f = fixture(), id = "valid-owner-reply", period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); receipt(f.dir, "answer.json", period, id);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] }; recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "question", by: "agent", to: "owner", requestId: id, msg: "synthetic question" }); recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", type: "answer", by: "user", requestId: id, ref: "answer.json", msg: "synthetic human answer" }); recordEvent(f.dir, { ts: "2026-01-01T03:00:00Z", p: "P001", type: "answer", by: "agent", msg: "synthetic acknowledgment" });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c })); for (const ledger of [false, true]) { if (ledger) writeFileSync(join(f.dir, "handoffs.jsonl"), ""); confirmRequestInput(f.dir, f.run); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team; assert.equal(t.requests.reachedTotal, 1); assert.equal(t.snapshot.unknown.request_events, 0); }
});

test("R14 Git 메시지 근사는 전체 구간을 닫지 않고 실제 성공 start/merge 사건만 사용한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge" as const, closed: true }; receipt(f.dir, "frame.json", period); recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  assert.equal(f.git("commit", "--allow-empty", "-qm", "unrelated chore(P001): 병합 완료 suffix").status, 0);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] }; writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c }));
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const guessed = get(); assert.ok(guessed.project.merge); assert.equal(guessed.team.period.closed, false); assert.equal(guessed.team.requests.reachedTotal, null);
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true }); confirmRequestInput(f.dir, f.run); const recorded = get(); assert.equal(recorded.team.period.closed, true); assert.equal(recorded.team.period.end, period.end); assert.equal(recorded.team.requests.reachedTotal, 0);
});
test("R14 should_fix 변화와 값 없는 중복 등급명도 품질 안정으로 통과하지 않는다", () => {
  const cmp = compareFixture(); cmp.a.counts.should_fix_sum_stats_events = 100; cmp.save(); const result = cmp.compare(); assert.equal(result.conclusion, "unknown"); assert.equal(result.rows.find((r) => r.metric === "should_fix_sum_stats_events")?.delta, 200);
  const f = fixture(); adoptTeamMetrics(f.root, `projects/${f.dir.split("/").at(-1)}`); for (const msg of ["reviewer fail blocking 0, should_fix 1. blocking", "reviewer pass blocking 0 should_fix 0 should_fix"]) assert.notEqual(f.run("project", "log", "P001", "--type", "review", "--msg", msg).status, 0);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "review", by: "agent", msg: "reviewer pass blocking 0 should_fix 100", data: { blocking: 0, should_fix: 100, pass: 1, fail: 0, reviewer: 1, tester: 0 } }); writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, log_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] } })); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const team = JSON.parse(r.stdout).team; assert.equal(team.quality.shouldFixLogged, 100); assert.equal(team.snapshot.counts.should_fix_sum_stats_events, 100);
});
test("R14 혼합 공백/탭 코드와 HTML 주석 종료 줄은 실제 구조를 만들거나 가리지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, project = join(f.dir, "PROJECT.md"), original = readFileSync(project, "utf8");
  for (const indent of [" \t", "  \t", "   \t"]) for (const separator of ["", "***\n", "- - -\n"]) { writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, `$1\n\n${separator}${indent}<!-- code example\n\n- 팀 측정: v1\n`)); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.ok(JSON.parse(r.stdout).team); }
  receipt(f.dir); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" })); const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const body of [`<!--\ncomment\n--> ## 회고\n\n${table}`, `## 회고\n\n없음\n\n \t<!-- code example\n\n## 참고\n\n${table}`]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), body); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `<!--\ncomment\n-->\n\n## 회고\n\n \t<!-- code example\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});
test("R14 출처 스킴/구분자 대소문자로 로컬 원문 경로를 metadata에 넣지 못한다", () => {
  const f = fixture(), cov = { status: "partial", reportedBy: "agent:maker", refs: ["proof.json"] }; writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, coverage: { owner_file_edits: cov } }));
  for (const sourceRef of ["FILE:/tmp/synthetic-original.md", "FiLe:C:\\tmp\\synthetic.md", "LOCAL:/tmp/synthetic-original.md", "C:\\tmp\\synthetic.md", "git:C:\\repo\\.GIT\\pace\\bodies"]) { writeFileSync(join(f.dir, "proof.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef, hash: digest("synthetic reference") })); assert.equal(f.run("project", "stats", "P001", "--json").status, 2, sourceRef); }
  writeFileSync(join(f.dir, "proof.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: `LOCAL:${digest("synthetic reference")}`, hash: digest("synthetic reference") })); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr);
});


test("R15 감사 기준을 골라도 로그 blocking의 변화·미수집을 숨기지 않는다", () => {
  const f = compareFixture(); f.b.comparison.qualitySource = f.a.comparison.qualitySource = "audited-verdicts";
  f.b.counts.blocking_sum_audited = f.a.counts.blocking_sum_audited = 6;
  f.save(); assert.equal(f.compare().conclusion, "observed-burden-improvement");
  for (const value of [200, null]) {
    const a = JSON.parse(readFileSync(f.after, "utf8")); for (const sample of a.samples) sample.counts.blocking_sum_stats_events = value;
    writeFileSync(f.after, JSON.stringify(a)); assert.equal(f.compare().conclusion, "unknown"); f.save();
  }
  f.b.comparison.qualitySource = f.a.comparison.qualitySource = "event-log"; f.a.counts.blocking_sum_audited = 7; f.save(); assert.equal(f.compare().conclusion, "unknown");
});
test("R15 성공 merge가 start보다 이르면 입력 파일 없이도 닫힌 구간을 만들지 않는다", () => {
  const f = fixture(); adoptTeamMetrics(f.root, `projects/${f.dir.split("/").at(-1)}`); recordMetric(f.dir, { ts: "2026-02-03T00:00:00Z", project: "P001", cmd: "start", ok: true }); recordMetric(f.dir, { ts: "2026-02-02T00:00:00Z", project: "P001", cmd: "merge", ok: true });
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 2); assert.match(r.stderr + r.stdout, /시작보다/);
});
test("R15 inline 태그와 문단 주석이 다음 절의 회고 표를 빌려오지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const middle of ["없음\n\n<span>설명</span>\n## 참고\n", "일반문장 <!--\n\n## 참고\n-->\n", "일반문장\n<span>\n## 참고\n</span>\n"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n${middle}\n${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length, middle); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n<span>설명</span>\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});


test("R16 잘못된 HTML slash 접미사는 다음 절을 숨기지 않고 실제 block 태그와 구별한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const tag of ["<div/foo>", "</div/foo>", "<DIV/foo>"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n없음\n\n${tag}\n## 참고\n\n${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length, tag); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n<div/>\n## HTML 안의 예시\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});
test("R16 inline 주석 제거가 원문에 없는 ATX 제목이나 marker 종료 경계를 만들지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, project = join(f.dir, "PROJECT.md"), original = readFileSync(project, "utf8");
  writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n##<!-- 주석 -->안내\n- 팀 측정: v1\n"));
  const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.ok(JSON.parse(r.stdout).team);
  receipt(f.dir); writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 참고\n\n##<!-- 주석 -->회고\n\n${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  for (const heading of ["## <!-- 주석 -->회고", "## 회고\n\n##<!-- 주석 -->참고"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `${heading}\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); }
});

test("R17 기계 구간의 들여쓴 제목은 명시 보류하며 표의 원문 열 수와 기존 표 범위를 지킨다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, project = join(f.dir, "PROJECT.md"), original = readFileSync(project, "utf8");
  writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n- 안내\n  ## 참고\n- 팀 측정: v1\n"));
  const held = f.run("project", "stats", "P001", "--json"); assert.equal(held.status, 2); assert.match(held.stderr + held.stdout, /열0/);
  writeFileSync(project, original); adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const body of [
    `## 참고\n\n- 안내\n  ## 회고\n\n${table}`,
    `## 회고\n\n- 안내\n  ## 참고\n\n${table}`,
    `## 회고\n\n${table.replace("구분 | 입력", "구분 \\| 입력")}`,
    `## 회고\n\n| A | B | C | D |\n|---|---|---|---|\n${table}`,
    `## 회고\n\n| A<!-- | --> | B | C |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n`,
    `## 회고\n\n- 안내\n${table}`,
    `## 회고\n\n설명\n${table}`,
  ]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), body); assert.ok(teamRetrospectiveIssues(f.root, rel).length, body); }
  for (const body of [table, table.replace("구분", "구분\\|예시"), table.replace("합성", "합성\\|예시")]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${body}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); }
});

test("R17 팀 사건의 문자열 배열/객체 강제 변환과 다른 스킴의 파일 경로를 거부한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel);
  const event = { ts: "2026-01-01T00:00:00Z", p: "P001", t: "T01", type: "question", by: "agent", to: "owner", requestId: "same", msg: "synthetic question" };
  for (const key of ["ts", "p", "t", "type", "by", "to", "requestId", "msg"]) {
    writeFileSync(join(f.dir, "log.jsonl"), `${JSON.stringify(event)}\n${JSON.stringify({ ...event, [key]: [event[key as keyof typeof event]] })}\n`);
    assert.equal(f.run("project", "stats", "P001", "--json").status, 2, key);
  }
  writeFileSync(join(f.dir, "log.jsonl"), `${JSON.stringify(event)}\n${JSON.stringify(event)}\n`);
  const good = f.run("project", "stats", "P001", "--json"); assert.equal(good.status, 0, good.stderr); assert.equal(JSON.parse(good.stdout).team.requests.linked, 1);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, coverage: { owner_file_edits: { status: "partial", reportedBy: "agent:maker", refs: ["proof.json"] } } }));
  for (const sourceRef of ["fixture:/synthetic/private/body.md", "fixture:C:\\private\\body.md", "https://example.invalid/private/body.md"]) { writeFileSync(join(f.dir, "proof.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef, hash: digest("synthetic") })); assert.equal(f.run("project", "stats", "P001", "--json").status, 2, sourceRef); }
  receipt(f.dir); assert.equal(f.run("project", "stats", "P001", "--json").status, 0);
});

test("R18 실패 시도는 근거 없는 사용자 답을 해소하지 않고 팀 도달 총량을 미확인으로 남긴다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), id = "failed-human-answer";
  store.record({ protocol: "pace-handoff", v: 1, id: "human-question", kind: "decision_request", from: "coordinator", to: "owner", requestId: id, data: { interpretation: false } }, "SYNTHETIC question");
  const route = { transport: "external", actor: "owner", target: "fixture-human-route", from: "coordinator", sourceRef: "fixture:receipt" };
  prepareDelivery(store, "human-question", "failed-human-attempt", route); deliveryReceipt(store, "failed-human-attempt", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
  recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", requestId: id, msg: "synthetic answer missing proof" });
  const period = { start: new Date(Date.now() - 60000).toISOString(), end: new Date().toISOString(), unit: "representative-task", closed: true, completionRef: "proof.json" };
  const cov = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "proof.json", refs: ["proof.json"] };
  const get = () => { receipt(f.dir, "proof.json", period); receipt(f.dir, "answer.json", period, id); writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: cov })); confirmRequestInput(f.dir, f.run); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  const held = get(); assert.equal(held.team.requests.unconfirmed, 1); assert.equal(held.team.requests.failedOnly, 0); assert.equal(held.team.requests.failedAttemptsObserved, 1); assert.equal(held.team.requests.reachedTotal, null); assert.equal(held.team.snapshot.counts.owner_questions, null); assert.equal(held.handoffs.requests.failed_only, 0); assert.equal(collectHandoffs(f.root, "P001", rel)!.requests.failed_only, 1, "직접 legacy 판독은 보존한다");
  recordEvent(f.dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", requestId: id, ref: "answer.json", msg: "synthetic proven answer" }); period.end = new Date().toISOString();
  assert.equal(get().team.requests.reachedTotal, 1);
});

test("R18 표본별 품질 변동의 합계 상쇄와 수집 출처 차이를 방향 판정으로 숨기지 않는다", () => {
  const f = compareFixture(), b = JSON.parse(readFileSync(f.before, "utf8")), a = JSON.parse(readFileSync(f.after, "utf8"));
  for (const s of b.samples) s.counts.blocking_sum_stats_events = 1;
  a.samples[0].counts.blocking_sum_stats_events = 0; a.samples[1].counts.blocking_sum_stats_events = 2;
  writeFileSync(f.before, JSON.stringify(b)); writeFileSync(f.after, JSON.stringify(a)); let r = f.compare(); assert.equal(r.conclusion, "unknown"); assert.match(r.reasons.join(" "), /표본별 품질/); assert.equal(r.sources.after.qualitySamples.length, 2);
  f.save(); const before = JSON.parse(readFileSync(f.before, "utf8")), after = JSON.parse(readFileSync(f.after, "utf8"));
  const markStats = (s: ReturnType<typeof snapshot>) => {
    const ref = `request-${s.period.completionRef}`, sourceSha256 = digest(ref);
    const support = [{ ref: s.period.completionRef, receiptSha256: s.completionProofSha256! }];
    const hash = portableRequestInputHash(sourceSha256, { repository: s.repository, comparison: comparisonContext(s.comparison), representativeProof: support[0]!, counts: s.counts, observed: s.observed_counts, unknownRequests: s.unknown.request_events, deliveryClaims: [] }, support);
    const proof = JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: "request-coverage:fixture:comparison", hash, purposes: ["request-coverage"], period: { start: s.period.start, end: s.period.end, unit: s.period.unit } });
    writeFileSync(join(f.dir, ref), proof);
    Object.assign(s, { measurementKind: "stats-reported-v1", requestCoverage: { ref, inputSha256: hash, receiptSha256: inputHash(proof), sourceSha256, support }, deliveryClaims: [] });
  };
  for (const s of before.samples) markStats(s);
  writeFileSync(f.before, JSON.stringify(before)); r = f.compare(); assert.equal(r.conclusion, "unknown"); assert.match(r.reasons.join(" "), /수집 출처/);
  for (const s of after.samples) markStats(s);
  writeFileSync(f.after, JSON.stringify(after)); assert.equal(f.compare().conclusion, "observed-burden-improvement");
  for (const key of ["measurementKind", "requestCoverage", "deliveryClaims"]) delete before.samples[1][key];
  writeFileSync(f.before, JSON.stringify(before));
  assert.equal(f.compare().sources.before.origin, "mixed-reported");
  assert.equal(f.compare().conclusion, "unknown");
});

test("R18 지원 밖 넓은 표의 끝 파이프/짧은 구분행도 연속 표 내부를 새 회고로 만들지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const outer of ["| A | B | C | D\n|---|---|---|---|\n", "| A | B | C | D |\n|---|---|---|---\n", "| A | B | C | D |\n|-|-|-|-|\n", "A | B | C | D\n---|---|---|---\n"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${outer}${table}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length, outer); }
  for (const summary of ["<!-- hidden -->", "<span></span>", "<script>hidden</script>", "<span style='display:none'>hidden</span>", "&nbsp;"]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table.replace("합성", summary)}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n| A | B | C | D\n|---|---|---|---|\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});

test("R18 인접 등급의 구두점 경계를 보존하되 소수·지수·중복 값은 거부한다", () => {
  const f = fixture(); adoptTeamMetrics(f.root, `projects/${f.dir.split("/").at(-1)}`);
  for (const msg of ["reviewer pass blocking 0,should_fix 0", "reviewer pass blocking 0;should_fix 0", "reviewer pass blocking 0.should_fix 0"]) assert.equal(f.run("project", "log", "P001", "--type", "review", "--msg", msg).status, 0, msg);
  for (const msg of ["reviewer pass blocking 0.5,should_fix 0", "reviewer pass blocking 0e2,should_fix 0", "reviewer pass blocking 0,5 should_fix 0", "reviewer pass blocking 0,blocking 0 should_fix 0"]) assert.notEqual(f.run("project", "log", "P001", "--type", "review", "--msg", msg).status, 0, msg);
});

test("R19 회고 셀의 빈 링크·형식 문자·주석 이름을 거부하고 실제 비교 문구와 링크는 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  const invalid = ["[](details.md)", "[ ](details.md)", "[][report]", "\u200b", "\u034f", "` `"].map((s) => table.replace("합성", s));
  invalid.push(table.replace("[회고]", "[<!-- note -->]"), table.replace("[회고]", "[\u200b]"), table.replace("[회고]", "[ ]"), table.replace("구분", "구분<!-- note -->"));
  for (const body of invalid) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${body}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length, body); }
  for (const body of [table.replace("합성", "전후 A<B 구간을 비교함"), table.replace("합성", "[범위](<https://example.invalid/scope>)"), table.replace("합성", "[자료](details.md)"), table.replace("[회고]", "[A<B]")]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${body}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); }
});

test("R19 NBSP는 코드/HTML 블록을 닫거나 표 구분·ATX 경계를 만들지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, project = join(f.dir, "PROJECT.md"), original = readFileSync(project, "utf8");
  writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n\n~~~md\n~~~\u00a0\n- 팀 측정: v1\n~~~\n"));
  let r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.equal(Object.hasOwn(JSON.parse(r.stdout), "team"), false);
  writeFileSync(project, original.replace(/^(# [^\r\n]+)\r?\n/, "$1\n##\u00a0안내\n- 팀 측정: v1\n")); r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); assert.ok(JSON.parse(r.stdout).team);
  writeFileSync(project, original); adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const body of [`~~~md\n~~~\u00a0\n## 회고\n\n${table}`, `<div>\n\u00a0\n## 회고\n${table}`, `## 회고\n\n${table.replace("|---|", "|---\u00a0|")}`]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), body); assert.ok(teamRetrospectiveIssues(f.root, rel).length, body); }
  for (const body of [`~~~md\nexample\n~~~ \t\n## 회고\n\n${table}`, `<div>\n\u00a0\n\n## 회고\n\n${table}`]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), body); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); }
});

test("R20 구간 경계 요청의 답을 부담0으로 비교하지 않고 최초 요청 코호트와 미확인을 구별한다", () => {
  const f = fixture(), before: unknown[] = [], after: unknown[] = [];
  for (const changed of [false, true]) for (let i = 0; i < 2; i++) {
    const day = 3 + i * 4 + (changed ? 8 : 0), id = `boundary-${changed}-${i}`;
    const period = { start: new Date(Date.UTC(2026, 0, day)).toISOString(), end: new Date(Date.UTC(2026, 0, day + 1)).toISOString(), unit: "representative-task", closed: true, completionRef: `frame-${id}.json` };
    receipt(f.dir, period.completionRef, period); receipt(f.dir, `answer-${id}.json`, period, id);
    const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
    recordEvent(f.dir, { ts: new Date(Date.parse(period.start) + (changed ? -1000 : 0)).toISOString(), p: "P001", type: "question", by: "agent", to: "owner", requestId: id, msg: "synthetic boundary question" });
    recordEvent(f.dir, { ts: new Date(Date.parse(period.start) + 1000).toISOString(), p: "P001", type: "answer", by: "user", requestId: id, ref: `answer-${id}.json`, msg: "synthetic proven boundary answer" });
    writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, comparison: { ...snapshot().comparison, conditionCode: changed ? "team" : "no-team", sampleCount: 1 }, period, request_coverage: c, log_coverage: c, counts: Object.fromEntries(MANUAL_KEYS.slice(0, 4).map((key) => [key, 0])), coverage: Object.fromEntries(MANUAL_KEYS.slice(0, 4).map((key) => [key, c])), quality_audit: { blocking_sum: 0, rereviews_after_fail: 0, coverage: c } }));
    confirmRequestInput(f.dir, f.run);
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); const t = JSON.parse(r.stdout).team;
    assert.equal(t.requests.crossBoundaryObserved, changed ? 1 : 0); assert.equal(t.requests.reachedTotal, changed ? null : 1); assert.equal(t.snapshot.unknown.request_events, changed ? 1 : 0);
    if (i === 0) { const text = f.run("project", "stats", "P001").stdout; if (changed) { assert.match(text, /1건\(미확인에 포함, 총량\/방향 보류\)/); assert.match(text, /구간 경계 미확인 활동 1건/); } else assert.doesNotMatch(text, /0건\(미확인에 포함/); }
    (changed ? after : before).push(t.snapshot);
  }
  const b = join(f.dir, "before-boundary.json"), a = join(f.dir, "after-boundary.json"); writeFileSync(b, JSON.stringify({ version: 1, samples: before })); writeFileSync(a, JSON.stringify({ version: 1, samples: after }));
  assert.equal(compareTeam(b, a, "team-adoption").conclusion, "unknown");
});

test("R20 구간 안 역할·시도·종류 관측은 구간 밖 최초 요청으로 지워지지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; createTeamMember(f.root, "maker", "maker"); const store = new HandoffStore(f.root, "P001", rel);
  store.record({ protocol: "pace-handoff", v: 1, id: "old-root", kind: "decision_request", from: "coordinator", to: "owner", requestId: "old-role-request", data: { interpretation: false } }, "SYNTHETIC old question");
  // Synthetic metadata timeline: body/hash unchanged; establish a root before the selected period.
  const old = store.read()[0]!; writeFileSync(store.path, JSON.stringify({ ...old, at: "2026-01-01T00:00:00Z" }) + "\n");
  const start = new Date(Date.now() - 1000).toISOString();
  store.record({ protocol: "pace-handoff", v: 1, id: "maker-status", kind: "status", from: "agent:maker", to: "coordinator", requestId: "old-role-request", data: {} }, "SYNTHETIC maker activity");
  const route = { transport: "external", actor: "owner", target: "fixture-human-route", from: "coordinator", sourceRef: "fixture:receipt" };
  prepareDelivery(store, "old-root", "old-root-failed", route); deliveryReceipt(store, "old-root-failed", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
  const period = { start, end: new Date().toISOString(), unit: "representative-task" as const, closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period); roleReceipt(f.dir, "none.json", period, "maker", "none");
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period }));
  const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); const t = JSON.parse(result.stdout).team;
  assert.equal(t.requests.crossBoundaryObserved, 1); assert.equal(t.requests.failedAttemptsObserved, 1); assert.equal(t.handoffs.agents["agent:maker"].status, 1); assert.ok(!t.unusedRoleCandidates.some((r: { role: string }) => r.role === "maker"));
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n");
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [{ role: "maker", coverage: "observed-none", refs: ["none.json"] }], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "frame.json" }));
  assert.match(teamRetrospectiveIssues(f.root, rel, [], t.unusedRoleCandidates.map((r: { role: string }) => r.role), period).join(" "), /관측\/참여/);
});

test("R20 Unicode 줄 구분자는 회고 절을 만들거나 닫지 않고 filler만 있는 셀은 비어 있다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const separator of ["\u2028", "\u2029"]) {
    for (const body of [`## 참고\n\n문장${separator}## 회고\n\n${table}`, `## 회고${separator}later text\n\n${table}`, `## 회고${separator}\n\n${table}`]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), body); assert.ok(teamRetrospectiveIssues(f.root, rel).length, body); }
    writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n문장${separator}## 일반 본문\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  }
  for (const filler of ["\u3164", "\u115f", "\u1160", "\uffa0", "\u2800"]) for (const body of [table.replace("합성", filler), table.replace("[회고]", `[${filler}]`), table.replace("구분", filler)]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${body}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});

test("R21 단독 CR과 CRLF/LF의 실제 줄 경계를 같게 읽고 원본은 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n", path = join(f.dir, "PROJECT-CLOSE.md");
  for (const newline of ["\r", "\r\n", "\n"]) {
    const wrong = `## 회고\n\n없음${newline}## 참고\n\n${table}`; writeFileSync(path, wrong); assert.ok(teamRetrospectiveIssues(f.root, rel).length); assert.equal(readFileSync(path, "utf8"), wrong);
    const good = (`## 회고\n\n${table}`).replace(/\n/g, newline); writeFileSync(path, good); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); assert.equal(readFileSync(path, "utf8"), good);
    writeFileSync(path, (`~~~md\n## 회고\n\n${table}~~~\n`).replace(/\n/g, newline)); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  }
});

test("R21 링크 목적지나 Markdown 장식으로 채움 문자만의 셀을 표시 내용으로 만들지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  for (const filler of ["\u3164", "\u2800", "\u115f"]) for (const wrapped of [`[${filler}](details.md)`, `[**${filler}**](details.md)`, `[${filler}][scope]`, `[${filler}]`]) for (const body of [table.replace("합성", wrapped), table.replace("구분", wrapped)]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${body}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length, body); }
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table.replace("[회고]", "[**\u3164**]")}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  for (const body of [table.replace("합성", "[한글](details.md)"), table.replace("합성", "[범위](https://example.invalid/a_(b))"), table.replace("[회고]", "[*]"), table.replace("구분", "**구분**")]) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${body}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []); }
});

test("R22 실제 링크 이름을 제목/목적지/이스케이프 예문과 구별한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  const visible = [
    '[범위](details.md "[\u2800](sample.md)")',
    '비교 \\[\u2800](details.md)',
    '\\[\u3164](details.md)',
    '[범위](<https://example.invalid/a_(b)> "[\u3164](sample.md)")',
    '[범위](details.md "literal <!-- note --> and `code`")',
    '[범위](https://example.invalid/a_(b))',
    '일반 \\<span> 예시',
    '일반 \\<?instruction?> 예시',
    '[범위][source]',
  ];
  for (const summary of visible) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table.replace("합성", summary)}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), [], summary); }
  for (const summary of ['[\u2800](details.md "visible title")', '[\u3164](<https://example.invalid/a_(b)> "visible")', '![](details.md)', '![자료](details.md)', '![자료]', '[자료](unfinished', '[\u3164][source]', '<?instruction?>', '<!DOCTYPE html>', '<![CDATA[hidden]]>']) { writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), `## 회고\n\n${table.replace("합성", summary)}`); assert.ok(teamRetrospectiveIssues(f.root, rel).length, summary); }
});

test("R28 개별 요청·완료 영수증은 전체 수집0 권한이 아니며 목적별 증빙을 비교까지 유지한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "completion.json" };
  receipt(f.dir, "completion.json", period);
  const scope = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: scope, log_coverage: scope, counts: { owner_file_edits: 0 }, coverage: { owner_file_edits: scope }, quality_audit: { blocking_sum: 0, rereviews_after_fail: 0, coverage: scope } }));
  const get = (extra: Record<string, unknown>) => {
    writeFileSync(join(f.dir, "scope.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: "fixture:scope", hash: digest("synthetic scope"), period: { start: period.start, end: period.end, unit: period.unit }, ...extra }));
    confirmRequestInput(f.dir, f.run); const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team;
  };
  for (const proof of [{}, { purposes: ["completion"] }, { purposes: EVIDENCE_PURPOSES, requestId: "one-request" }, { purposes: EVIDENCE_PURPOSES, decisionReplyId: "one-reply" }]) {
    const t = get(proof); assert.equal(t.period.closed, true); assert.equal(t.requests.reachedTotal, null); assert.equal(t.quality.blockingLogged, null); assert.equal(t.quality.blockingAudited, null); assert.equal(t.manual.fileEdits.total, null);
    const c = compareFixture(); writeFileSync(c.after, JSON.stringify({ version: 1, samples: [t.snapshot] })); const comparison = c.compare(); assert.equal(comparison.conclusion, "unknown"); assert.equal(comparison.sources.after.counts.owner_questions, null);
  }
  const partial = get({ purposes: ["request-coverage"] }); assert.equal(partial.requests.reachedTotal, 0); assert.equal(partial.quality.blockingLogged, null); assert.equal(partial.manual.fileEdits.total, null);
  const complete = get({ purposes: ["request-coverage", "log-coverage", "owner_file_edits", "quality-audit"] }); assert.equal(complete.requests.reachedTotal, 0); assert.equal(complete.quality.blockingLogged, 0); assert.equal(complete.quality.blockingAudited, 0); assert.equal(complete.manual.fileEdits.total, 0);
  // A request-bound receipt also cannot close the representative period.
  receipt(f.dir, "completion.json", period, "one-request"); assert.equal(get({ purposes: EVIDENCE_PURPOSES }).period.closed, false);
});

test("R28 요청 ID의 서로 다른 명시 Task는 unknown이며 같은 Task 중계/프로젝트 거울은 하나다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period); receipt(f.dir, "answer.json", period, "shared-request");
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage, log_coverage: coverage }));
  const a = { ts: "2026-01-01T01:00:00Z", p: "P001", t: "T01", type: "question" as const, by: "agent" as const, to: "owner" as const, requestId: "shared-request", msg: "synthetic first task request" };
  const b = { ...a, ts: "2026-01-01T02:00:00Z", t: "T02" }, answer = { ...b, ts: "2026-01-01T03:00:00Z", type: "answer" as const, by: "user" as const, to: undefined, ref: "answer.json" };
  const get = (task: string | undefined) => {
    writeFileSync(join(f.dir, "log.jsonl"), [a, { ...b, t: task }, { ...answer, t: task }].map((e) => JSON.stringify(e)).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
  };
  const conflict = get("T02"); assert.equal(conflict.team.requests.ownerQuestionEvents, 2); assert.equal(conflict.team.requests.ownerReply, 0); assert.equal(conflict.team.requests.unconfirmed, 1); assert.equal(conflict.team.requests.reachedTotal, null); assert.match(conflict.team.warnings.join(" "), /태스크 범위 충돌/); assert.equal(conflict.handoffs.requests.owner_reply, 0); assert.equal(conflict.handoffs.requests.unconfirmed, 1); assert.match(f.run("project", "stats", "P001").stdout, /사용자 답[^\n]* 0/);
  const c = compareFixture(); receipt(c.dir, "frame.json", period); writeFileSync(c.after, JSON.stringify({ version: 1, samples: [conflict.team.snapshot] })); assert.equal(c.compare().sources.after.counts.owner_questions, null);
  for (const task of ["T01", undefined]) { const valid = get(task).team; assert.equal(valid.requests.linked, 1); assert.equal(valid.requests.ownerReply, 1); assert.equal(valid.requests.reachedTotal, 1); }
});

test("R28 완전한 리뷰0도 과거 TASK-CLOSE 반복 지적을 지우지 않고 마감에서 요구한다", () => {
  const { f, worktree, run, dir } = mergeFixture(), task = join(dir, "tasks/T99_synthetic"); mkdirSync(task, { recursive: true });
  writeFileSync(join(task, "TASK-CLOSE.md"), "## 리뷰\n\nblocking 2\n\n## 남긴 것\n\n없음\n");
  for (const count of [0, 2]) {
    recordEvent(dir, { ts: new Date().toISOString(), p: "P001", t: "T99", type: "review", by: "agent", msg: `reviewer ${count ? "fail" : "pass"} blocking ${count} should_fix 0`, data: reviewMessageData(`reviewer ${count ? "fail" : "pass"} blocking ${count} should_fix 0`) });
    const interim = JSON.parse(run("project", "stats", "P001", "--json").stdout); assert.equal(interim.reviews.find((r: { task: string }) => r.task === "T99").blocking, 2); assert.equal(interim.improvements.find((i: { code: string }) => i.code === "blocking").count, 2);
  }
  const result = run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); const stats = JSON.parse(result.stdout), review = stats.reviews.find((r: { task: string }) => r.task === "T99");
  assert.equal(review.blocking, 2); assert.equal(review.sources.taskClose.blocking, 2); assert.equal(review.sources.eventLog.blocking, 2); assert.equal(review.sources.relation, "overlap-unconfirmed-lower-bound"); assert.equal(stats.improvements.find((i: { code: string }) => i.code === "blocking").count, 2);
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-review-sources").status, 0);
  const held = run("project", "finish", "P001"); assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /반복 지적/);
  const path = join(dir, "TEAM-RETROSPECTIVE.json"), retro = JSON.parse(readFileSync(path, "utf8")); retro.recurringFindings = [{ code: "review-blocking", count: 2, coverage: "reported", refs: ["proof.json"] }]; writeFileSync(path, JSON.stringify(retro));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-preserve-history").status, 0);
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
});

test("R28 일반 검사가 직접 만든 커밋은 보존하고 다른 HEAD의 finish 봉인은 보류한다", () => {
  const { f, worktree, run, dir } = mergeFixture("node check.mjs");
  writeFileSync(join(worktree, "outside.txt"), "synthetic-before");
  writeFileSync(join(worktree, "check.mjs"), 'import {writeFileSync} from "node:fs"; import {execFileSync} from "node:child_process"; writeFileSync("outside.txt","synthetic-after"); execFileSync("git",["add","--","outside.txt"]); execFileSync("git",["commit","-qm","synthetic-check-commit"]);');
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-check-source").status, 0);
  const before = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
  const held = run("project", "finish", "P001"); assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /검사 중 HEAD/);
  assert.notEqual(f.git("-C", worktree, "rev-parse", "HEAD").stdout, before); assert.equal(f.git("-C", worktree, "show", "HEAD:outside.txt").stdout, "synthetic-after"); assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
});

test("R30 원장 참조가 검증된 중계와 별도 로그를 구분하고 미채택 조회를 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = "cross-task-relay";
  store.record({ protocol: "pace-handoff", v: 1, id: "cross-root", kind: "decision_request", from: "coordinator", to: "owner", task: "T01", requestId, data: { interpretation: false } }, "SYNTHETIC same proposal");
  store.record({ protocol: "pace-handoff", v: 1, id: "cross-relay", kind: "decision_request", from: "coordinator", to: "owner", task: "T02", requestId, data: { interpretation: false, relayOf: "cross-root" } }, "SYNTHETIC same proposal");
  store.record({ protocol: "pace-handoff", v: 1, id: "cross-reply", kind: "decision_reply", from: "owner", to: "coordinator", task: "T02", requestId, data: { re: "cross-relay", decision: "approve", proposalHash: proposalDigest(store.read()[1]!), sourceRef: "fixture:cross-reply" } }, "SYNTHETIC reply");
  const rows = store.read(); for (const [i, row] of rows.entries()) row.at = `2026-01-01T0${i + 1}:00:00Z`; writeFileSync(store.path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" }; receipt(f.dir, "frame.json", period);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage, log_coverage: coverage }));
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  confirmRequestInput(f.dir, f.run);
  const native = get(); assert.equal(native.team.requests.ownerReply, 1); assert.equal(native.team.requests.reachedTotal, 1);
  const receipts = ["root", "relay"].map((name, i) => {
    const ref = `mirror-${name}.json`, row = rows[i]!;
    const data = { version: 1, kind: "team-evidence", sourceRef: `handoff:${row.id}`, hash: row.bodyHash, requestId };
    writeFileSync(join(f.dir, ref), JSON.stringify(data));
    return { ref, data };
  });
  for (const [task, i] of [["T01", 0], ["T02", 1], [undefined, 1]] as const) recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", ...(task ? { t: task } : {}), type: "question", by: "agent", to: "owner", requestId, ref: receipts[i]!.ref, msg: "synthetic validated mirror" });
  const validLog = readFileSync(join(f.dir, "log.jsonl"), "utf8");
  confirmRequestInput(f.dir, f.run);
  const valid = get(); assert.equal(valid.team.requests.ownerQuestionEvents, 3); assert.equal(valid.team.requests.linked, 1); assert.equal(valid.team.requests.ownerReply, 1); assert.equal(valid.team.requests.reachedTotal, 1); assert.equal(valid.handoffs.requests.owner_reply, 1); assert.equal(valid.handoffs.requests.items[0].scopeConflict, false);
  assert.match(f.run("project", "stats", "P001").stdout, /사용자 답[^\n]* 1/);

  const unresolved = (conflict: boolean) => {
    const held = get(); assert.equal(held.team.requests.ownerReply, 1, "유효한 원장 답 관측"); assert.equal(held.team.requests.reachedTotal, null); assert.equal(held.team.requests.comparisonUnconfirmed, 1);
    assert.equal(held.handoffs.requests.owner_reply, 1); assert.deepEqual(held.handoffs.attributionUnconfirmedRequests, [requestId]); assert.equal(held.handoffs.requests.items[0].scopeConflict, conflict);
    return held;
  };
  const path = join(f.dir, "log.jsonl");
  const question = { p: "P001", t: "T02", type: "escalation" as const, by: "agent" as const, to: "owner" as const, requestId, msg: "synthetic independent question" };
  for (const ts of ["2026-01-01T00:30:00Z", "2026-01-01T04:00:00Z"]) {
    recordEvent(f.dir, { ...question, ts }); unresolved(true); writeFileSync(path, validLog);
  }
  recordEvent(f.dir, { ...question, t: "T03", ts: "2026-01-01T04:00:00Z" });
  const held = unresolved(true);
  const c = compareFixture(); receipt(c.dir, "frame.json", period); writeFileSync(c.after, JSON.stringify({ version: 1, samples: [held.team.snapshot] })); assert.equal(c.compare().sources.after.counts.owner_questions, null);
  writeFileSync(path, validLog);
  for (const mutation of [{ hash: digest("other body") }, { requestId: "other-request" }, { sourceRef: "handoff:missing" }]) {
    writeFileSync(join(f.dir, receipts[1]!.ref), JSON.stringify({ ...receipts[1]!.data, ...mutation }));
    unresolved(true);
  }
  writeFileSync(join(f.dir, receipts[1]!.ref), JSON.stringify(receipts[1]!.data));
  recordEvent(f.dir, { ...question, ts: "2026-01-01T01:30:00Z", ref: receipts[1]!.ref }); unresolved(true);
  writeFileSync(path, validLog);
  recordEvent(f.dir, { ...question, t: "T01", ts: "2026-01-01T04:00:00Z" }); unresolved(false);
  assert.match(f.run("project", "stats", "P001").stdout, /요청 기록의 귀속 미확인 1건/);

  // Remove adoption in this owned fixture and compare the CLI projection to the original reader.
  unlinkSync(join(f.dir, "TEAM-MEASUREMENT.json"));
  const legacy = get(); assert.deepEqual(legacy.handoffs, collectHandoffs(f.root, "P001", rel));
  assert.equal(legacy.handoffs.requests.owner_reply, 1); assert.equal(Object.hasOwn(legacy.handoffs, "attributionUnconfirmedRequests"), false);
});

test("R31 로그의 사용자·코디네이터 답은 확인된 같은 태스크 요청에 귀속한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period); receipt(f.dir, "owner.json", period, "owner-case"); receipt(f.dir, "coord.json", period, "coord-case");
  const cov = (ref: string) => ({ status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: ref, refs: [ref] });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: cov("frame.json"), coordinator_answers: [{ requestId: "coord-case", coverage: cov("coord.json") }] }));
  for (const [id, to] of [["owner-case", "owner"], ["coord-case", "coordinator"]] as const) recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", t: "T01", type: "question", by: "agent", to, requestId: id, msg: "synthetic scoped question" });
  const answer = { ts: "2026-01-01T02:00:00Z", p: "P001", type: "answer" as const, msg: "synthetic scoped answer" };
  const add = (t: string) => {
    recordEvent(f.dir, { ...answer, t, by: "user", requestId: "owner-case", ref: "owner.json" });
    recordEvent(f.dir, { ...answer, t, by: "coordinator", requestId: "coord-case" });
  };
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  add("T02");
  confirmRequestInput(f.dir, f.run);
  const mismatch = get(); assert.equal(mismatch.team.requests.ownerReply, 0); assert.equal(mismatch.team.requests.coordinatorOwnAnswerObserved, 0); assert.equal(mismatch.team.requests.reachedTotal, null); assert.equal(mismatch.handoffs.requests.unconfirmed, 2);
  add("T01");
  confirmRequestInput(f.dir, f.run);
  const mixed = get(); assert.equal(mixed.team.requests.ownerReply, 1); assert.equal(mixed.team.requests.reachedTotal, null);
  const log = join(f.dir, "log.jsonl");
  writeFileSync(log, readFileSync(log, "utf8").split("\n").filter((row) => !row.includes('"t":"T02"')).join("\n"));
  confirmRequestInput(f.dir, f.run);
  const valid = get(); assert.equal(valid.team.requests.ownerReply, 1); assert.equal(valid.team.requests.coordinatorOwnAnswerObserved, 1); assert.equal(valid.team.requests.reachedTotal, 1); assert.equal(valid.handoffs.requests.owner_reply, 1);
});

test("R31 팀 마감 뒤 채택 파일과 영수증을 뺀 커밋도 기존 프로젝트로 병합되지 않는다", () => {
  const { f, worktree, run, dir } = mergeFixture();
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  const preview = f.run("project", "merge", "P001"); assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  const mainHead = f.git("rev-parse", "HEAD").stdout;
  for (const name of ["TEAM-MEASUREMENT.json", "TEAM-FINISH.json", "TEAM-RETROSPECTIVE.json"]) unlinkSync(join(dir, name)); // Owned fixture only.
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-remove-adoption-and-seal").status, 0);
  for (const args of [[], ["--yes"]] as const) {
    const blocked = f.run("project", "merge", "P001", ...args); assert.notEqual(blocked.status, 0); assert.match(blocked.stdout + blocked.stderr, /팀 finish 영수증/);
  }
  assert.equal(f.git("rev-parse", "HEAD").stdout, mainHead);
});

test("R31 새 팀의 리뷰 수치 입력 검사는 기존 프로젝트의 허용 표현을 바꾸지 않는다", () => {
  const f = fixture();
  const log = () => f.run("project", "log", "P001", "--type", "review", "--msg", "reviewer fail blocking 2건 should_fix 1건");
  const old = log(); assert.equal(old.status, 0, old.stderr);
  assert.equal(JSON.parse(readFileSync(join(f.dir, "log.jsonl"), "utf8").trim()).data.blocking, 2);
  adoptTeamMetrics(f.root, `projects/${f.dir.split("/").at(-1)}`);
  assert.notEqual(log().status, 0);
});

test("R32 같은 ID의 뒤늦은 태스크 질문은 이전 사용자·코디네이터 답을 소급 승인하지 않는다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period); receipt(f.dir, "owner.json", period, "early-owner-task"); receipt(f.dir, "coord.json", period, "early-coord-task");
  const cov = (ref: string) => ({ status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: ref, refs: [ref] });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: cov("frame.json"), coordinator_answers: [{ requestId: "early-coord-task", coverage: cov("coord.json") }] }));
  for (const [requestId, to] of [["early-owner-task", "owner"], ["early-coord-task", "coordinator"]] as const) {
    const q = { p: "P001", type: "question" as const, by: "agent" as const, to, requestId, msg: "synthetic timed question" };
    recordEvent(f.dir, { ...q, ts: "2026-01-01T10:00:00Z" });
    recordEvent(f.dir, { ...q, t: "T01", ts: "2026-01-01T12:00:00Z" });
  }
  const answer = { p: "P001", t: "T01", type: "answer" as const, msg: "synthetic timed answer" };
  const add = (ts: string) => {
    recordEvent(f.dir, { ...answer, ts, by: "user", requestId: "early-owner-task", ref: "owner.json" });
    recordEvent(f.dir, { ...answer, ts, by: "coordinator", requestId: "early-coord-task" });
  };
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  add("2026-01-01T11:00:00Z");
  const early = get(); assert.equal(early.team.requests.ownerReply, 0); assert.equal(early.team.requests.coordinatorOwnAnswerObserved, 0); assert.equal(early.team.snapshot.counts.owner_questions, null);
  add("2026-01-01T13:00:00Z");
  const later = get(); assert.equal(later.team.requests.ownerReply, 1); assert.equal(later.team.snapshot.counts.owner_questions, null);
  const log = join(f.dir, "log.jsonl");
  writeFileSync(log, readFileSync(log, "utf8").split("\n").filter((line) => !line.includes("T11:00:00Z")).join("\n"));
  confirmRequestInput(f.dir, f.run);
  const clean = get(); assert.equal(clean.team.requests.coordinatorOwnAnswerObserved, 1); assert.equal(clean.team.snapshot.counts.owner_questions, 1);
});

test("R32 rebase가 처음의 유일한 팀 채택 입력을 없애면 마감 봉인을 보류한다", () => {
  const { f, worktree, run, dir } = mergeFixture(), name = "TEAM-MEASUREMENT.json", rel = `projects/${dir.split("/").at(-1)}/${name}`;
  // Give main and the fixture branch a shared measurement-only adoption before the deletion.
  writeFileSync(join(f.dir, name), readFileSync(join(dir, name)));
  assert.equal(f.git("add", "--", rel).status, 0); assert.equal(f.git("commit", "-qm", "synthetic-main-adoption").status, 0);
  assert.equal(f.git("-C", worktree, "rebase", "main").status, 0);
  unlinkSync(join(f.dir, name));
  assert.equal(f.git("add", "--", rel).status, 0); assert.equal(f.git("commit", "-qm", "synthetic-main-remove-adoption").status, 0);
  const result = run("project", "finish", "P001");
  assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /팀 채택 근거가 .*사라졌다/);
  assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
  assert.doesNotMatch(readFileSync(join(dir, "PROJECT.md"), "utf8"), /^- 상태: 병합 대기$/m);
  const retry = run("project", "finish", "P001"); assert.notEqual(retry.status, 0); assert.match(retry.stdout + retry.stderr, /팀 채택 이력이 있다/);
});

test("R32 역할 관측과 관측 없음은 역할·종류·수집 범위를 영수증에 함께 요구한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task" as const, closed: true, completionRef: "frame.json" };
  for (const name of ["maker", "reviewer"]) createTeamMember(f.root, name, name);
  receipt(f.dir, "frame.json", period);
  roleReceipt(f.dir, "activity.json", period, "maker", "activity");
  roleReceipt(f.dir, "none.json", period, "reviewer", "none");
  const role = (name: string, status: string, proof = "activity.json") => ({ role: name, workMs: 100, outputTokens: [], coverage: { status, reportedBy: "coordinator", refs: [proof] } });
  const get = (observations: unknown[]) => {
    writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, role_observations: observations }));
    const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout).team;
  };
  const unknown = get([role("maker", "unknown"), role("reviewer", "partial")]);
  assert.deepEqual(unknown.roles.map((r: { workMs: number | null }) => r.workMs), [null, null]); assert.equal(unknown.unusedRoleCandidates.length, 2);
  const bound = get([role("maker", "partial"), role("reviewer", "partial", "none.json")]);
  assert.deepEqual(bound.roles.map((r: { workMs: number | null }) => r.workMs), [100, null]); assert.deepEqual(bound.unusedRoleCandidates.map((r: { role: string }) => r.role), ["reviewer"]);
  writeFileSync(join(f.dir, "PROJECT-CLOSE.md"), "## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n");
  const check = (ref: string) => {
    writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [{ role: "reviewer", coverage: "observed-none", refs: [ref] }], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "frame.json" }));
    return teamRetrospectiveIssues(f.root, rel, [], ["reviewer"], period);
  };
  assert.match(check("activity.json").join(" "), /관측 없음 후보/); assert.deepEqual(check("none.json"), []);
  roleReceipt(f.dir, "reviewer-zero.json", period, "reviewer", "activity");
  const zero = get([{ ...role("reviewer", "partial", "reviewer-zero.json"), workMs: 0 }]);
  assert.equal(zero.roles.find((r: { name: string }) => r.name === "reviewer").workMs, 0);
  assert.ok(!zero.unusedRoleCandidates.some((r: { role: string }) => r.role === "reviewer"));
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [{ role: "reviewer", coverage: "observed-none", refs: ["none.json"] }], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "frame.json" }));
  assert.match(teamRetrospectiveIssues(f.root, rel, [], ["maker"], period).join(" "), /관측\/참여/);
});

test("R32 미채택 로그의 기존 건너뛰기와 새 팀의 엄격한 품질 판정을 구별한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, log = join(f.dir, "log.jsonl");
  recordEvent(f.dir, { ts: "2026-01-01T10:00:00Z", p: "P001", type: "question", by: "agent", requestId: "legacy-question", msg: "synthetic legacy event" });
  const valid = readFileSync(log, "utf8"); writeFileSync(log, valid + "synthetic invalid row\n");
  const old = f.run("project", "stats", "P001", "--json"); assert.equal(old.status, 0, old.stderr); assert.equal(JSON.parse(old.stdout).eventCounts.questions, 1);
  adoptTeamMetrics(f.root, rel); assert.notEqual(f.run("project", "stats", "P001", "--json").status, 0);
  writeFileSync(log, valid);
  for (const msg of ["reviewer pass blocking 2 should_fix 0", "tester reviewer pass blocking 0 should_fix 0"]) assert.notEqual(f.run("project", "log", "P001", "--type", "review", "--msg", msg).status, 0);
});

test("R33 표지 줄이 같아도 Markdown 문맥이 과거에 채택됐으면 재마감과 병합을 보류한다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false), path = join(dir, "PROJECT.md");
  const body = readFileSync(path, "utf8");
  const write = (text: string, message: string) => {
    writeFileSync(path, text);
    assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
    assert.equal(f.git("-C", worktree, "commit", "-qm", message).status, 0);
  };
  const commented = body.replace(/^(# [^\n]+)\n/, "$1\n<!--\n- 팀 측정: v1\n-->\n");
  write(commented, "synthetic-marker-example");
  const before = run("project", "stats", "P001", "--json"); assert.equal(before.status, 0, before.stderr); assert.equal(Object.hasOwn(JSON.parse(before.stdout), "team"), false);
  write(commented.replace("<!--\n- 팀 측정: v1\n-->\n", "- 팀 측정: v1\n"), "synthetic-activate-marker-by-context");
  assert.ok(JSON.parse(run("project", "stats", "P001", "--json").stdout).team);
  write(commented, "synthetic-hide-marker-by-context");
  const retry = run("project", "finish", "P001"); assert.notEqual(retry.status, 0); assert.match(retry.stdout + retry.stderr, /팀 채택 이력이 있다/);
  write(commented.replace(/^- 상태: 진행$/m, "- 상태: 병합 대기"), "synthetic-legacy-classification-control");
  const preview = f.run("project", "merge", "P001"); assert.notEqual(preview.status, 0); assert.match(preview.stdout + preview.stderr, /팀 finish 영수증/);
});

test("R33 역할 영수증의 안쪽 출처도 파일·로컬 지문 제한을 적용한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  createTeamMember(f.root, "maker", "maker"); receipt(f.dir, "frame.json", period); roleReceipt(f.dir, "role.json", period, "maker", "activity");
  const path = join(f.dir, "role.json"), proof = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, role_observations: [{ role: "maker", workMs: 100, outputTokens: [], coverage: { status: "partial", reportedBy: "coordinator", refs: ["role.json"] } }] }));
  const get = (sourceRef: string) => {
    writeFileSync(path, JSON.stringify({ ...proof, sourceRef }));
    const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout).team;
  };
  for (const inner of ["file:foo", "FiLe:bar", "local:abc", "role-observation:maker:none:file:bar"]) {
    const stats = get(`role-observation:maker:activity:${inner}`); assert.equal(stats.roles[0].workMs, null); assert.equal(stats.unusedRoleCandidates.length, 1);
  }
  assert.equal(get(proof.sourceRef).roles[0].workMs, 100);
  assert.equal(get(`role-observation:maker:activity:local:${digest("synthetic run")}`).roles[0].workMs, 100);
});

test("R34 이전 미지원 표지 버전은 현재 미채택 프로젝트의 마감과 병합을 막지 않는다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false), path = join(dir, "PROJECT.md");
  const original = readFileSync(path, "utf8");
  const commit = (text: string, message: string) => {
    writeFileSync(path, text);
    assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
    assert.equal(f.git("-C", worktree, "commit", "-qm", message).status, 0);
  };
  const commented = original.replace(/^(# [^\n]+)\n/, "$1\n<!--\n- 팀 측정: v2\n-->\n");
  commit(commented, "synthetic-unadopted-example");
  commit(commented.replace("<!--\n- 팀 측정: v2\n-->\n", "- 팀 측정: v2\n"), "synthetic-unsupported-marker");
  const active = run("project", "stats", "P001", "--json");
  assert.notEqual(active.status, 0); assert.match(active.stdout + active.stderr, /미지원 버전/);
  commit(commented, "synthetic-restore-legacy-example");
  const legacy = run("project", "stats", "P001", "--json");
  assert.equal(legacy.status, 0, legacy.stderr); assert.equal(Object.hasOwn(JSON.parse(legacy.stdout), "team"), false);
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr); assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
  const plan = f.run("project", "merge", "P001");
  assert.equal(plan.status, 0, plan.stdout + plan.stderr);
});

test("R35 단독 문서의 증빙을 받되 병행·귀속 미상 시간창은 관측만 남긴다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, log_coverage: c, counts: { owner_file_edits: 1 }, coverage: { owner_file_edits: c } }));
  const log = join(f.dir, "log.jsonl"), ref = join(f.dir, "frame.json"), proof = JSON.parse(readFileSync(ref, "utf8"));
  const ask = (requestId: string, task?: string) => {
    const evidence = `${requestId}.json`;
    receipt(f.dir, evidence, period, requestId);
    recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", t: task, type: "question", by: "agent", to: "owner", requestId, msg: "synthetic sample question" });
    recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", t: task, type: "answer", by: "user", requestId, ref: evidence, msg: "synthetic sample answer" });
  };
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team; };
  ask("document");
  confirmRequestInput(f.dir, f.run);
  const single = get(); assert.equal(single.requests.reachedTotal, 1); assert.equal(single.quality.blockingLogged, 0); assert.equal(single.manual.fileEdits.total, 1);
  writeFileSync(ref, JSON.stringify({ ...proof, sourceRef: "fixture:completion-without-scope" }));
  confirmRequestInput(f.dir, f.run);
  const unknown = get(); assert.equal(unknown.period.closed, true); assert.equal(unknown.requests.ownerReply, 1); assert.equal(unknown.requests.reachedTotal, null);
  writeFileSync(ref, JSON.stringify(proof));
  const held = () => {
    const mixed = get(); assert.equal(mixed.requests.ownerReply, 2); assert.equal(mixed.requests.reachedTotal, null);
    assert.equal(mixed.quality.blockingLogged, null); assert.equal(mixed.manual.fileEdits.total, null);
    assert.equal(mixed.snapshot.observed_counts.owner_questions, 2); assert.match(mixed.warnings.join(" "), /대표 업무 단독 수집 범위 미확인/);
    return mixed;
  };
  ask("other", "T02"); held(); // Project-scope work mixed with an explicit task.
  writeFileSync(log, ""); ask("first", "T01"); ask("second", "T02");
  const mixed = held();
  const compare = compareFixture(); receipt(compare.dir, "frame.json", period);
  writeFileSync(compare.after, JSON.stringify({ version: 1, samples: [mixed.snapshot] }));
  const compared = compare.compare(); assert.equal(compared.conclusion, "unknown"); assert.equal(compared.sources.after.counts.owner_questions, null); assert.match(compared.reasons.join(" "), /대표 업무 단독 수집 범위 미확인/);
});

test("R35 검증된 중계의 typed 답은 원장 답 행이 없어도 원 요청에 귀속한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = "typed-relay-answer";
  store.record({ protocol: "pace-handoff", v: 1, id: "first", kind: "decision_request", from: "coordinator", to: "owner", task: "T01", requestId, data: { interpretation: false } }, "SYNTHETIC proposal");
  store.record({ protocol: "pace-handoff", v: 1, id: "relay", kind: "decision_request", from: "coordinator", to: "owner", task: "T02", requestId, data: { interpretation: false, relayOf: "first" } }, "SYNTHETIC proposal");
  const rows = store.read();
  writeFileSync(store.path, rows.map((r, i) => JSON.stringify({ ...r, at: `2026-01-01T0${i + 1}:00:00Z` })).join("\n") + "\n");
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period); receipt(f.dir, "reply.json", period, requestId);
  writeFileSync(join(f.dir, "mirror.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: "handoff:relay", hash: rows[1]!.bodyHash, requestId }));
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c }));
  const evt = { p: "P001", t: "T02", requestId, msg: "synthetic verified relay event" };
  recordEvent(f.dir, { ...evt, ts: "2026-01-01T02:30:00Z", type: "question", by: "agent", to: "owner", ref: "mirror.json" });
  recordEvent(f.dir, { ...evt, ts: "2026-01-01T01:30:00Z", type: "answer", by: "user", ref: "reply.json" });
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  assert.equal(get().team.requests.ownerReply, 0);
  recordEvent(f.dir, { ...evt, ts: "2026-01-01T03:00:00Z", type: "answer", by: "user", ref: "reply.json" });
  const after = get(); assert.equal(after.team.requests.ownerReply, 1); assert.equal(after.handoffs.requests.owner_reply, 1);
  // The earlier out-of-route answer remains an observed scope contradiction.
  assert.equal(after.team.requests.reachedTotal, null);
  const log = join(f.dir, "log.jsonl"), cleaned = readFileSync(log, "utf8").split("\n").filter((line) => !line.includes("T01:30:00Z")).join("\n");
  writeFileSync(log, cleaned);
  confirmRequestInput(f.dir, f.run);
  assert.equal(get().team.requests.reachedTotal, 1);
});

test("R35 폴더 이름을 바꿔도 같은 프로젝트 번호의 팀 마감 이력은 남는다", () => {
  const { f, worktree, run, dir } = mergeFixture();
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  const next = join(worktree, "projects/P001_261124_renamed");
  renameSync(dir, next);
  for (const file of ["TEAM-MEASUREMENT.json", "TEAM-RETROSPECTIVE.json", "TEAM-FINISH.json"]) unlinkSync(join(next, file));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-rename-remove-team").status, 0);
  const result = f.run("project", "merge", "P001");
  assert.notEqual(result.status, 0); assert.match(result.stdout + result.stderr, /팀 finish 영수증/);
});

test("R35 rebase에서 받아온 과거 채택 이력도 첫 마감부터 보류한다", () => {
  const { f, worktree, run } = mergeFixture("true", "true", false), path = join(f.dir, "TEAM-MEASUREMENT.json");
  writeFileSync(path, '{"version":1}\n');
  assert.equal(f.git("add", "--", path).status, 0); assert.equal(f.git("commit", "-qm", "synthetic-adopt-on-main").status, 0);
  unlinkSync(path);
  assert.equal(f.git("add", "--", path).status, 0); assert.equal(f.git("commit", "-qm", "synthetic-remove-on-main").status, 0);
  const result = run("project", "finish", "P001"); assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /기준 브랜치에만 팀 채택 이력이 있다/);
  assert.notEqual(f.git("-C", worktree, "merge-base", "--is-ancestor", "main", "HEAD").status, 0);
});

test("R36 중계 사슬의 부모보다 이른 제안은 이어진 답과 성공 전달을 도달로 세지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  for (const [id, path] of [["reply-chain", "reply"], ["sent-chain", "sent"]] as const) {
    for (const [index, part] of ["root", "first", "second"].entries()) {
      store.record({ protocol: "pace-handoff", v: 1, id: `${id}-${part}`, kind: "decision_request", from: "coordinator", to: "owner", requestId: id, data: { interpretation: false, ...(index ? { relayOf: `${id}-${index === 1 ? "root" : "first"}` } : {}) } }, "SYNTHETIC same relay chain");
    }
    const proposal = store.read().find((r) => r.id === `${id}-second`)!;
    if (path === "reply") store.record({ protocol: "pace-handoff", v: 1, id: `${id}-answer`, kind: "decision_reply", from: "owner", to: "coordinator", requestId: id, data: { re: proposal.id, decision: "approve", proposalHash: proposalDigest(proposal), sourceRef: "fixture:answer" } }, "SYNTHETIC reply");
    else {
      prepareDelivery(store, proposal.id, "chain-attempt", { transport: "external", actor: "owner", target: "fixture-human", from: "coordinator", sourceRef: "fixture:route" });
      deliveryReceipt(store, "chain-attempt", { phase: "sent", reportedBy: "coordinator", sourceRef: "fixture:route", responseHash: digest("synthetic"), responseId: "synthetic-send" });
    }
  }
  const rows = store.read(), get = (firstHour: string) => {
    for (const r of rows) r.at = `2026-01-01T${r.id.endsWith("-root") ? "10" : r.id.endsWith("-first") ? firstHour : r.id.endsWith("-second") ? "12" : r.data.phase === "sent" ? "15" : "13"}:00:00Z`;
    writeFileSync(store.path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout).team.requests;
  };
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, coordinator_answers: [] }));
  const invalid = get("14"); assert.equal(invalid.ownerReply, 0); assert.equal(invalid.ownerDelivery, 0); assert.equal(invalid.unconfirmed, 2); assert.equal(invalid.reachedTotal, null);
  const valid = get("11"); assert.equal(valid.ownerReply, 1); assert.equal(valid.ownerDelivery, 1); assert.equal(valid.reachedTotal, 2);
  const snapshot = JSON.parse(f.run("project", "stats", "P001", "--json").stdout).team.snapshot;
  for (const key of ["coordinator_answers", "failed_owner_delivery_attempts"]) {
    assert.equal(snapshot.counts[key], null); assert.equal(snapshot.observed_counts[key], 0);
  }
});

test("R36 마감 집계에서 처음 없던 원장이 생기면 회고 입력만 갱신해 봉인할 수 없다", () => {
  const { f, worktree, dir } = mergeFixture(), rel = `projects/${dir.split("/").at(-1)}`, store = new HandoffStore(worktree, "P001", rel);
  store.record({ protocol: "pace-handoff", v: 1, id: "new-ledger-request", kind: "decision_request", from: "coordinator", to: "owner", requestId: "new-ledger-request", data: { interpretation: false } }, "SYNTHETIC concurrent request");
  const ledger = readFileSync(store.path, "utf8"); unlinkSync(store.path);
  const log = join(dir, "log.jsonl"), inject = join(tempDir("pace-new-ledger-"), "inject.mjs");
  writeFileSync(inject, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const original=fs.lstatSync; let fired=false;
fs.lstatSync=function(path,...options){try{return original(path,...options)}catch(error){if(!fired && error.code==='ENOENT' && path===${JSON.stringify(store.path)} && new Error().stack.includes('observeHandoffLedger') && fs.readFileSync(${JSON.stringify(log)},'utf8').split('\\n').some(line=>{try{const e=JSON.parse(line);return e.ok===true && e.data?.finish===1}catch{return false}})){fired=true;fs.writeFileSync(path,${JSON.stringify(ledger)});} throw error;}}; syncBuiltinESMExports();`);
  const finish = runPace(["project", "finish", "P001"], { cwd: worktree, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(inject).href}` } });
  assert.notEqual(finish.status, 0); assert.match(finish.stdout + finish.stderr, /검증 중 입력이 바뀌었다/);
  assert.equal(readFileSync(store.path, "utf8"), ledger); assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
});

test("R36 다른 이름의 HTML 닫는 태그는 회고 예시 블록을 끝내지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  const path = join(f.dir, "PROJECT-CLOSE.md"), table = "| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  const body = `## 회고\n\n<textarea>\n</style>\n\n${table}\n</TEXTAREA>\n`;
  writeFileSync(path, body); assert.ok(teamRetrospectiveIssues(f.root, rel).length);
  writeFileSync(path, `${body}\n${table}`); assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
});

test("R37 원래 HTML 절과 실제 고정 링크만 회고 관문을 통과한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`; adoptTeamMetrics(f.root, rel); receipt(f.dir);
  const path = join(f.dir, "PROJECT-CLOSE.md");
  const good = "## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 |\n";
  writeFileSync(join(f.dir, "TEAM-RETROSPECTIVE.json"), JSON.stringify({ version: 1, metricRef: "METRICS.md", unusedRoles: [], recurringFindings: [], definitionChanges: [], noChangesReasonRef: "proof.json" }));
  for (const invalid of ["<textarea/>\n" + good, "<SCRIPT/>\n" + good, good.replace("[회고]", "[회고\\]"), good.replace("[회고]", "[회고[근거]]")]) {
    writeFileSync(path, invalid);
    assert.match(teamRetrospectiveIssues(f.root, rel).join(" "), /고정 JSON 링크/);
  }
  writeFileSync(path, "<textarea/>\n</TEXTAREA>\n\n" + good);
  assert.deepEqual(teamRetrospectiveIssues(f.root, rel), []);
  symlinkSync("synthetic-absent.jsonl", join(f.dir, "handoffs.jsonl"));
  assert.match(teamRetrospectiveIssues(f.root, rel).join(" "), /링크/);
  const invalidStats = f.run("project", "stats", "P001", "--json");
  assert.notEqual(invalidStats.status, 0); assert.match(invalidStats.stdout + invalidStats.stderr, /링크/);
});

test("R38 전체 구간의 올바른 사용자 답은 보존하되 다른 태스크 답이 총량을 미확인으로 둔다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period); receipt(f.dir, "answer.json", period, "scoped-answer");
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c }));
  const question = { p: "P001", requestId: "scoped-answer", msg: "synthetic request" };
  recordEvent(f.dir, { ...question, ts: "2026-01-01T01:00:00Z", t: "T01", type: "question", by: "agent", to: "owner" });
  recordEvent(f.dir, { ...question, ts: "2026-01-01T02:00:00Z", t: "T01", type: "answer", by: "user", ref: "answer.json" });
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  confirmRequestInput(f.dir, f.run);
  assert.equal(get().team.requests.reachedTotal, 1);
  recordEvent(f.dir, { ...question, ts: "2026-01-01T03:00:00Z", t: "T02", type: "answer", by: "user", ref: "answer.json" });
  const held = get(); assert.equal(held.team.requests.ownerReply, 1); assert.equal(held.team.requests.reachedTotal, null);
  assert.equal(held.team.requests.comparisonUnconfirmed, 1); assert.deepEqual(held.handoffs.attributionUnconfirmedRequests, ["scoped-answer"]);
});

test("R38 코디네이터 자체 답 영수증에는 원장 응답 식별자를 사용할 수 없다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period); receipt(f.dir, "own.json", period, "coord-own");
  const path = join(f.dir, "own.json"), receiptData = JSON.parse(readFileSync(path, "utf8"));
  const c = (ref: string) => ({ status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: ref, refs: [ref] });
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c("frame.json"), coordinator_answers: [{ requestId: "coord-own", coverage: c("own.json") }] }));
  recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", requestId: "coord-own", type: "question", by: "agent", to: "coordinator", msg: "synthetic question" });
  recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", requestId: "coord-own", type: "answer", by: "coordinator", msg: "synthetic answer" });
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team; };
  writeFileSync(path, JSON.stringify({ ...receiptData, decisionReplyId: "other-request-approval" }));
  assert.equal(get().requests.reachedTotal, null);
  writeFileSync(path, JSON.stringify(receiptData));
  confirmRequestInput(f.dir, f.run);
  assert.equal(get().requests.reachedTotal, 0);
});

test("R38 현재와 과거 프로젝트 본문의 코드 예시는 팀 머리 판독에 영향을 주지 않는다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false), path = join(dir, "PROJECT.md");
  const original = readFileSync(path, "utf8");
  const commit = (text: string, message: string) => {
    writeFileSync(path, text); assert.equal(f.git("-C", worktree, "add", "-A").status, 0); assert.equal(f.git("-C", worktree, "commit", "-qm", message).status, 0);
  };
  const example = "\n\n```md\n- 팀 측정: v1\n```\n\n설명 `미완성 <!-- 예시\n";
  const firstSection = original.indexOf("\n## 목적");
  assert.ok(firstSection > 0);
  const boundaries = [
    "", "## 예시", "  ## 예시", "## 예시 <!-- 설명\n-->", "-\t설명: 목록\n\n  ## 예시",
    "1. 첫 항목\n20. 다른 너비의 다음 항목\n\n   ## 예시", "본문 제목\n---",
  ];
  for (const [i, boundary] of boundaries.entries()) {
    commit(original.slice(0, firstSection) + "\n\n" + boundary + example + original.slice(firstSection), `synthetic-legacy-body-example-${i}`);
    const stats = run("project", "stats", "P001", "--json"); assert.equal(stats.status, 0, stats.stderr); assert.equal(Object.hasOwn(JSON.parse(stats.stdout), "team"), false);
  }
  commit(original, "synthetic-remove-legacy-example");
  const finish = run("project", "finish", "P001"); assert.equal(finish.status, 0, finish.stdout + finish.stderr);
  const preview = f.run("project", "merge", "P001"); assert.equal(preview.status, 0, preview.stdout + preview.stderr);
});

test("R40 목록 설명과 빈 줄 뒤의 제목을 실제 본문으로 오인해 팀 표지를 건너뛰지 않는다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false), path = join(dir, "PROJECT.md");
  const original = readFileSync(path, "utf8");
  const afterList = (text: string, list: string) => text.replace("\n## 목적", `\n${list}\n\n- 팀 측정: v1\n\n## 목적`);
  const nestedHeadings = [
    "- 상태 설명\n  이어지는 설명\n\n  ## 목록 제목",
    "1. 상태 설명\n   이어지는 설명\n\n   ## 목록 제목",
    "- 상태 설명\n들여쓰지 않은 목록 문단의 후속 행\n  ## 목록 제목",
  ];
  for (const list of nestedHeadings) {
    writeFileSync(path, afterList(original, list));
    const stats = run("project", "stats", "P001", "--json");
    assert.equal(stats.status, 2, stats.stderr); assert.match(stats.stderr + stats.stdout, /열0/);
  }
  const beforeFinish = readFileSync(path, "utf8");
  const held = run("project", "finish", "P001");
  assert.notEqual(held.status, 0); assert.match(held.stderr + held.stdout, /팀 측정\/회고 입력.*finish 보류/);
  assert.equal(readFileSync(path, "utf8"), beforeFinish);

  for (const list of ["- 설명\n  ```md\n  묶인 예시", "- 설명\n  <textarea>\n  묶인 예시", "- 설명\n---"]) {
    writeFileSync(path, afterList(original, list));
    const stats = run("project", "stats", "P001", "--json");
    assert.equal(stats.status, 0, stats.stderr); assert.ok(JSON.parse(stats.stdout).team);
  }
  writeFileSync(path, original);
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  writeFileSync(path, afterList(readFileSync(path, "utf8"), nestedHeadings[0]!));
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-ambiguous-team-heading").status, 0);
  const preview = f.run("project", "merge", "P001");
  assert.notEqual(preview.status, 0); assert.match(preview.stderr + preview.stdout, /열0/);
});

test("R39 뒤늦은 중계가 먼저 기록된 다른 태스크 답의 미확인을 지우지 않는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = "late-relay";
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period); receipt(f.dir, "answer.json", period, requestId);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c }));
  const proposal = { protocol: "pace-handoff" as const, v: 1 as const, kind: "decision_request" as const, from: "coordinator", to: "owner", requestId };
  store.record({ ...proposal, id: "root", task: "T01", data: { interpretation: false } }, "SYNTHETIC same request");
  store.record({ ...proposal, id: "relay", task: "T02", data: { interpretation: false, relayOf: "root" } }, "SYNTHETIC same request");
  const rows = store.read();
  const stage = (relayAt: string) => writeFileSync(store.path, rows.map((row, i) => JSON.stringify({ ...row, at: i ? relayAt : "2026-01-01T01:00:00Z" })).join("\n") + "\n");
  stage("2026-01-01T04:00:00Z");
  const answer = { p: "P001", requestId, ref: "answer.json", type: "answer" as const, by: "user" as const, msg: "synthetic answer" };
  recordEvent(f.dir, { ...answer, ts: "2026-01-01T02:00:00Z", t: "T01" });
  recordEvent(f.dir, { ...answer, ts: "2026-01-01T03:00:00Z", t: "T02" });
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team; };
  confirmRequestInput(f.dir, f.run);
  const late = get(); assert.equal(late.requests.ownerReply, 1); assert.equal(late.requests.comparisonUnconfirmed, 1); assert.equal(late.requests.reachedTotal, null);
  stage("2026-01-01T02:30:00Z");
  confirmRequestInput(f.dir, f.run);
  const early = get(); assert.equal(early.requests.ownerReply, 1); assert.equal(early.requests.comparisonUnconfirmed, 0); assert.equal(early.requests.reachedTotal, 1);
});

test("R41 원장 답의 명시 태스크를 직접 제안과 대조하고 확인된 중계 답을 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = "reply-scope";
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage }));
  const proposal = { protocol: "pace-handoff" as const, v: 1 as const, kind: "decision_request" as const, from: "coordinator", to: "owner", requestId };
  store.record({ ...proposal, id: "root", task: "T01", data: { interpretation: false } }, "SYNTHETIC proposal");
  store.record({ ...proposal, id: "relay", task: "T02", data: { interpretation: false, relayOf: "root" } }, "SYNTHETIC proposal");
  for (const [id, re] of [["wrong", "root"], ["right", "relay"]]) {
    store.record({ ...proposal, id, kind: "decision_reply", from: "owner", to: "coordinator", task: "T02", data: { re, decision: "approve", sourceRef: "fixture:reply-scope", proposalHash: proposalDigest(store.read().find((r) => r.id === re)!) } }, "SYNTHETIC answer");
  }
  const rows = store.read().map((r, i) => ({ ...r, at: `2026-01-01T0${i + 1}:00:00Z` }));
  const get = (omitted: string | undefined) => {
    const fixtureRows = rows.filter((row) => row.id !== omitted).map((row, i) => JSON.stringify({ ...row, seq: i + 1 }));
    writeFileSync(store.path, fixtureRows.join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
  };
  const wrong = get("right");
  assert.equal(wrong.team.requests.ownerReply, 0);
  assert.equal(wrong.handoffs.requests.unconfirmed, 1);
  assert.equal(wrong.team.requests.reachedTotal, null);
  const mixed = get(undefined);
  assert.equal(mixed.team.requests.ownerReply, 1);
  assert.equal(mixed.team.requests.attributionUnconfirmed, 1);
  assert.equal(mixed.team.requests.reachedTotal, null);
  const clean = get("wrong");
  assert.equal(clean.team.requests.ownerReply, 1);
  assert.equal(clean.team.requests.reachedTotal, 1);
});

test("R41 전송 결과가 모호하면 실패 시도 관측은 남기고 실패만 남은 요청의 총량을 보류한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel), requestId = "failure-scope";
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] } }));
  store.record({ protocol: "pace-handoff", v: 1, id: "question", kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC question");
  const route = { transport: "external", actor: "owner", target: "fixture-human-route", from: "coordinator", sourceRef: "fixture:receipt" };
  prepareDelivery(store, "question", "attempt-one", route);
  deliveryReceipt(store, "attempt-one", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
  const rows = store.read();
  const get = (end: string) => {
    const clocks = ["01:00", "02:00", end];
    writeFileSync(store.path, rows.map((row, i) => JSON.stringify({ ...row, at: `2026-01-01T${clocks[i]}:00Z` })).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team;
  };
  const unknown = get("01:30");
  assert.equal(unknown.requests.failedAttemptsObserved, 1);
  assert.equal(unknown.snapshot.observed_counts.failed_only_owner_requests, 0);
  assert.equal(unknown.snapshot.counts.failed_only_owner_requests, null);
  const confirmed = get("03:00");
  assert.equal(confirmed.snapshot.counts.failed_only_owner_requests, 1);
});

test("R72 원장 전송의 시작과 완료 머리를 원제안과 대조하고 독립 답과 실패를 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] } }));
  for (const id of ["sent", "answered"]) {
    store.record({ protocol: "pace-handoff", v: 1, id: `${id}-question`, kind: "decision_request", from: "coordinator", to: "owner", task: "T01", requestId: id, data: { interpretation: false } }, "Synthetic question");
  }
  const route = { transport: "external", actor: "owner", target: "fixture-human", from: "coordinator", sourceRef: "fixture:route" };
  prepareDelivery(store, "sent-question", "first-attempt", route);
  deliveryReceipt(store, "first-attempt", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
  prepareDelivery(store, "sent-question", "second-attempt", route);
  deliveryReceipt(store, "second-attempt", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseHash: digest("synthetic receipt bytes"), responseId: "receipt-02" });
  const proposal = store.read().find((r) => r.id === "answered-question")!;
  store.record({ protocol: "pace-handoff", v: 1, id: "separate-answer", kind: "decision_reply", from: "owner", to: "coordinator", task: "T01", requestId: proposal.requestId, data: { re: proposal.id, decision: "approve", proposalHash: proposalDigest(proposal), sourceRef: "fixture:answer" } }, "Synthetic independent answer");

  const rows = store.read().map((row, i) => ({ ...row, at: new Date(Date.parse(period.start) + (i + 1) * 60_000).toISOString() }));
  const requests = (changedIds: readonly string[], changes: Record<string, string | undefined> = {}) => {
    writeFileSync(store.path, rows.map((row) => JSON.stringify(changedIds.includes(row.id) ? { ...row, ...changes } : row)).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const result = f.run("project", "stats", "P001", "--json");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).team.requests;
  };
  for (const [changedId, changes] of [
    ["second-attempt-sent", { to: "coordinator" }],
    ["second-attempt-sent", { task: "T02" }],
    ["second-attempt-started", { from: "owner" }],
  ] as const) {
    const invalid = requests([changedId], changes);
    assert.equal(invalid.ownerDelivery, 0, JSON.stringify(changes));
    assert.equal(invalid.ownerReply, 1);
    assert.equal(invalid.failedAttemptsObserved, 1);
    assert.equal(invalid.unconfirmed, 1);
    assert.equal(invalid.reachedTotal, null);
  }
  const missingRequestIds = requests(["second-attempt-started", "second-attempt-sent"], { requestId: undefined });
  assert.equal(missingRequestIds.ownerDelivery, 0);
  assert.equal(missingRequestIds.ownerReply, 1);
  assert.equal(missingRequestIds.failedAttemptsObserved, 1);
  assert.equal(missingRequestIds.failedOnly, 0);
  assert.equal(missingRequestIds.unconfirmed, 1);
  assert.equal(missingRequestIds.reachedTotal, null);
  const reportedFailure = requests(["first-attempt-failed", "second-attempt-sent"], { requestId: undefined });
  assert.equal(reportedFailure.failedAttemptsObserved, 1);
  assert.equal(reportedFailure.failedOnly, 0);
  assert.equal(reportedFailure.unconfirmed, 1);
  assert.equal(reportedFailure.ownerReply, 1);
  const valid = requests([]);
  assert.equal(valid.ownerDelivery, 1);
  assert.equal(valid.ownerReply, 1);
  assert.equal(valid.failedAttemptsObserved, 1);
  assert.equal(valid.reachedTotal, 2);
});

test("R73 후속 전송 확인은 앞선 모든 상태보다 늦어야 도달이나 실패만 남은 요청으로 인정한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  const period = { start: "2026-01-01T08:00:00Z", end: "2026-01-01T12:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] } }));
  for (const id of ["sent", "failed", "answered"]) {
    const question = store.record({ protocol: "pace-handoff", v: 1, id: `${id}-question`, kind: "decision_request", from: "coordinator", to: "owner", requestId: id, data: { interpretation: false } }, "Synthetic question").record;
    if (id === "answered") {
      store.record({ protocol: "pace-handoff", v: 1, id: "independent-reply", kind: "decision_reply", from: "owner", to: "coordinator", requestId: id, data: { re: question.id, decision: "approve", proposalHash: proposalDigest(question), sourceRef: "fixture:answer" } }, "Synthetic independent reply");
      continue;
    }
    const route = { transport: "external", actor: "owner", target: "fixture-human", from: "coordinator", sourceRef: `fixture:${id}` };
    prepareDelivery(store, question.id, `${id}-attempt`, route);
    deliveryReceipt(store, `${id}-attempt`, { phase: "unconfirmed", reportedBy: "coordinator", sourceRef: route.sourceRef });
    deliveryReceipt(store, `${id}-attempt`, { phase: id, reportedBy: "coordinator", sourceRef: route.sourceRef, ...(id === "sent" ? { responseHash: digest("synthetic response"), responseId: "receipt-late" } : {}) });
  }

  const rows = store.read();
  const report = (pendingAt: string) => {
    const time = { started: "10:00", unconfirmed: pendingAt, sent: "11:00", failed: "11:00" };
    writeFileSync(store.path, rows.map((row) => {
      const clock = row.kind === "decision_request" ? "09:00" : row.kind === "decision_reply" ? "11:30" : time[row.data.phase as keyof typeof time];
      return JSON.stringify({ ...row, at: `2026-01-01T${clock}:00Z` });
    }).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const result = f.run("project", "stats", "P001", "--json");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).team.requests;
  };
  for (const time of ["10:30", "11:00", "15:00"]) {
    const invalid = time === "15:00";
    const result = report(time);
    assert.equal(result.ownerDelivery, invalid ? 0 : 1);
    assert.equal(result.failedOnly, invalid ? 0 : 1);
    assert.equal(result.ownerReply, 1);
    assert.equal(result.failedAttemptsObserved, 1);
    assert.equal(result.unconfirmed, invalid ? 2 : 0);
    assert.equal(result.reachedTotal, invalid ? null : 2);
  }
});

test("R75 더러운 팀 마감은 HEAD·객체·인덱스·원장·원문을 그대로 보존한다", () => {
  const { f, worktree, dir, run } = mergeFixture();
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  const stagedPath = join(dir, "staged-note.txt"), privatePath = join(dir, "private-receipt.json");
  writeFileSync(stagedPath, "Synthetic staged version.\n");
  assert.equal(git("add", "--", stagedPath).status, 0);
  writeFileSync(stagedPath, "Synthetic unstaged version.\n");
  const body = '{"version":1,"body":"Synthetic private sentence."}';
  writeFileSync(privatePath, body);
  const log = join(dir, "log.jsonl");
  recordEvent(dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", msg: "Synthetic receipt", ref: "private-receipt.json" });
  const events = readFileSync(log), head = git("rev-parse", "HEAD").stdout, objects = git("count-objects", "-v").stdout;
  const indexPath = git("rev-parse", "--path-format=absolute", "--git-path", "index").stdout.trim();
  const index = readFileSync(indexPath);
  const stopped = run("project", "finish", "P001");
  assert.notEqual(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout + stopped.stderr, /팀 마감.*검토.*커밋/);
  assert.equal(git("rev-parse", "HEAD").stdout, head);
  assert.equal(git("count-objects", "-v").stdout, objects);
  assert.deepEqual(readFileSync(indexPath), index);
  assert.deepEqual(readFileSync(log), events);
  assert.equal(readFileSync(stagedPath, "utf8"), "Synthetic unstaged version.\n");
  assert.equal(readFileSync(privatePath, "utf8"), body);
});

test("R75 기준 브랜치에만 채택 이력이 있어도 자동 반영과 실패 로그 기록을 보류한다", () => {
  const { f, worktree, dir, run } = mergeFixture("true", "true", false);
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  const rel = `projects/${dir.split("/").at(-1)}`;
  adoptTeamMetrics(f.root, rel);
  assert.equal(f.git("add", "--", join(f.dir, "PROJECT.md")).status, 0);
  assert.equal(f.git("commit", "-qm", "synthetic-team-base").status, 0);
  const log = join(dir, "log.jsonl"), raw = join(dir, "raw.json");
  recordEvent(dir, { ts: new Date().toISOString(), p: "P001", type: "answer", by: "user", msg: "Synthetic receipt", ref: "raw.json" });
  const body = '{"version":1,"body":"Synthetic private sentence."}';
  writeFileSync(raw, body);
  const events = readFileSync(log), head = git("rev-parse", "HEAD").stdout, objects = git("count-objects", "-v").stdout;
  const index = git("diff", "--cached", "--binary").stdout;
  const stopped = run("project", "finish", "P001");
  assert.notEqual(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout + stopped.stderr, /기준 브랜치에만 팀 채택 이력이 있다/);
  assert.equal(git("rev-parse", "HEAD").stdout, head);
  assert.equal(git("count-objects", "-v").stdout, objects);
  assert.equal(git("diff", "--cached", "--binary").stdout, index);
  assert.deepEqual(readFileSync(log), events);
  assert.equal(readFileSync(raw, "utf8"), body);
});

test("R75 검토 커밋을 팀 마감의 부모로 쓰고 하네스 경로만 새 커밋에 담는다", () => {
  const { f, worktree, dir, run } = mergeFixture();
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  const rel = `projects/${dir.split("/").at(-1)}`, reviewed = join(dir, "reviewed-note.md");
  const store = new HandoffStore(worktree, "P001", rel);
  const localBody = "Synthetic private owner input.";
  const record = store.record({ protocol: "pace-handoff", v: 1, id: "fixture-input", kind: "owner_input", from: "owner", to: "coordinator", data: { sourceRef: "fixture:input" } }, localBody);
  writeFileSync(reviewed, "Synthetic reviewed note.\n");
  assert.equal(git("add", "--", reviewed, store.path).status, 0);
  assert.equal(git("commit", "-qm", "synthetic-reviewed-candidate").status, 0);
  const head = git("rev-parse", "HEAD").stdout.trim();
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  const target = git("rev-parse", "HEAD").stdout.trim();
  assert.equal(git("rev-parse", "HEAD^").stdout.trim(), head);
  const outputs = new Set([`${rel}/PROJECT.md`, `${rel}/METRICS.md`, `${rel}/log.jsonl`, `${rel}/TEAM-FINISH.json`, "projects/METRICS.md"]);
  for (const changed of git("diff", "--name-only", head, target).stdout.trim().split("\n")) assert.ok(outputs.has(changed), changed);
  assert.equal(JSON.parse(readFileSync(join(dir, "TEAM-FINISH.json"), "utf8")).checkedParent, head);
  assert.equal(readFileSync(record.localBodyPath, "utf8"), localBody);
  assert.doesNotMatch(git("grep", "-F", localBody, "HEAD").stdout, /Synthetic private owner input/);
  const preview = f.run("project", "merge", "P001");
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.ok(preview.stdout.includes(target));
});

test("R75 비팀 마감은 미리 커밋하지 않은 변경에 기존 목차 커밋 경로를 유지한다", () => {
  const { f, worktree, dir, run } = mergeFixture("true", "true", false);
  const note = join(dir, "legacy-note.txt"), rel = `projects/${dir.split("/").at(-1)}/legacy-note.txt`;
  writeFileSync(note, "Synthetic legacy note.\n");
  const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  assert.equal(f.git("-C", worktree, "rev-parse", "HEAD^^").stdout.trim(), head);
  assert.equal(f.git("-C", worktree, "show", `HEAD^:${rel}`).stdout, "Synthetic legacy note.\n");
  assert.match(f.git("-C", worktree, "log", "-1", "--format=%s", "HEAD^").stdout, /목차 갱신/);
});

test("R81 비팀 보안 검사의 정상 산출물은 기존 목차 커밋으로 마감한다", () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture("true", "node security-fixture.mjs", false);
  const rel = `projects/${dir.split("/").at(-1)}/security-result.txt`;
  const script = join(worktree, "security-fixture.mjs");
  writeFileSync(script, `import {writeFileSync} from "node:fs"; writeFileSync(${JSON.stringify(rel)}, "Synthetic security result.\\n");`);
  reviewed("synthetic-legacy-security", script);
  const result = run("project", "finish", "P001");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(f.git("-C", worktree, "log", "-1", "--format=%s", "HEAD^").stdout, /목차 갱신/);
  assert.equal(f.git("-C", worktree, "show", `HEAD^:${rel}`).stdout, "Synthetic security result.\n");
  assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
});

for (const sourceInProject of [false, true]) test(`R83 비팀 보안 검사의 이름 변경은 출발 경로도 검사한다 (프로젝트 원본=${sourceInProject})`, () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture("true", "node security-fixture.mjs", false);
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  assert.equal(git("config", "status.renames", "true").status, 0);
  const rel = `projects/${dir.split("/").at(-1)}`;
  const source = sourceInProject ? `${rel}/from.txt` : "outside-from.txt", target = `${rel}/to.txt`;
  const script = join(worktree, "security-fixture.mjs");
  writeFileSync(join(worktree, source), "Synthetic legacy path.\n");
  writeFileSync(script, `import {execFileSync} from "node:child_process"; execFileSync("git", ${JSON.stringify(["mv", "--", source, target])});`);
  reviewed("synthetic reviewed source", script, join(worktree, source));
  const head = git("rev-parse", "HEAD").stdout;
  const result = run("project", "finish", "P001");
  if (sourceInProject) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(git("show", `HEAD^:${target}`).stdout, "Synthetic legacy path.\n");
  } else {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /범위 밖에서 바뀌었다: outside-from.txt/);
    assert.equal(git("rev-parse", "HEAD").stdout, head);
    assert.equal(git("show", `HEAD:${source}`).stdout, "Synthetic legacy path.\n");
    assert.equal(git("show", `:${target}`).stdout, "Synthetic legacy path.\n");
    assert.match(git("diff", "--cached", "--name-status", "-M").stdout, /^R100\toutside-from\.txt\t/m);
  }
});

test("R81 작업 폴더의 ignored 태스크 증거만으로 팀 후보를 봉인하지 않는다", () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture();
  const opened = run("project", "task", "P001", "synthetic evidence");
  assert.equal(opened.status, 0, opened.stdout + opened.stderr);
  const tasks = join(dir, "tasks"), task = join(tasks, readdirSync(tasks).find((name) => name.startsWith("T01_"))!);
  const contract = join(task, "TASK.md"), close = join(task, "TASK-CLOSE.md"), evidence = join(task, "evidence", "proof.txt");
  const bundle = join(task, "evidence", "bundle");
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(bundle, "sample.txt"), "Synthetic committed evidence group.\n");
  writeFileSync(contract, "# synthetic task\n\n- 상태: 진행\n\n## 기준\n\n| # | 기준 |\n|---|---|\n| T-1 | Synthetic criterion |\n");
  writeFileSync(close, "# synthetic close\n\n- 태스크: TASK.md · 판정: 통과\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| T-1 | 통과 | evidence/proof.txt, evidence/bundle |\n\n## 단위 테스트\nSynthetic result\n\n## E2E\nSynthetic scope\n\n## 리뷰\nSynthetic review\n\n## 남긴 것\nSynthetic handoff\n");
  writeFileSync(evidence, "Synthetic working-only proof.\n");
  const done = run("project", "done", "P001", "T01");
  assert.equal(done.status, 0, done.stdout + done.stderr);
  const ignore = join(worktree, ".gitignore");
  writeFileSync(ignore, "**/evidence/proof.txt\n");
  reviewed("feat(P001/T01): synthetic checked task", contract, close, ignore, bundle, join(dir, "PROJECT.md"), join(dir, "log.jsonl"));
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  const head = git("rev-parse", "HEAD").stdout;
  const rejected = run("project", "finish", "P001");
  assert.notEqual(rejected.status, 0, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout + rejected.stderr, /검사 후보의 증거 파일이 없다.*evidence\/proof\.txt/);
  assert.equal(git("rev-parse", "HEAD").stdout, head);
  assert.equal(readFileSync(evidence, "utf8"), "Synthetic working-only proof.\n");
  assert.equal(git("add", "-f", "--", evidence).status, 0);
  reviewed("synthetic add reviewed evidence", join(dir, "log.jsonl"));
  const accepted = run("project", "finish", "P001");
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.ok(readdirSync(dir).includes("TEAM-FINISH.json"));
});

for (const omitted of ["record", "attempt", "waiver"] as const) test(`R82 팀 후보의 사전 검토 증거와 예외 근거를 같은 Git tree에서 확인한다 (${omitted})`, () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture();
  assert.equal(run("project", "task", "P001", "synthetic pre-review").status, 0);
  const tasks = join(dir, "tasks"), task = join(tasks, readdirSync(tasks).find((name) => name.startsWith("T01_"))!);
  const contract = join(task, "TASK.md"), close = join(task, "TASK-CLOSE.md");
  const record = join(task, "PRE-REVIEW.json"), attempt = join(task, "review-result.json"), waiver = join(task, "waiver-reason.json");
  const contractText = "# synthetic task\n\n- 상태: 진행\n- 사전 검토: v1\n\n## 기준\n\n| # | 기준 |\n|---|---|\n| T-1 | Synthetic requirement |\n";
  writeFileSync(contract, contractText);
  writeFileSync(close, "# synthetic close\n\n- 태스크: TASK.md · 판정: 통과\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| T-1 | 통과 | Synthetic evidence |\n\n## 단위 테스트\nSynthetic result\n\n## E2E\nSynthetic scope\n\n## 리뷰\nSynthetic review\n\n## 남긴 것\nSynthetic handoff\n");
  const hash = reviewHash(contractText);
  writeFileSync(attempt, JSON.stringify({ provider: "anthropic", synthetic: true }));
  if (omitted === "waiver") writeFileSync(waiver, JSON.stringify({ sourceRef: "fixture:accepted-synthetic-input" }));
  writeFileSync(record, JSON.stringify({ version: 1, author: "openai", attempts: [{ provider: "anthropic", cross: true, status: omitted === "waiver" ? "fail" : "pass", blocking: omitted === "waiver" ? 1 : 0, hash, evidence: "review-result.json", continuity: "new" }], ...(omitted === "waiver" ? { waiver: { by: "user", date: "2026-01-01", reason: "Synthetic decision", evidence: "waiver-reason.json", hash } } : {}) }));
  const done = run("project", "done", "P001", "T01");
  assert.equal(done.status, 0, done.stdout + done.stderr);
  const ignored = { record, attempt, waiver }[omitted], ignore = join(worktree, ".gitignore");
  writeFileSync(ignore, `**/${ignored.split("/").at(-1)}\n`);
  const proofs = (omitted === "waiver" ? [record, attempt, waiver] : [record, attempt]).filter((path) => path !== ignored);
  reviewed("feat(P001/T01): synthetic pre-review proof", contract, close, ignore, join(dir, "PROJECT.md"), join(dir, "log.jsonl"), ...proofs);
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  const head = git("rev-parse", "HEAD").stdout, original = readFileSync(ignored, "utf8");
  const missing = run("project", "finish", "P001");
  assert.notEqual(missing.status, 0, missing.stdout + missing.stderr);
  assert.match(missing.stdout + missing.stderr, /사전 검토: .*(?:증거|근거)|사전 검토: 기록 파일/);
  assert.equal(git("rev-parse", "HEAD").stdout, head);
  assert.equal(readFileSync(ignored, "utf8"), original);
  assert.equal(git("add", "-f", "--", ignored).status, 0);
  reviewed("synthetic add reviewed proof", join(dir, "log.jsonl"));
  const accepted = run("project", "finish", "P001");
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.ok(readdirSync(dir).includes("TEAM-FINISH.json"));
});

test("R76 마감 커밋 훅이 스테이징한 원문은 실제 Git과 검증 커밋에 들어가지 않는다", { skip: process.platform === "win32" }, () => {
  const { f, worktree, dir, run } = mergeFixture();
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  const hooks = tempDir("pace-final-hook-"), hook = join(hooks, "pre-commit"), rel = `projects/${dir.split("/").at(-1)}/late-raw.txt`;
  writeFileSync(hook, `#!/bin/sh\nprintf '%s' 'Synthetic raw text introduced by hook' > '${rel}'\ngit add -- '${rel}'\n`);
  chmodSync(hook, 0o700);
  assert.equal(git("config", "core.hooksPath", hooks).status, 0);
  const head = git("rev-parse", "HEAD").stdout, index = git("diff", "--cached", "--binary").stdout;
  const result = run("project", "finish", "P001");
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(join(worktree, rel), "utf8"), "Synthetic raw text introduced by hook");
  assert.equal(git("rev-parse", "HEAD").stdout, head);
  assert.equal(git("diff", "--cached", "--binary").stdout, index);
  const rejectedBlob = git("hash-object", rel).stdout.trim();
  assert.notEqual(git("cat-file", "-e", rejectedBlob).status, 0);
});

for (const command of ["finish", "merge"] as const) test(`R76 팀 ${command} 필수 사건을 기록하지 못하면 명령도 성공하지 않는다`, () => {
  const { f, worktree, dir, run } = mergeFixture();
  const root = command === "finish" ? worktree : f.root;
  const git = (...args: string[]) => f.git("-C", root, ...args);
  const args = ["project", command, "P001"];
  if (command === "merge") {
    const finished = run("project", "finish", "P001");
    assert.equal(finished.status, 0, finished.stdout + finished.stderr);
    args.push("--yes", "--commit", git("rev-parse", "project/P001").stdout.trim());
  }
  const expected = command === "merge" ? args.at(-1) : git("rev-parse", "HEAD").stdout.trim();
  const preload = join(tempDir("pace-required-finish-event-"), "inject.mjs");
  writeFileSync(preload, `
    import fs from "node:fs";
    import {syncBuiltinESMExports} from "node:module";
    const append = fs.appendFileSync, command = ${JSON.stringify(command)};
    fs.appendFileSync = function (file, bytes, opts) {
      if (String(bytes).split("\\n").filter(Boolean).some(line => {
        try {
          const row = JSON.parse(line);
          return row.ok === true && (row.type === command || row.data?.[command] === 1);
        } catch { return false; }
      })) throw Object.assign(new Error("Synthetic event append denied"), { code: "EACCES" });
      return append(file, bytes, opts);
    };
    syncBuiltinESMExports();
  `);
  const stopped = runPace(args, { cwd: root, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.notEqual(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout + stopped.stderr, command === "merge" ? /fast-forward는 완료됐으나 상태 기록에 실패/ : /팀 마감.*기록/);
  assert.equal(git("rev-parse", "HEAD").stdout.trim(), expected);
  const projectPath = command === "finish" ? dir : f.dir;
  const rows = readEvents(projectPath);
  assert.ok(!rows.some((row) => row.ok && (row.type === command || row.data?.[command] === 1)));
  assert.doesNotMatch(readFileSync(join(projectPath, "PROJECT.md"), "utf8"), /^- 상태: 완료$/m);
});

test("R76 보안 검사 중 현재 작업본의 팀 채택이 생기면 비팀 중간 커밋을 중단한다", () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture("true", "node adopt.mjs", false);
  const rel = `projects/${dir.split("/").at(-1)}`;
  const ignore = join(worktree, ".gitignore"), cmd = join(worktree, "adopt.mjs"), measure = join(dir, "TEAM-MEASUREMENT.json");
  writeFileSync(ignore, `/${rel}/TEAM-MEASUREMENT.json\n`);
  writeFileSync(cmd, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(measure)}, '{"version":1}');\n`);
  reviewed("synthetic-scope-changing-check", ignore, cmd);
  writeFileSync(join(dir, "legacy-note.txt"), "Synthetic pending note.");
  const git = (...args: string[]) => f.git("-C", worktree, ...args);
  const head = git("rev-parse", "HEAD").stdout, idx = git("diff", "--cached", "--binary").stdout, log = readFileSync(join(dir, "log.jsonl"));
  const stopped = run("project", "finish", "P001");
  assert.notEqual(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout + stopped.stderr, /팀 채택.*바뀌었다/);
  assert.equal(git("rev-parse", "HEAD").stdout, head);
  assert.equal(git("diff", "--cached", "--binary").stdout, idx);
  assert.deepEqual(readFileSync(join(dir, "log.jsonl")), log);
  assert.equal(readFileSync(measure, "utf8"), '{"version":1}');
});

test("R77 rebase 이후 검사 후보에서도 선언된 보안 검사를 통과해야 한다", () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture("true", "node security-fixture.mjs");
  const security = join(worktree, "security-fixture.mjs"), branchFlag = join(worktree, "project-only.flag");
  writeFileSync(security, 'import {existsSync} from "node:fs"; if (existsSync("base-only.flag") && existsSync("project-only.flag")) { console.error("Synthetic rebased candidate rejected"); process.exitCode = 1; }\n');
  writeFileSync(branchFlag, "synthetic reviewed changes");
  reviewed("synthetic-project-security-candidate", security, branchFlag);
  const baseFlag = join(f.root, "base-only.flag");
  writeFileSync(baseFlag, "synthetic base changes");
  assert.equal(f.git("add", "--", baseFlag).status, 0);
  assert.equal(f.git("commit", "-qm", "synthetic-base-security-candidate").status, 0);
  const stopped = run("project", "finish", "P001");
  assert.notEqual(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout + stopped.stderr, /보안 검사 실패.*\n[\s\S]*Synthetic rebased candidate rejected/);
  assert.equal(f.git("-C", worktree, "merge-base", "--is-ancestor", "main", "HEAD").status, 0);
  assert.doesNotMatch(f.git("-C", worktree, "log", "-1", "--format=%s").stdout, /마감/);
  assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
});

test("R80 rebase로 바뀐 마감 문서에 공통 검증을 적용한다", () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture();
  assert.equal(f.git("merge", "--ff-only", "project/P001").status, 0);
  const topic = join(worktree, "reviewed.txt");
  writeFileSync(topic, "Synthetic reviewed change.\n");
  reviewed("synthetic-reviewed-candidate", topic);
  const close = join(f.dir, "PROJECT-CLOSE.md");
  writeFileSync(close, readFileSync(close, "utf8").replace("true 실행", "<!-- pending -->"));
  assert.equal(f.git("add", "--", close).status, 0);
  assert.equal(f.git("commit", "-qm", "synthetic-base-with-empty-security-section").status, 0);
  const result = run("project", "finish", "P001");
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /PROJECT-CLOSE: ## 보안 절이 비었다/);
  assert.equal(f.git("-C", worktree, "merge-base", "--is-ancestor", "main", "HEAD").status, 0);
  assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
});

for (const protectionAfterFinish of [false, true]) test(`R80 새로 편입할 중간 커밋의 보호 경로를 검사한다 (merge=${protectionAfterFinish})`, () => {
  const { f, worktree, dir, run, reviewed } = mergeFixture();
  const rel = `projects/${dir.split("/").at(-1)}/known-transient.txt`;
  const mainPath = join(f.root, rel), branchPath = join(worktree, rel);
  const body = "Synthetic restricted owner bytes.\n";
  const register = () => {
    writeFileSync(mainPath, body);
    assert.throws(() => readPrivateInput(worktree, mainPath), /원문\/상세 본문/);
    renameSync(mainPath, join(f.home, "private-original.txt"));
  };
  if (!protectionAfterFinish) register();
  writeFileSync(branchPath, body);
  reviewed("synthetic-intermediate-protected-path", branchPath);
  unlinkSync(branchPath);
  reviewed("synthetic-tip-without-protected-path", branchPath);
  const finished = run("project", "finish", "P001");
  const pending = protectionAfterFinish
    ? (() => {
      assert.equal(finished.status, 0, finished.stdout + finished.stderr);
      register();
      const approved = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
      const main = f.git("rev-parse", "HEAD").stdout;
      const result = f.run("project", "merge", "P001", "--yes", "--commit", approved);
      assert.equal(f.git("rev-parse", "HEAD").stdout, main);
      return result;
    })()
    : finished;
  assert.notEqual(pending.status, 0, pending.stdout + pending.stderr);
  assert.match(pending.stdout + pending.stderr, /로컬 전용 원문 staging 금지/);
  assert.equal(readFileSync(join(f.home, "private-original.txt"), "utf8"), body);
});

for (const mode of ["introduced", "already-present", "public"] as const) test(`R78 검사 Git tree의 기준 브랜치 원문 보호를 대조한다 (${mode})`, () => {
  const { f, worktree, dir, run } = mergeFixture();
  const name = "owner-sidecar.txt", rel = `projects/${dir.split("/").at(-1)}/${name}`;
  const mainInput = join(f.root, rel), body = mode === "public" ? "Synthetic public baseline.\n" : "Synthetic restricted owner bytes.\n";
  writeFileSync(mainInput, body);
  const recordBase = () => {
    assert.equal(f.git("add", "--", rel).status, 0);
    assert.equal(f.git("commit", "-qm", "synthetic-source-main").status, 0);
  };
  if (mode === "public") recordBase();
  assert.throws(() => readPrivateInput(worktree, mainInput), /원문\/상세 본문/);
  if (mode !== "public") recordBase();
  if (mode === "already-present") assert.equal(f.git("-C", worktree, "rebase", "main").status, 0);
  const result = run("project", "finish", "P001");
  if (mode === "public") {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(readdirSync(dir).includes("TEAM-FINISH.json"));
  } else {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /로컬 전용 원문 staging 금지/);
    assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
    assert.equal(readFileSync(mainInput, "utf8"), body);
  }
  assert.equal(readFileSync(join(dir, name), "utf8"), body);
});

for (const mode of ["executable", "edited", "separate-base", "public-crlf"] as const) test(`R79 팀 후보의 공통 보호 경로와 Git 공개 지문을 대조한다 (${mode})`, { skip: mode === "executable" && process.platform === "win32" }, () => {
  const { f, worktree, dir } = mergeFixture();
  const rel = `projects/${dir.split("/").at(-1)}/known-source.txt`;
  const base = mode === "separate-base" ? "release" : "main";
  const baseRoot = base === "release" ? join(tempDir("pace-protected-base-worktree-"), "checkout") : f.root;
  if (base === "release") assert.equal(f.git("worktree", "add", "-b", base, baseRoot, "main").status, 0);
  if (mode === "public-crlf") assert.equal(f.git("config", "core.autocrlf", "true").status, 0);
  const source = join(baseRoot, rel);
  const body = mode === "public-crlf" ? "Synthetic already public.\r\n" : "Synthetic known private content.\n";
  const baseGit = (...args: string[]) => f.git("-C", baseRoot, ...args);
  const commitBase = () => {
    assert.equal(baseGit("add", "--", rel).status, 0);
    assert.equal(baseGit("commit", "-qm", "synthetic-base-protected-path").status, 0);
  };
  writeFileSync(source, body);
  if (mode === "public-crlf") commitBase();
  assert.throws(() => readPrivateInput(worktree, source), /원문\/상세 본문/);
  if (mode !== "public-crlf") commitBase();
  if (mode === "executable" || mode === "edited") {
    const git = (...args: string[]) => f.git("-C", worktree, ...args);
    assert.equal(git("rebase", base).status, 0);
    const path = join(worktree, rel);
    if (mode === "executable") chmodSync(path, 0o755);
    else writeFileSync(path, body + "Synthetic addendum.\n");
    assert.equal(git("add", "--", rel).status, 0);
    assert.equal(git("commit", "-qm", "synthetic-variant-of-protected-path").status, 0);
  }
  const result = runPace(["project", "finish", "P001", "--base", base], { cwd: worktree, home: f.home });
  if (mode === "public-crlf") {
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(f.git("-C", worktree, "show", `HEAD:${rel}`).stdout, /^Synthetic already public\.\n$/);
  } else {
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /로컬 전용 원문 staging 금지/);
    assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
  }
  assert.equal(readFileSync(source, "utf8"), body);
});

test("R77 팀 병합 후 훅이 추가한 변경은 승인 SHA와 별도로 보존한다", { skip: process.platform === "win32" }, () => {
  const { f, worktree, run } = mergeFixture();
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  const target = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
  const hooks = tempDir("pace-after-approved-merge-"), hook = join(hooks, "post-merge");
  writeFileSync(hook, "#!/bin/sh\nprintf '%s' 'Synthetic post-merge staged bytes' > after-merge.txt\ngit add -- after-merge.txt\n");
  chmodSync(hook, 0o700);
  assert.equal(f.git("config", "core.hooksPath", hooks).status, 0);
  const stopped = f.run("project", "merge", "P001", "--yes", "--commit", target);
  assert.notEqual(stopped.status, 0, stopped.stdout + stopped.stderr);
  assert.match(stopped.stdout + stopped.stderr, /fast-forward는 완료됐으나 상태 기록에 실패/);
  assert.equal(f.git("rev-parse", "HEAD").stdout.trim(), target);
  assert.equal(f.git("show", ":after-merge.txt").stdout, "Synthetic post-merge staged bytes");
  assert.notEqual(f.git("cat-file", "-e", "HEAD:after-merge.txt").status, 0);
  assert.ok(!readEvents(f.dir).some((event) => event.type === "merge" && event.ok));
});

test("R41 검사 후 다른 소스를 staged 상태로 둔 채 마감을 보류한다", () => {
  const { f, worktree, dir } = mergeFixture();
  const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
  const path = join(worktree, "outside.txt"), preload = join(tempDir("pace-finish-staged-source-"), "inject.mjs");
  const content = "SYNTHETIC concurrent staged file";
  writeFileSync(preload, `import cp from 'node:child_process'; import {writeFileSync} from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
    const original=cp.spawnSync; let fired=false;
    cp.spawnSync=function(command,args,options){
      if(!fired && command==='git' && args.includes('add') && args.includes(${JSON.stringify(join(dir,"METRICS.md"))})){
        fired=true; writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(content)});
        const added=original(command,['-C',${JSON.stringify(worktree)},'add','--',${JSON.stringify(path)}],options);
        if(added.status!==0) throw new Error('synthetic stage failed');
      }
      return original(command,args,options);
    }; syncBuiltinESMExports();
  `);
  const result = runPace(["project", "finish", "P001"], { cwd: worktree, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /마감 대상 밖의 staged 변경/);
  assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, head);
  assert.equal(f.git("-C", worktree, "show", ":outside.txt").stdout, content);
  assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
  const events = readFileSync(join(dir, "log.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const success = events.find((event) => event.ok && event.data?.finish === 1);
  assert.match(success?.src ?? "", /^finish:[a-f0-9]{24}$/);
  assert.ok(events.some((event) => event.ok === false && event.data?.finish === 1 && event.src === success.src));
});

test("R41 회고에 후보 역할 33개를 모두 기록하고 누락과 중복을 보류한다", () => {
  const { worktree, dir } = mergeFixture(), rel = `projects/${dir.split("/").at(-1)}`;
  const roles = Array.from({ length: 33 }, (_, i) => `role-${i + 1}`);
  for (const name of roles) createTeamMember(worktree, name, "maker");
  const path = join(dir, "TEAM-RETROSPECTIVE.json"), input = JSON.parse(readFileSync(path, "utf8"));
  const rows = roles.map((role) => ({ role, coverage: "unconfirmed", refs: [] }));
  const issues = (unusedRoles: typeof rows) => {
    writeFileSync(path, JSON.stringify({ ...input, unusedRoles }));
    return teamRetrospectiveIssues(worktree, rel);
  };
  assert.deepEqual(issues(rows), []);
  assert.match(issues(rows.slice(0, -1)).join("\n"), /알려진 미사용 검토 후보/);
  assert.match(issues([...rows, rows[0]!]).join("\n"), /미사용 후보 역할/);
});

test("R42 원질문 없는 코디네이터 답은 없는 요청 0건으로 비교되지 않는다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] } }));
  const stats = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  confirmRequestInput(f.dir, f.run);
  const empty = stats().team;
  assert.equal(empty.requests.reachedTotal, 0);
  const requestId = "orphan-coordinator-answer";
  recordEvent(f.dir, { p: "P001", ts: "2026-01-01T01:00:00Z", type: "answer", by: "coordinator", requestId, msg: "합성 원질문 없는 답" });
  const orphan = stats();
  assert.equal(orphan.handoffs.requests.total, 1);
  assert.equal(orphan.handoffs.requests.unconfirmed, 1);
  assert.equal(orphan.team.requests.reachedTotal, null);
  assert.equal(orphan.team.snapshot.unknown.request_events, 1);
  const c = compareFixture();
  const applyObservedRequest = (snapshot: typeof empty.snapshot) => {
    c.a.counts.owner_questions = snapshot.counts.owner_questions;
    c.a.counts.failed_only_owner_requests = snapshot.counts.failed_only_owner_requests;
    c.a.unknown.request_events = snapshot.unknown.request_events;
    c.save();
    return c.compare().conclusion;
  };
  assert.equal(applyObservedRequest(empty.snapshot), "observed-burden-improvement");
  assert.equal(applyObservedRequest(orphan.team.snapshot), "unknown");

  recordEvent(f.dir, { p: "P001", ts: "2026-01-01T02:00:00Z", type: "question", by: "agent", to: "owner", requestId, msg: "합성 뒤늦은 질문" });
  const lateRoot = stats().team;
  assert.equal(lateRoot.requests.ownerReply, 0);
  assert.equal(lateRoot.requests.reachedTotal, null);
  receipt(f.dir, "answer.json", period, requestId);
  recordEvent(f.dir, { p: "P001", ts: "2026-01-01T03:00:00Z", type: "answer", by: "user", requestId, ref: "answer.json", msg: "합성 확인된 답" });
  confirmRequestInput(f.dir, f.run);
  const resolved = stats().team;
  assert.equal(resolved.requests.ownerReply, 1);
  assert.equal(resolved.requests.reachedTotal, 1);
});

test("R42 목록 안 HTML과 코드 예시는 실제 다음 절의 팀 표를 회고에 넣지 않는다", () => {
  const { f, worktree, run, dir, reviewed } = mergeFixture();
  const path = join(dir, "PROJECT-CLOSE.md"), original = readFileSync(path, "utf8");
  for (const [open, close] of [["<textarea>", "</textarea>"], ["```md", "```"]]) {
    const elsewhere = original.replace("## 회고\n\n", `## 회고\n\n1. 예시\n   ${open}\n## 참고\n${close}\n\n`);
    writeFileSync(path, elsewhere);
    const issues = teamRetrospectiveIssues(worktree, `projects/${dir.split("/").at(-1)}`);
    assert.match(issues.join("\n"), /회고에 팀 행/);
  }
  writeFileSync(path, original.replace("## 회고\n\n", "## 회고\n\n1. 예시\n   <textarea>\n## 참고\n</textarea>\n\n"));
  reviewed("synthetic-invalid-retrospective-boundary", path);
  const held = run("project", "finish", "P001");
  assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /회고에 팀 행/);
  writeFileSync(path, original);
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-retrospective-boundary").status, 0);
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
});

test("R42 표준 반복 지적은 현재 집계와 서로 대조하고 별도 신고 코드는 보존한다", () => {
  const { f, worktree, run, dir, reviewed } = mergeFixture();
  const path = join(dir, "TEAM-RETROSPECTIVE.json"), input = JSON.parse(readFileSync(path, "utf8"));
  const reported = (code: string) => ({ code, count: 2, coverage: "reported", refs: ["proof.json"] });
  writeFileSync(path, JSON.stringify({ ...input, recurringFindings: [reported("review-blocking"), reported("review-field-observation")] }));
  reviewed("synthetic-unmatched-finding", path);
  const held = run("project", "finish", "P001");
  assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /반복 지적이 현재 지표 후보와 불일치/);
  const review = "reviewer fail blocking 2 should_fix 0";
  recordEvent(dir, { p: "P001", ts: new Date().toISOString(), type: "review", by: "agent", msg: review, data: reviewMessageData(review) });
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-current-findings").status, 0);
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
});

test("R43 최상위 코드와 HTML 안의 목록 예시는 블록이나 회고 표를 열지 않는다", () => {
  const { f, worktree, run, dir, reviewed } = mergeFixture();
  const path = join(dir, "PROJECT-CLOSE.md"), rel = `projects/${dir.split("/").at(-1)}`, original = readFileSync(path, "utf8");
  const start = original.indexOf("## 회고\n\n") + "## 회고\n\n".length;
  const end = original.indexOf("## 지표", start);
  assert.ok(start > 0 && end > start);
  const table = original.slice(start, end);
  const block = (open: string, close: string) => `${open}\n1. 예시 목록\n\n${table}${close}\n\n`;
  for (const [open, close] of [["~~~md", "~~~"], ["<textarea>", "</textarea>"]]) {
    writeFileSync(path, original.slice(0, start) + block(open!, close!) + original.slice(end));
    assert.match(teamRetrospectiveIssues(worktree, rel).join("\n"), /회고에 팀 행/);
    writeFileSync(path, original.slice(0, start) + block(open!, close!) + original.slice(start));
    assert.deepEqual(teamRetrospectiveIssues(worktree, rel), []);
  }
  writeFileSync(path, original.slice(0, start) + block("~~~md", "~~~") + original.slice(end));
  reviewed("synthetic-opaque-invalid-retrospective", path);
  const held = run("project", "finish", "P001");
  assert.notEqual(held.status, 0); assert.match(held.stdout + held.stderr, /회고에 팀 행/);
  writeFileSync(path, original);
  assert.equal(f.git("-C", worktree, "add", "-A").status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-opaque-retrospective").status, 0);
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
});

test("R43 최상위 코드와 HTML 안의 목록 예시는 팀 표지를 머리로 승격하지 않는다", () => {
  const f = fixture(), path = join(f.dir, "PROJECT.md"), original = readFileSync(path, "utf8");
  for (const [open, close] of [["~~~md", "~~~"], ["<textarea>", "</textarea>"]]) {
    writeFileSync(path, original.replace("\n## 목적", `\n${open}\n1. 예시 목록\n\n- 팀 측정: v1\n${close}\n\n## 목적`));
    const stats = f.run("project", "stats", "P001", "--json");
    assert.equal(stats.status, 0, stats.stderr);
    assert.equal(Object.hasOwn(JSON.parse(stats.stdout), "team"), false);
  }
});

test("R44 명시 태스크 앞의 미지정 답은 대표 업무 총량을 보류하고 확인된 자체 답은 관측한다", () => {
  const f = fixture(), id = "early-unassigned", period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, "frame.json", period);
  receipt(f.dir, "answer.json", period, id);
  const scope = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({
    version: 1, period, request_coverage: scope, log_coverage: scope,
    counts: { owner_file_edits: 0 }, coverage: { owner_file_edits: scope },
    coordinator_answers: [{ requestId: id, coverage: { ...scope, confirmationRef: "answer.json", refs: ["answer.json"] } }],
  }));
  const early = { p: "P001", ts: "2026-01-01T01:00:00Z", type: "answer", by: "coordinator", requestId: id, msg: "합성 미지정 답" };
  const question = { ...early, ts: "2026-01-01T02:00:00Z", type: "question", by: "agent", to: "coordinator", t: "T01", msg: "합성 태스크 질문" };
  const late = { ...early, ts: "2026-01-01T03:00:00Z", t: "T01", msg: "합성 확인된 자체 답" };
  const get = (rows: Record<string, unknown>[]) => {
    writeFileSync(join(f.dir, "log.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).team;
  };
  const mixed = get([early, question, late]);
  assert.equal(mixed.requests.coordinatorOwnAnswerObserved, 1);
  assert.equal(mixed.requests.reachedTotal, null);
  assert.equal(mixed.requests.comparisonUnconfirmed, 1);
  assert.equal(mixed.manual.fileEdits.observed, 0);
  assert.equal(mixed.manual.fileEdits.total, null);
  assert.equal(mixed.quality.blockingLogged, null);
  const unresolved = get([early, question]);
  assert.equal(unresolved.requests.coordinatorOwnAnswerObserved, 0);
  assert.equal(unresolved.manual.fileEdits.total, null);
  const clean = get([question, late]);
  assert.equal(clean.requests.coordinatorOwnAnswerObserved, 1);
  assert.equal(clean.requests.reachedTotal, 0);
  assert.equal(clean.manual.fileEdits.total, 0);
  assert.equal(clean.quality.blockingLogged, 0);

  const c = compareFixture();
  const compare = (team: typeof clean) => {
    c.a.counts.owner_questions = team.snapshot.counts.owner_questions;
    c.a.counts.failed_only_owner_requests = team.snapshot.counts.failed_only_owner_requests;
    c.a.unknown.request_events = team.snapshot.unknown.request_events;
    c.save();
    return c.compare().conclusion;
  };
  assert.equal(compare(clean), "observed-burden-improvement");
  assert.equal(compare(mixed), "unknown");
});

test("R44 번호 2가 일반 문단을 중단하지 못하므로 이후 코드 예시를 회고 표로 읽지 않는다", () => {
  const { worktree, dir } = mergeFixture();
  const path = join(dir, "PROJECT-CLOSE.md"), rel = `projects/${dir.split("/").at(-1)}`, original = readFileSync(path, "utf8");
  const start = original.indexOf("## 회고\n\n") + "## 회고\n\n".length;
  const end = original.indexOf("## 지표", start);
  assert.ok(start > 0 && end > start);
  const table = original.slice(start, end);
  const proseExample = `일반 문단은 계속된다.\n2. 목록 시작이 아닌 예시\n   ~~~md\n\n${table}~~~\n\n`;
  writeFileSync(path, original.slice(0, start) + proseExample + original.slice(end));
  assert.match(teamRetrospectiveIssues(worktree, rel).join("\n"), /회고에 팀 행/);
  writeFileSync(path, original.slice(0, start) + proseExample + original.slice(start));
  assert.deepEqual(teamRetrospectiveIssues(worktree, rel), []);
});

test("R45 요청 ID 없는 코디네이터 답은 닫힌 구간의 도달 0과 개선을 확정하지 않는다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] } }));
  const get = () => { const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  confirmRequestInput(f.dir, f.run);
  const clean = get().team;
  assert.equal(clean.requests.reachedTotal, 0);
  recordEvent(f.dir, { p: "P001", ts: "2026-01-01T01:00:00Z", type: "answer", by: "agent", msg: "합성 단순 수신 확인" });
  assert.equal(get().team.requests.reachedTotal, 0);
  recordEvent(f.dir, { p: "P001", ts: "2026-01-01T02:00:00Z", type: "answer", by: "coordinator", msg: "합성 미연결 답" });
  const unresolved = get();
  assert.equal(unresolved.team.requests.legacyUnlinkedEvents, 1);
  assert.equal(unresolved.handoffs.requests.unlinkedLogEvents, 1);
  assert.match(f.run("project", "stats", "P001").stdout, /식별자 없는 질문·답 사건 1/);
  assert.equal(unresolved.team.requests.reachedTotal, null);
  assert.equal(unresolved.team.snapshot.counts.failed_only_owner_requests, null);
  const c = compareFixture();
  const compare = (team: typeof clean) => {
    c.a.counts.owner_questions = team.snapshot.counts.owner_questions;
    c.a.counts.failed_only_owner_requests = team.snapshot.counts.failed_only_owner_requests;
    c.a.unknown.request_events = team.snapshot.unknown.request_events;
    c.save();
    return c.compare().conclusion;
  };
  assert.equal(compare(clean), "observed-burden-improvement");
  assert.equal(compare(unresolved.team), "unknown");
});

test("R45 기존 병합도 판정한 커밋만 FF하고 그 뒤 진행된 팀 브랜치와 worktree를 보존한다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false);
  const finished = run("project", "finish", "P001"); assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  const inspected = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
  const rel = `projects/${dir.split("/").at(-1)}`;
  adoptTeamMetrics(worktree, rel);
  assert.equal(f.git("-C", worktree, "add", "--", `${rel}/PROJECT.md`).status, 0);
  assert.equal(f.git("-C", worktree, "commit", "-qm", "synthetic-concurrent-team-adoption").status, 0);
  const late = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
  // The reset applies only to this test-owned temporary repository.
  assert.equal(f.git("-C", worktree, "reset", "--hard", inspected).status, 0);
  const preload = join(tempDir("pace-legacy-merge-target-"), "inject.mjs");
  writeFileSync(preload, `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
    const original=cp.spawnSync; let fired=false;
    cp.spawnSync=function(command,args,options){
      if(!fired && command==='git' && args.includes('merge') && args.includes('--ff-only')){
        fired=true;
        const moved=original(command,['-C',${JSON.stringify(f.root)},'update-ref','refs/heads/project/P001',${JSON.stringify(late)},${JSON.stringify(inspected)}],options);
        if(moved.status!==0) throw new Error('synthetic advance failed');
      }
      return original(command,args,options);
    }; syncBuiltinESMExports();
  `);
  const merged = runPace(["project", "merge", "P001", "--yes"], { cwd: f.root, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.equal(f.git("merge-base", "--is-ancestor", inspected, "HEAD").status, 0);
  assert.equal(f.git("merge-base", "--is-ancestor", late, "HEAD").status, 1);
  assert.equal(merged.status, 0, merged.stdout + merged.stderr);
  assert.equal(f.git("rev-parse", "project/P001").stdout.trim(), late);
  assert.ok(f.git("worktree", "list", "--porcelain").stdout.includes(worktree));
  assert.match(merged.stdout, /브랜치\/worktree 변경 감지/);
});

test("R45 미채택 기존 통계는 손상된 선택 역할 원본을 보류하고 명시 Team은 오류로 보고한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`;
  const member = createTeamMember(f.root, "draft", "maker");
  recordEvent(f.dir, { p: "P001", ts: new Date().toISOString(), t: "T01", type: "question", by: "agent", to: "owner", requestId: "legacy-linked", msg: "합성 기존 질문" });
  const get = () => f.run("project", "stats", "P001", "--json");
  const stable = get(); assert.equal(stable.status, 0, stable.stderr);
  const before = JSON.parse(stable.stdout);
  writeFileSync(join(f.root, member.source), "# 미완성 역할\n");
  const legacy = get(); assert.equal(legacy.status, 0, legacy.stderr);
  const current = JSON.parse(legacy.stdout);
  assert.deepEqual(current.eventCounts, before.eventCounts);
  assert.deepEqual(current.handoffs, before.handoffs);
  assert.match(current.team.warnings.join("\n"), /팀 원본.*미확인/);
  adoptTeamMetrics(f.root, rel);
  const adopted = get(); assert.notEqual(adopted.status, 0); assert.match(adopted.stderr, /팀 frontmatter/);
});

test("R46 요청 수집 확인은 같은 구간의 실제 입력에만 적용한다", () => {
  const f = fixture(), log = join(f.dir, "log.jsonl"), ledger = join(f.dir, "handoffs.jsonl"), requestId = "attested-request";
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  const boundary = readFileSync(log, "utf8");
  receipt(f.dir, "scope.json", period);
  receipt(f.dir, "answer.json", period, requestId);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage }));
  recordEvent(f.dir, { p: "P001", ts: "2026-01-01T01:00:00Z", type: "question", by: "agent", to: "owner", requestId, msg: "합성 질문" });
  recordEvent(f.dir, { p: "P001", ts: "2026-01-01T02:00:00Z", type: "answer", by: "user", requestId, ref: "answer.json", msg: "합성 답" });
  const original = readFileSync(log, "utf8");
  const stats = () => {
    const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).team;
  };
  const unbound = stats();
  assert.equal(unbound.requests.ownerReply, 1);
  assert.equal(unbound.requests.reachedTotal, null);
  assert.match(unbound.warnings.join(" "), /요청 수집의 입력 지문 미확인/);
  confirmRequestInput(f.dir, f.run);
  const pinned = stats();
  assert.equal(pinned.requests.reachedTotal, 1);
  const support = join(f.dir, "scope.json"), originalSupport = readFileSync(support, "utf8");
  writeFileSync(support, JSON.stringify({ ...JSON.parse(originalSupport), sourceRef: "fixture:replacement-support", hash: digest("synthetic replacement support") }));
  const replacement = stats();
  assert.equal(replacement.requests.ownerReply, 1);
  assert.equal(replacement.requests.reachedTotal, null);
  assert.notEqual(replacement.requestCoverageInputHash, pinned.requestCoverageInputHash);
  writeFileSync(support, originalSupport);
  const certificatePath = join(f.dir, pinned.snapshot.requestCoverage.ref), certificate = JSON.parse(readFileSync(certificatePath, "utf8"));
  const parkedCertificate = join(f.dir, "parked-request-confirmation.json");
  renameSync(certificatePath, parkedCertificate);
  const expectUncollected = () => {
    const unavailable = stats();
    assert.equal(unavailable.requests.ownerReply, 1);
    assert.equal(unavailable.requests.reachedTotal, null);
    assert.equal(unavailable.snapshot.counts.failed_only_owner_requests, null);
    assert.equal(unavailable.snapshot.observed_counts.owner_questions, 1);
  };
  expectUncollected();
  for (const broken of ["{", JSON.stringify({ ...certificate, hash: "x".repeat(20000) })]) {
    writeFileSync(certificatePath, broken);
    expectUncollected();
  }
  writeFileSync(certificatePath, JSON.stringify({ ...certificate, period: { ...certificate.period, end: "2026-01-03T00:00:00Z" } }));
  assert.equal(stats().requests.reachedTotal, null);
  writeFileSync(certificatePath, JSON.stringify(certificate));

  writeFileSync(log, original.replaceAll("\n", "\r\n"));
  recordMetric(f.dir, { ts: "2026-01-01T03:00:00Z", project: "P001", cmd: "check", ok: true });
  assert.equal(stats().requestCoverageInputHash, pinned.requestCoverageInputHash);

  writeFileSync(log, boundary);
  const removed = stats();
  assert.equal(removed.requests.reached, 0);
  assert.equal(removed.requests.reachedTotal, null);
  assert.equal(removed.snapshot.counts.failed_only_owner_requests, null);
  assert.notEqual(removed.requestCoverageInputHash, pinned.requestCoverageInputHash);
  const cmp = compareFixture();
  const compare = (current: typeof pinned) => {
    cmp.a.counts.owner_questions = current.snapshot.counts.owner_questions;
    cmp.a.counts.failed_only_owner_requests = current.snapshot.counts.failed_only_owner_requests;
    cmp.a.unknown.request_events = current.snapshot.unknown.request_events;
    cmp.save();
    return cmp.compare().conclusion;
  };
  assert.equal(compare(pinned), "observed-burden-improvement");
  assert.equal(compare(removed), "unknown");

  writeFileSync(log, original);
  const proofPath = join(f.dir, "answer.json"), proof = readFileSync(proofPath, "utf8");
  writeFileSync(proofPath, JSON.stringify({ ...JSON.parse(proof), hash: digest("different synthetic receipt") }));
  assert.equal(stats().requests.ownerReply, 1);
  assert.equal(stats().requests.reachedTotal, null);
  writeFileSync(proofPath, proof);
  writeFileSync(ledger, "");
  assert.equal(stats().requests.reachedTotal, null, "확인 때 없던 원장과 새 빈 원장을 구분한다");
  confirmRequestInput(f.dir, f.run);
  assert.equal(stats().requests.reachedTotal, 1);
  unlinkSync(ledger);
  assert.equal(stats().requests.reachedTotal, null, "빈 원장이 사라져도 기존 확인을 재사용할 수 없다");
  unlinkSync(log);
  assert.equal(stats().requestCoverageInputHash, null);
  writeFileSync(log, "{");
  assert.equal(f.run("project", "stats", "P001", "--json").status, 2);
});

test("R46 두 요청의 같은 외부 응답 증빙만 보류하고 별개 도달과 실패 시도는 보존한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage }));
  const route = { transport: "external", actor: "owner", target: "fixture-owner-route", from: "coordinator", sourceRef: "fixture:route" };
  for (const requestId of ["first", "second", "third"]) {
    const message = `question-${requestId}`, attempt = `send-${requestId}`;
    store.record({ protocol: "pace-handoff", v: 1, id: message, kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC question");
    if (requestId === "first") {
      prepareDelivery(store, message, "first-failure", route);
      deliveryReceipt(store, "first-failure", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
    }
    prepareDelivery(store, message, attempt, route);
    deliveryReceipt(store, attempt, { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseId: requestId === "third" ? "other-response" : "shared-response", responseHash: digest("synthetic same response bytes") });
  }
  const fixTime = () => {
    const rows = store.read().map((row, index) => ({ ...row, at: new Date(Date.parse(period.start) + (index + 1) * 60000).toISOString() }));
    writeFileSync(store.path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  };
  fixTime();
  const get = () => {
    const result = f.run("project", "stats", "P001", "--json"); assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  confirmRequestInput(f.dir, f.run);
  const conflict = get();
  assert.equal(conflict.handoffs.duplicateDeliveryRequests, 2);
  assert.equal(conflict.team.requests.ownerDelivery, 1);
  assert.equal(conflict.team.requests.failedAttemptsObserved, 1);
  assert.equal(conflict.team.requests.reachedTotal, null);
  assert.equal(conflict.team.requests.unconfirmed, 2);
  const proposal = store.read().find((row) => row.id === "question-first")!;
  store.record({ protocol: "pace-handoff", v: 1, id: "independent-answer", kind: "decision_reply", from: "owner", to: "coordinator", requestId: "first", data: { re: proposal.id, decision: "approve", sourceRef: "fixture:independent-answer", proposalHash: proposalDigest(proposal) } }, "SYNTHETIC reply");
  fixTime();
  confirmRequestInput(f.dir, f.run);
  const observed = get();
  assert.equal(observed.team.requests.ownerReply, 1);
  assert.equal(observed.team.requests.ownerDelivery, 1);
  assert.equal(observed.team.requests.failedAttemptsObserved, 1);
  assert.equal(observed.team.requests.unconfirmed, 1);
  const corrected = store.read().map((row) => row.requestId === "second" && row.data.phase === "sent" ? { ...row, data: { ...row.data, responseId: "second-response" } } : row);
  writeFileSync(store.path, corrected.map((row) => JSON.stringify(row)).join("\n") + "\n");
  assert.equal(get().team.requests.reachedTotal, null);
  confirmRequestInput(f.dir, f.run);
  assert.equal(get().team.requests.reachedTotal, 3);
});

test("R47 응답은 대상 별칭이 달라도 출처 안에서 중복이며 출처가 다르면 별개다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  adoptTeamMetrics(f.root, rel);
  for (const [requestId, target, sourceRef, responseHash] of [
    ["first", "owner", "service-a:route", digest("same actual response")],
    ["alias", "owner-alias", "service-a:route", digest("same actual response")],
    ["independent", "owner", "service-b:route", digest("independent service response")],
  ] as const) {
    const message = `question-${requestId}`, attempt = `attempt-${requestId}`;
    store.record({ protocol: "pace-handoff", v: 1, id: message, kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC question");
    prepareDelivery(store, message, attempt, { transport: "external", actor: "owner", target, from: "coordinator", sourceRef });
    deliveryReceipt(store, attempt, { phase: "sent", reportedBy: "coordinator", sourceRef, responseId: "service-local-id", responseHash });
  }
  const r = f.run("project", "stats", "P001", "--json");
  assert.equal(r.status, 0, r.stderr);
  const stats = JSON.parse(r.stdout);
  const reaches = Object.fromEntries(stats.handoffs.requests.items.map((r: { requestId: string; reach: string }) => [r.requestId, r.reach]));
  assert.deepEqual(reaches, { alias: "unconfirmed", first: "unconfirmed", independent: "owner_delivery" });
  assert.equal(stats.team.requests.ownerDelivery, 1);
});

test("R47 같은 구간의 대표 업무 근거가 바뀌면 이전 요청 수집 총량은 보류한다", () => {
  const f = fixture(), period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, period.completionRef, period);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage }));
  const get = () => {
    const r = f.run("project", "stats", "P001", "--json");
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout).team;
  };
  confirmRequestInput(f.dir, f.run);
  const original = get();
  assert.equal(original.requests.reachedTotal, 0);
  const path = join(f.dir, period.completionRef);
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), sourceRef: "representative-scope:fixture:another-work", hash: digest("synthetic other work") }));
  const changed = get();
  assert.equal(changed.period.closed, true);
  assert.equal(changed.requests.reached, 0);
  assert.equal(changed.requests.reachedTotal, null);
  assert.equal(changed.snapshot.counts.failed_only_owner_requests, null);
  assert.notEqual(changed.requestCoverageInputHash, original.requestCoverageInputHash);
  confirmRequestInput(f.dir, f.run);
  assert.equal(get().requests.reachedTotal, 0);
});

test("R48 출처 별칭과 구간 밖 재사용도 동일 응답 ID·지문이면 한 전송 근거다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "project-start-to-merge", closed: true };
  recordMetric(f.dir, { ts: period.start, project: "P001", cmd: "start", ok: true });
  recordMetric(f.dir, { ts: period.end, project: "P001", cmd: "merge", ok: true });
  receipt(f.dir, "scope.json", period);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "scope.json", refs: ["scope.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage }));
  for (const [requestId, sourceRef, responseHash] of [
    ["first", "service-a:route", digest("same reported response")],
    ["alias", "service-a:route-alias", digest("same reported response")],
    ["independent", "service-b:route", digest("independent service response")],
  ] as const) {
    const message = `question-${requestId}`, attempt = `send-${requestId}`;
    store.record({ protocol: "pace-handoff", v: 1, id: message, kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC question");
    prepareDelivery(store, message, attempt, { transport: "external", actor: "owner", target: "fixture:owner", from: "coordinator", sourceRef });
    deliveryReceipt(store, attempt, { phase: "sent", reportedBy: "coordinator", sourceRef, responseId: "service-local-id", responseHash });
  }
  const rows = store.read();
  const get = (aliasDay: string) => {
    writeFileSync(store.path, rows.map((row, index) => JSON.stringify({ ...row, at: `2026-01-${row.requestId === "alias" ? aliasDay : "01"}T00:0${index + 1}:00Z` })).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const r = f.run("project", "stats", "P001", "--json"); assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  for (const [aliasDay, duplicates] of [["01", 2], ["03", 1]] as const) {
    const stats = get(aliasDay);
    const reaches = Object.fromEntries(stats.handoffs.requests.items.map((row: { requestId: string; reach: string }) => [row.requestId, row.reach]));
    assert.equal(reaches.first, "unconfirmed");
    assert.equal(reaches.independent, "owner_delivery");
    assert.equal(stats.handoffs.duplicateDeliveryRequests, duplicates);
    assert.equal(stats.team.requests.ownerDelivery, 1);
    assert.equal(stats.team.requests.reachedTotal, null);
  }
  // The second report claims the same external response even with a contradictory timestamp.
  const aliasRows = rows.map((row, index) => ({ ...row, at: `2026-01-01T00:0${row.requestId === "alias" && row.data.phase === "sent" ? 1 : index + 1}:00Z` }));
  writeFileSync(store.path, aliasRows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const result = f.run("project", "stats", "P001", "--json");
  assert.equal(result.status, 0, result.stderr);
  const stats = JSON.parse(result.stdout);
  assert.equal(stats.handoffs.duplicateDeliveryRequests, 2);
  assert.equal(stats.team.requests.ownerDelivery, 1);
  assert.equal(stats.team.requests.unconfirmed, 2);
});

test("R49 비교 JSON을 보존해도 완료 영수증이 교체·누락되면 신고 총량과 비교 방향을 보류한다", () => {
  const f = compareFixture(), after = JSON.parse(readFileSync(f.after, "utf8"));
  for (const s of after.samples) s.observed_counts.owner_questions = 1;
  writeFileSync(f.after, JSON.stringify(after));
  const run = () => runPace(["project", "compare-team", "--before", f.before, "--after", f.after, "--kind", "team-adoption", "--json"], { cwd: f.dir, home: f.dir });
  const get = () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.equal(get().conclusion, "observed-burden-improvement");
  const path = join(f.dir, after.samples[0].period.completionRef), original = readFileSync(path, "utf8");
  const replacement = { ...JSON.parse(original), sourceRef: "representative-scope:fixture:replacement", hash: digest("synthetic replacement") };
  const unconfirmed = () => {
    const comparison = get(), row = comparison.rows.find((r: { metric: string }) => r.metric === "owner_questions");
    assert.equal(comparison.conclusion, "unknown");
    assert.equal(row.after, null);
    assert.equal(row.delta, null);
    assert.equal(row.afterObserved, 2);
    assert.match(comparison.reasons.join(" "), /완료 영수증 지문 미확인/);
  };
  writeFileSync(path, JSON.stringify(replacement));
  unconfirmed();
  renameSync(path, join(f.dir, "unused-replacement.json"));
  unconfirmed();
  writeFileSync(path, original);
  assert.equal(get().conclusion, "observed-burden-improvement");
  delete after.samples[0].completionProofSha256;
  writeFileSync(f.after, JSON.stringify(after));
  unconfirmed();
});

test("R49 팀 소통은 구간 활동을 세고 열린 위임은 구간 끝의 상태를 표시한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  createTeamMember(f.root, "maker", "maker");
  const body = "SYNTHETIC work", plan = { id: "proposal-plan", assignee: "agent:maker", decisionOwner: "coordinator", proofScope: "T-1", instructionHash: digest(body) };
  const proposal = store.record({ protocol: "pace-handoff", v: 1, id: "proposal", kind: "decision_request", from: "coordinator", to: "owner", requestId: "approval-request", data: { interpretation: false, plan } }, body).record;
  const hash = proposalDigest(proposal);
  const approval = store.record({ protocol: "pace-handoff", v: 1, id: "approval", kind: "decision_reply", from: "owner", to: "coordinator", requestId: proposal.requestId, data: { re: proposal.id, decision: "approve", sourceRef: "fixture:approval", proposalHash: hash } }, "SYNTHETIC approval").record;
  const delegation = store.record({ protocol: "pace-handoff", v: 1, id: "delegated", kind: "delegate", from: "coordinator", to: "agent:maker", data: { basis: { kind: "approved", ref: proposal.id, approval: approval.id, hash }, plan } }, body).record;
  store.record({ protocol: "pace-handoff", v: 1, id: "within", kind: "scope_check", from: "agent:maker", to: "coordinator", data: { re: delegation.id, status: "within", basisHash: instructionDigest(delegation), checks: { instruction: true, decisionOwner: true, proofScope: true } } }, body);
  writeFileSync(join(f.root, "proof.txt"), "synthetic-proof");
  store.record({ protocol: "pace-handoff", v: 1, id: "result", kind: "result", from: "agent:maker", to: "coordinator", data: { re: delegation.id, status: "done", evidence: [{ path: "proof.txt", hash: digest("synthetic-proof") }] } }, body);
  store.record({ protocol: "pace-handoff", v: 1, id: "closed", kind: "close", from: "coordinator", to: "coordinator", data: { re: delegation.id, result: "result", proofScope: "T-1", checked: true } }, body);
  writeFileSync(store.path, store.read().map((row, i) => JSON.stringify({ ...row, at: `2026-01-${row.kind === "close" ? "03" : "01"}T00:0${i}:00Z` })).join("\n") + "\n");
  const period = { start: "2026-01-02T00:00:00Z", end: "2026-01-03T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, period.completionRef, period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period }));
  const result = f.run("project", "stats", "P001", "--json");
  assert.equal(result.status, 0, result.stderr);
  const stats = JSON.parse(result.stdout);
  assert.deepEqual(stats.handoffs.open, ["delegated"]);
  assert.equal(stats.handoffs.kinds.delegate, undefined);
  assert.equal(stats.team.snapshot.completionProofSha256, inputHash(readFileSync(join(f.dir, period.completionRef))));
  assert.match(f.run("project", "stats", "P001").stdout, /구간 말 열린 위임 1건/);
  period.end = "2026-01-04T00:00:00Z";
  receipt(f.dir, period.completionRef, period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period }));
  const later = f.run("project", "stats", "P001", "--json");
  assert.equal(later.status, 0, later.stderr);
  assert.deepEqual(JSON.parse(later.stdout).handoffs.open, []);
  assert.equal(JSON.parse(later.stdout).handoffs.kinds.close, 1);
});

test("R50 요청 수집 확인 없는 옛 stats는 관측을 보존하고 요청 총량과 부담 방향을 보류한다", () => {
  const f = compareFixture();
  for (const path of [f.before, f.after]) {
    const group = JSON.parse(readFileSync(path, "utf8"));
    for (const s of group.samples) {
      s.measurementKind = "stats-reported-v1";
      s.observed_counts.owner_questions = s.counts.owner_questions;
    }
    writeFileSync(path, JSON.stringify(group));
  }
  const c = f.compare(), row = c.rows.find((r) => r.metric === "owner_questions");
  assert.equal(c.conclusion, "unknown");
  assert.deepEqual(row, { metric: "owner_questions", before: null, after: null, delta: null, beforeObserved: 10, afterObserved: 2 });
  assert.match(c.reasons.join(" "), /요청 수집 결합 미확인/);
});

test("R50 팀 사건 로그 미수집 시 코디네이터 요청과 수신 미상 총량은 null이다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`;
  adoptTeamMetrics(f.root, rel);
  renameSync(join(f.dir, "log.jsonl"), join(f.dir, "uncollected.jsonl"));
  const r = f.run("project", "stats", "P001", "--json");
  assert.equal(r.status, 0, r.stderr);
  const { counts, observed_counts } = JSON.parse(r.stdout).team.snapshot;
  assert.equal(counts.coordinator_questions, null);
  assert.equal(counts.recipient_unknown, null);
  assert.equal(observed_counts.coordinator_questions, 0);
  assert.equal(observed_counts.recipient_unknown, 0);
});

test("R50 상태 메시지의 성공 신고도 별개 요청의 응답과 겹치면 도달 근거를 보류한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  adoptTeamMetrics(f.root, rel);
  const route = { transport: "external" as const, actor: "owner", target: "fixture:owner", from: "coordinator", sourceRef: "fixture:shared-route" };
  const response = { phase: "sent" as const, reportedBy: "coordinator", sourceRef: route.sourceRef, responseId: "shared-response", responseHash: digest("synthetic shared response") };
  for (const [requestId, kind] of [["proposal-request", "decision_request"], ["status-request", "status"]] as const) {
    store.record({ protocol: "pace-handoff", v: 1, id: requestId, kind, from: "coordinator", to: "owner", requestId, data: kind === "status" ? {} : { interpretation: false } }, "SYNTHETIC dispatch");
    prepareDelivery(store, requestId, `send-${requestId}`, route);
    deliveryReceipt(store, `send-${requestId}`, response);
  }
  const r = f.run("project", "stats", "P001", "--json");
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.team.requests.ownerDelivery, 0);
  assert.equal(report.handoffs.duplicateDeliveryRequests, 2);
  assert.equal(report.team.snapshot.deliveryClaims.length, 2);
  assert.ok(report.team.snapshot.deliveryClaims.every((claim: { counted: boolean }) => !claim.counted));

  const indirect = fixture(), linked = new HandoffStore(indirect.root, "P001", `projects/${indirect.dir.split("/").at(-1)}`);
  adoptTeamMetrics(indirect.root, `projects/${indirect.dir.split("/").at(-1)}`);
  for (const id of ["request-a", "request-b"]) {
    linked.record({ protocol: "pace-handoff", v: 1, id, kind: "decision_request", from: "coordinator", to: "owner", requestId: id, data: { interpretation: false } }, "SYNTHETIC question");
  }
  linked.record({ protocol: "pace-handoff", v: 1, id: "status-b", kind: "status", from: "coordinator", to: "owner", data: { re: "request-b" } }, "SYNTHETIC status");
  linked.record({ protocol: "pace-handoff", v: 1, id: "follow-up-b", kind: "status", from: "coordinator", to: "owner", data: { re: "status-b" } }, "SYNTHETIC status follow-up");
  for (const message of ["request-a", "follow-up-b"]) {
    prepareDelivery(linked, message, `send-${message}`, route);
    deliveryReceipt(linked, `send-${message}`, response);
  }
  const stats = indirect.run("project", "stats", "P001", "--json");
  assert.equal(stats.status, 0, stats.stderr);
  const result = JSON.parse(stats.stdout);
  assert.equal(result.team.requests.ownerDelivery, 0);
  assert.equal(result.handoffs.duplicateDeliveryRequests, 2);
  assert.equal(result.team.snapshot.deliveryClaims.length, 2);
});

test("R50 같은 저장소의 실제 포터블 stats 비교는 영수증 교체와 프로젝트 간 재사용을 보류한다", () => {
  const f = fixture(), bundle = join(f.root, "samples");
  mkdirSync(bundle);
  const before = join(bundle, "before.json"), after = join(bundle, "after.json");
  const shared = { id: "duplicate-provider-id", hash: digest("synthetic shared response") };
  const snapshots: unknown[] = [];
  const cases = [shared, { id: "distinct-before", hash: digest("distinct before") }, { id: "distinct-after", hash: digest("distinct after") }, null];
  const reports = cases.map((response, i) => {
    const id = `P00${i + 1}`;
    if (i > 0) {
      const made = f.run("project", "new", `합성 비교 ${id}`);
      assert.equal(made.status, 0, made.stderr);
    }
    const dir = join(f.root, "projects", readdirSync(join(f.root, "projects")).find((p) => p.startsWith(`${id}_`))!);
    const store = new HandoffStore(f.root, id, `projects/${dir.split("/").at(-1)}`);
    const period = { start: new Date(Date.UTC(2026, 0, i * 2 + 1)).toISOString(), end: new Date(Date.UTC(2026, 0, i * 2 + 2)).toISOString(), unit: "representative-task", closed: true, completionRef: `frame-${id}.json` };
    writeFileSync(join(dir, "log.jsonl"), "");
    const route = { transport: "external" as const, actor: "owner", target: "fixture:owner", from: "coordinator", sourceRef: "fixture:shared-provider" };
    if (response) {
      store.record({ protocol: "pace-handoff", v: 1, id: "question", kind: "decision_request", from: "coordinator", to: "owner", requestId: "request", data: { interpretation: false } }, "SYNTHETIC question");
      if (i === 0) {
        prepareDelivery(store, "question", "failed-first", route);
        deliveryReceipt(store, "failed-first", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
      }
      prepareDelivery(store, "question", "attempt", route);
      deliveryReceipt(store, "attempt", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseId: response.id, responseHash: response.hash });
      writeFileSync(store.path, store.read().map((row, index) => JSON.stringify({ ...row, at: new Date(Date.parse(period.start) + (index + 1) * 1000).toISOString() })).join("\n") + "\n");
    }
    receipt(dir, period.completionRef, period);
    const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
    const comparison = { ...snapshot().comparison, conditionCode: i < 2 ? "no-team" : "team" };
    const counts = Object.fromEntries(MANUAL_KEYS.slice(0, 4).map((key) => [key, 0]));
    const support = receipt(dir, `support-${id}.json`, period);
    writeFileSync(join(dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, comparison, period, request_coverage: { ...coverage, refs: [support] }, log_coverage: coverage, quality_audit: { blocking_sum: 0, rereviews_after_fail: 0, coverage }, counts, coverage: Object.fromEntries(Object.keys(counts).map((key) => [key, coverage])) }));
    const capture = () => {
      confirmRequestInput(dir, f.run, id);
      const report = f.run("project", "stats", id, "--json");
      assert.equal(report.status, 0, report.stderr);
      const saved = JSON.parse(report.stdout).team.snapshot;
      assert.equal(saved.counts.owner_questions, response ? 1 : 0);
      for (const ref of [period.completionRef, saved.requestCoverage.ref, support]) writeFileSync(join(bundle, ref), readFileSync(join(dir, ref)));
      snapshots[i] = saved;
      return join(bundle, saved.requestCoverage.ref);
    };
    return { capture, certificate: capture(), store };
  });
  const save = () => {
    writeFileSync(before, JSON.stringify({ version: 1, samples: snapshots.slice(0, 2) }));
    writeFileSync(after, JSON.stringify({ version: 1, samples: snapshots.slice(2) }));
  };
  const compare = () => {
    const r = f.run("project", "compare-team", "--before", before, "--after", after, "--kind", "team-adoption", "--json");
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  save();
  assert.equal(compare().conclusion, "observed-burden-improvement");
  for (const file of [before, after]) {
    const group = JSON.parse(readFileSync(file, "utf8"));
    for (const sample of group.samples) sample.comparison.host = "relabelled-host";
    writeFileSync(file, JSON.stringify(group));
  }
  const changedHost = compare();
  assert.equal(changedHost.conclusion, "unknown");
  assert.match(changedHost.reasons.join(" "), /요청 수집 결합 미확인/);
  assert.equal(changedHost.rows.find((row: { metric: string }) => row.metric === "owner_questions").afterObserved, 1);
  save();
  const partial = JSON.parse(readFileSync(before, "utf8"));
  partial.samples[1].observed_counts.failed_owner_delivery_attempts = null;
  writeFileSync(before, JSON.stringify(partial));
  const partialResult = compare();
  const failed = partialResult.rows.find((r: { metric: string }) => r.metric === "failed_owner_delivery_attempts");
  assert.equal(failed.before, null);
  assert.equal(failed.beforeObserved, 1);
  assert.match(partialResult.limits.join(" "), /관측.*알려진 하한/);
  save();
  const frame = join(bundle, "frame-P003.json"), originalFrame = readFileSync(frame, "utf8");
  const newFrame = JSON.stringify({ ...JSON.parse(originalFrame), sourceRef: "representative-scope:fixture:other-task", hash: digest("other work") });
  const changedFrame = JSON.parse(readFileSync(after, "utf8"));
  changedFrame.samples[0].completionProofSha256 = inputHash(newFrame);
  writeFileSync(frame, newFrame);
  writeFileSync(after, JSON.stringify(changedFrame));
  const changed = compare();
  assert.equal(changed.conclusion, "unknown");
  assert.match(changed.reasons.join(" "), /요청 수집 결합 미확인/);
  assert.equal(changed.rows.find((r: { metric: string }) => r.metric === "owner_questions").afterObserved, 1);
  writeFileSync(frame, originalFrame);
  save();
  for (const file of [before, after]) {
    const relabeled = JSON.parse(readFileSync(file, "utf8"));
    for (const sample of relabeled.samples) sample.repository = "fixture-unrelated-repository";
    writeFileSync(file, JSON.stringify(relabeled));
  }
  const relabeled = compare();
  assert.equal(relabeled.conclusion, "unknown");
  assert.match(relabeled.reasons.join(" "), /요청 수집 결합 미확인/);
  save();
  const lowered = JSON.parse(readFileSync(after, "utf8"));
  lowered.samples[0].counts.owner_questions = 0;
  writeFileSync(after, JSON.stringify(lowered));
  const inconsistent = compare();
  const right = inconsistent.rows.find((r: { metric: string }) => r.metric === "owner_questions");
  assert.equal(inconsistent.conclusion, "unknown");
  assert.equal(right.after, null);
  assert.equal(right.afterObserved, 1);
  save();
  const support = join(bundle, "support-P002.json"), movedSupport = join(bundle, "moved-support.json");
  renameSync(support, movedSupport);
  const withoutSupport = compare();
  assert.equal(withoutSupport.conclusion, "unknown");
  assert.match(withoutSupport.reasons.join(" "), /요청 수집 결합 미확인/);
  assert.equal(withoutSupport.rows.find((r: { metric: string }) => r.metric === "owner_questions").beforeObserved, 2);
  renameSync(movedSupport, support);
  const incomplete = JSON.parse(readFileSync(after, "utf8"));
  delete incomplete.samples[0].requestCoverage.inputSha256;
  writeFileSync(after, JSON.stringify(incomplete));
  const withoutHash = compare();
  assert.equal(withoutHash.conclusion, "unknown");
  assert.equal(withoutHash.rows.find((r: { metric: string }) => r.metric === "owner_questions").afterObserved, 1);
  save();
  const certificate = reports[1]!.certificate, original = readFileSync(certificate, "utf8");
  writeFileSync(certificate, JSON.stringify({ ...JSON.parse(original), sourceRef: "request-coverage:fixture:different" }));
  const unconfirmed = compare();
  assert.equal(unconfirmed.conclusion, "unknown");
  assert.match(unconfirmed.reasons.join(" "), /요청 수집 결합 미확인/);
  assert.equal(unconfirmed.rows.find((r: { metric: string }) => r.metric === "owner_questions").beforeObserved, 2);
  writeFileSync(certificate, original);
  const replay = reports[2]!.store;
  writeFileSync(replay.path, replay.read().map((row) => JSON.stringify(row.data.phase === "sent" ? { ...row, data: { ...row.data, responseId: shared.id, responseHash: shared.hash } } : row)).join("\n") + "\n");
  reports[2]!.capture();
  save();
  const reused = compare(), owner = reused.rows.find((r: { metric: string }) => r.metric === "owner_questions");
  assert.equal(reused.conclusion, "unknown");
  assert.match(reused.reasons.join(" "), /비교 표본의 외부 응답 증빙 재사용/);
  assert.deepEqual(owner, { metric: "owner_questions", before: null, after: null, delta: null, beforeObserved: 2, afterObserved: 1 });
  const failuresOnly = reused.rows.find((r: { metric: string }) => r.metric === "failed_only_owner_requests");
  assert.deepEqual(failuresOnly, { metric: "failed_only_owner_requests", before: null, after: null, delta: null, beforeObserved: 0, afterObserved: 0 });
  const afterSamples = JSON.parse(readFileSync(after, "utf8"));
  const reported = afterSamples.samples[0], { requestCoverage, deliveryClaims } = reported;
  const expectConflict = () => {
    writeFileSync(after, JSON.stringify(afterSamples));
    const held = compare();
    assert.equal(held.conclusion, "unknown");
    assert.match(held.reasons.join(" "), /비교 표본의 외부 응답 증빙 재사용/);
    const request = held.rows.find((r: { metric: string }) => r.metric === "owner_questions");
    assert.equal(request.before, null);
    assert.equal(request.after, null);
    assert.equal(request.beforeObserved, 2);
    assert.equal(request.afterObserved, 1);
  };
  delete reported.requestCoverage;
  expectConflict();
  reported.requestCoverage = requestCoverage;
  reported.deliveryClaims = [...deliveryClaims, { ...deliveryClaims[0], responses: [] }];
  expectConflict();
  reported.deliveryClaims = [];
  writeFileSync(after, JSON.stringify(afterSamples));
  const missingClaims = compare();
  assert.equal(missingClaims.conclusion, "unknown");
  assert.match(missingClaims.reasons.join(" "), /요청 수집 결합 미확인/);
  assert.equal(missingClaims.rows.find((r: { metric: string }) => r.metric === "owner_questions").afterObserved, 1);
  save();
  writeFileSync(certificate, JSON.stringify({ ...JSON.parse(original), hash: "invalid" }));
  const damagedReceipt = compare();
  assert.equal(damagedReceipt.conclusion, "unknown");
  assert.match(damagedReceipt.reasons.join(" "), /요청 수집 결합 미확인/);
  assert.equal(damagedReceipt.rows.find((r: { metric: string }) => r.metric === "owner_questions").beforeObserved, 2);
  writeFileSync(certificate, JSON.stringify({ ...JSON.parse(original), hash: "x".repeat(20000) }));
  const tooLarge = compare();
  assert.equal(tooLarge.conclusion, "unknown");
  assert.match(tooLarge.reasons.join(" "), /요청 수집 결합 미확인/);
  assert.equal(tooLarge.rows.find((r: { metric: string }) => r.metric === "owner_questions").beforeObserved, 2);
  const parked = join(bundle, "oversized-parked.json");
  renameSync(certificate, parked);
  symlinkSync(parked, certificate);
  assert.equal(f.run("project", "compare-team", "--before", before, "--after", after, "--kind", "team-adoption", "--json").status, 2);
});

test("R51 한 표본의 큰 전송 증빙 목록은 256 KiB를 넘어도 관측을 읽을 수 있다", () => {
  const f = compareFixture(), after = JSON.parse(readFileSync(f.after, "utf8"));
  const s = after.samples[0];
  s.measurementKind = "stats-reported-v1";
  s.observed_counts.owner_questions = 1;
  s.deliveryClaims = Array.from({ length: 1200 }, (_, i) => ({
    request: digest(`synthetic-request-${i}`),
    responses: [digest(`synthetic-response-${i}`), digest(`synthetic-alias-${i}`)],
    counted: false,
  }));
  const saved = JSON.stringify(after);
  assert.ok(Buffer.byteLength(saved) > 256 * 1024);
  writeFileSync(f.after, saved);
  const result = f.compare();
  assert.equal(result.conclusion, "unknown");
  assert.match(result.reasons.join(" "), /요청 수집 결합 미확인/);
});

test("R54 stats 봉투에서 출처 필드가 빠져도 수기 비교로 바뀌지 않는다", () => {
  const f = compareFixture();
  for (const path of [f.before, f.after]) {
    const group = JSON.parse(readFileSync(path, "utf8"));
    group.samples = group.samples.map((snapshot: unknown) => ({ team: { snapshot } }));
    writeFileSync(path, JSON.stringify(group));
  }
  const c = f.compare();
  assert.equal(c.conclusion, "unknown");
  assert.equal(c.sources.before.origin, "stats-declared-reported");
  assert.match(c.reasons.join(" "), /요청 수집 결합 미확인/);
});

for (const conflictingId of [false, true]) test(`R54 링크된 사용자 전송은 코디네이터 자체 답으로 비교 미해결을 상쇄하지 못한다 (conflict=${conflictingId})`, () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`;
  createTeamMember(f.root, "maker", "maker");
  const store = new HandoffStore(f.root, "P001", rel), id = "coordinator-question";
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  store.record({ protocol: "pace-handoff", v: 1, id: "question", kind: "decision_request", from: "agent:maker", to: "coordinator", requestId: id, data: { interpretation: false } }, "SYNTHETIC question");
  if (conflictingId) store.record({ protocol: "pace-handoff", v: 1, id: "older", kind: "decision_request", from: "agent:maker", to: "coordinator", requestId: "older-request", data: { interpretation: false } }, "SYNTHETIC older question");
  store.record({ protocol: "pace-handoff", v: 1, id: "status", kind: "status", from: "coordinator", to: "owner", ...(conflictingId ? { requestId: id } : {}), data: { re: conflictingId ? "older" : "question" } }, "SYNTHETIC status");
  const route = { transport: "external" as const, actor: "owner", target: "fixture:owner", from: "coordinator", sourceRef: "fixture:status-route" };
  prepareDelivery(store, "status", "attempt", route);
  deliveryReceipt(store, "attempt", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseId: "synthetic-status-answer", responseHash: digest("synthetic status receipt") });
  writeFileSync(store.path, store.read().map((row, i) => JSON.stringify({ ...row, at: row.id === "older" ? "2025-12-31T23:59:00Z" : `2026-01-01T00:0${i + 1}:00Z` })).join("\n") + "\n");
  recordEvent(f.dir, { ts: "2026-01-01T04:00:00Z", p: "P001", type: "answer", by: "coordinator", msg: "synthetic coordinator response", requestId: id });
  receipt(f.dir, "frame.json", period);
  receipt(f.dir, "answer.json", period, id);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: "frame.json", refs: ["frame.json"] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: coverage, coordinator_answers: [{ requestId: id, coverage: { ...coverage, confirmationRef: "answer.json", refs: ["answer.json"] } }] }));
  confirmRequestInput(f.dir, f.run);
  const result = f.run("project", "stats", "P001", "--json");
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.handoffs.requests.items[0].ownerSignal, true);
  assert.equal(report.handoffs.requests.items[0].coordinatorAnswered, true);
  assert.equal(report.team.requests.reached, 0);
  assert.equal(report.team.requests.reachedTotal, null);
  assert.equal(report.team.requests.comparisonUnconfirmed, conflictingId ? 2 : 1);
  assert.deepEqual(report.handoffs.crossBoundaryRequests, conflictingId ? ["older-request"] : []);
  assert.equal(report.handoffs.requests.items[0].attributionUnconfirmed, conflictingId ? true : undefined);
});

test("R54 finish 뒤 같은 tree의 뒤따른 커밋은 재마감 전까지 병합 대상으로 받지 않는다", () => {
  const { f, worktree } = mergeFixture(), preload = join(tempDir("pace-finish-empty-descendant-"), "inject.mjs");
  writeFileSync(preload, `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
const original=cp.spawnSync;
let fired=false;
cp.spawnSync=function(command,args,options) {
  const result=original(command,args,options);
  if (!fired && command==='git' && args.includes('update-ref') && args.includes('commit: chore(P001): 마감') && result.status===0) {
    fired=true;
    const later=original('git',['-C',${JSON.stringify(worktree)},'commit','--allow-empty','-qm','synthetic unrelated empty commit'],options);
    if (later.status!==0) throw Error('synthetic empty commit did not run');
  }
  return result;
};
syncBuiltinESMExports();`);
  const finish = runPace(["project", "finish", "P001"], { cwd: worktree, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` } });
  assert.notEqual(finish.status, 0);
  assert.match(finish.stdout + finish.stderr, /마감 커밋 중 입력\/tree/);
  assert.equal(f.git("-C", worktree, "rev-parse", "HEAD^{tree}").stdout, f.git("-C", worktree, "rev-parse", "HEAD^1^{tree}").stdout);
  const preview = f.run("project", "merge", "P001");
  assert.notEqual(preview.status, 0);
  assert.match(preview.stdout + preview.stderr, /팀 finish.*부모/);
});

test("R56 긴 상태 참조 연쇄에서도 stats는 전송마다 증빙 하나를 내며 compare가 관측을 읽는다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, period.completionRef, period);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period }));
  store.record({ protocol: "pace-handoff", v: 1, id: "root", kind: "decision_request", from: "coordinator", to: "owner", requestId: "first", data: { interpretation: false } }, "SYNTHETIC question");
  store.record({ protocol: "pace-handoff", v: 1, id: "status", kind: "status", from: "coordinator", to: "owner", requestId: "status-request", data: { re: "root" } }, "SYNTHETIC status");
  const route = { transport: "external" as const, actor: "owner", target: "fixture:owner", from: "coordinator", sourceRef: "fixture:route" };
  prepareDelivery(store, "status", "seed", route);
  deliveryReceipt(store, "seed", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseId: "seed", responseHash: digest("synthetic seed") });
  const [root, status, started, sent] = store.read();
  assert.ok(root && status && started && sent);
  const rows = [root], length = 650;
  for (let i = 0; i < length; i++) {
    const id = `status-${i}`, requestId = `request-${i}`, attemptId = `attempt-${i}`;
    rows.push({ ...status, id, requestId, data: { re: i === 0 ? root.id : `status-${i - 1}` } });
    rows.push({ ...started, id: `${attemptId}-started`, requestId, data: { ...started.data, re: id, attemptId } });
    rows.push({ ...sent, id: `${attemptId}-sent`, requestId, data: { ...sent.data, re: id, attemptId, responseId: attemptId, responseHash: digest(attemptId) } });
  }
  writeFileSync(store.path, rows.map((row, i) => JSON.stringify({ ...row, seq: i + 1, at: new Date(Date.parse(period.start) + 1000 * i).toISOString() })).join("\n") + "\n");
  assert.equal(store.read().length, 1 + 3 * length);
  const r = f.run("project", "stats", "P001", "--json");
  assert.equal(r.status, 0, r.error?.message ?? r.stderr);
  const report = JSON.parse(r.stdout).team;
  assert.equal(report.snapshot.deliveryClaims.length, length);
  assert.ok(report.snapshot.deliveryClaims.every((claim: { ambiguous: boolean; counted: boolean }) => claim.ambiguous && !claim.counted));
  assert.equal(report.requests.reached, 0);
  assert.equal(report.requests.reachedTotal, null);
  const before = join(f.dir, "before.json"), after = join(f.dir, "after.json"), contents = JSON.stringify(report.snapshot);
  writeFileSync(before, contents);
  writeFileSync(after, contents);
  const compare = f.run("project", "compare-team", "--before", before, "--after", after, "--kind", "team-adoption", "--json");
  assert.equal(compare.status, 0, compare.stderr);
  const output = JSON.parse(compare.stdout);
  assert.equal(output.conclusion, "unknown");
  const owners = output.rows.find((row: { metric: string }) => row.metric === "owner_questions");
  assert.equal(owners.beforeObserved, 0);
  assert.equal(owners.afterObserved, 0);
});

test("R57 기존 병합은 pre-FF 거부 기록과 동일 SHA를 보존하며 main 정리 후 재시도한다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false);
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  const target = f.git("-C", worktree, "rev-parse", "HEAD").stdout.trim();
  const mainHead = f.git("rev-parse", "HEAD").stdout;
  const dirty = join(f.root, "pending.txt");
  writeFileSync(dirty, "SYNTHETIC uncommitted");
  const reject = f.run("project", "merge", "P001", "--yes");
  assert.notEqual(reject.status, 0);
  assert.match(reject.stderr + reject.stdout, /main 작업 트리에 커밋하지 않은 변경/);
  assert.equal(f.git("rev-parse", "HEAD").stdout, mainHead);
  const rejectedLog = readFileSync(join(dir, "log.jsonl"), "utf8");
  assert.match(rejectedLog, /"type":"merge".*"msg":"merge: command"/);
  renameSync(dirty, join(f.home, "parked.txt"));
  assert.equal(f.git("rev-parse", "project/P001").stdout.trim(), target);
  const retry = f.run("project", "merge", "P001", "--yes");
  assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  assert.equal(f.git("merge-base", "--is-ancestor", target, "HEAD").status, 0);
  assert.equal(readFileSync(join(dir, "log.jsonl"), "utf8"), rejectedLog);
  assert.equal(f.git("rev-parse", "project/P001").stdout.trim(), target);
});

for (const owner of [true, false]) test(`R58 같은 시각의 로그 요청과 답은 기록 순서를 따른다 (owner=${owner})`, () => {
  const f = fixture(), id = "same-clock", time = "2026-01-01T01:00:00Z", log = join(f.dir, "log.jsonl");
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, period.completionRef, period);
  receipt(f.dir, "answer.json", period, id);
  const c = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, request_coverage: c, ...(owner ? {} : {
    coordinator_answers: [{ requestId: id, coverage: { ...c, confirmationRef: "answer.json", refs: ["answer.json"] } }],
  }) }));
  const question = { ts: time, p: "P001", type: "question", by: "agent", to: owner ? "owner" : "coordinator", requestId: id, msg: "synthetic same-clock question" };
  const answer = { ts: time, p: "P001", type: "answer", by: owner ? "user" : "coordinator", requestId: id, msg: "synthetic same-clock answer", ...(owner ? { ref: "answer.json" } : {}) };
  const get = (events: unknown[]) => {
    writeFileSync(log, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const result = f.run("project", "stats", "P001", "--json");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const before = get([answer, question]);
  assert.equal(before.handoffs.requests.items[0].attributionUnconfirmed, true);
  assert.equal(before.team.requests.ownerReply, 0);
  assert.equal(before.team.requests.comparisonUnconfirmed, 1);
  assert.equal(before.team.requests.reachedTotal, null);
  const after = get([question, answer]);
  assert.equal(after.handoffs.requests.items[0].attributionUnconfirmed, undefined);
  assert.equal(after.team.requests.ownerReply, owner ? 1 : 0);
  assert.equal(after.team.requests.reachedTotal, owner ? 1 : 0);
  if (owner) {
    const store = new HandoffStore(f.root, "P001", `projects/${f.dir.split("/").at(-1)}`);
    const proposal = store.record({ protocol: "pace-handoff", v: 1, id: "same-clock-native", kind: "decision_request", from: "coordinator", to: "owner", requestId: id, data: { interpretation: false } }, "SYNTHETIC native question").record;
    writeFileSync(store.path, JSON.stringify({ ...proposal, at: time }) + "\n");
    const mixed = get([answer]);
    assert.equal(mixed.handoffs.requests.items[0].attributionUnconfirmed, true);
    assert.equal(mixed.team.requests.ownerReply, 0);
    assert.equal(mixed.team.requests.reachedTotal, null);

    const question = store.read()[0]!;
    const reply = store.record({ protocol: "pace-handoff", v: 1, id: "same-clock-reply", kind: "decision_reply", from: "owner", to: "coordinator", requestId: id, data: { re: question.id, decision: "approve", sourceRef: "fixture:same-clock-reply", proposalHash: proposalDigest(question) } }, "SYNTHETIC native reply").record;
    writeFileSync(store.path, store.read().map((row) => JSON.stringify({ ...row, at: time })).join("\n") + "\n");
    assert.equal(get([]).team.requests.reachedTotal, 1);
    const answerPath = join(f.dir, "answer.json"), evidence = JSON.parse(readFileSync(answerPath, "utf8"));
    writeFileSync(answerPath, JSON.stringify({ ...evidence, decisionReplyId: reply.id }));
    const linked = get([answer]);
    assert.equal(linked.handoffs.requests.items[0].attributionUnconfirmed, undefined);
    assert.equal(linked.team.requests.ownerReply, 1);
    assert.equal(linked.team.requests.reachedTotal, 1);
    writeFileSync(answerPath, JSON.stringify({ ...evidence, decisionReplyId: "other-reply" }));
    const unlinked = get([answer]);
    assert.equal(unlinked.handoffs.requests.items[0].attributionUnconfirmed, true);
    assert.equal(unlinked.team.requests.ownerReply, 1);
    assert.equal(unlinked.team.requests.reachedTotal, null);
  }
});

test("R61 범위 확인의 승인 위임을 따라 별개 요청 간 응답 재사용을 확인한다", () => {
  const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`, store = new HandoffStore(f.root, "P001", rel);
  createTeamMember(f.root, "maker", "maker");
  adoptTeamMetrics(f.root, rel);
  const body = "SYNTHETIC assignment", plan = { id: "plan", assignee: "agent:maker", decisionOwner: "coordinator", proofScope: "T-1", instructionHash: digest(body) };
  store.record({ protocol: "pace-handoff", v: 1, id: "request-a", kind: "decision_request", from: "coordinator", to: "owner", requestId: "first", data: { interpretation: false } }, "SYNTHETIC question");
  const proposal = store.record({ protocol: "pace-handoff", v: 1, id: "request-b", kind: "decision_request", from: "coordinator", to: "owner", requestId: "second", data: { interpretation: false, plan } }, body).record;
  const hash = proposalDigest(proposal);
  const reply = store.record({ protocol: "pace-handoff", v: 1, id: "approval", kind: "decision_reply", from: "owner", to: "coordinator", requestId: "second", data: { re: proposal.id, decision: "approve", proposalHash: hash, sourceRef: "fixture:approval" } }, "SYNTHETIC approved").record;
  const delegate = store.record({ protocol: "pace-handoff", v: 1, id: "delegated", kind: "delegate", from: "coordinator", to: "agent:maker", data: { basis: { kind: "approved", ref: proposal.id, approval: reply.id, hash }, plan } }, body).record;
  store.record({ protocol: "pace-handoff", v: 1, id: "within", kind: "scope_check", from: "agent:maker", to: "coordinator", data: { re: delegate.id, status: "within", basisHash: instructionDigest(delegate), checks: { instruction: true, decisionOwner: true, proofScope: true } } }, body);
  const route = { transport: "external" as const, actor: "owner", target: "fixture:owner", from: "coordinator", sourceRef: "fixture:shared-response" };
  const response = { phase: "sent" as const, reportedBy: "coordinator", sourceRef: route.sourceRef, responseId: "shared-id", responseHash: digest("synthetic shared response") };
  prepareDelivery(store, "request-a", "failed", route);
  deliveryReceipt(store, "failed", { phase: "failed", reportedBy: "coordinator", sourceRef: route.sourceRef });
  prepareDelivery(store, "request-a", "sent-a", route);
  deliveryReceipt(store, "sent-a", response);
  prepareDelivery(store, "within", "sent-b", { ...route, actor: "coordinator", target: "fixture:coordinator", from: "agent:maker" });
  deliveryReceipt(store, "sent-b", response);

  const r = f.run("project", "stats", "P001", "--json");
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.equal(data.team.requests.ownerDelivery, 0);
  assert.equal(data.team.requests.ownerReply, 1);
  assert.equal(data.team.requests.failedAttemptsObserved, 1);
  assert.equal(data.team.requests.unconfirmed, 1);
  assert.equal(data.team.snapshot.deliveryClaims.length, 2);
  assert.equal(data.handoffs.duplicateDeliveryRequests, 2);
});

test("R62 평면 stats의 출처 필드가 함께 빠져도 요청 총량을 수기 신고로 승격하지 않는다", () => {
  const f = compareFixture();
  for (const path of [f.before, f.after]) {
    const group = JSON.parse(readFileSync(path, "utf8"));
    for (const s of group.samples) {
      s.observed_at = "2026-02-01T00:00:00Z";
      s.unknown = { ...s.unknown, recipient_events: 0, manual_fields: 1 };
      s.observed_counts.owner_questions = s.counts.owner_questions;
    }
    writeFileSync(path, JSON.stringify(group));
  }
  const inferred = f.compare();
  assert.equal(inferred.conclusion, "unknown");
  assert.equal(inferred.sources.before.origin, "stats-declared-reported");
  assert.match(inferred.reasons.join(" "), /요청 수집 결합 미확인/);
  const owner = inferred.rows.find((r) => r.metric === "owner_questions");
  assert.deepEqual(owner, { metric: "owner_questions", before: null, after: null, delta: null, beforeObserved: 10, afterObserved: 2 });

  for (const path of [f.before, f.after]) {
    const group = JSON.parse(readFileSync(path, "utf8"));
    for (const s of group.samples) s.measurementKind = "independent-reported-v1";
    writeFileSync(path, JSON.stringify(group));
  }
  const conflict = f.compare();
  assert.equal(conflict.conclusion, "unknown");
  assert.equal(conflict.sources.before.origin, "stats-declared-reported");
  assert.deepEqual(conflict.rows.find((r) => r.metric === "owner_questions"), owner);

  for (const path of [f.before, f.after]) {
    const group = JSON.parse(readFileSync(path, "utf8"));
    for (const s of group.samples) {
      delete s.unknown.manual_fields;
      delete s.unknown.recipient_events;
    }
    writeFileSync(path, JSON.stringify(group));
  }
  const declared = f.compare();
  assert.equal(declared.sources.before.origin, "independent-reported");
  assert.equal(declared.conclusion, "observed-burden-improvement");
});

test("R62 검사 명령이 없는 팀 finish는 병합 미리보기에 전체 검사 미실행을 표시한다", () => {
  const { f, run, dir } = mergeFixture(null);
  const result = run("project", "finish", "P001");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /검사 명령이 선언되지 않았다/);
  const seal = JSON.parse(readFileSync(join(dir, "TEAM-FINISH.json"), "utf8"));
  assert.equal(seal.checkStatus, "not-run");
  const preview = f.run("project", "merge", "P001");
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.match(preview.stdout, /팀 전체 검사: 미실행/);
});

test("R64 비교는 수집 확인 상태와 무관하게 모든 명시 영수증 경로를 검사한다", () => {
  const files = compareFixture(), { run } = fixture();
  const before = JSON.parse(readFileSync(files.before, "utf8")), after = JSON.parse(readFileSync(files.after, "utf8"));
  const sample = after.samples[0];
  sample.deliveryClaims = [];
  sample.observed_counts.owner_questions = sample.counts.owner_questions;
  sample.requestCoverage = {
    ref: "confirmation.json", inputSha256: digest("nonmatching input"),
    receiptSha256: digest("confirmation"), sourceSha256: digest("input rows"),
    support: [{ ref: "support.json", receiptSha256: digest("support") }],
  };
  const supportPath = join(files.dir, "support.json");
  receipt(files.dir, "support.json", sample.period);
  const check = (s: typeof sample, code: number) => {
    writeFileSync(files.before, JSON.stringify(before));
    writeFileSync(files.after, JSON.stringify({ ...after, samples: [s, after.samples[1]] }));
    const result = run("project", "compare-team", "--before", files.before, "--after", files.after, "--kind", "team-adoption", "--json");
    assert.equal(result.status, code, result.stdout + result.stderr);
    return result;
  };
  const safe = check(sample, 0);
  const observed = JSON.parse(safe.stdout).rows.find((row: { metric: string }) => row.metric === "owner_questions");
  assert.equal(observed.after, null);
  assert.equal(observed.afterObserved, 1);
  const badConfirmation = structuredClone(sample);
  badConfirmation.requestCoverage.ref = "../unavailable.json";
  unlinkSync(supportPath);
  check(badConfirmation, 2);
  badConfirmation.requestCoverage.inputSha256 = "malformed";
  check(badConfirmation, 2);

  if (process.platform !== "win32") {
    symlinkSync(join(files.dir, sample.period.completionRef), supportPath);
    check(sample, 2);
  }
  const openSample = structuredClone(sample);
  openSample.period.closed = false;
  openSample.period.completionRef = "../unavailable.json";
  check(openSample, 2);
  delete openSample.period.closed;
  check(openSample, 2);
});

test("R64 부분 품질 수집은 로그와 감사 관측을 보존하며 총량을 보류한다", () => {
  const f = fixture();
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "period.json" };
  const logs = receipt(f.dir, "logs.json", period), audit = receipt(f.dir, "audit.json", period);
  receipt(f.dir, period.completionRef, period);
  const coverage = (ref: string) => ({ status: "partial", reportedBy: "agent:maker", refs: [ref], verifiedBy: "coordinator", confirmationRef: ref });
  const manual = { owner_manual_role_corrections: 1, coordinator_extra_instructions: 2, normal_role_assignment: 3, owner_approvals: 4 };
  const input = { version: 1, period, comparison: { qualitySource: "audited-verdicts" }, log_coverage: coverage(logs), quality_audit: { blocking_sum: 3, rereviews_after_fail: 2, coverage: coverage(audit) }, counts: manual, coverage: Object.fromEntries(Object.keys(manual).map((key) => [key, { ...coverage(logs), status: "complete" }])) };
  const review = "reviewer fail blocking 2 should_fix 1";
  recordEvent(f.dir, { ts: "2026-01-01T12:00:00Z", p: "P001", type: "review", by: "agent", msg: review, data: reviewMessageData(review) });
  recordMetric(f.dir, { ts: "2026-01-01T12:30:00Z", project: "P001", cmd: "check", ok: false, reason: "checks" });
  recordEvent(f.dir, { ts: "2026-01-01T14:00:00Z", p: "P001", type: "gate", by: "cli", ok: false, msg: "check: checks", data: { check: 1, finish: 1 } });
  const observed = { blocking_sum_stats_events: 2, should_fix_sum_stats_events: 1, blocking_sum_audited: 3, rereviews_after_fail: 2, review_failures: 1, gate_failures: 1, blocking_sum: 3 };
  const report = () => {
    writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify(input));
    const json = f.run("project", "stats", "P001", "--json");
    assert.equal(json.status, 0, json.stderr);
    return JSON.parse(json.stdout).team.snapshot;
  };
  const partial = report();
  for (const [key, value] of Object.entries(manual)) {
    assert.equal(partial.counts[key], value, key);
    assert.equal(partial.observed_counts[key], value, key);
  }
  for (const [key, value] of Object.entries(observed)) {
    assert.equal(partial.counts[key], null, key);
    assert.equal(partial.observed_counts[key], value, key);
  }
  const rendered = f.run("project", "stats", "P001");
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /blocking 사건.*관측 2 \/ 총량 미확인/);
  assert.match(rendered.stdout, /blocking 감사.*관측 3 \/ 총량 미확인/);

  input.log_coverage.status = "complete";
  input.quality_audit.coverage.status = "complete";
  const complete = report();
  for (const [key, value] of Object.entries(observed)) {
    assert.equal(complete.counts[key], key === "gate_failures" ? null : value, key);
    assert.equal(complete.observed_counts[key], value, key);
  }

  const outOfPeriod = { ...period, end: "2026-01-01T10:00:00Z" };
  receipt(f.dir, audit, outOfPeriod);
  writeFileSync(join(f.dir, "log.jsonl"), "");
  input.log_coverage.status = "partial";
  const uncollected = report();
  for (const key of Object.keys(observed)) {
    assert.equal(uncollected.observed_counts[key], null, key);
    assert.equal(uncollected.counts[key], null, key);
  }
});

test("R64 비교 CLI는 세 목적을 구별하고 다른 목적의 표본은 성공 보고 없이 거부한다", () => {
  const files = compareFixture(), { run } = fixture();
  const before = JSON.parse(readFileSync(files.before, "utf8")), after = JSON.parse(readFileSync(files.after, "utf8"));
  const compare = (study: string) => run("project", "compare-team", "--before", files.before, "--after", files.after, "--kind", study, "--json");
  for (const [study, first, second] of [
    ["role-automation", "message-role", "start-role"],
    ["team-adoption", "no-team", "team"],
    ["definition-change", "before-change", "after-change"],
  ] as const) {
    for (const [source, conditionCode] of [[before, first], [after, second]] as const) {
      for (const sample of source.samples) Object.assign(sample.comparison, { study, conditionCode });
    }
    writeFileSync(files.before, JSON.stringify(before));
    writeFileSync(files.after, JSON.stringify(after));
    const result = compare(study);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.study, study);
    assert.equal(report.conclusion, "observed-burden-improvement");
  }
  const mismatched = compare("team-adoption");
  assert.equal(mismatched.status, 2);
  assert.equal(mismatched.stdout, "");
  writeFileSync(files.after, JSON.stringify({ ...after, samples: after.samples.slice(0, 1) }));
  const insufficient = compare("definition-change");
  assert.equal(insufficient.status, 0, insufficient.stderr);
  const report = JSON.parse(insufficient.stdout);
  assert.equal(report.conclusion, "unknown");
  assert.ok(report.additionalSamplePlan.some((plan: string) => plan.includes("표본을 추가 수집")));
});

test("R65 프로젝트 범위의 이전 답을 뒤에 시작한 태스크의 대표 업무로 올리지 않는다", () => {
  const f = fixture();
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, period.completionRef, period);
  const requestId = "early-project-answer", ref = receipt(f.dir, "answer.json", period, requestId);
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({
    version: 1,
    period,
    request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] },
  }));
  const question = { ts: "2026-01-01T01:00:00Z", p: "P001", requestId, type: "question", by: "agent", to: "owner", msg: "synthetic project question" };
  const answer = { ts: "2026-01-01T02:00:00Z", p: "P001", requestId, type: "answer", by: "user", ref, msg: "synthetic project answer" };
  const taskQuestion = { ...question, ts: "2026-01-01T03:00:00Z", t: "T01", msg: "synthetic task question" };
  const report = (rows: object[]) => {
    writeFileSync(join(f.dir, "log.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const result = f.run("project", "stats", "P001", "--json");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).team;
  };
  const earlier = report([question, answer, taskQuestion]);
  assert.equal(earlier.requests.ownerReply, 1);
  assert.equal(earlier.requests.reachedTotal, null);
  assert.match(earlier.snapshot.limits.join(" "), /대표 업무 단독 수집 범위 미확인/);
  const sameClock = report([question, answer, { ...taskQuestion, ts: answer.ts }]);
  assert.equal(sameClock.requests.ownerReply, 1);
  assert.equal(sameClock.requests.reachedTotal, null);
  const onlyTask = report([taskQuestion, { ...answer, ts: "2026-01-01T04:00:00Z" }]);
  assert.equal(onlyTask.requests.ownerReply, 1);
  assert.equal(onlyTask.requests.reachedTotal, 1);
});

test("R65 완료 및 요청 지원을 함께 맡은 영수증이 유효하지 않으면 관측을 유지한다", () => {
  const f = fixture(), before = compareFixture();
  const period = { start: "2026-02-01T00:00:00Z", end: "2026-02-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  const requestId = "report-with-shared-completion";
  receipt(f.dir, period.completionRef, period);
  const proof = join(f.dir, period.completionRef), original = readFileSync(proof);
  const ref = receipt(f.dir, "answer.json", period, requestId);
  recordEvent(f.dir, { ts: "2026-02-01T01:00:00Z", p: "P001", requestId, type: "question", by: "agent", to: "owner", msg: "synthetic request" });
  recordEvent(f.dir, { ts: "2026-02-01T02:00:00Z", p: "P001", requestId, type: "answer", by: "user", ref, msg: "synthetic response" });
  const sharedCoverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({
    version: 1,
    comparison: { ...snapshot().comparison, conditionCode: "team" },
    period,
    request_coverage: sharedCoverage,
    log_coverage: sharedCoverage,
    quality_audit: { blocking_sum: 1, rereviews_after_fail: 1, coverage: sharedCoverage },
    counts: { owner_file_edits: 2 },
    coverage: { owner_file_edits: sharedCoverage },
  }));
  const stats = () => {
    const result = f.run("project", "stats", "P001", "--json");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).team.snapshot;
  };
  confirmRequestInput(f.dir, f.run);
  const healthy = stats();
  assert.equal(healthy.counts.owner_questions, 1);
  assert.equal(healthy.counts.blocking_sum_audited, 1);
  assert.equal(healthy.counts.blocking_sum_stats_events, 0);
  assert.equal(healthy.counts.owner_file_edits, 2);
  assert.equal(healthy.requestCoverage.support[0].ref, period.completionRef);
  const afterPath = join(f.dir, "compare-after.json");
  writeFileSync(afterPath, JSON.stringify(healthy));

  for (const unavailable of ["{", " ".repeat(16_385), null]) {
    if (unavailable === null) unlinkSync(proof);
    else writeFileSync(proof, unavailable);
    const observed = stats();
    assert.equal(observed.period.closed, false);
    assert.equal(observed.counts.owner_questions, null);
    assert.equal(observed.observed_counts.owner_questions, 1);
    assert.equal(observed.counts.blocking_sum_audited, null);
    assert.equal(observed.counts.blocking_sum_stats_events, null);
    assert.equal(observed.counts.owner_file_edits, null);
    assert.equal(observed.observed_counts.owner_file_edits, 2);
    const compared = f.run("project", "compare-team", "--before", before.before, "--after", afterPath, "--kind", "team-adoption", "--json");
    assert.equal(compared.status, 0, compared.stderr);
    const result = JSON.parse(compared.stdout);
    assert.equal(result.conclusion, "unknown");
    const reach = result.rows.find((row: { metric: string }) => row.metric === "owner_questions");
    assert.equal(reach.after, null);
    assert.equal(reach.afterObserved, 1);
    writeFileSync(proof, original);
  }
});

test("R66 같은 시각에 실제 원장 태스크로 검증된 거울은 기록 순서와 무관하게 귀속된다", () => {
  const f = fixture(), store = new HandoffStore(f.root, "P001", `projects/${f.dir.split("/").at(-1)}`);
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
  receipt(f.dir, period.completionRef, period);
  const requestId = "verified-mirror-scope";
  const proposal = store.record({ protocol: "pace-handoff", v: 1, id: "proposal", task: "T01", kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "SYNTHETIC request").record;
  const reply = store.record({ protocol: "pace-handoff", v: 1, id: "response", task: "T01", kind: "decision_reply", from: "owner", to: "coordinator", requestId, data: { re: proposal.id, decision: "approve", proposalHash: proposalDigest(proposal), sourceRef: "fixture:owner-reply" } }, "SYNTHETIC answer").record;
  const opening = "2026-01-01T01:00:00Z", answered = "2026-01-01T02:00:00Z";
  writeFileSync(store.path, [
    { ...proposal, at: opening },
    { ...reply, at: answered },
  ].map((row) => JSON.stringify(row)).join("\n") + "\n");
  const ref = "mirror.json";
  writeFileSync(join(f.dir, ref), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: `handoff:${proposal.id}`, requestId, hash: proposal.bodyHash }));
  const event = { ts: opening, p: "P001", type: "question", by: "agent", to: "owner", msg: "synthetic verified mirror", requestId, ref };
  const named = { ...event, t: "T01" };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({
    version: 1,
    period,
    request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] },
  }));
  for (const mirrors of [[event, named], [named, event]]) {
    writeFileSync(join(f.dir, "log.jsonl"), mirrors.map((row) => JSON.stringify(row)).join("\n") + "\n");
    confirmRequestInput(f.dir, f.run);
    const result = f.run("project", "stats", "P001", "--json");
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout).team;
    assert.equal(report.requests.linked, 1);
    assert.equal(report.requests.ownerReply, 1);
    assert.equal(report.requests.reachedTotal, 1);
  }
});

test("R67 finish는 검토 커밋이 있어도 선언된 영수증의 원문과 미확인 형식을 거부한다", () => {
  for (const state of ["raw-fields", "malformed", "oversized"]) {
    const { f, worktree, run, dir, reviewed } = mergeFixture();
    const ref = receipt(dir, "declared-shared.json");
    const full = join(dir, ref);
    const rel = `projects/${dir.split("/").at(-1)}/${ref}`;
    const valid = readFileSync(full, "utf8");
    const coverage = { status: "partial", reportedBy: "agent:maker", refs: [ref] };
    const measurement = join(dir, "TEAM-MEASUREMENT.json"), ignore = join(worktree, ".gitignore");
    writeFileSync(measurement, JSON.stringify({ version: 1, request_coverage: coverage, log_coverage: coverage }));
    writeFileSync(ignore, `/${rel}\n`);
    reviewed("synthetic-declared-receipt-path", measurement, ignore);
    const originalHead = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
    const originalIndex = f.git("-C", worktree, "diff", "--cached", "--binary").stdout;
    const bad = state === "raw-fields" ? JSON.stringify({ ...JSON.parse(valid), body: "Synthetic local-only answer." }) : state === "malformed" ? "{" : " ".repeat(16_385);
    writeFileSync(full, bad);
    const report = run("project", "finish", "P001");
    assert.notEqual(report.status, 0, report.stdout + report.stderr);
    assert.match(report.stdout + report.stderr, /영수증|메타데이터/);
    assert.equal(readFileSync(full, "utf8"), bad);
    assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, originalHead);
    assert.equal(f.git("-C", worktree, "diff", "--cached", "--binary").stdout, originalIndex);
    assert.equal(f.git("-C", worktree, "ls-files", "--", rel).stdout, "");
    writeFileSync(full, valid);
    assert.equal(f.git("-C", worktree, "add", "-f", "--", rel).status, 0);
    reviewed("synthetic-verified-receipt", join(dir, "log.jsonl"));
    const finished = run("project", "finish", "P001");
    assert.equal(finished.status, 0, finished.stdout + finished.stderr);
    assert.equal(f.git("-C", worktree, "show", `HEAD:${rel}`).stdout, valid);
  }
});

test("R67 첫 영수증이 미확인이면 이후 파일이 복구돼도 같은 조회의 총량을 보류한다", () => {
  const f = fixture(), comparison = compareFixture();
  const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "first-proof.json" };
  receipt(f.dir, period.completionRef, period);
  const file = join(f.dir, period.completionRef);
  const valid = readFileSync(file, "utf8");
  const requestId = "availability-changes", answer = receipt(f.dir, "answer.json", period, requestId);
  const coverage = { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: period.completionRef, refs: [period.completionRef] };
  writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({ version: 1, period, comparison: snapshot("fixture-repo", true).comparison, request_coverage: coverage, log_coverage: coverage }));
  recordEvent(f.dir, { ts: "2026-01-01T01:00:00Z", p: "P001", type: "question", by: "agent", to: "owner", requestId, msg: "synthetic question" });
  recordEvent(f.dir, { ts: "2026-01-01T02:00:00Z", p: "P001", type: "answer", by: "user", requestId, ref: answer, msg: "synthetic answer" });
  confirmRequestInput(f.dir, f.run);
  const stable = f.run("project", "stats", "P001", "--json");
  assert.equal(stable.status, 0, stable.stderr);
  assert.equal(JSON.parse(stable.stdout).team.requests.reachedTotal, 1);
  const saved = join(f.dir, "after.json");
  writeFileSync(saved, stable.stdout);
  const preload = join(tempDir("pace-receipt-first-read-"), "fixture.mjs");
  writeFileSync(preload, `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
const malformed = process.env.PACE_RECEIPT_FIXTURE === "malformed";
const lstat = fs.lstatSync;
const open = fs.openSync, close = fs.closeSync;
let changed = false;
let watched;
const target = ${JSON.stringify(file)};
const restore = () => fs.writeFileSync(target, ${JSON.stringify(valid)});
fs.lstatSync = function (path, ...args) {
  if (malformed || changed || String(path) !== target) return lstat(path, ...args);
  changed = true;
  try { return lstat(path, ...args); }
  finally { restore(); }
};
fs.openSync = function (path, ...args) {
  const fd = open(path, ...args);
  if (malformed && !changed && String(path) === target) watched = fd;
  return fd;
};
fs.closeSync = function (fd) {
  close(fd);
  if (malformed && !changed && fd === watched) {
    changed = true;
    restore();
  }
};
syncBuiltinESMExports();
`);
  for (const unavailable of ["oversized", "absent", "malformed"]) {
    const reset = () => unavailable === "absent" ? unlinkSync(file) : writeFileSync(file, unavailable === "malformed" ? "{" : " ".repeat(16_385));
    const options = { cwd: f.root, home: f.home, env: { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`, PACE_RECEIPT_FIXTURE: unavailable } };
    reset();
    const actual = runPace(["project", "stats", "P001", "--json"], options);
    assert.equal(actual.status, 0, actual.stderr);
    const team = JSON.parse(actual.stdout).team;
    assert.equal(team.requests.ownerReply, 1);
    assert.equal(team.requests.reachedTotal, null, unavailable);
    assert.equal(readFileSync(file, "utf8"), valid);
    reset();
    const compared = runPace(["project", "compare-team", "--before", comparison.before, "--after", saved, "--kind", "team-adoption", "--json"], options);
    assert.equal(compared.status, 0, compared.stderr);
    const row = JSON.parse(compared.stdout).rows.find((metric: { metric: string }) => metric.metric === "owner_questions");
    assert.equal(row.after, null, unavailable);
    assert.equal(row.afterObserved, 1, unavailable);
    assert.equal(readFileSync(file, "utf8"), valid);
  }
});

test("R68 참조로만 연결된 사용자 전송도 원질문이 없으면 미확인 요청으로 남는다", () => {
  for (const explicit of [false, true]) {
    const f = fixture(), rel = `projects/${f.dir.split("/").at(-1)}`;
    const store = new HandoffStore(f.root, "P001", rel);
    const period = { start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z", unit: "representative-task", closed: true, completionRef: "frame.json" };
    const ref = receipt(f.dir, period.completionRef, period);
    const requestId = "without-a-question";
    store.record({ protocol: "pace-handoff", v: 1, id: "source", kind: "owner_input", from: "coordinator", to: "project:P001", requestId, data: { sourceRef: "fixture:source" } }, "Synthetic input");
    store.record({ protocol: "pace-handoff", v: 1, id: "status", kind: "status", from: "coordinator", to: "owner", ...(explicit ? { requestId } : {}), data: { re: "source" } }, "Synthetic status");
    const route = { transport: "external" as const, actor: "owner", target: "fixture:owner", from: "coordinator", sourceRef: "fixture:transport" };
    prepareDelivery(store, "status", "attempt", route);
    deliveryReceipt(store, "attempt", { phase: "sent", reportedBy: "coordinator", sourceRef: route.sourceRef, responseId: "receipt", responseHash: digest("synthetic confirmation") });
    writeFileSync(store.path, store.read().map((row, i) => JSON.stringify({ ...row, at: new Date(Date.parse(period.start) + (i + 1) * 1000).toISOString() })).join("\n") + "\n");
    writeFileSync(join(f.dir, "TEAM-MEASUREMENT.json"), JSON.stringify({
      version: 1,
      period,
      request_coverage: { status: "complete", reportedBy: "agent:maker", verifiedBy: "coordinator", confirmationRef: ref, refs: [ref] },
    }));
    confirmRequestInput(f.dir, f.run);
    const stats = f.run("project", "stats", "P001", "--json");
    assert.equal(stats.status, 0, stats.stderr);
    const data = JSON.parse(stats.stdout);
    assert.equal(data.handoffs.requests.total, 1);
    assert.equal(data.handoffs.requests.unconfirmed, 1);
    assert.equal(data.team.requests.reached, 0);
    assert.equal(data.team.requests.reachedTotal, null);
    assert.equal(data.team.snapshot.unknown.request_events, 1);
    assert.equal(data.team.snapshot.deliveryClaims[0].counted, false);
  }
});

test("R68 다른 프로젝트의 팀 시작 행은 현재 비팀 프로젝트의 Git 병합 채택에 영향이 없다", () => {
  const { f, worktree, run, dir } = mergeFixture("true", "true", false);
  const role = { name: "maker", source: "option" as const, definition: ".pace/team/maker.md", hash: digest("role"), method: "prompt" as const, model: "synthetic", settingsStatus: "planned" as const, toolsPermissionApplied: false as const, runtimeObserved: false as const };
  assert.equal(recordEvent(dir, { ts: new Date().toISOString(), p: "P002", type: "start", by: "cli", msg: "start", ok: true, role, data: { teamMetricsVersion: 1 } }), true);
  const stats = run("project", "stats", "P001", "--json");
  assert.equal(stats.status, 0, stats.stderr);
  assert.equal(JSON.parse(stats.stdout).team, undefined);
  const finished = run("project", "finish", "P001");
  assert.equal(finished.status, 0, finished.stdout + finished.stderr);
  assert.ok(!readdirSync(dir).includes("TEAM-FINISH.json"));
  const preview = f.run("project", "merge", "P001");
  assert.equal(preview.status, 0, preview.stdout + preview.stderr);
  assert.equal(f.git("-C", worktree, "show", `HEAD:projects/${dir.split("/").at(-1)}/log.jsonl`).stdout.includes('"p":"P002"'), true);
});

test("R69 팀 마감은 직접 선언된 답과 원장 거울 파일의 원문도 거부한다", () => {
  for (const mode of ["answer", "mirror"]) {
    const { f, worktree, run, dir, reviewed } = mergeFixture();
    const path = `projects/${dir.split("/").at(-1)}`;
    const requestId = "logging-evidence", ref = `${mode}.json`;
    const proofPath = join(dir, ref), rel = `${path}/${ref}`;
    const question = { ts: new Date().toISOString(), p: "P001", requestId, type: "question" as const, by: "agent" as const, to: "owner" as const, msg: "Synthetic question" };
    let valid: Record<string, unknown>;
    if (mode === "answer") {
      recordEvent(dir, question);
      recordEvent(dir, { ts: new Date(Date.parse(question.ts) + 1).toISOString(), p: "P001", requestId, type: "answer", by: "user", msg: "Synthetic reported answer", ref });
      valid = { version: 1, kind: "team-evidence", sourceRef: "fixture:reply", hash: digest("synthetic local answer"), requestId, purposes: ["owner-answer"] };
    } else {
      const store = new HandoffStore(worktree, "P001", path);
      const proposal = store.record({ protocol: "pace-handoff", v: 1, id: "mirror-root", kind: "decision_request", from: "coordinator", to: "owner", requestId, data: { interpretation: false } }, "Synthetic native question").record;
      recordEvent(dir, { ...question, ts: new Date(Date.parse(proposal.at) + 1).toISOString(), ref });
      valid = { version: 1, kind: "team-evidence", sourceRef: `handoff:${proposal.id}`, hash: proposal.bodyHash, requestId };
    }
    const raw = JSON.stringify({ ...valid, body: "Synthetic private sentence." });
    writeFileSync(proofPath, raw);
    const ignore = join(worktree, ".gitignore"), log = join(dir, "log.jsonl");
    writeFileSync(ignore, `/${rel}\n`);
    reviewed("synthetic-declared-log-receipt", ignore, log, ...(mode === "mirror" ? [join(dir, "handoffs.jsonl")] : []));
    const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
    const index = f.git("-C", worktree, "diff", "--cached", "--binary").stdout;
    const stats = run("project", "stats", "P001", "--json");
    assert.equal(stats.status, 0, stats.stderr);
    assert.equal(JSON.parse(stats.stdout).team.requests.ownerReply, 0);
    const stopped = run("project", "finish", "P001");
    assert.notEqual(stopped.status, 0, stopped.stdout + stopped.stderr);
    assert.match(stopped.stdout + stopped.stderr, /영수증|메타데이터/);
    assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, head);
    assert.equal(f.git("-C", worktree, "diff", "--cached", "--binary").stdout, index);
    assert.equal(f.git("-C", worktree, "ls-files", "--", rel).stdout, "");
    assert.equal(readFileSync(proofPath, "utf8"), raw);
    writeFileSync(proofPath, JSON.stringify(valid));
    assert.equal(f.git("-C", worktree, "add", "-f", "--", rel).status, 0);
    reviewed("synthetic-verified-log-receipt", log);
    const finished = run("project", "finish", "P001");
    assert.equal(finished.status, 0, finished.stdout + finished.stderr);
    assert.equal(f.git("-C", worktree, "show", `HEAD:${rel}`).stdout, JSON.stringify(valid));
  }
});

test("R70 팀 마감은 없는 과거 답 참조를 보존하고 실제 비영수증 파일은 보류한다", () => {
  for (const present of [false, true]) {
    const { f, worktree, run, dir, reviewed } = mergeFixture();
    const now = Date.now(), requestId = "archived-answer";
    const event = { p: "P001", requestId, msg: "Synthetic history" } as const;
    recordEvent(dir, { ...event, ts: new Date(now).toISOString(), type: "question", by: "agent", to: "owner" });
    recordEvent(dir, { ...event, ts: new Date(now + 1).toISOString(), type: "answer", by: "user", ref: "old-answer.md" });
    writeFileSync(join(dir, "answer.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: "fixture:reply", hash: digest("synthetic answer"), requestId, purposes: ["owner-answer"] }));
    recordEvent(dir, { ...event, ts: new Date(now + 2).toISOString(), type: "answer", by: "user", ref: "answer.json" });
    if (present) writeFileSync(join(dir, "old-answer.md"), "Synthetic private sentence.");
    const ignore = join(worktree, ".gitignore");
    writeFileSync(ignore, "old-answer.md\n");
    reviewed("synthetic-legacy-receipt-history", ignore, join(dir, "log.jsonl"), join(dir, "answer.json"));
    const parent = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
    const result = run("project", "finish", "P001");
    const rel = `projects/${dir.split("/").at(-1)}/old-answer.md`;
    assert.equal(f.git("-C", worktree, "ls-files", "--", rel).stdout, "");
    if (present) {
      assert.notEqual(result.status, 0);
      assert.match(result.stdout + result.stderr, /영수증|메타데이터/);
      assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, parent);
      assert.equal(readFileSync(join(dir, "old-answer.md"), "utf8"), "Synthetic private sentence.");
    } else {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const stats = run("project", "stats", "P001", "--json");
      assert.equal(stats.status, 0, stats.stderr);
      assert.equal(JSON.parse(stats.stdout).team.requests.ownerReply, 1);
      assert.match(readFileSync(join(dir, "log.jsonl"), "utf8"), /old-answer\.md/);
    }
  }
});

test("R71 조회와 마감에서 과거 로그의 안전한 상대 경로 표기를 같은 파일로 대조한다", () => {
  for (const state of process.platform === "win32" ? ["absent", "portable"] : ["absent", "portable", "literal"]) {
    const { f, worktree, run, dir, reviewed } = mergeFixture();
    const requestId = "historical-path", start = Date.now();
    const base = { p: "P001", requestId, msg: "Synthetic history" } as const;
    const refs = ["./old-answer.md", "archive//old-answer.md", "archive\\old-answer.md", "./archive//answer.json"];
    recordEvent(dir, { ...base, ts: new Date(start).toISOString(), type: "question", by: "agent", to: "owner" });
    mkdirSync(join(dir, "archive"));
    writeFileSync(join(dir, "archive", "answer.json"), JSON.stringify({ version: 1, kind: "team-evidence", sourceRef: "fixture:reply", hash: digest("synthetic answer"), requestId, purposes: ["owner-answer"] }));
    for (const [i, ref] of refs.entries()) {
      assert.equal(recordEvent(dir, { ...base, ts: new Date(start + i + 1).toISOString(), type: "answer", by: "user", ref }), true);
    }
    const rawPath = state === "literal" ? "archive\\old-answer.md" : "archive/old-answer.md";
    if (state !== "absent") writeFileSync(join(dir, rawPath), "Synthetic private sentence.");
    const ignore = join(worktree, ".gitignore");
    writeFileSync(ignore, "*old-answer.md\n");
    reviewed("synthetic-checked-historical-paths", ignore, join(dir, "log.jsonl"), join(dir, "archive", "answer.json"));
    const head = f.git("-C", worktree, "rev-parse", "HEAD").stdout;
    const reply = run("project", "finish", "P001");
    const staged = f.git("-C", worktree, "--literal-pathspecs", "ls-files", "--", `projects/${dir.split("/").at(-1)}/${rawPath}`);
    assert.equal(staged.stdout, "");
    if (state !== "absent") {
      assert.notEqual(reply.status, 0, reply.stdout + reply.stderr);
      assert.equal(f.git("-C", worktree, "rev-parse", "HEAD").stdout, head);
      assert.equal(readFileSync(join(dir, rawPath), "utf8"), "Synthetic private sentence.");
    } else {
      assert.equal(reply.status, 0, reply.stdout + reply.stderr);
      const stats = run("project", "stats", "P001", "--json");
      assert.equal(stats.status, 0, stats.stderr);
      assert.equal(JSON.parse(stats.stdout).team.requests.ownerReply, 1);
      const logRefs = readFileSync(join(dir, "log.jsonl"), "utf8").trimEnd().split("\n").map((line) => JSON.parse(line).ref);
      for (const ref of refs) assert.ok(logRefs.includes(ref), ref);
    }
  }
});
