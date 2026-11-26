import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { inputHash, InputSnapshotError, type InputTrace } from "../core/input-snapshot.ts";
import { validTeamName } from "../team/model.ts";
import { safeTeamPath } from "../team/store.ts";
import { agentNames, errorCodes, type AgentName } from "../agent/contract.ts";
import { regularBytes, strictJson, utf8 } from "./handoff-files.ts";
import { permissionPath } from "./review-permission.ts";
import { hasSecret } from "./secrets.ts";

const callFile = "calls/log.jsonl";
const callLimit = 32 * 1024 * 1024;
const sources = ["unknown", "pm", "requested", "tool", "host"] as const;
type Source = typeof sources[number];
export type CallValue<T> = { value: T | null; source: Source };
export const unknownCallValue: CallValue<never> = Object.freeze({ value: null, source: "unknown" });

const routes = ["p", "acp", "chain", "verify", "native", "manual"] as const;
const statuses = ["unknown", "completed", "failed", "interrupted"] as const;
const reasons = [...Object.keys(errorCodes), "provider_unconfirmed", "provider_mismatch", "host_model_rejected", "host_unavailable", "manual_replacement"] as const;
export type CallRoute = typeof routes[number];
export interface CallTarget {
  root: string;
  directory: string;
  task: string | null;
}
export interface AgentCall {
  version: 1;
  id: string;
  at: string;
  task: string | null;
  agent: string;
  engine: AgentName | null;
  route: CallRoute;
  status: typeof statuses[number];
  reason: string | null;
  replacement_reason: string | null;
  model: { requested: CallValue<string>; actual: CallValue<string> };
  effort: { requested: CallValue<string>; actual: CallValue<string> };
  duration_ms: CallValue<number>;
  tokens: { input: CallValue<number>; output: CallValue<number>; total: CallValue<number> };
  ref: string | null;
}

export class AgentCallError extends Error {}
function invalid(): never { throw new AgentCallError("호출 기록의 필드, 값 또는 출처 형식 오류"); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key))) return invalid();
  return row;
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export const callIdentifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value) && !hasSecret(value);
const requestedSources = ["requested", "pm"] as const;
const actualSources = ["pm", "tool", "host"] as const;

function measurement<T>(input: unknown, valid: (value: unknown) => value is T, permitted: readonly Source[]): CallValue<T> {
  const { value, source } = exact(input, ["value", "source"]);
  if (value === null && source === "unknown") return unknownCallValue;
  if (!valid(value) || !oneOf(source, permitted)) return invalid();
  return { value, source };
}
function configuration(input: unknown): AgentCall["model"] {
  const { requested, actual } = exact(input, ["requested", "actual"]);
  return { requested: measurement(requested, callIdentifier, requestedSources), actual: measurement(actual, callIdentifier, actualSources) };
}
function checkedRef(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 240 && permissionPath(value) &&
    !/[. ](?:\/|$)/.test(value) && !hasSecret(value));
}

export function parseAgentCall(input: unknown): AgentCall {
  const raw = exact(input, ["version", "id", "at", "task", "agent", "engine", "route", "status", "reason", "replacement_reason", "model", "effort", "duration_ms", "tokens", "ref"]);
  const { version, id, at, task, agent, engine, route, status, reason, replacement_reason, ref } = raw;
  if (version !== 1 || typeof id !== "string" || !/^[a-f0-9]{32,64}$/.test(id) ||
      typeof at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(at) || !Number.isFinite(Date.parse(at)) ||
      (task !== null && (typeof task !== "string" || !/^T\d{2}$/.test(task))) ||
      typeof agent !== "string" || !validTeamName(agent) ||
      (engine !== null && !oneOf(engine, agentNames)) || !oneOf(route, routes) || !oneOf(status, statuses) ||
      (reason !== null && !oneOf(reason, reasons)) || (replacement_reason !== null && !oneOf(replacement_reason, reasons)) || !checkedRef(ref)) return invalid();
  if (status === "completed" && reason !== null) return invalid();
  const tokens = exact(raw.tokens, ["input", "output", "total"]);
  return { version, id, at: new Date(at).toISOString(), task, agent, engine, route, status, reason, replacement_reason, ref,
    model: configuration(raw.model), effort: configuration(raw.effort), duration_ms: measurement(raw.duration_ms, natural, actualSources),
    tokens: { input: measurement(tokens.input, natural, actualSources), output: measurement(tokens.output, natural, actualSources), total: measurement(tokens.total, natural, actualSources) } };
}

function equalOrMissing<T>(before: T | null, after: T | null): T | null {
  if (before !== null && after !== null && before !== after) throw new AgentCallError("같은 호출 ID에 상충하는 값 또는 참조");
  return before ?? after;
}
function mergeValue<T>(before: CallValue<T>, after: CallValue<T>): CallValue<T> {
  if (before.value === null) return after;
  if (after.value === null) return before;
  equalOrMissing(before.value, after.value);
  return sources.indexOf(before.source) >= sources.indexOf(after.source) ? before : after;
}
function mergeConfig(before: AgentCall["model"], after: AgentCall["model"]): AgentCall["model"] {
  return { requested: mergeValue(before.requested, after.requested), actual: mergeValue(before.actual, after.actual) };
}
function enrich(before: AgentCall, after: AgentCall): AgentCall {
  if (before.agent !== after.agent || before.route !== after.route || before.task !== after.task || before.at !== after.at) {
    throw new AgentCallError("같은 호출 ID의 구성원·경로·태스크·시작 시각이 다르다");
  }
  const status = equalOrMissing(before.status === "unknown" ? null : before.status, after.status === "unknown" ? null : after.status) ?? "unknown";
  return parseAgentCall({
    ...before, engine: equalOrMissing(before.engine, after.engine), status,
    reason: equalOrMissing(before.reason, after.reason), replacement_reason: equalOrMissing(before.replacement_reason, after.replacement_reason),
    model: mergeConfig(before.model, after.model), effort: mergeConfig(before.effort, after.effort),
    duration_ms: mergeValue(before.duration_ms, after.duration_ms), ref: equalOrMissing(before.ref, after.ref),
    tokens: { input: mergeValue(before.tokens.input, after.tokens.input), output: mergeValue(before.tokens.output, after.tokens.output), total: mergeValue(before.tokens.total, after.tokens.total) },
  });
}

function absent(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT"; }

export function readAgentCalls(target: Omit<CallTarget, "task">, inputs?: InputTrace): AgentCall[] | null {
  const path = safeTeamPath(target.root, `${target.directory}/${callFile}`);
  let bytes: Buffer;
  try { bytes = regularBytes(path, callLimit); }
  catch (error) {
    if (!absent(error)) throw error;
    inputs?.absent?.(path);
    return null;
  }
  inputs?.record(path, inputHash(bytes));
  const content = utf8(bytes);
  if (content && !content.endsWith("\n")) throw new AgentCallError("호출 원장의 마지막 행이 불완전하다");
  const ids = new Set<string>();
  return content.trimEnd().split("\n").filter(Boolean).map((line) => {
    const row = parseAgentCall(strictJson(line));
    if (ids.has(row.id)) throw new AgentCallError("호출 원장에 같은 ID 행이 두 개 있다");
    ids.add(row.id);
    return row;
  });
}

const wait = new Int32Array(new SharedArrayBuffer(4));
function deadLockOwner(path: string): boolean {
  try {
    const pidText = /^pace-agent-calls-v1 ([1-9]\d{0,9})\n$/.exec(utf8(regularBytes(path, 96)))?.[1];
    if (!pidText || Number(pidText) <= 1 || Number(pidText) > 2_147_483_647) return false;
    try { process.kill(Number(pidText), 0); }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
  } catch { /* A lock that cannot be accounted for is retained. */ }
  return false;
}

function recoverCallLock(path: string, prior: ReturnType<typeof fstatSync>): void {
  if (!deadLockOwner(path)) return;
  const guard = join(dirname(path), ".recover.local.json");
  let fd: number;
  try { fd = openSync(guard, "wx", 0o600); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return; throw error; }
  const ownGuard = fstatSync(fd);
  try {
    const current = lstatSync(path, { throwIfNoEntry: false });
    if (current && current.dev === prior.dev && current.ino === prior.ino && deadLockOwner(path)) unlinkSync(path);
  } finally { releaseCallLock(guard, fd, ownGuard); }
}

function releaseCallLock(path: string, fd: number, owned: ReturnType<typeof fstatSync>): void {
  closeSync(fd);
  const current = lstatSync(path, { throwIfNoEntry: false });
  if (current && current.dev === owned.dev && current.ino === owned.ino) unlinkSync(path);
}

function underCallLock<T>(path: string, operation: () => T): T {
  const until = performance.now() + 3000;
  let fd: number;
  for (;;) {
    try { fd = openSync(path, "wx", 0o600); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lock = lstatSync(path, { throwIfNoEntry: false });
      if (lock && (!lock.isFile() || lock.nlink !== 1)) throw new AgentCallError("호출 원장 잠금의 파일 종류 오류");
      if (lock) recoverCallLock(path, lock);
      if (performance.now() >= until) throw new AgentCallError("호출 원장 calls/.write.local.json 잠금 확인 후 재시도");
      Atomics.wait(wait, 0, 0, 15);
    }
  }
  const owned = fstatSync(fd);
  try {
    writeFileSync(fd, `pace-agent-calls-v1 ${process.pid}\n`);
    return operation();
  } finally { releaseCallLock(path, fd, owned); }
}

export function recordAgentCall(target: CallTarget, value: unknown): AgentCall {
  const call = parseAgentCall(value);
  if (target.task !== call.task) throw new AgentCallError("호출 행과 기록 대상의 태스크가 다르다");
  if (call.ref !== null) {
    const reference = safeTeamPath(target.root, `${target.directory}/${call.ref}`);
    if (!lstatSync(reference, { throwIfNoEntry: false })?.isFile()) throw new AgentCallError("호출 참조는 범위 안의 기존 일반 파일이어야 한다");
  }
  const dir = safeTeamPath(target.root, target.directory, true);
  if (!lstatSync(dir).isDirectory()) throw new AgentCallError("호출 범위가 디렉터리가 아니다");
  mkdirSync(safeTeamPath(target.root, `${target.directory}/calls`, true), { recursive: true });
  const lock = safeTeamPath(target.root, `${target.directory}/calls/.write.local.json`);
  return underCallLock(lock, () => {
    const rows = readAgentCalls(target) ?? [];
    const index = rows.findIndex(({ id }) => id === call.id);
    const previous = rows[index];
    const row = previous ? enrich(previous, call) : call;
    if (previous && JSON.stringify(previous) === JSON.stringify(row)) return row;
    if (index < 0) rows.push(row); else rows[index] = row;
    const content = rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    if (Buffer.byteLength(content) > callLimit) throw new AgentCallError("호출 원장 크기 한도 초과");
    writeFileAtomic(safeTeamPath(target.root, `${target.directory}/${callFile}`), content);
    return row;
  });
}

type CallAmount = { known: number | null; unknown: number };
interface CallGroup {
  agent: string;
  engine: AgentName | null;
  attempts: number;
  durationMs: CallAmount;
  inputTokens: CallAmount;
  outputTokens: CallAmount;
  totalTokens: CallAmount;
}
export type AgentCallMetrics = { state: "recorded"; attempts: number; groups: CallGroup[] } | { state: "unreadable" };

function addAmount(total: CallAmount, add: number | null): void {
  if (add === null) total.unknown++;
  else total.known = (total.known ?? 0) + add;
}

export function collectAgentCallMetrics(targets: readonly Omit<CallTarget, "task">[], trace?: InputTrace): AgentCallMetrics | undefined {
  const calls = new Map<string, AgentCall>();
  let present = false;
  try {
    for (const target of targets) {
      const rows = readAgentCalls(target, trace);
      if (rows === null) continue;
      present = true;
      for (const row of rows) {
        const previous = calls.get(row.id);
        calls.set(row.id, previous ? enrich(previous, row) : row);
      }
    }
  }
  catch (error) {
    if (error instanceof InputSnapshotError) throw error;
    return { state: "unreadable" };
  }
  if (!present) return undefined;
  const groups = new Map<string, CallGroup>();
  const empty = (): CallAmount => ({ known: null, unknown: 0 });
  for (const call of calls.values()) {
    const { agent, engine } = call;
    const key = `${agent}/${engine ?? "unknown"}`;
    const group = groups.get(key) ?? { agent, engine, attempts: 0, durationMs: empty(), inputTokens: empty(), outputTokens: empty(), totalTokens: empty() };
    group.attempts++;
    addAmount(group.durationMs, call.duration_ms.value);
    addAmount(group.inputTokens, call.tokens.input.value);
    addAmount(group.outputTokens, call.tokens.output.value);
    addAmount(group.totalTokens, call.tokens.total.value);
    groups.set(key, group);
  }
  return { state: "recorded", attempts: calls.size, groups: [...groups.values()] };
}

export function formatAgentCallMetrics(metrics?: AgentCallMetrics): string {
  if (!metrics) return "";
  const title = "## 에이전트 호출 기록";
  if (metrics.state === "unreadable") return `\n\n${title}\n\n호출 원장을 읽을 수 없어 집계를 보류한다.`;
  const format = (amount: CallAmount) => `${amount.known ?? "미확인"}${amount.unknown ? ` (미확인 ${amount.unknown}건)` : ""}`;
  return [
    "", "", title, "", `실제 시도 ${metrics.attempts}건. 호출 원장 안의 집계이며 검토 원장과 합산하지 않는다.`, "",
    "| 에이전트 | 실행기 | 시도 | 시간(ms) | 입력 토큰 | 출력 토큰 | 호스트 총 토큰 |",
    "|---|---|---|---|---|---|---|",
    ...metrics.groups.map((g) => `| ${g.agent} | ${g.engine ?? "미확인"} | ${g.attempts} | ${format(g.durationMs)} | ${format(g.inputTokens)} | ${format(g.outputTokens)} | ${format(g.totalTokens)} |`),
  ].join("\n");
}
