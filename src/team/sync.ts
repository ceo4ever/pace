import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { writeFileAtomic } from "../core/fsutil.ts";
import { resolveTeamSettings, validateTeamSettings, type TeamExecutionSettings } from "../core/worker-tiers.ts";
import { normalizeLines, sha256, teamDescription, type TeamMember } from "./model.ts";
import { loadTeam, readTeamFile, safeTeamPath, teamFiles } from "./store.ts";

export type TeamHost = "claude" | "codex";
export interface TeamDifference { path: string; kind: "missing" | "source" | "settings" | "content" | "orphan" }
const MARKER = "# pace-team-generated: ";
const sourceLine = "# pace-team-source-sha256: ";
const mappingLine = "# pace-team-mapping: ";
const mappingHashLine = "# pace-team-mapping-sha256: ";
const encoded = (settings: TeamExecutionSettings) => JSON.stringify({ model: settings.model, effort: settings.effort });
function instructions(member: TeamMember): string {
  const { name, role, stage, tier, resources, tools } = member;
  return `생성물 — 원본 ${member.source}\n역할 메타: ${JSON.stringify({ name, role, stage, tier, resources, tools })}\n도구 안내는 권한 제한이 아니다. 부모 도구를 상속하며 실행 측 권한 설정을 따른다.\n\n${member.body}`;
}
export function renderTeamMember(member: TeamMember, host: TeamHost, settings: TeamExecutionSettings): string {
  validateTeamSettings(settings);
  const mapping = encoded(settings);
  const comments = [MARKER + member.source, sourceLine + member.hash, mappingLine + mapping, mappingHashLine + sha256(mapping)];
  const quote = JSON.stringify;
  if (host === "claude") return ["---", ...comments, `name: ${quote(member.name)}`, `description: ${quote(teamDescription(member))}`, `model: ${quote(settings.model)}`, `effort: ${quote(settings.effort)}`, "---", instructions(member)].join("\n") + "\n";
  return [...comments, `name = ${quote(member.name)}`, `description = ${quote(teamDescription(member))}`, `model = ${quote(settings.model)}`, `model_reasoning_effort = ${quote(settings.effort)}`, `developer_instructions = ${quote(instructions(member))}`, ""].join("\n");
}
function metadata(text: string): { source: string; hash?: string; settings?: TeamExecutionSettings } | null {
  const lines = normalizeLines(text).split("\n");
  const offset = lines[0] === "---" ? 1 : 0;
  const first = lines[offset];
  if (!first?.startsWith(MARKER)) return null;
  const result: { source: string; hash?: string; settings?: TeamExecutionSettings } = { source: first.slice(MARKER.length) };
  if (lines[offset + 1]?.startsWith(sourceLine)) result.hash = lines[offset + 1]!.slice(sourceLine.length);
  try {
    if (!lines[offset + 2]?.startsWith(mappingLine) || !lines[offset + 3]?.startsWith(mappingHashLine)) return result;
    const settings: unknown = JSON.parse(lines[offset + 2]!.slice(mappingLine.length));
    validateTeamSettings(settings);
    if (sha256(encoded(settings)) === lines[offset + 3]!.slice(mappingHashLine.length)) result.settings = settings;
  } catch { /* 표지가 손상되면 내용 차이로 판정한다. */ }
  return result;
}
export function syncTeam(root: string, options: { check?: boolean; env?: NodeJS.ProcessEnv } = {}): { members: number; differences: TeamDifference[] } {
  const members = loadTeam(root), differences: TeamDifference[] = [];
  const expected = new Map<string, { text: string; source: string }>();
  for (const member of members) for (const host of ["claude", "codex"] as const) {
    const path = `.${host}/agents/${member.name}.${host === "claude" ? "md" : "toml"}`;
    const settings = resolveTeamSettings(host, member.tier, options.env);
    const text = renderTeamMember(member, host, settings);
    if (Buffer.byteLength(text) > 65536) throw new Error(`생성물 크기 초과: ${path}`);
    const current = readTeamFile(root, path);
    expected.set(path, { text, source: member.source });
    if (current === null) { differences.push({ path, kind: "missing" }); continue; }
    const meta = metadata(current);
    if (!meta || meta.source !== member.source) throw new Error(`사용자 소유 출력과 충돌한다: ${path}`);
    if (meta.hash !== member.hash) differences.push({ path, kind: "source" });
    if (meta.settings && encoded(meta.settings) !== encoded(settings)) differences.push({ path, kind: "settings" });
    // 이전 매핑으로 비교하여 설정 차이가 손수정을 가리지 않게 한다.
    if (!meta.settings || normalizeLines(current) !== renderTeamMember(member, host, meta.settings)) differences.push({ path, kind: "content" });
  }
  for (const host of ["claude", "codex"] as const) {
    const dir = `.${host}/agents`, extension = host === "claude" ? ".md" : ".toml";
    for (const file of teamFiles(root, dir, extension)) {
      const path = `${dir}/${file}`;
      if (expected.has(path)) continue;
      const text = readTeamFile(root, path);
      if (text !== null && metadata(text)) differences.push({ path, kind: "orphan" });
    }
  }
  if (!options.check && differences.some((item) => item.kind === "orphan")) throw new Error("원본 없는 관리 생성물이 있다 — 자동 삭제하지 않는다. sync --check로 확인하세요");
  if (!options.check) for (const [rel, entry] of expected) {
    const path = safeTeamPath(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    safeTeamPath(root, rel);
    const existing = readTeamFile(root, rel);
    if (existing !== null && metadata(existing)?.source !== entry.source) throw new Error(`사용자 소유 출력과 충돌한다: ${rel}`);
    if (existing !== entry.text) writeFileAtomic(join(root, ...rel.split("/")), entry.text);
  }
  return { members: members.length, differences };
}
