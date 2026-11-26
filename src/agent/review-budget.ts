import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { proofScopeIssues, reviewHash } from "../project/pre-review.ts";
import { appendLedger, LedgerError, readLedger, textHash, type ReviewCallEntry, type ReviewEntry } from "./review-log.ts";
import { matchingCriteria } from "./review-criteria.ts";
import { matchesPermissionBasis, parseGrantedPermission } from "../project/review-permission.ts";

const ROUND_LIMIT = 2;
// 독립 판정 2회와 중단·무효 등 판정이 없는 시도 2회를 허용한다.
const CALL_LIMIT = 4;

export type BudgetStage = "pre" | "post" | "backlog";
type BudgetUnit = "task" | "backlog";

export interface ReviewBudgetScope {
  unit: BudgetUnit;
  root: string;
  stage: BudgetStage;
  ledgerTarget: string;
  lockTarget: string;
  ledgerTargets: string[];
  kind: "task" | "goal";
  name: string;
}

export function recordedStage(scope: ReviewBudgetScope, ledgerTarget: string, entry: Pick<ReviewEntry | ReviewCallEntry, "target">): BudgetStage {
  if (scope.unit === "backlog") return "backlog";
  return ledgerTarget === scope.lockTarget && entry.target.toLowerCase() === "task.md" ? "pre" : "post";
}

function findUnit(target: string): { unit: BudgetUnit; root: string } | undefined {
  let found: { unit: BudgetUnit; root: string } | undefined;
  for (let dir = dirname(target); dir !== dirname(dir); dir = dirname(dir)) {
    const parent = dirname(dir);
    if (basename(parent) === "backlogs" && /^BL\d{6}_\d{2}(?:_|$)/.test(basename(dir))) {
      found = { unit: "backlog", root: dir };
    }
    const project = dirname(parent);
    if (basename(parent) === "tasks" && /^T\d{2,}(?:_|$)/.test(basename(dir)) &&
        basename(dirname(project)) === "projects" && /^P\d{3,}(?:_|$)/.test(basename(project))) {
      found = { unit: "task", root: dir };
    }
  }
  return found;
}

/** 대상은 realpath로 정규화한 뒤 전달한다. 새 하위 경로도 루트·evidence 두 원장 중 하나에 귀속한다. */
export function reviewBudgetScope(target: string): ReviewBudgetScope | undefined {
  const found = findUnit(target);
  if (!found) return undefined;
  const { unit, root } = found;
  const evidence = join(root, "evidence");
  const taskRelative = relative(root, target);
  const ledgerDir = unit === "task" && taskRelative.startsWith("evidence" + sep) ? evidence : root;
  const ledgerTarget = join(ledgerDir, "TASK.md");
  const lockTarget = join(root, "TASK.md");
  const ledgerTargets = [lockTarget];
  if (unit === "task") {
    try {
      if (lstatSync(evidence).isDirectory()) ledgerTargets.push(join(evidence, "TASK.md"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const name = relative(ledgerDir, target).split(sep).join("/");
  const stage = unit === "backlog" ? "backlog" : taskRelative.toLowerCase() === "task.md" ? "pre" : "post";
  return { unit, root, stage, ledgerTarget, lockTarget, ledgerTargets, kind: stage === "pre" ? "task" : "goal", name };
}

export interface BudgetStatus {
  unit: BudgetUnit;
  root: string;
  stage: BudgetStage;
  rounds: number;
  calls: number;
  round_limit: number;
  call_limit: number;
  exhausted: "rounds" | "calls" | null;
}

interface BudgetReview {
  ledgerTarget: string;
  entry: ReviewEntry;
}

/** 도입 이전에 구조만 판정한 시도는 호출로 보존한다. 원문이 입증할 때만 전체 판정으로 세지 않는다. */
function legacyStructureOnly(ledgerTarget: string, entry: ReviewEntry): boolean {
  if (entry.call_id || entry.kind !== "task" || entry.verdict !== "fail") return false;
  try {
    const path = join(dirname(ledgerTarget), entry.record);
    const record = JSON.parse(readFileSync(path, "utf8")) as { review?: { snapshot?: unknown }; result?: { text?: unknown } };
    const snapshot = record.review?.snapshot;
    const result = record.result?.text;
    return typeof snapshot === "string" && reviewHash(snapshot) === entry.hash &&
      typeof result === "string" && textHash(result) === entry.result_hash && proofScopeIssues(snapshot).length > 0;
  } catch {
    return false;
  }
}

export function readReviewBudget(scope: ReviewBudgetScope, offsets: Readonly<Record<string, number>> = {}) {
  const reserved = new Set<string>();
  let unreserved = 0;
  const rounds: BudgetReview[] = [];
  const ledgers = scope.ledgerTargets.map((target) => ({ target, entries: readLedger(target) }));
  let latestDefinitive: BudgetReview | undefined;
  let currentEntries: ReturnType<typeof readLedger> = [];
  for (const { target: ledgerTarget, entries } of ledgers) {
    const voided = new Map(entries.flatMap((entry) => entry.type === "void" ? [[entry.record, entry.target]] : []));
    const followupCalls = new Set(entries.flatMap((entry) =>
      entry.type === "review" && entry.followup && entry.call_id ? [entry.call_id] : []));
    const formats = new Map(entries.flatMap((entry) => entry.type === "format" ? [[entry.record, entry]] : []));
    const key = relative(scope.root, ledgerTarget).split(sep).join("/");
    const offset = Object.hasOwn(offsets, key) ? offsets[key] ?? 0 : 0;
    if (offset > entries.length) throw new LedgerError("계약 변경의 원장 기준점을 확인할 수 없다");
    const window = entries.slice(offset);
    if (ledgerTarget === scope.ledgerTarget) currentEntries = window;
    for (const entry of window) {
      if ((entry.type !== "call" && entry.type !== "review") ||
          recordedStage(scope, ledgerTarget, entry) !== scope.stage) continue;
      if (entry.type === "review" && !entry.interrupted) {
        const format = formats.get(entry.record);
        if ((format || entry.required_criteria !== undefined || entry.permission_basis || entry.permission) && (!format || format.target !== entry.target ||
            format.hash !== entry.hash || !matchingCriteria(format.required_criteria, entry.required_criteria) ||
            !matchesPermissionBasis(format.permission_basis, entry.permission_basis) ||
            (entry.verdict === "pass" && format.permission_basis &&
              (!parseGrantedPermission(entry.permission) || !matchesPermissionBasis(format.permission_basis, entry.permission))))) {
          throw new LedgerError(`필수 기준 기록과 검토 원장이 맞지 않는다: ${entry.record}`);
        }
      }
      const separate = entry.type === "review" ? !!entry.followup : followupCalls.has(entry.call_id);
      if (entry.type === "review" && entry.interrupted !== true && entry.verdict !== "unknown" &&
          voided.get(entry.record) !== entry.target && !legacyStructureOnly(ledgerTarget, entry)) {
        const review = { ledgerTarget, entry };
        // 한 지적의 확인은 원래 단계 판정과 그 지적 목록을 교체하지 않는다.
        if (entry.followup?.type !== "confirmation" &&
            (!latestDefinitive || latestDefinitive.entry.at <= entry.at)) latestDefinitive = review;
        if (!separate) rounds.push(review);
      }
      if (separate) continue;
      if (entry.call_id) reserved.add(entry.call_id);
      else unreserved++;
    }
  }
  const calls = reserved.size + unreserved;
  const exhausted: BudgetStatus["exhausted"] = calls >= CALL_LIMIT ? "calls" : rounds.length >= ROUND_LIMIT ? "rounds" : null;
  return {
    status: { unit: scope.unit, root: scope.root, stage: scope.stage, rounds: rounds.length, calls, round_limit: ROUND_LIMIT, call_limit: CALL_LIMIT, exhausted },
    latest: rounds.sort((a, b) => a.entry.at.localeCompare(b.entry.at)).at(-1),
    latestDefinitive,
    currentEntries,
    ledgers,
  };
}

/** verify와 외부 검토 넘김이 실행 전에 부르는 공통 예약 지점. 호출자는 범위 잠금을 먼저 잡는다. */
export function reserveReviewCall(scope: ReviewBudgetScope, at: Date, budget = readReviewBudget(scope),
  fixed?: { callId: string; digest: string }) {
  if (budget.status.exhausted) return { ...budget, callId: null };
  const callId = fixed?.callId ?? randomUUID();
  try {
    appendLedger(scope.ledgerTarget, { type: "call", at: at.toISOString(), target: scope.name, kind: scope.kind, call_id: callId,
      ...(fixed ? { frozen_digest: fixed.digest } : {}) });
  } catch (error) {
    throw new LedgerError(`검토 호출을 원장에 예약하지 못했다: ${(error as Error).message}`);
  }
  return { ...budget, callId };
}
