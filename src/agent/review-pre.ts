import { join } from "node:path";
import { parseArgs } from "node:util";
import { reviewHash, reviewIssues, workingReview } from "../project/pre-review.ts";
import { matchesPermissionBasis } from "../project/review-permission.ts";
import { AgentError, errorPayload } from "./contract.ts";
import { reviewBudgetScope } from "./review-budget.ts";
import { matchingCriteria } from "./review-criteria.ts";
import { assertManagedFile, lockReviewScope, reviewIdentity, reviewInput, reviewTarget } from "./review-hand.ts";
import { LedgerError, parseVerdict, readLedger, textHash, type LedgerEntry, type ReviewEntry } from "./review-log.ts";
import { assessStructuredReview, effectiveBlocking } from "./structured-review.ts";
import { recoverBudgetOrphans, writeOrLedgerError } from "./verify-cli.ts";

export const REVIEW_PRE_USAGE = "pace agent review-pre --target <TASK.md> --author-provider <제공자>";
const PRE = "PRE-REVIEW.json";

type Attempt = {
  hash: string;
  provider: string;
  cross: boolean;
  status: "pass" | "fail" | "unavailable";
  blocking: number;
  evidence: string;
  continuity: "new" | "changed";
  reason?: string;
  permission?: ReviewEntry["permission"];
  source?: "external";
};

function reject(message: string): never { throw new AgentError("invalid_request", message); }

function sourceFor(root: string, row: ReviewEntry, ledger: LedgerEntry[]) {
  const archive = JSON.parse(reviewInput(join(root, row.record)));
  const raw = archive?.result?.text;
  const snapshot = archive?.review?.snapshot;
  if (typeof raw !== "string" || typeof snapshot !== "string" || textHash(raw) !== row.result_hash || reviewHash(snapshot) !== row.hash ||
      archive.review.target !== row.target || archive.review.hash !== row.hash || archive.review.verdict !== row.verdict ||
      (row.cross !== undefined && row.cross !== archive.cross) ||
      (archive.result.provider?.value !== undefined && archive.result.provider.value !== row.provider)) {
    return reject(`원장의 시도와 검토 원문이 다르다: ${row.record}`);
  }
  const stamps = ledger.filter((entry) => entry.type === "format" && entry.target === row.target && entry.record === row.record);
  if (stamps.length || row.required_criteria !== undefined) {
    const stamp = stamps[0];
    if (stamps.length !== 1 || stamp?.type !== "format" || stamp.hash !== row.hash ||
        !matchingCriteria(stamp.required_criteria, row.required_criteria) ||
        !matchingCriteria(stamp.required_criteria, archive.review.required_criteria) ||
        !matchesPermissionBasis(stamp.permission_basis, row.permission_basis) ||
        !matchesPermissionBasis(stamp.permission_basis, archive.review.permission_basis)) {
      return reject(`원문의 필수 기준·허가 표지가 원장과 다르다: ${row.record}`);
    }
  }
  if (row.structured_stage !== undefined) {
    if (row.structured_stage !== "pre" || archive.review.structured_stage !== "pre") return reject("사전 검토의 기록 단계가 다르다");
    const evaluated = assessStructuredReview("pre", raw, row.required_criteria, row.permission_basis ? snapshot.split("\n").length : undefined);
    if (evaluated.verdict !== row.verdict) return reject(`검토 원문의 다시 계산한 판정이 다르다: ${row.record}`);
    return { archive, blocking: effectiveBlocking(evaluated).length };
  }
  if (parseVerdict(raw) !== row.verdict) return reject(`옛 검토 기록의 판정이 다르다: ${row.record}`);
  const labeled = raw.split("\n").filter((line) =>
    /^\s*(?:(?:[-#*]+|\d+[.)])\s+)?(?:\*\*)?(?:\[blocking\]|blocking(?=[ :—*]))/i.test(line)).length;
  const reported = /(?:^|[·\s])blocking[ \t]+(\d+)(?:건|\b)/i.exec(raw)?.[1];
  const blocking = row.verdict === "pass" ? 0 : labeled || Number(reported);
  if (!Number.isSafeInteger(blocking) || blocking <= 0 && row.verdict === "fail") {
    return reject(`옛 실패의 차단 지적 수를 원문에서 확인할 수 없다: ${row.record}`);
  }
  return { archive, blocking };
}

function attemptsFromLedger(root: string, ledger: LedgerEntry[], author: string): Attempt[] {
  const invalidated = new Set(ledger.flatMap((entry) => entry.type === "void" && entry.target === "TASK.md" ? [entry.record] : []));
  const attempts: Attempt[] = [];
  let boundary: string | undefined;
  for (const row of ledger) {
    if (row.target !== "TASK.md") continue;
    if (row.type === "diagnosis" || row.type === "decision") {
      boundary = "진단 또는 결정 뒤 새 기준 전체 검토";
      continue;
    }
    if (row.type === "void") {
      boundary = `검토 무효 기록 ${row.record} 뒤 검토`;
      continue;
    }
    if (row.type !== "review" || row.interrupted || row.verdict === "unknown" || invalidated.has(row.record) ||
        row.followup?.type === "confirmation") continue;
    const provider = row.provider;
    if (!reviewIdentity(provider)) return reject(`검토 제공자를 확인할 수 없다: ${row.record}`);
    const cross = provider !== author;
    if (row.cross !== undefined && row.cross !== cross) return reject("검토 원장의 교차 여부와 작성자 제공자가 다르다");
    const { archive, blocking } = sourceFor(root, row, ledger);
    const reset = row.followup?.type === "owner" ? "기록된 사용자 결정 뒤 새 전체 검토" : boundary;
    const reason = row.rereview_of ? `원장 기준점 ${row.rereview_of}에서 재검토` : reset;
    if (row.rereview_of && !ledger.some((entry) => entry.type === "review" && entry.target === row.target && entry.record === row.rereview_of)) {
      return reject(`사전 재검토의 기준점이 원장에 없다: ${row.rereview_of}`);
    }
    if (row.verdict === "pass" && attempts.some((entry) => entry.status === "fail") && !reason) {
      return reject(`실패 이후 통과의 원장 연속성을 확인할 수 없다: ${row.record}`);
    }
    const continuity = reason ? "changed" : "new";
    if (!cross) {
      if (!row.cross_unavailable?.length || !Array.isArray(archive.cross_unavailable) ||
          JSON.stringify(row.cross_unavailable) !== JSON.stringify(archive.cross_unavailable)) {
        return reject(`같은 제공자 대체의 교차 미실행 근거가 없다: ${row.record}`);
      }
      const other = archive.cross_attempt?.provider ?? (provider === "anthropic" ? "openai" : provider === "openai" ? "anthropic" : null);
      if (!reviewIdentity(other) || other === provider) return reject("교차 미실행 제공자를 원문에서 확인할 수 없다");
      attempts.push({ hash: row.hash, provider: other, cross: true, status: "unavailable", blocking: 0,
        evidence: row.record, continuity, reason: row.cross_unavailable.join(" · ") });
    }
    attempts.push({ hash: row.hash, provider, cross, status: row.verdict, blocking, evidence: row.record,
      continuity, ...(reason ? { reason } : {}), ...(row.permission ? { permission: row.permission } : {}),
      ...(archive.source === "external" ? { source: "external" as const } : {}) });
    boundary = undefined;
  }
  return attempts;
}

export function reviewPreCommand(args: string[], deps: { write: (text: string) => void; now?: () => Date }): number {
  const { values } = parseArgs({ args, strict: true, options: { target: { type: "string" }, "author-provider": { type: "string" } } });
  let release: (() => void) | undefined;
  const respond = (value: unknown) => deps.write(JSON.stringify(value, null, 2) + "\n");
  try {
    const target = reviewTarget(values.target);
    const scope = reviewBudgetScope(target);
    const author = values["author-provider"];
    if (scope?.stage !== "pre" || scope.name !== "TASK.md" || !reviewIdentity(author)) return reject(REVIEW_PRE_USAGE);
    const path = join(scope.root, PRE);
    release = lockReviewScope(scope);
    const exists = assertManagedFile(path);
    recoverBudgetOrphans(scope, deps.now ?? (() => new Date()));
    const current = reviewInput(target);
    const attempts = attemptsFromLedger(scope.root, readLedger(scope.ledgerTarget), author);
    if (!attempts.length) return reject("사전 검토 원장에 옮길 수 있는 판정이 없다");
    let waiver: unknown;
    if (exists) {
      const previous = JSON.parse(reviewInput(path));
      waiver = previous && Object.hasOwn(previous, "waiver") ? previous.waiver : previous?.inactive_waiver;
    }
    const candidate = workingReview(scope.root);
    const base = { version: 1, author, attempts };
    const inspect = (generated: typeof base & { waiver?: unknown }) => reviewIssues(scope.root, current, {
      ...candidate,
      hasEntry: (file) => file === PRE || candidate.hasEntry(file),
      hasProof: (file) => file === PRE || candidate.hasProof(file),
      readText: (file) => file === PRE ? JSON.stringify(generated) : candidate.readText(file),
    });
    const retained = waiver !== undefined && inspect({ ...base, waiver }).length === 0;
    const generated = waiver === undefined ? base : retained ? { ...base, waiver } : { ...base, inactive_waiver: waiver };
    const issues = inspect(generated);
    const latest = attempts.at(-1)!;
    const awaitingReview = latest.status !== "pass" || latest.hash !== reviewHash(current);
    if (issues.length && !awaitingReview) return reject(issues.join(" · "));
    const content = JSON.stringify(generated, null, 2) + "\n";
    if (!exists || reviewInput(path) !== content) writeOrLedgerError(path, content, "사전 검토 기록");
    respond({ generated: PRE, attempts: attempts.length, pre_review_ok: issues.length === 0, issues,
      ...(waiver !== undefined ? { waiver: retained ? "retained" : "inactive_preserved" } : {}) });
    return 0;
  } catch (error) {
    const failure = error instanceof AgentError ? error : new AgentError("invalid_request", error instanceof LedgerError ? error.message :
      "사전 검토 원장·기록을 확인할 수 없다");
    respond(errorPayload(failure));
    return failure.exitCode;
  } finally {
    release?.();
  }
}
