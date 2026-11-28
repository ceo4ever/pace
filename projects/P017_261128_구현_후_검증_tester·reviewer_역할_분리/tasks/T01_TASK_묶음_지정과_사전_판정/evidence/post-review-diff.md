# T01 구현 후 검토 대상 — 변경 diff

- 계약: [TASK.md](../TASK.md) · 정본 BR01: `backlogs/BL261127_01_구현_후_검증의_tester·reviewer_역할_분리와_위험_묶음/BR01_TASK_묶음_지정과_사전_판정.md`
- 기준 커밋: ad7196e (작업본, 커밋 전)

```diff
diff --git a/src/agent/review-hand.ts b/src/agent/review-hand.ts
index d42869e..2a0d017 100644
--- a/src/agent/review-hand.ts
+++ b/src/agent/review-hand.ts
@@ -3,7 +3,7 @@ import { lstatSync, readdirSync, realpathSync } from "node:fs";
 import { dirname, join, relative, resolve, sep } from "node:path";
 import { parseArgs } from "node:util";
 import { regularBytes, utf8 } from "../project/handoff-files.ts";
-import { approvedTaskEdit, proofScopeIssues, reviewHash } from "../project/pre-review.ts";
+import { approvedTaskEdit, proofScopeIssues, reviewerLineIssues, reviewHash } from "../project/pre-review.ts";
 import { permissionBasis, type PermissionBasis } from "../project/review-permission.ts";
 import { readAgentCalls, recordAgentCall, type AgentCall, type CallTarget } from "../project/agent-calls.ts";
 import { AgentError, errorCodes, errorPayload, providerOf } from "./contract.ts";
@@ -178,7 +178,7 @@ export function reviewArtifactCommand(action: "review-hand" | "review-record", a
       if (recovery || state.decision.kind !== "ordinary") return reportsToVerify(scope, state, deps.write);
       if (!reviewIdentity(values["author-provider"]) || !values["purpose-file"]) return reject(REVIEW_HAND_USAGE);
       if (scope.stage === "pre") {
-        const issues = proofScopeIssues(snapshot);
+        const issues = [...proofScopeIssues(snapshot), ...reviewerLineIssues(snapshot)];
         if (issues.length) return reject(issues.join(" · "));
       }
       const purpose = reviewInput(values["purpose-file"]);
diff --git a/src/agent/structured-review.ts b/src/agent/structured-review.ts
index 547fa77..d5360e2 100644
--- a/src/agent/structured-review.ts
+++ b/src/agent/structured-review.ts
@@ -19,6 +19,8 @@ const questions = {
       scope: "증명 범위와 판정 주체가 목적을 덮는가",
       observable: "완료 기준과 관측 방법이 명확한가",
       detection: "시험이 결함에서 실패하는가",
+      reviewer: "구현 후 reviewer 필요·생략 판단이 경계·상태·흐름 사실 질문의 답과 맞는가",
+      breadth: "기준이 변경 영향 경로를 넘어 기존 동작까지 넓혀지지 않았는가",
     },
   },
   post: {
diff --git a/src/agent/verify-cli.ts b/src/agent/verify-cli.ts
index 45c966f..29f8167 100644
--- a/src/agent/verify-cli.ts
+++ b/src/agent/verify-cli.ts
@@ -2,7 +2,7 @@ import { randomUUID } from "node:crypto";
 import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
 import { basename, dirname, join, relative, resolve, sep } from "node:path";
 import { parseArgs } from "node:util";
-import { approvedTaskEdit, proofScopeIssues, reviewHash } from "../project/pre-review.ts";
+import { approvedTaskEdit, proofScopeIssues, reviewerLineIssues, reviewHash } from "../project/pre-review.ts";
 import { AgentError, errorCodes, errorPayload, type Executor } from "./contract.ts";
 import { automaticCallTarget, callCancellation, observedAgentCall, requireCallAgent, tryRecordCall } from "./call-context.ts";
 import type { AgentCall } from "../project/agent-calls.ts";
@@ -330,6 +330,11 @@ export async function verifyCommand(args: string[], deps: VerifyCliDeps): Promis
       deps.write(response);
       return ESCALATION_EXIT;
     }
+    // 구현 후 reviewer 줄 형식은 호출을 예약하기 전에 거부한다. 예산·call 행·실행기를 쓰지 않는다.
+    if (scope?.stage === "pre") {
+      const issues = reviewerLineIssues(artifact);
+      if (issues.length) throw new AgentError("invalid_request", issues.join(" · "));
+    }
     const budget = scope && !recovery && state?.decision.kind === "ordinary" ? reserveReviewCall(scope, now(), state.budget) : undefined;
     if (scope && grant) checkGrant(scope, target, grant);
     if (scope && state && recovery) checkRecoveryProof(scope, target, recovery, state, out);
diff --git a/src/agent/verify.ts b/src/agent/verify.ts
index e4e3f46..3dfae64 100644
--- a/src/agent/verify.ts
+++ b/src/agent/verify.ts
@@ -48,6 +48,28 @@ export interface Rereview {
   previousPassed?: boolean;
 }
 
+/** v2 사전 검토의 구현 후 reviewer 판단(reviewer)과 기준 넓힘(breadth) 규칙. 사실 질문은 변경 영향 경로에 대해 TASK에 적힌 사실로 답한다. */
+export const REVIEWER_FACT_QUESTIONS = [
+  "경계(A) 1. 새로 생기거나 바뀐 진입점이 있나?",
+  "경계(A) 2. 인가 판정이 바뀌나?",
+  "경계(A) 3. 개인정보·비밀을 읽거나 내보내나?",
+  "경계(A) 4. 외부 전송·셸·삭제가 있나?",
+  "상태(B) 1. 영속 데이터를 쓰거나 지우나?",
+  "상태(B) 2. 스키마·마이그레이션이 있나?",
+  "상태(B) 3. 감사·변경 이력이 있나?",
+  "흐름(C) 1. 같은 대상에 대한 동시 쓰기 경로가 기준·시험에 있나?",
+  "흐름(C) 2. 잠금·트랜잭션 범위가 바뀌나?",
+  "흐름(C) 3. 여러 단계 중간에 실패할 수 있나?",
+  "흐름(C) 4. 상태 전이나 허가 분기가 바뀌나?",
+] as const;
+
+const REVIEWER_DECISION_RULES = [
+  "구현 후 reviewer 판단(category reviewer): `## 증명 범위`의 `- 구현 후 reviewer: 필요|생략 — 이유` 줄을 아래 사실 질문의 답과 대조한다. 답은 TASK에 적힌 변경 영향 경로의 사실로만 정한다.",
+  ...REVIEWER_FACT_QUESTIONS.map((question) => `- ${question}`),
+  "`생략`인데 위 질문 중 하나라도 TASK 내용상 \"예\"이면 blocking이다. impact는 goal, location은 그 줄의 `TASK.md:줄`, scenario에 \"예\"인 질문, reproduction에 그 답의 근거인 TASK 위치와 문장을 쓴다. TASK에 적히지 않은 위험을 예측해 \"예\"로 만들지 않는다. 그런 요구는 blocking이 아니다. `필요`이고 이유가 사실과 맞으면 이 범주 지적을 내지 않는다.",
+  "기준 넓힘(category breadth): 기준 `T-n`은 변경 영향 경로(이 변경이 실제로 건드리는 진입점·데이터·흐름)로 한정한다. 변경이 건드리지 않는 기존 동작은 `범위 밖`에 기존 회귀 시험으로 둔다. 작성자가 기준을 기존 경로까지 넓혔으면 blocking이다. impact는 criterion, criterion과 location은 넓어진 `T-n`(location은 그 기준 행의 `TASK.md:줄`)이고, scenario·reproduction에 넓어진 기존 경로와 그 경로를 이 변경이 건드리지 않는 근거를 쓴다. 검토자가 범위 밖으로 넓히라고 요구하는 지적은 위 증명 범위 규칙대로 should_fix다.",
+];
+
 /** 1단계 목표/결과 대조. 2단계 작업 문서 인계는 첫 판정을 받은 호출자의 호스트 검토 절차다. */
 export function buildVerifyPrompt(purpose: string, artifactName: string, artifact: string, kind: VerifyKind = "goal", rereview?: Rereview,
   reviewStage?: BudgetStage, focus?: string, criteria?: readonly ReviewCriterion[], requirePermission?: boolean, approvedTaskEdit?: string): string {
@@ -92,6 +114,7 @@ export function buildVerifyPrompt(purpose: string, artifactName: string, artifac
       "새 TASK 형식(v2)의 증명 범위 규칙: 형식 표지가 중복되거나 지원하지 않는 버전이면 blocking이다. 증명 범위 절·판정 주체가 누락되거나 비면 그것 자체만 blocking 1건으로 내고 다른 지적을 늘어놓지 않는다. 단건 억제의 빈 값은 게이트가 거부하는 구조 누락(절 없음·주석뿐인 절·주체 줄 없음·값 공백)이다. 미정·TBD처럼 실제 텍스트가 있으나 의미상 불충분한 값은 단건 억제하지 않고 목적·안전까지 함께 평가한다.",
       "포함·범위 밖(이유·넘길 곳)의 내용과 판정 주체를 목적·기준에 대조한다. blocking은 적힌 증명 범위로 목적·기준을 증명할 수 없을 때다. 목적에 충분한 범위를 넓히라는 요구는 should_fix다. 현재 적힌 범위가 이미 목적·기준을 충분히 입증한다면 그 밖으로 확대하라는 요구는 목적 증명에 필요하지 않아도 반드시 should_fix로 분류한다. 합의 범위 밖이라는 이유로 note로 바꾸지 않는다. should_fix는 확장 승인이나 반영 의무가 아니며 범위 변경은 별도 합의한다. 범위 자체가 목적에 비해 좁으면 blocking이며 범위 밖 선언으로 검토를 피할 수 없다.",
       "판정 주체의 권한도 대조한다. 사람의 결정이 정답인 기준은 승인받은 사람의 원문을 왜곡·누락 없이 옮기고 불완전하면 미확인으로 드러내면 통과다. 작성자나 자동 검사가 그 결정을 대신하거나 필수 안전 기준(보안·데이터·되돌리기 어려운 행동)을 범위 밖으로 빼면 blocking이다.",
+      ...REVIEWER_DECISION_RULES,
       ...(rereview ? [focus
         ? "증명 범위 규칙도 위 한정 확인의 판정 범위에 적용한다."
         : "재검토에서는 위 규칙도 직전 blocking 해소와 바뀐 줄의 새 결함 범위 안에서 적용한다. 바뀌지 않은 부분의 새 지적은 note다."] : []),
diff --git a/src/project/pre-review.ts b/src/project/pre-review.ts
index eb078e4..a1e847a 100644
--- a/src/project/pre-review.ts
+++ b/src/project/pre-review.ts
@@ -74,6 +74,39 @@ export function proofScopeIssues(task: string): string[] {
   return [];
 }
 
+/**
+ * v2 `## 증명 범위`의 `- 구현 후 reviewer: 필요|생략 — 이유` 줄 형식만 본다.
+ * `proofScopeIssues`와 분리해 옛 기록 재판정(`legacyStructureOnly`)의 의미를 바꾸지 않는다.
+ * 증명 범위 구조가 이미 깨졌으면 그 문제가 먼저이므로 빈 배열을 낸다.
+ */
+export function reviewerLineIssues(task: string): string[] {
+  if (taskFormat(task) !== 'v2' || proofScopeIssues(task).length) return [];
+  // 형식만 기계가 본다(D3): 정본 줄 머리 `- 구현 후 reviewer:`의 정확 일치를 원문 줄에 적용한다.
+  // visibleMarkdown은 줄 수를 보존하므로 원문 줄과 인덱스로 맞춘다. 주석 제거로만 머리가 생긴 줄은 세지 않고,
+  // 원문과 주석 제거 결과가 다르면(줄 안 주석) 형식 문제다. 표지·들여쓰기 변형 같은 의미 상충은 사전 reviewer가 판정한다.
+  const head = '- 구현 후 reviewer:';
+  const raw = task.replace(/\r\n/g, '\n').split('\n');
+  const visible = visibleMarkdown(task).split('\n');
+  let inScope = false, outside = 0, mixed = false;
+  const inside: string[] = [];
+  visible.forEach((shown, i) => {
+    if (shown.startsWith('## ')) { inScope = /^## 증명 범위[ \t]*$/.test(shown); return; }
+    if (!shown.startsWith(head) || !raw[i]!.startsWith(head)) return;
+    if (raw[i] !== shown) mixed = true;
+    if (inScope) inside.push(shown.slice(head.length)); else outside++;
+  });
+  if (mixed) return ['구현 후 reviewer: 줄에 주석이 섞였다 — 주석 없이 원문 한 줄로 쓴다'];
+  const issues: string[] = [];
+  if (outside) issues.push('구현 후 reviewer: 증명 범위 절 밖에 줄이 있다');
+  if (!inside.length) return [...issues, '구현 후 reviewer: 줄 누락 — `- 구현 후 reviewer: 필요|생략 — 이유`'];
+  if (inside.length > 1) return [...issues, '구현 후 reviewer: 줄 중복'];
+  const value = inside[0]!;
+  const choice = value.trim().split(/[ \t—-]/)[0];
+  if (choice !== '필요' && choice !== '생략') return [...issues, '구현 후 reviewer: 값은 필요 또는 생략'];
+  if (!/^[ \t]*(?:필요|생략)[ \t]*[—-][ \t]*\S/.test(value)) return [...issues, '구현 후 reviewer: 이유 누락 — `필요|생략 — 이유`'];
+  return issues;
+}
+
 /** CRLF만 LF로 정규화하고 상태 값을 제외한다. 나머지 문자는 그대로다. */
 export function reviewHash(task: string): string {
   return createHash('sha256').update(task.replace(/\r\n/g, '\n').replace(/^- 상태: .+$/m, '- 상태:')).digest('hex');
@@ -206,6 +239,8 @@ function verifiedPermission(current: ReviewEntry, candidate: ReviewCandidate, le
 export function reviewIssues(dir: string, task: string, candidate = workingReview(dir), gate: PermissionCheck = {}): string[] {
   const scopeIssues = proofScopeIssues(task);
   if (scopeIssues.length) return scopeIssues;
+  const lineIssues = reviewerLineIssues(task);
+  if (lineIssues.length) return lineIssues;
   const markers = [...task.matchAll(/^- 사전 검토:([^\r\n]*)\r?$/gm)];
   const marker = markers[0]?.[1]?.trim();
   const name = 'PRE-REVIEW.json';
diff --git a/templates/project/TASK-CLOSE.md b/templates/project/TASK-CLOSE.md
index e6d538c..83af5b1 100644
--- a/templates/project/TASK-CLOSE.md
+++ b/templates/project/TASK-CLOSE.md
@@ -28,7 +28,17 @@
 
 ## 리뷰
 
-<!-- tester 판정, reviewer 판정: blocking 0건 · should_fix 처리(반영 | 남김+이유). 특수 기능이 필요했다면 선택·사용 이유(없거나 꺼져 있으면 대체 이유·수동 설정 필요 여부), 불필요했다면 그 판단. 교본: <색인> — 대조 결과·따른 절 (코드 변경 없으면 "교본: 해당 없음") -->
+<!--
+tester 판정: pass | fail — 근거
+reviewer 판정: pass | fail — blocking 0건 · should_fix 처리(반영 | 남김+이유)
+  부르지 않았으면 대신: reviewer 생략 — 이유
+회차마다 요청 시각=PM 검증 요청, 회수 시각=판정 결과 수신(배정 시작 회신·검토 등록 시각이 아니다):
+| 역할 | 회차 | 요청 시각 | 회수 시각 | 판정 |
+|---|---|---|---|---|
+| tester | 1 | | | |
+| reviewer | 1 | | | |
+특수 기능이 필요했다면 선택·사용 이유(없거나 꺼져 있으면 대체 이유·수동 설정 필요 여부), 불필요했다면 그 판단. 교본: <색인> — 대조 결과·따른 절 (코드 변경 없으면 "교본: 해당 없음")
+-->
 
 ## 남긴 것
 
diff --git a/templates/project/TASK.md b/templates/project/TASK.md
index 3d37062..dde42e1 100644
--- a/templates/project/TASK.md
+++ b/templates/project/TASK.md
@@ -22,8 +22,17 @@
 ## 증명 범위
 
 - 판정 주체: <!-- 자동 테스트 / 승인받은 사람의 결정 원문 / 관찰 — 최종 정답을 누가 무엇으로 판정하는가 -->
-- 포함: <!-- 목적에 비례해 증명할 것 -->
-- 범위 밖: <!-- 증명하지 않는 것 + 이유 + 넘길 곳. 필수 안전 기준은 제외할 수 없다 -->
+- 구현 후 reviewer: <!-- 필요 — 이유 | 생략 — 이유. 아래 사실 질문 중 하나라도 "예"면 필요 -->
+- 포함: <!-- 변경 영향 경로 — 이 변경이 실제로 건드리는 진입점·데이터·흐름. 기준 T-n은 이 경로로 한정한다 -->
+- 범위 밖: <!-- 증명하지 않는 것 + 이유 + 넘길 곳. 변경이 건드리지 않는 기존 동작은 "기존 동작 — 기존 회귀 시험". 필수 안전 기준은 제외할 수 없다 -->
+
+<!--
+구현 후 reviewer 판단 — 변경 영향 경로에 대해 TASK에 적힌 사실로 예/아니오를 답한다. 해당 없는 위험을 예측하지 않는다.
+경계(A): 새로 생기거나 바뀐 진입점이 있나? 인가 판정이 바뀌나? 개인정보·비밀을 읽거나 내보내나? 외부 전송·셸·삭제가 있나?
+상태(B): 영속 데이터를 쓰거나 지우나? 스키마·마이그레이션이 있나? 감사·변경 이력이 있나?
+흐름(C): 같은 대상에 대한 동시 쓰기 경로가 기준·시험에 있나? 잠금·트랜잭션 범위가 바뀌나? 여러 단계 중간에 실패할 수 있나? 상태 전이나 허가 분기가 바뀌나?
+이 값은 예측이다. 도구는 이 값으로 구현 후 호출을 막거나 열지 않는다.
+-->
 
 ## 기준
 
diff --git a/test/agent-review-hand.test.ts b/test/agent-review-hand.test.ts
index cfe172b..2eb1730 100644
--- a/test/agent-review-hand.test.ts
+++ b/test/agent-review-hand.test.ts
@@ -13,7 +13,7 @@ import { reviewArtifactCommand } from "../src/agent/review-hand.ts";
 import { tryRecordCall } from "../src/agent/call-context.ts";
 import { evidenceReviewFixture, runPace, sessionFreeEnv, tempDir } from "./helpers.ts";
 
-const initial = "# T06 검토\n- 상태: 진행\n- 사전 검토: v1\n- TASK 형식: v2\n\n## 목적\n기존 결과를 확인한다.\n\n## 증명 범위\n- 판정 주체: 자동 시험\n\n## 기준\n\n| # | 기준 |\n|---|---|\n| T-1 | 실제 결과가 보인다 |\n\n## 접근\n순서 A를 확인한다.\n";
+const initial = "# T06 검토\n- 상태: 진행\n- 사전 검토: v1\n- TASK 형식: v2\n\n## 목적\n기존 결과를 확인한다.\n\n## 증명 범위\n- 판정 주체: 자동 시험\n- 구현 후 reviewer: 필요 — 시험 고정본\n\n## 기준\n\n| # | 기준 |\n|---|---|\n| T-1 | 실제 결과가 보인다 |\n\n## 접근\n순서 A를 확인한다.\n";
 const grant = { mode: "implementation", paths: [], protected: [{ from: 7, to: 7 }] };
 const blocking = { id: "F1", severity: "blocking", category: "scope", location: "TASK.md:7",
   scenario: "대상 결과를 확인하지 못한다", reproduction: "주어진 계획으로 결과 관측 조건을 실행한다", confidence: "high" };
@@ -523,3 +523,68 @@ test("T07 S-5: 백로그 원장은 외부 시도 한 개와 해당 판정 ref를
   assert.equal(readAgentCalls(target)?.length, 1);
   assert.equal(readAgentCalls(target)?.[0]?.ref, "review-records/R1.json");
 });
+
+const reviewerLine = "- 구현 후 reviewer: 필요 — 시험 고정본\n";
+const lineCases: [string, string, RegExp][] = [
+  ["줄 없음", initial.replace(reviewerLine, ""), /줄 누락/],
+  ["중복", initial.replace(reviewerLine, reviewerLine + reviewerLine), /줄 중복/],
+  ["모르는 값", initial.replace(reviewerLine, "- 구현 후 reviewer: 아마 — 모름\n"), /필요 또는 생략/],
+  ["빈 이유", initial.replace(reviewerLine, "- 구현 후 reviewer: 생략 — \n"), /이유 누락/],
+];
+
+test("P017 T01 S-4: 사전 verify는 reviewer 줄 형식 문제를 예약 전에 거부하고 올바른 줄은 예약 뒤 실행한다", async () => {
+  for (const [name, text, expected] of lineCases) {
+    const h = fixture();
+    writeFileSync(h.target, text);
+    const result = await h.verify(raw());
+    assert.equal(result.status, 2, name);
+    assert.match(result.body.error.message, expected, name);
+    assert.equal(result.executed, 0, name);
+    assert.deepEqual(readLedger(h.target), [], name);
+    assert.equal(existsSync(h.records), false, name);
+  }
+  for (const choice of ["필요 — 허가 분기", "생략 — 문구만"]) {
+    const h = fixture();
+    writeFileSync(h.target, initial.replace(reviewerLine, `- 구현 후 reviewer: ${choice}\n`));
+    let output = "", executed = 0;
+    let atEntry: string[] = [];
+    const agent: Executor = {
+      agent: "claude", mode: "p",
+      capabilities: { models: true, effort: true, systemPrompt: false, resume: false, writeAccess: true },
+      async run(request) {
+        executed++;
+        atEntry = readLedger(h.target).map((row) => row.type);
+        return normalizeResult(request, { text: evidenceReviewFixture(request.prompt, raw()), provider: "anthropic" },
+          { durationMs: 10, enforcement: "fixture" });
+      },
+    };
+    const status = await verifyCommand(["--target", h.target, "--author-agent", "codex", "--purpose-file", h.purpose], {
+      executors: () => [agent], write: (value) => { output += value; },
+    });
+    assert.equal(status, 0, output);
+    assert.equal(executed, 1);
+    assert.deepEqual(atEntry, ["call"], "실행기 진입 시점에 이번 호출의 call 행이 이미 원장에 있다");
+  }
+});
+
+test("P017 T01 S-4: review-hand는 reviewer 줄 형식 문제를 고정 없이 거부하고 올바른 줄은 예약·고정한다", () => {
+  for (const [name, text, expected] of lineCases) {
+    const h = fixture();
+    writeFileSync(h.target, text);
+    const result = h.hand();
+    assert.notEqual(result.status, 0, name);
+    assert.match(result.output, expected, name);
+    assert.deepEqual(readLedger(h.target), [], name);
+    assert.equal(existsSync(h.records), false, name);
+  }
+  for (const choice of ["필요 — 허가 분기", "생략 — 문구만"]) {
+    const h = fixture();
+    writeFileSync(h.target, initial.replace(reviewerLine, `- 구현 후 reviewer: ${choice}\n`));
+    const handed = h.hand();
+    assert.equal(handed.status, 0, `${choice}: ${handed.output}`);
+    assert.equal(handed.body.handed, true, choice);
+    assert.equal(typeof handed.body.hand, "string", choice);
+    assert.ok(existsSync(handed.body.snapshot), choice);
+    assert.deepEqual(readLedger(h.target).map((row) => row.type), ["call"], choice);
+  }
+});
diff --git a/test/agent-review-log.test.ts b/test/agent-review-log.test.ts
index f61f096..ee872ee 100644
--- a/test/agent-review-log.test.ts
+++ b/test/agent-review-log.test.ts
@@ -5,7 +5,7 @@ import { join } from "node:path";
 import { AgentError, normalizeResult, type Executor } from "../src/agent/contract.ts";
 import { reviewNoteCommand, verifyCommand } from "../src/agent/verify-cli.ts";
 import { acquireLock, lineDiff, parseVerdict, readLedger, reviewStage, textHash, type LedgerEntry, type ReviewEntry } from "../src/agent/review-log.ts";
-import { reserveReviewCall, reviewBudgetScope } from "../src/agent/review-budget.ts";
+import { readReviewBudget, reserveReviewCall, reviewBudgetScope } from "../src/agent/review-budget.ts";
 import { reviewHash } from "../src/project/pre-review.ts";
 import { runPace, scopedReviewFixture, tempDir } from "./helpers.ts";
 
@@ -331,7 +331,7 @@ test("P013 T01: 사전 검토의 구조 누락이 첫 전체 판정을 소비하
   assert.equal(structural.code, 2);
   assert.match(structural.json.error.message, /증명 범위/);
   assert.equal(h.prompts.length, 0);
-  writeFileSync(plan, "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n## 목적\n안전한 처리\n## 기준\n| T-1 | 안전 출력 확인 |\n");
+  writeFileSync(plan, "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 필요 — 시험 고정본\n## 목적\n안전한 처리\n## 기준\n| T-1 | 안전 출력 확인 |\n");
   const first = await h.review(plan, "pass");
   assert.equal(first.code, 0);
   assert.equal(first.json.review.rereview_of, null);
@@ -352,7 +352,7 @@ test("P013 T01: 옛 구조 전용 판정은 근거가 확인되면 호출로만
   mkdirSync(join(h.task, "review-records"));
   writeFileSync(join(h.task, record), JSON.stringify({ review: { snapshot }, result: { text } }));
   writeFileSync(join(h.task, "REVIEW-LOG.jsonl"), JSON.stringify(entry) + "\n");
-  writeFileSync(plan, "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n## 목적\n안전한 처리\n## 기준\n| T-1 | 안전 출력 확인 |\n");
+  writeFileSync(plan, "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 필요 — 시험 고정본\n## 목적\n안전한 처리\n## 기준\n| T-1 | 안전 출력 확인 |\n");
   const full = await h.review(plan, "F1 [blocking] 안전 누락\nfail", "task");
   assert.equal(full.code, 0);
   assert.equal(full.json.review.rereview_of, null);
@@ -954,3 +954,24 @@ test("lineDiff는 바뀐 줄과 앞뒤 1줄 맥락만 낸다", () => {
   assert.equal(lineDiff("x\n", "x\n"), "(바뀐 줄 없음)");
 });
 
+
+test("P017 T01 S-5: legacyStructureOnly 판정은 reviewer 줄과 무관하게 그대로다", () => {
+  const seed = (snapshot: string) => {
+    const h = budgetHarness();
+    const text = "F1 [blocking] 계획 누락\nfail";
+    const record = "review-records/R1.json";
+    const entry: ReviewEntry = {
+      type: "review", at: "2026-01-01", kind: "task", target: "TASK.md", hash: reviewHash(snapshot),
+      verdict: "fail", verifier: "codex", provider: "openai", rereview_of: null, record, result_hash: textHash(text),
+    };
+    mkdirSync(join(h.task, "review-records"));
+    writeFileSync(join(h.task, record), JSON.stringify({ review: { snapshot }, result: { text } }));
+    writeFileSync(join(h.task, "REVIEW-LOG.jsonl"), JSON.stringify(entry) + "\n");
+    const status = readReviewBudget(reviewBudgetScope(join(h.task, "TASK.md"))!).status;
+    return [status.rounds, status.calls];
+  };
+  // 증명 범위는 온전하고 reviewer 줄만 없는 옛 v2 fail — 구조 전용이 아니므로 판정 회차로 센다.
+  assert.deepEqual(seed("- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n## 목적\n안전한 처리\n"), [1, 1]);
+  // 증명 범위가 없는 옛 v2 fail — 여전히 구조 전용이라 호출로만 센다.
+  assert.deepEqual(seed("- TASK 형식: v2\n## 목적\n안전한 처리\n"), [0, 1]);
+});
diff --git a/test/agent-structured-review.test.ts b/test/agent-structured-review.test.ts
index de24fc8..839bf40 100644
--- a/test/agent-structured-review.test.ts
+++ b/test/agent-structured-review.test.ts
@@ -3,10 +3,12 @@ import assert from "node:assert/strict";
 import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
 import { dirname, join } from "node:path";
 import { normalizeResult, type Executor } from "../src/agent/contract.ts";
-import { buildVerifyPrompt } from "../src/agent/verify.ts";
+import { buildVerifyPrompt, REVIEWER_FACT_QUESTIONS } from "../src/agent/verify.ts";
 import { reviewNoteCommand, verifyCommand } from "../src/agent/verify-cli.ts";
 import { ledgerPath, readLedger, textHash, type LedgerEntry } from "../src/agent/review-log.ts";
 import { assessStructuredReview } from "../src/agent/structured-review.ts";
+import { reviewCriteria } from "../src/agent/review-criteria.ts";
+import type { ReviewBudgetScope } from "../src/agent/review-budget.ts";
 import { reviewHash } from "../src/project/pre-review.ts";
 import { evidenceReviewFixture, tempDir } from "./helpers.ts";
 
@@ -487,3 +489,78 @@ test("T04는 A-1 계약 변경 뒤 과거 증거 미확인을 건너뛰고 전
   assert.doesNotMatch(h.prompts.at(-1)!, /직전 기준별 증거 상태/);
   assert.deepEqual([changed.output.budget.calls, changed.output.budget.rounds], [1, 1]);
 });
+
+test("P017 T01 S-6: 사전 reviewer·breadth 범주는 질문 안이고 인수 사례 (가)~(라)의 TASK 입력을 가른다", () => {
+  // 사례마다 실제 TASK 원문을 만들고 기준 ID·지적 위치·프롬프트를 그 원문에서 얻는다.
+  const task = (declaration: string, t2: string, outside: string) => [
+    "# T09 설정 저장", "", "- TASK 형식: v2", "", "## 증명 범위", "", "- 판정 주체: 자동 테스트",
+    `- 구현 후 reviewer: ${declaration}`, "- 포함(변경 영향 경로): 설정 저장 버튼", `- 범위 밖: ${outside}`, "",
+    "## 기준", "", "| # | 완료 기준 |", "|---|---|", "| T-1 | 저장 버튼이 설정을 파일에 영속 쓰기하고 다시 읽는다 |", `| T-2 | ${t2} |`, "",
+  ].join("\n");
+  const own = "저장 뒤 화면에 저장됨 표시가 뜬다";
+  const wide = "저장 뒤 화면 표시와 기존 목록 화면 전체의 정렬·필터가 그대로다";
+  const old = "기존 목록 화면 — 기존 회귀 시험";
+  const ga = task("생략 — 문구만 바뀐다", own, old);
+  const na = task("필요 — 상태(B) 영속 쓰기", own, old);
+  const da = task("필요 — 상태(B) 영속 쓰기", wide, "없음");
+  const ra = task("필요 — 상태(B) 영속 쓰기", own, old);
+  const at = (text: string, needle: string) => `TASK.md:${text.split("\n").findIndex((row) => row.includes(needle)) + 1}`;
+  const criteriaOf = (text: string) => reviewCriteria({ stage: "pre" } as ReviewBudgetScope, text).map((criterion) => criterion.id);
+  const assess = (text: string, findings: unknown[]) => {
+    const criteria = criteriaOf(text);
+    const evidence = criteria.map((id) => ({ id, state: "present", observation: `${id} 시험이 있다` }));
+    return assessStructuredReview("pre", evidenceResponse(findings, evidence), criteria);
+  };
+  // 입력 차이: (가)→(나)는 선언 줄만, (다)→(라)는 넓힌 T-2와 범위 밖 줄만 다르다.
+  const changed = (a: string, b: string) => a.split("\n").flatMap((row, i) => row === b.split("\n")[i] ? [] : [i + 1]);
+  assert.deepEqual(changed(ga, na), [Number(at(ga, "구현 후 reviewer").slice(8))]);
+  assert.deepEqual(changed(da, ra), [Number(at(da, "범위 밖").slice(8)), Number(at(da, "| T-2").slice(8))]);
+  for (const text of [ga, na, da, ra]) {
+    assert.deepEqual(criteriaOf(text), ["T-1", "T-2"]);
+    const prompt = buildVerifyPrompt("상위 목적", "TASK.md", text, "task", undefined, "pre");
+    // 사례를 가르는 선언 줄·넓힌 T-2·범위 밖 줄을 포함해 TASK 원문 전체가 사전 reviewer 입력에 실린다.
+    for (const row of text.split("\n").filter(Boolean)) assert.ok(prompt.includes(row), row);
+  }
+  // (가) 생략 + T-1 영속 쓰기 → 선언 줄의 유효 blocking, fail
+  const mismatch = {
+    id: "F1", severity: "blocking", category: "reviewer", location: at(ga, "구현 후 reviewer"), confidence: "high", impact: "goal", criterion: null,
+    scenario: "생략인데 상태(B) '영속 데이터를 쓰거나 지우나?'가 예다", reproduction: `${at(ga, "| T-1")} T-1이 파일 영속 쓰기를 적는다`,
+  };
+  assert.ok(ga.includes("영속 쓰기") && ga.includes("생략 —"));
+  const a = assess(ga, [mismatch]);
+  assert.deepEqual([a.verdict, a.findings![0]!.effective, a.findings![0]!.reason], ["fail", "blocking", null]);
+  // (나) 필요로 고친 판 → 지적 없음, pass
+  const b = assess(na, []);
+  assert.equal(b.verdict, "pass");
+  assert.equal(b.findings!.length, 0);
+  // (다) 작성자가 넓힌 T-2 → 그 줄·기준의 blocking 유지, fail. should_fix로 낮추면 안 된다.
+  const widened = {
+    id: "F2", severity: "blocking", category: "breadth", location: at(da, "| T-2"), confidence: "high", impact: "criterion", criterion: "T-2",
+    scenario: "T-2가 이 변경이 건드리지 않는 기존 목록 화면까지 요구한다", reproduction: "포함 줄의 변경 영향 경로에 목록 화면이 없다",
+  };
+  assert.ok(da.includes(wide));
+  const c = assess(da, [widened]);
+  assert.deepEqual([c.verdict, c.findings![0]!.effective, c.findings![0]!.reason], ["fail", "blocking", null]);
+  // (라) 좁힌 판: 넓힌 문장이 없고 기존 경로는 범위 밖 줄에 있다 → 그 줄의 반례(검토자의 확대 요구)는 유효 should_fix, pass
+  assert.ok(!ra.includes(wide) && ra.includes(old));
+  const d = assess(ra, [{ ...widened, severity: "should_fix", location: at(ra, "범위 밖"), criterion: null, impact: "goal",
+    scenario: "기존 목록 화면 회귀도 이 태스크에서 보면 좋다" }]);
+  assert.deepEqual([d.verdict, d.findings![0]!.effective, d.findings![0]!.category], ["pass", "should_fix", "breadth"]);
+  for (const result of [a, c, d]) assert.ok(result.findings!.every((finding) => finding.reason !== "outside_question" && finding.handoff === null));
+});
+
+test("P017 T01 S-6: v2 사전 프롬프트에 두 하위 확인·사실 질문 11개·필요/생략과 넓힘 등급 규칙이 있다", () => {
+  const task = "- TASK 형식: v2\n## 증명 범위\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 생략 — 문구만\n## 기준\n| T-1 | 결과 |\n";
+  const prompt = buildVerifyPrompt("상위 목적", "TASK.md", task, "task", undefined, "pre");
+  assert.match(prompt, /^- reviewer: /m);
+  assert.match(prompt, /^- breadth: /m);
+  for (const question of REVIEWER_FACT_QUESTIONS) assert.ok(prompt.includes(`- ${question}`), question);
+  assert.equal(REVIEWER_FACT_QUESTIONS.length, 11);
+  assert.deepEqual(["경계(A)", "상태(B)", "흐름(C)"].map((bundle) => REVIEWER_FACT_QUESTIONS.filter((q) => q.startsWith(bundle)).length), [4, 3, 4]);
+  assert.match(prompt, /`생략`인데 위 질문 중 하나라도 TASK 내용상 "예"이면 blocking이다\. impact는 goal, location은 그 줄의 `TASK\.md:줄`/);
+  assert.match(prompt, /예측해 "예"로 만들지 않는다/);
+  assert.match(prompt, /작성자가 기준을 기존 경로까지 넓혔으면 blocking이다\. impact는 criterion, criterion과 location은 넓어진 `T-n`/);
+  assert.match(prompt, /검토자가 범위 밖으로 넓히라고 요구하는 지적은 위 증명 범위 규칙대로 should_fix다/);
+  const legacy = buildVerifyPrompt("상위 목적", "TASK.md", "## 기준\n| T-1 | 결과 |\n", "task", undefined, "pre");
+  assert.ok(!legacy.includes(REVIEWER_FACT_QUESTIONS[0]));
+});
diff --git a/test/pre-review.test.ts b/test/pre-review.test.ts
index ff62c39..8cabf7a 100644
--- a/test/pre-review.test.ts
+++ b/test/pre-review.test.ts
@@ -5,12 +5,12 @@ import { join } from 'node:path';
 import { createHash } from 'node:crypto';
 import { spawnSync } from 'node:child_process';
 import { tempDir } from './helpers.ts';
-import { reviewIssues, reviewHash, taskFormat } from '../src/project/pre-review.ts';
+import { proofScopeIssues, reviewerLineIssues, reviewIssues, reviewHash, taskFormat } from '../src/project/pre-review.ts';
 
 test('v2 증명 범위는 검토 기록보다 먼저 검사하고 옛 TASK는 호환한다', () => {
   const dir = tempDir('pace-proof-');
   const marker = '- TASK 형식: v2\n';
-  const scope = '## 증명 범위\n\n- 판정 주체: 자동 테스트\n- 포함: 호환 검사\n- 범위 밖: 운영 측정은 설치 뒤\n\n## 기준\nT-1\n';
+  const scope = '## 증명 범위\n\n- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 필요 — 시험 고정본\n- 포함: 호환 검사\n- 범위 밖: 운영 측정은 설치 뒤\n\n## 기준\nT-1\n';
   const valid = marker + scope;
   assert.deepEqual(reviewIssues(dir, '## 목적\n옛 TASK\n'), []);
   assert.deepEqual(reviewIssues(dir, valid), []);
@@ -40,6 +40,53 @@ test('v2 증명 범위는 검토 기록보다 먼저 검사하고 옛 TASK는 
   assert.match(reviewIssues(dir, missing).join(), /절 누락/);
 });
 
+test('P017 T01 S-2: 구현 후 reviewer 줄은 증명 범위 안 정확히 한 줄의 필요·생략 — 이유다', () => {
+  const dir = tempDir('pace-reviewer-line-');
+  const marker = '- TASK 형식: v2\n';
+  const line = '- 구현 후 reviewer: 필요 — 허가 분기가 바뀐다\n';
+  const scope = (body: string) => marker + '## 증명 범위\n- 판정 주체: 자동 테스트\n' + body + '- 포함: 게이트\n\n## 기준\nT-1\n';
+  const issues = (text: string) => ({ line: reviewerLineIssues(text), gate: reviewIssues(dir, text) });
+  for (const [text, expected] of [
+    [scope(''), /줄 누락/],
+    [scope(line + line), /줄 중복/],
+    [scope('- 구현 후 reviewer: 아마 — 모른다\n'), /필요 또는 생략/],
+    [scope('- 구현 후 reviewer: 필수 — 이유\n'), /필요 또는 생략/],
+    [scope('- 구현 후 reviewer: 필요\n'), /이유 누락/],
+    [scope('- 구현 후 reviewer: 생략 —   \n'), /이유 누락/],
+    [scope('- 구현 후 reviewer: <!-- 필요 — 이유 | 생략 — 이유 -->\n'), /주석이 섞였다/],
+    [scope('<!--\n' + line + '-->\n'), /줄 누락/],
+    [scope('```\n' + line + '```\n'), /줄 누락/],
+    [scope(line) + '## 접근\n' + line, /절 밖/],
+    // 경계: 정본 머리가 아닌 변형 줄 단독은 필드가 아니므로 누락이다(의미 판독은 사전 reviewer 몫, D3).
+    [scope('* 구현 후 reviewer: 필요 — 이유\n'), /줄 누락/],
+    // 원문 줄 동일성(상위 검토 슬롯 2): 주석 제거로만 생긴 머리는 세지 않고, 줄 안 주석은 형식 문제다.
+    [scope('<!-- 예시 -->- 구현 후 reviewer: 생략 — 문구만\n'), /줄 누락/],
+    [scope('- 구현 후 revi<!-- 예시 -->ewer: 생략 — 문구만\n'), /줄 누락/],
+    [scope('- 구현 후 reviewer: 생<!-- 설명 -->략 — 이유\n'), /주석이 섞였다/],
+    [scope('- 구현 후 reviewer: 필요 — <!-- 이유 -->\n'), /주석이 섞였다/],
+  ] as const) {
+    const found = issues(text);
+    assert.match(found.line.join(), expected, text);
+    assert.deepEqual(found.gate, found.line, text);
+  }
+  for (const text of [scope(line), scope('- 구현 후 reviewer: 생략 — 문구만 바뀐다\n'), scope('- 구현 후 reviewer:필요-이유\n'),
+    scope(line).replaceAll('\n', '\r\n'),
+    // 경계: 정본 줄과 변형 줄이 함께 있으면 변형은 필드로 보지 않는다(상충은 사전 reviewer가 본다).
+    scope(line + '1. 구현 후 reviewer: 생략 — 문구만\n'),
+    // 정본 줄과 주석 제거로만 머리가 생기는 줄: 허위 중복이 아니다(R4 b).
+    scope(line + '<!-- 예시 -->- 구현 후 reviewer: 생략 — 문구만\n')]) {
+    assert.deepEqual(issues(text), { line: [], gate: [] }, text);
+  }
+  // legacy TASK는 줄이 없어도 문제 없다.
+  assert.deepEqual(issues('## 목적\n옛 TASK\n## 증명 범위\n- 판정 주체: 자동 테스트\n'), { line: [], gate: [] });
+  // 증명 범위 구조가 깨지면 기존 구조 문제만 낸다.
+  for (const text of [marker + '## 목적\n없음\n', marker + '## 증명 범위\n' + line, marker + '## 증명 범위\n<!-- 빈 절 -->\n## 기준\n']) {
+    assert.deepEqual(reviewerLineIssues(text), []);
+    assert.deepEqual(reviewIssues(dir, text), proofScopeIssues(text));
+    assert.ok(proofScopeIssues(text).length);
+  }
+});
+
 test('사전 검토 해시는 CRLF만 정규화하고 기존 LF 기록·기록 명령과 일치한다', () => {
   const dir = tempDir('pace-review-eol-');
   const task = '# 태스크\n- 상태: 진행\n- 사전 검토: v1\n\n## 목적\n기준\n';
diff --git a/test/project-harness.test.ts b/test/project-harness.test.ts
index dc7d5f8..6639702 100644
--- a/test/project-harness.test.ts
+++ b/test/project-harness.test.ts
@@ -598,7 +598,7 @@ test("check: 템플릿 주석이 남아도 통과하고, 빠진 기준·판정 
 
 /** 통과하는 TASK-CLOSE를 쓴다(기준 T-1 하나). */
 function passTask(taskDir: string): void {
-  writeFileSync(join(taskDir, "TASK.md"), readFileSync(join(taskDir, "TASK.md"), "utf8").replace(/\| T-1 \| <!--.*?--> \|/, "| T-1 | 된다 |").replace(/- 판정 주체: <!--[^\n]*-->/, '- 판정 주체: 자동 테스트'));
+  writeFileSync(join(taskDir, "TASK.md"), readFileSync(join(taskDir, "TASK.md"), "utf8").replace(/\| T-1 \| <!--.*?--> \|/, "| T-1 | 된다 |").replace(/- 판정 주체: <!--[^\n]*-->/, '- 판정 주체: 자동 테스트').replace(/- 구현 후 reviewer: [^\n]*/, '- 구현 후 reviewer: 필요 — 시험 고정본'));
   write(
     join(taskDir, "TASK-CLOSE.md"),
     "# 마감\n\n- 태스크: [TASK.md](TASK.md) · 판정: 통과\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| T-1 | 통과 | S-1 |\n\n## 단위 테스트\n\n통과 1\n\n## E2E\n\n해당 없음\n\n## 리뷰\n\nblocking 0\n\n## 남긴 것\n\n없음\n",
@@ -699,7 +699,7 @@ function permissionFixture() {
   const dir = join(project, "tasks", "T01_허가");
   passTask(dir);
   const target = join(dir, "TASK.md");
-  const snapshot = "# 허가\n- 상태: 진행\n- 사전 검토: v1\n- TASK 형식: v2\n\n## 목적\n목적 고정\n\n## 증명 범위\n- 판정 주체: 독립 점검\n\n## 기준\n\n| # | 기준 |\n|---|---|\n| T-1 | 결과 |\n\n## 접근\n먼저 문구 A\n통과 근거\n나중 문구 B\n후속 문구 C\n";
+  const snapshot = "# 허가\n- 상태: 진행\n- 사전 검토: v1\n- TASK 형식: v2\n\n## 목적\n목적 고정\n\n## 증명 범위\n- 판정 주체: 독립 점검\n- 구현 후 reviewer: 필요 — 시험 고정본\n## 기준\n\n| # | 기준 |\n|---|---|\n| T-1 | 결과 |\n\n## 접근\n먼저 문구 A\n통과 근거\n나중 문구 B\n후속 문구 C\n";
   write(target, snapshot);
   const base = git(wt, "rev-parse", "HEAD");
   const prompt = "- [필수 기준 T-1]\n```pace-review\n{\"version\":2,";
@@ -2585,7 +2585,7 @@ test('신규 태스크 사전 검토 게이트는 check와 done을 막고 기록
   assert.equal(generated.match(/^- TASK 형식: v2$/gm)?.length, 1);
   assert.ok(generated.includes('## 증명 범위'));
   assert.ok(generated.indexOf('## 증명 범위') < generated.indexOf('## 기준'));
-  writeFileSync(join(dir, 'TASK.md'), generated.replace(/- 판정 주체: [^\n]*/, '- 판정 주체: 자동 테스트'));
+  writeFileSync(join(dir, 'TASK.md'), generated.replace(/- 판정 주체: [^\n]*/, '- 판정 주체: 자동 테스트').replace(/- 구현 후 reviewer: [^\n]*/, '- 구현 후 reviewer: 필요 — 시험 고정본'));
   passTask(dir);
   const task = readFileSync(join(dir, 'TASK.md'), 'utf8');
   assert.match(task, /사전 검토: v1/);
@@ -2661,3 +2661,40 @@ test("start --launch: worktree에서 done이 백로그 현황 표를 고치고 m
   assert.match(calls(orca.log).at(-1)!, /orchestration worker-start[\s\S]*--model m2/);
   assert.match(readFileSync(wtBacklog, "utf8"), /\| 완료 \| — \| P001 \|/, "worktree 백로그를 되돌리지 않는다");
 });
+
+test('P017 T01 S-3: check와 done은 구현 후 reviewer 줄 형식 문제를 같은 문구로 보고하고, 줄을 넣으면 그 문제가 없다', async () => {
+  const { reviewHash } = await import('../src/project/pre-review.ts');
+  const { home, main } = repoFixture();
+  assert.equal(runCli(home, main, 'new', '줄 게이트').status, 0);
+  assert.equal(runCli(home, main, 'start', 'P001').status, 0);
+  const wt = join(dirname(main), 'app.wt', 'P001');
+  assert.equal(runPace(['project', 'task', 'P001', '줄'], { home, cwd: wt, timeout: 60_000 }).status, 0);
+  const dir = join(projectDir(wt), 'tasks', 'T01_줄');
+  const generated = readFileSync(join(dir, 'TASK.md'), 'utf8');
+  const valid = generated.replace(/- 판정 주체: [^\n]*/, '- 판정 주체: 자동 테스트').replace(/- 구현 후 reviewer: [^\n]*/, '- 구현 후 reviewer: 생략 — 문구만 바뀐다');
+  const missing = valid.replace(/- 구현 후 reviewer: [^\n]*\n/, '');
+  writeFileSync(join(dir, 'TASK.md'), missing);
+  passTask(dir);
+  const pass = (task: string) => {
+    write(join(dir, 'evidence', 'review.md'), '독립 검토 결과');
+    write(join(dir, 'PRE-REVIEW.json'), JSON.stringify({ version: 1, author: 'openai', attempts: [{ hash: reviewHash(task), provider: 'anthropic', cross: true, status: 'pass', blocking: 0, evidence: 'evidence/review.md', continuity: 'new' }] }));
+  };
+  pass(readFileSync(join(dir, 'TASK.md'), 'utf8'));
+  const beforeProject = readFileSync(join(projectDir(wt), 'PROJECT.md'), 'utf8');
+  const outputs = ['check', 'done'].map((name) => {
+    const result = runCli(home, wt, name, 'P001', 'T01');
+    assert.equal(result.status, 1, name);
+    return (result.stdout + result.stderr).split('\n').filter((line) => line.includes('구현 후 reviewer')).map((line) => line.trim());
+  });
+  assert.equal(outputs[0]!.length, 1, outputs.join('\n'));
+  assert.match(outputs[0]![0]!, /T01: 구현 후 reviewer: 줄 누락/);
+  assert.deepEqual(outputs[1], outputs[0]);
+  assert.equal(readFileSync(join(projectDir(wt), 'PROJECT.md'), 'utf8'), beforeProject);
+  writeFileSync(join(dir, 'TASK.md'), readFileSync(join(dir, 'TASK.md'), 'utf8').replace('- 판정 주체: 자동 테스트\n', '- 판정 주체: 자동 테스트\n- 구현 후 reviewer: 생략 — 문구만 바뀐다\n'));
+  pass(readFileSync(join(dir, 'TASK.md'), 'utf8'));
+  const check = runCli(home, wt, 'check', 'P001', 'T01');
+  assert.doesNotMatch(check.stdout + check.stderr, /구현 후 reviewer/);
+  assert.equal(check.status, 0, check.stdout + check.stderr);
+  const done = runCli(home, wt, 'done', 'P001', 'T01');
+  assert.equal(done.status, 0, done.stdout + done.stderr);
+});
diff --git a/test/project-templates.test.ts b/test/project-templates.test.ts
index 4dfe7d4..330a2de 100644
--- a/test/project-templates.test.ts
+++ b/test/project-templates.test.ts
@@ -64,3 +64,50 @@ test("표준 값으로 채우면 자리표시가 남지 않는다", () => {
 test("TASK-CLOSE는 커밋 해시를 쓰지 않는다고 안내한다 (자기 커밋 해시는 같은 커밋에 넣을 수 없음)", () => {
   assert.match(read("TASK-CLOSE.md"), /커밋 해시는 쓰지 않는다/);
 });
+
+const section = (text: string, title: string) =>
+  [...text.matchAll(/^## ([^\n]*)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].find((match) => match[1]!.trim() === title)?.[2] ?? "";
+const headings = (text: string) => [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
+const withoutComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, "");
+
+test("P017 T01 S-1: TASK 증명 범위에 구현 후 reviewer 줄과 사실 질문, 절 목록 불변", () => {
+  const text = read("TASK.md");
+  assert.deepEqual(headings(text), ["목적", "재료", "증명 범위", "기준", "테스트", "접근"]);
+  const scope = section(text, "증명 범위");
+  assert.equal([...scope.matchAll(/^- 구현 후 reviewer:/gm)].length, 1);
+  assert.equal([...text.matchAll(/^- 구현 후 reviewer:/gm)].length, 1);
+  const questions = [
+    "새로 생기거나 바뀐 진입점", "인가 판정이 바뀌나", "개인정보·비밀", "외부 전송·셸·삭제",
+    "영속 데이터를 쓰거나 지우나", "스키마·마이그레이션", "감사·변경 이력",
+    "동시 쓰기 경로", "잠금·트랜잭션 범위", "여러 단계 중간에 실패", "상태 전이나 허가 분기",
+  ];
+  for (const question of questions) assert.ok(scope.includes(question), question);
+  for (const bundle of ["경계(A)", "상태(B)", "흐름(C)"]) assert.ok(scope.includes(bundle), bundle);
+  assert.match(scope, /^- 포함: <!-- 변경 영향 경로[^\n]*기준 T-n은 이 경로로 한정한다 -->$/m);
+  assert.match(scope, /^- 범위 밖: <!--[^\n]*변경이 건드리지 않는 기존 동작은 "기존 동작 — 기존 회귀 시험"/m);
+  assert.match(scope, /^- 범위 밖: <!--[^\n]*기존 동작 — 기존 회귀 시험/m);
+  // 사실 질문은 주석 안에만 있다.
+  for (const question of questions) assert.ok(!withoutComments(scope).includes(question), question);
+  const generated = fillTemplate(text, VALUES);
+  assert.equal([...generated.matchAll(/^- 구현 후 reviewer:/gm)].length, 1);
+  assert.deepEqual(headings(generated), headings(text));
+});
+
+test("P017 T01 S-1: TASK-CLOSE 리뷰 주석에 역할별 판정·생략·회차 시각, 주석을 지우면 빈 절", () => {
+  const text = read("TASK-CLOSE.md");
+  assert.deepEqual(headings(text), ["목표 달성 판정", "기준 대조", "단위 테스트", "E2E", "리뷰", "남긴 것"]);
+  const review = section(text, "리뷰");
+  assert.equal(withoutComments(review).trim(), "");
+  const comment = /<!--([\s\S]*?)-->/.exec(review)?.[1] ?? "";
+  assert.match(comment, /^tester 판정:/m);
+  assert.match(comment, /^reviewer 판정:/m);
+  assert.match(comment, /reviewer 생략 — 이유/);
+  const header = /^\| 역할 \| 회차 \| 요청 시각 \| 회수 시각 \| 판정 \|$/m;
+  assert.match(comment, header);
+  assert.match(comment, /요청 시각=PM 검증 요청/);
+  assert.match(comment, /회수 시각=판정 결과 수신/);
+  assert.match(comment, /배정 시작 회신·검토 등록 시각이 아니다/);
+  for (const role of ["tester", "reviewer"]) {
+    assert.match(comment, new RegExp(`^\\| ${role} \\| 1 \\| \\| \\| \\|$`, "m"), role);
+  }
+});
```
