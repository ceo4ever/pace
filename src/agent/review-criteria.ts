import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReviewBudgetScope } from "./review-budget.ts";
import { taskFormat } from "../project/pre-review.ts";
import { regularBytes, utf8 } from "../project/handoff-files.ts";
import { AgentError } from "./contract.ts";
import { POST_BUNDLE_ITEMS } from "./structured-review.ts";

export { isBundleItems, POST_BUNDLE_ITEMS } from "./structured-review.ts";

export type { ReviewCriterion } from "./structured-review.ts";
import type { ReviewCriterion } from "./structured-review.ts";

const criterionId = /^[A-Z][A-Z0-9]*-[1-9]\d*$/;

export function validCriterionIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === "string" && criterionId.test(id)) &&
    new Set(value).size === value.length;
}

export function matchingCriteria(required: readonly string[], value: unknown): boolean {
  return validCriterionIds(value) && required.length === value.length && required.every((id, index) => id === value[index]);
}

function criterionSection(document: string): string | undefined {
  const clean = document.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").replace(/^```.*$[\s\S]*?^```[ \t]*$/gm, "");
  const sections = clean.split(/(?=^#{2,3} )/m);
  return sections.find((section) => /^#{2,3} (?:기준|합격 기준|완료 기준)[ \t]*$/m.test(section)) ??
    sections.find((section) => /^#{2,3} [^\n]+ 완료 기준[ \t]*$/m.test(section));
}

function fromSection(section: string | undefined): ReviewCriterion[] {
  if (!section) return [];
  const rows: ReviewCriterion[] = [];
  for (const line of section.split("\n").slice(1)) {
    const cells = line.match(/^\|\s*([A-Z][A-Z0-9]*-[1-9]\d*)\s*\|\s*([^|]+?)\s*\|/);
    if (cells) {
      if (cells[2]?.trim()) rows.push({ id: cells[1]!, text: cells[2].trim() });
      continue;
    }
    const bullet = line.match(/^(?:[-*]|\d+\.)\s+(\S.+)$/);
    if (bullet) rows.push({ id: `C-${rows.length + 1}`, text: bullet[1]!.trim() });
  }
  return validCriterionIds(rows.map(({ id }) => id)) ? rows : [];
}

const backlogReadiness: ReviewCriterion[] = [
  { id: "B-1", text: "상위 목적과 owner 합의에서 목표가 확인된다" },
  { id: "B-2", text: "완료 기준을 관측 가능한 근거로 판정할 수 있다" },
  { id: "B-3", text: "순서와 선행 작업이 다른 백로그와 충돌하지 않는다" },
  { id: "B-4", text: "착수에 필요한 owner 결정이 끝났다" },
];

export function reviewCriteria(scope: ReviewBudgetScope, artifact: string): ReviewCriterion[] {
  if (scope.stage === "post") return [...POST_BUNDLE_ITEMS];
  let document = artifact;
  const contract = scope.stage === "backlog" &&!/^(?:BACKLOG\.md|BR\d{2}_[^/]+\.md)$/i.test(scope.name) ? join(scope.root, "BACKLOG.md")
    : null;
  if (contract) {
    try {
      if (!lstatSync(contract).isFile()) return [];
      document = readFileSync(contract, "utf8");
    } catch { return []; }
  }
  const section = criterionSection(document);
  if (section !== undefined) return fromSection(section);
  if (scope.stage === "backlog" && /^# BL\d{6}_\d{2}\b/m.test(document)) {
    return /^## 목표[ \t]*$/m.test(document) ? backlogReadiness : [];
  }
  if (/^# BR\d{2}\b/m.test(document) || taskFormat(document) !== "legacy" || !document.trim()) return [];
  // 고정 ID를 채택하기 전의 문서는 원문에서 승인 기준과 그 관측을 한 항목으로 대조한다.
  return [{ id: "C-1", text: "검토 대상 원문의 수용 기준을 식별하고 관측 근거를 확인한다" }];
}

/** 사후 reviewer 대상의 형식: 첫 비공백 줄이 `diff --git `이고 헝크 머리가 하나 이상이다. 내용의 진위는 보지 않는다. */
export function postTargetIssue(text: string): string | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const first = lines.find((line) => line.trim() !== "");
  if (first?.startsWith("diff --git ") && lines.some((line) => /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(line))) return null;
  return "구현 후 reviewer 대상은 구현 diff다(첫 줄 `diff --git `과 헝크 머리) — 문서·결과물 확인은 tester 경로(`pace agent run`으로 tester 배정)로 한다";
}

/** 사후 묶음 점검이 붙이는 태스크 계약. 링크·하드 링크·비UTF-8은 거부한다. */
export function postTaskContract(scope: ReviewBudgetScope): string {
  try { return utf8(regularBytes(scope.lockTarget, 16 * 1024 * 1024)); }
  catch { throw new AgentError("invalid_request", "태스크 계약(TASK.md)을 안전한 일반 UTF-8 파일로 읽을 수 없다"); }
}
