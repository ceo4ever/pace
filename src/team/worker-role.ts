import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { parseTeamSource, type TeamMember } from "./model.ts";
import { readTeamFile } from "./store.ts";
import { resolveTeamSettings } from "../core/worker-tiers.ts";
import { resolveWorkerSettings } from "../core/worker-settings.ts";
import { safeRoleName, safeRoleSetting, validStartRole, type StartRoleRecord } from "../project/role-record.ts";
export interface WorkerRole {
  member: TeamMember;
  source: StartRoleRecord["source"];
  settings: { model: string; effort?: string };
}
/** Definitions are strict. PROJECT discovery preserves legacy reads until a role is selected. */
function refText(root: string, ref: string, path: string, strict = true): string | null {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"]) delete env[key];
  const run = (args: string[], maxBuffer = 65537) => {
    const r = spawnSync("git", ["--literal-pathspecs", "-c", "core.fsmonitor=false", "-C", root, ...args], { env, timeout: 5000, maxBuffer });
    if (r.status !== 0 || r.error) throw new Error(`역할 원본 ref를 읽을 수 없다: ${path}`);
    return r.stdout;
  };
  const entry = run(["ls-tree", "-z", ref, "--", path]).toString("utf8");
  const match = /^(100644|100755|120000) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\x00]+)\x00$/.exec(entry);
  if (!match || match[3] !== path) {
    if (!strict) return null;
    throw new Error(`역할 ref 원본은 일반 파일이어야 한다: ${path}`);
  }
  if (strict && match[1] === "120000") throw new Error(`역할 ref 원본은 일반 파일이어야 한다: ${path}`);
  const size = Number(run(["cat-file", "-s", match[2]!], 128).toString("utf8").trim());
  if (!Number.isSafeInteger(size) || size < 0 || (strict && size > 65536)) throw new Error(`역할 ref 파일 크기 초과: ${path}`);
  const bytes = run(["cat-file", "blob", match[2]!], strict ? 65537 : Math.max(65537, size + 1));
  const text = bytes.toString("utf8");
  if (strict && !Buffer.from(text).equals(bytes)) throw new Error(`역할 ref UTF-8 오류: ${path}`);
  return text;
}
function projectRole(project: string): string | undefined {
  const text = project.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const at = text.search(/\n## /), head = at < 0 ? text : text.slice(0, at);
  const rows = [...head.matchAll(/^- 작업자 역할:[ \t]*(.*)$/gm)];
  const values = rows.map((row) => row[1]?.trim().replace(/^`([^`]+)`$/, "$1")).filter((value) => value && !["없음", "-", "—"].includes(value));
  if (!values.length) return undefined;
  if (rows.length > 1) throw new Error("PROJECT.md 작업자 역할이 중복됐다");
  return values[0];
}
export function resolveWorkerRole(root: string, projectPath: string, options: { role?: string; ref?: string; projectRef?: string; agent?: string | (() => string); model?: string; effort?: string; env?: NodeJS.ProcessEnv }): WorkerRole | undefined {
  const read = (path: string) => options.ref ? refText(root, options.ref, path) : readTeamFile(root, path);
  if (isAbsolute(projectPath) || projectPath.includes("\\") || projectPath.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("역할 선택 PROJECT 상대 경로 오류");
  let name = options.role;
  if (name === undefined) {
    let project: string | null;
    if (options.projectRef) project = refText(root, options.projectRef, projectPath, false);
    else {
      try { project = readFileSync(join(root, projectPath), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    }
    name = project === null ? undefined : projectRole(project);
    if (name !== undefined) {
      const checked = options.projectRef ? refText(root, options.projectRef, projectPath) : readTeamFile(root, projectPath);
      if (checked === null || projectRole(checked) !== name) throw new Error("PROJECT 역할 선택이 검증 중 달라졌다");
    }
  }
  if (name === undefined) return undefined;
  if (!safeRoleName(name)) throw new Error("작업자 역할은 비밀 후보 없는 유효한 팀 구성원 이름이어야 한다");
  const agent = typeof options.agent === "function" ? options.agent() : options.agent;
  if (agent !== "claude" && agent !== "codex") throw new Error("팀 역할은 --agent claude|codex에서 지원한다");
  const path = `.pace/team/${name}.md`;
  let text: string | null;
  try { text = read(path); } catch (error) {
    if (options.ref) throw new Error(`사용할 수 있는 팀 역할이 없다: ${name} (ref 원본 누락·종류·크기·UTF-8 확인)`, { cause: error });
    throw error;
  }
  if (text === null) throw new Error(`팀 역할이 없다: ${name}`);
  const member = parseTeamSource(text, name), tier = resolveTeamSettings(agent, member.tier, options.env);
  const resolved = resolveWorkerSettings(agent, options.model ?? tier.model, options.effort ?? tier.effort, options.env);
  if (!safeRoleSetting(resolved.model) || (resolved.effort !== undefined && !safeRoleSetting(resolved.effort))) throw new Error("역할 model·effort는 비밀·선행 대시·제어문자 없는 1024자 이하 문자열이어야 한다");
  return { member, source: options.role === undefined ? "project" : "option", settings: { model: resolved.model, ...(resolved.effort !== undefined ? { effort: resolved.effort } : {}) } };
}
export function roleInstruction(role: WorkerRole): string {
  return `먼저 ${role.member.source}를 읽고 팀 구성원 ${role.member.name}의 정의대로 일한다(시작 검증은 CRLF를 LF로 정규화한 UTF-8 텍스트의 SHA256 ${role.member.hash}). 원본을 읽을 수 없거나 이 정규화 지문이 다르거나 역할을 적재하지 못하면 일반 역할로 대신 수행하지 말고 보류하여 코디네이터에게 올린다. model/effort는 실행 인자로 별도 전달한 요청값이며 tools는 안내이고 권한 제한이 적용된 것은 아니다.`;
}
export function startRoleRecord(role: WorkerRole, status: StartRoleRecord["settingsStatus"]): StartRoleRecord {
  const record: StartRoleRecord = { name: role.member.name, source: role.source, definition: role.member.source, hash: role.member.hash, method: "prompt", ...role.settings, settingsStatus: status, toolsPermissionApplied: false, runtimeObserved: false };
  if (!validStartRole(record)) throw new Error("시작 역할 기록이 올바르지 않다");
  return record;
}
