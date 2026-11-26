import { isAbsolute, relative } from "node:path";
import { permissionPath } from "../project/review-permission.ts";
import { hasSecret } from "../project/secrets.ts";
import type { LedgerEntry, ReviewEntry } from "./review-log.ts";
import type { StructuredAssessment } from "./structured-review.ts";

type Unit = { kind: "artifact" | "task" | "backlog"; ref: string };
type Signal = { kind: "review_failures" | "recurring_area" | "superficial_fix"; unit: Unit; evidence: string[]; file?: string };
type Snapshot = { target: string; snapshot: string; assessment: StructuredAssessment; record: string };
type Finding = NonNullable<StructuredAssessment["findings"]>[number];
type Area = { file: string; first: number; last: number; finding: Finding };

const generalThreshold = 2;
const lineWindow = 8;

export function reviewFailureSignal(entries: readonly LedgerEntry[], current: ReviewEntry): Signal | undefined {
  if (current.verdict !== "fail" || current.interrupted || current.stale) return;
  const relevant = entries.filter((row) => row.target === current.target);
  const voided = new Set(relevant.flatMap((row) => row.type === "void" ? [row.record] : []));
  const streak: string[] = [];
  for (const row of relevant) {
    if (row.type === "decision" || row.type === "diagnosis") streak.length = 0;
    if (row.type !== "review" || row.interrupted || row.stale || voided.has(row.record)) continue;
    if (row.verdict === "pass") streak.length = 0;
    if (row.verdict === "fail") streak.push(row.record);
  }
  if (streak.length === generalThreshold && streak.at(-1) === current.record) {
    return { kind: "review_failures", unit: { kind: "artifact", ref: current.target }, evidence: streak };
  }
}

function usableAreas(assessment: StructuredAssessment, root: string): Area[] {
  return (assessment.findings ?? []).flatMap((finding) => {
    if (!["blocking", "should_fix"].includes(finding.effective) || !finding.location ||
        finding.reason === "missing_evidence" || finding.reason === "unknown_criterion" ||
        (!finding.scenario || !finding.reproduction) && !finding.safety_path) return [];
    return finding.location.split(/,[ \t]+/).flatMap((location) => {
      const match = /^(.+?):([1-9]\d{0,7})(?::[1-9]\d{0,7})?(?:-([1-9]\d{0,7})(?::[1-9]\d{0,7})?)?$/.exec(location);
      if (!match) return [];
      const name = match[1]!;
      const file = (isAbsolute(name) ? relative(root, name) : name).replaceAll("\\", "/");
      const first = Number(match[2]), last = Number(match[3] ?? match[2]);
      return permissionPath(file) && !hasSecret(file) && first <= last ? [{ file, first, last, finding }] : [];
    });
  });
}

function sameArea(before: Area, after: Area): boolean {
  const a = before.finding, b = after.finding;
  const sameCriterion = a.criterion ? a.criterion === b.criterion : !b.criterion && !!a.impact && a.impact === b.impact;
  return before.file === after.file && a.category === b.category && sameCriterion &&
    before.first <= after.last + lineWindow && after.first <= before.last + lineWindow;
}

function patchSection(text: string, file: string): string | undefined {
  const sections = text.replaceAll("\r\n", "\n").split(/(?=^diff --git )/m).filter((section) => {
    if (!section.startsWith("diff --git ")) return false;
    const header = section.split(/^@@ /m, 1)[0] ?? "";
    return /^\+\+\+ b\/([^\r\n\t]+)(?:\t.*)?\r?$/m.exec(header)?.[1] === file;
  });
  if (sections.length !== 1) return undefined;
  const hunks = sections[0]!.split(/^@@ /m).slice(1);
  const edits = hunks.flatMap((hunk) => hunk.split("\n").slice(1).filter((line) => line.startsWith("+") || line.startsWith("-")));
  return edits.length ? edits.join("\n") : undefined;
}

function changedInReview(before: string, after: string, target: string, file: string): boolean {
  if (target === file) return true;
  if (!/\.(?:patch|diff)$/.test(target)) return false;
  const previous = patchSection(before, file), current = patchSection(after, file);
  return previous !== undefined && current !== undefined && previous !== current;
}

/** 기록에서 유효한 위치와 항목이 대조될 때만 권고한다. 계약의 판정·원장 데이터와는 독립이다. */
export function recurringReviewSignals(unit: Unit, root: string, before: Snapshot, after: Snapshot): Signal[] {
  if (before.snapshot === after.snapshot || before.record === after.record) return [];
  const old = usableAreas(before.assessment, root), updated = usableAreas(after.assessment, root);
  const targetFile = relative(root, after.target).replaceAll("\\", "/");
  let recurring: string | undefined, superficial: string | undefined;
  for (const current of updated) {
    const candidates = old.filter((previous) => sameArea(previous, current));
    if (!candidates.length) continue;
    recurring ??= current.file;
    if (before.target === after.target && candidates.some((previous) => previous.finding.effective === current.finding.effective) &&
        changedInReview(before.snapshot, after.snapshot, targetFile, current.file)) {
      superficial = current.file;
      break;
    }
  }
  const evidence = [before.record, after.record];
  const signals: Signal[] = [];
  if (recurring) signals.push({ kind: "recurring_area", unit, evidence, file: recurring });
  if (superficial) signals.push({ kind: "superficial_fix", unit, evidence, file: superficial });
  return signals;
}
