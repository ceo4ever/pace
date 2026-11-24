import { spawnSync } from "node:child_process";
import { atomicText, digest, fields, HandoffError, identifier, object, shortText, strictJson } from "../project/handoff-files.ts";
import { HandoffStore } from "../project/handoff-store.ts";
import { actor, sourceRef, type HandoffHeader, type HandoffRecord } from "./handoff-model.ts";
import { referenced, requireBodies, validateTransition } from "./handoff-state.ts";

export interface DeliveryRoute { transport: "orca" | "external"; actor: string; target: string; sourceRef: string; from: string }
export function deliveryRoute(value: unknown): DeliveryRoute {
  fields(value, ["transport", "actor", "target", "sourceRef", "from"]);
  if (!["orca", "external"].includes(value.transport as string) || !actor(value.actor) || !sourceRef(value.sourceRef) || !shortText(value.target, 240) || !shortText(value.from, 240)) throw new HandoffError("전송 경로 형식 오류");
  if (value.transport === "orca" && (value.actor === "captain" || !/^(?:term_|run:|dispatch:|orca_session_id:)[a-zA-Z0-9_-]+$/.test(value.target as string) || !/^(?:term_|orca_session_id:)[a-zA-Z0-9_-]+$/.test(value.from as string))) throw new HandoffError("Orca는 명시된 로컬 에이전트 경로만 허용하며 캡틴 도달 경로가 아니다");
  return value as unknown as DeliveryRoute;
}
function deliveryHeader(message: HandoffRecord, attemptId: string, route: DeliveryRoute, phase: string, extra: Record<string, unknown> = {}): HandoffHeader {
  return { protocol: "pace-handoff", v: 1, id: `${attemptId}-${phase}`, kind: "delivery", from: message.from, to: route.actor, ...(message.task ? { task: message.task } : {}), ...(message.requestId ? { requestId: message.requestId } : {}), data: { re: message.id, attemptId, phase, transport: route.transport, routeActor: route.actor, target: route.target, sourceRef: route.sourceRef, ...extra } };
}
export function prepareDelivery(store: HandoffStore, messageId: string, attemptId: string, inputRoute: unknown): { payloadPath: string; started: HandoffRecord; route: DeliveryRoute } {
  if (!identifier(attemptId) || attemptId.length > 70) throw new HandoffError("전송 시도 ID 오류");
  const route = deliveryRoute(inputRoute), rows = store.read(), message = referenced(rows, messageId);
  if (route.actor === "captain" && message.to !== "captain") throw new HandoffError("캡틴 전달은 명시한 captain 수신 메시지/중계로 먼저 기록한다");
  requireBodies(store.context(true), rows, message);
  if (message.kind === "delegate") validateTransition(store.context(true), rows, structuredClone(message));
  const raw = store.bodies.read(message.bodyHash)!;
  // Payload is local-only and immutable for this attempt; body bytes are not normalized.
  const payload = Buffer.concat([Buffer.from(JSON.stringify(message) + "\n\n"), raw]);
  store.bodies.ensure();
  const payloadHash = store.bodies.capture(payload);
  const start = store.record(deliveryHeader(message, attemptId, route, "started", { payloadHash: payloadHash.hash }), `delivery-start:${attemptId}:${digest(payload)}`, true);
  if (start.duplicate) throw new HandoffError("이미 기록된 전송 시도를 다시 시작하지 않는다");
  return { payloadPath: payloadHash.path, started: start.record, route };
}
export function deliveryReceipt(store: HandoffStore, attemptId: string, input: unknown): HandoffRecord {
  fields(input, ["phase", "reportedBy", "sourceRef", "responseHash", "responseId"], ["phase", "reportedBy", "sourceRef"]);
  const rows = store.read(), started = rows.find((r) => r.kind === "delivery" && r.data.attemptId === attemptId && r.data.phase === "started");
  if (!started || started.data.transport !== "external" || !["sent", "failed", "unconfirmed"].includes(input.phase as string) || !actor(input.reportedBy) || !sourceRef(input.sourceRef)) throw new HandoffError("명시한 외부 경로/보고자/출처의 영수증 필요");
  const message = referenced(rows, started.data.re);
  const route: DeliveryRoute = { transport: "external", actor: started.data.routeActor as string, target: started.data.target as string, sourceRef: started.data.sourceRef as string, from: started.from };
  const extra: Record<string, unknown> = { reportedBy: input.reportedBy, ...(input.responseHash ? { responseHash: input.responseHash } : {}), ...(input.responseId ? { responseId: input.responseId } : {}) };
  // Receipt source must equal the predeclared real route; no post-hoc human promotion.
  if (input.sourceRef !== route.sourceRef) throw new HandoffError("영수증 출처와 선기록 경로 불일치");
  return store.record(deliveryHeader(message, attemptId, route, input.phase as string, extra), `external-receipt:${attemptId}:${input.phase}`, true).record;
}
export interface TransportOutcome { phase: "sent" | "failed" | "unconfirmed"; responseHash?: string; responseId?: string }
export type HandoffTransport = (route: DeliveryRoute, path: string) => TransportOutcome;
export const orcaTransport: HandoffTransport = (route, path) => {
  const executable = process.env.ORCA_CLI_COMMAND || (process.env.ORCA_DEV_REPO_ROOT ? "orca-dev" : process.platform === "linux" && !process.env.ORCA_TERMINAL_ID ? "orca-ide" : "orca");
  const result = spawnSync(executable, ["orchestration", "send", "--environment", "local", "--from", route.from, "--to", route.target, "--type", "handoff", "--subject", "PACE recorded handoff", "--body-file", path, "--json"], { encoding: "utf8", timeout: 30000, maxBuffer: 65536, shell: false });
  if (result.error) return { phase: (result.error as NodeJS.ErrnoException).code === "ENOENT" ? "failed" : "unconfirmed" };
  if (result.signal) return { phase: "unconfirmed" };
  try {
    const value = strictJson(result.stdout), data = object(value) && object(value.result) ? value.result : value;
    if (object(value) && value.ok === false) return { phase: "failed" };
    if (object(value) && value.ok === true && object(data)) {
      const receiptId = data.message_id ?? data.messageId ?? data.id;
      if (shortText(receiptId, 240)) return { phase: "sent", responseHash: digest(result.stdout), responseId: receiptId };
    }
  } catch { /* ambiguous output is not a negative acknowledgment */ }
  return { phase: "unconfirmed" };
};
export function sendDelivery(store: HandoffStore, messageId: string, attemptId: string, inputRoute: unknown, transport: HandoffTransport = orcaTransport): { phase: string; code: number; sentMayHaveOccurred?: boolean } {
  const route = deliveryRoute(inputRoute);
  if (route.transport !== "orca") throw new HandoffError("외부 사람 경로는 prepare-external 뒤 기존 호스트 도구와 receipt를 사용한다");
  const prepared = prepareDelivery(store, messageId, attemptId, route);
  let outcome: TransportOutcome;
  // No ledger guard is held while an existing transport runs.
  try { outcome = transport(route, prepared.payloadPath); } catch { outcome = { phase: "unconfirmed" }; }
  try {
    const rows = store.read(), message = referenced(rows, messageId);
    store.record(deliveryHeader(message, attemptId, route, outcome.phase, { reportedBy: message.from, ...(outcome.responseHash ? { responseHash: outcome.responseHash } : {}), ...(outcome.responseId ? { responseId: outcome.responseId } : {}) }), `delivery-receipt:${attemptId}:${outcome.phase}`, true);
  } catch { return { phase: "unconfirmed", code: 2, sentMayHaveOccurred: true }; }
  return { phase: outcome.phase, code: outcome.phase === "sent" ? 0 : outcome.phase === "failed" ? 1 : 2 };
}
