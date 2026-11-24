import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { loadTeamMember, safeTeamPath } from "./store.ts";
import { actor, instructionDigest, plan, proposalDigest, sourceRef, stable, type HandoffPlan, type HandoffRecord } from "./handoff-model.ts";
import { digest, fields, hashValue, HandoffError, identifier, object, regularBytes, shortText, strictJson, utf8 } from "../project/handoff-files.ts";
import type { PrivateHandoffBodies } from "../project/handoff-private.ts";

export interface StateContext { root: string; projectDir: string; bodies: PrivateHandoffBodies; live: boolean }
const fail = (message: string): never => { throw new HandoffError(message); };
export function referenced(rows: HandoffRecord[], id: unknown, kind?: HandoffRecord["kind"]): HandoffRecord {
  const row = rows.find((r) => r.id === id);
  if (!row || kind && row.kind !== kind) return fail("소통 참조 ID/종류 불일치");
  return row;
}
export function requireBodies(ctx: StateContext, rows: HandoffRecord[], row: HandoffRecord, seen = new Set<string>()): void {
  if (seen.has(row.id)) return; seen.add(row.id);
  if (!ctx.bodies.read(row.bodyHash)) fail("로컬 본문 없음: 실행/발송/종결 대조 보류");
  for (const key of ["of", "re", "result"]) if (row.data[key]) requireBodies(ctx, rows, referenced(rows, row.data[key]), seen);
  const basis = row.data.basis;
  if (object(basis)) {
    if (basis.kind === "input" || basis.kind === "approved") requireBodies(ctx, rows, referenced(rows, basis.ref), seen);
    if (basis.kind === "approved") requireBodies(ctx, rows, referenced(rows, basis.approval), seen);
  }
  if (row.data.policySnapshotHash && (typeof row.data.policySnapshotHash !== "string" || !ctx.bodies.read(row.data.policySnapshotHash))) fail("로컬 계획 계약 사본 없음: 대조 보류");
  if (row.data.payloadHash && (typeof row.data.payloadHash !== "string" || !ctx.bodies.read(row.data.payloadHash))) fail("로컬 전송 payload 없음: 대조 보류");
}
function samePlan(a: unknown, b: unknown): boolean { return stable(plan(a)) === stable(plan(b)); }
export function policy(ctx: StateContext, locator: unknown, expected: HandoffPlan, bodyHash: string, snapshotHash?: unknown): { author: string; hash: string; id: string } {
  fields(locator, ["ref", "hash", "planId"]);
  if (typeof locator.ref !== "string" || !hashValue(locator.hash) || !identifier(locator.planId)) fail("계획 계약 참조 오류");
  if (locator.ref !== `${ctx.projectDir}/handoff-plans.json`) fail("계획 계약은 해당 프로젝트 handoff-plans.json이어야 한다");
  const bytes = regularBytes(safeTeamPath(ctx.root, locator.ref as string), 16384);
  if (digest(bytes) !== locator.hash) {
    // A later unrelated plan may be added. The selected plan and declaring actor must remain identical.
    if (snapshotHash !== locator.hash) fail("계획 계약 지문 변경");
    const oldBytes = ctx.bodies.read(snapshotHash as string); if (!oldBytes) fail("등록 시 계획 사본 없음");
    const previous = strictJson(utf8(oldBytes!)), current = strictJson(utf8(bytes));
    fields(previous, ["version", "declaredBy", "plans"]); fields(current, ["version", "declaredBy", "plans"]);
    if (current.declaredBy !== previous.declaredBy || !Array.isArray(previous.plans) || !Array.isArray(current.plans)) fail("계획 계약 작성자/구조 변경");
    const oldPlan = (previous.plans as unknown[]).map(plan).find((p) => p.id === locator.planId), currentPlan = (current.plans as unknown[]).map(plan).find((p) => p.id === locator.planId);
    if (!oldPlan || !currentPlan || !samePlan(oldPlan, currentPlan)) fail("선택한 계획 계약 변경");
  }
  const doc = strictJson(utf8(bytes)); fields(doc, ["version", "declaredBy", "plans"]);
  if (doc.version !== 1 || !actor(doc.declaredBy) || !Array.isArray(doc.plans) || doc.plans.length > 32) fail("계획 계약 형식 오류");
  const plans = (doc.plans as unknown[]).map(plan), ids = plans.map((p) => p.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) fail("계획 계약 ID 중복/누락");
  const selected = plans.find((p) => p.id === locator.planId);
  if (!selected || !samePlan(selected, expected) || selected.instructionHash !== bodyHash) fail("계획 계약의 지시/수신자/판정자/증명 범위 불일치");
  if (digest(bytes) === locator.hash) ctx.bodies.capture(bytes);
  return { author: doc.declaredBy as string, hash: locator.hash as string, id: locator.planId as string };
}
export function ready(rows: HandoffRecord[], delegate: HandoffRecord): boolean {
  const checks = rows.filter((r) => r.kind === "scope_check" && r.data.re === delegate.id);
  return checks.at(-1)?.data.status === "within";
}
export function evidence(ctx: StateContext, value: unknown, live = ctx.live): void {
  if (!Array.isArray(value) || value.length > 32) fail("증거 목록 형식 오류");
  for (const item of value as unknown[]) {
    fields(item, ["path", "hash"]);
    if (typeof item.path !== "string" || !hashValue(item.hash) || isAbsolute(item.path) || item.path.includes("\\") || item.path.split("/").some((part) => !part || [".", "..", ".git"].includes(part))) fail("증거 경로/지문 오류");
    if (live && digest(regularBytes(safeTeamPath(ctx.root, item.path as string), 16 * 1024 * 1024)) !== item.hash) fail("실제 증거 지문 불일치");
  }
}
/** Replay validates structural provenance; live registration additionally reads current policy/evidence. */
export function validateTransition(ctx: StateContext, rows: HandoffRecord[], row: HandoffRecord): void {
  if (ctx.live) for (const who of [row.from, row.to]) if (who.startsWith("agent:")) loadTeamMember(ctx.root, who.slice(6));
  const d = row.data;
  const ref = (kind?: HandoffRecord["kind"]) => referenced(rows, d.re, kind);
  const hasRequest = () => { if (!row.requestId) fail("결정 요청 requestId 누락"); };
  switch (row.kind) {
    case "captain_input":
      fields(d, ["sourceRef"]); if (!sourceRef(d.sourceRef)) fail("캡틴 원문 출처 누락"); break;
    case "decision_request": {
      fields(d, ["interpretation", "of", "plan", "relayOf"], ["interpretation"]); hasRequest();
      if (typeof d.interpretation !== "boolean") fail("해석 여부 오류");
      if (d.interpretation || d.of) referenced(rows, d.of, "captain_input");
      if (d.plan && plan(d.plan).instructionHash !== row.bodyHash) fail("제안 계획 지시 지문 불일치");
      if (d.relayOf) {
        const original = referenced(rows, d.relayOf, "decision_request");
        if (original.requestId !== row.requestId || original.bodyHash !== row.bodyHash || stable(original.data.plan) !== stable(d.plan) || original.data.of !== d.of) fail("중계가 요청/원문/제안 계획을 바꿨다");
      } else if (rows.some((r) => r.kind === "decision_request" && r.requestId === row.requestId)) fail("같은 요청의 중계 참조 누락");
      break;
    }
    case "decision_reply": {
      fields(d, ["re", "decision", "proposalHash", "sourceRef"]); const proposal = ref("decision_request");
      if (row.from !== "captain" || row.requestId !== proposal.requestId || !sourceRef(d.sourceRef) || !["approve", "correct", "reject"].includes(d.decision as string) || d.proposalHash !== proposalDigest(proposal)) fail("캡틴 답 주체/출처/특정 제안 지문 오류");
      break;
    }
    case "delegate": {
      fields(d, ["basis", "plan", "policyAuthor", "policySnapshotHash", "policyPlanId"], ["basis", "plan"]);
      const expected = plan(d.plan);
      if (expected.assignee !== row.to || expected.instructionHash !== row.bodyHash || expected.task !== row.task) fail("위임의 본문/수신자/태스크와 계획 불일치");
      if (!object(d.basis)) fail("위임 승인 근거 누락");
      const basis = d.basis as Record<string, unknown>;
      let locator: unknown;
      if (basis.kind === "approved") {
        fields(basis, ["kind", "ref", "approval", "hash"]);
        if (rows.some((r) => r.kind === "delegate" && r.id !== row.id && object(r.data.basis) && r.data.basis.kind === "approved" && r.data.basis.ref === basis.ref)) fail("같은 승인 제안을 다른 위임 ID로 중복 실행하지 않는다");
        const proposal = referenced(rows, basis.ref, "decision_request"), reply = referenced(rows, basis.approval, "decision_reply");
        if (reply.data.re !== proposal.id || reply.data.decision !== "approve" || basis.hash !== proposalDigest(proposal) || proposal.bodyHash !== row.bodyHash || !samePlan(proposal.data.plan, expected)) fail("승인 없는/다른/변조한 제안을 위임할 수 없다");
        const replies = rows.filter((r) => r.kind === "decision_reply" && r.data.re === proposal.id);
        if (replies.at(-1)?.id !== reply.id) fail("이후 정정/거절된 승인은 사용할 수 없다");
      } else if (basis.kind === "input") {
        fields(basis, ["kind", "ref", "hash", "policy"]);
        fields(basis.policy, ["ref", "hash", "planId"]);
        const original = referenced(rows, basis.ref, "captain_input");
        if (original.bodyHash !== basis.hash || original.bodyHash !== row.bodyHash) fail("원문 근거의 지시 본문 변경");
        locator = basis.policy;
      } else if (basis.kind === "contract") { fields(basis, ["kind", "ref", "hash", "planId"]); locator = { ref: basis.ref, hash: basis.hash, planId: basis.planId }; }
      else fail("delegate는 input/contract/approved 근거가 필요하다");
      if (locator) {
        if (ctx.live) {
          const checked = policy(ctx, locator, expected, row.bodyHash, d.policySnapshotHash);
          d.policyAuthor = checked.author; d.policySnapshotHash = checked.hash; d.policyPlanId = checked.id;
        } else if (!actor(d.policyAuthor) || !hashValue(d.policySnapshotHash) || !identifier(d.policyPlanId)) fail("계획 계약 보존 metadata 누락");
      } else if (d.policyAuthor !== undefined || d.policySnapshotHash !== undefined || d.policyPlanId !== undefined) fail("승인 제안에 다른 계약 metadata를 붙일 수 없다");
      break;
    }
    case "scope_check": {
      fields(d, ["re", "status", "basisHash", "checks"]); const delegate = ref("delegate");
      if (rows.some((r) => r.kind === "close" && r.data.re === delegate.id)) fail("종결된 위임의 범위를 다시 열 수 없다");
      fields(d.checks, ["instruction", "decisionOwner", "proofScope"]);
      if (row.from !== delegate.to || row.to !== delegate.from || !["within", "hold"].includes(d.status as string) || d.basisHash !== instructionDigest(delegate) || Object.values(d.checks).some((v) => typeof v !== "boolean") || d.status === "within" && Object.values(d.checks).some((v) => v !== true)) fail("수신자 범위 대조/판정 불일치");
      if (ctx.live) requireBodies(ctx, rows, delegate);
      break;
    }
    case "result": {
      fields(d, ["re", "status", "evidence"]); const delegate = ref("delegate");
      if (rows.some((r) => r.kind === "close" && r.data.re === delegate.id)) fail("종결된 위임에 결과를 추가할 수 없다");
      if (row.from !== delegate.to || row.to !== delegate.from || !["done", "partial", "blocked"].includes(d.status as string)) fail("위임 수신자의 결과만 허용한다");
      evidence(ctx, d.evidence);
      if (d.status === "done" && (!ready(rows, delegate) || !(d.evidence as unknown[]).length)) fail("범위 확인과 실제 증거 없는 done 결과");
      if (ctx.live && d.status === "done") { requireBodies(ctx, rows, delegate); validateTransition(ctx, rows, structuredClone(delegate)); }
      break;
    }
    case "close": {
      fields(d, ["re", "result", "proofScope", "checked"]); const delegate = ref("delegate"), result = referenced(rows, d.result, "result"), expected = plan(delegate.data.plan);
      const latestResult = rows.filter((r) => r.kind === "result" && r.data.re === delegate.id).at(-1);
      if (rows.some((r) => r.kind === "close" && r.data.re === delegate.id) || row.from !== expected.decisionOwner || row.to !== delegate.from || d.proofScope !== expected.proofScope || d.checked !== true || result.data.re !== delegate.id || result.data.status !== "done" || latestResult?.id !== result.id) fail("지정 판정자/증명 범위/현재 완료 결과 종결 조건 불일치");
      if (ctx.live) { requireBodies(ctx, rows, result); evidence(ctx, result.data.evidence); validateTransition(ctx, rows, structuredClone(delegate)); if (!ready(rows, delegate)) fail("현재 수신자 범위가 hold인 위임을 닫을 수 없다"); }
      break;
    }
    case "status": fields(d, ["re", "sourceRef"], []); if (d.re) ref(); if (d.sourceRef && !sourceRef(d.sourceRef)) fail("상태 출처 오류"); break;
    case "delivery": {
      fields(d, ["re", "attemptId", "phase", "transport", "routeActor", "target", "sourceRef", "reportedBy", "responseHash", "responseId", "payloadHash"], ["re", "attemptId", "phase", "transport", "routeActor", "target", "sourceRef"]);
      const message = ref();
      if (message.kind === "delivery" || message.kind === "resource_event" || !identifier(d.attemptId) || !["started", "sent", "failed", "unconfirmed"].includes(d.phase as string) || !["orca", "external"].includes(d.transport as string) || !actor(d.routeActor) || !sourceRef(d.sourceRef) || typeof d.target !== "string") fail("전송 사건 형식 오류");
      if (d.transport === "orca" && d.routeActor === "captain") fail("Orca 에이전트 수신자를 캡틴 경로라고 기록할 수 없다");
      const prior = rows.filter((r) => r.kind === "delivery" && r.data.attemptId === d.attemptId);
      if (d.phase === "started") {
        if (!hashValue(d.payloadHash)) fail("전송 payload 지문 누락");
        if (prior.length || rows.some((r) => r.kind === "delivery" && r.data.re === message.id && r.data.phase !== "failed" && !rows.some((end) => end.kind === "delivery" && end.data.attemptId === r.data.attemptId && end.data.phase === "failed"))) fail("이미 시작/성공/불명인 메시지의 중복 발송 보류");
      } else {
        const start = prior[0];
        const laterConfirmation = d.transport === "external" && prior.length === 2 && prior[1]?.data.phase === "unconfirmed" && ["sent", "failed"].includes(d.phase as string);
        if (!start || prior.length !== 1 && !laterConfirmation || start.data.phase !== "started" || ["re", "transport", "routeActor", "target", "sourceRef"].some((key) => start.data[key] !== d[key])) fail("선기록 전송 시도/실제 경로와 영수증 불일치");
        if (d.phase === "sent" && (!hashValue(d.responseHash) || !shortText(d.responseId, 240) || !actor(d.reportedBy))) fail("성공 응답/보고자 없는 영수증");
      }
      break;
    }
    case "resource_event":
      fields(d, ["transitionId", "action", "appliedAt", "resource", "holder", "stateHash", "acquisitionId", "previousAcquisitionId"], ["transitionId", "action", "appliedAt", "resource", "holder", "stateHash", "acquisitionId"]);
      if (!identifier(d.transitionId) || !["acquire", "release", "reclaim"].includes(d.action as string) || !Number.isSafeInteger(d.appliedAt) || (d.appliedAt as number) < 0 || !identifier(d.resource) || !hashValue(d.stateHash) || typeof d.acquisitionId !== "string") fail("실제 자원 사건 형식 오류");
      break;
  }
}
