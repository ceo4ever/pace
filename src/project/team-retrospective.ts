import { teamMarkdown } from "./team-markdown.ts";
import { inputHash, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { loadTeam, safeTeamPath } from "../team/store.ts";
import { observeHandoffLedger } from "./handoff-store.ts";
import { readEvents } from "./event-log.ts";
import { fields, HandoffError, identifier } from "./handoff-files.ts";
import { observationCovered, type TeamPeriod, evidenceReceipt, measurementFile, metadataJson, natural, proofRefs, retrospectiveFile } from "./team-input.ts";
import { hasTeamContract, teamMarker } from "./team-contract.ts";
import { gateFailureReasons } from "./metrics.ts";
import { reviewFindingMetrics } from "./metrics-report.ts";

export function adoptTeamMetrics(root: string, projectDir: string): void {
  const path = safeTeamPath(root, `${projectDir}/PROJECT.md`), text = readFileSync(path, "utf8");
  if (teamMarker(text)) return;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const next = text.replace(/^(# [^\r\n]+)(\r?\n)/, `$1$2${newline}- 팀 측정: v1${newline}`);
  if (next === text) throw new HandoffError("팀 측정 marker를 넣을 프로젝트 표제가 없다");
  writeFileAtomic(path, next);
}
export function teamRetrospectiveRequired(root: string, projectDir: string, inputs?: InputTrace): boolean {
  const dir = join(root, projectDir), path = join(dir, "PROJECT.md"), bytes = readFileSync(path);
  inputs?.record(path, inputHash(bytes));
  const id = projectDir.split("/").at(-1)!.slice(0, 4);
  const required = hasTeamContract(id, bytes.toString("utf8"), existsSync(join(dir, measurementFile)), readEvents(dir, inputs));
  if (required) safeTeamPath(root, `${projectDir}/PROJECT.md`);
  return required;
}
/** Validates metadata only. It neither loads private bodies nor applies proposed role changes. */
export interface KnownFinding { kind: string; code: string; count: number }
export function findingCode(f: Pick<KnownFinding, "kind" | "code">): string { return `${f.kind}-${f.code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`; }
const standardFindingCodes = new Set([
  ...gateFailureReasons.map((code) => findingCode({ kind: "gate", code })),
  ...reviewFindingMetrics.map(([code]) => findingCode({ kind: "review", code })),
]);
function tableCells(line: string): string[] | null {
  const source = line.replace(/[ \t]+$/, "");
  if (!source.startsWith("|")) return null;
  const cells: string[] = []; let start = 1, backslashes = 0;
  for (let i = 1; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") { backslashes++; continue; }
    if (char === "|" && backslashes % 2 === 0) { cells.push(source.slice(start, i).replace(/^[ \t]+|[ \t]+$/g, "")); start = i + 1; }
    backslashes = 0;
  }
  return start === source.length ? cells : null;
}
function cellInk(value: string): boolean {
  // Default-ignorables and BRAILLE PATTERN BLANK cannot establish visible cell content.
  let visible = value.replace(/[\s\p{M}\p{Default_Ignorable_Code_Point}\u2800]/gu, "");
  if (/[\p{M}\p{Default_Ignorable_Code_Point}\u2800]/u.test(value)) visible = visible.replace(/[*_~\[\]]/g, "");
  return !!visible;
}
function escapedPunctuation(value: string, at: number): boolean {
  const n = value.charCodeAt(at + 1);
  return value[at] === "\\" && (n >= 33 && n <= 47 || n >= 58 && n <= 64 || n >= 91 && n <= 96 || n >= 123 && n <= 126);
}
function bracketEnd(value: string, at: number): number {
  let depth = 1;
  for (let i = at + 1; i < value.length; i++) {
    if (escapedPunctuation(value, i)) { i++; continue; }
    if (value[i] === "[") depth++;
    else if (value[i] === "]" && --depth === 0) return i;
  }
  return -1;
}
function destinationEnd(value: string, at: number): number {
  const spaces = (pos: number) => { while (value[pos] === " " || value[pos] === "\t") pos++; return pos; };
  const title = (pos: number): number => {
    const opener = value[pos], closer = opener === "(" ? ")" : opener;
    if (opener !== '"' && opener !== "'" && opener !== "(") return -1;
    for (let i = pos + 1; i < value.length; i++) {
      if (escapedPunctuation(value, i)) { i++; continue; }
      if (value[i] === closer) return i + 1;
      if (value[i] === "\r" || value[i] === "\n" || opener === "(" && value[i] === "(") return -1;
    }
    return -1;
  };
  const finishTitle = (pos: number) => { const end = title(pos); return end >= 0 && value[spaces(end)] === ")" ? spaces(end) : -1; };
  const start = spaces(at + 1);
  let pos = start, depth = 0;
  if (value[pos] === "<") {
    for (pos++; pos < value.length && value[pos] !== ">"; pos++) {
      if (escapedPunctuation(value, pos)) { pos++; continue; }
      if (value[pos] === "<" || value[pos] === "\r" || value[pos] === "\n") return -1;
    }
    if (value[pos++] !== ">") return -1;
  } else {
    for (; pos < value.length; pos++) {
      if (escapedPunctuation(value, pos)) { pos++; continue; }
      const char = value[pos]!;
      if (char === " " || char === "\t" || char === ")" && depth === 0) break;
      if (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) return -1;
      if (char === "(" && ++depth > 16) return -1;
      if (char === ")") depth--;
    }
  }
  if (depth === 0) {
    const next = spaces(pos);
    if (value[next] === ")") return next;
    if (next > pos) { const end = finishTitle(next); if (end >= 0) return end; }
  }
  // Empty destination followed by a title is also valid CommonMark.
  return finishTitle(start);
}
/** Projects the supported cell text without borrowing destination/title text as label ink. */
function cellText(value: string, depth = 0): { text: string; valid: boolean } {
  if (depth > 16) return { text: "", valid: false };
  let text = "";
  for (let i = 0; i < value.length;) {
    if (escapedPunctuation(value, i)) { text += "x"; i += 2; continue; }
    if (value[i] !== "[") { text += value[i++]!; continue; }
    const end = bracketEnd(value, i);
    if (end < 0) return { text, valid: false };
    const label = cellText(value.slice(i + 1, end), depth + 1);
    if (!label.valid) return { text, valid: false };
    if (value[i - 1] === "!" && text.endsWith("!")) return { text, valid: false };
    let next = end + 1, target = -1;
    if (value[next] === "(") target = destinationEnd(value, next);
    else { while (value[next] === " " || value[next] === "\t") next++; if (value[next] === "[") target = bracketEnd(value, next); }
    if (value[end + 1] === "(" || value[next] === "[") {
      if (target < 0 || !cellInk(label.text)) return { text, valid: false };
      text += label.text; i = target + 1;
    } else { text += `[${label.text}]`; i = end + 1; }
  }
  return { text, valid: true };
}
function usableText(value: string): boolean {
  const projected = cellText(value);
  return projected.valid && cellInk(projected.text) && !/[\p{Cc}\p{Cf}]/u.test(value) && !projected.text.includes("`") &&
    !/<!--|<\?|<![A-Za-z]|<!\[CDATA\[|<\/?[A-Za-z][A-Za-z0-9-]*(?=[ \t/>])(?:"[^"]*"|'[^']*'|[^'"<>])*?>|&(?:#[xX]?[a-fA-F0-9]+|[A-Za-z][A-Za-z0-9]+);/.test(projected.text);
}
function visibleTeamRows(close: string): string[] {
  const lines: string[] = [], rows: string[] = []; let active = false;
  for (const line of teamMarkdown(close, "retrospective").split("\n")) {
    if (active && /^#{1,2}(?:[ \t]|$)/.test(line)) break;
    if (!active) { const heading = /^##[ \t]+회고(?:[ \t]+#+)?[ \t]*$/.exec(line); active = heading?.[0] === line; }
    else lines.push(line);
  }
  if (lines.includes("<!-- unsupported underline -->")) throw new HandoffError("회고 표 구간은 ATX 제목만 사용한다: 밑줄·구분선·빈 목록처럼 기호만 있는 지원 밖 행을 ATX 제목 또는 빈 줄로 정리한다");
  if (lines.includes("<!-- unsupported indented heading -->")) throw new HandoffError("회고 기계 구간의 제목은 열0에 쓴다: 목록 안/들여쓴 제목을 일반 텍스트로 정리한다");
  for (let i = 0; i + 2 < lines.length; i++) {
    if (!lines[i]!.startsWith("|")) continue;
    let end = i + 1;
    while (end < lines.length && lines[end]!.startsWith("|")) end++;
    const header = tableCells(lines[i]!), separator = tableCells(lines[i + 1]!);
    const accepted = header?.length === 3 && header.every(usableText) && separator?.length === 3 && separator.every((cell) => /^:?-{3,}:?$/.test(cell));
    if (accepted) for (let j = i + 2; j < end; j++) { const cells = tableCells(lines[j]!); if (cells?.length === 3 && cells[0] === "팀") rows.push(lines[j]!); }
    i = end - 1;
  }
  return rows;
}
export function validateTeamRetrospective(root: string, projectDir: string, close: string, findings: KnownFinding[] = [], candidateRoles?: string[], period?: TeamPeriod, inputs?: InputTrace): void {
  const dir = join(root, projectDir);
  const rows = visibleTeamRows(close);
  const row = rows.length === 1 ? tableCells(rows[0]!) : null;
  const summary = row?.[2]?.trim();
  const link = row?.[1] ?? "";
  const end = link.startsWith("[") ? bracketEnd(link, 0) : -1;
  const label = end > 0 && link.slice(end + 1) === `(${retrospectiveFile})` ? link.slice(1, end) : undefined;
  if (row?.length !== 3 || row[0] !== "팀" || !label || /[\[\]]/.test(label) || !usableText(label) || !summary || !usableText(summary)) throw new HandoffError("PROJECT-CLOSE 회고에 팀 행·고정 JSON 링크·보이는 일반 텍스트가 필요하다: 빈 링크/제어 문자/HTML/주석/엔터티/inline 코드는 일반 텍스트로 정리한다");
  const v = metadataJson(safeTeamPath(root, `${projectDir}/${retrospectiveFile}`), 32768, inputs);
  fields(v, ["version", "metricRef", "unusedRoles", "recurringFindings", "definitionChanges", "noChangesReasonRef"], ["version", "metricRef", "unusedRoles", "recurringFindings", "definitionChanges"]);
  if (v.version !== 1 || v.metricRef !== "METRICS.md") throw new HandoffError("팀 회고 version/metricRef 오류");
  // METRICS.md is a generated destination; first finish must not require it to exist yet.
  safeTeamPath(root, `${projectDir}/METRICS.md`);
  if (!Array.isArray(v.unusedRoles) || !Array.isArray(v.recurringFindings) || v.recurringFindings.length > 32 ||
      !Array.isArray(v.definitionChanges) || v.definitionChanges.length > 3) throw new HandoffError("팀 회고 목록/정의 변경 개수 오류");
  const roles = new Set<string>();
  for (const r of v.unusedRoles as unknown[]) {
    fields(r, ["role", "coverage", "refs"]);
    if (!identifier(r.role) || roles.has(r.role) || !["observed-none", "unconfirmed"].includes(r.coverage as string)) throw new HandoffError("미사용 후보 역할/관측 범위 오류");
    roles.add(r.role); const refs = proofRefs(dir, r.refs, inputs);
    if (r.coverage === "observed-none" && (!period || !refs.some((ref) => observationCovered(dir, ref, period, r.role as string, "none", inputs)))) throw new HandoffError("관측 없음 후보는 현재 구간의 범위 근거가 필요하다");
  }
  const reportedFindings = new Map<string, number>();
  for (const r of v.recurringFindings as unknown[]) {
    fields(r, ["code", "count", "coverage", "refs"]);
    if (!identifier(r.code) || reportedFindings.has(r.code) || !natural(r.count) || r.count < 2 || r.coverage !== "reported" || !proofRefs(dir, r.refs, inputs).length) throw new HandoffError("반복 지적은 신고 count≥2와 근거가 필요하다");
    reportedFindings.set(r.code, r.count);
  }
  const events = readEvents(dir, inputs), declared = new Set(events.flatMap((e) => e.role ? [e.role.name] : []));
  const ledger = observeHandoffLedger(root, projectDir.split("/").at(-1)!.slice(0, 4), projectDir, inputs);
  for (const r of ledger.rows) for (const a of [r.from, r.to]) if (a.startsWith("agent:")) declared.add(a.slice(6));
  const members = loadTeam(root, inputs);
  const expectedRoles = candidateRoles ?? members.filter((m) => !declared.has(m.name)).map((m) => m.name);
  if (candidateRoles) for (const entry of v.unusedRoles as Record<string, unknown>[]) if (entry.coverage === "observed-none" && !candidateRoles.includes(entry.role as string)) throw new HandoffError("현재 관측/참여 역할은 관측 없음 후보로 신고할 수 없다");
  for (const name of expectedRoles) if (!roles.has(name)) throw new HandoffError("회고에 알려진 미사용 검토 후보가 빠졌다");
  const expectedFindings = new Map(findings.filter((f) => ["gate", "review"].includes(f.kind) && f.count >= 2).map((f) => [findingCode(f), f.count]));
  if ([...expectedFindings].some(([code, count]) => reportedFindings.get(code) !== count) ||
      [...reportedFindings.keys()].some((code) => standardFindingCodes.has(code) && !expectedFindings.has(code))) {
    throw new HandoffError("회고의 반복 지적이 현재 지표 후보와 불일치한다");
  }
  const changes = v.definitionChanges as unknown[];
  const knownRoles = new Set([...members.map((m) => m.name), ...declared]);
  if (changes.length === 0) evidenceReceipt(dir, v.noChangesReasonRef, inputs);
  else {
    if (v.noChangesReasonRef !== undefined) throw new HandoffError("정의 변경과 무변경 이유를 함께 둘 수 없다");
    for (const c of changes) { fields(c, ["role", "changeRef", "reasonRef"]); if (!identifier(c.role) || !knownRoles.has(c.role)) throw new HandoffError("정의 변경 역할은 팀 원본/참여 기록에 있어야 한다"); evidenceReceipt(dir, c.changeRef, inputs); evidenceReceipt(dir, c.reasonRef, inputs); }
  }
}
export function teamRetrospectiveIssues(root: string, projectDir: string, findings: KnownFinding[] = [], candidateRoles?: string[], period?: TeamPeriod, inputs?: InputTrace, requireAdoption = false): string[] {
  try {
    if (!teamRetrospectiveRequired(root, projectDir, inputs)) return requireAdoption ? ["팀 채택 근거가 검사 중 사라졌다: 팀 측정 입력을 복원하고 다시 마감한다"] : [];
    const bytes = readFileSync(safeTeamPath(root, `${projectDir}/PROJECT-CLOSE.md`)), close = bytes.toString("utf8");
    inputs?.record(join(root, projectDir, "PROJECT-CLOSE.md"), inputHash(bytes));
    validateTeamRetrospective(root, projectDir, close, findings, candidateRoles, period, inputs); return [];
  } catch (e) { return [`팀 회고: ${e instanceof HandoffError || e instanceof InputSnapshotError ? e.message : "고정 파일 누락/안전 경계 오류"}`]; }
}
