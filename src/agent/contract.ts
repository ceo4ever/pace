import { resolve } from "node:path";

// pace agent 호출 계약 — 호출 방식(-p·ACP)과 대상 에이전트 차이를 가리는 입력·결과·오류 형태.
// 실행기(T02 -p, T03 ACP)는 이 타입만 채운다. 나중 SDK 분리를 위해 CLI·파일시스템에 기대지 않는다.

export const agentNames = ["claude", "codex"] as const;
export type AgentName = (typeof agentNames)[number];
export const modes = ["p", "acp"] as const;
export type Mode = (typeof modes)[number];
export type Provider = "anthropic" | "openai";
export type ProviderSource = "reported" | "model" | "table";
export type Access = "read-only" | "write";

/** 오류 코드 → 종료 코드. 0은 성공, 1은 사용법(UsageError)이 쓴다. */
export const errorCodes = {
  invalid_request: 2,
  unsupported_option: 3,
  executor_unavailable: 4,
  read_only_unenforceable: 5,
  timeout: 6,
  agent_failed: 7,
  protocol_error: 8,
  session_mismatch: 9,
  // 10은 verify 미실행이 쓴다
  rate_limited: 11,
  handoff_required: 12,
  chain_exhausted: 13,
  auth_failed: 14,
  cancelled: 15,
  // 16: verify가 반복 실패 단계(근본 진단·사용자 결정 대기)라 실행하지 않음 (P007)
  review_escalation: 16,
} as const;
export type ErrorCode = keyof typeof errorCodes;

export class AgentError extends Error {
  readonly code: ErrorCode;
  /** 프로세스·자손 종료 회수를 확인하지 못했다 — 체인은 이 표지가 있으면 폴백하지 않는다(문구가 아니라 구조화된 신호) */
  readonly cleanupUnconfirmed: boolean;
  /** 에이전트에게 일을 맡기기 전에 실패했다(false) — 쓰기가 일어났을 수 없다. 기본 true(시작된 것으로 보고 안전 판정을 적용) */
  readonly started: boolean;
  constructor(code: ErrorCode, message: string, options: { cleanupUnconfirmed?: boolean; started?: boolean } = {}) {
    super(message);
    this.code = code;
    this.cleanupUnconfirmed = options.cleanupUnconfirmed === true;
    this.started = options.started !== false;
  }
  get exitCode(): number {
    return errorCodes[this.code];
  }
}

export interface AgentRequest {
  agent: AgentName;
  mode: Mode;
  /** 프롬프트 본문. argv로 받지 않는다 — CLI는 stdin·파일에서 읽어 채운다. */
  prompt: string;
  cwd: string;
  systemPrompt?: string;
  model?: string;
  effort?: string;
  access: Access;
  timeoutMs: number;
  /** 이어가기 ID — 같은 cwd·같은 access에서만 허용 */
  resume?: string;
  /** 원본 출력 보관 폴더. 없으면 저장하지 않는다 */
  rawDir?: string;
}

export interface Sourced<T> {
  value: T;
  /** 값을 어디서 확인했는지 — 에이전트가 보고한 값(reported)인지, 요청·기본값을 그대로 적은 것(requested)인지 */
  source: "reported" | "model" | "requested" | "table" | "unknown";
}

export interface AgentResult {
  text: string;
  agent: AgentName;
  mode: Mode;
  model: Sourced<string | null>;
  /** 실행 출력에서 호스트가 보고한 effort. 요청값만 알 때는 생략한다. */
  reported_effort?: string;
  /** reported: 에이전트가 보고 · model: 보고된 모델 이름에서 판별 · table: 에이전트 종류 고정표(확인 아님) */
  provider: Sourced<Provider>;
  access: Access;
  /** 실행기가 읽기 전용을 실제로 강제했는지 확인한 방법 */
  enforcement: string;
  session_id: string | null;
  stop_reason: string | null;
  is_error: boolean;
  duration_ms: number;
  usage: { input_tokens: number | null; output_tokens: number | null };
  /** 호스트가 방향 분리 없이 보고한 총량. 기존 usage 슬롯의 의미는 유지한다. */
  usage_total_tokens?: number;
  /** raw 보관 시 파일 경로, 아니면 null */
  raw_path: string | null;
  /** 이벤트 전달 집계 — onEvent 훅이 있을 때만(ACP) */
  events?: EventStats;
  /** 프로세스 회수 보증 — verified(프로세스 그룹) · best-effort-unverified(Windows: 최선 노력, 실기 미검증) */
  process_cleanup: "verified" | "best-effort-unverified";
}

/** 실행기가 에이전트별로 알려 주는 지원 범위. 요청이 이를 벗어나면 조용히 무시하지 않고 오류. */
export interface Capabilities {
  models: boolean;
  effort: boolean;
  systemPrompt: boolean;
  resume: boolean;
  writeAccess: boolean;
}

export const providerOf: Record<AgentName, Provider> = { claude: "anthropic", codex: "openai" };

export const MAX_TIMEOUT_MS = 3_600_000;
export const DEFAULT_TIMEOUT_MS = 600_000;

/** 이벤트 콜백 전달 집계. delivered+dropped+failed = 에이전트가 보낸 session/update 수 */
export interface EventStats {
  delivered: number;
  dropped: number;
  failed: number;
  /** 한 콜백이 eventTimeoutMs를 넘겨 소비자를 포기했다 — 이후 이벤트는 전달하지 않고 dropped로 센다 */
  consumerStuck: boolean;
}

export type PermissionDecision = "allow" | "reject";

export interface PermissionInfo {
  toolName: string;
  kind: string | null;
  title: string | null;
  access: Access;
  /** 위 결정표에서 정해진 기본 결정 — 기본 허용이면 allow, 기본 거절이면 reject (강제 거절은 콜백을 부르지 않는다) */
  defaultDecision: PermissionDecision;
}

/** 이어가기 대상 세션의 호출자 보관 기록 — 실행기가 request.resume과 직접 대조한다 */
export interface SavedSession {
  sessionId: string;
  agent: AgentName;
  cwd: string;
  access: Access;
}

/**
 * 실행 훅(ACP 전용) — 함수·주입 값은 JSON 직렬화되는 AgentRequest와 분리한다.
 * 훅이 하나라도 있는 요청을 -p 실행기에 주면 조용히 무시하지 않고 unsupported_option.
 */
export interface RunHooks {
  /** session/update 원본을 도착 순서대로 (상한 큐로 분리 소비) */
  onEvent?: (update: Record<string, unknown>, seq: number) => void | Promise<void>;
  eventTimeoutMs?: number;
  /** 권한 요청 위임 — 기본 허용을 낮추거나(쓰기·읽기 전용) 쓰기에서 기본 거절을 허용으로 올릴 수 있다. 읽기 전용에서는 허용을 새로 만들 수 없다 */
  onPermission?: (info: PermissionInfo) => PermissionDecision | Promise<PermissionDecision>;
  permissionTimeoutMs?: number;
  /** true이면 실행기가 요청의 cwd·access로 pace mcp 서버 항목과 허용 도구 집합을 직접 만든다 */
  paceMcp?: boolean;
  /** 새 세션의 첫 프롬프트 앞에 붙이는 정체성 맥락 (resume에는 붙이지 않음) */
  context?: string;
  /** 새 세션의 첫 프롬프트 앞에 붙이는 이전 대화 요약 */
  handoffSummary?: string;
  /** request.resume이 있으면 필수 */
  savedSession?: SavedSession;
  /** 취소 신호 — abort되면 실행기가 프로세스를 회수하고 `cancelled`로 끝난다(-p·ACP 공통, 다른 훅 없이도 허용) */
  signal?: AbortSignal;
}

export function hasHooks(hooks: RunHooks | undefined): boolean {
  if (hooks === undefined) return false;
  const { signal: _signal, ...rest } = hooks;
  return Object.values(rest).some((v) => v !== undefined);
}

export interface Executor {
  readonly agent: AgentName;
  readonly mode: Mode;
  readonly capabilities: Capabilities;
  /** 읽기 전용 요청에서 쓰기 차단을 실측 증거로 확인한 실행기만 true — 체인이 읽기 전용 단계 적격을 이 값으로 판단한다 */
  readonly readOnlyEnforced?: boolean;
  run(request: AgentRequest, hooks?: RunHooks, beforeLocalOutput?: (result: AgentResult) => void): Promise<AgentResult>;
}

export type RequestInput = { [K in keyof AgentRequest]?: unknown };

/** 형식·범위 검사. 실행 전에 한 번 — 실행기 능력 검사는 checkCapabilities. */
export function validateRequest(input: RequestInput): AgentRequest {
  function bad(m: string): never {
    throw new AgentError("invalid_request", m);
  }
  if (!agentNames.includes(input.agent as AgentName)) bad(`--agent는 ${agentNames.join("|")}`);
  if (!modes.includes(input.mode as Mode)) bad(`--mode는 ${modes.join("|")}`);
  if (typeof input.prompt !== "string" || input.prompt.trim() === "") bad("프롬프트가 비어 있다 (stdin 또는 --prompt-file)");
  if (typeof input.cwd !== "string" || input.cwd === "") bad("cwd가 필요하다");
  const access = input.access ?? "read-only";
  const timeoutMs: unknown = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (access !== "read-only" && access !== "write") bad("access는 read-only|write");
  if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs <= 0) bad("timeout은 양의 정수(ms)");
  if (timeoutMs > MAX_TIMEOUT_MS) bad(`timeout 상한 ${MAX_TIMEOUT_MS}ms 초과`);
  for (const key of ["systemPrompt", "model", "effort", "resume", "rawDir"] as const) {
    const v = input[key];
    if (v !== undefined && (typeof v !== "string" || v === "")) bad(`${key}는 비지 않은 문자열`);
  }
  return {
    agent: input.agent as AgentName,
    mode: input.mode as Mode,
    prompt: input.prompt as string,
    cwd: resolve(input.cwd as string),
    systemPrompt: input.systemPrompt as string | undefined,
    model: input.model as string | undefined,
    effort: input.effort as string | undefined,
    access: access as Access,
    timeoutMs,
    resume: input.resume as string | undefined,
    rawDir: input.rawDir as string | undefined,
  };
}

/** 요청이 실행기 능력을 벗어나면 unsupported_option. 무시하고 진행하지 않는다. */
export function checkCapabilities(request: AgentRequest, caps: Capabilities): void {
  const need: [boolean, string, unknown][] = [
    [caps.models, "model", request.model],
    [caps.effort, "effort", request.effort],
    [caps.systemPrompt, "system-prompt", request.systemPrompt],
    [caps.resume, "resume", request.resume],
  ];
  for (const [ok, name, value] of need) {
    if (value !== undefined && !ok) throw new AgentError("unsupported_option", `${request.agent}/${request.mode}는 --${name}을 지원하지 않는다`);
  }
  if (request.access === "write" && !caps.writeAccess) {
    throw new AgentError("unsupported_option", `${request.agent}/${request.mode}는 쓰기 접근을 지원하지 않는다`);
  }
}

/** 이어가기는 만든 때와 같은 cwd·access에서만. 저장된 세션 메타와 대조한다. */
export function checkResume(request: AgentRequest, saved: { cwd: string; access: Access; agent: AgentName }): void {
  if (saved.cwd !== request.cwd || saved.access !== request.access || saved.agent !== request.agent) {
    throw new AgentError("session_mismatch", "이어가기 ID는 같은 에이전트·cwd·접근 권한에서만 쓸 수 있다");
  }
}

export interface RawFacts {
  text: unknown;
  model?: unknown;
  sessionId?: unknown;
  stopReason?: unknown;
  isError?: unknown;
  /** 에이전트가 직접 보고한 제공자 이름(openai|anthropic) */
  provider?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  effort?: unknown;
  totalTokens?: unknown;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** 보고된 모델 이름에서 제공자를 추정한다 — 모르면 null */
export function providerFromModel(model: string | null): Provider | null {
  if (!model) return null;
  if (/^claude|^anthropic/i.test(model)) return "anthropic";
  if (/^(gpt|o\d|codex|chatgpt)/i.test(model)) return "openai";
  return null;
}

function resolveProvider(agent: AgentName, reportedProvider: unknown, reportedModel: string | null): Sourced<Provider> {
  const table = providerOf[agent];
  const named = reportedProvider === "openai" || reportedProvider === "anthropic" ? reportedProvider : null;
  const fromModel = providerFromModel(reportedModel);
  if (named && fromModel && named !== fromModel) throw new AgentError("protocol_error", `${agent}가 보고한 제공자(${named})와 모델(${reportedModel})의 제공자(${fromModel})가 충돌한다`);
  const found = named ?? fromModel;
  if (found && found !== table) throw new AgentError("protocol_error", `${agent}가 보고한 제공자(${found})가 에이전트 종류(${table})와 다르다`);
  if (named) return { value: named, source: "reported" };
  if (fromModel) return { value: fromModel, source: "model" };
  return { value: table, source: "table" };
}

/** 실행기가 모은 사실을 하나의 결과 형태로. 모델은 보고된 값만 reported, 요청값은 requested, 없으면 unknown. */
export function normalizeResult(request: AgentRequest, facts: RawFacts, meta: { durationMs: number; enforcement: string; rawPath?: string | null; cleanup?: "verified" | "best-effort-unverified" }): AgentResult {
  const reported = str(facts.model);
  const model: Sourced<string | null> = reported
    ? { value: reported, source: "reported" }
    : request.model
      ? { value: request.model, source: "requested" }
      : { value: null, source: "unknown" };
  const total = num(facts.totalTokens);
  return {
    text: typeof facts.text === "string" ? facts.text : "",
    agent: request.agent,
    mode: request.mode,
    model,
    ...(typeof facts.effort === "string" && /^[a-z][a-z0-9_-]{0,31}$/.test(facts.effort) ? { reported_effort: facts.effort } : {}),
    // 제공자는 에이전트 종류의 고정표에서 정한다 — 에이전트가 보고한 값이 아니므로 출처는 table
    provider: resolveProvider(request.agent, facts.provider, reported),
    access: request.access,
    enforcement: meta.enforcement,
    session_id: str(facts.sessionId),
    stop_reason: str(facts.stopReason),
    is_error: facts.isError === true,
    duration_ms: Math.max(0, Math.round(meta.durationMs)),
    usage: { input_tokens: num(facts.inputTokens), output_tokens: num(facts.outputTokens) },
    ...(total === null ? {} : { usage_total_tokens: total }),
    raw_path: meta.rawPath ?? null,
    process_cleanup: meta.cleanup ?? "verified",
  };
}

export interface AgentAttempt {
  at: string;
  agent: AgentName;
  mode: Mode;
  requestedModel: string | undefined;
  requestedEffort: string | undefined;
  durationMs: number;
  reportedModel: string | null;
  reportedEffort: string | null;
  usage: AgentResult["usage"] | null;
  totalTokens: number | null;
  error: ErrorCode | null;
}
export type ObserveAttempt = (attempt: AgentAttempt) => void;

/** 요청 검사 → 능력 검사 → 실행. 읽기 전용을 강제할 수 없는 실행기는 거부한다. */
export async function runAgent(executor: Executor, input: RequestInput, hooks?: RunHooks, observe?: ObserveAttempt): Promise<AgentResult> {
  const request = validateRequest(input);
  if (request.agent !== executor.agent || request.mode !== executor.mode) {
    throw new AgentError("executor_unavailable", `${request.agent}/${request.mode} 실행기가 아니다`);
  }
  checkCapabilities(request, executor.capabilities);
  if (!observe) return executor.run(request, hooks);
  const at = new Date().toISOString(), started = performance.now();
  const { agent, mode, model: requestedModel, effort: requestedEffort } = request;
  const basis = { at, agent, mode, requestedModel, requestedEffort };
  const observedResult = (result: AgentResult) => observe({ ...basis, durationMs: result.duration_ms,
    reportedModel: result.model.source === "reported" ? result.model.value : null,
    reportedEffort: result.reported_effort ?? null, usage: result.usage, totalTokens: result.usage_total_tokens ?? null,
    error: result.is_error ? "agent_failed" : null });
  let result: AgentResult;
  let verified: AgentResult | undefined;
  try { result = await executor.run(request, hooks, (completed) => { verified = completed; }); }
  catch (error) {
    if (verified) observedResult(verified);
    else if (error instanceof AgentError && error.started) {
      observe({ ...basis, durationMs: Math.round(performance.now() - started), reportedModel: null, reportedEffort: null, usage: null, totalTokens: null, error: error.code });
    }
    throw error;
  }
  observedResult(result);
  return result;
}

/** 오류를 stdout JSON으로 낼 때의 형태 */
export function errorPayload(error: AgentError): { is_error: true; error: { code: ErrorCode; message: string } } {
  return { is_error: true, error: { code: error.code, message: error.message } };
}
