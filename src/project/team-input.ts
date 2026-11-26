import { existsSync, lstatSync } from "node:fs";
import { inputHash, InputSnapshot, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { isAbsolute, join, resolve } from "node:path";
import { safeTeamPath } from "../team/store.ts";
import { actor, sourceRef, stable } from "../team/handoff-model.ts";
import type { DeliveryClaim } from "./handoff-report.ts";
import { fields, hashValue, HandoffError, HandoffSizeError, identifier, object, regularBytes, shortText, strictJson, utf8 } from "./handoff-files.ts";
import { hasSecret } from "./secrets.ts";
import { decodeEvent, type ProjectEvent } from "./event-log.ts";
import { observeHandoffLedger } from "./handoff-store.ts";

export const MANUAL_KEYS = ["owner_manual_role_corrections", "owner_file_edits", "owner_command_runs", "coordinator_extra_instructions", "normal_role_assignment", "owner_approvals", "owner_merge_approvals", "owner_deploy_approvals", "owner_scope_approvals"] as const;
export type ManualKey = typeof MANUAL_KEYS[number];
export const EVIDENCE_PURPOSES = ["completion", "owner-answer", "coordinator-answer", "request-coverage", "log-coverage", "quality-audit", "role-observation", ...MANUAL_KEYS] as const;
export type EvidencePurpose = typeof EVIDENCE_PURPOSES[number];
export const CONDITIONS = ["message-role", "start-role", "no-team", "team", "before-change", "after-change"] as const;
export type Condition = typeof CONDITIONS[number];
export type Study = "role-automation" | "team-adoption" | "definition-change";
export const representativeScopeUnconfirmed = "대표 업무 단독 수집 범위 미확인";
export const completionProofUnconfirmed = "완료 영수증 지문 미확인";
export const requestCoverageUnconfirmed = "요청 수집 결합 미확인";
export const requestTotalKeys = ["owner_questions", "failed_only_owner_requests", "coordinator_questions", "recipient_unknown"] as const;
export type Unit = "project-start-to-merge" | "representative-task";
export interface ComparisonContext { study?: Study; conditionCode?: Condition; definition?: string; unit?: Unit; workType?: string; sizeBand?: string; host?: string; sampleCount?: number; recordingBoundary?: string; qualitySource?: "event-log" | "audited-verdicts"; qualityScopeHash?: string; additionalSamplePlanRef?: string }
export interface TeamPeriod { start: string | null; end: string; unit: Unit; closed: boolean; completionRef?: string }
export interface Coverage { status: "complete" | "partial" | "unknown"; reportedBy: string; verifiedBy?: string; confirmationRef?: string; refs: string[] }
export interface RequestCoverageProof { ref: string; inputSha256: string; receiptSha256: string }
interface RequestSupportReceipt { ref: string; receiptSha256: string }
export interface PortableRequestCoverageProof extends RequestCoverageProof { sourceSha256: string; support: RequestSupportReceipt[] }
interface PortableRequestFacts {
  repository: string;
  comparison: ComparisonContext;
  representativeProof: RequestSupportReceipt | null;
  counts: Record<string, number | null>;
  observed: Record<string, number | null>;
  unknownRequests: number | null;
  deliveryClaims: readonly DeliveryClaim[];
}
export function portableRequestInputHash(sourceSha256: string, facts: PortableRequestFacts, support: readonly RequestSupportReceipt[]): string {
  const projectKeys = (values: Record<string, number | null>) => Object.fromEntries(requestTotalKeys.map((key) => [key, values[key] ?? null]));
  return inputHash(stable({
    kind: "request-coverage-snapshot-v1",
    repository: facts.repository,
    comparison: facts.comparison,
    representativeProof: facts.representativeProof,
    sourceSha256,
    support,
    counts: projectKeys(facts.counts),
    observed: projectKeys(facts.observed),
    unknownRequests: facts.unknownRequests,
    deliveryClaims: facts.deliveryClaims,
  }));
}
export interface RoleObservation { role: string; workMs: number | null; outputTokens: { tool: string; output: number | null }[]; coverage: Coverage }
export interface TeamInput {
  version: 1; comparison?: ComparisonContext; period?: TeamPeriod;
  counts?: Partial<Record<ManualKey, number | null>>; observed_counts?: Partial<Record<ManualKey, number | null>>; coverage?: Partial<Record<ManualKey, Coverage>>;
  request_coverage?: Coverage;
  log_coverage?: Coverage;
  quality_audit?: { blocking_sum: number | null; rereviews_after_fail: number | null; coverage: Coverage };
  role_observations?: RoleObservation[]; coordinator_answers?: { requestId: string; coverage: Coverage }[];
}
export const measurementFile = "TEAM-MEASUREMENT.json";
export const retrospectiveFile = "TEAM-RETROSPECTIVE.json";
class UnsafeTeamMetadataError extends HandoffError {}
export function natural(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
export function nullableNatural(value: unknown): value is number | null { return value === null || natural(value); }
export function iso(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)); }
export function metadataValue(bytes: Buffer): unknown {
  const text = utf8(bytes);
  if (hasSecret(text)) throw new UnsafeTeamMetadataError("팀 metadata 비밀 후보 거부");
  return strictJson(text);
}
export function metadataJson(path: string, limit = 32768, inputs?: InputTrace): unknown {
  const bytes = regularBytes(path, limit), value = metadataValue(bytes);
  inputs?.record(path, inputHash(bytes));
  return value;
}
function safeEvidenceLocator(value: unknown): value is string {
  if (!sourceRef(value)) return false;
  const locator = value.replaceAll("\\", "/").toLowerCase();
  return !locator.includes("/") && !locator.startsWith("file:") &&
    (!locator.startsWith("local:") || /^local:[0-9a-f]{64}$/.test(locator));
}
function teamReferencePath(dir: string, ref: unknown): string {
  if (!shortText(ref, 240) || isAbsolute(ref) || ref.includes("\\") ||
      ref.split("/").some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
    throw new HandoffError("팀 근거는 프로젝트 안의 짧은 metadata JSON 영수증이어야 한다");
  }
  const slash = ref.lastIndexOf("/");
  // Validate ancestor directories here. regularBytes inspects the leaf on its first read.
  const parent = slash === -1 ? resolve(dir) : safeTeamPath(dir, ref.slice(0, slash), true);
  return join(parent, ref.slice(slash + 1));
}
/** Older logs accepted equivalent relative spellings. Keep their words and resolve the same file. */
export function canonicalTeamLogRef(ref: string): string {
  const portable = ref.replaceAll("\\", "/");
  const parts = portable.split("/");
  if (portable.startsWith("/") || /^[a-z]:/i.test(portable) || parts.includes("..")) {
    throw new HandoffError("팀 로그 영수증 경로는 프로젝트 안의 상대 경로여야 한다");
  }
  return parts.filter((part) => part && part !== ".").join("/");
}
function assertNoLiteralBackslashPath(dir: string, ref: string, inputs?: InputTrace): void {
  if (process.platform === "win32" || !ref.includes("\\")) return;
  // A backslash can also be a literal filename on POSIX. Never stage that second interpretation.
  const parts = ref.split("/").filter((part) => part && part !== ".");
  const target = resolve(dir, ...parts);
  let path = resolve(dir);
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    let entry: ReturnType<typeof lstatSync>;
    try { entry = lstatSync(path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      inputs?.absent?.(target);
      return;
    }
    if (index === parts.length - 1 || !entry.isDirectory() || entry.isSymbolicLink()) {
      throw new HandoffError("팀 로그 영수증에 역슬래시를 문자로 쓰는 별도 파일 경로가 있다");
    }
  }
}
function evidencePath(dir: string, ref: unknown): string {
  if (typeof ref !== "string" || !ref.endsWith(".json")) throw new HandoffError("팀 영수증은 JSON 일반 파일이어야 한다");
  return teamReferencePath(dir, ref);
}
function validateReceipt(value: unknown): Record<string, unknown> {
  fields(value, ["version", "kind", "sourceRef", "hash", "requestId", "decisionReplyId", "period", "purposes"], ["version", "kind", "sourceRef", "hash"]);
  if (typeof value.sourceRef === "string" && (/[/\\]/.test(value.sourceRef) || /^file:/i.test(value.sourceRef))) {
    throw new UnsafeTeamMetadataError("팀 근거 출처에 파일 경로를 쓸 수 없다");
  }
  if (value.version !== 1 || value.kind !== "team-evidence" || !safeEvidenceLocator(value.sourceRef) || !hashValue(value.hash) || value.requestId !== undefined && !identifier(value.requestId) || value.decisionReplyId !== undefined && !identifier(value.decisionReplyId)) throw new HandoffError("팀 근거 영수증 형식/출처/지문 오류");
  if (value.purposes !== undefined && (!Array.isArray(value.purposes) || value.purposes.length > EVIDENCE_PURPOSES.length || new Set(value.purposes).size !== value.purposes.length || value.purposes.some((p) => !EVIDENCE_PURPOSES.includes(p as EvidencePurpose)))) throw new HandoffError("팀 근거 용도 형식 오류");
  if (value.period !== undefined) {
    fields(value.period, ["start", "end", "unit"]);
    if (!iso(value.period.start) || !iso(value.period.end) || Date.parse(value.period.start) > Date.parse(value.period.end) || !["project-start-to-merge", "representative-task"].includes(value.period.unit as string)) throw new HandoffError("완료 영수증 구간 형식 오류");
  }
  return value;
}
/** Only a typed, versionable locator receipt is proof input; raw local body paths/text are never proof files. */
export function evidenceReceipt(dir: string, ref: unknown, inputs?: InputTrace): Record<string, unknown> {
  return validateReceipt(metadataJson(evidencePath(dir, ref), 16384, inputs));
}
/** Whole-scope authority cannot be borrowed from a per-request receipt. */
export function receiptPurpose(evidence: Record<string, unknown>, purpose: EvidencePurpose, requestId?: string): boolean {
  if (purpose === "coordinator-answer" && evidence.decisionReplyId !== undefined) return false;
  return Array.isArray(evidence.purposes) && evidence.purposes.includes(purpose) && (requestId === undefined ? evidence.requestId === undefined && evidence.decisionReplyId === undefined : evidence.requestId === requestId);
}
interface Receipt { evidence: Record<string, unknown>; sha256: string }
type ReceiptRead = { kind: "available"; receipt: Receipt; dir: string; ref: unknown } | { kind: "absent" | "unavailable" };

function captureReceipt(path: string, dir: string, ref: unknown): ReceiptRead {
  let bytes: Buffer;
  try { bytes = regularBytes(path, 16384); }
  catch (error) {
    if (error instanceof HandoffSizeError) return { kind: "unavailable" };
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { kind: "absent" };
    throw error;
  }
  try {
    const evidence = validateReceipt(metadataValue(bytes));
    return { kind: "available", receipt: { evidence, sha256: inputHash(bytes) }, dir, ref };
  } catch (error) {
    if (error instanceof UnsafeTeamMetadataError || !(error instanceof HandoffError || error instanceof SyntaxError)) throw error;
    return { kind: "unavailable" };
  }
}

/** Share the first receipt observation across every use of its path in one query. */
export class TeamReceiptReads {
  private readonly reads = new Map<string, ReceiptRead>();

  read(dir: string, ref: unknown, inputs?: InputTrace): Receipt | null {
    const path = evidencePath(dir, ref);
    let first = this.reads.get(path);
    if (!first) {
      first = captureReceipt(path, dir, ref);
      this.reads.set(path, first);
    }
    if (first.kind === "absent") inputs?.absent?.(path);
    if (first.kind !== "available") return null;
    inputs?.record(path, first.receipt.sha256);
    return first.receipt;
  }

  require(dir: string, ref: unknown, inputs?: InputTrace): Receipt {
    const receipt = this.read(dir, ref, inputs);
    if (!receipt) throw new HandoffError("팀 영수증 메타데이터의 형식 또는 가용성을 확인할 수 없다");
    return receipt;
  }

  requireIfPresent(dir: string, originalRef: string, inputs?: InputTrace): void {
    const ref = canonicalTeamLogRef(originalRef);
    const path = teamReferencePath(dir, ref);
    assertNoLiteralBackslashPath(dir, originalRef, inputs);
    if (!ref.endsWith(".json")) {
      try { lstatSync(path); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        inputs?.absent?.(path);
        return;
      }
      throw new HandoffError("팀 로그에 인용된 파일은 JSON 영수증이어야 한다");
    }
    if (!this.read(dir, ref, inputs) && this.reads.get(path)?.kind !== "absent") {
      throw new HandoffError("팀 로그 영수증의 메타데이터를 확인할 수 없다");
    }
  }

  assertStable(): void {
    for (const read of this.reads.values()) {
      if (read.kind !== "available") continue;
      try {
        const current = regularBytes(evidencePath(read.dir, read.ref), 16384);
        if (inputHash(current) === read.receipt.sha256) continue;
      } catch { /* A formerly usable receipt cannot be verified. */ }
      throw new InputSnapshotError("검증 중 입력이 바뀌었다: 팀 영수증을 확인하고 다시 실행한다");
    }
  }
}
export function readCompletionProof(receipts: TeamReceiptReads, dir: string, period: TeamPeriod, inputs?: InputTrace): { sha256: string; representativeScope: boolean } | null {
  if (!period.closed || !period.start || !period.completionRef) return null;
  const receipt = receipts.read(dir, period.completionRef, inputs);
  if (!receipt) return null;
  const { evidence, sha256 } = receipt;
  if (!receiptPurpose(evidence, "completion") || !sameReceiptPeriod(evidence.period, period)) return null;
  const prefix = "representative-scope:", locator = evidence.sourceRef as string;
  const origin = locator.slice(prefix.length);
  const representativeScope = locator.startsWith(prefix) && !origin.toLowerCase().startsWith(prefix) && safeEvidenceLocator(origin);
  return { sha256, representativeScope };
}
export function representativeProofBinding(period: TeamPeriod, completion: { sha256: string } | null): RequestSupportReceipt | null {
  return period.unit === "representative-task" && period.completionRef && completion
    ? { ref: period.completionRef, receiptSha256: completion.sha256 }
    : null;
}
export function observationCovered(dir: string, ref: unknown, period: TeamPeriod, role: string, kind: "activity" | "none" | "condition-not-triggered", inputs?: InputTrace, receipts = new TeamReceiptReads()): boolean {
  const receipt = receipts.read(dir, ref, inputs);
  if (!receipt) return false;
  const { evidence } = receipt;
  const prefix = `role-observation:${role}:${kind}:`;
  const locator = evidence.sourceRef as string, inner = locator.slice(prefix.length);
  return locator.startsWith(prefix) && !inner.toLowerCase().startsWith("role-observation:") && safeEvidenceLocator(inner) &&
    receiptPurpose(evidence, "role-observation") && sameReceiptPeriod(evidence.period, period);
}
function sameReceiptPeriod(p: unknown, period: TeamPeriod): boolean {
  return object(p) && period.start !== null && p.unit === period.unit &&
    Date.parse(p.start as string) === Date.parse(period.start) && Date.parse(p.end as string) === Date.parse(period.end);
}
function receiptMatches(receipts: TeamReceiptReads, dir: string, ref: unknown, purpose: EvidencePurpose, period?: TeamPeriod, requestId?: string, inputs?: InputTrace, matchedInputs?: InputTrace): boolean {
  const trace = matchedInputs ? new InputSnapshot() : undefined;
  const receipt = receipts.read(dir, ref, trace ?? inputs);
  const matches = !!receipt && receiptPurpose(receipt.evidence, purpose, requestId) &&
    (period === undefined || sameReceiptPeriod(receipt.evidence.period, period));
  trace?.include(inputs);
  if (matches) trace?.include(matchedInputs);
  return matches;
}
function coverageMatches(receipts: TeamReceiptReads, dir: string, c: Coverage | undefined, purpose: EvidencePurpose, period?: TeamPeriod, requestId?: string, inputs?: InputTrace, matchedInputs?: InputTrace): boolean {
  return confirmed(c) && receiptMatches(receipts, dir, c!.confirmationRef, purpose, period, requestId, inputs, matchedInputs) && c!.refs.some((ref) => receiptMatches(receipts, dir, ref, purpose, period, requestId, inputs, matchedInputs));
}
function referenceList(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > 32) throw new HandoffError("팀 근거 목록은32개 이하여야 한다");
  return value;
}
export function proofRefs(dir: string, value: unknown, inputs?: InputTrace): string[] {
  for (const ref of referenceList(value)) evidenceReceipt(dir, ref, inputs);
  return value as string[];
}
function coverageRefs(c: Coverage): string[] {
  return c.confirmationRef === undefined ? c.refs : [...c.refs, c.confirmationRef];
}
function coverage(value: unknown): Coverage {
  fields(value, ["status", "reportedBy", "verifiedBy", "confirmationRef", "refs"], ["status", "reportedBy", "refs"]);
  if (!["complete", "partial", "unknown"].includes(value.status as string) || !actor(value.reportedBy) || value.verifiedBy !== undefined && !actor(value.verifiedBy)) throw new HandoffError("팀 coverage 신고/확인 주체 오류");
  referenceList(value.refs);
  return value as unknown as Coverage;
}
export function confirmed(c: Coverage | undefined): boolean { return !!c && c.status === "complete" && !!c.verifiedBy && c.verifiedBy !== c.reportedBy && !!c.confirmationRef && c.refs.length > 0; }
export function scopeConfirmed(receipts: TeamReceiptReads, dir: string, c: Coverage | undefined, period: TeamPeriod, purpose: EvidencePurpose, inputs?: InputTrace): boolean {
  return coverageMatches(receipts, dir, c, purpose, period, undefined, inputs);
}
export function scopeObserved(receipts: TeamReceiptReads, dir: string, c: Coverage, period: TeamPeriod, purpose: EvidencePurpose, inputs?: InputTrace): boolean {
  return c.status !== "unknown" && c.refs.some((ref) => receiptMatches(receipts, dir, ref, purpose, period, undefined, inputs));
}
function requestCoverageReceipt(receipts: TeamReceiptReads, dir: string, ref: string, period: TeamPeriod, fingerprint: string, inputs?: InputTrace, expectedSha256?: string): RequestCoverageProof | null {
  const receipt = receipts.read(dir, ref, inputs);
  if (!receipt || expectedSha256 !== undefined && receipt.sha256 !== expectedSha256) return null;
  const { evidence, sha256 } = receipt, prefix = "request-coverage:";
  const locator = evidence.sourceRef as string, origin = locator.slice(prefix.length);
  return locator.startsWith(prefix) && !origin.toLowerCase().startsWith(prefix) && safeEvidenceLocator(origin) &&
    evidence.hash === fingerprint && receiptPurpose(evidence, "request-coverage") &&
    (evidence.purposes as unknown[]).length === 1 && sameReceiptPeriod(evidence.period, period)
    ? { ref, inputSha256: fingerprint, receiptSha256: sha256 }
    : null;
}
export function readRequestSupportingReceipts(receipts: TeamReceiptReads, dir: string, files: readonly { ref: string; receiptSha256?: string }[], period: TeamPeriod, inputs?: InputTrace): RequestSupportReceipt[] | null {
  const support = files.map(({ ref, receiptSha256 }) => {
    const read = receipts.read(dir, ref, inputs);
    return read && (receiptSha256 === undefined || read.sha256 === receiptSha256) ? { ref, ...read } : null;
  });
  if (!support.every((receipt) => receipt !== null) ||
      !support.some(({ evidence }) => receiptPurpose(evidence, "request-coverage") && sameReceiptPeriod(evidence.period, period))) return null;
  return support.map(({ ref, sha256 }) => ({ ref, receiptSha256: sha256 }));
}
export function readRequestCoverageProof(receipts: TeamReceiptReads, dir: string, c: Coverage | undefined, period: TeamPeriod, fingerprint: string | null, inputs?: InputTrace): RequestCoverageProof | null {
  if (!fingerprint || !confirmed(c)) return null;
  return requestCoverageReceipt(receipts, dir, c!.confirmationRef!, period, fingerprint, inputs);
}
export function readComparisonEvidence(receipts: TeamReceiptReads, dir: string, period: unknown, reported: unknown, inputs?: InputTrace): void {
  if (object(period) && typeof period.completionRef === "string") receipts.read(dir, period.completionRef, inputs);
  if (!object(reported)) return;
  if (typeof reported.ref === "string") receipts.read(dir, reported.ref, inputs);
  if (Array.isArray(reported.support)) {
    for (const item of referenceList(reported.support)) {
      if (object(item) && typeof item.ref === "string") receipts.read(dir, item.ref, inputs);
    }
  }
}
export function matchRequestCoverageProof(receipts: TeamReceiptReads, dir: string, reported: unknown, period: TeamPeriod, facts: PortableRequestFacts, inputs?: InputTrace): boolean {
  if (!object(reported) || Object.keys(reported).length !== 5) return false;
  const { ref, inputSha256, receiptSha256, sourceSha256, support } = reported;
  if (!shortText(ref, 240) || !hashValue(inputSha256) || !hashValue(receiptSha256) || !hashValue(sourceSha256) ||
      !Array.isArray(support) || support.length > 32) return false;
  const files: RequestSupportReceipt[] = [];
  for (const item of support) {
    if (!object(item) || Object.keys(item).length !== 2 || !shortText(item.ref, 240) || !hashValue(item.receiptSha256)) return false;
    files.push({ ref: item.ref, receiptSha256: item.receiptSha256 });
  }
  if (portableRequestInputHash(sourceSha256, facts, files) !== inputSha256 || !readRequestSupportingReceipts(receipts, dir, files, period, inputs)) return false;
  return requestCoverageReceipt(receipts, dir, ref, period, inputSha256, inputs, receiptSha256) !== null;
}
/** The legacy reader remains tolerant; an opted-in team snapshot must never turn an invalid row into zero. */
export function readTeamEvents(dir: string, project: string, inputs?: InputTrace): ProjectEvent[] | null {
  try {
    const text = utf8(regularBytes(safeTeamPath(dir, "log.jsonl"), 32 * 1024 * 1024));
    const events: ProjectEvent[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const value = strictJson(line);
      fields(value, ["ts", "p", "t", "type", "by", "msg", "to", "requestId", "role", "ok", "src", "ref", "data"], ["ts", "p", "type", "by", "msg"]);
      for (const key of ["ts", "p", "t", "type", "by", "msg", "to", "requestId", "src", "ref"]) if (value[key] !== undefined && typeof value[key] !== "string") throw new HandoffError("팀 사건의 문자열 필드에 다른 JSON 타입을 쓸 수 없다");
      const event = decodeEvent(value as unknown as ProjectEvent);
      if (event.p !== project) throw new HandoffError("다른 프로젝트의 사건 행");
      events.push(event);
    }
    inputs?.record(join(dir, "log.jsonl"), inputHash(text));
    return events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  } catch (e) { if (e instanceof InputSnapshotError) throw e; if ((e as NodeJS.ErrnoException).code === "ENOENT") { inputs?.absent?.(join(dir, "log.jsonl")); return null; } throw new HandoffError("팀 사건 로그 손상·미지원 형식: 총량 생성을 보류한다"); }
}
export function requestCovered(receipts: TeamReceiptReads, dir: string, requestId: string, c: Coverage, inputs?: InputTrace): boolean {
  return coverageMatches(receipts, dir, c, "coordinator-answer", undefined, requestId, inputs);
}
export function scopedRequestCovered(receipts: TeamReceiptReads, dir: string, requestId: string, c: Coverage, period: TeamPeriod, inputs?: InputTrace, matchedInputs?: InputTrace): boolean {
  return coverageMatches(receipts, dir, c, "coordinator-answer", period, requestId, inputs, matchedInputs);
}
export function comparisonContext(value: unknown): ComparisonContext {
  fields(value, ["study", "conditionCode", "definition", "unit", "workType", "sizeBand", "host", "sampleCount", "recordingBoundary", "qualitySource", "qualityScopeHash", "additionalSamplePlanRef"], []);
  if (value.study !== undefined && !["role-automation", "team-adoption", "definition-change"].includes(value.study as string) || value.conditionCode !== undefined && !CONDITIONS.includes(value.conditionCode as Condition) || value.unit !== undefined && !["project-start-to-merge", "representative-task"].includes(value.unit as string) || value.sampleCount !== undefined && (!natural(value.sampleCount) || value.sampleCount < 1) || value.qualitySource !== undefined && !["event-log", "audited-verdicts"].includes(value.qualitySource as string) || value.qualityScopeHash !== undefined && !hashValue(value.qualityScopeHash)) throw new HandoffError("팀 비교 조건/단위/표본/품질 출처 오류");
  for (const key of ["definition", "workType", "sizeBand", "host", "recordingBoundary"]) if (value[key] !== undefined && (!shortText(value[key], 96) || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value[key] as string))) throw new HandoffError("팀 비교 식별자는 짧은 typed 코드여야 한다");
  if (value.additionalSamplePlanRef !== undefined && !sourceRef(value.additionalSamplePlanRef)) throw new HandoffError("추가 표본 계획은 출처 locator여야 한다");
  return value as ComparisonContext;
}
export function teamPeriod(value: unknown): TeamPeriod {
  fields(value, ["start", "end", "unit", "closed", "completionRef"], ["start", "end", "unit", "closed"]);
  if (!(value.start === null || iso(value.start)) || !iso(value.end) || !["project-start-to-merge", "representative-task"].includes(value.unit as string) || typeof value.closed !== "boolean" || value.start !== null && Date.parse(value.start as string) > Date.parse(value.end as string) || value.completionRef !== undefined && !shortText(value.completionRef, 240)) throw new HandoffError("팀 측정 구간/완료 형식 오류");
  return value as unknown as TeamPeriod;
}
export function readTeamInput(root: string, projectDir: string, inputs?: InputTrace, receipts = new TeamReceiptReads(), forCommit = false): TeamInput | null {
  const path = safeTeamPath(root, `${projectDir}/${measurementFile}`); if (!existsSync(path)) { inputs?.absent?.(path); return null; }
  const value = metadataJson(path, 32768, inputs), dir = join(root, projectDir);
  fields(value, ["version", "comparison", "period", "counts", "observed_counts", "coverage", "request_coverage", "log_coverage", "quality_audit", "role_observations", "coordinator_answers"], ["version"]);
  if (value.version !== 1) throw new HandoffError("팀 측정 입력 버전 미지원");
  if (value.comparison !== undefined) comparisonContext(value.comparison);
  const completionRef = value.period === undefined ? undefined : teamPeriod(value.period).completionRef;
  const requestCoverage = value.request_coverage === undefined ? undefined : coverage(value.request_coverage);
  const optionalRefs = new Set(requestCoverage ? coverageRefs(requestCoverage) : []);
  if (completionRef) optionalRefs.add(completionRef);
  for (const ref of optionalRefs) {
    if (forCommit) receipts.require(dir, ref, inputs);
    else receipts.read(dir, ref, inputs);
  }
  // A shared path has the same availability policy for every declared use in a report.
  const checkCoverage = (value: unknown) => {
    for (const ref of coverageRefs(coverage(value))) {
      if (forCommit || !optionalRefs.has(ref)) receipts.require(dir, ref, inputs);
    }
  };
  for (const key of ["counts", "observed_counts"] as const) if (value[key] !== undefined) {
    fields(value[key], [...MANUAL_KEYS], []);
    if (Object.values(value[key] as Record<string, unknown>).some((n) => !nullableNatural(n))) throw new HandoffError("팀 수치는 음수 없는 정수 또는 null이어야 한다");
  }
  if (value.coverage !== undefined) { fields(value.coverage, [...MANUAL_KEYS], []); Object.values(value.coverage).forEach(checkCoverage); }
  if (value.log_coverage !== undefined) checkCoverage(value.log_coverage);
  if (value.quality_audit !== undefined) {
    fields(value.quality_audit, ["blocking_sum", "rereviews_after_fail", "coverage"]);
    if (!nullableNatural(value.quality_audit.blocking_sum) || !nullableNatural(value.quality_audit.rereviews_after_fail)) throw new HandoffError("감사 품질 수치 오류");
    checkCoverage(value.quality_audit.coverage);
  }
  for (const name of ["role_observations", "coordinator_answers"] as const) if (value[name] !== undefined && (!Array.isArray(value[name]) || value[name].length > 32)) throw new HandoffError("팀 관측 목록 한도/형식 오류");
  if (Array.isArray(value.role_observations)) {
    const roles = new Set<string>();
    for (const r of value.role_observations) {
      fields(r, ["role", "workMs", "outputTokens", "coverage"]);
      if (!identifier(r.role) || roles.has(r.role) || !nullableNatural(r.workMs) || !Array.isArray(r.outputTokens) || r.outputTokens.length > 8) throw new HandoffError("역할별 관측 수치/중복 오류");
      roles.add(r.role); const tools = new Set<string>();
      for (const output of r.outputTokens) { fields(output, ["tool", "output"]); if (!shortText(output.tool, 96) || !["Claude Code", "Codex", "Gemini CLI", "Cursor", "Antigravity"].includes(output.tool) || tools.has(output.tool) || !nullableNatural(output.output)) throw new HandoffError("역할별 출력 관측 오류"); tools.add(output.tool); }
      checkCoverage(r.coverage);
    }
  }
  if (Array.isArray(value.coordinator_answers)) for (const a of value.coordinator_answers) { fields(a, ["requestId", "coverage"]); if (!identifier(a.requestId)) throw new HandoffError("코디네이터 답 요청 ID 오류"); checkCoverage(a.coverage); }
  return value as unknown as TeamInput;
}

/** Commit eligibility is stricter than availability during a report. */
export function assertTeamCommitReceipts(root: string, projectDir: string, projectId: string, inputs?: InputTrace, logProofInputs?: InputTrace): void {
  const receipts = new TeamReceiptReads(), dir = join(root, projectDir);
  readTeamInput(root, projectDir, inputs, receipts, true);
  const events = readTeamEvents(dir, projectId, inputs) ?? [];
  const proposals = new Set(observeHandoffLedger(root, projectId, projectDir, inputs).rows
    .filter((row) => row.kind === "decision_request").map((row) => row.requestId));
  for (const event of events) {
    if (!event.ref) continue;
    const ownerAnswer = event.type === "answer" && event.by === "user";
    const nativeMirror = event.requestId !== undefined && (event.type === "question" || event.type === "escalation") && proposals.has(event.requestId);
    if (ownerAnswer || nativeMirror) receipts.requireIfPresent(dir, event.ref, logProofInputs);
  }
  receipts.assertStable();
}
