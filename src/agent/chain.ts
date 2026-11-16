import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../core/fsutil.ts";
import { agentNames, AgentError, modes, runAgent, validateRequest, errorCodes, type AgentName, type AgentResult, type Executor, type Mode, type RequestInput, type RunHooks } from "./contract.ts";
import { classifyFailure, classifyText, excerpt, parseResetAt, type FailureKind } from "./limits.ts";
import { changedParts, OBSERVATION_SCOPE, SnapshotError, summarizeChange, takeSnapshot, type ChangeSummary, type Snapshot } from "./snapshot.ts";

// 에이전트 체인과 폴백 (P035 T02, BR02). 안전 원칙: 판정이 불확실하면 폴백하지 않고 handoff_required.

export interface ChainStep {
  agent: AgentName;
  mode: Mode;
  model?: string;
  effort?: string;
}

export type WriteFallback = "never" | "observed";

export interface ChainDef {
  name: string;
  steps: ChainStep[];
  fallbackOnTimeout: boolean;
  /** never(기본): 쓰기 요청에서 시작된 단계가 실패하면 항상 handoff. observed: 관찰 범위 안 변경이 없을 때만 자동 폴백(D7) */
  writeFallback: WriteFallback;
  defaultCooldownMinutes: number;
}

export interface ChainConfig {
  chains: Record<string, ChainDef>;
  limitPatterns: RegExp[];
}

export class ChainConfigError extends Error {}

// ---- effort ----
const COMMON_EFFORT = ["low", "medium", "high", "max"];
const NATIVE_EFFORT: Record<AgentName, string[]> = {
  claude: ["low", "medium", "high", "xhigh", "max"],
  codex: ["minimal", "low", "medium", "high", "xhigh"],
};

/** 공통값(low·medium·high·max)을 에이전트 값으로 바꾼다 — 범위 밖은 맞추고(codex max→xhigh) 요청·적용값을 모두 돌려준다. 정의에 없는 값은 오류 */
export function normalizeEffort(agent: AgentName, effort: string): { requested: string; applied: string } {
  if (COMMON_EFFORT.includes(effort)) return { requested: effort, applied: agent === "codex" && effort === "max" ? "xhigh" : effort };
  if (NATIVE_EFFORT[agent].includes(effort)) return { requested: effort, applied: effort };
  throw new ChainConfigError(`${agent}가 모르는 effort다: ${effort} (공통: ${COMMON_EFFORT.join("|")}, ${agent} 고유: ${NATIVE_EFFORT[agent].join("|")})`);
}

// ---- 설정 ----
export function parseChainConfig(input: unknown): ChainConfig {
  const bad = (m: string): never => { throw new ChainConfigError(m); };
  if (typeof input !== "object" || input === null || Array.isArray(input)) bad("체인 설정은 JSON 객체여야 한다");
  const root = input as Record<string, unknown>;
  const rawChains = root.chains;
  if (typeof rawChains !== "object" || rawChains === null || Array.isArray(rawChains)) bad("`chains` 객체가 필요하다");
  const chains: Record<string, ChainDef> = {};
  for (const [name, raw] of Object.entries(rawChains as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(name)) bad(`체인 이름이 올바르지 않다: ${name}`);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) bad(`체인 ${name}은 객체여야 한다`);
    const def = raw as Record<string, unknown>;
    if (!Array.isArray(def.steps) || def.steps.length === 0) bad(`체인 ${name}에 steps가 비어 있다`);
    const steps: ChainStep[] = (def.steps as unknown[]).map((s, i) => {
      if (typeof s !== "object" || s === null) return bad(`체인 ${name} 단계 ${i + 1}이 객체가 아니다`);
      const step = s as Record<string, unknown>;
      if (!agentNames.includes(step.agent as AgentName)) bad(`체인 ${name} 단계 ${i + 1}: agent는 ${agentNames.join("|")}`);
      if (!modes.includes(step.mode as Mode)) bad(`체인 ${name} 단계 ${i + 1}: mode는 ${modes.join("|")}`);
      for (const key of ["model", "effort"] as const) {
        if (step[key] !== undefined && (typeof step[key] !== "string" || step[key] === "")) bad(`체인 ${name} 단계 ${i + 1}: ${key}는 비지 않은 문자열`);
      }
      if (typeof step.effort === "string") normalizeEffort(step.agent as AgentName, step.effort); // 정의 오류는 여기서
      return { agent: step.agent as AgentName, mode: step.mode as Mode, model: step.model as string | undefined, effort: step.effort as string | undefined };
    });
    const writeFallback = def.write_fallback ?? "never";
    if (writeFallback !== "never" && writeFallback !== "observed") bad(`체인 ${name}: write_fallback은 never|observed`);
    if (def.fallback_on_timeout !== undefined && typeof def.fallback_on_timeout !== "boolean") bad(`체인 ${name}: fallback_on_timeout은 true|false`);
    const cooldown = def.default_cooldown_minutes ?? 30;
    if (typeof cooldown !== "number" || !Number.isFinite(cooldown) || cooldown <= 0 || cooldown > 24 * 60) bad(`체인 ${name}: default_cooldown_minutes는 1~1440`);
    chains[name] = { name, steps, fallbackOnTimeout: def.fallback_on_timeout === true, writeFallback: writeFallback as WriteFallback, defaultCooldownMinutes: cooldown as number };
  }
  const limitPatterns: RegExp[] = [];
  if (root.limit_patterns !== undefined) {
    if (!Array.isArray(root.limit_patterns)) bad("limit_patterns는 문자열 배열");
    for (const p of root.limit_patterns as unknown[]) {
      if (typeof p !== "string" || p === "" || p.length > 200) bad("limit_patterns 항목은 1~200자 문자열");
      try { limitPatterns.push(new RegExp(p as string, "i")); } catch { bad(`limit_patterns 정규식이 올바르지 않다: ${p}`); }
    }
  }
  return { chains, limitPatterns };
}

export function loadChainConfig(file: string): ChainConfig {
  if (!existsSync(file)) throw new ChainConfigError(`체인 설정 파일이 없다: ${file}`);
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch (error) { throw new ChainConfigError(`체인 설정 JSON을 읽을 수 없다: ${(error as Error).message}`); }
  return parseChainConfig(parsed);
}

export function defaultChainFile(profileDir: string): string {
  return join(profileDir, "agent-chains.json");
}

/** 연결점: daemon·project start가 이름으로 체인을 고른다 */
export function resolveChain(config: ChainConfig, name: string): ChainDef {
  const chain = config.chains[name];
  if (!chain) throw new ChainConfigError(`없는 체인: ${name} (있는 체인: ${Object.keys(config.chains).join(", ") || "없음"})`);
  return chain;
}

export interface ChainCheck {
  warnings: string[];
  steps: { agent: AgentName; mode: Mode; effort_requested: string | null; effort_applied: string | null }[];
}

/** 정의 검사: 실행기 지원 범위를 넘는 옵션은 오류, 읽기 전용 미확인 단계·실행기 없음은 경고. 외부 에이전트는 호출하지 않는다 */
export function checkChain(chain: ChainDef, find: (agent: AgentName, mode: Mode) => Executor | undefined): ChainCheck {
  const warnings: string[] = [];
  const steps: ChainCheck["steps"] = [];
  chain.steps.forEach((step, i) => {
    const label = `체인 ${chain.name} 단계 ${i + 1}(${step.agent}/${step.mode})`;
    const executor = find(step.agent, step.mode);
    const effort = step.effort ? normalizeEffort(step.agent, step.effort) : null;
    if (!executor) warnings.push(`${label}: 실행기가 등록돼 있지 않다 — 실행하면 건너뛴다`);
    else {
      if (step.model && !executor.capabilities.models) throw new ChainConfigError(`${label}: model을 지원하지 않는다`);
      if (step.effort && !executor.capabilities.effort) throw new ChainConfigError(`${label}: effort를 지원하지 않는다`);
      if (executor.readOnlyEnforced !== true) warnings.push(`${label}: 읽기 전용 강제를 실측으로 확인하지 못했다 — 읽기 전용 요청에서는 건너뛴다`);
    }
    if (step.mode === "p") warnings.push(`${label}: 정의 검사는 외부 에이전트를 호출하지 않는다 — 읽기 전용 강제는 실행기의 실측 증거 표와 실행 때 sandbox 재확인에 의존한다`);
    steps.push({ agent: step.agent, mode: step.mode, effort_requested: effort?.requested ?? null, effort_applied: effort?.applied ?? null });
  });
  if (chain.writeFallback === "observed") warnings.push(`체인 ${chain.name}: write_fallback=observed — 관찰 범위 밖 쓰기는 탐지하지 못한 채 자동 폴백할 수 있다`);
  return { warnings, steps };
}

// ---- 쿨다운 ----
export interface CooldownStore {
  get(key: string): number | null;
  set(key: string, until: number): void;
}

export function memoryCooldownStore(): CooldownStore {
  const map = new Map<string, number>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

/** PACE_HOME 아래 JSON 파일 — 원자적으로 쓴다. 읽기·쓰기 실패는 쿨다운 없음으로 취급(체인 실행을 막지 않는다) */
export function fileCooldownStore(file: string, now: () => number = Date.now): CooldownStore {
  const read = (): Record<string, number> => {
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(data)) if (typeof v === "number" && v > now()) out[k] = v;
      return out;
    } catch { return {}; }
  };
  return {
    get: (key) => read()[key] ?? null,
    set: (key, until) => {
      try { writeFileAtomic(file, JSON.stringify({ ...read(), [key]: until }, null, 2) + "\n"); } catch { /* best effort */ }
    },
  };
}

const cooldownKey = (step: ChainStep): string => `${step.agent}/${step.mode}/${step.model ?? "-"}`;

// ---- 실행 ----
export interface Attempt {
  step: number;
  agent: AgentName;
  mode: Mode;
  model: string | null;
  effort_requested: string | null;
  effort_applied: string | null;
  /** success · skipped(실행 전 건너뜀) · fallback(실패 후 다음 단계) · stopped(실패, 폴백 안 함) · handoff(실패, 사람에게 넘김) */
  outcome: "success" | "skipped" | "fallback" | "stopped" | "handoff";
  reason: string | null;
  /** 오류·건너뜀 원문 발췌(300자) — 분류가 가정에 기댄 것이라 원문을 보존한다 */
  detail: string | null;
  cooldown_until: string | null;
  raw_path: string | null;
  duration_ms: number | null;
}

export type ChainOutcome =
  | { status: "ok"; chain: string; result: AgentResult; attempts: Attempt[]; warnings: string[] }
  | { status: "chain_exhausted"; chain: string; attempts: Attempt[]; next_retry_at: string | null }
  | { status: "failed"; chain: string; error: { code: string; message: string }; attempts: Attempt[]; /** 쓰기 요청에서 실패 단계가 남긴 변경(관찰 범위 안) — 사람이 이어받을 때 쓴다 */ changes: ChangeSummary | null }
  | { status: "handoff_required"; chain: string; reason: string; request: { prompt: string; cwd: string; access: string; timeout_ms: number }; attempts: Attempt[]; changes: ChangeSummary | null; observation_scope: string; last_error: { code: string; message: string } | null };

export interface ChainDeps {
  /** ACP 단계에만 전달하는 실행 훅(-p 단계는 훅을 받지 않는다) */
  hooks?: RunHooks;
  find: (agent: AgentName, mode: Mode) => Executor | undefined;
  cooldowns: CooldownStore;
  now?: () => number;
  snapshot?: (cwd: string) => Snapshot;
  limitPatterns?: RegExp[];
  /** 취소 신호 — 단계 실행기에 전달하고 단계 사이에도 확인한다. abort되면 폴백하지 않고 cancelled로 끝난다 */
  signal?: AbortSignal;
}

const FALLBACK_KINDS: FailureKind[] = ["rate_limited", "auth_failed", "executor_unavailable", "read_only_unenforceable"];

export function outcomeExitCode(outcome: ChainOutcome): number {
  if (outcome.status === "ok") return 0;
  if (outcome.status === "handoff_required") return errorCodes.handoff_required;
  if (outcome.status === "chain_exhausted") return errorCodes.chain_exhausted;
  return (errorCodes as Record<string, number>)[outcome.error.code] ?? errorCodes.agent_failed;
}

export async function runChain(chain: ChainDef, input: RequestInput, deps: ChainDeps): Promise<ChainOutcome> {
  const now = deps.now ?? Date.now;
  const snap = deps.snapshot ?? ((cwd: string) => takeSnapshot(cwd));
  const extra = deps.limitPatterns ?? [];
  const first = chain.steps[0]!;
  const base = validateRequest({ ...input, agent: first.agent, mode: first.mode, model: undefined, effort: undefined, resume: undefined });
  checkChain(chain, deps.find); // 지원하지 않는 옵션은 실행 전에 오류
  const attempts: Attempt[] = [];
  const warnings: string[] = [];

  const takeBefore = (): { snapshot: Snapshot | null; error: string | null } => {
    try { return { snapshot: snap(base.cwd), error: null }; } catch (e) { return { snapshot: null, error: e instanceof SnapshotError || e instanceof Error ? e.message : String(e) }; }
  };
  const handoff = (reason: string, before: Snapshot | null, lastError: { code: string; message: string } | null): ChainOutcome => {
    let changes: ChangeSummary | null = null;
    if (before) {
      try { changes = summarizeChange(base.cwd, before, snap(base.cwd)); } catch { changes = null; }
    }
    return { status: "handoff_required", chain: chain.name, reason, request: { prompt: base.prompt, cwd: base.cwd, access: base.access, timeout_ms: base.timeoutMs }, attempts, changes, observation_scope: OBSERVATION_SCOPE, last_error: lastError };
  };

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i]!;
    const effort = step.effort ? normalizeEffort(step.agent, step.effort) : null;
    const attempt: Attempt = { step: i + 1, agent: step.agent, mode: step.mode, model: step.model ?? null, effort_requested: effort?.requested ?? null, effort_applied: effort?.applied ?? null, outcome: "skipped", reason: null, detail: null, cooldown_until: null, raw_path: null, duration_ms: null };
    attempts.push(attempt);
    if (deps.signal?.aborted) {
      attempt.outcome = "stopped"; attempt.reason = "cancelled"; attempt.detail = "취소 신호로 다음 단계를 시작하지 않았다";
      return { status: "failed", chain: chain.name, error: { code: "cancelled", message: "취소됐다" }, attempts, changes: null };
    }
    const executor = deps.find(step.agent, step.mode);
    if (!executor) { attempt.reason = "executor_unavailable"; attempt.detail = "실행기가 등록돼 있지 않다"; continue; }
    if (base.access === "read-only" && executor.readOnlyEnforced !== true) { attempt.reason = "read_only_unenforceable"; attempt.detail = "읽기 전용 강제를 실측으로 확인하지 못한 단계라 건너뜀"; continue; }
    const cooling = deps.cooldowns.get(cooldownKey(step));
    if (cooling !== null && cooling > now()) { attempt.reason = "cooldown"; attempt.cooldown_until = new Date(cooling).toISOString(); attempt.detail = "한도 쿨다운 중이라 건너뜀"; continue; }

    const before = takeBefore();
    const started = now();
    let failure: { kind: FailureKind; error: AgentError } | null = null;
    try {
      const result = await runAgent(executor, { ...base, agent: step.agent, mode: step.mode, model: step.model, effort: effort?.applied }, step.mode === "acp" ? (deps.signal ? { ...deps.hooks, signal: deps.signal } : deps.hooks) : (deps.signal ? { signal: deps.signal } : undefined));
      attempt.duration_ms = result.duration_ms;
      attempt.raw_path = result.raw_path;
      if (result.is_error) {
        const kind = classifyText(result.text, extra);
        failure = { kind, error: new AgentError(kind === "rate_limited" ? "rate_limited" : kind === "auth_failed" ? "auth_failed" : "agent_failed", `에이전트가 오류 결과를 반환했다: ${excerpt(result.text)}`) };
      } else {
        attempt.outcome = "success";
        if (before.snapshot) {
          try {
            const after = snap(base.cwd);
            const changed = changedParts(before.snapshot, after);
            if (base.access === "read-only" && changed.length > 0) {
              warnings.push(`read_only_violation: 읽기 전용 요청에서 변경이 관찰됐다(${changed.join(", ")}) — 단계 ${i + 1}(${step.agent}/${step.mode})`);
              attempt.reason = "read_only_violation";
            }
          } catch { warnings.push(`스냅샷 비교를 못 해 읽기 전용 위반 여부를 확인하지 못했다(단계 ${i + 1})`); }
        } else if (base.access === "read-only") warnings.push(`스냅샷을 만들지 못해 읽기 전용 위반을 탐지하지 못했다: ${excerpt(before.error ?? "")}`);
        return { status: "ok", chain: chain.name, result, attempts, warnings };
      }
    } catch (error) {
      if (!(error instanceof AgentError)) throw error;
      attempt.duration_ms = now() - started;
      failure = { kind: classifyFailure(error, extra), error };
    }

    const { kind, error } = failure;
    attempt.reason = kind;
    attempt.detail = excerpt(error.message);
    const errorInfo = { code: error.code, message: excerpt(error.message, 500) };
    if (kind === "rate_limited" || kind === "auth_failed") {
      const until = parseResetAt(error.message, now()) ?? now() + chain.defaultCooldownMinutes * 60_000;
      deps.cooldowns.set(cooldownKey(step), until);
      attempt.cooldown_until = new Date(until).toISOString();
    }
    const fallbackable = FALLBACK_KINDS.includes(kind) || (kind === "timeout" && chain.fallbackOnTimeout);
    // 시작 전 실패(구조화된 표지): 에이전트에게 일을 맡기기 전이라 쓰기가 일어났을 수 없다. 표지가 없으면 시작된 것으로 본다
    const notStarted = !error.started && !error.cleanupUnconfirmed;

    // 공통 안전 판정 — 폴백 사유와 무관하게 단계가 시작됐다면 폴백 전에 먼저 적용한다
    if (!notStarted) {
      if (error.cleanupUnconfirmed) { attempt.outcome = "handoff"; return handoff("cleanup_unconfirmed", before.snapshot, errorInfo); }
      let afterSnap: Snapshot | null = null;
      let afterError: string | null = null;
      try { afterSnap = snap(base.cwd); } catch (e) { afterError = e instanceof Error ? e.message : String(e); }
      const changed = before.snapshot && afterSnap ? changedParts(before.snapshot, afterSnap) : null;
      if (base.access === "read-only") {
        // 변경이 관찰되거나, 관찰 자체가 불확실하면(비 git·git 오류·시간 초과) 폴백하지 않는다
        if (!before.snapshot || !afterSnap) { attempt.outcome = "handoff"; return handoff(`snapshot_failed: ${excerpt(before.error ?? afterError ?? "", 200)}`, before.snapshot, errorInfo); }
        if (changed && changed.length > 0) { attempt.outcome = "handoff"; return handoff("read_only_violation", before.snapshot, errorInfo); }
      } else if (fallbackable) {
        if (chain.writeFallback === "never") { attempt.outcome = "handoff"; return handoff("write_fallback_never", before.snapshot, errorInfo); }
        if (!before.snapshot || !afterSnap) { attempt.outcome = "handoff"; return handoff(`snapshot_failed: ${excerpt(before.error ?? afterError ?? "", 200)}`, before.snapshot, errorInfo); }
        if (changed && changed.length > 0) { attempt.outcome = "handoff"; return handoff(`changes_detected: ${changed.join(", ")}`, before.snapshot, errorInfo); }
      }
    }
    if (!fallbackable) {
      attempt.outcome = "stopped";
      let changes: ChangeSummary | null = null;
      if (base.access === "write" && before.snapshot) { try { changes = summarizeChange(base.cwd, before.snapshot, snap(base.cwd)); } catch { changes = null; } }
      return { status: "failed", chain: chain.name, error: errorInfo, attempts, changes };
    }
    attempt.outcome = "fallback";
  }

  const untils = chain.steps.map((s) => deps.cooldowns.get(cooldownKey(s))).filter((t): t is number => t !== null && t > now());
  return { status: "chain_exhausted", chain: chain.name, attempts, next_retry_at: untils.length > 0 ? new Date(Math.min(...untils)).toISOString() : null };
}
