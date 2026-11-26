import { createHash } from "node:crypto";
import { getList, getString, parseFrontmatter } from "../core/frontmatter.ts";
import { isWorkerTier, type WorkerTier } from "../core/worker-tiers.ts";

export const TEAM_ROLES = ["lead", "maker", "reviewer", "coordinator"] as const;
export type TeamRole = typeof TEAM_ROLES[number];
export const TEAM_AGENTS_DIR = ".pace/team/agents";
export const XHIGH_AGENTS_DIR = ".pace/team/agents-xhigh";
export const LEGACY_TEAM_DIR = ".pace/team";
export function teamSourcePath(name: string, legacy = false): string {
  return `${legacy ? LEGACY_TEAM_DIR : TEAM_AGENTS_DIR}/${name}.md`;
}
export function xhighTeamSourcePath(name: string): string {
  return `${XHIGH_AGENTS_DIR}/${name}.md`;
}
export interface TeamMember {
  name: string; role: TeamRole; stage: string[]; tier: WorkerTier; resources: string[]; tools: string[];
  body: string; source: string; hash: string;
}
export const normalizeLines = (text: string): string => text.replace(/\r\n/g, "\n");
export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
export function validTeamName(name: string): boolean {
  return name.length <= 64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name);
}
export function isTeamRole(role: string): role is TeamRole { return TEAM_ROLES.some((value) => value === role); }
const KEYS = ["name", "role", "stage", "tier", "resources", "tools"];
const HEADINGS = ["정체성", "맡는 일", "하지 않는 일", "실행 전 대조", "인계·결정 요청·완료 보고", "도구 안내"];
export const EXECUTION_CHECK_RULE = "위임을 받으면 실행 전에 지시가 근거(사용자 원문·확인된 해석 또는 계약)와 같은 범위인지 대조한다. 범위가 달라졌거나 근거가 불명확하면 실행을 보류하고 결정 요청 형식(결정 주체·근거·선택지)으로 올린다. 미확인 해석을 승인된 것으로 바꾸지 않는다.";
function missingExecutionRule(): Error {
  return new Error(`실행 전 대조 계약 v1 문단이 필요하다. 기존 맞춤 내용은 보존하고 docs/TEAM.md에 따라 다음 문단을 일반 본문으로 추가하세요: ${EXECUTION_CHECK_RULE}`);
}
function hasExecutionRule(text: string): boolean {
  const prose: string[] = []; let inParagraph = false; let fence: { char: string; length: number } | undefined;
  for (const line of text.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      const chars = marker[1]!;
      if (!fence) fence = { char: chars[0]!, length: chars.length };
      else if (chars[0] === fence.char && chars.length >= fence.length && !marker[2]!.trim()) fence = undefined;
      prose.push(""); inParagraph = false; continue;
    }
    if (!fence) {
      if (!line.trim()) { prose.push(""); inParagraph = false; continue; }
      // 문단 시작의 들여쓰기는 Markdown 코드다. 일반 문단의 이어지는 줄은 허용한다.
      if (!inParagraph && /^(?: {4}|\t)/.test(line)) { prose.push(""); continue; }
      prose.push(line); inParagraph = true;
    }
  }
  const paragraphs = prose.join("\n").split(/\n\s*\n/).map((paragraph) => paragraph.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (let start = 0; start < paragraphs.length; start++) {
    let candidate = "";
    for (let end = start; end < paragraphs.length; end++) {
      candidate += (candidate ? " " : "") + paragraphs[end]!;
      const normalized = candidate.replaceAll("캡틴 원문", "사용자 원문");
      if (normalized === EXECUTION_CHECK_RULE) return true;
      if (normalized.length >= EXECUTION_CHECK_RULE.length) break;
    }
  }
  return false;
}
function validateListItem(rawItem: string): void {
  const value = rawItem.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    // 공용 YAML-lite가 지원하는 문자열 인용만 허용한다. escape 확장은 하지 않는다.
    if (value.startsWith('"')) {
      if (!/^"(?:[^"\\]|\\["\\])*"$/.test(value)) throw new Error("목록 문자열 인용 오류");
    } else if (!/^'(?:[^']|'')*'$/.test(value)) throw new Error("목록 문자열 인용 오류");
  } else if (!value || /[[\]{}"']|:\s/.test(value) || /^(?:true|false|yes|no|on|off|null|~|[-+]?\d+(?:\.\d+)?)$/i.test(value)) {
    throw new Error("목록에는 문자열만 쓸 수 있다. 숫자·불리언 모양은 인용하세요");
  }
}
function rawSection(body: string, heading: string): string {
  const lines = body.split("\n"), at = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (at < 0) return "";
  const end = lines.findIndex((line, index) => index > at && /^##\s/.test(line));
  return lines.slice(at + 1, end < 0 ? undefined : end).join("\n");
}
export function section(body: string, heading: string): string { return rawSection(body, heading).trim(); }
export function parseTeamSource(input: string, expectedName: string, source = teamSourcePath(expectedName)): TeamMember {
  if (!validTeamName(expectedName)) throw new Error("팀 이름은 64자 이하 소문자 kebab 이름이어야 한다(예약명 제외)");
  const text = normalizeLines(input);
  if (!text.isWellFormed() || Buffer.byteLength(text) > 65536 || /[\x00-\x08\x0b-\x1f\x7f]/.test(text)) throw new Error("팀 원본 크기·Unicode 또는 제어문자 오류");
  const header = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!header) throw new Error("팀 frontmatter가 필요하다");
  const seen = new Set<string>(); let activeList = false;
  for (const raw of header[1]!.split("\n")) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const pair = /^([a-z]+):\s*(.*)$/.exec(raw);
    if (pair) {
      const key = pair[1]!, value = pair[2]!;
      if (!KEYS.includes(key) || seen.has(key)) throw new Error("알 수 없거나 중복된 팀 필드");
      seen.add(key); activeList = ["stage", "resources", "tools"].includes(key) && value === "";
      // YAML-lite는 따옴표 안 쉼표를 나누므로, 모호한 배열 표현을 허용하지 않는다.
      if (value.startsWith("[") && (!value.endsWith("]") || /["']/.test(value))) throw new Error("인라인 목록은 따옴표 없는 문자열 목록을 쓰거나 줄 목록을 쓰세요");
      if (["stage", "resources", "tools"].includes(key) && value.startsWith("[") && value !== "[]") value.slice(1, -1).split(",").forEach(validateListItem);
    } else if (activeList && /^\s*-\s+\S/.test(raw)) validateListItem(raw.replace(/^\s*-\s+/, ""));
    else throw new Error("팀 frontmatter 줄 형식 오류");
  }
  if (KEYS.some((key) => !seen.has(key))) throw new Error("팀 필수 필드 누락");
  const parsed = parseFrontmatter(text);
  const name = getString(parsed.data, "name"), role = getString(parsed.data, "role"), tier = getString(parsed.data, "tier");
  if (name !== expectedName || !isTeamRole(role) || !isWorkerTier(tier)) throw new Error("팀 이름·역할·등급 오류");
  if ((tier === "xhigh") !== (source === xhighTeamSourcePath(name))) throw new Error("xhigh 등급과 별도 팀 원본 경로가 일치해야 한다");
  for (const key of ["stage", "resources", "tools"]) {
    const value = parsed.data[key];
    if (!Array.isArray(value) || value.some((item) => !item.trim() || item !== item.trim() || item.length > 256 || /[\x00-\x1f\x7f]/.test(item)) || new Set(value).size !== value.length) throw new Error(`팀 ${key}는 중복 없는 문자열 배열이어야 한다`);
  }
  for (const heading of HEADINGS) {
    if (parsed.body.split("\n").filter((line) => line.trim() === `## ${heading}`).length !== 1 || !section(parsed.body, heading).replace(/<!--[\s\S]*?-->/g, "").trim()) {
      if (heading === "실행 전 대조") throw missingExecutionRule();
      throw new Error(`팀 본문 절 필요: ${heading}`);
    }
  }
  if (!hasExecutionRule(rawSection(parsed.body, "실행 전 대조"))) throw missingExecutionRule();
  return { name, role, tier, stage: getList(parsed.data, "stage"), resources: getList(parsed.data, "resources"), tools: getList(parsed.data, "tools"), body: parsed.body, source, hash: sha256(text) };
}
export function teamDescription(member: TeamMember): string {
  const paragraph = section(member.body, "맡는 일").split(/\n\s*\n/)[0]!.split("\n").map((line) => line.trim()).join(" ");
  return Array.from(`${member.role} · ${member.stage.join(", ") || "단계 미지정"} · ${paragraph}`).slice(0, 500).join("");
}
