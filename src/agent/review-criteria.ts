import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReviewBudgetScope } from "./review-budget.ts";
import { taskFormat } from "../project/pre-review.ts";

export type ReviewCriterion = { id: string; text: string };

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
  let document = artifact;
  const contract = scope.stage === "post" ? scope.lockTarget
    : scope.stage === "backlog" && !/^(?:BACKLOG\.md|BR\d{2}_[^/]+\.md)$/i.test(scope.name) ? join(scope.root, "BACKLOG.md")
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
