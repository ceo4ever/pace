import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { recurringReviewSignals, reviewFailureSignal } from "../src/agent/review-signals.ts";
import type { LedgerEntry, ReviewEntry } from "../src/agent/review-log.ts";
import { assessStructuredReview } from "../src/agent/structured-review.ts";

const files = {
  original: "diff --git a/src/tracker.ts b/src/tracker.ts\n--- a/src/tracker.ts\n+++ b/src/tracker.ts\n@@ -10 +10 @@\n-old\n+first\n",
  changed: "diff --git a/src/tracker.ts b/src/tracker.ts\n--- a/src/tracker.ts\n+++ b/src/tracker.ts\n@@ -10 +10 @@\n-old\n+second\n",
  unrelated: "diff --git a/src/other.ts b/src/other.ts\n--- a/src/other.ts\n+++ b/src/other.ts\n@@ -1 +1 @@\n-old\n+other\n",
};
const raw = {
  id: "F1", severity: "blocking", category: "criteria", location: "src/tracker.ts:11",
  scenario: "A known invalid record is accepted.", reproduction: "Run test/tracker.test.ts with the fixture.", confidence: "high",
  impact: "criterion", criterion: "T-1", safety_path: null,
};
function assessment(finding: Record<string, unknown>) {
  return assessStructuredReview("post", 'pass\n```pace-review\n' + JSON.stringify({
    version: 2, findings: [finding], criteria: [{ id: "T-1", state: "present", observation: "fixture exercised" }],
  }) + '\n```', ["T-1", "T-2"]);
}
const root = join(process.cwd(), "fixture");
const unit = { kind: "task", ref: "T01_sample/post" } as const;
const target = join(root, "projects/P001/tasks/T01_sample/evidence/result.patch");
function matched(changes: Record<string, unknown>, after = files.changed, options: Record<string, unknown> = {}, previousTarget = target) {
  const prior = assessment({ ...raw, ...options });
  const next = assessment({ ...raw, id: "F9", location: "src/tracker.ts:16", ...options, ...changes });
  return recurringReviewSignals(
    unit, root,
    { target: previousTarget, snapshot: files.original, assessment: prior, record: "review-records/R1.json" },
    { target, snapshot: after, assessment: next, record: "review-records/R2.json" },
  );
}

test("review signals distinguish an area's recurrence from repeatedly touched code", () => {
  assert.deepEqual(matched({}).map((item) => item.kind), ["recurring_area", "superficial_fix"]);
  assert.deepEqual(matched({ severity: "should_fix" }).map((item) => item.kind), ["recurring_area"]);
  assert.deepEqual(matched({}, files.original + files.unrelated).map((item) => item.kind), ["recurring_area"]);
  assert.deepEqual(matched({}, files.original.replace("@@ -10 +10 @@", "@@ -11 +11 @@")).map((item) => item.kind), ["recurring_area"]);
  assert.deepEqual(matched({}, files.original), []);
  assert.deepEqual(matched({ location: "src/tracker.ts:90" }), []);
  assert.deepEqual(matched({ location: "src/tracker.ts:14:3-17:2" }).map((item) => item.kind), ["recurring_area", "superficial_fix"]);
  assert.deepEqual(matched({ criterion: "T-2" }), []);
  assert.deepEqual(matched({ location: "src/other.ts:12" }), []);
  assert.deepEqual(matched({ location: "../src/tracker.ts:12" }), []);
  const secretPath = ["sk", "A".repeat(40)].join("-");
  assert.deepEqual(matched({ location: `src/${secretPath}/tracker.ts:11` }, files.changed, { location: `src/${secretPath}/tracker.ts:11` }), []);
  assert.deepEqual(matched({ category: "defect" }), []);
  assert.deepEqual(matched({ severity: "note" }), []);
  assert.equal(matched({})[1]?.unit.ref, unit.ref);
  assert.deepEqual(matched({})[1]?.evidence, ["review-records/R1.json", "review-records/R2.json"]);
});

test("review signals never infer a partial fix by comparing different artifacts", () => {
  const other = join(root, "projects/P001/tasks/T01_sample/evidence/other.patch");
  assert.deepEqual(matched({}, files.changed, {}, other).map((signal) => signal.kind), ["recurring_area"]);
});

test("review signals ignore voided, interrupted and unverified rows", () => {
  const row = (number: number, extra: Partial<ReviewEntry> = {}): ReviewEntry => ({
    type: "review", at: "2026-11-26T00:00:00Z", kind: "goal", target: "plan.md", hash: "x",
    verdict: "fail", verifier: "codex", provider: "openai", rereview_of: null, record: `review-records/R${number}.json`,
    result_hash: "0".repeat(64), ...extra,
  });
  const ignored = row(2), last = row(5);
  const entries: LedgerEntry[] = [
    row(1), ignored, row(3, { interrupted: true }), row(4, { verdict: "unknown" }),
    { type: "void", at: ignored.at, target: ignored.target, record: ignored.record, summary: "unreadable", file: "proof.md" },
  ];
  assert.equal(reviewFailureSignal(entries, ignored), undefined);
  assert.deepEqual(reviewFailureSignal([...entries, last], last)?.evidence, [row(1).record, last.record]);
});

test("review signals can match a goal impact without a criterion ID", () => {
  const result = matched({}, files.changed, { category: "defect", criterion: null, impact: "goal" });
  assert.deepEqual(result.map((item) => item.kind), ["recurring_area", "superficial_fix"]);
  assert.deepEqual(matched({ impact: "minor" }, files.changed, { category: "defect", criterion: null, impact: "goal" }), []);
});
