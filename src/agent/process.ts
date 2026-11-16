import { spawn } from "node:child_process";
import { AgentError } from "./contract.ts";
import { ProcessGroup } from "./proc-group.ts";
import { startWindowsJob } from "./windows-job.ts";

export const CHILD_ENV_FLAG = "PACE_AGENT_CHILD";
const OUTPUT_CAP = 16 * 1024 * 1024;

/** 자식에게 넘기는 환경변수 허용 목록 — 비밀·부모 세션 변수는 넘기지 않는다. */
const ENV_COMMON = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "TMPDIR", "TMP", "TEMP",
  "SYSTEMROOT", "COMSPEC", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "PACE_HOME", "PACE_PROFILE",
]);
/** 대상 에이전트별 인증 환경 — 다른 제공자의 자격 증명은 넘기지 않는다 */
const ENV_BY_AGENT: Record<string, string[]> = {
  claude: ["ANTHROPIC_API_KEY", "CLAUDE_CONFIG_DIR"],
  codex: ["OPENAI_API_KEY", "CODEX_HOME"],
};

export function buildChildEnv(parent: NodeJS.ProcessEnv, agent?: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  const allow = new Set([...ENV_COMMON, ...(agent ? (ENV_BY_AGENT[agent] ?? []) : [])]);
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && allow.has(key.toUpperCase())) env[key] = value;
  }
  return { ...env, ...extra, [CHILD_ENV_FLAG]: "1" };
}

export interface ProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  /** stdin으로 넘길 프롬프트(argv에는 넣지 않는다) */
  input: string;
  timeoutMs: number;
  graceMs?: number;
  /** 무출력 기한(ms): stdout·stderr에 아무 것도 오지 않은 채 이 시간이 지나면 멈춘 것으로 보고 회수한다 */
  idleMs?: number;
  /** abort되면 만료와 같은 경로로 그룹을 회수한다(결과의 cancelled가 true) */
  signal?: AbortSignal;
}

export interface ProcessOutcome {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  timedOut: boolean;
  /** timedOut 중 무출력 기한 때문인 경우 */
  idle: boolean;
  /** signal로 취소됐다 */
  cancelled: boolean;
  /** 프로세스 그룹이 모두 사라졌음을 확인했는가 */
  reaped: boolean;
  /** 회수 보증 수준 — Windows는 수명 전체를 보장하지 못해 best-effort-unverified */
  cleanup: "verified" | "best-effort-unverified";
  durationMs: number;
}

// 호출 프로세스가 강제 종료돼도 자식 그룹을 회수하는 독립 감시 프로세스(POSIX). 자기 그룹으로 떨어져 부모와 운명을 같이하지 않는다.
const REAPER_SCRIPT = `
const [parent, group, deadline, grace] = process.argv.slice(1).map(Number);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const groupAlive = () => { try { process.kill(-group, 0); return true; } catch (e) { return e.code === "EPERM"; } };
const kill = async () => { try { process.kill(-group, "SIGTERM"); } catch {} await new Promise((r) => setTimeout(r, grace)); try { process.kill(-group, "SIGKILL"); } catch {} process.exit(0); };
setInterval(() => {
  if (!groupAlive()) process.exit(0);
  if (!alive(parent) || Date.now() > deadline + grace * 2) kill();
}, 250);
`;

/** 감시자를 띄운다. 최소 환경(빈 env)으로 실행하고, 시작에 실패하면 onFail을 부른다(호출자가 자식을 회수하고 중단한다). */
/** 시작한 감시 프로세스 수(회귀 테스트용 계측) */
export const reaperStats = { started: 0 };

export function startReaper(groupPid: number, deadlineAt: number, graceMs: number, onFail: (reason: string) => void = () => {}): { stop: () => void } {
  if (process.platform === "win32") return { stop() {} };
  let reaper;
  try {
    reaper = spawn(process.execPath, ["-e", REAPER_SCRIPT, String(process.pid), String(groupPid), String(deadlineAt), String(graceMs)], { detached: true, stdio: "ignore", env: {} });
  } catch (error) {
    onFail((error as Error).message);
    return { stop() {} };
  }
  reaperStats.started++;
  reaper.on("error", (error) => onFail(error.message));
  if (!reaper.pid) onFail("감시 프로세스 pid가 없다");
  reaper.unref();
  return {
    stop() {
      try {
        if (reaper.pid) process.kill(reaper.pid, "SIGTERM");
      } catch {
        /* 이미 종료 */
      }
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 남은 자손을 정리하고 최종 확인한다. */
export async function reapGroup(group: Pick<ProcessGroup, "verifyGone" | "alive" | "signal" | "stopTracking">): Promise<boolean> {
  let gone = await group.verifyGone();
  if (!gone) {
    if (await group.alive()) {
      await group.signal("SIGKILL");
      for (let i = 0; i < 20 && (await group.alive()); i++) await sleep(50);
    }
    gone = await group.verifyGone();
  }
  group.stopTracking();
  return gone;
}

/** 새 프로세스 그룹으로 실행하고, 독립 watchdog이 만료되면 TERM → KILL로 그룹 전체를 회수한다. */
export async function runProcess(options: ProcessOptions): Promise<ProcessOutcome> {
  const started = Date.now();
  const graceMs = options.graceMs ?? 3000;
  const winJob = process.platform === "win32" ? await startWindowsJob(options.command, options.args, options.cwd, options.env, options.timeoutMs + graceMs * 2) : null;
  const child = winJob?.child ?? spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  let idleTimer: NodeJS.Timeout | undefined;
  let idleHit = false;
  const bump = () => {
    if (!options.idleMs) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleHit = true;
      expire();
    }, options.idleMs);
  };
  const collect = (kind: "out" | "err") => (chunk: Buffer) => {
    bump();
    if (kind === "out" && stdout.length < OUTPUT_CAP) stdout += chunk.toString("utf8");
    if (kind === "err" && stderr.length < OUTPUT_CAP) stderr += chunk.toString("utf8");
  };
  child.stdout.on("data", collect("out"));
  child.stderr.on("data", collect("err"));
  child.stdin.on("error", () => {});
  child.stdin.end(options.input);

  const closed = new Promise<{ code: number | null; signal: string | null; error?: Error }>((resolve) => {
    child.on("error", (error) => resolve({ code: null, signal: null, error }));
    child.on("close", (code, signal) => resolve({ code, signal }));
  });

  let timedOut = false;
  let killFailed = false;
  const pid = child.pid;
  const group = winJob ?? (pid ? new ProcessGroup(pid) : null);
  if (!winJob) (group as ProcessGroup | null)?.startTracking();
  let reaperFailed: string | null = null;
  const reaper = pid
    ? startReaper(pid, Date.now() + options.timeoutMs, graceMs, (reason) => {
        // 감시자 없이 자식을 두지 않는다 — 회수하고 실패로 처리
        reaperFailed = reason;
        void group?.signal("SIGKILL");
      })
    : { stop() {} };
  const expire = () => {
    timedOut = true;
    if (group) {
      void group.signal("SIGTERM").then((ok) => {
        if (!ok) killFailed = true;
      });
      setTimeout(() => {
        void group.signal("SIGKILL").then((ok) => {
          if (!ok) killFailed = true;
        });
      }, graceMs).unref();
    }
  };
  const watchdog = setTimeout(expire, options.timeoutMs);
  let cancelled = false;
  const onAbort = () => { cancelled = true; expire(); };
  if (options.signal) { if (options.signal.aborted) onAbort(); else options.signal.addEventListener("abort", onAbort, { once: true }); }
  bump();

  const end = await closed;
  clearTimeout(watchdog);
  options.signal?.removeEventListener("abort", onAbort);
  if (idleTimer) clearTimeout(idleTimer);
  if (reaperFailed) {
    reaper.stop();
    throw new AgentError("agent_failed", `독립 감시 프로세스를 시작하지 못해 자식을 회수했다: ${reaperFailed}`);
  }
  if (end.error) {
    reaper.stop();
    throw end.error;
  }

  // 종료 확인: 남은 자손이 있으면 KILL하고 사라질 때까지 잠시 기다린다. 확인하지 못하면 회수됨으로 보고하지 않는다.
  let reaped = !killFailed;
  if (group) {
    const gone = await reapGroup(group);
    reaped = reaped && gone;
  }
  reaper.stop();
  return { stdout, stderr, code: end.code, signal: end.signal, timedOut, cancelled, idle: idleHit, reaped, durationMs: Date.now() - started, cleanup: group ? group.cleanup : "verified" };
}
