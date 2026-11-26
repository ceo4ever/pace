import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { listBriefs, resolveBacklog } from "../project/backlog.ts";
import { reviewHash } from "../project/pre-review.ts";
import { AgentError } from "./contract.ts";
import { decideReviewAdmission } from "./review-admission.ts";
import { readReviewBudget, recordedStage, type BudgetStage, type ReviewBudgetScope } from "./review-budget.ts";
import { LedgerError, ledgerPath, textHash, type DiagnosisEntry, type ReviewEntry } from "./review-log.ts";
import { assessStructuredReview, effectiveBlocking, evidenceGaps } from "./structured-review.ts";
import { endpointChoices, readRecovery, sameFinding, type EndpointChoice, type FindingKey, type FocusedCheck, type RecoveryEvent, type RootCheck } from "./review-recovery.ts";

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
type Event = Grant | Waiver | Started | Historical | RecoveryEvent;

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}

function validFinding(value: unknown): value is FindingKey {
  if (!value || typeof value !== "object") return false;
  const { id, location } = value as Record<string, unknown>;
  return typeof id === "string" && /^F\d+$/.test(id) && nonempty(location);
}

function validRecommendation(value: unknown): value is NonNullable<RootCheck["recommendation"]> {
  if (!value || typeof value !== "object") return false;
  const { choice, reason } = value as Record<string, unknown>;
  return endpointChoices.includes(choice as EndpointChoice) && nonempty(reason);
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
  if (row.type === "focused_check") return isHash(row.contract) && nonempty(row.source) &&
    validFinding(row.finding) && typeof row.diagnosed === "boolean" && nonempty(row.impact);
  if (row.type === "root_review") return isHash(row.contract) && nonempty(row.trigger) && (row.slot === 1 || row.slot === 2) &&
    nonempty(row.reviewer) && nonempty(row.provider) && nonempty(row.context) && typeof row.cross === "boolean" &&
    (row.cross_unavailable === undefined || nonempty(row.cross_unavailable)) && (row.root_cause === undefined || nonempty(row.root_cause));
  if (row.type === "root_check") return isHash(row.contract) && nonempty(row.root_review) && nonempty(row.impact) &&
    (row.change === undefined || nonempty(row.change)) && (row.recommendation === undefined || validRecommendation(row.recommendation));
  if (row.type === "contract_reset") return isHash(row.contract) && nonempty(row.trigger) && typeof row.finish === "boolean" &&
    (row.root_review === undefined || nonempty(row.root_review)) &&
    !!row.offsets && typeof row.offsets === "object" && !Array.isArray(row.offsets) &&
    Object.values(row.offsets).every((offset) => Number.isSafeInteger(offset) && offset >= 0);
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
  const events = loadEvents(scope);
  const recoveryEvents = events.filter((event): event is RecoveryEvent =>
    event.type === "focused_check" || event.type === "root_review" || event.type === "root_check" || event.type === "contract_reset");
  const reset = recoveryEvents.findLast((event) => event.type === "contract_reset" && event.stage === scope.stage);
  const budget = readReviewBudget(scope, reset?.type === "contract_reset" ? reset.offsets : undefined);
  const validReviews = budget.ledgers.flatMap(({ target: ledger, entries }) => {
    const voided = new Set(entries.flatMap((entry) => entry.type === "void" ? [entry.record] : []));
    return entries.flatMap((row) => row.type === "review" && !voided.has(row.record) ? [{ row, ledger }] : []);
  });
  const latestDiagnosis = budget.ledgers.flatMap(({ target: ledger, entries }) => entries.flatMap((row) =>
    row.type === "diagnosis" && row.recovery_id ? [{ row, ledger }] : []))
    .sort((a, b) => a.row.at.localeCompare(b.row.at)).at(-1);
  const diagnosed = latestDiagnosis && validReviews.filter(({ row, ledger }) => row.after_diagnosis?.id === latestDiagnosis.row.recovery_id &&
    !row.interrupted && (row.verdict === "fail" ||
      (row.verdict === "pass" && ledger === latestDiagnosis.ledger && row.target === latestDiagnosis.row.target)))
    .sort((a, b) => a.row.at.localeCompare(b.row.at))[0];
  const wasFocused = diagnosed && recoveryEvents.some((event) =>
    event.type === "focused_check" && event.diagnosed && event.id === diagnosed.row.followup?.id);
  const diagnosedFailure = diagnosed && !wasFocused && diagnosed.row.verdict === "fail" && diagnosed.row.after_diagnosis ? {
    grant: { id: diagnosed.row.after_diagnosis.id, contract: diagnosed.row.after_diagnosis.contract,
      stage: recordedStage(scope, diagnosed.ledger, diagnosed.row), target: relativeName(scope, join(dirname(diagnosed.ledger), diagnosed.row.target)) },
    result: diagnosed.row,
  } : undefined;
  const recovery = readRecovery(recoveryEvents, validReviews.map(({ row }) => row), diagnosedFailure);
  const activeDiagnosis = diagnosed ? undefined : latestDiagnosis?.row;
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
  return { budget, current, decision, pending, grant, jointAttempts, jointDecisions, recovery, activeDiagnosis };
}

type ReviewState = ReturnType<typeof readReviewState>;

export function checkGrant(scope: ReviewBudgetScope, target: string, grant: Pick<Proof, "evidence" | "evidence_hash">) {
  const proof = readProof(scope, target, join(scope.root, grant.evidence));
  if (proof.evidence_hash !== grant.evidence_hash) reject("후속 조치 근거가 기록 이후 바뀌었다");
}

export function openFollowup(scope: ReviewBudgetScope, target: string, hash: string, at: Date,
  selection: { type: "joint" | "waiver_request" | "owner"; file: string; summary: string; choice?: string; rounds?: number; proposed?: string }) {
  const state = readReviewState(scope, hash);
  const { evidence, evidence_hash, text } = readProof(scope, target, selection.file);
  const facts = { ...state.current, evidence, evidence_hash, summary: selection.summary, at: at.toISOString(), id: randomUUID() };
  const choice = selection.choice ?? "";
  if (state.recovery.upper && selection.type === "joint") reject("이 단위의 상위 검토 또는 합의 결정이 열려 있다");
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
      const gaps = latestEvidenceGaps(scope, state);
      if (gaps.some((finding) => !data.assessments.some((assessment) => assessment.finding === finding))) {
        reject("최신 기준별 증거 공백 중 빠진 A 판정이 있다");
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

function recordText(ledger: string, row: ReviewEntry): string | null {
  try {
    const record = JSON.parse(readFileSync(join(dirname(ledger), row.record), "utf8"));
    const text = record.result?.text;
    return record.review?.hash === row.hash && typeof text === "string" && textHash(text) === row.result_hash ? text : null;
  } catch {
    return null;
  }
}

function latestEvidenceGaps(scope: ReviewBudgetScope, state: ReviewState): string[] {
  const entries = state.budget.ledgers.find(({ target }) => target === scope.ledgerTarget)?.entries;
  const latest = entries?.findLast((row): row is ReviewEntry => row.type === "review" && row.target === scope.name &&
    !row.interrupted && !entries.some((entry) => entry.type === "void" && entry.target === row.target && entry.record === row.record));
  if (!latest?.structured_stage || latest.required_criteria === undefined) return [];
  const text = recordText(scope.ledgerTarget, latest);
  return text === null ? [] : evidenceGaps(assessStructuredReview(latest.structured_stage, text, latest.required_criteria));
}

function proofObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch { /* 명령의 공통 오류를 쓴다. */ }
  return reject("후속 근거에 필요한 JSON 필드를 확인할 수 없다");
}

function equivalentAgreement(data: Record<string, unknown>, previous: string, current: string): boolean {
  return data.agreement === "equivalent" && data.previous === previous && data.contract === current && nonempty(data.comparison);
}

function agreementSections(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split(/(?=^## )/m)
    .filter((section) => /^## (?:목적|목표|기준|합격 기준|완료 기준|범위|증명 범위)[ \t]*$/m.test(section))
    .map((section) => section.trim());
}

function contractHash(scope: ReviewBudgetScope): string {
  const task = scope.unit === "task";
  const file = join(scope.root, task ? "TASK.md" : "BACKLOG.md");
  try {
    if (!lstatSync(file).isFile()) throw new Error();
    const text = readFileSync(file, "utf8");
    const clauses = agreementSections(text);
    const related: string[][] = [];
    if (task) {
      const project = dirname(dirname(scope.root));
      const projectFile = join(project, "PROJECT.md");
      if (existsSync(projectFile)) {
        const projectText = readFileSync(projectFile, "utf8");
        related.push(agreementSections(projectText));
        const source = /^- 출처:.*?\b(BL\d{6}_\d{2})(?:_|\b)/m.exec(projectText)?.[1];
        const number = /^T(\d+)/.exec(basename(scope.root))?.[1];
        if (source && number) {
          const repo = dirname(dirname(project));
          const backlog = resolveBacklog(repo, source);
          related.push(agreementSections(readFileSync(join(backlog, "BACKLOG.md"), "utf8")));
          const brief = listBriefs(repo, backlog).find((entry) => entry.id === number);
          if (brief) related.push(agreementSections(readFileSync(brief.path, "utf8")));
        }
      }
    } else if (/^BR\d{2}_.+\.md$/.test(scope.name)) {
      const artifact = join(dirname(scope.ledgerTarget), scope.name);
      related.push(agreementSections(readFileSync(artifact, "utf8")));
    }
    return related.some((sections) => sections.length) || clauses.length
      ? textHash(JSON.stringify([clauses.length ? clauses : [reviewHash(text)], ...related])) : reviewHash(text);
  } catch {
    return reject("TASK·PROJECT·백로그의 합의 근거를 확인할 수 없다");
  }
}

function checkImpact(target: string, impact: string): void {
  const artifact = readFileSync(target, "utf8");
  // patch 대상일 때 기계로 관측되는 파일을 확인 범위에 모두 명시한다.
  if (!/^diff --git /m.test(artifact)) return;
  const files = new Set([...artifact.matchAll(/^(?:--- a\/|\+\+\+ b\/)([^\t\r\n]+?)[ \t]*\r?$/gm)].map((match) => match[1]));
  for (const file of files) {
    if (!file) continue;
    const path = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`(^|[^\\p{L}\\p{N}._/-])${path}(?=$|[^a-zA-Z0-9._/-])`, "u").test(impact)) {
      reject(`수정 영향이 빠졌다: ${file}. 확인 범위를 보완한다`);
    }
  }
}

function confirmationSource(scope: ReviewBudgetScope, state: ReviewState) {
  const base = state.budget.latestDefinitive;
  if (!base || base.ledgerTarget !== scope.ledgerTarget || base.entry.target !== scope.name ||
      base.entry.verdict !== "fail" || base.entry.structured_stage !== scope.stage) return undefined;
  const source = relativeName(scope, join(dirname(base.ledgerTarget), base.entry.record));
  const resolved = state.recovery.completed.filter((attempt) => attempt.grant.source === source && attempt.result.verdict === "pass");
  const text = recordText(base.ledgerTarget, base.entry);
  const known = text === null ? [] : assessStructuredReview(scope.stage, text, base.entry.required_criteria).findings?.flatMap((finding) =>
    finding.effective === "blocking" && finding.location ? [{ id: finding.id, location: finding.location }] : []) ?? [];
  if (!known.length) return undefined;
  const findings = known.filter((finding) => !resolved.some(({ grant }) => grant.diagnosed || sameFinding(grant.finding, finding)));
  const diagnoses = state.budget.ledgers.find(({ target }) => target === scope.ledgerTarget)?.entries;
  const diagnosis = diagnoses?.findLast((row): row is DiagnosisEntry =>
    row.type === "diagnosis" && row.target === scope.name && row.confirmation?.source === source);
  return { ...base, source, findings, diagnosis };
}

function canConfirm(state: ReviewState): boolean {
  return state.decision.kind === "exhausted" && state.jointAttempts >= 2 && !state.pending && !state.recovery.upper;
}

export function confirmationDiagnosis(scope: ReviewBudgetScope, target: string, hash: string, file: string | undefined) {
  const state = readReviewState(scope, hash);
  if (state.activeDiagnosis) reject("이 단위의 기록된 진단에 대한 독립 판정이 아직 없다");
  const latest = state.budget.latestDefinitive;
  if (state.pending || !latest || latest.entry.verdict !== "fail" ||
      latest.ledgerTarget !== scope.ledgerTarget || latest.entry.target !== scope.name) {
    return reject("같은 대상의 최신 유효 실패를 대조한 뒤 구조 진단을 기록한다");
  }
  const origin = confirmationSource(scope, state);
  if (origin && !origin.findings.length) reject("최신 독립 지적의 확인이 끝났다");
  const proof = readProof(scope, target, file ?? "");
  const source = relativeName(scope, join(dirname(latest.ledgerTarget), latest.entry.record));
  const focused = canConfirm(state) && !!origin && !origin.diagnosis && (state.recovery.ordinary.length >= 2 ||
    origin.findings.some((finding) => state.recovery.ordinary.some(({ grant }) => sameFinding(finding, grant.finding))));
  return { basis: { source, evidence_hash: proof.evidence_hash }, focused };
}

export function diagnosisLink(scope: ReviewBudgetScope, target: string,
  diagnosis: DiagnosisEntry): NonNullable<ReviewEntry["after_diagnosis"]> {
  if (!diagnosis.recovery_id || !diagnosis.file || !diagnosis.recovery_evidence ||
      readProof(scope, target, diagnosis.file).evidence_hash !== diagnosis.recovery_evidence.evidence_hash) {
    return reject("구조 진단의 근거 파일이 기록과 맞지 않는다");
  }
  return { id: diagnosis.recovery_id, contract: contractHash(scope) };
}

type RecoverySelection =
  | { type: "focused_check"; finding: FindingKey; impact: string; file: string; summary: string }
  | { type: "root_review"; file: string; summary: string }
  | { type: "contract_reset"; file: string; summary: string }
  | { type: "root_check"; impact: string; file: string; summary: string };

export function openRecovery(scope: ReviewBudgetScope, target: string, hash: string, at: Date, selection: RecoverySelection) {
  const state = readReviewState(scope, hash);
  const { text, ...proof } = readProof(scope, target, selection.file);
  const facts = { ...state.current, ...proof, id: randomUUID(), at: at.toISOString(), summary: selection.summary };
  const contract = contractHash(scope);
  const upper = state.recovery.upper;
  if (state.pending) reject("실제 A-3 제안의 owner 결정이 열려 있다");
  let event: RecoveryEvent;
  if (selection.type === "focused_check") {
    const origin = confirmationSource(scope, state);
    if (!canConfirm(state) || !origin || !origin.findings.some((finding) => sameFinding(finding, selection.finding)) ||
        origin.entry.hash === hash) return reject("일반·공동 예산과 최신 지적 ID·원래 위치 및 수정 지문을 대조한다");
    checkImpact(target, selection.impact);
    const previous = state.recovery.ordinary.some(({ grant }) => sameFinding(grant.finding, selection.finding));
    const needsDiagnosis = previous || state.recovery.ordinary.length >= 2;
    if (needsDiagnosis && !origin.diagnosis) reject("수정 확인 한도에 도달했다. 같은 원장에 구조 진단을 먼저 기록한다");
    if (origin.diagnosis) {
      if (state.recovery.diagnosed.some(({ grant }) => grant.source === origin.source)) {
        reject("이미 이 진단의 한정 확인을 기록했다");
      }
      if (!origin.diagnosis.file || !origin.diagnosis.confirmation ||
          readProof(scope, target, origin.diagnosis.file).evidence_hash !== origin.diagnosis.confirmation.evidence_hash) {
        reject("진단 근거가 기록과 맞지 않는다");
      }
    }
    event = { ...facts, type: selection.type, source: origin.source, finding: selection.finding,
      diagnosed: !!origin.diagnosis, impact: selection.impact, contract };
    const same = state.recovery.confirmations.findLast((prior) => sameTarget(prior, event) &&
      prior.source === origin.source && sameFinding(prior.finding, selection.finding) &&
      prior.evidence_hash === proof.evidence_hash && prior.contract === contract && prior.impact === selection.impact &&
      prior.diagnosed === !!origin.diagnosis);
    if (same) return same;
  } else {
    if (!upper || upper.trigger.grant.stage !== scope.stage || upper.trigger.grant.target !== state.current.target) {
      return reject("차단된 검토 단위의 원래 대상에 상위 근거를 연결한다");
    }
    const original = expectedContract(state, upper);
    if (selection.type === "contract_reset") {
      if (upper.action === "upper_review") reject("계약 변경의 근거가 되는 상위 검토 원문을 먼저 기록한다");
      const decision = proofObject(text);
      if (decision.by !== "user" || decision.decision !== "A-1" || decision.previous !== original ||
          decision.contract !== contract || original === contract || !nonempty(decision.receipt)) {
        reject("계약의 실제 변경과 이전·현재 계약 지문에 맞는 A-1 owner 원문이 필요하다");
      }
      event = { ...facts, type: selection.type, trigger: upper.trigger.grant.id, contract,
        finish: upper.action === "agreement_required",
        ...(upper.action === "upper_recheck" ? { root_review: upper.review.id } : {}),
        offsets: Object.fromEntries(state.budget.ledgers.map(({ target: ledger, entries }) => [relativeName(scope, ledger), entries.length])) };
    } else {
      if (selection.type === "root_review") {
        if (upper.action !== "upper_review" || hash !== upper.failed.hash) {
          return reject("실패 기준점의 현재 대상에서 상위 검토를 기록한다");
        }
        const data = proofObject(text);
        if (contract !== original && !equivalentAgreement(data, original, contract)) {
          reject("상위 검토를 열기 전에 변경된 합의 근거를 실패 당시 상태와 대조한다");
        }
        const { reviewer, author, worker, provider, context, cross } = data;
        if (data.trigger !== upper.trigger.grant.id || data.slot !== upper.slot ||
            data.target !== state.current.target || data.hash !== hash ||
            !nonempty(reviewer) || !nonempty(author) || !nonempty(worker) ||
            [author, worker].includes(reviewer) || !nonempty(provider) || !nonempty(context) ||
            state.recovery.rootReviews.some((prior) => prior.context === context) ||
            typeof cross !== "boolean" || (!cross && !nonempty(data.cross_unavailable)) ||
            !nonempty(data.analysis) || (upper.slot === 2 && (!nonempty(data.contract) || !nonempty(data.backlog)))) {
          return reject("독립 reviewer·별도 맥락·제공자와 근본 검토 원문을 대조한다");
        }
        event = { ...facts, type: selection.type, trigger: upper.trigger.grant.id, slot: upper.slot,
          reviewer, provider, context, cross, contract, root_cause: nonempty(data.root_cause) ? data.root_cause : data.analysis,
          ...(!cross && nonempty(data.cross_unavailable) ? { cross_unavailable: data.cross_unavailable } : {}) };
      } else {
        if (upper.action !== "upper_recheck") return reject("독립 상위 검토 원문을 먼저 기록한다");
        checkImpact(target, selection.impact);
        checkGrant(scope, target, upper.review);
        if (hash === upper.review.hash) reject("상위 해결안을 적용한 최신 변경 지문이 필요하다");
        const data = proofObject(text);
        if (data.agreement === "uncertain" || data.agreement === "changed") reject("A-1: 합의에 미치는 영향을 확인한 owner 결정이 필요하다");
        const agreementConfirmed = data.agreement === "confirmed" && contract === original;
        if (!agreementConfirmed && !equivalentAgreement(data, original, contract)) {
          reject("계약 문구의 전후 지문과 합의 영향 대조를 기록한다. 실제 합의가 바뀌면 A-1 결정이 필요하다");
        }
        if (data.verification !== "required" || data.upper !== upper.review.id || !nonempty(data.change)) {
          reject("필수 검증을 축소하거나 미확인 증거·잔여 blocking을 수용하려면 A-3 요청을 기록한다");
        }
        if (data.recommendation !== undefined && !validRecommendation(data.recommendation)) reject("허브 추천은 종료 선택지와 이유를 담는다");
        event = { ...facts, type: "root_check", root_review: upper.review.id, impact: selection.impact, contract, change: data.change,
          ...(validRecommendation(data.recommendation) ? { recommendation: data.recommendation } : {}) };
      }
    }
  }
  if (!eventValid(event)) return reject("후속 조치의 필수 필드가 비거나 잘못됐다");
  append(scope, event);
  return event;
}

function expectedContract(state: ReviewState, upper: NonNullable<ReviewState["recovery"]["upper"]>): string {
  const approval = upper.action === "upper_recheck" ? state.recovery.resets.findLast((reset) =>
    reset.trigger === upper.trigger.grant.id && reset.root_review === upper.review.id) : undefined;
  return approval?.contract ?? (upper.action === "upper_recheck" ? upper.review.contract : upper.contract);
}

export function recoveryGrant(scope: ReviewBudgetScope, state: ReviewState): FocusedCheck | RootCheck | undefined {
  if (state.pending) return undefined;
  const upper = state.recovery.upper;
  if (upper) {
    const grant = upper.action === "upper_recheck" ? upper.grant : undefined;
    return grant && sameTarget(grant, state.current) ? grant : undefined;
  }
  if (!canConfirm(state)) return undefined;
  const origin = confirmationSource(scope, state);
  return state.recovery.confirmations.findLast((grant) => sameTarget(grant, state.current) &&
    grant.source === origin?.source && !state.recovery.completed.some((entry) => entry.grant.id === grant.id));
}

export function checkRecoveryProof(scope: ReviewBudgetScope, target: string, grant: FocusedCheck | RootCheck, state: ReviewState, out?: string): void {
  if (grant.contract !== contractHash(scope)) reject("적용 당시의 계약 지문과 달라졌다. 합의 영향을 대조하고 확인 근거를 갱신한다");
  checkGrant(scope, target, grant);
  const protectedFiles = [join(scope.root, grant.evidence)];
  if (grant.type === "root_check") {
    const upper = state.recovery.upper;
    if (upper?.action !== "upper_recheck" || upper.review.id !== grant.root_review) reject("상위 근거와 확인의 연결이 달라졌다");
    checkGrant(scope, target, upper.review);
    protectedFiles.push(join(scope.root, upper.review.evidence));
  } else if (grant.diagnosed) {
    const diagnosis = confirmationSource(scope, state)?.diagnosis;
    if (!diagnosis?.file || !diagnosis.confirmation ||
        readProof(scope, target, diagnosis.file).evidence_hash !== diagnosis.confirmation.evidence_hash) {
      reject("수정 확인의 진단 근거가 기록과 맞지 않는다");
    }
    protectedFiles.push(diagnosis.file);
  }
  if (out) {
    const output = join(realpathSync(dirname(out)), basename(out)).toLowerCase();
    if (protectedFiles.some((file) => file.toLowerCase() === output)) reject("--out이 이번 독립 검토나 수정의 근거를 가리킨다");
  }
}

function rawBlocking(ledger: string, row: ReviewEntry): string[] | null {
  if (row.verdict !== "fail" || row.interrupted) return null;
  const text = recordText(ledger, row);
  if (text === null) return null;
  if (row.structured_stage) return effectiveBlocking(assessStructuredReview(row.structured_stage, text, row.required_criteria));
  const findings = text.split("\n").filter((line) => /\[blocking\]/i.test(line)).map((line) => line.trim());
  return findings.length ? findings : null;
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

function endpointReport(scope: ReviewBudgetScope, state: ReviewState,
  upper: Extract<NonNullable<ReviewState["recovery"]["upper"]>, { action: "agreement_required" }>) {
  const attempts = state.budget.ledgers.flatMap(({ target: ledger, entries }) => entries.flatMap((row) => {
    if (row.type !== "review") return [];
    return [{ at: row.at, stage: recordedStage(scope, ledger, row),
      target: relativeName(scope, join(dirname(ledger), row.target)),
      record: relativeName(scope, join(dirname(ledger), row.record)),
      verdict: row.verdict, cross: row.cross, interrupted: row.interrupted ?? false,
      invalidated: entries.some((entry) => entry.type === "void" && entry.record === row.record && entry.target === row.target),
      phase: row.followup?.type ?? "ordinary", ...(row.followup ? { id: row.followup.id } : {}) }];
  })).sort((a, b) => a.at.localeCompare(b.at));
  const last = state.recovery.upperResults.find(({ result }) => result === upper.failed);
  const ledger = state.budget.ledgers.find(({ entries }) => entries.includes(upper.failed))?.target;
  const text = ledger ? recordText(ledger, upper.failed) : null;
  const assessment = text !== null && upper.failed.structured_stage
    ? assessStructuredReview(upper.failed.structured_stage, text, upper.failed.required_criteria) : undefined;
  const recommendation = last?.grant.recommendation ?? {
    choice: "보류" as const,
    reason: "두 차례의 상위 해결안 확인 뒤에도 유효 판정이 실패했다. 실패를 재현하고 현재 기준을 유지할 수 있는지 결정할 때까지 단위를 보류한다.",
  };
  return {
    unit: { type: scope.unit, root: scope.root },
    target: upper.trigger.grant.target, stage: upper.trigger.grant.stage, hash: upper.failed.hash,
    timeline: {
      ordinary_calls: state.budget.ledgers.flatMap(({ target: ledger, entries }) => entries.flatMap((row) =>
        row.type === "call" ? [{ at: row.at, stage: recordedStage(scope, ledger, row),
          target: relativeName(scope, join(dirname(ledger), row.target)) }] : [])).sort((a, b) => a.at.localeCompare(b.at)),
      ordinary: attempts.filter((row) => row.phase === "ordinary"),
      joint: attempts.filter((row) => row.phase === "joint"),
      diagnoses: state.budget.ledgers.flatMap(({ target: ledger, entries }) => entries.flatMap((row) =>
        row.type === "diagnosis" ? [{ at: row.at, stage: recordedStage(scope, ledger, row), layer: row.layer,
          target: relativeName(scope, join(dirname(ledger), row.target)), summary: row.summary,
          ...(row.recovery_evidence ? { evidence: row.recovery_evidence } : {}) }] : []))
        .sort((a, b) => a.at.localeCompare(b.at)),
      confirmation: attempts.filter((row) => row.phase === "confirmation").map((row) => ({
        ...row, diagnosed: state.recovery.confirmations.find((grant) => grant.id === row.id)?.diagnosed ?? null,
      })),
      upper: state.recovery.rootReviews.filter((row) => row.trigger === upper.trigger.grant.id).map((row) => {
        const checked = state.recovery.upperResults.find(({ grant }) => grant.root_review === row.id);
        return { slot: row.slot, root_cause: row.root_cause ?? row.summary, review_evidence: row.evidence,
          applied_solution: checked?.grant.change ?? checked?.grant.summary ?? null,
          change_evidence: checked?.grant.evidence ?? null, verdict: checked?.result.verdict ?? null,
          result_record: checked && attempts.findLast((attempt) => attempt.phase === "upper" &&
            attempt.id === checked.grant.id && attempt.verdict === checked.result.verdict)?.record };
      }),
    },
    remaining_failure: {
      verdict: upper.failed.verdict,
      record: ledger ? relativeName(scope, join(dirname(ledger), upper.failed.record)) : null,
      findings: assessment?.findings?.flatMap(({ id, location, scenario, reproduction, confidence, effective, safety_path }) =>
        effective === "blocking" ? [{ id, location, scenario, reproduction, confidence, ...(safety_path ? { safety_path } : {}) }] : []) ?? null,
    },
    choices: endpointChoices,
    recommendation: { ...recommendation, source: last?.grant.recommendation ? "hub" : "default" },
  };
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
  const upper = state.recovery.upper;
  const endpoint = upper?.action === "agreement_required" ? endpointReport(scope, state, upper) : undefined;
  const gaps = latestEvidenceGaps(scope, state);
  const source = canConfirm(state) && confirmationSource(scope, state);
  const diagnosisRequired = source && source.findings.length && !source.diagnosis && (state.recovery.ordinary.length >= 2 ||
    source.findings.every((finding) => state.recovery.ordinary.some(({ grant }) => sameFinding(finding, grant.finding))));
  const action = request ? "owner_decision_required" : upper?.action ??
    (source ? !source.findings.length ? "confirmed_findings" : diagnosisRequired ? "diagnose" : "confirm_findings" : "classify_followup");
  return {
    ...state.current,
    action,
    decision: request ? "A-3" : upper?.action === "agreement_required" ? "A-1" : null,
    recommendation: request?.choice ?? endpoint?.recommendation.choice ?? null,
    choices: request?.choices ?? endpoint?.choices ?? [],
    ...(endpoint ? { endpoint } : {}),
    ...(gaps.length ? { evidence_action: { action: "collect_evidence", gaps, if_proceed_without_evidence: "A-3" } } : {}),
    ...(request ? { request } : {}),
    joint_attempts: state.jointAttempts,
    joint_decisions: state.jointDecisions,
    confirmation_count: state.recovery.ordinary.length,
    diagnostic_confirmation_count: state.recovery.diagnosed.length,
    confirmations: state.recovery.completed.map(({ grant, result }) => ({
      id: grant.id, finding: grant.finding, source: grant.source, target: grant.target, hash: result.hash,
      verdict: result.verdict, record: result.record, diagnosed: grant.diagnosed, cross: result.cross,
      ...(result.cross_unavailable ? { cross_unavailable: result.cross_unavailable } : {}),
    })),
    ...(source ? { confirmation_source: source.source, confirmation_findings: source.findings } : {}),
    upper_reviews: state.recovery.rootReviews.map(({ id, slot, evidence, provider, cross, cross_unavailable }) =>
      ({ id, slot, evidence, provider, cross, ...(cross_unavailable ? { cross_unavailable } : {}) })),
    upper_results: state.recovery.upperResults.map(({ grant, result }) => ({
      root_review: grant.root_review, target: grant.target, hash: result.hash, record: result.record, verdict: result.verdict,
      cross: result.cross, ...(result.cross_unavailable ? { cross_unavailable: result.cross_unavailable } : {}),
    })),
    ...(upper ? { upper: { trigger: upper.trigger.grant.id, stage: upper.trigger.grant.stage,
      target: upper.trigger.grant.target, source: upper.failed.record, hash: upper.failed.hash,
      contract: expectedContract(state, upper),
      ...(state.current.target === upper.trigger.grant.target ? { current_contract: contractHash(scope) } : {}),
      ...(upper.action !== "agreement_required" ? { slot: upper.slot } : {}) } } : {}),
    verdict_summary: !state.budget.latestDefinitive ? `유효 판정 없음(중단·무효 ${noVerdict}회)`
      : `일반 유효 판정 ${rounds}회, 최신 유효 판정 ${state.budget.latestDefinitive.entry.verdict}`,
    review_history: history,
    calls: entries.filter((row) => row.type === "call"),
    diagnoses: entries.filter((row) => row.type === "diagnosis"),
    voids: entries.filter((row) => row.type === "void"),
    finding_assessments: request?.assessments ?? latest?.blocking?.map((finding) => ({ finding, decision: null, reason: null })) ?? [],
  };
}
