import { validTeamName } from "./model.ts";
import { digest, fields, hashValue, HEADER_LIMIT, HandoffError, identifier, object, shortText } from "../project/handoff-files.ts";

export const MESSAGE_KINDS = ["captain_input", "decision_request", "decision_reply", "delegate", "scope_check", "result", "close", "status", "delivery", "resource_event"] as const;
export type MessageKind = typeof MESSAGE_KINDS[number];
export interface HandoffPlan { id?: string; task?: string; assignee: string; decisionOwner: string; proofScope: string; instructionHash: string }
export interface HandoffHeader { protocol: "pace-handoff"; v: 1; id: string; kind: MessageKind; from: string; to: string; task?: string; requestId?: string; data: Record<string, unknown> }
export interface HandoffRecord extends HandoffHeader { p: string; at: string; seq: number; bodyHash: string; bodyRef: string }
export const stable = (value: unknown): string => JSON.stringify(sortValue(value));
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (object(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, sortValue(val)]));
  return value;
}
export function actor(value: unknown): value is string {
  return value === "captain" || value === "coordinator" || typeof value === "string" && (/^project:P\d{3}$/.test(value) || value.startsWith("agent:") && validTeamName(value.slice(6)));
}
export function sourceRef(value: unknown): value is string { return shortText(value, 240) && /^[a-z][a-z0-9+.-]*:\S+$/i.test(value); }
export function plan(value: unknown): HandoffPlan {
  fields(value, ["id", "task", "assignee", "decisionOwner", "proofScope", "instructionHash"], ["assignee", "decisionOwner", "proofScope", "instructionHash"]);
  if (!actor(value.assignee) || !actor(value.decisionOwner) || !shortText(value.proofScope, 240) || !/^[\p{L}\p{N}][\p{L}\p{N}/_:#.,-]*$/u.test(value.proofScope) || !/[:/#-]/.test(value.proofScope) || !hashValue(value.instructionHash) || value.id !== undefined && !identifier(value.id) || value.task !== undefined && (typeof value.task !== "string" || !/^T\d{2}$/.test(value.task))) throw new HandoffError("위임 계획/판정자/증명 참조 오류");
  return value as unknown as HandoffPlan;
}
function metadataStrings(value: unknown): void {
  if (typeof value === "string" && !shortText(value, 400)) throw new HandoffError("소통 metadata는 짧은 식별/참조만 허용한다");
  if (Array.isArray(value)) { if (value.length > 32) throw new HandoffError("metadata 배열 길이 초과"); value.forEach(metadataStrings); }
  else if (object(value)) Object.values(value).forEach(metadataStrings);
}
export function header(value: unknown, internal = false, stored = false): HandoffHeader | HandoffRecord {
  const common = ["protocol", "v", "id", "kind", "from", "to", "task", "requestId", "data"];
  fields(value, stored ? [...common, "p", "at", "seq", "bodyHash", "bodyRef"] : common, ["protocol", "v", "id", "kind", "from", "to", "data"]);
  if (value.protocol !== "pace-handoff" || value.v !== 1 || !identifier(value.id) || !MESSAGE_KINDS.includes(value.kind as MessageKind) || !actor(value.from) || !actor(value.to) || !object(value.data) || value.task !== undefined && (typeof value.task !== "string" || !/^T\d{2}$/.test(value.task)) || value.requestId !== undefined && !identifier(value.requestId)) throw new HandoffError("소통 머리 종류/주체/식별자 오류");
  if (!internal && (value.kind === "delivery" || value.kind === "resource_event")) throw new HandoffError("실제 전송/자원 사건은 사용자 입력으로 만들 수 없다");
  metadataStrings(value);
  if (Buffer.byteLength(JSON.stringify(value)) > HEADER_LIMIT) throw new HandoffError("소통 머리 크기 초과");
  if (stored && (typeof value.p !== "string" || !/^P\d{3}$/.test(value.p) || typeof value.at !== "string" || !/Z$/.test(value.at) || !Number.isFinite(Date.parse(value.at)) || !Number.isSafeInteger(value.seq) || (value.seq as number) < 1 || !hashValue(value.bodyHash) || value.bodyRef !== `local:${value.bodyHash}`)) throw new HandoffError("소통 저장 metadata 오류");
  return value as unknown as HandoffHeader | HandoffRecord;
}
export function instructionDigest(message: HandoffRecord): string { return digest(stable({ id: message.id, bodyHash: message.bodyHash, basis: message.data.basis, plan: message.data.plan })); }
export function proposalDigest(message: HandoffRecord): string { return digest(stable({ id: message.id, of: message.data.of ?? null, bodyHash: message.bodyHash, plan: message.data.plan ?? null })); }
