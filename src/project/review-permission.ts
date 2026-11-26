import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { lineDiff, lineOperations } from "../agent/line-diff.ts";

export type LineRange = { from: number; to: number };
export type PermissionInput = { mode: "probe" | "implementation"; paths: string[]; protected: LineRange[] };
export type ReviewPermission = PermissionInput & { base: string; task_mode: "100644" | "100755" };
export type PermissionBasis = Pick<ReviewPermission, "base" | "task_mode">;

export const APPLIED_REVIEW = "evidence/REVIEW-APPLIED.json";

export function isGitObject(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}

export function permissionPath(value: unknown): value is string {
  return typeof value === "string" && value.isWellFormed() && !/[\\:\p{Cc}\p{Cf}]/u.test(value) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

export function isReviewText(text: string): boolean {
  return !/[\0\uFFFD]/.test(text);
}

function validRange(value: unknown): value is LineRange {
  if (!value || typeof value !== "object") return false;
  const { from, to } = value as Record<string, unknown>;
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && Number(from) > 0 && Number(to) >= Number(from);
}

export function parsePermission(value: unknown): PermissionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { mode, paths, protected: protectedLines } = value as Record<string, unknown>;
  if ((mode !== "probe" && mode !== "implementation") || !Array.isArray(paths) || !paths.every(permissionPath) ||
      new Set(paths.map((path) => path.toLowerCase())).size !== paths.length ||
      !Array.isArray(protectedLines) || !protectedLines.every(validRange)) return null;
  return { mode, paths, protected: protectedLines.map(({ from, to }) => ({ from, to })) };
}

export function parsePermissionBasis(value: unknown): PermissionBasis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { base, task_mode } = value as Record<string, unknown>;
  return isGitObject(base) && (task_mode === "100644" || task_mode === "100755") ? { base, task_mode } : null;
}

export function matchesPermissionBasis(expected: PermissionBasis | undefined, value: unknown): boolean {
  if (!expected) return value === undefined;
  const parsed = parsePermissionBasis(value);
  return parsed?.base === expected.base && parsed.task_mode === expected.task_mode;
}

export function parseGrantedPermission(value: unknown): ReviewPermission | null {
  const permission = parsePermission(value);
  const basis = parsePermissionBasis(value);
  return permission && basis ? { ...permission, ...basis } : null;
}

export function samePermission(first: ReviewPermission, second: ReviewPermission): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function taskFileMode(path: string): PermissionBasis["task_mode"] | null {
  try {
    const stat = lstatSync(path);
    return stat.isFile() ? ((stat.mode & 0o111) ? "100755" : "100644") : null;
  } catch { return null; }
}

export function permissionBasis(taskRoot: string, target: string): PermissionBasis | null {
  const repo = dirname(dirname(dirname(dirname(taskRoot))));
  if (!existsSync(join(repo, ".git"))) return null;
  const task_mode = taskFileMode(target);
  const base = spawnSync("git", ["-C", repo, "rev-parse", "--verify", "HEAD"], {
    encoding: "utf8", timeout: 3000, maxBuffer: 16 * 1024, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1" },
  });
  const hash = base.stdout?.trim();
  if (base.status !== 0 || !isGitObject(hash) || !task_mode) throw new Error("검토 허가의 Git 기준 또는 대상 파일 종류를 확인할 수 없다");
  return { base: hash, task_mode };
}

function normalize(task: string): string {
  return task.replace(/\r\n/g, "\n").replace(/^- 상태: .+$/m, "- 상태:");
}

function taskNoteRanges(findings: unknown): LineRange[] {
  if (!Array.isArray(findings)) return [];
  return findings.flatMap((finding) => {
    if (!finding || (finding.effective !== "should_fix" && finding.effective !== "note") ||
        typeof finding.location !== "string") return [];
    return finding.location.split(/,[ \t]+/).flatMap((location: string) => {
      const match = /^TASK\.md:([1-9]\d*)(?:-([1-9]\d*))?$/.exec(location);
      const from = Number(match?.[1]), to = Number(match?.[2] ?? match?.[1]);
      return match && validRange({ from, to }) ? [{ from, to }] : [];
    });
  });
}

function structuralRanges(lines: string[]): LineRange[] {
  const protection: LineRange[] = [];
  let wholeSection = true;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (line.startsWith("## ")) wholeSection = /^## (?:목적|증명 범위|기준)(?:\s|$)/.test(line);
    if (wholeSection || /^ {0,3}(?:#|```|~~~)/.test(line)) protection.push({ from: index + 1, to: index + 1 });
  }
  return protection;
}

const structuralSyntax = /<!--|-->|^\s*(?:#|```|~~~|(?:-+|=+)[ \t]*$)/;

export type ApprovedTaskEdit = { original_hash: string; current_hash: string; diff: string };

export function permittedTaskDiff(snapshot: string, task: string, permission: ReviewPermission, findings: unknown): string | null {
  if (!permission.protected.length) return null;
  const before = normalize(snapshot), after = normalize(task);
  const lines = before.split("\n");
  const allowed = taskNoteRanges(findings).filter(({ to }) => to <= lines.length);
  const protectedLines = [...permission.protected, ...structuralRanges(lines)];
  const protectedTexts = new Set(lines.filter((_, index) => protectedLines.some(({ from, to }) => index + 1 >= from && index + 1 <= to)));
  const operations = lineOperations(before, after);
  let oldLine = 1;
  let changed = false;
  for (let index = 0; index < operations.length;) {
    if (operations[index]?.op === " ") { oldLine++; index++; continue; }
    const start = oldLine;
    let inserted = 0;
    let invalid = false;
    while (index < operations.length && operations[index]!.op !== " ") {
      const op = operations[index++]!;
      if (op.op === "-") {
        invalid ||= structuralSyntax.test(op.text) || protectedTexts.has(op.text) && op.text.trim() !== "";
        oldLine++;
      } else {
        inserted++;
        invalid ||= structuralSyntax.test(op.text);
      }
    }
    if (oldLine === start || !inserted || invalid) return null;
    const end = oldLine - 1;
    if (protectedLines.some(({ from, to }) => start <= to && from <= end)) return null;
    for (let line = start; line <= end; line++) {
      if (!allowed.some(({ from, to }) => line >= from && line <= to)) return null;
    }
    changed = true;
  }
  return changed ? lineDiff(before, after) : null;
}
