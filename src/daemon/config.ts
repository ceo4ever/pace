import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { writeFileAtomic } from "../core/fsutil.ts";
import { join } from "node:path";
import { isAbsolute } from "node:path";
import { hasTokenShape } from "./secrets.ts";
import { isWorkspaceId } from "../project/workspace-registry.ts";

// 기기 설정 — PACE_HOME/daemon/config.json. 알 수 없는 키·범위 밖 값은 기동을 거부한다(조용히 무시하지 않음).

export class DaemonConfigError extends Error {}

export interface WorkspaceEntry {
  name: string;
  path: string;
  registryId?: string;
  registryIdentity?: { dev: string; ino: string };
  /** 이름 → 워크트리 경로. "main"은 항상 workspace path */
  worktrees: Record<string, string>;
}

export const WORKSPACE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;

export interface DaemonConfig {
  device: string;
  maxConcurrent: number;
  approvalTtlSeconds: number;
  drainTimeoutMs: number;
  workspaces: WorkspaceEntry[];
  allowedUsers: Record<string, string[]>;
  defaultChain: string;
  rerunInterruptedReadOnly: false;
  gateway: { port: number };
  defaultAccess: "read-only";
}

const KEYS = new Set(["device", "maxConcurrent", "approvalTtlSeconds", "drainTimeoutMs", "workspaces", "allowedUsers", "defaultChain", "rerunInterruptedReadOnly", "gateway", "defaultAccess"]);

/** 컴퓨터 이름을 device 형식(영문·숫자·_.- 40자, 영숫자로 시작)에 맞게 바꾼다. 쓸 수 없으면 "device" */
export function normalizeDeviceName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 40).replace(/[-_.]+$/, "");
  return cleaned === "" ? "device" : cleaned;
}

export function defaultDeviceName(): string {
  try { return normalizeDeviceName(hostname()); } catch { return "device"; }
}

export function defaultConfig(): DaemonConfig {
  return { device: defaultDeviceName(), maxConcurrent: 2, approvalTtlSeconds: 600, drainTimeoutMs: 300_000, workspaces: [], allowedUsers: {}, defaultChain: "default", rerunInterruptedReadOnly: false, gateway: { port: 0 }, defaultAccess: "read-only" };
}

export function parseConfig(input: unknown): DaemonConfig {
  const bad = (m: string): never => { throw new DaemonConfigError(m); };
  if (typeof input !== "object" || input === null || Array.isArray(input)) bad("설정은 JSON 객체여야 한다");
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) if (!KEYS.has(key)) bad(`알 수 없는 설정 키: ${key}`);
  const cfg = defaultConfig();
  const int = (name: string, v: unknown, min: number, max: number): number => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(`${name}은 ${min}~${max} 정수`);
    return v as number;
  };
  if (raw.device !== undefined) {
    if (typeof raw.device !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(raw.device)) bad("device는 영문·숫자·_.- 40자 이내");
    cfg.device = raw.device as string;
  }
  if (raw.maxConcurrent !== undefined) cfg.maxConcurrent = int("maxConcurrent", raw.maxConcurrent, 1, 16);
  if (raw.approvalTtlSeconds !== undefined) cfg.approvalTtlSeconds = int("approvalTtlSeconds", raw.approvalTtlSeconds, 1, 86_400);
  if (raw.drainTimeoutMs !== undefined) cfg.drainTimeoutMs = int("drainTimeoutMs", raw.drainTimeoutMs, 0, 3_600_000);
  if (raw.defaultChain !== undefined) {
    if (typeof raw.defaultChain !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(raw.defaultChain)) bad("defaultChain 이름이 올바르지 않다");
    cfg.defaultChain = raw.defaultChain as string;
  }
  if (raw.defaultAccess !== undefined && raw.defaultAccess !== "read-only") bad("defaultAccess는 read-only만 허용한다(쓰기 기본값 불가 — 쓰기는 작업마다 승인)");
  if (raw.rerunInterruptedReadOnly !== undefined && raw.rerunInterruptedReadOnly !== false) bad("rerunInterruptedReadOnly=true는 이 버전에서 지원하지 않는다");
  if (raw.gateway !== undefined) {
    const g = raw.gateway as Record<string, unknown>;
    if (typeof g !== "object" || g === null || Object.keys(g).some((k) => k !== "port")) bad("gateway는 { port }만 가질 수 있다");
    if (g.port !== undefined) cfg.gateway.port = int("gateway.port", g.port, 0, 65535);
  }
  if (raw.allowedUsers !== undefined) {
    const a = raw.allowedUsers as Record<string, unknown>;
    if (typeof a !== "object" || a === null || Array.isArray(a)) bad("allowedUsers는 { 채널: [사용자 ID] }");
    for (const [channel, users] of Object.entries(a)) {
      if (!Array.isArray(users) || users.some((u) => typeof u !== "string" || u === "")) bad(`allowedUsers.${channel}는 문자열 배열`);
      cfg.allowedUsers[channel] = users as string[];
    }
  }
  if (raw.workspaces !== undefined) {
    if (!Array.isArray(raw.workspaces)) bad("workspaces는 배열");
    const names = new Set<string>();
    const registryIds = new Set<string>();
    cfg.workspaces = (raw.workspaces as unknown[]).map((w, i) => {
      const e = w as Record<string, unknown>;
      if (typeof e !== "object" || e === null) return bad(`workspaces[${i}]가 객체가 아니다`);
      if (typeof e.name !== "string" || !WORKSPACE_NAME.test(e.name)) bad(`workspaces[${i}].name이 올바르지 않다`);
      if (names.has(e.name as string)) bad(`workspaces 이름 중복: ${e.name}`);
      names.add(e.name as string);
      if (typeof e.path !== "string" || !isAbsolute(e.path)) bad(`workspaces[${i}].path는 절대 경로`);
      if (hasTokenShape(e.path as string)) bad(`workspaces[${i}].path에 비밀 형태 문자열이 있다(저장 시 제거되면 격리 키가 어긋난다)`);
      const registryId = e.registryId;
      if (registryId !== undefined) {
        if (!isWorkspaceId(registryId)) return bad(`workspaces[${i}].registryId가 올바르지 않다`);
        if (registryIds.has(registryId)) bad("workspaces 등록 ID 중복");
        registryIds.add(registryId);
      }
      const identity = e.registryIdentity as WorkspaceEntry["registryIdentity"];
      if (identity !== undefined && (
        !registryId || !identity || typeof identity.dev !== "string" || !/^\d+$/.test(identity.dev) ||
        typeof identity.ino !== "string" || !/^\d+$/.test(identity.ino)
      )) bad(`workspaces[${i}].registryIdentity가 올바르지 않다`);
      const worktrees: Record<string, string> = { main: e.path as string };
      if (e.worktrees !== undefined) {
        const wt = e.worktrees as Record<string, unknown>;
        if (typeof wt !== "object" || wt === null || Array.isArray(wt)) bad(`workspaces[${i}].worktrees는 { 이름: 경로 }`);
        for (const [n, p] of Object.entries(wt)) {
          if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/.test(n) || n === "main") bad(`워크트리 이름이 올바르지 않다: ${n}`);
          if (typeof p !== "string" || !isAbsolute(p)) bad(`워크트리 ${n}의 경로는 절대 경로`);
          if (hasTokenShape(p as string)) bad(`워크트리 ${n}의 경로에 비밀 형태 문자열이 있다`);
          worktrees[n] = p as string;
        }
      }
      return { name: e.name as string, path: e.path as string, worktrees, ...(registryId !== undefined ? { registryId } : {}), ...(identity !== undefined ? { registryIdentity: identity } : {}) };
    });
  }
  return cfg;
}

export function configFile(home: string): string {
  return join(home, "daemon", "config.json");
}

export function loadConfig(home: string): DaemonConfig {
  const file = configFile(home);
  if (!existsSync(file)) return defaultConfig();
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch (error) { throw new DaemonConfigError(`설정 JSON을 읽을 수 없다: ${(error as Error).message}`); }
  return parseConfig(parsed);
}

export function secretsDir(home: string): string {
  return join(home, "secrets");
}

/** config.json 원본 객체(없으면 {}). 읽을 수 없으면 던진다 — 덮어써서 사용자 설정을 잃지 않는다 */
export function readRawConfigFile(home: string): Record<string, unknown> {
  const file = configFile(home);
  if (!existsSync(file)) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch (error) { throw new DaemonConfigError(`설정 JSON을 읽을 수 없다: ${(error as Error).message}`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new DaemonConfigError("설정은 JSON 객체여야 한다");
  return parsed as Record<string, unknown>;
}

/** config.json을 읽어 고친 뒤 검증하고 원자적으로 쓴다(검증에 실패하면 쓰지 않는다) */
export function updateConfigFile(home: string, mutate: (raw: Record<string, unknown>) => void): void {
  const raw = readRawConfigFile(home);
  mutate(raw);
  parseConfig(raw);
  writeFileAtomic(configFile(home), JSON.stringify(raw, null, 2));
}
