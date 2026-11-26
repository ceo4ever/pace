import { randomUUID } from "node:crypto";
import { appendFileSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { AgentError } from "./contract.ts";
import { decideReviewAdmission } from "./review-admission.ts";
import { readReviewBudget, recordedStage, type BudgetStage, type ReviewBudgetScope } from "./review-budget.ts";
import { LedgerError, ledgerPath, textHash, type ReviewEntry } from "./review-log.ts";
import { assessStructuredReview, effectiveBlocking } from "./structured-review.ts";

export const FOLLOWUPS_FILE = "REVIEW-FOLLOWUPS.jsonl";
const HASH = /^[a-f0-9]{64}$/;

type ScopeKey = { stage: BudgetStage; target: string; hash: string };
type Proof = { evidence: string; evidence_hash: string; summary: string };
type RecordHeader = { id: string; at: string };
type Assessment = { finding: string; decision: string | null; reason: string };
type Proposal = { choices: string[]; assessments: Assessment[] };
type Grant = ScopeKey & Proof & RecordHeader & { type: "joint" | "owner"; choice: string; rounds: number };
type Waiver = ScopeKey & Proof & RecordHeader & Proposal & { type: "waiver_request"; choice: string; proposed: "skip" | "weaken" };
type Started = RecordHeader & { type: "started"; grant: string };
type Historical = ScopeKey & Proof & RecordHeader & { type: "confirmation" | "confirmation_request" | "recovery" | "withdrawal"; request?: string };
type Event = Grant | Waiver | Started | Historical;

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function proposalValid(value: Record<string, unknown>, choice: string): boolean {
  const { choices, assessments } = value;
  return Array.isArray(choices) && choices.every(nonempty) && new Set(choices).size >= 2 && choices.includes(choice) &&
    Array.isArray(assessments) && assessments.every((item: Assessment | null) => item &&
      nonempty(item.finding) && nonempty(item.reason) && (item.decision === null ||
        (typeof item.decision === "string" && /^A-[1-5]$/.test(item.decision)))) &&
    assessments.some((item: Assessment) => item.decision === "A-3");
}

function eventValid(item: unknown): item is Event {
  if (!item || typeof item !== "object") return false;
  const row = item as Record<string, unknown>;
  if (!nonempty(row.id) || !nonempty(row.at)) return false;
  if (row.type === "started") return nonempty(row.grant);
  if (!["pre", "post", "backlog"].includes(String(row.stage)) ||
      !nonempty(row.target) || typeof row.hash !== "string" || !HASH.test(row.hash) ||
      !nonempty(row.evidence) || typeof row.evidence_hash !== "string" || !HASH.test(row.evidence_hash) ||
      !nonempty(row.summary)) return false;
  if (row.type === "waiver_request") return (row.proposed === "skip" || row.proposed === "weaken") &&
    nonempty(row.choice) && proposalValid(row, row.choice);
  if (row.type === "joint") return row.rounds === 1 && nonempty(row.choice);
  if (row.type === "owner") return Number.isSafeInteger(row.rounds) && Number(row.rounds) >= 0 && nonempty(row.choice);
  if (row.type === "withdrawal") return nonempty(row.request);
  return row.type === "confirmation" || row.type === "confirmation_request" || row.type === "recovery";
}

function loadEvents(scope: ReviewBudgetScope): Event[] {
  const file = join(scope.root, FOLLOWUPS_FILE);
  let body: string;
  try {
    if (!lstatSync(file).isFile()) throw new Error();
    body = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new LedgerError(`검토 후속 원장을 읽을 수 없다: ${file}`);
  }
  return body.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      const row: unknown = JSON.parse(line);
      if (eventValid(row)) return [row];
    } catch { /* 공통 위치로 보고한다. */ }
    throw new LedgerError(`검토 후속 원장 손상: ${file}:${index + 1}`);
  });
}

function append(scope: ReviewBudgetScope, entry: Event) {
  try { appendFileSync(join(scope.root, FOLLOWUPS_FILE), JSON.stringify(entry) + "\n"); }
  catch { throw new LedgerError("검토 후속 원장을 기록하지 못했다"); }
}

function reject(message: string): never { throw new AgentError("invalid_request", message); }

function relativeName(scope: ReviewBudgetScope, file: string): string {
  return relative(scope.root, file).split(sep).join("/");
}

function sameTarget(a: ScopeKey, b: ScopeKey): boolean {
  return a.stage === b.stage && a.target === b.target && a.hash === b.hash;
}

function readProof(scope: ReviewBudgetScope, target: string, file: string) {
  const evidence = relativeName(scope, file);
  if (!evidence || isAbsolute(evidence) || evidence.split("/").includes("..")) reject("근거는 단위 안에 있어야 한다");
  try {
    if (file === target || realpathSync.native(file) !== file || !lstatSync(file).isFile()) throw new Error();
    const text = readFileSync(file, "utf8");
    if (!text.trim()) throw new Error();
    return { evidence, evidence_hash: textHash(text), text };
  } catch { return reject("근거가 비었거나 안전한 일반 파일이 아니다"); }
}

export function readReviewState(scope: ReviewBudgetScope, hash: string) {
  const budget = readReviewBudget(scope);
  const events = loadEvents(scope);
  const current: ScopeKey = { stage: scope.stage, target: relativeName(scope, join(dirname(scope.ledgerTarget), scope.name)), hash };
  const starts = new Map<string, number>();
  for (const event of events) {
    if (event.type === "started") starts.set(event.grant, (starts.get(event.grant) ?? 0) + 1);
  }
  const waiverIndex = events.findLastIndex((event) => event.type === "waiver_request");
  const waiver = events[waiverIndex] as Waiver | undefined;
  const pending = waiver && !events.slice(waiverIndex + 1).some((event) =>
    (event.type === "owner" && sameTarget(event, waiver)) ||
    (event.type === "withdrawal" && event.request === waiver.id)) ? waiver : undefined;
  const ownerIndex = events.findLastIndex((event) => event.type === "owner" && sameTarget(event, current));
  const owner = events[ownerIndex] as Grant | undefined;
  const joint = events.slice(Math.max(ownerIndex, 0)).findLast((event): event is Grant =>
    event.type === "joint" && sameTarget(event, current));
  const jointDecisions = events.filter((event): event is Grant => event.type === "joint");
  const jointAttempts = jointDecisions.reduce((total, grant) => total + (starts.get(grant.id) ?? 0), 0);
  const verdict = budget.latestDefinitive?.entry.verdict;
  const decision = decideReviewAdmission({
    budget: budget.status, pending: !!pending, latestVerdict: verdict === "pass" || verdict === "fail" ? verdict : null,
    jointAttempts, jointRecorded: !!joint && !starts.get(joint.id), ownerRounds: owner ? owner.rounds - (starts.get(owner.id) ?? 0) : null,
  });
  const grant = decision.kind === "owner" ? owner : decision.kind === "joint" ? joint : undefined;
  return { budget, current, decision, pending, grant, jointAttempts, jointDecisions };
}

type ReviewState = ReturnType<typeof readReviewState>;

export function checkGrant(scope: ReviewBudgetScope, target: string, grant: Grant) {
  const proof = readProof(scope, target, join(scope.root, grant.evidence));
  if (proof.evidence_hash !== grant.evidence_hash) reject("후속 조치 근거가 기록 이후 바뀌었다");
}

export function openFollowup(scope: ReviewBudgetScope, target: string, hash: string, at: Date,
  selection: { type: "joint" | "waiver_request" | "owner"; file: string; summary: string; choice?: string; rounds?: number; proposed?: string }) {
  const state = readReviewState(scope, hash);
  const { evidence, evidence_hash, text } = readProof(scope, target, selection.file);
  const facts = { ...state.current, evidence, evidence_hash, summary: selection.summary, at: at.toISOString(), id: randomUUID() };
  const choice = selection.choice ?? "";
  if (selection.type !== "owner" && state.pending) reject("승인 요청이 열려 있다");
  let entry: Grant | Waiver;
  switch (selection.type) {
    case "joint":
      if (!state.decision.canJoint) reject("현재 예산과 판정에서 공동 검토를 열 수 없다");
      entry = { ...facts, type: "joint", choice, rounds: 1 };
      break;
    case "waiver_request": {
      if (selection.proposed !== "skip" && selection.proposed !== "weaken") reject("A-3에는 실제 조치 skip 또는 weaken을 지정한다");
      let data: Proposal;
      try { data = JSON.parse(text); }
      catch { return reject("A-3 근거는 선택지와 지적별 A 판정·이유를 담은 JSON이다"); }
      if (!data || !proposalValid(data, choice)) reject("선택지·추천·지적별 A 판정과 이유가 필요하다");
      const latest = reviewHistory(scope, state).findLast((row) => row.target === scope.name &&
        row.from === relativeName(scope, ledgerPath(scope.ledgerTarget)) && !row.invalidated && !row.interrupted && row.verdict !== "unknown");
      if (latest?.blocking?.some((finding) => !data.assessments.some((assessment) => assessment.finding === finding))) {
        reject("최신 지적 중 빠진 A 판정이 있다");
      }
      entry = { ...facts, type: "waiver_request", choice, proposed: selection.proposed, choices: data.choices, assessments: data.assessments };
      break;
    }
    case "owner":
      if (!state.pending || !sameTarget(state.pending, state.current) || !state.pending.choices.includes(choice)) {
        reject("같은 대상·해시에서 열린 요청의 선택과 일치하는 owner 결정이 필요하다");
      }
      entry = { ...facts, type: "owner", choice, rounds: selection.rounds ?? 0 };
      break;
  }
  if (!eventValid(entry)) reject("후속 조치의 필수 필드가 비거나 잘못됐다");
  append(scope, entry);
  return entry;
}

export function recordFollowupExecution(scope: ReviewBudgetScope, grant: string, id: string, at: Date): void {
  append(scope, { type: "started", grant, id, at: at.toISOString() });
}

function rawBlocking(ledger: string, row: ReviewEntry): string[] | null {
  if (row.verdict !== "fail" || row.interrupted) return null;
  try {
    const result: { result?: { text?: unknown }; review?: { hash?: unknown } } =
      JSON.parse(readFileSync(join(dirname(ledger), row.record), "utf8"));
    const text = result.result?.text;
    if (result.review?.hash === row.hash && typeof text === "string" && textHash(text) === row.result_hash) {
      if (row.structured_stage) return effectiveBlocking(assessStructuredReview(row.structured_stage, text));
      const findings = text.split("\n").filter((line) => /\[blocking\]/i.test(line)).map((line) => line.trim());
      return findings.length ? findings : null;
    }
  } catch { /* 구 원장에는 판정 본문이 없을 수 있다. */ }
  return null;
}

function reviewHistory(scope: ReviewBudgetScope, state: ReviewState) {
  return state.budget.ledgers.flatMap(({ target: ledger, entries }) => entries.flatMap((row) => {
    if (row.type !== "review" || recordedStage(scope, ledger, row) !== scope.stage) return [];
    const invalidated = entries.find((item) => item.type === "void" && item.target === row.target && item.record === row.record) ?? null;
    return [{
      from: relativeName(scope, ledgerPath(ledger)), at: row.at, target: row.target, hash: row.hash, record: row.record,
      verdict: row.verdict, interrupted: row.interrupted ?? false, invalidated,
      ...(row.cross === undefined ? {} : { cross: row.cross }),
      ...(row.cross_unavailable ? { cross_unavailable: row.cross_unavailable } : {}),
      blocking: invalidated ? null : rawBlocking(ledger, row),
    }];
  })).sort((a, b) => a.at.localeCompare(b.at));
}

export function followupReport(scope: ReviewBudgetScope, state: ReviewState) {
  const history = reviewHistory(scope, state);
  const entries = state.budget.ledgers.flatMap(({ target, entries }) => entries
    .filter((row) => recordedStage(scope, target, row) === scope.stage)
    .map((row) => ({ ...row, from: relativeName(scope, ledgerPath(target)) })))
    .sort((a, b) => a.at.localeCompare(b.at));
  const request = state.pending;
  const latest = history.findLast((row) => row.target === scope.name && row.from === relativeName(scope, ledgerPath(scope.ledgerTarget)) &&
    !row.invalidated && !row.interrupted && row.verdict !== "unknown");
  const noVerdict = history.filter((row) => row.interrupted || row.invalidated).length;
  const rounds = state.budget.status.rounds;
  return {
    ...state.current,
    action: request ? "owner_decision_required" : "classify_followup",
    decision: request ? "A-3" : null,
    recommendation: request?.choice ?? null,
    choices: request?.choices ?? [],
    ...(request ? { request } : {}),
    joint_attempts: state.jointAttempts,
    joint_decisions: state.jointDecisions,
    verdict_summary: !state.budget.latestDefinitive ? `유효 판정 없음(중단·무효 ${noVerdict}회)`
      : `일반 유효 판정 ${rounds}회, 최신 유효 판정 ${state.budget.latestDefinitive.entry.verdict}`,
    review_history: history,
    calls: entries.filter((row) => row.type === "call"),
    diagnoses: entries.filter((row) => row.type === "diagnosis"),
    voids: entries.filter((row) => row.type === "void"),
    finding_assessments: request?.assessments ?? latest?.blocking?.map((finding) => ({ finding, decision: null, reason: null })) ?? [],
  };
}
