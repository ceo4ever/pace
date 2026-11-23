import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { proofScopeIssues, reviewHash } from "../project/pre-review.ts";
import { AgentError, errorCodes, errorPayload, type Executor } from "./contract.ts";
import {
  acquireLock, appendLedger, escalationNext, LAYERS, LedgerError, ledgerPath, lockPath, nextRecordName, orphanRecords, parseVerdict, readLedger, RECORDS_DIR, reviewStage,
  lineDiff, targetName, textHash, type Layer, type LedgerEntry, type ReviewEntry, type StageInfo,
} from "./review-log.ts";
import { crossVerify, type Rereview } from "./verify.ts";

// `pace agent verify`·`pace agent review-note` 명령 처리 (P007 T01). src/cli.ts는 여기로 위임만 한다 — 시험이 실행기를 주입해 같은 경로를 탄다.

export interface VerifyCliDeps {
  executors: () => Executor[];
  write: (text: string) => void;
  now?: () => Date;
}

export const VERIFY_USAGE = "pace agent verify --author-agent claude|codex --target <산출물 파일> (--purpose <글>|--purpose-file <파일>) [--kind goal|task] [--allow-same-provider] [--out <기록 파일>]";
export const REVIEW_NOTE_USAGE = 'pace agent review-note --target <파일> (--diagnosis --layer structure|planning|design|other --summary "<진단·조치>" [--file <근거>] | --decision --by pm|user --choice "<선택>" --summary "<사유>" --file <분류·조치 또는 사용자 원문> | --void --record review-records/R<n>.json --summary "<도구 결함>" --file <근거>)';

const ESCALATION_EXIT = errorCodes.review_escalation;

function req(value: string | undefined, usage: string): string {
  if (value === undefined || value === "") throw new AgentError("invalid_request", `인자가 부족하다 — ${usage}`);
  return value;
}

/** 대상은 실제 경로로 연다 — 링크 별칭으로 다른 원장을 써서 단계를 우회하지 못하게 */
function realTarget(path: string): string {
  try { return realpathSync(path); } catch { throw new AgentError("invalid_request", `대상이 없다: ${path}`); }
}

/** --out이 원장·잠금·대상·기록 폴더를 덮어쓰지 못하게 실제 경로로 비교한다 */
function checkOut(out: string, target: string): void {
  let real: string;
  try { real = join(realpathSync(dirname(resolve(out))), basename(out)); } catch { throw new AgentError("invalid_request", `--out 폴더가 없다: ${out}`); }
  // 쓰기는 rename 교체라 링크·하드링크 너머 파일을 고치지 않는다 — 여기서는 관리 파일의 이름 자체를 바꿔 끼우지 못하게만 막는다
  // 대소문자를 구분하지 않는 볼륨(macOS·Windows 기본)에서는 철자만 다른 경로가 같은 파일이다 — 비교는 대소문자 무시
  const low = real.toLowerCase();
  const records = (join(dirname(target), RECORDS_DIR) + sep).toLowerCase();
  if ([target, ledgerPath(target), lockPath(target)].some((p) => p.toLowerCase() === low) || low.startsWith(records)) {
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

/** 기준점 검토의 기록이 원장과 맞는지 확인하고 재검토 입력을 만든다 */
function loadRereview(target: string, base: ReviewEntry, currentHash: string, current: string, kind: string): Rereview | undefined {
  if (currentHash === base.hash) throw new AgentError("invalid_request", `직전 fail 검토(${base.record}) 뒤 대상이 바뀌지 않았다 — 지적을 반영한 뒤 다시 검토한다`);
  const file = join(dirname(target), base.record);
  if (!existsSync(file)) throw new AgentError("invalid_request", `재검토 기준점의 기록 파일이 없다: ${file}`);
  let record: { result?: { text?: unknown }; review?: { hash?: unknown; snapshot?: unknown } };
  try { record = JSON.parse(readFileSync(file, "utf8")); } catch { throw new AgentError("invalid_request", `재검토 기준점의 기록 파일을 읽을 수 없다: ${file}`); }
  const snapshot = record.review?.snapshot;
  const text = record.result?.text;
  if (typeof snapshot !== "string" || typeof text !== "string" || record.review?.hash !== base.hash || reviewHash(snapshot) !== base.hash || textHash(text) !== base.result_hash) {
    throw new AgentError("invalid_request", `재검토 기준점의 기록이 원장과 맞지 않는다: ${file}`);
  }
  // 구조 누락 단건 판정은 나머지 평가를 억제했다. 구조를 채운 다음에는 목적·안전까지 처음 평가한다.
  if (kind === 'task' && proofScopeIssues(snapshot).length) return undefined;
  return { previousText: text, diff: lineDiff(snapshot, current) };
}

/** 원장에 없는 기록(중단·기록 끊김의 흔적)을 원장에 자동 복구한다 — 사람이 원장을 손으로 고치지 않게.
 *  판정이 있는 기록은 그 판정으로, pending(실행기 결과를 모름)은 연속 실패를 줄이지 않도록 fail+interrupted로 넣는다. 복구한 항목 설명을 돌려준다 */
function recoverOrphans(target: string, name: string, kind: string, now: () => Date): string[] {
  const notes: string[] = [];
  for (const rel of orphanRecords(target, readLedger(target))) {
    const file = join(dirname(target), rel);
    let rec: { pending?: unknown; verifier?: unknown; result?: { text?: unknown; provider?: { value?: unknown } }; review?: { target?: unknown; hash?: unknown; verdict?: unknown; rereview_of?: unknown; snapshot?: unknown } };
    try { rec = JSON.parse(readFileSync(file, "utf8")); } catch { throw new LedgerError(`원장에 없는 검토 기록을 읽을 수 없다: ${file} — 확인해 고치거나 지운 뒤 다시 실행한다`); }
    // 기록은 그 기록의 대상에 귀속한다 — 같은 폴더의 다른 대상(예: TASK.md와 구현 diff) 기록을 지금 대상의 fail로 가져가지 않는다
    const owner = typeof rec.review?.target === "string" && rec.review.target !== "" ? rec.review.target : name;
    const hash = typeof rec.review?.hash === "string" ? rec.review.hash : "";
    const text = rec.result?.text;
    const verdict = rec.review?.verdict;
    let entry: ReviewEntry;
    // 기록 안의 판정을 그대로 믿지 않는다 — 원문의 판정·스냅숏 해시와 맞을 때만 그 판정으로, 아니면 fail(중단)으로 복구한다(위조·손상 기록으로 차단을 풀지 못하게)
    const consistent = rec.pending !== true && typeof text === "string" && typeof rec.review?.snapshot === "string" && (verdict === "pass" || verdict === "fail" || verdict === "unknown")
      && parseVerdict(text) === verdict && hash !== "" && reviewHash(rec.review.snapshot) === hash;
    if (consistent && typeof text === "string" && (verdict === "pass" || verdict === "fail" || verdict === "unknown")) {
      entry = { type: "review", at: now().toISOString(), kind, target: owner, hash, verdict, verifier: typeof rec.verifier === "string" ? rec.verifier : "unknown", provider: typeof rec.result?.provider?.value === "string" ? rec.result.provider.value : null, rereview_of: typeof rec.review?.rereview_of === "string" ? rec.review.rereview_of : null, record: rel, result_hash: textHash(text) };
      notes.push(`${rel}(${owner}): 기록의 판정(${verdict})으로 원장에 복구했다`);
    } else {
      entry = { type: "review", at: now().toISOString(), kind, target: owner, hash: hash || "unknown", verdict: "fail", verifier: "unknown", provider: null, rereview_of: null, record: rel, result_hash: textHash(""), interrupted: true };
      notes.push(`${rel}(${owner}): ${rec.pending === true ? "실행 중 중단돼 판정을 모른다" : "기록의 판정·원문·스냅숏이 서로 맞지 않는다"} — 연속 실패를 줄이지 않도록 fail(중단)로 원장에 복구했다(재검토 기준점은 되지 않는다)`);
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
    const kind = values.kind ?? "goal";
    if (kind !== "goal" && kind !== "task") throw new AgentError("invalid_request", "--kind는 goal|task");
    const artifact = readFileSync(target, "utf8");
    const out = values.out;
    if (out !== undefined) checkOut(out, target);
    const name = targetName(target);
    const hash = reviewHash(artifact);

    release = acquireLock(target);
    const recovered = recoverOrphans(target, name, kind, now);
    const entries = readLedger(target);
    const before = reviewStage(entries, name);
    if (before.stage !== "normal") {
      deps.write(JSON.stringify({ ran: false, reason: "검토 반복 실패 단계", escalation: escalation(before, target), ...(recovered.length ? { recovered } : {}) }, null, 2) + "\n");
      return ESCALATION_EXIT;
    }
    const rereview = before.base ? loadRereview(target, before.base, hash, artifact, kind) : undefined;

    // 실행 전에 이번 기록 자리를 먼저 만든다 — 실행 뒤 기록·원장 확정이 끊기면 원장에 없는 기록으로 남아 다음 검토를 막는다
    const recordName = nextRecordName(target);
    const recordFile = join(dirname(target), recordName);
    writeOrLedgerError(recordFile, JSON.stringify({ pending: true, review: { target: name, hash } }, null, 2) + "\n", "검토 기록 자리");
    const timeout = values["timeout-ms"];
    let outcome: Awaited<ReturnType<typeof crossVerify>>;
    try {
      outcome = await crossVerify({
      kind, rereview,
      authorAgent: author, authorProvider: values["author-provider"] as "anthropic" | "openai" | undefined, purpose, artifact, artifactName: target,
      cwd: values.cwd ?? process.cwd(), timeoutMs: timeout === undefined ? undefined : Number(timeout), allowSameProvider: values["allow-same-provider"], model: values.model, executors: deps.executors(),
      });
    } catch (error) {
      clearPending(recordFile); // 실행 자체가 실패하면 판정이 없다 — 자리를 치운다
      throw error;
    }
    if (!outcome.ran) {
      clearPending(recordFile);
      const text = JSON.stringify(recovered.length ? { ...outcome, recovered } : outcome, null, 2) + "\n";
      if (out !== undefined) writeOrLedgerError(out, text, "--out 사본"); // 종전처럼 미실행 사유도 --out에 남긴다
      deps.write(text);
      return 10;
    }

    const verdict = parseVerdict(outcome.result.text);
    // 기록 파일에는 세션 ID를 남기지 않는다
    const result = { ...outcome.result, session_id: null };
    const review = { target: name, hash, verdict, rereview_of: rereview ? before.base!.record : null, snapshot: artifact };
    const record = { ...outcome, result, review };
    writeOrLedgerError(recordFile, JSON.stringify(record, null, 2) + "\n", "검토 기록");

    const entry: ReviewEntry = {
      type: "review", at: now().toISOString(), kind, target: name, hash, verdict, verifier: outcome.verifier,
      provider: outcome.result.provider.value ?? null, rereview_of: review.rereview_of, record: recordName, result_hash: textHash(outcome.result.text),
    };
    try { appendLedger(target, entry); } catch (error) {
      throw new LedgerError(`검토는 실행됐지만 원장 기록에 실패했다(${(error as Error).message}) — 기록 파일 ${recordFile}을 확인하고 원장을 복구한 뒤 진행한다`);
    }
    // 필수 기록(기록 파일·원장)이 확정된 뒤에만 보조 사본을 쓴다
    if (out !== undefined) writeOrLedgerError(out, JSON.stringify(record, null, 2) + "\n", "--out 사본");
    const after = reviewStage(readLedger(target), name);
    const output: Record<string, unknown> = { ...outcome, last_decision_by: after.last_decision_by, review: { target: name, hash, verdict, rereview_of: review.rereview_of, record: recordName } };
    if (recovered.length) output.recovered = recovered;
    if (verdict === "unknown") output.warning = "결과 마지막 줄에서 pass·fail 판정을 찾지 못했다(unknown) — 연속 실패 수에 넣지 않는다. 원문을 확인한다";
    if (after.stage !== "normal") output.escalation = escalation(after, target);
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
    options: { target: { type: "string" }, diagnosis: { type: "boolean" }, decision: { type: "boolean" }, by: { type: "string" }, void: { type: "boolean" }, record: { type: "string" }, layer: { type: "string" }, summary: { type: "string" }, choice: { type: "string" }, file: { type: "string" } },
    strict: true,
  });
  const now = deps.now ?? (() => new Date());
  let release: (() => void) | null = null;
  try {
    const target = realTarget(req(values.target, REVIEW_NOTE_USAGE));
    if ([values.diagnosis, values.decision, values.void].filter(Boolean).length !== 1) throw new AgentError("invalid_request", `--diagnosis·--decision·--void 중 하나만 — ${REVIEW_NOTE_USAGE}`);
    if (values.by !== undefined && !values.decision) throw new AgentError('invalid_request', '--by는 --decision에서만 사용한다');
    const summary = req(values.summary, REVIEW_NOTE_USAGE).trim();
    if (!summary) throw new AgentError("invalid_request", "--summary가 비었다");
    const name = targetName(target);
    release = acquireLock(target);
    const ledger = readLedger(target);
    const info = reviewStage(ledger, name);
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
    try { appendLedger(target, entry); } catch (error) { throw new LedgerError(`원장 기록에 실패했다: ${(error as Error).message}`); }
    const after = reviewStage(readLedger(target), name);
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
