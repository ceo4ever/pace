import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { regularBytes, utf8 } from "../project/handoff-files.ts";
import { approvedTaskEdit, proofScopeIssues, reviewerLineIssues, reviewHash } from "../project/pre-review.ts";
import { permissionBasis, type PermissionBasis } from "../project/review-permission.ts";
import { readAgentCalls, recordAgentCall, type AgentCall, type CallTarget } from "../project/agent-calls.ts";
import { AgentError, errorCodes, errorPayload, providerOf } from "./contract.ts";
import { automaticCallTarget, tryRecordCall } from "./call-context.ts";
import { reserveReviewCall, reviewBudgetScope, type ReviewBudgetScope, type BudgetStage } from "./review-budget.ts";
import { postTargetIssue, postTaskContract, reviewCriteria } from "./review-criteria.ts";
import { diagnosisLink, FOLLOWUPS_FILE, followupReport, readReviewState, recoveryGrant } from "./review-followup.ts";
import { acquireLock, appendLedger, fixedReviewPath, LedgerError, ledgerPath, lockPath, nextRecordName, RECORDS_DIR, REVIEW_HAND_ID, textHash, type ReviewEntry } from "./review-log.ts";
import { assessStructuredReview, evidenceGaps } from "./structured-review.ts";
import { buildVerifyPrompt } from "./verify.ts";
import { evidenceRereviewBase, loadRereview, recoverBudgetOrphans, writeOrLedgerError } from "./verify-cli.ts";

export const REVIEW_HAND_USAGE = "pace agent review-hand --target <파일> --author-provider <제공자> --purpose-file <파일>";
export const REVIEW_RECORD_USAGE = "pace agent review-record --target <파일> --hand <ID> --provider <제공자> --reviewer <도구> --result-file <파일> [--unavailable-file <파일>] [--call-id <시도 ID>]";

type ReviewState = ReturnType<typeof readReviewState>;
type FixedReview = {
  version: 1;
  target: string;
  stage: BudgetStage;
  kind: ReviewBudgetScope["kind"];
  author_provider: string;
  hash: string;
  snapshot: string;
  prompt: string;
  required_criteria: string[];
  criteria_digest: string;
  permission_basis?: PermissionBasis;
  rereview_of: string | null;
  after_diagnosis?: ReviewEntry["after_diagnosis"];
};
const TEXT_LIMIT = 16 * 1024 * 1024;

function reject(message: string): never { throw new AgentError("invalid_request", message); }

interface ExternalCallLink { target: CallTarget; call: AgentCall }
function externalCallLink(target: string, id: string | undefined, reviewer: string, provider: string, issuedAt: string, submittedAt: string, prior?: string): ExternalCallLink | undefined {
  if (id === undefined) return undefined;
  if (!/^[a-f0-9]{32,64}$/.test(id)) return reject("--call-id는 호출 원장의 시도 ID여야 한다");
  const callTarget = automaticCallTarget(dirname(target), undefined, undefined, target);
  if (!callTarget) return reject("외부 검토에 연결할 호출 원장 범위를 확인할 수 없다");
  const calls = readAgentCalls(callTarget) ?? [];
  const call = calls.find((item) => item.id === id);
  const ref = prior && externalCallRef(callTarget, prior);
  if (!call || call.task !== callTarget.task || call.agent !== reviewer || (call.engine && providerOf[call.engine] !== provider) ||
      Date.parse(call.at) < Date.parse(issuedAt) || Date.parse(call.at) > Date.parse(submittedAt) || call.route === "verify" ||
      (call.status !== "completed" && call.status !== "unknown") || call.reason !== null || (call.ref !== null && call.ref !== ref) ||
      (ref && calls.some((other) => other.id !== id && other.ref === ref))) {
    return reject("이미 연결됐거나 범위·구성원·제공자·호출 시점·상태가 외부 검토와 맞지 않는다");
  }
  return { target: callTarget, call };
}

function externalCallRef(target: CallTarget, path: string): string {
  return relative(join(target.root, target.directory), path).split(sep).join("/");
}

function recordExternalCallLink(link: ExternalCallLink, destination: string, writeCall: typeof tryRecordCall) {
  const { target, call } = link;
  const linked = writeCall(target, { ...call, ref: externalCallRef(target, destination) });
  return { agent_call_id: call.id, agent_call_linked: linked };
}

/** 고정 뒤 판정 기준이 바뀌었는지 대조한다. 구현 후 묶음은 항목이 고정이라 붙인 태스크 계약 원문을 함께 본다. */
function criteriaDigest(criteria: readonly { id: string; text: string }[], contract: string | undefined): string {
  return textHash(JSON.stringify(contract === undefined ? criteria : { criteria, contract }));
}

export function reviewIdentity(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

export function reviewInput(file: string): string {
  try { return utf8(regularBytes(file, TEXT_LIMIT)); }
  catch { return reject("검토 입력을 안전한 일반 UTF-8 파일로 읽을 수 없다"); }
}

export function assertManagedFile(file: string, directory = false): boolean {
  try {
    const stat = lstatSync(file);
    if (directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1) return true;
    return reject("검토 관리 경로가 일반 파일·디렉터리가 아니다");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function reviewTarget(input?: string) {
  if (!input) return reject("--target이 필요하다");
  const lexical = resolve(input);
  try {
    const scope = reviewBudgetScope(lexical);
    if (!scope || !lstatSync(lexical).isFile()) throw new Error();
    const parent = scope.unit === "task" ? dirname(dirname(scope.root)) : scope.root;
    const root = dirname(dirname(parent));
    const candidate = realpathSync.native(lexical);
    if (join(realpathSync.native(root), relative(root, lexical)) !== candidate) throw new Error();
    return candidate;
  } catch { return reject("검토 대상은 단위 안의 링크 없는 일반 파일이어야 한다"); }
}

export function lockReviewScope(scope: ReviewBudgetScope): () => void {
  for (const target of scope.ledgerTargets) {
    assertManagedFile(ledgerPath(target));
    const records = join(dirname(target), RECORDS_DIR);
    if (assertManagedFile(records, true)) {
      for (const name of readdirSync(records)) {
        if (/^(?:R\d+|H-[a-f0-9-]+)\.json$/.test(name)) assertManagedFile(join(records, name));
      }
    }
  }
  assertManagedFile(join(scope.root, FOLLOWUPS_FILE));
  assertManagedFile(lockPath(scope.lockTarget));
  return acquireLock(scope.lockTarget);
}

const reply = (write: (text: string) => void, value: unknown) => write(JSON.stringify(value, null, 2) + "\n");

function reportsToVerify(scope: ReviewBudgetScope, state: ReviewState, write: (text: string) => void, reason?: string) {
  reply(write, {
    ran: false,
    reason: reason ?? state.recovery.upper?.action ?? (state.pending ? "owner_decision_required" : "budget_exhausted"),
    budget: state.budget.status, followup: followupReport(scope, state), next_command: "pace agent verify",
  });
  return errorCodes.review_escalation;
}

function ordinaryBase(scope: ReviewBudgetScope, state: ReviewState, ids: readonly string[]) {
  if (state.budget.latest || state.budget.latestDefinitive) return state.budget.latest;
  const entry = evidenceRereviewBase(scope.ledgerTarget, scope.name, ids, state.budget.currentEntries);
  return entry ? { ledgerTarget: scope.ledgerTarget, entry } : undefined;
}

function reviewReference(scope: ReviewBudgetScope, latest: ReturnType<typeof ordinaryBase>): string | null {
  return latest ? relative(dirname(scope.ledgerTarget), join(dirname(latest.ledgerTarget), latest.entry.record)).split(sep).join("/") : null;
}

function fallbackReason(file: string | undefined, author: string, provider: string) {
  if (author !== provider) {
    if (file !== undefined) reject("교차 검토에는 같은 제공자 대체 근거를 붙이지 않는다");
    return undefined;
  }
  if (!file) return reject("같은 제공자 검토에는 교차 미실행 근거 파일이 필요하다");
  let proof;
  try { proof = JSON.parse(reviewInput(file)); }
  catch { return reject("교차 미실행 근거 JSON을 확인할 수 없다"); }
  if (proof?.ran !== false || !reviewIdentity(proof.provider) || proof.provider === author || typeof proof.reason !== "string" ||
      !proof.reason.trim()) return reject("교차 미실행에 ran=false·다른 provider·reason이 필요하다");
  return { provider: proof.provider, reason: proof.reason.trim() };
}

export function reviewArtifactCommand(action: "review-hand" | "review-record", args: string[],
  deps: { write: (text: string) => void; now?: () => Date; writeCall?: typeof tryRecordCall }): number {
  const { values }: { values: Partial<Record<string, string>> } = action === "review-hand"
    ? parseArgs({ args, strict: true, options: {
      target: { type: "string" }, "author-provider": { type: "string" }, "purpose-file": { type: "string" },
    } })
    : parseArgs({ args, strict: true, options: {
      target: { type: "string" }, hand: { type: "string" }, provider: { type: "string" }, reviewer: { type: "string" },
      "result-file": { type: "string" }, "unavailable-file": { type: "string" }, "call-id": { type: "string" },
    } });
  const now = deps.now ?? (() => new Date());
  const writeCall = deps.writeCall ?? tryRecordCall;
  let release: (() => void) | undefined;
  try {
    const target = reviewTarget(values.target);
    const scope = reviewBudgetScope(target) ?? reject("태스크·백로그 안의 검토 대상이 필요하다");
    release = lockReviewScope(scope);
    const snapshot = reviewInput(target);
    // 사후 reviewer는 구현 diff만 본다. 형식 거부는 중단 복구·소진 판정보다 먼저다 — 원장을 바꾸지 않고 tester 경로를 안내한다.
    if (action === "review-hand" && scope.stage === "post") {
      const issue = postTargetIssue(snapshot);
      if (issue) return reject(issue);
    }
    recoverBudgetOrphans(scope, now);
    const hash = reviewHash(snapshot);
    const state = readReviewState(scope, hash);
    const recovery = state.recovery.upper || recoveryGrant(scope, state) || state.decision.kind === "joint" || state.decision.kind === "owner";

    if (action === "review-hand") {
      if (recovery || state.decision.kind !== "ordinary") return reportsToVerify(scope, state, deps.write);
      if (!reviewIdentity(values["author-provider"]) || !values["purpose-file"]) return reject(REVIEW_HAND_USAGE);
      if (scope.stage === "pre") {
        const issues = [...proofScopeIssues(snapshot), ...reviewerLineIssues(snapshot)];
        if (issues.length) return reject(issues.join(" · "));
      }
      const taskContract = scope.stage === "post" ? postTaskContract(scope) : undefined;
      const purpose = reviewInput(values["purpose-file"]);
      if (!purpose.trim()) return reject("검토의 상위 목적이 비었다");
      const criteria = reviewCriteria(scope, snapshot);
      const ids = criteria.map(({ id }) => id);
      const basis = scope.stage === "pre" ? permissionBasis(scope.root, target) ?? undefined : undefined;
      const previous = ordinaryBase(scope, state, ids);
      const rereview = previous && loadRereview(previous.ledgerTarget, previous.entry, target, hash, snapshot, scope.kind, scope);
      const taskEdit = scope.stage === "post" ? approvedTaskEdit(scope.root) : undefined;
      const fixed: FixedReview = {
        version: 1, target: scope.name, stage: scope.stage, kind: scope.kind, author_provider: values["author-provider"],
        hash, snapshot, prompt: buildVerifyPrompt(purpose, scope.name, snapshot, scope.kind, rereview, scope.stage, undefined, criteria, !!basis,
          taskEdit ? JSON.stringify(taskEdit, null, 2) : undefined, taskContract),
        required_criteria: ids, criteria_digest: criteriaDigest(criteria, taskContract),
        ...(basis ? { permission_basis: basis } : {}),
        rereview_of: reviewReference(scope, previous),
        ...(state.activeDiagnosis ? { after_diagnosis: diagnosisLink(scope, target, state.activeDiagnosis) } : {}),
      };
      const id = randomUUID();
      const data = JSON.stringify(fixed, null, 2) + "\n";
      if (Buffer.byteLength(data) > TEXT_LIMIT) return reject("고정할 검토 입력이 너무 크다");
      const path = fixedReviewPath(scope.ledgerTarget, id);
      if (assertManagedFile(path)) return reject("검토 고정 ID가 이미 있다");
      const reservation = reserveReviewCall(scope, now(), state.budget, { callId: id, digest: textHash(data) });
      if (!reservation.callId) return reportsToVerify(scope, state, deps.write);
      writeOrLedgerError(path, data, "검토 고정본");
      reply(deps.write, { ran: false, handed: true, hand: id, snapshot: path, hash, budget: readReviewState(scope, hash).budget.status });
      return 0;
    }

    const id = values.hand;
    if (!id || !REVIEW_HAND_ID.test(id) || !reviewIdentity(values.provider) || !reviewIdentity(values.reviewer) || !values["result-file"]) {
      return reject(REVIEW_RECORD_USAGE);
    }
    const reservation = state.budget.currentEntries.find((row) => row.type === "call" && row.call_id === id && row.target === scope.name);
    if (reservation?.type !== "call" || !reservation.frozen_digest) return reject("이 대상·단계의 원장에 예약된 외부 고정이 없다");
    const claim = textHash(`pace-external-review-call/v1\0${id}`);
    const previous = state.budget.currentEntries.find((row): row is ReviewEntry => row.type === "review" && row.call_id === id);
    if (previous) {
      if (!values["call-id"] || previous.provider !== values.provider || previous.verifier !== values.reviewer || previous.interrupted ||
          textHash(reviewInput(values["result-file"])) !== previous.result_hash) return reject("이미 판정을 기록한 외부 고정이다");
      const destination = join(dirname(scope.ledgerTarget), previous.record);
      const link = externalCallLink(target, values["call-id"], values.reviewer, values.provider, reservation.at, previous.at, destination)!;
      if (link.call.review_claim !== claim) return reject("호출 시도가 기존 외부 예약과 맞지 않는다");
      reply(deps.write, { recorded: true, source: "external", review: previous, ...recordExternalCallLink(link, destination, writeCall), agent_call_retry: true,
        budget: state.budget.status, ...(state.recovery.upper ? { followup: followupReport(scope, state) } : {}) });
      return 0;
    }
    if (recovery || state.pending || state.budget.status.rounds >= state.budget.status.round_limit) {
      return reportsToVerify(scope, state, deps.write);
    }
    const data = reviewInput(fixedReviewPath(scope.ledgerTarget, id));
    if (textHash(data) !== reservation.frozen_digest) return reject("고정 원문이 원장의 지문과 다르다");
    const fixed: FixedReview = JSON.parse(data);
    if (fixed.version !== 1 || fixed.target !== scope.name || fixed.stage !== scope.stage || fixed.kind !== scope.kind ||
        reviewHash(fixed.snapshot) !== fixed.hash) return reject("외부 고정 대상·단계·해시가 다르다");
    const cross = fixed.author_provider !== values.provider;
    const unavailable = fallbackReason(values["unavailable-file"], fixed.author_provider, values.provider);
    if (!cross && state.budget.currentEntries.some((row) => row.type === "review" && row.target === scope.name &&
        row.hash === fixed.hash && row.cross === true && row.verdict === "fail" && !row.interrupted)) {
      return reject("같은 대상의 교차 실패를 같은 제공자 검토로 대체할 수 없다");
    }
    const raw = reviewInput(values["result-file"]);
    if (!raw.trim()) return reject("외부 검토 원문이 비었다");
    const at = now().toISOString();
    const link = externalCallLink(target, values["call-id"], values.reviewer, values.provider, reservation.at, at);
    const currentDiagnosis = state.activeDiagnosis && diagnosisLink(scope, target, state.activeDiagnosis);
    const criteria = reviewCriteria(scope, snapshot);
    const contract = scope.stage === "post" ? postTaskContract(scope) : undefined;
    const stale = fixed.hash !== hash || fixed.criteria_digest !== criteriaDigest(criteria, contract) ||
      fixed.rereview_of !== reviewReference(scope, ordinaryBase(scope, state, criteria.map(({ id }) => id))) ||
      fixed.after_diagnosis?.id !== currentDiagnosis?.id || fixed.after_diagnosis?.contract !== currentDiagnosis?.contract;
    const assessment = assessStructuredReview(scope.stage, raw, fixed.required_criteria,
      fixed.permission_basis ? fixed.snapshot.split("\n").length : undefined);
    const verdict = stale ? "unknown" : assessment.verdict;
    const permission = verdict === "pass" && assessment.permission && fixed.permission_basis
      ? { ...assessment.permission, ...fixed.permission_basis } : undefined;
    const format = {
      required_criteria: fixed.required_criteria,
      ...(fixed.permission_basis ? { permission_basis: fixed.permission_basis } : {}),
    };
    const record = nextRecordName(scope.ledgerTarget);
    const destination = join(dirname(scope.ledgerTarget), record);
    if (link) {
      try { link.call = recordAgentCall(link.target, { ...link.call, review_claim: claim }, { claimReview: true }); }
      catch { return reject("호출에 외부 검토를 예약할 수 없다. 기존 참조나 다른 예약을 확인한다"); }
    }
    const cross_unavailable = unavailable ? [unavailable.reason] : undefined;
    const review = {
      target: scope.name, hash: fixed.hash, kind: scope.kind, verdict, rereview_of: fixed.rereview_of, call_id: id,
      structured_stage: scope.stage, ...format, ...(stale ? { stale: true as const } : {}),
      ...(permission ? { permission } : {}), ...(fixed.after_diagnosis ? { after_diagnosis: fixed.after_diagnosis } : {}),
    };
    const usage = { input_tokens: null, output_tokens: null };
    writeOrLedgerError(destination, JSON.stringify({ pending: true, review }) + "\n", "외부 검토 기록 자리");
    appendLedger(scope.ledgerTarget, { type: "format", at, target: review.target, hash: review.hash, record, ...format });
    writeOrLedgerError(destination, JSON.stringify({
      source: "external", verifier: values.reviewer, cross, cross_unavailable, cross_attempt: unavailable, assessment,
      ...(link ? { agent_call_id: link.call.id } : {}),
      result: { text: raw, provider: { value: values.provider, source: "submitted" }, session_id: null, usage },
      review: { ...review, snapshot: fixed.snapshot },
    }, null, 2) + "\n", "외부 검토 기록");
    appendLedger(scope.ledgerTarget, { ...review, type: "review", at, provider: values.provider, verifier: values.reviewer,
      cross, ...(cross_unavailable ? { cross_unavailable } : {}), record, result_hash: textHash(raw), usage });
    const after = readReviewState(scope, hash);
    const linked = link && recordExternalCallLink(link, destination, writeCall);
    const gaps = stale ? [] : evidenceGaps(assessment);
    reply(deps.write, { recorded: true, source: "external", cross, review: { ...review, record }, assessment, budget: after.budget.status, ...linked,
      ...(gaps.length ? { evidence_action: { action: "collect_evidence", gaps, if_proceed_without_evidence: "A-3" } } : {}),
      ...(stale ? { warning: "고정 이후 대상이나 재검토 기준이 바뀌어 현재 허가는 기록하지 않았다" } : {}),
      ...(after.recovery.upper ? { followup: followupReport(scope, after) } : {}),
    });
    return 0;
  } catch (error) {
    const failure = error instanceof AgentError ? error : new AgentError("invalid_request", error instanceof LedgerError ? error.message :
      "검토의 고정 또는 기록 경계를 확인할 수 없다");
    reply(deps.write, errorPayload(failure));
    return failure.exitCode;
  } finally {
    release?.();
  }
}
