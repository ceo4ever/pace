import { stable, type HandoffRecord } from "../team/handoff-model.ts";
import { hasTeamContract } from "./team-contract.ts";
export { teamMarker } from "./team-contract.ts";
import { inputHash, InputSnapshot, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Repo, ProjectRef } from "./harness.ts";
import type { FullStats, TokenOptions } from "./tokens.ts";
import { completeReviewEvent, readEvents, type ProjectEvent } from "./event-log.ts";
import { gateFailureReasons } from "./metrics.ts";
import { collectHandoffs, ownerReplyAfterProposal, unlinkedRequestEvent, type DeliveryClaim, type HandoffReport } from "./handoff-report.ts";
import { observeHandoffLedger } from "./handoff-store.ts";
import { fields, HandoffError } from "./handoff-files.ts";
import { validTeamName } from "../team/model.ts";
import { loadTeam, safeTeamPath } from "../team/store.ts";
import { readCompletionProof, readRequestCoverageProof, readRequestSupportingReceipts, portableRequestInputHash, representativeProofBinding, representativeScopeUnconfirmed, metadataJson, observationCovered, receiptPurpose, canonicalTeamLogRef, TeamReceiptReads, MANUAL_KEYS, readTeamInput, readTeamEvents, requestCovered, scopeConfirmed, scopeObserved, scopedRequestCovered, type ComparisonContext, type Coverage, type ManualKey, type PortableRequestCoverageProof, type TeamInput, type TeamPeriod } from "./team-input.ts";

export interface Measure { observed: number | null; total: number | null; coverage: "uncollected" | "reported-partial" | "reported-complete"; refs: string[] }
export interface MeasurementSnapshot {
  version: 1; measurementKind: "stats-reported-v1"; repository: string; condition: string | null; observed_at: string; period: TeamPeriod; comparison: ComparisonContext;
  completionProofSha256?: string;
  requestCoverage?: PortableRequestCoverageProof;
  deliveryClaims?: DeliveryClaim[];
  counts: Record<string, number | null>; observed_counts: Record<string, number | null>; unknown: { request_events: number; recipient_events: number; manual_fields: number }; limits: string[];
}
export interface TeamMetrics {
  version: 1; period: TeamPeriod;
  requestCoverageInputHash?: string | null;
  requests: { linked: number; crossBoundaryObserved: number; attributionUnconfirmed: number; ownerReply: number; ownerDelivery: number; reached: number; reachedTotal: number | null; failedOnly: number; unconfirmed: number; comparisonUnconfirmed: number; legacyUnlinkedEvents: number; ownerIntendedRequests: number; coordinatorIntendedRequests: number; ownerQuestionEvents: number; coordinatorQuestionEvents: number; recipientUnknownEvents: number; failedAttemptsObserved: number | null; coordinatorOwnAnswerObserved: number | null; coordinatorOwnAnswerTotal: null };
  ownerInterventionTotal: null;
  manual: { roleCorrections: Measure; fileEdits: Measure; commandRuns: Measure; extraInstructions: Measure };
  normal: { roleAssignments: Measure; approvals: Measure; mergeApprovals: Measure; deployApprovals: Measure; scopeApprovals: Measure };
  quality: { blockingLogged: number | null; shouldFixLogged: number | null; blockingAudited: number | null; rereviewsAudited: number | null; loggedReviewFailures: number | null; gateFailures: number | null };
  roles: { name: string; workMs: number | null; outputTokens: { tool: string; output: number | null }[]; source: "reported-role-binding" | "unconfirmed"; refs: string[] }[];
  workerContext: { workMs: number | null; outputs: { tool: string; output: number | null }[]; attribution: "cwd-window-proxy-not-role" };
  unusedRoleCandidates: { role: string; coverage: "unconfirmed"; reason: string }[];
  requiredRoleNonParticipation?: { role: string; status: "condition-not-triggered" | "unconfirmed" | "unused"; refs: string[] }[];
  handoffs: { kinds: Record<string, number>; agents: Record<string, Record<string, number>>; open: string[] };
  snapshot: MeasurementSnapshot; warnings: string[];
}
function requiredRolePolicies(root: string, inputs?: InputTrace): Map<string, boolean> {
  let path: string;
  try {
    path = safeTeamPath(root, ".pace/team/required-roles.json");
  } catch {
    throw new HandoffError("필수 역할 표지의 경로·링크 오류");
  }
  let value: unknown;
  try {
    value = metadataJson(path, 32768, inputs);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    inputs?.absent?.(path);
    return new Map();
  }

  fields(value, ["version", "roles"]);
  if (value.version !== 1 || !Array.isArray(value.roles)) throw new HandoffError("필수 역할 표지 버전·역할 목록 오류");
  const policies = new Map<string, boolean>();
  for (const policy of value.roles as unknown[]) {
    fields(policy, ["role", "scope", "conditional"]);
    if (typeof policy.role !== "string" || !validTeamName(policy.role) || policies.has(policy.role) ||
        (policy.scope !== "hub" && policy.scope !== "worktree") || typeof policy.conditional !== "boolean") {
      throw new HandoffError("필수 역할 표지의 이름·중복·호출 위치·조건부 여부 오류");
    }
    policies.set(policy.role, policy.scope === "hub" || policy.conditional);
  }
  return policies;
}

function classifyRequiredRoleNonParticipation(
  roles: string[], dir: string, period: TeamPeriod, events: readonly ProjectEvent[],
  receipts: TeamReceiptReads, inputs?: InputTrace,
): NonNullable<TeamMetrics["requiredRoleNonParticipation"]> {
  if (!roles.length) return [];
  const observations = new Map(roles.map((role) => [role, {
    statuses: new Set<"condition-not-triggered" | "unused">(),
    refs: new Set<string>(),
  }]));
  for (const event of events) {
    if (event.type !== "note" || event.src !== "team-role-nonparticipation" || !event.ref) continue;
    const receipt = receipts.read(dir, event.ref, inputs);
    if (!receipt) continue;
    const match = /^role-observation:([^:]+):(condition-not-triggered|none):/.exec(receipt.evidence.sourceRef as string);
    if (!match) continue;
    const role = match[1]!;
    const kind = match[2] === "none" ? "none" : "condition-not-triggered";
    const observation = observations.get(role);
    if (!observation || !observationCovered(dir, event.ref, period, role, kind, inputs, receipts)) continue;
    observation.statuses.add(kind === "none" ? "unused" : kind);
    observation.refs.add(event.ref);
  }
  return [...observations].map(([role, { statuses, refs }]) => ({
    role,
    status: statuses.size === 1 ? [...statuses][0]! : "unconfirmed",
    refs: [...refs].sort(),
  }));
}

function sumReviewed(rows: readonly ProjectEvent[], key: "blocking" | "should_fix", complete: boolean): number | null {
  if (!complete) return null;
  let total = 0;
  for (const event of rows) {
    total += event.data![key]!;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}
function completeGateEvent(event: ProjectEvent): boolean {
  const keys = Object.keys(event.data ?? {}), cmd = keys[0];
  if (keys.length !== 1 || !cmd || !["check", "done", "finish"].includes(cmd) || event.data?.[cmd] !== 1) return false;
  if (event.ok === true) return event.msg === cmd;
  return event.ok === false && gateFailureReasons.some((reason) => event.msg === `${cmd}: ${reason}`);
}
function periodFor(stats: FullStats, input: TeamInput | null, now: string, warnings: string[], events: readonly ProjectEvent[]): TeamPeriod {
  const unit = input?.comparison?.unit ?? input?.period?.unit ?? "project-start-to-merge";
  const nativeTimes = (type: "start" | "merge") => events.filter((e) => e.type === type && e.by === "cli" && e.ok === true && Date.parse(e.ts) <= Date.parse(now)).map((e) => e.ts).sort((a, b) => Date.parse(a) - Date.parse(b));
  const nativeStart = nativeTimes("start")[0] ?? null, terminal = unit === "project-start-to-merge" ? nativeTimes("merge").at(-1) ?? null : stats.project.finish;
  const start = unit === "project-start-to-merge" ? nativeStart : stats.project.start;
  if (start && terminal && Date.parse(terminal) < Date.parse(start)) throw new HandoffError("팀 성공 종료 사건이 시작보다 앞선다");
  if (!input?.period) return { start, end: terminal ?? now, unit, closed: unit === "project-start-to-merge" && !!terminal && !!start };
  const p = { ...input.period };
  if (p.unit !== unit || Date.parse(p.end) > Date.parse(now) || p.start && start && Date.parse(p.start) < Date.parse(start) || terminal && Date.parse(p.end) > Date.parse(terminal)) throw new HandoffError("팀 측정 선언 구간이 프로젝트/조회 범위를 벗어난다");
  if (unit === "project-start-to-merge") {
    if (start && p.start && Date.parse(p.start) !== Date.parse(start)) throw new HandoffError("프로젝트 start→merge 비교 구간 불일치");
    p.start = start ?? p.start; p.end = terminal ?? now; p.closed = !!terminal && !!start;
    if (!terminal || !start) { p.closed = false; warnings.push("실제 성공 start/merge 사건 없음: 프로젝트 전체 범위 미완료"); }
  }
  return p;
}
function measure(receipts: TeamReceiptReads, input: TeamInput | null, key: ManualKey, period: TeamPeriod, dir: string, scopeBound: boolean, inputs?: InputTrace): Measure {
  const proposed = input?.counts?.[key] ?? null, values = input?.observed_counts;
  const observed = values && Object.hasOwn(values, key) ? values[key] ?? null : proposed;
  if (proposed !== null && observed !== null && observed > proposed) throw new HandoffError("관측 하한이 신고 총량보다 크다");
  const proof = input?.coverage?.[key], total = scopeBound && period.closed && scopeConfirmed(receipts, dir, proof, period, key, inputs) ? proposed : null;
  return { observed, total, coverage: total !== null ? "reported-complete" : observed !== null ? "reported-partial" : "uncollected", refs: proof?.refs ?? [] };
}
export interface TeamCollection { metrics: TeamMetrics; adopted: boolean; handoffs?: HandoffReport }
export function collectTeamMetrics(repo: Repo, ref: ProjectRef, stats: FullStats, options: TokenOptions = {}, inputs?: InputTrace): TeamCollection | undefined {
  const projectDir = `projects/${ref.dir}`, dir = join(repo.root, projectDir), legacyEvents = readEvents(dir, inputs).filter((e) => e.p === ref.id);
  const projectBytes = readFileSync(join(dir, "PROJECT.md")), project = projectBytes.toString("utf8");
  const receipts = new TeamReceiptReads();
  const input = readTeamInput(repo.root, projectDir, inputs, receipts), ledgerSnapshot = observeHandoffLedger(repo.root, ref.id, projectDir, inputs);
  const adopted = hasTeamContract(ref.id, project, input !== null, legacyEvents);
  if (!adopted && !ledgerSnapshot.present && !legacyEvents.some((e) => e.role || e.to || e.requestId)) return undefined;
  safeTeamPath(repo.root, `${projectDir}/PROJECT.md`);
  inputs?.record(join(dir, "PROJECT.md"), inputHash(projectBytes));
  const logEvents = adopted ? readTeamEvents(dir, ref.id, inputs) : legacyEvents, events = (logEvents ?? []).filter((e) => e.p === ref.id);
  const now = options.now ?? new Date().toISOString(), warnings: string[] = [];
  if (logEvents === null) warnings.push("사건 로그 미수집: 도달/로그 품질 총량을 확정하지 않는다");
  const period = periodFor(stats, input, now, warnings, events);
  const completionInputs = new InputSnapshot();
  const completion = readCompletionProof(receipts, dir, period, completionInputs);
  completionInputs.include(inputs);
  if (period.unit === "representative-task" && period.closed && !completion) {
    period.closed = false;
    warnings.push("완료 영수증과 대표 업무 구간 불일치/결합 미확인");
  }
  const low = period.start ? Date.parse(period.start) : -Infinity, high = Date.parse(period.end);
  const inside = (at: string) => Date.parse(at) >= low && Date.parse(at) <= high;
  const scopedEvents = events.filter((e) => inside(e.ts));
  const { rows } = ledgerSnapshot;
  const requestProofs = new InputSnapshot();
  const verifiedLogTasks = new Map<ProjectEvent, string | undefined>();
  const requestMirrorEvidence = (event: ProjectEvent, proposals: readonly HandoffRecord[]): boolean => {
    if (!event.ref) return false;
    try {
      const proof = new InputSnapshot(), receipt = receipts.require(dir, canonicalTeamLogRef(event.ref), proof).evidence;
      const proposal = proposals.find((r) => receipt.sourceRef === `handoff:${r.id}`);
      if (!proposal || receipt.requestId !== proposal.requestId || receipt.hash !== proposal.bodyHash ||
          receipt.decisionReplyId !== undefined || (event.t !== undefined && event.t !== proposal.task) ||
          Date.parse(event.ts) < Date.parse(proposal.at)) return false;
      const range = receipt.period as { start: string; end: string; unit: string } | undefined;
      if (range && (range.unit !== period.unit || Date.parse(event.ts) < Date.parse(range.start) || Date.parse(event.ts) > Date.parse(range.end))) return false;
      proof.include(inputs);
      proof.include(requestProofs);
      verifiedLogTasks.set(event, proposal.task);
      return true;
    } catch (error) { if (error instanceof InputSnapshotError) throw error; return false; }
  };
  const deliveryClaims: DeliveryClaim[] = [];
  const handoff = collectHandoffs(repo.root, ref.id, projectDir, { start: period.start, end: period.end, eventSnapshot: events, ledgerSnapshot, inputs, ...(adopted ? { requestMirrorEvidence, deliveryClaims } : {}), ownerAnswerEvidence: (e, requestAt, proposals) => {
    try {
      if (!e.requestId || !e.ref) return false;
      const proof = new InputSnapshot(), receipt = receipts.require(dir, canonicalTeamLogRef(e.ref), proof).evidence;
      if (!receiptPurpose(receipt, "owner-answer", e.requestId)) return false;
      const receiptPeriod = receipt.period as { start: string; end: string; unit: string } | undefined;
      if (receiptPeriod && (Date.parse(e.ts) < Date.parse(receiptPeriod.start) || Date.parse(e.ts) > Date.parse(receiptPeriod.end) || receiptPeriod.unit !== period.unit)) return false;
      const reply = receipt.decisionReplyId ? rows.find((r) => r.id === receipt.decisionReplyId && r.requestId === e.requestId && ownerReplyAfterProposal(r, proposals, requestAt, e.t) && inside(r.at) && Date.parse(r.at) <= Date.parse(e.ts)) : undefined;
      if (receipt.decisionReplyId && !reply) return false;
      return {
        kind: receipt.decisionReplyId ? "native-linked" : "reported",
        include() {
          proof.include(inputs);
          proof.include(requestProofs);
          if (reply) verifiedLogTasks.set(e, proposals.get(reply.data.re as string)?.task);
        },
      };
    } catch (error) { if (error instanceof InputSnapshotError) throw error; return false; }
  } });
  const ids = new Set(handoff?.requests.items.map((r) => r.requestId) ?? []), periodRows = rows.filter((r) => inside(r.at)), admitted = periodRows.filter((r) => !r.requestId || ids.has(r.requestId));
  if (handoff?.requests.items.some((r) => r.scopeConflict)) warnings.push("같은 요청 ID의 명시 태스크 범위 충돌: 총량을 미확인으로 둔다");
  const ambiguous = handoff?.requests.items.filter((r) => r.attributionUnconfirmed) ?? [];
  if (ambiguous.length) warnings.push("요청 기록의 귀속 미확인: 확인된 도달 관측은 보존하고 전체 총량과 비교 방향을 보류한다");
  if (handoff?.duplicateDeliveryRequests) warnings.push("외부 응답 증빙의 요청 간 재사용: 해당 증빙의 자동 도달을 보류한다");
  // Route tasks can differ from the original work item. Use the canonical request only where its provenance is resolved.
  const requestTasks = new Map(handoff?.requests.items.map((r) => [r.requestId, r]) ?? []);
  const logPositions = new Map(events.map((event, index) => [event, index]));
  const workScope = (id: string | undefined, task: string | undefined, at: string, openingOnly: boolean, logPosition?: number): string | undefined => {
    const request = id ? requestTasks.get(id) : undefined;
    const time = Date.parse(at);
    if (!request?.task || request.rootAt == null || time < request.rootAt) return task;
    // An earlier question can open the same request. A prior response or action remains in its original scope.
    if (!task && !openingOnly) {
      const opening = request.taskOpenedAt ?? Infinity;
      const beforeOpeningRow = time === opening && logPosition !== undefined && logPosition < (request.taskOpeningLogOrder ?? -Infinity);
      if (time < opening || beforeOpeningRow) return undefined;
    }
    if (!task || task === request.task || time >= (request.routedTaskStarts?.[task] ?? Infinity)) return request.task;
    return task;
  };
  const logScope = (event: ProjectEvent): string | undefined => {
    const mirrored = verifiedLogTasks.has(event), task = mirrored ? verifiedLogTasks.get(event) : event.t;
    if (mirrored && task === undefined) return undefined;
    const openingOnly = event.type === "question" || event.type === "escalation";
    return workScope(event.requestId, task, event.ts, openingOnly, logPositions.get(event));
  };
  const observedScopes = new Set<string | undefined>([
    ...scopedEvents.filter((e) => !["start", "finish", "merge"].includes(e.type)).map(logScope),
    ...periodRows.map((r) => workScope(r.requestId, r.task, r.at, r.kind === "decision_request")),
    // An overlapping task lifecycle is also evidence of possibly concurrent work.
    ...stats.tasks.filter((t) => t.source === "events" && t.start && Date.parse(t.start) <= high && (!t.done || Date.parse(t.done) >= low)).map((t) => t.id),
  ]);
  const scopeBound = period.unit !== "representative-task" ||
    observedScopes.size <= 1 && ambiguous.length === 0 && completion?.representativeScope === true;
  if (period.unit === "representative-task" && scopeBound) completionInputs.include(requestProofs);
  if (!scopeBound) warnings.push(`${representativeScopeUnconfirmed}: 시간창 관측은 남기고 섞이거나 귀속이 불명인 총량과 비교 방향은 보류한다`);
  const crossBoundaryObserved = handoff?.crossBoundaryRequests?.length ?? 0;
  if (crossBoundaryObserved) warnings.push("최초 요청이 구간 밖인 활동이 있어 도달 총량/부담 방향을 보류한다. 역할·시도·소통 사건 관측은 실제 구간을 따른다");
  const questions = scopedEvents.filter((e) => ["question", "escalation"].includes(e.type));
  const own = new Set<string>(), trustedOwn = new Set<string>();
  for (const answer of input?.coordinator_answers ?? []) {
    const request = handoff?.requests.items.find((r) => r.requestId === answer.requestId);
    if (request && !["owner_reply", "owner_delivery"].includes(request.reach) && request.ownerSignal === false && !request.scopeConflict && request.coordinatorAnswered && requestCovered(receipts, dir, answer.requestId, answer.coverage, inputs)) {
      own.add(answer.requestId);
      const proof = new InputSnapshot();
      if (!request.attributionUnconfirmed && scopedRequestCovered(receipts, dir, answer.requestId, answer.coverage, period, inputs, proof)) {
        trustedOwn.add(answer.requestId);
        proof.include(requestProofs);
      }
    }
  }
  // Use the same decoded rows and proof bytes as the report. Unrelated gate/review rows
  // do not change the request witness, and an absent ledger differs from an empty one.
  const requestSourceSha256 = adopted && logEvents !== null && period.closed && period.start !== null
    ? inputHash(stable({
      kind: "request-coverage-v1", project: ref.id, period: [low, high, period.unit],
      events: events.filter((event) => event.requestId || unlinkedRequestEvent(event, true)),
      ledger: ledgerSnapshot.present ? rows : null,
      scopes: period.unit === "representative-task" ? [...observedScopes].map((scope) => scope ?? "").sort() : [],
      proofs: [...requestProofs.files].map(([path, hash]) => [relative(dir, path).split(sep).join("/"), hash]).sort(),
      coordinatorOwn: [...trustedOwn].sort(),
    }))
    : null;
  const intended = (to: "owner" | "coordinator") => new Set([
    ...questions.filter((e) => e.to === to && e.requestId && ids.has(e.requestId)).map((e) => e.requestId!),
    ...admitted.filter((r) => r.kind === "decision_request" && r.to === to && r.requestId).map((r) => r.requestId!),
  ]).size;
  const requests: TeamMetrics["requests"] = {
    linked: (handoff?.requests.total ?? 0) + crossBoundaryObserved, crossBoundaryObserved, attributionUnconfirmed: ambiguous.length, ownerReply: handoff?.requests.owner_reply ?? 0, ownerDelivery: handoff?.requests.owner_delivery ?? 0,
    reachedTotal: null,
    reached: (handoff?.requests.owner_reply ?? 0) + (handoff?.requests.owner_delivery ?? 0), failedOnly: handoff?.requests.failed_only ?? 0, unconfirmed: (handoff?.requests.unconfirmed ?? 0) + crossBoundaryObserved, comparisonUnconfirmed: 0,
    legacyUnlinkedEvents: handoff?.requests.unlinkedLogEvents ?? scopedEvents.filter((e) => unlinkedRequestEvent(e, true)).length,
    ownerIntendedRequests: intended("owner"),
    coordinatorIntendedRequests: intended("coordinator"),
    ownerQuestionEvents: questions.filter((e) => e.to === "owner").length, coordinatorQuestionEvents: questions.filter((e) => e.to === "coordinator").length, recipientUnknownEvents: questions.filter((e) => !e.to).length,
    failedAttemptsObserved: ledgerSnapshot.present ? (handoff?.failedRequestAttempts ?? 0) : null,
    coordinatorOwnAnswerObserved: input?.coordinator_answers ? own.size : null, coordinatorOwnAnswerTotal: null,
  };
  const unconfirmed = requests.unconfirmed + ambiguous.filter((r) => r.reach !== "unconfirmed").length;
  const ownResolved = [...trustedOwn].filter((id) => handoff?.requests.items.some((r) => r.requestId === id && r.reach === "unconfirmed")).length;
  const canReportTotals = scopeBound && unconfirmed === ownResolved && requests.legacyUnlinkedEvents === 0;
  const observations = {
    owner_questions: requests.reached,
    coordinator_questions: requests.coordinatorIntendedRequests,
    recipient_unknown: requests.recipientUnknownEvents,
    failed_only_owner_requests: requests.failedOnly,
  };
  // Compute what the matching certificate would authorize before reading the certificate.
  const confirmedTotals = {
    owner_questions: canReportTotals ? observations.owner_questions : null,
    coordinator_questions: canReportTotals ? observations.coordinator_questions : null,
    recipient_unknown: scopeBound ? observations.recipient_unknown : null,
    failed_only_owner_requests: canReportTotals ? observations.failed_only_owner_requests : null,
  };
  const supportRefs = (input?.request_coverage?.refs ?? []).map((ref) => ({ ref }));
  const requestSupport = requestSourceSha256 ? readRequestSupportingReceipts(receipts, dir, supportRefs, period, inputs) : null;
  const requestCoverageInputHash = requestSourceSha256 && requestSupport ? portableRequestInputHash(requestSourceSha256, {
    repository: repo.mainRoot,
    comparison: input?.comparison ?? {},
    representativeProof: representativeProofBinding(period, completion),
    counts: confirmedTotals, observed: observations, deliveryClaims,
    unknownRequests: unconfirmed - ownResolved + requests.failedOnly + requests.legacyUnlinkedEvents,
  }, requestSupport) : null;
  const requestProof = readRequestCoverageProof(receipts, dir, input?.request_coverage, period, requestCoverageInputHash, inputs);
  if (adopted && input?.request_coverage?.status === "complete" && !requestProof) warnings.push("요청 수집의 입력 지문 미확인: 도달·실패 총량을 보류한다");
  const requestTotals = requestProof ? confirmedTotals : { owner_questions: null, coordinator_questions: null, recipient_unknown: null, failed_only_owner_requests: null };
  requests.comparisonUnconfirmed = unconfirmed - (requestProof ? ownResolved : 0) + requests.failedOnly;
  requests.reachedTotal = requestTotals.owner_questions;
  const measures = Object.fromEntries(MANUAL_KEYS.map((key) => [key, measure(receipts, input, key, period, dir, scopeBound, inputs)])) as Record<ManualKey, Measure>;
  const audit = input?.quality_audit, auditConfirmed = scopeBound && period.closed && scopeConfirmed(receipts, dir, audit?.coverage, period, "quality-audit", inputs);
  const auditObserved = !!audit && (auditConfirmed || scopeObserved(receipts, dir, audit.coverage, period, "quality-audit", inputs));
  const reviewRows = scopedEvents.filter((e) => e.type === "review"), gateRows = scopedEvents.filter((e) => e.type === "gate");
  const logComplete = scopeBound && logEvents !== null && period.closed && scopeConfirmed(receipts, dir, input?.log_coverage, period, "log-coverage", inputs);
  if (!logComplete) warnings.push("현재 구간의 로그 수집 완전성 미확인");
  const validReviews = reviewRows.filter(completeReviewEvent), validGates = gateRows.filter(completeGateEvent);
  const reviewsComplete = logComplete && reviewRows.length === validReviews.length;
  const gatesComplete = logComplete && gateRows.length === validGates.length;
  if (reviewRows.length !== validReviews.length) warnings.push("리뷰 수치/판정 필드 미수집: 유효 관측만 남기고 로그 품질 총량을 보류한다");
  if (gateRows.length !== validGates.length) warnings.push("게이트 기록 형식 미확인: 유효 관측만 남기고 게이트 실패 총량을 보류한다");
  const reviewsObserved = reviewsComplete || validReviews.length > 0, gatesObserved = gatesComplete || validGates.length > 0;
  const qualityObservations = {
    blocking_sum_stats_events: sumReviewed(validReviews, "blocking", reviewsObserved),
    should_fix_sum_stats_events: sumReviewed(validReviews, "should_fix", reviewsObserved),
    blocking_sum_audited: auditObserved ? audit!.blocking_sum : null,
    rereviews_after_fail: auditObserved ? audit!.rereviews_after_fail : null,
    review_failures: reviewsObserved ? validReviews.filter((e) => e.data?.fail === 1).length : null,
    gate_failures: gatesObserved ? validGates.filter((e) => e.ok === false).length : null,
  };
  const quality = {
    blockingLogged: reviewsComplete ? qualityObservations.blocking_sum_stats_events : null,
    shouldFixLogged: reviewsComplete ? qualityObservations.should_fix_sum_stats_events : null,
    blockingAudited: auditConfirmed ? qualityObservations.blocking_sum_audited : null,
    rereviewsAudited: auditConfirmed ? qualityObservations.rereviews_after_fail : null,
    loggedReviewFailures: reviewsComplete ? qualityObservations.review_failures : null,
    gateFailures: gatesComplete ? qualityObservations.gate_failures : null,
  };
  let members: ReturnType<typeof loadTeam> = [];
  try { members = loadTeam(repo.root, inputs); }
  catch (error) {
    if (adopted || error instanceof InputSnapshotError) throw error;
    warnings.push("팀 원본 관측 미확인: 기존 사건·대기·소통 집계는 유지한다");
  }
  const names = new Set([...members.map((m) => m.name), ...events.flatMap((e) => e.role ? [e.role.name] : [])]);
  for (const observation of input?.role_observations ?? []) if (!names.has(observation.role)) throw new HandoffError("역할 결합 관측의 이름이 원본/시작 기록에 없다");
  const roles: TeamMetrics["roles"] = [...names].sort().map((name) => {
    const r = input?.role_observations?.find((v) => v.role === name), hasProof = !!r && r.coverage.status !== "unknown" && r.coverage.refs.some((ref) => observationCovered(dir, ref, period, name, "activity", inputs, receipts));
    if (r && !hasProof) warnings.push(`역할 ${name}: 현재 구간에 결합된 관측 근거 미확인`);
    return { name, workMs: hasProof ? r!.workMs : null, outputTokens: hasProof ? r!.outputTokens : [], source: hasProof ? "reported-role-binding" : "unconfirmed", refs: r?.coverage.refs ?? [] };
  });
  const declared = new Set([...scopedEvents.flatMap((e) => e.role ? [e.role.name] : []), ...periodRows.flatMap((r) => [r.from, r.to].filter((a) => a.startsWith("agent:")).map((a) => a.slice(6)))]);
  for (const role of roles) if (role.source === "reported-role-binding") declared.add(role.name);
  const policies = adopted ? requiredRolePolicies(repo.root, inputs) : new Map<string, boolean>();
  const withoutParticipation = members.map((member) => member.name).filter((name) => !declared.has(name));
  const requiredRoleNonParticipation = classifyRequiredRoleNonParticipation(
    withoutParticipation.filter((name) => policies.get(name)), dir, period, scopedEvents, receipts, inputs,
  );
  const unusedRoleCandidates = withoutParticipation.filter((name) => !policies.get(name))
    .map((role) => ({ role, coverage: "unconfirmed" as const, reason: "참여/선언 기록 없음은 역할 미사용의 증명이 아니다" }));
  if (!period.start || !period.closed) warnings.push("닫힌 동일 비교 범위 미확인");
  if (handoff?.auditCoverage === "metadata-only") warnings.push("로컬 본문 없음: metadata 신고 근거만 남아 원문 재감사 불가");
  warnings.push("신고 actor/ref와 complete는 사람 인증이 아니며 실제 완전성은 현장 감사 대상", "질문·승인·손작업 열은 겹칠 수 있어 사용자 개입 총합을 내지 않는다", "cwd/구간 토큰과 작업 시간은 역할별 실제 사용량이 아니다");
  const counts: Record<string, number | null> = { ...requestTotals, failed_owner_delivery_attempts: null, coordinator_answers: null, blocking_sum_stats_events: quality.blockingLogged, should_fix_sum_stats_events: quality.shouldFixLogged, blocking_sum_audited: quality.blockingAudited, rereviews_after_fail: quality.rereviewsAudited, review_failures: quality.loggedReviewFailures, gate_failures: quality.gateFailures };
  const observed_counts: Record<string, number | null> = { ...observations, ...qualityObservations, failed_owner_delivery_attempts: requests.failedAttemptsObserved, coordinator_answers: requests.coordinatorOwnAnswerObserved };
  for (const key of MANUAL_KEYS) { counts[key] = measures[key].total; observed_counts[key] = measures[key].observed; }
  counts.blocking_sum = input?.comparison?.qualitySource === "audited-verdicts" ? quality.blockingAudited : input?.comparison?.qualitySource === "event-log" && logEvents !== null ? quality.blockingLogged : null;
  observed_counts.blocking_sum = input?.comparison?.qualitySource === "audited-verdicts" ? qualityObservations.blocking_sum_audited : input?.comparison?.qualitySource === "event-log" ? qualityObservations.blocking_sum_stats_events : null;
  const snapshot: MeasurementSnapshot = {
    version: 1, measurementKind: "stats-reported-v1", repository: repo.mainRoot, condition: input?.comparison?.conditionCode ?? null, observed_at: now,
    period, comparison: input?.comparison ?? {},
    ...(completion ? { completionProofSha256: completion.sha256 } : {}),
    ...(adopted ? { deliveryClaims } : {}),
    ...(requestProof && requestSourceSha256 && requestSupport ? { requestCoverage: { ...requestProof, sourceSha256: requestSourceSha256, support: requestSupport } } : {}),
    counts, observed_counts,
    unknown: { request_events: requests.comparisonUnconfirmed + requests.legacyUnlinkedEvents, recipient_events: requests.recipientUnknownEvents, manual_fields: MANUAL_KEYS.filter((key) => measures[key].total === null).length },
    limits: warnings,
  };
  const metrics: TeamMetrics = { version: 1, period, ...(adopted ? { requestCoverageInputHash } : {}), requests, ownerInterventionTotal: null, manual: { roleCorrections: measures.owner_manual_role_corrections, fileEdits: measures.owner_file_edits, commandRuns: measures.owner_command_runs, extraInstructions: measures.coordinator_extra_instructions }, normal: { roleAssignments: measures.normal_role_assignment, approvals: measures.owner_approvals, mergeApprovals: measures.owner_merge_approvals, deployApprovals: measures.owner_deploy_approvals, scopeApprovals: measures.owner_scope_approvals }, quality, roles, workerContext: { workMs: stats.project.workMs, outputs: stats.tokens.map((t) => ({ tool: t.tool, output: t.status === "recorded" ? t.usage.output : null })), attribution: "cwd-window-proxy-not-role" }, unusedRoleCandidates, ...(requiredRoleNonParticipation.length ? { requiredRoleNonParticipation } : {}), handoffs: { kinds: handoff?.kinds ?? {}, agents: handoff?.agents ?? {}, open: handoff?.open ?? [] }, snapshot, warnings };
  receipts.assertStable();
  return { metrics, adopted, ...(handoff ? { handoffs: handoff } : {}) };
}
