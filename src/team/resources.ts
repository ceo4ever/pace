import { spawnSync } from "node:child_process";
import { sha256, validTeamName } from "./model.ts";
import { readTeamFile } from "./store.ts";
import { hasSecret } from "../project/secrets.ts";

export interface Resource {
  name: string;
  capacity: 1;
  scope: "repo" | "machine";
  description: string;
  probe?: string[];
}
export type ResourceUse = "free" | "busy" | "unknown";
export function safeResourceText(value: unknown, max = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.isWellFormed() && !/[\p{Cc}\p{Cf}]/u.test(value) && !hasSecret(value);
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function parseResources(text: string): Resource[] {
  if (Buffer.byteLength(text) > 65536 || !text.isWellFormed() || hasSecret(text)) throw new Error("자원 목록 안전 검사 실패");
  const blocks = [...text.replace(/\r\n/g, "\n").matchAll(/^```json\s*\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new Error("resources.md에는 단일 JSON fence가 필요하다");
  let data: unknown;
  try { data = JSON.parse(blocks[0]![1]!); } catch { throw new Error("자원 목록 JSON 오류"); }
  if (!object(data) || Object.keys(data).sort().join(",") !== "resources,version" || data.version !== 1 || !Array.isArray(data.resources) || data.resources.length > 128) throw new Error("자원 목록 version/resources 오류");
  const names = new Set<string>();
  return data.resources.map((row: unknown) => {
    if (!object(row) || Object.keys(row).some((key) => !["name", "capacity", "scope", "description", "probe"].includes(key)) ||
        typeof row.name !== "string" || !validTeamName(row.name) || names.has(row.name) || row.capacity !== 1 ||
        (row.scope !== "repo" && row.scope !== "machine") || !safeResourceText(row.description)) throw new Error("자원 이름/동시1/범위/설명 오류");
    if (row.probe !== undefined && (!Array.isArray(row.probe) || row.probe.length < 1 || row.probe.length > 32 || row.probe.some((arg) => !safeResourceText(arg, 2048)))) throw new Error("자원 확인기 argv 오류");
    names.add(row.name);
    return { name: row.name, capacity: 1, scope: row.scope, description: row.description, ...(row.probe === undefined ? {} : { probe: [...row.probe] as string[] }) };
  });
}
export function loadResources(root: string): Resource[] {
  const text = readTeamFile(root, ".pace/team/resources.md");
  return text === null ? [] : parseResources(text);
}
export function loadResource(root: string, name: string): Resource {
  if (!validTeamName(name)) throw new Error("자원 이름 오류");
  const resource = loadResources(root).find((item) => item.name === name);
  if (!resource) throw new Error("자원 목록에 등록되지 않은 이름");
  return resource;
}
export function resourceHash(resource: Resource): string {
  return sha256(JSON.stringify({ name: resource.name, capacity: 1, scope: resource.scope, probe: resource.probe ?? null }));
}
/** 선언된 확인기는 신뢰한 저장소 코드다. 실행 출력/예외 원문을 기록하지 않는다. */
export function probeResource(resource: Resource, cwd: string): ResourceUse {
  if (!resource.probe) return "unknown";
  try {
    const [command, ...args] = resource.probe;
    const result = spawnSync(command!, args, { cwd, encoding: "utf8", timeout: 5000, maxBuffer: 65536, windowsHide: true, shell: false });
    return result.error || result.signal ? "unknown" : result.status === 0 ? "free" : result.status === 1 ? "busy" : "unknown";
  } catch { return "unknown"; }
}
