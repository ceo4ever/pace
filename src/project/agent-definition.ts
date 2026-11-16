import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { getString, parseFrontmatter } from "../core/frontmatter.ts";
import { hasSecret } from "./secrets.ts";
import { loadProfile, resolveProfileName } from "../profile/profile.ts";

export type AgentKind = "absent" | "legacy" | "v2" | "invalid";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** T01 계약의 AGENT 정의 전체 길이 상한(UTF-16 코드 단위). */
export const AGENT_BUDGET = 1500;

/** 선택된 프로필이 없을 때만 중립적인 역할 이름을 쓴다. */
export function workspaceAgentDisplayName(home: string): string {
  const name = resolveProfileName(home);
  if (name === null) return "Agent";
  const displayName = loadProfile(home, name).displayName.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim();
  return displayName || "Agent";
}

export function renderWorkspaceAgent(template: string, workspaceId: string, displayName: string): string {
  const safeName = displayName.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim() || "Agent";
  return template.replace("{{workspaceId}}", workspaceId).replace("{{displayName}}", () => safeName);
}
/** 형식 분류만을 위한 방어적 읽기 한도이며 호스트 전달 예산이 아니다. */
const KIND_READ_LIMIT = 64 * 1024;

/** 미지원·손상된 표지는 기존 v1로 자동 해석하거나 덮어쓰지 않는다. */
export function agentKind(root: string): AgentKind {
  const metadataDir = ".pace", versionKey = "pace_agent_version";
  const path = join(root, metadataDir, "AGENT.md");
  try {
    const parent = lstatSync(join(root, metadataDir));
    if (!parent.isDirectory() || parent.isSymbolicLink()) return "invalid";
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return "invalid";
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let text: string;
    try {
      const opened = fstatSync(fd);
      if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > KIND_READ_LIMIT) return "invalid";
      const buffer = Buffer.alloc(KIND_READ_LIMIT + 1);
      let used = 0, count: number;
      while (used < buffer.length && (count = readSync(fd, buffer, used, buffer.length - used, null)) > 0) used += count;
      if (used > KIND_READ_LIMIT) return "invalid";
      text = buffer.subarray(0, used).toString("utf8");
    } finally { closeSync(fd); }
    const parsed = parseFrontmatter(text);
    const versions = text.match(new RegExp(`^[ \\t]*${versionKey}[ \\t]*:`, "gm")) ?? [];
    if (versions.length === 0) return /^[ \t]*pace_agent_version[ \t]*:/m.test(text) ? "invalid" : "legacy";
    if (versions.length !== 1 || getString(parsed.data, versionKey) !== "2") return "invalid";
    try {
      validateAgentDefinition(text, Number.MAX_SAFE_INTEGER);
      return "v2";
    } catch {
      return "invalid";
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
    return "invalid";
  }
}

/** 길이 상한은 호출자가 전달한다. 상한 자체는 호스트 계약에서 정한다. */
export function validateAgentDefinition(text: string, maxChars: number): { workspaceId: string } {
  const versionKey = "pace_agent_version";
  if (hasSecret(text)) throw new Error("AGENT 정의에 비밀로 보이는 값이 있다");
  if (!Number.isSafeInteger(maxChars) || maxChars <= 0) throw new Error("AGENT 정의 길이 상한이 올바르지 않다");
  if (text.length > maxChars) throw new Error(`AGENT 정의 길이 상한 초과: ${text.length}자 / ${maxChars}자 (초과 ${text.length - maxChars}자)`);
  if (text.startsWith("\uFEFF")) throw new Error("AGENT 정의 앞의 UTF-8 BOM을 제거하세요");
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!header) throw new Error("AGENT frontmatter가 필요하다");
  const lines = header[1] ?? "";
  const count = (key: string) => (lines.match(new RegExp(`^${key}\\s*:`, "gm")) ?? []).length;
  const parsed = parseFrontmatter(text);
  const workspaceId = getString(parsed.data, "workspace_id");
  if (count(versionKey) !== 1 || getString(parsed.data, versionKey) !== "2" || count("workspace_id") !== 1 || !ID.test(workspaceId)) {
    throw new Error("AGENT 버전 또는 등록부 ID가 올바르지 않다");
  }
  if (!/^#[ \t]+[^ \t\r\n][^\r\n]*$/m.test(parsed.body) || !["Mission|임무", "Boundaries|경계", "Knowledge|지식"].every((heading) => new RegExp(`^## (?:${heading})[ \t]*\\r?\\n(?:[ \t]*\\r?\\n)*(?!#)[^\\r\\n]*\\S`, "im").test(parsed.body))) {
    throw new Error("AGENT 역할·임무·경계·지식 절이 필요하다");
  }
  return { workspaceId };
}
