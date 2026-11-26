import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { proofScopeIssues, reviewHash } from "../project/pre-review.ts";
import { AgentError, errorCodes, errorPayload, type Executor } from "./contract.ts";
import {
  acquireLock, appendLedger, escalationNext, LAYERS, LedgerError, ledgerPath, lockPath, nextRecordName, orphanRecords, parseVerdict, readLedger, RECORDS_DIR, RECOVERY_LOCK_FILE, reviewStage,
  lineDiff, reviewUsage, targetName, textHash, validCrossUnavailable, validFollowup, type Layer, type LedgerEntry, type ReviewEntry, type StageInfo,
} from "./review-log.ts";
import { readReviewBudget, reserveReviewCall, reviewBudgetScope, type ReviewBudgetScope } from "./review-budget.ts";
import { checkGrant, followupReport, FOLLOWUPS_FILE, openFollowup, readReviewState, recordFollowupExecution } from "./review-followup.ts";
import { crossVerify, type Rereview, type VerifyKind } from "./verify.ts";

// `pace agent verify`·`pace agent review-note` 명령 처리 (P007 T01). src/cli.ts는 여기로 위임만 한다 — 시험이 실행기를 주입해 같은 경로를 탄다.

export interface VerifyCliDeps {
  executors: () => Executor[];
  write: (text: string) => void;
  now?: () => Date;
}

export const VERIFY_USAGE = "pace agent verify --author-agent claude|codex --target <산출물 파일> (--purpose <글>|--purpose-file <파일>) [--kind goal|task] [--allow-same-provider] [--out <기록 파일>]";
export const REVIEW_NOTE_USAGE = 'pace agent review-note --target <파일> (--diagnosis | --decision --by pm|user [--resume] [--rounds <회차>] | --void --record <검토 기록> | --joint | --request-waiver skip|weaken) --summary "<근거 요약>" [--choice "<조치 또는 추천>"] [--file <근거>]';

const ESCALATION_EXIT = errorCodes.review_escalation;

function req(value: string | undefined, usage: string): string {
  if (value === undefined || value === "") throw new AgentError("invalid_request", `인자가 부족하다 — ${usage}`);
  return value;
}

/** 대상은 실제 경로로 연다 — 링크 별칭으로 다른 원장을 써서 단계를 우회하지 못하게 */
function realTarget(path: string): string {
  try { return realpathSync.native(path); } catch { throw new AgentError("invalid_request", `대상이 없다: ${path}`); }
}

function checkOut(out: string, target: string, ledgers: readonly string[], scope?: ReviewBudgetScope): void {
  let real: string;
  try { real = join(realpathSync(dirname(resolve(out))), basename(out)); } catch { throw new AgentError("invalid_request", `--out 폴더가 없다: ${out}`); }
  // 쓰기는 rename 교체라 링크·하드링크 너머 파일을 고치지 않는다 — 여기서는 관리 파일의 이름 자체를 바꿔 끼우지 못하게만 막는다
  // 대소문자를 구분하지 않는 볼륨(macOS·Windows 기본)에서는 철자만 다른 경로가 같은 파일이다 — 비교는 대소문자 무시
  const low = real.toLowerCase();
  const managed = ledgers.some((ledger) => {
    const records = join(dirname(ledger), RECORDS_DIR).toLowerCase();
    return [ledgerPath(ledger), lockPath(ledger), join(dirname(ledger), RECOVERY_LOCK_FILE)].some((p) => p.toLowerCase() === low) || low === records || low.startsWith(records + sep);
  });
  const followups = scope && dirname(low) === scope.root.toLowerCase()
    && (basename(low) === FOLLOWUPS_FILE.toLowerCase() || /^review-(confirmation-[a-f0-9-]+|escalation-(pre|post|backlog))\.json$/.test(basename(low)));
  if (target.toLowerCase() === low || managed || followups) {
    throw new AgentError("invalid_request", "--out이 대상·검토 원장·잠금 파일·기록 폴더를 가리킨다");
  }
}

/** 같은 폴더 임시 파일에 쓴 뒤 rename으로 이름을 바꿔 끼운다 — 기존 파일(링크·하드링크로 이어진 다른 파일 포함)의 내용을 고치지 않는다 */
function writeOrLedgerError(file: string, text: string, what: string): void {
  const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tmp, text, { flag: "wx" });
    renameSync(tmp, file);
  } catch (error) {
    try { rmSync(tmp, { force: true }); } catch { /* 임시 파일 정리 실패는 무시 */ }
    throw new LedgerError(`${what}을 쓰지 못했다: ${file} — ${(error as Error).message}`);
  }
}

/** 기록 자리를 지우고, 기록 폴더가 비면 폴더도 치운다 */
function clearPending(recordFile: string): void {
  try { rmSync(recordFile, { force: true }); } catch (error) { throw new LedgerError(`검토 기록 자리를 치우지 못했다: ${recordFile} — 판정이 없으니 지운 뒤 다시 실행한다 (${(error as Error).message})`); }
  try { rmdirSync(dirname(recordFile)); } catch { /* 다른 기록이 있으면 남긴다 */ }
}

function escalation(info: StageInfo, target: string) {
  return { stage: info.stage, consecutive_fails: info.consecutive_fails, last_decision_by: info.last_decision_by, next: escalationNext(info.stage, target, info.consecutive_fails) };
}

function exhaustedFollowup(scope: ReviewBudgetScope, state: ReturnType<typeof readReviewState>) {
  const followup = followupReport(scope, state);
  const report = `REVIEW-ESCALATION-${scope.stage}.json`;
  writeOrLedgerError(join(scope.root, report), JSON.stringify(followup, null, 2) + "\n", "검토 소진 보고");
  return { ...followup, report };
}

/** 기준점 검토의 기록이 원장과 맞는지 확인하고 재검토 입력을 만든다 */
function loadRereview(ledgerTarget: string, base: ReviewEntry, target: string, currentHash: string, current: string, legacyKind?: VerifyKind): Rereview | undefined {
  const sameTarget = join(dirname(ledgerTarget), base.target) === target;
  if (sameTarget && currentHash === base.hash && base.verdict === "fail") throw new AgentError("invalid_request", `직전 fail 검토(${base.record}) 뒤 대상이 바뀌지 않았다 — 지적을 반영한 뒤 다시 검토한다`);
  const file = join(dirname(ledgerTarget), base.record);
  if (!existsSync(file)) throw new AgentError("invalid_request", `재검토 기준점의 기록 파일이 없다: ${file}`);
  let record: { result?: { text?: unknown }; review?: { hash?: unknown; snapshot?: unknown } };
  try { record = JSON.parse(readFileSync(file, "utf8")); } catch { throw new AgentError("invalid_request", `재검토 기준점의 기록 파일을 읽을 수 없다: ${file}`); }
  const snapshot = record.review?.snapshot;
  const text = record.result?.text;
  if (typeof snapshot !== "string" || typeof text !== "string" || record.review?.hash !== base.hash || reviewHash(snapshot) !== base.hash || textHash(text) !== base.result_hash) {
    throw new AgentError("invalid_request", `재검토 기준점의 기록이 원장과 맞지 않는다: ${file}`);
  }
  // 구조 누락 단건 판정은 나머지 평가를 억제했다. 구조를 채운 다음에는 목적·안전까지 처음 평가한다.
  if (legacyKind === "task" && proofScopeIssues(snapshot).length) return undefined;
  return { previousText: text, diff: lineDiff(snapshot, current), previousPassed: base.verdict === "pass" };
}

/** 원장에 없는 기록(중단·기록 끊김의 흔적)을 원장에 자동 복구한다 — 사람이 원장을 손으로 고치지 않게.
 * 판정이 있으면 복구하고, pending은 호출만 셀 수 있도록 중단으로 표시한다. */
function recoverOrphans(target: string, name: string, kindFor: (owner: string) => string, now: () => Date): string[] {
  const notes: string[] = [];
  for (const rel of orphanRecords(target, readLedger(target))) {
    const file = join(dirname(target), rel);
    let rec: { pending?: unknown; verifier?: unknown; cross?: unknown; cross_unavailable?: unknown; result?: { text?: unknown; provider?: { value?: unknown }; duration_ms?: unknown; usage?: unknown }; review?: { target?: unknown; hash?: unknown; verdict?: unknown; kind?: unknown; call_id?: unknown; rereview_of?: unknown; snapshot?: unknown; followup?: unknown; confirmation_issue?: unknown } };
    try { rec = JSON.parse(readFileSync(file, "utf8")); } catch { throw new LedgerError(`원장에 없는 검토 기록을 읽을 수 없다: ${file} — 확인해 고치거나 지운 뒤 다시 실행한다`); }
    // 기록은 그 기록의 대상에 귀속한다 — 같은 폴더의 다른 대상(예: TASK.md와 구현 diff) 기록을 지금 대상의 fail로 가져가지 않는다
    const owner = typeof rec.review?.target === "string" && rec.review.target !== "" ? rec.review.target : name;
    const hash = typeof rec.review?.hash === "string" ? rec.review.hash : "";
    const text = rec.result?.text;
    const verdict = rec.review?.verdict;
    const entryKind = typeof rec.review?.kind === "string" ? rec.review.kind : kindFor(owner);
    const recordedCall = {
      ...(typeof rec.review?.call_id === "string" ? { call_id: rec.review.call_id } : {}),
      ...(validFollowup(rec.review?.followup) ? { followup: rec.review.followup } : {}),
    };
    let entry: ReviewEntry;
    // 기록 안의 판정을 그대로 믿지 않는다 — 원문의 판정·스냅숏 해시와 맞을 때만 그 판정으로, 아니면 fail(중단)으로 복구한다(위조·손상 기록으로 차단을 풀지 못하게)
    const consistent = rec.pending !== true && typeof text === "string" && typeof rec.review?.snapshot === "string" && (verdict === "pass" || verdict === "fail" || verdict === "unknown")
      && (parseVerdict(text) === verdict || (verdict === "unknown" && recordedCall.followup?.type === "confirmation" &&
        (rec.review.confirmation_issue === "target_changed" || rec.review.confirmation_issue === "blocking_with_pass")))
      && hash !== "" && reviewHash(rec.review.snapshot) === hash;
    if (consistent && typeof text === "string" && (verdict === "pass" || verdict === "fail" || verdict === "unknown")) {
      const duration = rec.result?.duration_ms;
      const usage = rec.result?.usage;
      entry = { type: "review", at: now().toISOString(), kind: entryKind, target: owner, hash, verdict, verifier: typeof rec.verifier === "string" ? rec.verifier : "unknown", provider: typeof rec.result?.provider?.value === "string" ? rec.result.provider.value : null, rereview_of: typeof rec.review?.rereview_of === "string" ? rec.review.rereview_of : null, record: rel, result_hash: textHash(text), ...recordedCall,
        ...(typeof duration === "number" && Number.isFinite(duration) && duration >= 0 ? { duration_ms: duration } : {}),
        ...(reviewUsage(usage) ? { usage } : {}),
        ...(typeof rec.cross === "boolean" ? { cross: rec.cross } : {}),
        ...(validCrossUnavailable(rec.cross_unavailable) ? { cross_unavailable: rec.cross_unavailable } : {}),
      };
      notes.push(`${rel}(${owner}): 기록의 판정(${verdict})으로 원장에 복구했다`);
    } else {
      entry = { type: "review", at: now().toISOString(), kind: entryKind, target: owner, hash: hash || "unknown", verdict: "fail", verifier: "unknown", provider: null, rereview_of: null, record: rel, result_hash: textHash(""), interrupted: true, ...recordedCall };
      notes.push(`${rel}(${owner}): ${rec.pending === true ? "실행 중 중단돼 판정을 모른다" : "기록의 판정·원문·스냅숏이 서로 맞지 않는다"} — 중단으로 원장에 복구했다(판정 회차·재검토 기준점에서는 제외한다)`);
    }
    try { appendLedger(target, entry); } catch (error) { throw new LedgerError(`원장 복구에 실패했다: ${(error as Error).message}`); }
  }
  return notes;
}

export async function verifyCommand(args: string[], deps: VerifyCliDeps): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { "author-agent": { type: "string" }, "author-provider": { type: "string" }, purpose: { type: "string" }, "purpose-file": { type: "string" }, target: { type: "string" }, cwd: { type: "string" }, "timeout-ms": { type: "string" }, "allow-same-provider": { type: "boolean" }, model: { type: "string" }, out: { type: "string" }, kind: { type: "string" } },
    strict: true,
  });
  const now = deps.now ?? (() => new Date());
  let release: (() => void) | null = null;
  try {
    const author = req(values["author-agent"], VERIFY_USAGE);
    if (author !== "claude" && author !== "codex") throw new AgentError("invalid_request", "--author-agent는 claude|codex");
    const target = realTarget(req(values.target, VERIFY_USAGE));
    const purpose = values["purpose-file"] ? readFileSync(values["purpose-file"], "utf8") : req(values.purpose, VERIFY_USAGE);
    const requestedKind = values.kind ?? "goal";
    if (requestedKind !== "goal" && requestedKind !== "task") throw new AgentError("invalid_request", "--kind는 goal|task");
    const scope = reviewBudgetScope(target);
    if (scope?.stage === "post" && requestedKind === "task") {
      throw new AgentError("invalid_request", "태스크의 사전 검토 대상은 루트 TASK.md다");
    }
    const kind = scope?.kind ?? requestedKind;
    const ledgerTarget = scope?.ledgerTarget ?? target;
    const ledgerTargets = scope?.ledgerTargets ?? [target];
    const out = values.out;
    if (out !== undefined) checkOut(out, target, ledgerTargets, scope);
    const name = scope?.name ?? targetName(target);

    release = acquireLock(scope?.lockTarget ?? target);
    const artifact = readFileSync(target, "utf8");
    const hash = reviewHash(artifact);
    const recovered = ledgerTargets.flatMap((ledger) => {
      const rootTaskLedger = scope?.unit === "task" && ledger === scope.lockTarget;
      const legacyKindFor = (owner: string) => scope
        ? (rootTaskLedger && owner.toLowerCase() === "task.md" ? "task" : "goal")
        : kind;
      return recoverOrphans(ledger, ledger === ledgerTarget ? name : "unknown", legacyKindFor, now);
    });
    const entries = readLedger(ledgerTarget);
    const state = scope && readReviewState(scope, hash);
    const grant = state?.grant;
    if (scope && state && (state.decision.kind === "exhausted" || state.decision.kind === "owner_pending")) {
      const followup = exhaustedFollowup(scope, state);
      const reason = state.pending ? "owner_decision_required" : "budget_exhausted";
      const response = JSON.stringify({ ran: false, reason, budget: state.budget.status, followup,
        ...(recovered.length ? { recovered } : {}) }, null, 2) + "\n";
      if (out !== undefined) writeOrLedgerError(out, response, "--out 사본");
      deps.write(response);
      return ESCALATION_EXIT;
    }
    const budget = scope && state?.decision.kind === "ordinary" ? reserveReviewCall(scope, now(), state.budget) : undefined;
    if (scope && grant) checkGrant(scope, target, grant);
    // 기계로 확인되는 구조 누락은 호출에만 남긴다. 첫 독립 판정은 목적·안전을 평가할 수 있어야 한다.
    if (scope?.stage === "pre") {
      const issues = proofScopeIssues(artifact);
      if (issues.length) throw new AgentError("invalid_request", issues.join(" · "));
    }
    const before = reviewStage(entries, name, !scope);
    if (!scope && before.stage !== "normal") {
      deps.write(JSON.stringify({ ran: false, reason: "검토 반복 실패 단계", escalation: escalation(before, target), ...(recovered.length ? { recovered } : {}) }, null, 2) + "\n");
      return ESCALATION_EXIT;
    }
    const base = grant?.type === "owner" || state?.decision.firstReview ? undefined
      : grant?.type === "joint" ? state?.budget.latestDefinitive
      : budget?.latest ?? (!scope && before.base ? { ledgerTarget, entry: before.base } : undefined);
    const rereview = base && loadRereview(base.ledgerTarget, base.entry, target, hash, artifact, scope ? undefined : kind);
    const previousRecord = rereview && base
      ? relative(dirname(ledgerTarget), join(dirname(base.ledgerTarget), base.entry.record)).split(sep).join("/")
      : null;
    const call: Pick<ReviewEntry, "call_id" | "followup"> = budget?.callId ? { call_id: budget.callId } : {};
    if (grant) call.followup = { type: grant.type, id: randomUUID() };
    const followup = grant && call.followup ? { ...call.followup, target: grant.target, hash, evidence: grant.evidence } : undefined;

    // 실행 전에 이번 기록 자리를 먼저 만든다 — 실행 뒤 기록·원장 확정이 끊기면 원장에 없는 기록으로 남아 다음 검토를 막는다
    const recordName = nextRecordName(ledgerTarget);
    const recordFile = join(dirname(ledgerTarget), recordName);
    writeOrLedgerError(recordFile, JSON.stringify({ pending: true, review: { target: name, hash, kind, ...call } }, null, 2) + "\n", "검토 기록 자리");
    const timeout = values["timeout-ms"];
    let outcome: Awaited<ReturnType<typeof crossVerify>>;
    try {
      outcome = await crossVerify({
        kind, rereview,
        authorAgent: author, authorProvider: values["author-provider"] as "anthropic" | "openai" | undefined,
        purpose, artifact, artifactName: target,
        cwd: values.cwd ?? process.cwd(), timeoutMs: timeout === undefined ? undefined : Number(timeout),
        allowSameProvider: values["allow-same-provider"], model: values.model, executors: deps.executors(),
      });
    } catch (error) {
      clearPending(recordFile);
      throw error;
    }
    if (!outcome.ran) {
      clearPending(recordFile);
      const text = JSON.stringify({
        ...outcome,
        ...(followup ? { followup: { ...followup, verdict: "unavailable" } } : {}),
        ...(recovered.length ? { recovered } : {}),
        ...(scope ? { budget: readReviewBudget(scope).status } : {}),
      }, null, 2) + "\n";
      if (out !== undefined) writeOrLedgerError(out, text, "--out 사본");
      deps.write(text);
      return 10;
    }

    if (scope && grant && call.followup) recordFollowupExecution(scope, grant.id, call.followup.id, now());
    const verdict = parseVerdict(outcome.result.text);
    // 기록 파일에는 세션 ID를 남기지 않는다
    const result = { ...outcome.result, session_id: null };
    const review = { target: name, hash, kind, verdict, rereview_of: previousRecord, snapshot: artifact, ...call };
    const record = { ...outcome, result, review };
    writeOrLedgerError(recordFile, JSON.stringify(record, null, 2) + "\n", "검토 기록");

    const entry: ReviewEntry = {
      type: "review", at: now().toISOString(), kind, target: name, hash, verdict, verifier: outcome.verifier,
      provider: outcome.result.provider.value ?? null, rereview_of: review.rereview_of, record: recordName, result_hash: textHash(outcome.result.text),
      duration_ms: result.duration_ms, usage: result.usage, cross: outcome.cross, ...call,
      ...(outcome.cross_unavailable ? { cross_unavailable: outcome.cross_unavailable } : {}),
    };
    try { appendLedger(ledgerTarget, entry); } catch (error) {
      throw new LedgerError(`검토는 실행됐지만 원장 기록에 실패했다(${(error as Error).message}) — 기록 파일 ${recordFile}을 확인하고 원장을 복구한 뒤 진행한다`);
    }
    const after = reviewStage(readLedger(ledgerTarget), name, !scope);
    const output: Record<string, unknown> = { ...outcome, last_decision_by: after.last_decision_by, review: { target: name, hash, verdict, rereview_of: review.rereview_of, record: recordName } };
    if (recovered.length) output.recovered = recovered;
    if (verdict === "unknown") output.warning = "결과 마지막 줄에서 pass·fail 판정을 찾지 못했다(unknown) — 연속 실패 수에는 포함하지 않는다";
    if (followup) output.followup = { action: "report_review", ...followup, verdict, record: recordName, cross: outcome.cross,
      ...(outcome.cross_unavailable ? { cross_unavailable: outcome.cross_unavailable } : {}) };
    if (scope) output.budget = readReviewBudget(scope).status;
    else if (after.stage !== "normal") output.escalation = escalation(after, target);
    // 원장과 수정 확인 보고가 끝난 뒤 보조 사본을 쓴다.
    if (out !== undefined) writeOrLedgerError(out, JSON.stringify(record, null, 2) + "\n", "--out 사본");
    deps.write(JSON.stringify(output, null, 2) + "\n");
    return 0;
  } catch (error) {
    if (error instanceof LedgerError) {
      deps.write(JSON.stringify({ is_error: true, error: { code: "invalid_request", message: error.message } }, null, 2) + "\n");
      return 2;
    }
    if (!(error instanceof AgentError)) throw error;
    deps.write(JSON.stringify(errorPayload(error), null, 2) + "\n");
    return error.exitCode;
  } finally {
    release?.();
  }
}

/** 공백이 아닌 내용이 있는 일반 파일 */
function contentFile(path: string): boolean {
  try { return lstatSync(path).isFile() && readFileSync(path, "utf8").trim() !== ""; } catch { return false; }
}

export async function reviewNoteCommand(args: string[], deps: VerifyCliDeps): Promise<number> {
  const { values } = parseArgs({
    args,
    options: { target: { type: "string" }, diagnosis: { type: "boolean" }, decision: { type: "boolean" }, by: { type: "string" }, void: { type: "boolean" }, joint: { type: "boolean" }, "request-waiver": { type: "string" }, resume: { type: "boolean" }, rounds: { type: "string" }, record: { type: "string" }, layer: { type: "string" }, summary: { type: "string" }, choice: { type: "string" }, file: { type: "string" } },
    strict: true,
  });
  const now = deps.now ?? (() => new Date());
  let release: (() => void) | null = null;
  try {
    const target = realTarget(req(values.target, REVIEW_NOTE_USAGE));
    const followupMode = values.joint ? "joint" : values["request-waiver"] ? "waiver_request" : undefined;
    if ([values.diagnosis, values.decision, values.void, values.joint, values["request-waiver"]].filter(Boolean).length !== 1) {
      throw new AgentError("invalid_request", `검토 기록 종류는 하나만 — ${REVIEW_NOTE_USAGE}`);
    }
    if (values.by !== undefined && !values.decision) throw new AgentError("invalid_request", "--by는 --decision에서만 사용한다");
    const summary = req(values.summary, REVIEW_NOTE_USAGE).trim();
    if (!summary) throw new AgentError("invalid_request", "--summary가 비었다");
    const scope = reviewBudgetScope(target);
    if (followupMode && !scope) throw new AgentError("invalid_request", "후속 조치는 태스크·백로그에서 기록한다");
    if ((values.resume || values.rounds !== undefined) && (!scope || !values.decision || values.by !== "user")) {
      throw new AgentError("invalid_request", "--resume·--rounds는 예산 단위의 owner 결정에서만 쓴다");
    }
    if (values.rounds !== undefined && (!/^\d+$/.test(values.rounds) || !Number.isSafeInteger(Number(values.rounds)))) {
      throw new AgentError("invalid_request", "--rounds는 음이 아닌 정수다");
    }
    const ledgerTarget = scope?.ledgerTarget ?? target;
    const name = scope?.name ?? targetName(target);
    release = acquireLock(scope?.lockTarget ?? target);
    if (scope && (followupMode || values.decision)) {
      if (values.decision && values.by !== "user") throw new AgentError("invalid_request", "열린 요청의 owner 결정 근거를 기록한다");
      const type = followupMode ?? "owner";
      const hash = reviewHash(readFileSync(target, "utf8"));
      const entry = openFollowup(scope, target, hash, now(), {
        type, file: resolve(req(values.file, REVIEW_NOTE_USAGE)), summary,
        choice: values.choice?.trim(), proposed: values["request-waiver"],
        rounds: values.rounds === undefined ? (values.resume ? 1 : undefined) : Number(values.rounds),
      });
      const followup = type !== "joint" ? exhaustedFollowup(scope, readReviewState(scope, hash)) : undefined;
      deps.write(JSON.stringify({ ok: true, ran: false, entry, ...(followup ? { followup } : {}),
        ...(type === "owner" ? { approval_identity: "verify_owner_source" } : {}) }, null, 2) + "\n");
      return 0;
    }
    const ledger = readLedger(ledgerTarget);
    const info = reviewStage(ledger, name, !scope);
    let entry: LedgerEntry;
    if (values.void) {
      // 검토 도구 결함으로 무효인 fail 검토 — normal 단계에서만(열린 단계는 진단·결정으로만 넘어간다), 이 대상의 fail 검토여야 하고 근거가 있어야 한다
      if (info.stage !== "normal") throw new AgentError("invalid_request", `무효 처리는 normal 단계에서만 한다(지금 ${info.stage}) — 열린 단계는 진단·사용자 결정으로 넘어간다`);
      const record = req(values.record, REVIEW_NOTE_USAGE);
      if (!ledger.some((e) => e.type === "review" && e.target === name && e.record === record && e.verdict === "fail" && e.interrupted !== true)) throw new AgentError("invalid_request", `원장에 이 대상의 실행된 fail 검토 ${record}가 없다(pass·중단 복구는 무효 처리하지 않는다)`);
      if (ledger.some((e) => e.type === "void" && e.target === name && e.record === record)) throw new AgentError("invalid_request", `${record}는 이미 무효로 기록됐다`);
      const file = req(values.file, REVIEW_NOTE_USAGE);
      if (!contentFile(file)) throw new AgentError("invalid_request", `무효 근거 파일이 없거나 비었다: ${file}`);
      entry = { type: "void", at: now().toISOString(), target: name, record, summary, file };
    } else if (values.diagnosis) {
      if (info.stage !== "diagnose") throw new AgentError("invalid_request", `진단은 연속 fail로 diagnose 단계일 때만 기록한다(지금 ${info.stage})`);
      const layer = req(values.layer, REVIEW_NOTE_USAGE) as Layer;
      if (!LAYERS.includes(layer)) throw new AgentError("invalid_request", `--layer는 ${LAYERS.join("|")}`);
      if (values.file !== undefined && !contentFile(values.file)) throw new AgentError("invalid_request", `근거 파일이 없거나 비었다: ${values.file}`);
      entry = { type: "diagnosis", at: now().toISOString(), target: name, layer, summary, ...(values.file !== undefined ? { file: values.file } : {}) };
    } else {
      if (info.stage !== "ask_user") throw new AgentError("invalid_request", `결정은 진단 뒤에도 fail인 ask_user 단계일 때만 기록한다(지금 ${info.stage})`);
      const by = req(values.by, REVIEW_NOTE_USAGE);
      if (by !== 'pm' && by !== 'user') throw new AgentError('invalid_request', '--by는 pm|user');
      const choice = req(values.choice, REVIEW_NOTE_USAGE).trim();
      const file = req(values.file, REVIEW_NOTE_USAGE);
      if (!choice) throw new AgentError("invalid_request", "--choice가 비었다");
      // pm 분류·조치 및 user 결정 원문의 내용·진정성은 PM 책임이다(pace-project-dev 스킬)
      if (!contentFile(file)) throw new AgentError("invalid_request", `결정 근거 파일이 없거나 비었다: ${file}`);
      if (realpathSync(file) === target) throw new AgentError("invalid_request", "검토 대상 자체를 결정 근거로 쓸 수 없다");
      entry = { type: "decision", at: now().toISOString(), target: name, by, choice, summary, file };
    }
    try { appendLedger(ledgerTarget, entry); } catch (error) { throw new LedgerError(`원장 기록에 실패했다: ${(error as Error).message}`); }
    const after = reviewStage(readLedger(ledgerTarget), name, !scope);
    deps.write(JSON.stringify({ ok: true, entry, stage: after.stage }, null, 2) + "\n");
    return 0;
  } catch (error) {
    if (error instanceof LedgerError) {
      deps.write(JSON.stringify({ is_error: true, error: { code: "invalid_request", message: error.message } }, null, 2) + "\n");
      return 2;
    }
    if (!(error instanceof AgentError)) throw error;
    deps.write(JSON.stringify(errorPayload(error), null, 2) + "\n");
    return error.exitCode;
  } finally {
    release?.();
  }
}
