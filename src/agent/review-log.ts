import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, readdirSync, rmSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// 검토 원장 (P007 T01): 같은 대상의 독립 검토가 거듭 fail할 때 땜질 반복을 끊는다.
//  - verify가 실행될 때마다 대상 폴더의 REVIEW-LOG.jsonl에 판정을 자동으로 남긴다(작성자 수작업 없음).
//  - 재검토 기준점은 호출자가 아니라 원장이 정한다: 마지막 pass·decision·diagnosis 뒤 구간의 가장 최근 fail 검토.
//  - 연속 fail 3회면 근본 진단(diagnose), 진단 뒤 fail이면 결정 주체 분류·기록(역사적 이름 ask_user) 전까지 막는다.
// 원장에는 대상 원문·검토 원문·비밀·세션 ID를 넣지 않는다(원문은 review-records/의 기록 파일에).

export const LEDGER_FILE = "REVIEW-LOG.jsonl";
export const LOCK_FILE = "REVIEW-LOG.lock";
export const RECORDS_DIR = "review-records";
export const DIAGNOSE_AFTER = 3;

export type Verdict = "pass" | "fail" | "unknown";
export type Layer = "structure" | "planning" | "design" | "other";
export const LAYERS: readonly Layer[] = ["structure", "planning", "design", "other"];

export interface ReviewEntry {
  type: "review";
  at: string;
  kind: string;
  target: string;
  hash: string;
  verdict: Verdict;
  verifier: string;
  provider: string | null;
  /** 재검토였으면 기준점 검토의 기록 경로(원장 폴더 기준), 처음 검토면 null */
  rereview_of: string | null;
  /** 이 검토의 기록 파일(원장 폴더 기준 상대 경로) */
  record: string;
  /** 기록 파일의 검토 원문 해시 — 재검토 때 기록 교체·변조를 막는다 */
  result_hash: string;
  /** 실행 중 중단돼 판정을 모르는 검토를 자동 복구한 항목(fail로 센다, 원문이 없어 재검토 기준점이 되지 않는다) */
  interrupted?: true;
}
export interface DiagnosisEntry { type: "diagnosis"; at: string; target: string; layer: Layer; summary: string; file?: string }
export type DecisionBy = 'pm' | 'user';
export interface DecisionEntry { type: "decision"; at: string; target: string; choice: string; summary: string; file: string; /** 옛 항목의 생략은 unknown이며 user로 추정하지 않는다. */ by?: DecisionBy }
/** 검토 도구 결함(프롬프트·옵션·열람 불가 등)으로 무효인 검토 — 횟수·기준점에서 뺀다. 대상은 그대로여도 다시 검토할 수 있게 한다 */
export interface VoidEntry { type: "void"; at: string; target: string; record: string; summary: string; file: string }
export type LedgerEntry = ReviewEntry | DiagnosisEntry | DecisionEntry | VoidEntry;

export type Stage = "normal" | "diagnose" | "ask_user";
export interface StageInfo {
  stage: Stage;
  /** 이 대상의 마지막 결정 주체. 과거 기록의 미기재는 unknown, 결정 이력 없음은 null. 현재 승인 권한이 아니다. */
  last_decision_by: DecisionBy | 'unknown' | null;
  /** 마지막 pass·decision 뒤 연속 fail 수(unknown은 세지 않는다) */
  consecutive_fails: number;
  /** 재검토 기준점 — 마지막 pass·decision·diagnosis 뒤 구간의 가장 최근 fail 검토. 없으면 처음 검토 */
  base: ReviewEntry | null;
}

export class LedgerError extends Error {}

export function textHash(text: string): string { return createHash("sha256").update(text).digest("hex"); }

const isStr = (v: unknown): v is string => typeof v === "string";
const HEX64 = /^[a-f0-9]{64}$/;
/** 항목 종류별 필수 필드를 확인한다 — 필드가 빠진 decision이 연속 실패를 초기화하지 못하게 */
function validEntry(v: Record<string, unknown>): boolean {
  if (!isStr(v.target) || !isStr(v.at)) return false;
  if (v.type === "review") return isStr(v.kind) && isStr(v.hash) && ["pass", "fail", "unknown"].includes(v.verdict as string) && isStr(v.verifier) && (v.provider === null || isStr(v.provider)) && (v.rereview_of === null || isStr(v.rereview_of)) && isStr(v.record) && /^review-records\/R\d+\.json$/.test(v.record) && isStr(v.result_hash) && HEX64.test(v.result_hash) && (v.interrupted === undefined || (v.interrupted === true && v.verdict === "fail"));
  if (v.type === "diagnosis") return (LAYERS as readonly unknown[]).includes(v.layer) && isStr(v.summary) && v.summary.trim() !== "" && (v.file === undefined || isStr(v.file));
  if (v.type === "decision") return isStr(v.choice) && v.choice.trim() !== "" && isStr(v.summary) && isStr(v.file) && v.file !== "" && (v.by === undefined || v.by === 'pm' || v.by === 'user');
  if (v.type === "void") return isStr(v.record) && /^review-records\/R\d+\.json$/.test(v.record) && isStr(v.summary) && v.summary.trim() !== "" && isStr(v.file) && v.file !== "";
  return false;
}

export function ledgerPath(target: string): string { return join(dirname(target), LEDGER_FILE); }
export function lockPath(target: string): string { return join(dirname(target), LOCK_FILE); }

/** 결과 텍스트의 마지막 비어 있지 않은 줄이 pass·fail이면 그 값, 아니면 unknown */
export function parseVerdict(text: string): Verdict {
  // 마지막 줄 끝의 판정 단어(예: "fail", "판정: fail", "**pass**") — 형식이 조금 달라도 횟수 세기를 피해 가지 않게
  const last = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1)?.replace(/[*`_.]/g, "").trim().toLowerCase() ?? "";
  const m = /(?:^|[\s:：])(pass|fail)$/.exec(last);
  return m ? (m[1] as Verdict) : "unknown";
}

/** 원장 전체를 읽는다. 해석할 수 없는 줄이 있으면 위치를 알리고 멈춘다(손상된 원장으로 단계를 잘못 계산하지 않는다) */
export function readLedger(target: string): LedgerEntry[] {
  const file = ledgerPath(target);
  if (!existsSync(file)) return [];
  const entries: LedgerEntry[] = [];
  let raw: string;
  try { raw = readFileSync(file, "utf8"); } catch (error) { throw new LedgerError(`검토 원장을 읽을 수 없다: ${file} — ${(error as Error).message}`); }
  raw.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new LedgerError(`검토 원장이 손상됐다: ${file}:${i + 1} — 고친 뒤 다시 실행한다`); }
    if (!value || typeof value !== "object" || Array.isArray(value) || !validEntry(value as Record<string, unknown>)) {
      throw new LedgerError(`검토 원장이 손상됐다: ${file}:${i + 1} — 알 수 없는 항목이거나 필수 필드가 없다`);
    }
    entries.push(value as LedgerEntry);
  });
  return entries;
}

export function appendLedger(target: string, entry: LedgerEntry): void {
  appendFileSync(ledgerPath(target), `${JSON.stringify(entry)}\n`);
}

/** 같은 대상(폴더 기준 이름)의 단계. 순수 함수 */
export function reviewStage(entries: readonly LedgerEntry[], targetName: string): StageInfo {
  const voided = new Set(entries.filter((e): e is VoidEntry => e.type === "void" && e.target === targetName).map((e) => e.record));
  const mine = entries.filter((e) => e.target === targetName && e.type !== "void" && !(e.type === "review" && voided.has(e.record)));
  let start = 0; // 마지막 pass·decision 다음
  mine.forEach((e, i) => { if ((e.type === "review" && e.verdict === "pass") || e.type === "decision") start = i + 1; });
  const segment = mine.slice(start);
  const fails = segment.filter((e) => e.type === "review" && e.verdict === "fail").length;
  const diagIndex = segment.map((e) => e.type).lastIndexOf("diagnosis");
  const afterDiag = diagIndex < 0 ? segment : segment.slice(diagIndex + 1);
  const base = [...afterDiag].reverse().find((e): e is ReviewEntry => e.type === "review" && e.verdict === "fail" && e.interrupted !== true) ?? null;
  let stage: Stage = "normal";
  if (diagIndex < 0) { if (fails >= DIAGNOSE_AFTER) stage = "diagnose"; }
  else if (afterDiag.some((e) => e.type === "review" && e.verdict === "fail")) stage = "ask_user";
  const last = [...mine].reverse().find((e): e is DecisionEntry => e.type === 'decision');
  return { stage, consecutive_fails: fails, base, last_decision_by: last ? last.by ?? 'unknown' : null };
}

/** 같은 원장의 검토·기록을 직렬화한다(배타 생성). 잠겨 있으면 멈춘다 */
export function acquireLock(target: string): () => void {
  const file = lockPath(target);
  const create = (): number => openSync(file, "wx");
  let fd: number;
  try { fd = create(); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw new LedgerError(`검토 잠금을 만들 수 없다: ${file} — ${(error as Error).message}`);
    // 잠금을 만든 프로세스가 이미 없으면(중단) 남은 잠금이다 — 치우고 한 번 다시 시도한다
    if (!staleLock(file)) throw new LedgerError(`같은 대상의 검토가 진행 중이다(잠금 ${file}). 진행 중인 검토가 없으면 잠금 파일을 지우고 다시 실행한다`);
    try { rmSync(file, { force: true }); fd = create(); } catch { throw new LedgerError(`같은 대상의 검토가 진행 중이다(잠금 ${file})`); }
  }
  try { writeSync(fd, String(process.pid)); } finally { closeSync(fd); }
  return () => { try { rmSync(file, { force: true }); } catch { /* 잠금 정리 실패는 다음 실행이 알린다 */ } };
}

function staleLock(file: string): boolean {
  let pid: number;
  try { pid = Number(readFileSync(file, "utf8").trim()); } catch { return false; }
  if (!Number.isInteger(pid) || pid <= 0) return false; // 내용을 모르면 진행 중으로 본다
  try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
}

/** 원장이 가리키지 않는 기록 파일 — 기록 뒤 원장 추가가 끊긴 흔적이라 다음 검토를 막는다 */
export function orphanRecords(target: string, entries: readonly LedgerEntry[]): string[] {
  const dir = join(dirname(target), RECORDS_DIR);
  if (!existsSync(dir)) return [];
  let names: string[];
  try { names = readdirSync(dir); } catch (error) { throw new LedgerError(`검토 기록 폴더를 읽을 수 없다: ${dir} — ${(error as Error).message}`); }
  const known = new Set(entries.filter((e): e is ReviewEntry => e.type === "review").map((e) => e.record));
  // 번호 순(R9 다음 R10)으로 복구해야 기준점 순서가 맞다
  return names.filter((n) => /^R\d+\.json$/.test(n)).sort((x, y) => Number(x.slice(1, -5)) - Number(y.slice(1, -5))).map((n) => `${RECORDS_DIR}/${n}`).filter((n) => !known.has(n));
}

/** 다음 기록 파일 이름(review-records/R<n>.json, 폴더 기준) */
export function nextRecordName(target: string): string {
  const dir = join(dirname(target), RECORDS_DIR);
  let max = 0;
  if (existsSync(dir)) for (const name of readdirSync(dir)) { const m = /^R(\d+)\.json$/.exec(name); if (m) max = Math.max(max, Number(m[1])); }
  return `${RECORDS_DIR}/R${max + 1}.json`;
}

export function targetName(target: string): string { return basename(target); }

export function escalationNext(stage: Stage, target: string, fails: number): string {
  if (stage === "diagnose") {
    return `같은 대상에서 연속 ${fails}회 fail — 지적별 수정을 멈추고 원인 층(structure/planning/design/other)을 진단한다. 근본 조치 전에 합의된 목적·범위와 실제 영향을 확인해 분류한다. 심각한 오류·보안·합의 변경이면 조치 전 사용자 결정을 받는다. 일반 갭은 PM이 근본 조치·재검증 후 사후 보고한다. 분류 정본: skills/pace-project-dev/references/reviewer.md의 반복 실패 절. \`pace agent review-note --target ${target} --diagnosis --layer <층> --summary "<진단·조치>" [--file <진단 증거·승인 연결>]\`로 기록한다. 진단 뒤 첫 검토는 새 기준 전체 검토다.`;
  }
  if (stage === "ask_user") {
    return `진단 뒤에도 fail — ask_user는 호환을 위한 결정 필요 단계 이름이며 주체를 자동 지정하지 않는다. 매 수정 전에 지적·조치의 영향을 분류한다(정본: skills/pace-project-dev/references/reviewer.md 반복 실패 절). 일반 갭은 PM 결정: 분류 이유·조치를 근거 파일에 남기고 근본 조치 → 전체 재검증 → 사후 보고한다. 심각한 오류·보안·목적·범위 변경은 고치기 전 사용자 결정: 실패 추이·진단·남은 지적·선택지와 추천을 보고하고 사람 결정 원문을 보존한다. \`pace agent review-note --target ${target} --decision --by pm|user --choice "<선택>" --summary "<사유>" --file <분류·조치 또는 사용자 원문>\`으로 기록한다. PM 결정은 waiver가 아니며 재검증한다.`;
  }
  return "";
}

const MAX_DIFF_CELLS = 4_000_000;

/** 의존성 없는 줄 단위 비교: 바뀐 줄(-/+)과 앞뒤 1줄 맥락. 같은 앞뒤 줄을 먼저 떼고, 남은 구간이 커서 LCS를 못 돌리면
 * 그 구간을 통째로 -/+로 낸다(거칠지만 바뀐 줄은 언제나 나온다 — 재검토가 막다른 길에 빠지지 않게) */
export function lineDiff(before: string, after: string): string {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf), bm = b.slice(pre, b.length - suf);
  const ops: { op: " " | "-" | "+"; text: string }[] = a.slice(0, pre).map((text) => ({ op: " " as const, text }));
  if (am.length * bm.length > MAX_DIFF_CELLS) {
    for (const text of am) ops.push({ op: "-", text });
    for (const text of bm) ops.push({ op: "+", text });
  } else {
    const n = am.length, m = bm.length;
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = am[i] === bm[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) { ops.push({ op: " ", text: am[i]! }); i++; j++; }
      else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) ops.push({ op: "-", text: am[i++]! });
      else ops.push({ op: "+", text: bm[j++]! });
    }
    while (i < n) ops.push({ op: "-", text: am[i++]! });
    while (j < m) ops.push({ op: "+", text: bm[j++]! });
  }
  for (const text of a.slice(a.length - suf)) ops.push({ op: " ", text });
  const changed = (k: number) => ops[k] !== undefined && ops[k]!.op !== " ";
  const out: string[] = [];
  let skipped = false;
  ops.forEach((o, k) => {
    if (changed(k) || changed(k - 1) || changed(k + 1)) { if (skipped && out.length) out.push("…"); skipped = false; out.push(`${o.op} ${o.text}`); }
    else skipped = true;
  });
  return out.length ? out.join("\n") : "(바뀐 줄 없음)";
}
