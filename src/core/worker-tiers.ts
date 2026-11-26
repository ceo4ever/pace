import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { paceHome } from "./paths.ts";
import { writeFileAtomic } from "./fsutil.ts";
import { resolveWorkerSettings, validValue } from "./worker-settings.ts";

export const WORKER_TIERS = ["high", "medium", "low", "xhigh"] as const;
export type WorkerTier = typeof WORKER_TIERS[number];
export interface TeamExecutionSettings { model: string; effort: string }
type Overrides = Record<string, Partial<Record<WorkerTier, Partial<TeamExecutionSettings>>>>;
export function isWorkerTier(value: string): value is WorkerTier { return WORKER_TIERS.some((tier) => tier === value); }
const pathFor = (env: NodeJS.ProcessEnv, xhigh: boolean) => join(paceHome(env), xhigh ? "worker-tiers-xhigh.json" : "worker-tiers.json");
const XHIGH_DEFAULTS = new Map<string, TeamExecutionSettings>([
  ["claude", { model: "claude-fable-5-2", effort: "high" }],
  ["codex", { model: "gpt-6.2-astra", effort: "medium" }],
]);
const agentValid = (agent: string) => /^[a-z][a-z0-9-]*$/.test(agent);
const valueValid = (value: unknown): value is string => validValue(value) && value.length <= 1024 && value.isWellFormed();
export function validateTeamSettings(value: unknown): asserts value is TeamExecutionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => key !== "model" && key !== "effort") ||
      !valueValid((value as TeamExecutionSettings).model) || !valueValid((value as TeamExecutionSettings).effort) ||
      (value as TeamExecutionSettings).effort === "default") throw new Error("팀 model·effort 값이 올바르지 않다");
}
function ordinaryFile(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) throw new Error("등급 설정은 64KiB 이하의 일반 단일 링크 파일이어야 한다");
}
export function readWorkerTiers(env: NodeJS.ProcessEnv = process.env): Overrides {
  return readTierOverrides(pathFor(env, false), false);
}
function readTierOverrides(path: string, xhigh: boolean): Overrides {
  let text: string;
  try {
    ordinaryFile(path);
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536) throw new Error("등급 설정 파일이 안전하지 않다");
      const buffer = Buffer.alloc(65537); let size = 0;
      while (size < buffer.length) { const count = readSync(fd, buffer, size, buffer.length - size, null); if (!count) break; size += count; }
      if (size > 65536) throw new Error("등급 설정 크기 초과");
      const bytes = buffer.subarray(0, size);
      text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("등급 설정 UTF-8 오류");
    } finally { closeSync(fd); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
  try {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    for (const [agent, tiers] of Object.entries(data)) {
      if (!agentValid(agent) || !tiers || typeof tiers !== "object" || Array.isArray(tiers)) throw new Error();
      for (const [tier, settings] of Object.entries(tiers)) {
        if (!isWorkerTier(tier) || (tier === "xhigh") !== xhigh || !settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error();
        for (const [key, value] of Object.entries(settings)) {
          if (!["model", "effort"].includes(key) || !valueValid(value) || (key === "effort" && value === "default")) throw new Error();
        }
      }
    }
    return data as Overrides;
  } catch { throw new Error("손상된 작업자 등급 설정"); }
}
export function resolveTeamSettings(agent: string, tier: WorkerTier, env: NodeJS.ProcessEnv = process.env): TeamExecutionSettings {
  if (!agentValid(agent) || !isWorkerTier(tier)) throw new Error("작업자 또는 등급이 올바르지 않다");
  const xhigh = tier === "xhigh";
  const data = readTierOverrides(pathFor(env, xhigh), xhigh);
  const override = Object.hasOwn(data, agent) ? data[agent]?.[tier] : undefined;
  const base = xhigh ? XHIGH_DEFAULTS.get(agent) : { model: resolveWorkerSettings(agent, undefined, undefined, env).model, effort: tier };
  const result = { model: override?.model ?? base?.model, effort: override?.effort ?? base?.effort };
  validateTeamSettings(result);
  return result;
}
export function setWorkerTier(agent: string, field: string, value: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  const match = /^tier\.([a-z]+)\.(model|effort)$/.exec(field);
  const tier = match?.[1];
  if (!agentValid(agent) || !match || tier === undefined || !isWorkerTier(tier)) throw new Error(`등급 설정 항목: tier.<${WORKER_TIERS.join("|")}>.<model|effort>`);
  const key = match[2] as keyof TeamExecutionSettings;
  if (value !== undefined && (!valueValid(value) || (key === "effort" && value === "default"))) throw new Error("등급 설정값이 올바르지 않다");
  const xhigh = tier === "xhigh", path = pathFor(env, xhigh);
  const data = readTierOverrides(path, xhigh);
  const tiers = Object.hasOwn(data, agent) ? data[agent]! : {};
  const entry = Object.hasOwn(tiers, tier) ? tiers[tier]! : {};
  if (value === undefined) delete entry[key]; else entry[key] = value;
  if (Object.keys(entry).length) tiers[tier] = entry; else delete tiers[tier];
  if (Object.keys(tiers).length) data[agent] = tiers; else delete data[agent];
  const text = JSON.stringify(data, null, 2) + "\n";
  if (Buffer.byteLength(text) > 65536) throw new Error("등급 설정 크기 초과");
  try { ordinaryFile(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  writeFileAtomic(path, text);
}
export function teamTierTable(env: NodeJS.ProcessEnv = process.env): Record<string, Record<WorkerTier, TeamExecutionSettings>> {
  return Object.fromEntries(["claude", "codex"].map((agent) => [agent, Object.fromEntries(WORKER_TIERS.map((tier) => [tier, resolveTeamSettings(agent, tier, env)]))])) as Record<string, Record<WorkerTier, TeamExecutionSettings>>;
}
