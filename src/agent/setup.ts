import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "../core/fsutil.ts";
import { type CommandRunner } from "../core/console-decode.ts";
import { claudeAcp } from "./acp-executor.ts";
import { ChainConfigError, parseChainConfig } from "./chain.ts";
import { type AgentName, type Mode } from "./contract.ts";

// 에이전트 설정 `pace agent setup` (P035 T06, BR06).
// 순서: 감지(읽기만) → 계획·확인 → 적용(로그인·어댑터 설치·체인 파일). 확인이 풀리지 않으면 적용 단계에 들어가지 않는다.
// 로그인은 공식 CLI에 맡긴다 — 토큰·자격증명 파일을 읽거나 복사하지 않는다(D8).

export const SETUP_AGENTS: readonly AgentName[] = ["claude", "codex"];
/** 읽기 전용 강제를 실측한 버전만 acp-executor가 인정하므로 이 버전으로 고정해 설치한다 */
export const CLAUDE_ADAPTER_PACKAGE = "@agentclientprotocol/claude-agent-acp@0.81.1";
const ADAPTER_COMMAND: Partial<Record<AgentName, string>> = { claude: "claude-agent-acp" };
const LOGIN_ARGS: Record<AgentName, string[]> = { claude: ["auth", "login"], codex: ["login"] };

export class SetupUsageError extends Error {}

export interface SetupOptions {
  /** 사용할 에이전트와 순서. 없으면 대화형은 묻고 비대화형은 설치된 에이전트를 claude→codex 순으로 쓴다 */
  agents?: string[];
  /** 기존 `default` 체인을 바꾸는 것을 허락한다 */
  yes?: boolean;
  /** 미로그인 CLI의 공식 로그인 실행을 허락한다 */
  login?: boolean;
  /** 어댑터 npm 설치를 허락한다 */
  installAdapters?: boolean;
}

export interface SetupDeps {
  runner: CommandRunner;
  platform: NodeJS.Platform;
  /** 터미널에서 질문할 수 있는가 */
  interactive: boolean;
  /** y/N 질문(기본 아니오). 비대화형에서는 부르지 않는다 */
  ask: (question: string) => Promise<boolean>;
  askLine: (question: string, fallback: string) => Promise<string>;
  out: (line: string) => void;
  /** 프로필의 agent-chains.json 위치. 프로필이 없으면 null */
  chainFile: string | null;
  /** `npm install -g`를 돌릴 명령. npm을 못 찾으면 null */
  npm: { command: string; args: string[] } | null;
}

export interface AgentStatus {
  agent: AgentName;
  installed: boolean;
  loggedIn: boolean;
  /** claude만 의미가 있다(codex는 -p로 쓴다) */
  adapterInstalled: boolean;
  /** 설치된 어댑터 버전(npm ls). 알 수 없으면 null */
  adapterVersion: string | null;
  /** 어댑터가 있고 읽기 전용 강제를 실측한 버전이다 — 아니면 ACP를 고르지 않는다 */
  adapterUsable: boolean;
  version: string | null;
}

export type SetupOutcome =
  | { code: 0; chainFile: string; steps: { agent: AgentName; mode: Mode }[]; changed: boolean }
  | { code: 2 | 3 | 4; reason: string };

/** 명령이 PATH에 있는지 — 실행하지 않고 위치만 묻는다(ACP 어댑터는 stdio 서버라 직접 실행하면 입력을 기다린다) */
export function commandExists(runner: CommandRunner, platform: NodeJS.Platform, name: string): boolean {
  const probe = platform === "win32" ? runner("where", [name]) : runner("/bin/sh", ["-c", `command -v ${name}`]);
  return probe.status === 0;
}

function loggedIn(runner: CommandRunner, agent: AgentName): boolean {
  // 확인하지 못한 것(실패·시간 초과·알 수 없는 출력)은 미로그인으로 본다 — 체인에 넣지 않는 쪽이 안전하다
  if (agent === "claude") {
    const r = runner("claude", ["auth", "status"], { timeoutMs: 20_000 });
    if (r.status !== 0) return false;
    try { return (JSON.parse(r.stdout) as { loggedIn?: unknown }).loggedIn === true; } catch { return false; }
  }
  return runner("codex", ["login", "status"], { timeoutMs: 20_000 }).status === 0;
}

/** 전역 npm에 설치된 claude 어댑터 버전. npm이 없거나 조회가 실패하면 null — 확인하지 못한 버전은 ACP로 쓰지 않는다 */
function installedAdapterVersion(deps: Pick<SetupDeps, "runner" | "npm">): string | null {
  if (!deps.npm) return null;
  const pkg = CLAUDE_ADAPTER_PACKAGE.slice(0, CLAUDE_ADAPTER_PACKAGE.lastIndexOf("@"));
  const r = deps.runner(deps.npm.command, [...deps.npm.args, "ls", "-g", "--depth=0", "--json", pkg], { timeoutMs: 30_000 });
  try { return (JSON.parse(r.stdout) as { dependencies?: Record<string, { version?: string }> }).dependencies?.[pkg]?.version ?? null; } catch { return null; }
}

/** 읽기만 한다 */
export function detectAgents(deps: Pick<SetupDeps, "runner" | "platform" | "npm">): AgentStatus[] {
  return SETUP_AGENTS.map((agent) => {
    const version = deps.runner(agent, ["--version"], { timeoutMs: 20_000 });
    const installed = version.status === 0;
    const adapter = ADAPTER_COMMAND[agent];
    const adapterInstalled = adapter !== undefined && commandExists(deps.runner, deps.platform, adapter);
    const adapterVersion = adapterInstalled && agent === "claude" ? installedAdapterVersion(deps) : null;
    return {
      agent,
      installed,
      loggedIn: installed && loggedIn(deps.runner, agent),
      adapterInstalled,
      adapterVersion,
      adapterUsable: adapterInstalled && adapterVersion !== null && claudeAcp.readOnlyVersions.includes(adapterVersion),
      version: installed ? version.stdout.trim().split(/\r?\n/)[0]?.slice(0, 60) ?? null : null,
    };
  });
}

export function describeStatuses(statuses: AgentStatus[]): string[] {
  return statuses.map((s) => {
    if (!s.installed) return `- ${s.agent}: CLI 없음`;
    const adapter = ADAPTER_COMMAND[s.agent] ? (!s.adapterInstalled ? " · ACP 어댑터 없음" : s.adapterUsable ? ` · ACP 어댑터 ${s.adapterVersion}` : ` · ACP 어댑터 있음(버전 ${s.adapterVersion ?? "확인 못 함"}은 읽기 전용 강제를 확인하지 못한 버전)`) : "";
    return `- ${s.agent}: ${s.version ?? "설치됨"} · ${s.loggedIn ? "로그인됨" : "로그인 안 됨"}${adapter}`;
  });
}

const stepsOf = (statuses: AgentStatus[], order: AgentName[]): { agent: AgentName; mode: Mode }[] =>
  order.flatMap((agent) => {
    const s = statuses.find((x) => x.agent === agent);
    if (!s || !s.installed || !s.loggedIn) return [];
    // claude는 읽기 전용 강제를 실측한 버전의 ACP 어댑터가 있으면 acp, 아니면 -p. codex는 ACP 읽기 전용 강제를 확인하지 못해 -p
    return [{ agent, mode: (agent === "claude" && s.adapterUsable ? "acp" : "p") as Mode }];
  });

interface ExistingChain { raw: Record<string, unknown>; defaultSteps: string | null; text: string }

/** 기존 체인 파일을 읽는다. 없으면 null, 깨졌거나 모양이 틀리면 이유를 돌려준다 */
function readExisting(file: string): ExistingChain | null | { error: string } {
  if (!existsSync(file)) return null;
  let raw: unknown;
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch (error) { return { error: `기존 체인 설정을 읽을 수 없다: ${(error as Error).message}` }; }
  if (text.charCodeAt(0) === 0xfeff) return { error: "기존 체인 설정이 UTF-8 BOM으로 저장돼 있어 읽을 수 없다(PowerShell 5.1의 저장 방식) — BOM 없는 UTF-8로 다시 저장한 뒤 실행한다" };
  try { raw = JSON.parse(text); } catch (error) { return { error: `기존 체인 설정을 읽을 수 없다(JSON 오류: ${(error as Error).message}) — 직접 고치거나 옮긴 뒤 다시 실행한다` }; }
  try { parseChainConfig(raw); } catch (error) { return { error: `기존 체인 설정이 올바르지 않다(${(error as ChainConfigError).message}) — 직접 고친 뒤 다시 실행한다` }; }
  const root = raw as Record<string, unknown>;
  const def = (root.chains as Record<string, { steps?: { agent: string; mode: string }[] }>).default;
  return { raw: root, defaultSteps: def ? JSON.stringify(def.steps?.map((s) => [s.agent, s.mode])) : null, text };
}

export async function runAgentSetup(deps: SetupDeps, options: SetupOptions = {}): Promise<SetupOutcome> {
  const { out } = deps;
  const fail = (code: 2 | 3 | 4, reason: string): SetupOutcome => { out(reason); return { code, reason }; };
  for (const name of options.agents ?? []) if (!(SETUP_AGENTS as readonly string[]).includes(name)) throw new SetupUsageError(`--agents는 ${SETUP_AGENTS.join(",")} 중에서 쉼표로 고른다: ${name}`);
  if (new Set(options.agents).size !== (options.agents ?? []).length) throw new SetupUsageError("--agents에 같은 에이전트가 두 번 있다");
  if (!deps.chainFile) return fail(2, "프로필이 없어 체인 설정을 둘 곳이 없다 — 먼저 `pace onboard`로 프로필을 만든다");

  // ── 1. 감지 (읽기만) ──
  let statuses = detectAgents(deps);
  out("이 기기의 에이전트:");
  for (const line of describeStatuses(statuses)) out(line);
  const installed = SETUP_AGENTS.filter((a) => statuses.find((s) => s.agent === a)?.installed);
  if (installed.length === 0) return fail(3, "claude·codex CLI가 모두 없다 — 공식 설치 뒤 다시 실행한다");

  // ── 2. 사용할 에이전트와 순서 ──
  let order: AgentName[];
  if (options.agents) order = options.agents as AgentName[];
  else if (deps.interactive) {
    const answer = (await deps.askLine(`사용할 에이전트를 순서대로 쉼표로 쓴다 (기본: ${installed.join(",")})`, installed.join(","))).trim();
    const picked = answer.split(",").map((x) => x.trim()).filter(Boolean);
    const bad = picked.filter((x) => !(SETUP_AGENTS as readonly string[]).includes(x));
    if (bad.length > 0 || picked.length === 0 || new Set(picked).size !== picked.length) return fail(2, `에이전트 선택이 올바르지 않다: ${answer}`);
    order = picked as AgentName[];
  } else order = [...installed];
  for (const a of order) if (!installed.includes(a)) out(`${a}: CLI가 없어 건너뛴다`);
  order = order.filter((a) => installed.includes(a));

  // ── 3. 계획과 확인 — 아직 아무것도 바꾸지 않는다 ──
  const existing = readExisting(deps.chainFile);
  if (existing && "error" in existing) return fail(3, existing.error);

  const loginTargets: AgentName[] = [];
  for (const a of order) {
    if (statuses.find((s) => s.agent === a)!.loggedIn) continue;
    const cmd = `${a} ${LOGIN_ARGS[a].join(" ")}`;
    if (options.login || (deps.interactive && await deps.ask(`${a}에 로그인돼 있지 않다. 공식 로그인(${cmd})을 지금 실행할까요?`))) loginTargets.push(a);
    else out(`${a}: 로그인하지 않아 체인에서 뺀다 (나중에 \`${cmd}\` 또는 이 명령을 \`--login\`으로 다시 실행)`);
  }
  const adapterTargets: AgentName[] = [];
  for (const a of order) {
    const s = statuses.find((x) => x.agent === a)!;
    if (!ADAPTER_COMMAND[a] || s.adapterUsable) continue;
    const why = s.adapterInstalled ? "설치된 어댑터가 읽기 전용 강제를 확인한 버전이 아니다" : "ACP 어댑터가 없다";
    if (options.installAdapters || (deps.interactive && await deps.ask(`${a}: ${why}. 고정 버전(${CLAUDE_ADAPTER_PACKAGE})을 npm으로 전역 설치할까요? (외부 패키지)`))) adapterTargets.push(a);
    else out(`${a}: ACP 어댑터 없이 -p 방식으로 쓴다 (${why} — 어댑터 설치는 \`--install-adapters\`)`);
  }

  // 로그인이 모두 성공한다고 가정한 체인으로 덮어쓰기 확인을 미리 받는다 — 확인이 풀리지 않으면 로그인·설치도 하지 않는다
  const tentative = stepsOf(statuses.map((s) => ({ ...s, loggedIn: s.loggedIn || loginTargets.includes(s.agent), adapterUsable: s.adapterUsable || adapterTargets.includes(s.agent) })), order);
  const tentativeKey = JSON.stringify(tentative.map((s) => [s.agent, s.mode]));
  if (tentative.length === 0) return fail(3, "체인에 넣을 수 있는 에이전트가 없다 — 로그인한 CLI가 필요하다. 아무것도 바꾸지 않았다");
  // 기존 default가 있고 이번 실행이 그것을 바꿀 수 있으면(결과가 달라지거나, 로그인·설치가 실패해 달라질 수 있으면) 부작용 전에 확인을 받는다.
  // 승인은 --yes(결과와 무관하게 바꿔도 된다) 또는 사용자가 본 그 체인 한 가지에 묶인다
  let approvedKey: string | null = null;
  const mayChange = existing?.defaultSteps && (existing.defaultSteps !== tentativeKey || loginTargets.length > 0 || adapterTargets.length > 0);
  if (mayChange && !options.yes) {
    const approved = deps.interactive && await deps.ask(`기존 \`default\` 체인(${existing!.defaultSteps})을 ${tentativeKey}로 바꿀까요? (원본은 .bak으로 남는다)`);
    if (!approved) return fail(4, "기존 `default` 체인이 있어 확인 없이는 바꾸지 않는다 — `--yes`를 붙이거나 터미널에서 실행한다. 로그인·설치·파일 변경은 하지 않았다");
    approvedKey = tentativeKey;
  }

  // ── 4. 적용 ──
  for (const a of loginTargets) {
    out(`${a} 공식 로그인을 시작한다 — 안내를 따른다`);
    const r = deps.runner(a, LOGIN_ARGS[a], { inherit: true, timeoutMs: 10 * 60_000 });
    if (r.status !== 0) out(`${a}: 로그인 명령이 실패했다(종료 ${r.status ?? "없음"})`);
  }
  if (adapterTargets.length > 0) {
    if (!deps.npm) out("npm을 찾지 못해 어댑터를 설치하지 못했다 — -p 방식으로 쓴다");
    else {
      out(`ACP 어댑터 설치: npm install -g ${CLAUDE_ADAPTER_PACKAGE}`);
      const r = deps.runner(deps.npm.command, [...deps.npm.args, "install", "-g", CLAUDE_ADAPTER_PACKAGE], { timeoutMs: 5 * 60_000 });
      if (r.status !== 0) out(`어댑터 설치가 실패했다 — -p 방식으로 쓴다: ${(r.stderr || r.stdout).replace(/\s+/g, " ").trim().slice(0, 200)}`);
    }
  }
  if (loginTargets.length > 0 || adapterTargets.length > 0) statuses = detectAgents(deps);
  for (const a of loginTargets) if (!statuses.find((s) => s.agent === a)!.loggedIn) out(`${a}: 로그인을 확인하지 못해 체인에서 뺀다`);

  const steps = stepsOf(statuses, order);
  if (steps.length === 0) return fail(3, "체인에 넣을 수 있는 에이전트가 남지 않았다 — 체인 파일은 바꾸지 않았다");
  const key = JSON.stringify(steps.map((s) => [s.agent, s.mode]));
  if (existing?.defaultSteps === key) {
    out(`\`default\` 체인이 이미 같다(${key}) — 바꾸지 않았다`);
    return { code: 0, chainFile: deps.chainFile, steps, changed: false };
  }
  if (existing?.defaultSteps && !options.yes && approvedKey !== key) {
    // 로그인·설치 결과로 체인이 승인한 것과 달라졌다 — 바꾸는 확인을 다시 받는다(체인 파일은 아직 그대로)
    const again = deps.interactive && await deps.ask(`결과로 체인이 ${key}가 된다(승인한 것: ${approvedKey ?? "없음"}). 기존 default(${existing.defaultSteps})를 바꿀까요?`);
    if (!again) return fail(4, "결과가 승인한 것과 달라져 기존 `default` 체인을 바꾸는 확인이 풀리지 않았다 — 체인 파일은 바꾸지 않았다");
  }
  // 질문·로그인·설치를 기다리는 사이 다른 프로세스가 파일을 바꿨거나 만들었으면 덮어쓰지 않는다(확인한 원본과 같을 때만 쓴다)
  const current = existsSync(deps.chainFile) ? readFileSync(deps.chainFile, "utf8") : null;
  if (current !== (existing?.text ?? null)) return fail(3, "설정하는 동안 체인 설정 파일이 바뀌었다 — 아무것도 덮어쓰지 않았다. 다시 실행한다");
  const next: Record<string, unknown> = existing ? { ...existing.raw } : {};
  const chains = { ...((existing?.raw.chains as Record<string, unknown> | undefined) ?? {}) };
  const previousDefault = chains.default as Record<string, unknown> | undefined;
  chains.default = { ...(previousDefault ?? {}), steps };
  next.chains = chains;
  try { parseChainConfig(next); } catch (error) { return fail(3, `만든 체인이 올바르지 않아 쓰지 않는다: ${(error as Error).message}`); }
  if (existing) copyFileSync(deps.chainFile, existsSync(`${deps.chainFile}.bak`) ? `${deps.chainFile}.bak.${Date.now()}` : `${deps.chainFile}.bak`); // 이전 백업은 지우지 않는다
  writeFileAtomic(deps.chainFile, `${JSON.stringify(next, null, 2)}\n`);
  out(`\`default\` 체인을 ${existing?.defaultSteps ? "바꿨다" : existing ? "추가했다" : "만들었다"}: ${steps.map((s) => `${s.agent}/${s.mode}`).join(" → ")} (${deps.chainFile})`);
  return { code: 0, chainFile: deps.chainFile, steps, changed: true };
}
