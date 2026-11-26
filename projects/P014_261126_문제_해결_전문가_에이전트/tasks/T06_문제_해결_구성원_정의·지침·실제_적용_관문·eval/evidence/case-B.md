# 사례 B — 검토 회차가 바뀐 뒤 첫 판정

합의한 계약은 새 검토 단계 또는 변경된 계약 뒤 첫 호출에는 전체 산출물을 검토하고, 같은 회차의 실제 증거 이어가기에서는 이미 처리한 지적과 변경만 전달하는 것이다. 일반 형식으로 해석할 수 없는 반환과 evidence가 모자란 반환은 서로 다른 사례다. 두 번의 독립 검토가 검토 범위가 의도치 않게 좁아지는 문제를 지적했다.

R2에서 보고된 재현의 사건 순서는 제출 증거 미확인 R1, 이후 두 번의 실패, 협의된 계약 변경, 그리고 한 번의 `verify`다. 기대는 전체 검토지만 마지막 호출에 `rereview_of`가 생겨 직전 검토 범위의 프롬프트가 쓰였다. 당시 고정본에서 다음 부분을 발췌했다. 사후 검토·해결 자료는 해당 사본에 없다.

## 당시 변경 — src/agent/review-budget.ts

```diff
diff --git a/src/agent/review-budget.ts b/src/agent/review-budget.ts
index 60c0b95..1b45517 100644
--- a/src/agent/review-budget.ts
+++ b/src/agent/review-budget.ts
@@ -3,6 +3,7 @@ import { lstatSync, readFileSync } from "node:fs";
 import { basename, dirname, join, relative, sep } from "node:path";
 import { proofScopeIssues, reviewHash } from "../project/pre-review.ts";
 import { appendLedger, LedgerError, readLedger, textHash, type ReviewCallEntry, type ReviewEntry } from "./review-log.ts";
+import { matchingCriteria } from "./review-criteria.ts";

 const ROUND_LIMIT = 2;
 // 독립 판정 2회와 중단·무효 등 판정이 없는 시도 2회를 허용한다.
@@ -107,12 +108,20 @@ export function readReviewBudget(scope: ReviewBudgetScope, offsets: Readonly<Rec
     const voided = new Map(entries.flatMap((entry) => entry.type === "void" ? [[entry.record, entry.target]] : []));
     const followupCalls = new Set(entries.flatMap((entry) =>
       entry.type === "review" && entry.followup && entry.call_id ? [entry.call_id] : []));
+    const formats = new Map(entries.flatMap((entry) => entry.type === "format" ? [[entry.record, entry]] : []));
     const key = relative(scope.root, ledgerTarget).split(sep).join("/");
     const offset = Object.hasOwn(offsets, key) ? offsets[key] ?? 0 : 0;
     if (offset > entries.length) throw new LedgerError("계약 변경의 원장 기준점을 확인할 수 없다");
     for (const entry of entries.slice(offset)) {
       if ((entry.type !== "call" && entry.type !== "review") ||
           recordedStage(scope, ledgerTarget, entry) !== scope.stage) continue;
+      if (entry.type === "review" && !entry.interrupted) {
+        const format = formats.get(entry.record);
+        if ((format || entry.required_criteria !== undefined) && (!format || format.target !== entry.target ||
+            format.hash !== entry.hash || !matchingCriteria(format.required_criteria, entry.required_criteria))) {
+          throw new LedgerError(`필수 기준 기록과 검토 원장이 맞지 않는다: ${entry.record}`);
+        }
+      }
       const separate = entry.type === "review" ? !!entry.followup : followupCalls.has(entry.call_id);
       if (entry.type === "review" && entry.interrupted !== true && entry.verdict !== "unknown" &&
           voided.get(entry.record) !== entry.target && !legacyStructureOnly(ledgerTarget, entry)) {
```

## 당시 변경 — src/agent/review-followup.ts

```diff
diff --git a/src/agent/review-followup.ts b/src/agent/review-followup.ts
index e3407f3..c3ecd92 100644
--- a/src/agent/review-followup.ts
+++ b/src/agent/review-followup.ts
@@ -7,7 +7,7 @@ import { AgentError } from "./contract.ts";
 import { decideReviewAdmission } from "./review-admission.ts";
 import { readReviewBudget, recordedStage, type BudgetStage, type ReviewBudgetScope } from "./review-budget.ts";
 import { LedgerError, ledgerPath, textHash, type DiagnosisEntry, type ReviewEntry } from "./review-log.ts";
-import { assessStructuredReview, effectiveBlocking } from "./structured-review.ts";
+import { assessStructuredReview, effectiveBlocking, evidenceGaps } from "./structured-review.ts";
 import { endpointChoices, readRecovery, sameFinding, type EndpointChoice, type FindingKey, type FocusedCheck, type RecoveryEvent, type RootCheck } from "./review-recovery.ts";

 export const FOLLOWUPS_FILE = "REVIEW-FOLLOWUPS.jsonl";
@@ -210,6 +210,10 @@ export function openFollowup(scope: ReviewBudgetScope, target: string, hash: str
       if (latest?.blocking?.some((finding) => !data.assessments.some((assessment) => assessment.finding === finding))) {
         reject("최신 지적 중 빠진 A 판정이 있다");
       }
+      const gaps = latestEvidenceGaps(scope, state);
+      if (gaps.some((finding) => !data.assessments.some((assessment) => assessment.finding === finding))) {
+        reject("최신 기준별 증거 공백 중 빠진 A 판정이 있다");
+      }
       entry = { ...facts, type: "waiver_request", choice, proposed: selection.proposed, choices: data.choices, assessments: data.assessments };
       break;
     }
@@ -239,6 +243,15 @@ function recordText(ledger: string, row: ReviewEntry): string | null {
   }
 }

+function latestEvidenceGaps(scope: ReviewBudgetScope, state: ReviewState): string[] {
+  const entries = state.budget.ledgers.find(({ target }) => target === scope.ledgerTarget)?.entries;
+  const latest = entries?.findLast((row): row is ReviewEntry => row.type === "review" && row.target === scope.name &&
+    !row.interrupted && !entries.some((entry) => entry.type === "void" && entry.target === row.target && entry.record === row.record));
+  if (!latest?.structured_stage || latest.required_criteria === undefined) return [];
+  const text = recordText(scope.ledgerTarget, latest);
+  return text === null ? [] : evidenceGaps(assessStructuredReview(latest.structured_stage, text, latest.required_criteria));
+}
+
 function proofObject(text: string): Record<string, unknown> {
   try {
     const parsed = JSON.parse(text);
@@ -313,7 +326,7 @@ function confirmationSource(scope: ReviewBudgetScope, state: ReviewState) {
   const source = relativeName(scope, join(dirname(base.ledgerTarget), base.entry.record));
   const resolved = state.recovery.completed.filter((attempt) => attempt.grant.source === source && attempt.result.verdict === "pass");
   const text = recordText(base.ledgerTarget, base.entry);
-  const known = text === null ? [] : assessStructuredReview(scope.stage, text).findings?.flatMap((finding) =>
+  const known = text === null ? [] : assessStructuredReview(scope.stage, text, base.entry.required_criteria).findings?.flatMap((finding) =>
     finding.effective === "blocking" && finding.location ? [{ id: finding.id, location: finding.location }] : []) ?? [];
   if (!known.length) return undefined;
   const findings = known.filter((finding) => !resolved.some(({ grant }) => grant.diagnosed || sameFinding(grant.finding, finding)));
@@ -500,7 +513,7 @@ function rawBlocking(ledger: string, row: ReviewEntry): string[] | null {
   if (row.verdict !== "fail" || row.interrupted) return null;
   const text = recordText(ledger, row);
   if (text === null) return null;
-  if (row.structured_stage) return effectiveBlocking(assessStructuredReview(row.structured_stage, text));
+  if (row.structured_stage) return effectiveBlocking(assessStructuredReview(row.structured_stage, text, row.required_criteria));
   const findings = text.split("\n").filter((line) => /\[blocking\]/i.test(line)).map((line) => line.trim());
   return findings.length ? findings : null;
 }
@@ -534,7 +547,7 @@ function endpointReport(scope: ReviewBudgetScope, state: ReviewState,
   const ledger = state.budget.ledgers.find(({ entries }) => entries.includes(upper.failed))?.target;
   const text = ledger ? recordText(ledger, upper.failed) : null;
   const assessment = text !== null && upper.failed.structured_stage
-    ? assessStructuredReview(upper.failed.structured_stage, text) : undefined;
+    ? assessStructuredReview(upper.failed.structured_stage, text, upper.failed.required_criteria) : undefined;
   const recommendation = last?.grant.recommendation ?? {
     choice: "보류" as const,
     reason: "두 차례의 상위 해결안 확인 뒤에도 유효 판정이 실패했다. 실패를 재현하고 현재 기준을 유지할 수 있는지 결정할 때까지 단위를 보류한다.",
@@ -568,8 +581,8 @@ function endpointReport(scope: ReviewBudgetScope, state: ReviewState,
     remaining_failure: {
       verdict: upper.failed.verdict,
       record: ledger ? relativeName(scope, join(dirname(ledger), upper.failed.record)) : null,
-      findings: assessment?.findings?.flatMap(({ id, location, scenario, reproduction, confidence, effective }) =>
-        effective === "blocking" ? [{ id, location, scenario, reproduction, confidence }] : []) ?? null,
+      findings: assessment?.findings?.flatMap(({ id, location, scenario, reproduction, confidence, effective, safety_path }) =>
+        effective === "blocking" ? [{ id, location, scenario, reproduction, confidence, ...(safety_path ? { safety_path } : {}) }] : []) ?? null,
     },
     choices: endpointChoices,
     recommendation: { ...recommendation, source: last?.grant.recommendation ? "hub" : "default" },
@@ -589,6 +602,7 @@ export function followupReport(scope: ReviewBudgetScope, state: ReviewState) {
   const rounds = state.budget.status.rounds;
   const upper = state.recovery.upper;
   const endpoint = upper?.action === "agreement_required" ? endpointReport(scope, state, upper) : undefined;
+  const gaps = latestEvidenceGaps(scope, state);
   const source = canConfirm(state) && confirmationSource(scope, state);
   const diagnosisRequired = source && source.findings.length && !source.diagnosis && (state.recovery.ordinary.length >= 2 ||
     source.findings.every((finding) => state.recovery.ordinary.some(({ grant }) => sameFinding(finding, grant.finding))));
@@ -601,6 +615,7 @@ export function followupReport(scope: ReviewBudgetScope, state: ReviewState) {
     recommendation: request?.choice ?? endpoint?.recommendation.choice ?? null,
     choices: request?.choices ?? endpoint?.choices ?? [],
     ...(endpoint ? { endpoint } : {}),
+    ...(gaps.length ? { evidence_action: { action: "collect_evidence", gaps, if_proceed_without_evidence: "A-3" } } : {}),
     ...(request ? { request } : {}),
     joint_attempts: state.jointAttempts,
     joint_decisions: state.jointDecisions,
```

## 당시 변경 — src/agent/verify-cli.ts

```diff
diff --git a/src/agent/verify-cli.ts b/src/agent/verify-cli.ts
index b97f3f7..8494829 100644
--- a/src/agent/verify-cli.ts
+++ b/src/agent/verify-cli.ts
@@ -11,7 +11,8 @@ import {
 import { recordedStage, reserveReviewCall, reviewBudgetScope, type ReviewBudgetScope } from "./review-budget.ts";
 import { checkGrant, checkRecoveryProof, confirmationDiagnosis, diagnosisLink, followupReport, FOLLOWUPS_FILE, openFollowup, openRecovery, readReviewState, recordFollowupExecution, recoveryGrant } from "./review-followup.ts";
 import { crossVerify, type Rereview, type VerifyKind } from "./verify.ts";
-import { assessStructuredReview, effectiveBlocking, hasStructuredReviewFence, isStructuredStage } from "./structured-review.ts";
+import { assessStructuredReview, effectiveBlocking, evidenceGaps, hasStructuredReviewFence, isStructuredStage } from "./structured-review.ts";
+import { matchingCriteria, reviewCriteria } from "./review-criteria.ts";

 // `pace agent verify`·`pace agent review-note` 명령 처리 (P007 T01). src/cli.ts는 여기로 위임만 한다 — 시험이 실행기를 주입해 같은 경로를 탄다.

@@ -83,13 +84,30 @@ function exhaustedFollowup(scope: ReviewBudgetScope, state: ReturnType<typeof re
   return { ...followup, report };
 }

+function evidenceRereviewBase(ledgerTarget: string, name: string, entries: readonly LedgerEntry[]): ReviewEntry | undefined {
+  const row = entries.findLast((entry): entry is ReviewEntry => entry.type === "review" && entry.target === name &&
+    entry.verdict === "unknown" && !!entry.required_criteria?.length && entry.structured_stage !== undefined);
+  if (!row?.structured_stage) return undefined;
+  try {
+    const record = JSON.parse(readFileSync(join(dirname(ledgerTarget), row.record), "utf8"));
+    const text = record.result?.text;
+    if (typeof text !== "string" || textHash(text) !== row.result_hash) return undefined;
+    const assessment = assessStructuredReview(row.structured_stage, text, row.required_criteria);
+    if (assessment.findings === null || assessment.evidence?.issues.some((issue) =>
+      issue === "safety_unverified" || issue === "unknown_criterion")) return undefined;
+    return row;
+  } catch {
+    return undefined;
+  }
+}
+
 /** 기준점 검토의 기록이 원장과 맞는지 확인하고 재검토 입력을 만든다 */
 function loadRereview(ledgerTarget: string, base: ReviewEntry, target: string, currentHash: string, current: string, kind: VerifyKind, scope?: ReviewBudgetScope): Rereview | undefined {
   const sameTarget = join(dirname(ledgerTarget), base.target) === target;
   if (sameTarget && currentHash === base.hash && base.verdict === "fail") throw new AgentError("invalid_request", `직전 fail 검토(${base.record}) 뒤 대상이 바뀌지 않았다 — 지적을 반영한 뒤 다시 검토한다`);
   const file = join(dirname(ledgerTarget), base.record);
   if (!existsSync(file)) throw new AgentError("invalid_request", `재검토 기준점의 기록 파일이 없다: ${file}`);
-  let record: { result?: { text?: unknown }; review?: { hash?: unknown; snapshot?: unknown; structured_stage?: unknown } };
+  let record: { result?: { text?: unknown }; review?: { hash?: unknown; snapshot?: unknown; structured_stage?: unknown; required_criteria?: unknown } };
   try { record = JSON.parse(readFileSync(file, "utf8")); } catch { throw new AgentError("invalid_request", `재검토 기준점의 기록 파일을 읽을 수 없다: ${file}`); }
   const snapshot = record.review?.snapshot;
   const text = record.result?.text;
@@ -99,16 +117,27 @@ function loadRereview(ledgerTarget: string, base: ReviewEntry, target: string, c
   // 구조 누락 단건 판정은 나머지 평가를 억제했다. 구조를 채운 다음에는 목적·안전까지 처음 평가한다.
   if (!scope && kind === "task" && proofScopeIssues(snapshot).length) return undefined;
   let previousText = text;
-  if (base.structured_stage || record.review?.structured_stage !== undefined ||
+  const stamp = readLedger(ledgerTarget).findLast((row) => row.type === "format" && row.record === base.record);
+  if (stamp || base.required_criteria !== undefined || record.review?.required_criteria !== undefined) {
+    if (stamp?.type !== "format" || stamp.target !== base.target || stamp.hash !== base.hash ||
+        !matchingCriteria(stamp.required_criteria, base.required_criteria) ||
+        !matchingCriteria(stamp.required_criteria, record.review?.required_criteria)) {
+      throw new AgentError("invalid_request", "재검토 기준점의 필수 기준 기록이 원장과 맞지 않는다");
+    }
+  }
+  if (stamp || base.structured_stage || record.review?.structured_stage !== undefined ||
       (scope && (Object.hasOwn(record, "assessment") || hasStructuredReviewFence(text)))) {
     if (!base.structured_stage || base.structured_stage !== record.review?.structured_stage ||
         (scope && base.structured_stage !== recordedStage(scope, ledgerTarget, base))) {
       throw new AgentError("invalid_request", "구조화된 검토 기준점의 단계가 원장과 맞지 않는다");
     }
-    const assessment = assessStructuredReview(base.structured_stage, text);
+    const assessment = assessStructuredReview(base.structured_stage, text, base.required_criteria);
     if (assessment.verdict !== base.verdict) throw new AgentError("invalid_request", "구조화된 검토 기준점의 판정이 원장과 맞지 않는다");
     const blocking = effectiveBlocking(assessment);
     previousText += `\n\n도구 판정에 반영된 기존 blocking\n${blocking.length ? blocking.join("\n") : "없음"}`;
+    if (assessment.evidence) {
+      previousText += `\n\n직전 기준별 증거 상태\n${JSON.stringify(assessment.evidence)}`;
+    }
   }
   return { previousText, diff: lineDiff(snapshot, current), previousPassed: base.verdict === "pass" };
 }
@@ -117,9 +146,10 @@ function loadRereview(ledgerTarget: string, base: ReviewEntry, target: string, c
  * 판정이 있으면 복구하고, pending은 호출만 셀 수 있도록 중단으로 표시한다. */
 function recoverOrphans(target: string, name: string, kindFor: (owner: string) => string, now: () => Date, scope?: ReviewBudgetScope): string[] {
   const notes: string[] = [];
-  for (const rel of orphanRecords(target, readLedger(target))) {
+  const ledger = readLedger(target);
+  for (const rel of orphanRecords(target, ledger)) {
     const file = join(dirname(target), rel);
-    let rec: { pending?: unknown; verifier?: unknown; cross?: unknown; cross_unavailable?: unknown; result?: { text?: unknown; provider?: { value?: unknown }; duration_ms?: unknown; usage?: unknown }; review?: { target?: unknown; hash?: unknown; verdict?: unknown; kind?: unknown; call_id?: unknown; rereview_of?: unknown; snapshot?: unknown; followup?: unknown; confirmation_issue?: unknown; structured_stage?: unknown; after_diagnosis?: unknown } };
+    let rec: { pending?: unknown; verifier?: unknown; cross?: unknown; cross_unavailable?: unknown; result?: { text?: unknown; provider?: { value?: unknown }; duration_ms?: unknown; usage?: unknown }; review?: { target?: unknown; hash?: unknown; verdict?: unknown; kind?: unknown; call_id?: unknown; rereview_of?: unknown; snapshot?: unknown; followup?: unknown; confirmation_issue?: unknown; structured_stage?: unknown; after_diagnosis?: unknown; required_criteria?: unknown } };
     try { rec = JSON.parse(readFileSync(file, "utf8")); } catch { throw new LedgerError(`원장에 없는 검토 기록을 읽을 수 없다: ${file} — 확인해 고치거나 지운 뒤 다시 실행한다`); }
     // 기록은 그 기록의 대상에 귀속한다 — 같은 폴더의 다른 대상(예: TASK.md와 구현 diff) 기록을 지금 대상의 fail로 가져가지 않는다
     const owner = typeof rec.review?.target === "string" && rec.review.target !== "" ? rec.review.target : name;
@@ -128,11 +158,17 @@ function recoverOrphans(target: string, name: string, kindFor: (owner: string) =
     const verdict = rec.review?.verdict;
     const structuredStage = rec.review?.structured_stage;
     // 두 형식 중 하나로만 검증한다. 단계가 빠진 새 기록을 옛 footer 판정으로 복구하지 않는다.
-    const structured = structuredStage !== undefined ||
+    const stamp = ledger.findLast((row) => row.type === "format" && row.record === rel);
+    const evidenceFormat = stamp?.type === "format" ? stamp : undefined;
+    const criteria = rec.review?.required_criteria;
+    const matchingFormat = evidenceFormat
+      ? evidenceFormat.target === owner && evidenceFormat.hash === hash && matchingCriteria(evidenceFormat.required_criteria, criteria)
+      : criteria === undefined;
+    const structured = !!evidenceFormat || structuredStage !== undefined ||
       (scope && (Object.hasOwn(rec, "assessment") || (typeof text === "string" && hasStructuredReviewFence(text))));
-    const computed = isStructuredStage(structuredStage) && scope &&
+    const computed = matchingFormat && isStructuredStage(structuredStage) && scope &&
       recordedStage(scope, target, { target: owner }) === structuredStage && typeof text === "string"
-      ? assessStructuredReview(structuredStage, text).verdict : null;
+      ? assessStructuredReview(structuredStage, text, evidenceFormat?.required_criteria).verdict : null;
     const entryKind = typeof rec.review?.kind === "string" ? rec.review.kind : kindFor(owner);
     const recordedCall = {
       ...(typeof rec.review?.call_id === "string" ? { call_id: rec.review.call_id } : {}),
@@ -156,6 +192,7 @@ function recoverOrphans(target: string, name: string, kindFor: (owner: string) =
         ...(typeof rec.cross === "boolean" ? { cross: rec.cross } : {}),
         ...(validCrossUnavailable(rec.cross_unavailable) ? { cross_unavailable: rec.cross_unavailable } : {}),
         ...(isStructuredStage(structuredStage) ? { structured_stage: structuredStage } : {}),
+        ...(evidenceFormat ? { required_criteria: evidenceFormat.required_criteria } : {}),
       };
       notes.push(`${rel}(${owner}): 기록의 판정(${verdict})으로 원장에 복구했다`);
     } else {
@@ -196,6 +233,7 @@ export async function verifyCommand(args: string[], deps: VerifyCliDeps): Promis
     release = acquireLock(scope?.lockTarget ?? target);
     const artifact = readFileSync(target, "utf8");
     const hash = reviewHash(artifact);
+    const criteria = scope ? reviewCriteria(scope, artifact) : undefined;
     const recovered = ledgerTargets.flatMap((ledger) => {
       const rootTaskLedger = scope?.unit === "task" && ledger === scope.lockTarget;
       const legacyKindFor = (owner: string) => scope
@@ -230,11 +268,13 @@ export async function verifyCommand(args: string[], deps: VerifyCliDeps): Promis
       deps.write(JSON.stringify({ ran: false, reason: "검토 반복 실패 단계", escalation: escalation(before, target), ...(recovered.length ? { recovered } : {}) }, null, 2) + "\n");
       return ESCALATION_EXIT;
     }
+    const evidenceBase = budget && !budget.latest ? evidenceRereviewBase(ledgerTarget, name, entries) : undefined;
     const upper = state?.recovery.upper;
     const base = recovery?.type === "root_check" && upper?.action === "upper_recheck" ? { ledgerTarget, entry: upper.failed }
       : recovery ? state?.budget.latestDefinitive : grant?.type === "owner" || state?.decision.firstReview ? undefined
       : grant?.type === "joint" ? state?.budget.latestDefinitive
-      : budget?.latest ?? (!scope && before.base ? { ledgerTarget, entry: before.base } : undefined);
+      : budget?.latest ?? (evidenceBase ? { ledgerTarget, entry: evidenceBase } :
+        !scope && before.base ? { ledgerTarget, entry: before.base } : undefined);
     const rereview = base && loadRereview(base.ledgerTarget, base.entry, target, hash, artifact, kind, scope);
     if (recovery && !rereview) throw new AgentError("invalid_request", "한정 확인의 실패 기준점 원문을 확인할 수 없다");
     const previousRecord = rereview && base
@@ -260,7 +300,7 @@ export async function verifyCommand(args: string[], deps: VerifyCliDeps): Promis
     let outcome: Awaited<ReturnType<typeof crossVerify>>;
     try {
       outcome = await crossVerify({
-        kind, rereview, reviewStage: scope?.stage, focus,
+        kind, rereview, reviewStage: scope?.stage, focus, criteria,
         authorAgent: author, authorProvider: values["author-provider"] as "anthropic" | "openai" | undefined,
         purpose, artifact, artifactName: target,
         cwd: values.cwd ?? process.cwd(), timeoutMs: timeout === undefined ? undefined : Number(timeout),
@@ -293,13 +333,19 @@ export async function verifyCommand(args: string[], deps: VerifyCliDeps): Promis
       }
     }
     if (scope && grant && !recovery && call.followup) recordFollowupExecution(scope, grant.id, call.followup.id, now());
-    const assessment = scope ? assessStructuredReview(scope.stage, outcome.result.text) : undefined;
+    const criterionIds = criteria?.map(({ id }) => id);
+    const assessment = scope ? assessStructuredReview(scope.stage, outcome.result.text, criterionIds) : undefined;
     const verdict = assessment?.verdict ?? parseVerdict(outcome.result.text);
-    const format = scope ? { structured_stage: scope.stage } : {};
+    const format = scope ? { structured_stage: scope.stage, required_criteria: criterionIds } : {};
     // 기록 파일에는 세션 ID를 남기지 않는다
     const result = { ...outcome.result, session_id: null };
     const review = { target: name, hash, kind, verdict, rereview_of: previousRecord, snapshot: artifact, ...call, ...format };
     const record = { ...outcome, result, review, ...(assessment ? { assessment } : {}) };
+    if (criterionIds) {
+      try { appendLedger(ledgerTarget, { type: "format", at: now().toISOString(), target: name, hash,
+        record: recordName, required_criteria: criterionIds }); }
+      catch (error) { throw new LedgerError(`검토 기록의 필수 기준을 원장에 쓰지 못했다: ${(error as Error).message}`); }
+    }
     writeOrLedgerError(recordFile, JSON.stringify(record, null, 2) + "\n", "검토 기록");

     const entry: ReviewEntry = {
@@ -313,7 +359,11 @@ export async function verifyCommand(args: string[], deps: VerifyCliDeps): Promis
     }
     const after = reviewStage(readLedger(ledgerTarget), name, !scope);
     const output: Record<string, unknown> = { ...outcome, last_decision_by: after.last_decision_by, review: { target: name, hash, verdict, rereview_of: review.rereview_of, record: recordName } };
-    if (assessment) output.assessment = assessment;
+    if (assessment) {
+      output.assessment = assessment;
+      const gaps = evidenceGaps(assessment);
+      if (gaps.length) output.evidence_action = { action: "collect_evidence", gaps, if_proceed_without_evidence: "A-3" };
+    }
     if (recovered.length) output.recovered = recovered;
     if (verdict === "unknown") output.warning = assessment
       ? "구조화된 지적의 판정이 미확인이다. 원문과 형식을 확인한다."
```
