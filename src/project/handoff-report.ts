import { inputHash, type InputTrace } from "../core/input-snapshot.ts";
import type { HandoffRecord } from "../team/handoff-model.ts";
import { deliveryMatchesMessage } from "../team/handoff-state.ts";
import { join } from "node:path";
import { readEvents, type ProjectEvent } from "./event-log.ts";
import { HandoffStore, observeHandoffLedger, type HandoffLedgerSnapshot } from "./handoff-store.ts";
import { HandoffError, object, regularBytes } from "./handoff-files.ts";
import { safeTeamPath } from "../team/store.ts";

export type Reach = "owner_reply" | "owner_delivery" | "failed_only" | "unconfirmed";
export interface HandoffReport {
  failedRequestAttempts?: number;
  duplicateDeliveryRequests?: number;
  crossBoundaryRequests?: string[];
  attributionUnconfirmedRequests?: string[];
  records: number; missingBodies: number; auditCoverage: "local-bytes" | "metadata-only"; open: string[];
  kinds: Record<string, number>; agents: Record<string, Record<string, number>>;
  requests: { total: number; owner_reply: number; owner_delivery: number; failed_only: number; unconfirmed: number; unlinkedLogEvents: number; items: { requestId: string; reach: Reach; rootAt?: number | null; ownerSignal?: boolean; scopeConflict?: boolean; attributionUnconfirmed?: boolean; coordinatorAnswered?: boolean; task?: string; taskOpenedAt?: number; taskOpeningLogOrder?: number; routedTaskStarts?: Record<string, number> }[] };
}
function ownerAnswer(projectDir: string, event: ProjectEvent): boolean {
  if (event.type !== "answer" || event.by !== "user" || !event.ref) return false;
  try { return regularBytes(safeTeamPath(projectDir, event.ref), 2 * 1024 * 1024).length > 0; } catch { return false; }
}
export function requestAnswerEvent(event: ProjectEvent): boolean {
  return event.type === "answer" && (event.by === "user" || event.by === "coordinator");
}
export function unlinkedRequestEvent(event: ProjectEvent, includeAnswers: boolean): boolean {
  return !event.requestId && (event.type === "question" || event.type === "escalation" || includeAnswers && requestAnswerEvent(event));
}
export interface DeliveryClaim {
  request: string;
  responses: [string, string];
  counted: boolean;
  ambiguous?: true;
}
export function reusedDeliveryResponses(claims: Iterable<DeliveryClaim>): ReadonlySet<string> {
  const owners = new Map<string, string>(), reused = new Set<string>();
  for (const { request, responses, ambiguous } of claims) for (const response of responses) {
    const prior = owners.get(response);
    if (ambiguous || prior !== undefined && prior !== request) reused.add(response);
    owners.set(response, request);
  }
  return reused;
}
type OwnerAnswerProof = { kind: "reported" | "native-linked"; include(): void } | false;
export interface HandoffWindow { start?: string | null; end?: string; eventSnapshot?: readonly ProjectEvent[]; ledgerSnapshot?: HandoffLedgerSnapshot; ownerAnswerEvidence?: (event: ProjectEvent, requestAt: number, proposals: ReadonlyMap<string, HandoffRecord>) => OwnerAnswerProof; requestMirrorEvidence?: (event: ProjectEvent, proposals: readonly HandoffRecord[]) => boolean; deliveryClaims?: DeliveryClaim[]; inputs?: InputTrace }
function orderedProposals(rows: readonly HandoffRecord[]): Map<string, HandoffRecord> {
  const ordered = new Map<string, HandoffRecord>();
  for (const row of rows) {
    if (row.kind !== "decision_request" || !row.requestId) continue;
    if (row.data.relayOf) {
      const parent = ordered.get(row.data.relayOf as string);
      if (!parent || parent.requestId !== row.requestId || Date.parse(row.at) < Date.parse(parent.at)) continue;
    }
    ordered.set(row.id, row);
  }
  return ordered;
}
interface ReportedRequestLink {
  requestId: string;
  referenced?: ReportedRequestLink;
  ambiguous: boolean;
}
function requestReference(row: HandoffRecord): string | undefined {
  if (typeof row.data.re === "string") return row.data.re;
  const { basis } = row.data;
  if (row.kind === "delegate" && object(basis) && (basis.kind === "input" || basis.kind === "approved") && typeof basis.ref === "string") return basis.ref;
  return undefined;
}
function reportedRequestLinks(rows: readonly HandoffRecord[]): Map<string, ReportedRequestLink> {
  const links = new Map<string, ReportedRequestLink>();
  for (const row of rows) {
    const ref = requestReference(row);
    const referenced = ref ? links.get(ref) : undefined;
    if (row.requestId && row.requestId !== referenced?.requestId) {
      links.set(row.id, { requestId: row.requestId, referenced, ambiguous: referenced !== undefined });
    }
    else if (referenced) links.set(row.id, referenced);
  }
  return links;
}
/** Shared ancestors are visited once per projection, even in a long chain of status rows. */
function linkedRequestIds(links: Iterable<ReportedRequestLink | undefined>): Set<string> {
  const ids = new Set<string>(), visited = new Set<ReportedRequestLink>();
  for (const link of links) {
    for (let current = link; current && !visited.has(current); current = current.referenced) {
      ids.add(current.requestId);
      visited.add(current);
    }
  }
  return ids;
}
export function ownerReplyAfterProposal(reply: HandoffRecord, proposals: ReadonlyMap<string, HandoffRecord>, requestAt: number, eventTask?: string): boolean {
  const proposal = proposals.get(reply.data.re as string);
  return reply.kind === "decision_reply" && reply.from === "owner" && !!proposal && proposal.requestId === reply.requestId &&
    (reply.task === undefined || reply.task === proposal.task) && (eventTask === undefined || eventTask === proposal.task) &&
    Date.parse(proposal.at) >= requestAt && Date.parse(reply.at) >= Date.parse(proposal.at);
}
export function collectHandoffs(root: string, project: string, projectDir: string, window: HandoffWindow = {}): HandoffReport | undefined {
  const dir = join(root, projectDir), allEvents = (window.eventSnapshot ?? readEvents(dir, window.inputs)).filter((e) => e.p === project);
  const ledger = window.ledgerSnapshot ?? observeHandoffLedger(root, project, projectDir, window.inputs);
  if (!ledger.present && !allEvents.some((e) => e.requestId || !!window.ownerAnswerEvidence && requestAnswerEvent(e))) return undefined;
  const allRows = ledger.rows;
  const audit = ledger.present ? new HandoffStore(root, project, projectDir).audit(window.inputs, allRows) :
    { records: 0, missingBodies: 0, auditCoverage: "local-bytes" as const, open: [] };
  const low = window.start == null ? -Infinity : Date.parse(window.start), high = window.end === undefined ? Infinity : Date.parse(window.end);
  if (Number.isNaN(low) || Number.isNaN(high) || low > high) throw new HandoffError("소통 집계 구간 오류");
  const inside = (at: string) => Date.parse(at) >= low && Date.parse(at) <= high;
  const reportedRequests = reportedRequestLinks(window.ownerAnswerEvidence ? allRows : []);
  const conflictingLinks = linkedRequestIds([...reportedRequests.values()].filter((link) => link.ambiguous));
  const rootTimes = new Map<string, number>(), nativeRoots = new Map<string, number>();
  const taskStarts = new Map<string, Map<string, number>>(), proposals = new Map<string, HandoffRecord[]>();
  const unclearAttribution = new Set<string>();
  const logOrder = new Map(allEvents.map((event, index) => [event, index]));
  const logOpeningOrder = new Map<string, number>();
  const openingKey = (id: string, task: string | undefined, time: number) => JSON.stringify([id, task ?? null, time]);
  const noteLogOpening = (id: string, task: string | undefined, time: number, index: number) => {
    for (const scope of task ? [undefined, task] : [undefined]) {
      const key = openingKey(id, scope, time);
      if (!logOpeningOrder.has(key)) logOpeningOrder.set(key, index);
    }
  };
  const relayStarts = new Map<string, Map<string, number>>(), validProposals = orderedProposals(allRows);
  const noteTask = (id: string, task: string | undefined, at: number) => {
    if (!task || !window.ownerAnswerEvidence) return;
    const scopes = taskStarts.get(id) ?? new Map<string, number>();
    scopes.set(task, Math.min(scopes.get(task) ?? Infinity, at));
    taskStarts.set(id, scopes);
  };
  for (const row of allRows) {
    if (row.kind !== "decision_request" || !row.requestId) continue;
    const candidates = proposals.get(row.requestId) ?? [];
    candidates.push(row);
    proposals.set(row.requestId, candidates);
    const at = Date.parse(row.at);
    if (row.data.relayOf) {
      if (validProposals.has(row.id) && row.task) {
        const scopes = relayStarts.get(row.requestId) ?? new Map<string, number>();
        scopes.set(row.task, Math.min(scopes.get(row.task) ?? Infinity, at));
        relayStarts.set(row.requestId, scopes);
      }
      continue;
    }
    rootTimes.set(row.requestId, Math.min(rootTimes.get(row.requestId) ?? Infinity, at));
    nativeRoots.set(row.requestId, Math.min(nativeRoots.get(row.requestId) ?? Infinity, at));
    noteTask(row.requestId, row.task, at);
  }
  for (const [index, event] of allEvents.entries()) {
    const id = event.requestId;
    if (!id || !["question", "escalation"].includes(event.type)) continue;
    const at = Date.parse(event.ts);
    const candidates = proposals.get(id);
    if (window.requestMirrorEvidence && candidates?.length) {
      if (window.requestMirrorEvidence(event, candidates.filter((row) => validProposals.has(row.id)))) {
        noteLogOpening(id, event.t, at, index);
        continue;
      }
      unclearAttribution.add(id);
      noteTask(id, event.t, at);
      continue;
    }
    rootTimes.set(id, Math.min(rootTimes.get(id) ?? Infinity, at));
    noteTask(id, event.t, at);
    noteLogOpening(id, event.t, at, index);
  }
  const scoped = (id: string | undefined) => !id || !rootTimes.has(id) || rootTimes.get(id)! >= low && rootTimes.get(id)! <= high;
  const rows = allRows.filter((r) => inside(r.at) && scoped(r.requestId)), events = allEvents.filter((e) => inside(e.ts) && scoped(e.requestId));
  const observedRows = window.ownerAnswerEvidence ? allRows.filter((r) => inside(r.at)) : rows;
  const crossBoundaryRequests = window.ownerAnswerEvidence ? [...new Set([
    ...linkedRequestIds(observedRows.map((r) => reportedRequests.get(r.id))),
    ...allEvents.filter((e) => inside(e.ts) && e.requestId).map((e) => e.requestId!),
  ].filter((id) => !scoped(id)))].sort() : [];
  const kinds: Record<string, number> = {}, agents: Record<string, Record<string, number>> = {};
  for (const row of observedRows) {
    kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
    if (row.from === "coordinator" || row.from.startsWith("agent:")) { const counts = agents[row.from] ??= {}; counts[row.kind] = (counts[row.kind] ?? 0) + 1; }
  }
  const ids = new Set([...rows.filter((r) => r.kind === "decision_request").map((r) => r.requestId!), ...events.filter((e) => e.requestId && ["question", "escalation"].includes(e.type)).map((e) => e.requestId!)]);
  const ownerDelivery = (row: HandoffRecord) => row.kind === "delivery" && row.data.routeActor === "owner";
  const ownerDeliveryRequests = (entries: readonly HandoffRecord[]) => linkedRequestIds(entries.filter(ownerDelivery).map((row) => reportedRequests.get(row.id)));
  if (window.ownerAnswerEvidence) {
    for (const event of events) if (requestAnswerEvent(event) && event.requestId) ids.add(event.requestId);
    for (const row of rows) if (row.kind === "decision_reply" && row.from === "owner" && row.requestId) ids.add(row.requestId);
    for (const id of ownerDeliveryRequests(observedRows)) if (scoped(id)) ids.add(id);
  }
  const requests: HandoffReport["requests"] = { total: ids.size, owner_reply: 0, owner_delivery: 0, failed_only: 0, unconfirmed: 0, unlinkedLogEvents: events.filter((e) => unlinkedRequestEvent(e, !!window.ownerAnswerEvidence)).length, items: [] };
  const failedRequestAttempts = new Set<string>();
  const messages = new Map(allRows.map((r) => [r.id, r]));
  const deliveryChains = new Map<unknown, HandoffRecord[]>();
  if (window.ownerAnswerEvidence) for (const row of allRows) if (row.kind === "delivery") {
    const id = row.data.attemptId, chain = deliveryChains.get(id) ?? [];
    chain.push(row);
    deliveryChains.set(id, chain);
  }
  const requestAttemptIdentity = (r: typeof allRows[number]) => {
    if (r.kind !== "delivery" || r.data.routeActor !== "owner") return false;
    const message = messages.get(r.data.re as string);
    return !!r.requestId && message?.kind === "decision_request" && message.to === "owner" && message.requestId === r.requestId;
  };
  const validAttemptIds = new Set<unknown>();
  for (const [id, chain] of deliveryChains) {
    const start = chain[0]!;
    if (start.data.phase !== "started" || !requestAttemptIdentity(start)) continue;
    const message = messages.get(start.data.re as string)!;
    if (!validProposals.has(message.id)) continue;
    const requestStart = (window.requestMirrorEvidence ? nativeRoots : rootTimes).get(start.requestId!) ?? Infinity;
    if (Date.parse(message.at) >= requestStart && chain.every((row, index) =>
      deliveryMatchesMessage(row, message) && Date.parse(row.at) >= Date.parse((chain[index - 1] ?? message).at))) validAttemptIds.add(id);
  }
  const requestAttempt = (r: typeof allRows[number]) => {
    return requestAttemptIdentity(r) && validAttemptIds.has(r.data.attemptId);
  };
  const sentExternal = (r: HandoffRecord) => r.data.phase === "sent" && r.data.transport === "external";
  // Use every request-linked claim to detect reuse, including status and clock-ineligible claims.
  const deliveryClaims = new Map<string, DeliveryClaim>();
  const ownerRoutes = ownerDeliveryRequests(allRows);
  if (window.ownerAnswerEvidence) for (const row of allRows) {
    const linked = reportedRequests.get(row.id);
    if (row.kind !== "delivery" || !linked || !sentExternal(row)) continue;
    deliveryClaims.set(row.id, {
      request: inputHash(JSON.stringify([project, linked.requestId])),
      responses: [
        inputHash(JSON.stringify(["source", row.data.sourceRef, row.data.responseId])),
        inputHash(JSON.stringify(["response", row.data.responseId, row.data.responseHash])),
      ],
      counted: false,
      ...(linked.ambiguous ? { ambiguous: true } : {}),
    });
  }
  const repeatedResponses = reusedDeliveryResponses(deliveryClaims.values());
  const reusedResponse = (r: HandoffRecord) => deliveryClaims.get(r.id)?.responses.some((key) => repeatedResponses.has(key)) === true;
  const reusedRequests = linkedRequestIds(observedRows.filter(reusedResponse).map((r) => reportedRequests.get(r.id)));
  const duplicateDeliveryRequests = [...reusedRequests].filter((id) => ids.has(id)).length;
  const reportedOwnerAttempts = observedRows.filter((row) => {
    if (!ownerDelivery(row)) return false;
    const message = messages.get(row.data.re as string);
    return message?.kind === "decision_request" && message.to === "owner";
  });
  const unconfirmedAttempts = ownerDeliveryRequests(reportedOwnerAttempts.filter((row) => !requestAttempt(row)));
  // Attribution and clock contradictions preserve the directly referenced failure observation.
  if (window.ownerAnswerEvidence) for (const row of reportedOwnerAttempts) if (row.data.phase === "failed") failedRequestAttempts.add(row.data.attemptId as string);
  for (const id of [...ids].sort()) {
    const group = rows.filter((r) => r.requestId === id), logs = events.filter((e) => e.requestId === id);
    const attempts = group.filter((r) => {
      if (r.kind !== "delivery" || r.data.routeActor !== "owner") return false;
      if (!window.ownerAnswerEvidence) return true;
      return requestAttempt(r);
    });
    for (const attempt of attempts) if (attempt.data.phase === "failed") failedRequestAttempts.add(attempt.data.attemptId as string);
    let reach: Reach = "unconfirmed";
    const rootAt = rootTimes.get(id) ?? null;
    const unclearRoot = unclearAttribution.has(id);
    const scopes = taskStarts.get(id);
    const scopeConflict = (scopes?.size ?? 0) > 1;
    const routeStarts = relayStarts.get(id);
    const logReachUsable = !unclearRoot && !scopeConflict;
    const ownerProofs = new Map<ProjectEvent, OwnerAnswerProof>();
    const ownerProof = (e: ProjectEvent): OwnerAnswerProof => {
      const previous = ownerProofs.get(e);
      if (previous !== undefined) return previous;
      const proof = logReachUsable && e.type === "answer" && e.by === "user" && e.ref
        ? window.ownerAnswerEvidence?.(e, rootAt ?? Infinity, validProposals) ?? false
        : false;
      ownerProofs.set(e, proof);
      return proof;
    };
    const insideRequestTime = (e: ProjectEvent) => {
      const opening = e.t ? Math.min(scopes?.get(e.t) ?? Infinity, routeStarts?.get(e.t) ?? Infinity) : rootAt ?? Infinity;
      const answerAt = Date.parse(e.ts);
      if (answerAt !== opening) return answerAt > opening;
      // Equal clocks need order in the same log or a verified reference to the earlier ledger chain.
      if ((logOpeningOrder.get(openingKey(id, e.t, opening)) ?? Infinity) < (logOrder.get(e) ?? Infinity)) return true;
      const proof = ownerProof(e);
      if (!proof || proof.kind !== "native-linked") return false;
      proof.include();
      return true;
    };
    const namedScope = !!(scopes?.size || routeStarts?.size);
    const unmatchedAnswer = !!window.ownerAnswerEvidence && logs.some((e) =>
      requestAnswerEvent(e) && (rootAt === null || namedScope || e.t !== undefined || Date.parse(e.ts) === rootAt) && !insideRequestTime(e));
    const nativeRoot = (window.requestMirrorEvidence ? nativeRoots : rootTimes).get(id) ?? Infinity;
    const nativeAnswers = group.filter((r) => r.kind === "decision_reply" && r.from === "owner");
    const verifiedNativeAnswers = window.ownerAnswerEvidence
      ? nativeAnswers.filter((r) => ownerReplyAfterProposal(r, validProposals, nativeRoot))
      : nativeAnswers;
    const attributionUnconfirmed = unclearRoot || conflictingLinks.has(id) || unmatchedAnswer || nativeAnswers.length !== verifiedNativeAnswers.length;
    const belongsToRequest = (e: ProjectEvent) => logReachUsable && insideRequestTime(e);
    const verifiedLogAnswer = (e: ProjectEvent) => {
      if (!window.ownerAnswerEvidence) return ownerAnswer(dir, e);
      if (!belongsToRequest(e)) return false;
      const proof = ownerProof(e);
      if (!proof) return false;
      proof.include();
      return true;
    };
    const coordinatorAnswered = !!window.ownerAnswerEvidence && logs.some((e) =>
      e.type === "answer" && e.by === "coordinator" && belongsToRequest(e));
    const unresolvedOwnerEvidence = !!window.ownerAnswerEvidence && (unconfirmedAttempts.has(id) ||
      logs.some((e) => e.type === "answer" && e.by === "user") ||
      group.some((r) => r.kind === "decision_reply" && r.from === "owner"));
    if (verifiedNativeAnswers.length || logReachUsable && logs.some(verifiedLogAnswer)) reach = "owner_reply";
    else if (attempts.some((r) => sentExternal(r) && !reusedResponse(r))) reach = "owner_delivery";
    else if (!unresolvedOwnerEvidence && attempts.length && attempts.filter((r) => r.data.phase === "started").every((start) => attempts.some((end) => end.data.attemptId === start.data.attemptId && end.data.phase === "failed")) && attempts.some((r) => r.data.phase === "failed")) reach = "failed_only";
    if (scopeConflict && !unclearRoot) reach = "unconfirmed";
    if (reach === "owner_delivery") for (const attempt of attempts) {
      const claim = deliveryClaims.get(attempt.id);
      if (claim && !reusedResponse(attempt)) claim.counted = true;
    }
    const ownerSignal = !!window.ownerAnswerEvidence && (
      ownerRoutes.has(id) ||
      allEvents.some((e) => e.requestId === id && (e.type === "answer" && e.by === "user" || ["question", "escalation"].includes(e.type) && e.to !== "coordinator")) ||
      allRows.some((r) => r.requestId === id && (r.kind === "decision_reply" && r.from === "owner" || r.kind === "decision_request" && r.to === "owner"))
    );
    const taskScope = scopes?.size === 1 && !attributionUnconfirmed ? scopes.entries().next().value : undefined;
    const taskOpening = taskScope ? logOpeningOrder.get(openingKey(id, taskScope[0], taskScope[1])) : undefined;
    requests[reach]++;
    requests.items.push({ requestId: id, reach, ...(window.ownerAnswerEvidence ? {
      rootAt, ownerSignal, scopeConflict, coordinatorAnswered,
      ...(taskScope ? { task: taskScope[0], taskOpenedAt: taskScope[1], ...(taskOpening === undefined ? {} : { taskOpeningLogOrder: taskOpening }), routedTaskStarts: Object.fromEntries(routeStarts ?? []) } : {}),
      ...(attributionUnconfirmed ? { attributionUnconfirmed } : {}),
    } : {}) });
  }
  const delegationState = window.ownerAnswerEvidence ? allRows.filter((r) => Date.parse(r.at) <= high) : observedRows;
  const closedDelegations = new Set(delegationState.filter((r) => r.kind === "close").map((r) => r.data.re));
  const open = delegationState.filter((r) => r.kind === "delegate" && !closedDelegations.has(r.id)).map((r) => r.id);
  if (window.deliveryClaims) for (const claim of deliveryClaims.values()) window.deliveryClaims.push(claim);
  return { ...audit, ...(window.ownerAnswerEvidence ? { failedRequestAttempts: failedRequestAttempts.size, crossBoundaryRequests, ...(duplicateDeliveryRequests ? { duplicateDeliveryRequests } : {}), ...(window.requestMirrorEvidence ? { attributionUnconfirmedRequests: requests.items.filter((r) => r.attributionUnconfirmed).map((r) => r.requestId) } : {}) } : {}), records: observedRows.length, open, kinds, agents, requests };
}
