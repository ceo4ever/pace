import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./fsutil.ts";
import { paceHome } from "./paths.ts";

type Settings = Record<string, { model?: string; effort?: string }>;
const defaults: Settings = { codex: { model: "gpt-6.2-sol" }, claude: { model: "claude-opus-5-5" } };
const file = (env: NodeJS.ProcessEnv) => join(paceHome(env), "worker-settings.json");
export function validValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && !/[\x00-\x1f\x7f]/.test(value);
}
export function readWorkerSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  let raw: string;
  try {
    const path = file(env);
    if (!lstatSync(path).isFile()) throw new Error("작업자 설정은 일반 파일이어야 한다");
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!fstatSync(fd).isFile()) throw new Error("작업자 설정은 일반 파일이어야 한다");
      raw = readFileSync(fd, "utf8");
    } finally { closeSync(fd); }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    for (const [agent, entry] of Object.entries(data)) {
      if (!/^[a-z][a-z0-9-]*$/.test(agent) || !entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error();
      for (const [key, value] of Object.entries(entry)) if (!(["model", "effort"].includes(key)) || !validValue(value) || (key === "effort" && value === "default")) throw new Error();
    }
    return data as Settings;
  } catch { throw new Error(`손상된 작업자 설정: ${file(env)}`); }
}
export function resolveWorkerSettings(agent: string, model: string | undefined, effort: string | undefined, env: NodeJS.ProcessEnv = process.env): { model?: string; effort?: string } {
  if (model !== undefined && !validValue(model)) throw new Error("model은 빈 값이나 제어 문자를 받을 수 없다");
  if (effort !== undefined && !validValue(effort)) throw new Error("effort는 빈 값이나 제어 문자를 받을 수 없다");
  const settings = readWorkerSettings(env);
  const result = { model: model ?? settings[agent]?.model ?? defaults[agent]?.model, effort: effort === "default" ? undefined : effort ?? settings[agent]?.effort };
  if (result.effort && !result.model) throw new Error("effort에는 model이 필요하다");
  return result;
}
export function setWorkerSettings(agent: string, field: string, value: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (!/^[a-z][a-z0-9-]*$/.test(agent) || !["model", "effort"].includes(field)) throw new Error("작업자 이름 또는 설정 항목이 올바르지 않다");
  if (value !== undefined && (!validValue(value) || (field === "effort" && value === "default"))) throw new Error("설정값이 올바르지 않다 (초기화는 reset 사용)");
  const data = readWorkerSettings(env);
  const entry = Object.hasOwn(data, agent) ? data[agent]! : {};
  if (value === undefined) delete entry[field as "model" | "effort"]; else entry[field as "model" | "effort"] = value;
  if (Object.keys(entry).length) data[agent] = entry; else delete data[agent];
  try {
    if (!lstatSync(file(env)).isFile()) throw new Error("작업자 설정은 일반 파일이어야 한다");
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  writeFileAtomic(file(env), JSON.stringify(data, null, 2) + "\n");
}
