import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { paceHome } from "../core/paths.ts";
import { lockKeyOf } from "./core.ts";
import { gatewayTokenFile } from "./gateway.ts";
import { runDaemon } from "./index.ts";
import { defaultDataHome, type AutostartEnv } from "./autostart.ts";
import { runDaemonInstall, startDaemon } from "./install-wizard.ts";
import { makeRedactor } from "./secrets.ts";
import { TelegramApi } from "./telegram/api.ts";
import { runCommand, type CommandRunner } from "../core/console-decode.ts";
import { askLine, askYesNo, isInteractive, readSecretLine } from "../core/prompt.ts";
import { runAgentSetup, SETUP_AGENTS, SetupUsageError, type SetupDeps, type SetupOptions } from "../agent/setup.ts";
import { profileChainFile, terminalSetupDeps } from "../agent/setup-cli.ts";
import { acquireInstance, activeInstancePort, InstanceBusyError, listenerPid, readLockInfo, readLogTail, readStatus, requestStop } from "./instance.ts";
import { StateError, StateStore } from "./store.ts";
import { readTelegramSecret, telegramStateFile, writeTelegramSecret } from "./telegram/index.ts";
import { emptyTelegramState, loadTelegramState, saveTelegramState } from "./telegram/state.ts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { daemonWorkspaceCommand, WORKSPACE_USAGE } from "./workspace-cli.ts";
import { WorkspaceError } from "./workspace.ts";

// `pace daemon …` — run · status · stop [--force] · logs · release · install · uninstall

export class DaemonUsageError extends Error {}

function probe(port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => { socket.destroy(); resolveProbe(ok); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DaemonCliDeps {
  /** launchd plist에 넣을 PATH(시험 주입, 기본은 현재 PATH) */
  path?: string;
  /** 외부 명령 실행자(reg·launchctl·로그인 등) — 시험은 가짜를 넣는다 */
  runner?: CommandRunner;
  /** 터미널에서 질문할 수 있는지(시험 주입) */
  interactive?: boolean;
  ask?: (question: string) => Promise<boolean>;
  askLine?: (question: string, fallback: string) => Promise<string>;
  readSecret?: (question: string) => Promise<string>;
  /** 체인 설정 위치(시험 주입). 없으면 프로필에서 찾는다 */
  chainFile?: string | null;
  setupDeps?: Partial<SetupDeps>;
  launchAgentsDir?: string;
  out?: (line: string) => void;
  nodePath?: string;
  binPath?: string;
  platform?: NodeJS.Platform;
  readStdin?: () => Promise<string>;
  /** daemon 응답 여부(시험 주입) — 없으면 인스턴스 포트를 조사한다 */
  isRunning?: () => Promise<boolean>;
  /** Bot API 호출에 쓸 fetch(시험은 가짜) */
  telegramFetch?: typeof fetch;
  cwd?: string;
  hostName?: string;
  pollMs?: number;
  pollTries?: number;
}

export async function daemonCommand(args: string[], deps: DaemonCliDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => { process.stdout.write(`${line}\n`); });
  const [sub, ...rest] = args;
  const home = paceHome();
  const usage = "pace daemon run|start|status|stop [--force]|logs [-n N]|release <경로>|install [--yes] [--start] [--agents claude,codex] [--login] [--install-adapters]|uninstall [--yes]|telegram init --chat-id <id> [--api-base <url>]|telegram reset-offset --yes";
  const runningProbe = deps.isRunning ?? (() => probe(activeInstancePort(home)));
  const autostartEnv = (): AutostartEnv => ({ platform: deps.platform ?? process.platform, runner: deps.runner ?? runCommand, home, defaultHome: defaultDataHome(), nodePath: deps.nodePath ?? process.execPath, binPath: deps.binPath ?? fileURLToPath(new URL("../../bin/pace.ts", import.meta.url)), launchAgentsDir: deps.launchAgentsDir, path: "path" in deps ? deps.path : process.env.PATH });
  switch (sub) {
    case "run":
      if (rest.length > 0) throw new DaemonUsageError(usage);
      return runDaemon({ home });
    case "workspace":
      try {
        return await daemonWorkspaceCommand(rest, { home, cwd: deps.cwd ?? process.cwd(), out, interactive: deps.interactive ?? isInteractive(), ask: deps.ask ?? askYesNo, telegramFetch: deps.telegramFetch });
      } catch (error) {
        if (error instanceof WorkspaceError) throw new DaemonUsageError(error.message);
        throw error;
      }
    case "start": {
      if (rest.length > 0) throw new DaemonUsageError(usage);
      return startDaemon({ env: autostartEnv(), out, isRunning: runningProbe, pollMs: deps.pollMs, pollTries: deps.pollTries });
    }
    case "status": {
      const port = activeInstancePort(home);
      const running = await probe(port);
      const status = readStatus(home);
      const lock = readLockInfo(home);
      out(JSON.stringify({ running, instance_port: port, pid: running ? lock?.pid ?? null : null, status: running ? status : null, last_status: running ? undefined : status ? { state: status.state, heartbeat: status.heartbeat } : null }, null, 2));
      return running ? 0 : 3;
    }
    case "stop": {
      const { values } = parseArgs({ args: rest, options: { force: { type: "boolean" } }, strict: true });
      const port = activeInstancePort(home);
      if (!(await probe(port))) { out("실행 중인 daemon이 없다"); return 0; }
      requestStop(home);
      for (let i = 0; i < 60; i++) { if (!(await probe(port))) { out("daemon이 정지했다"); return 0; } await sleep(500); }
      if (!values.force) { out("30초 안에 정지하지 않았다(실행 중 작업을 기다리는 중일 수 있다). 강제로 끄려면 --force"); return 4; }
      // 표시용 pid를 믿지 않는다 — 포트의 실제 listener를 OS 도구로 조회해 정보 파일의 pid와 같을 때만 종료한다
      const lock = readLockInfo(home);
      const actual = listenerPid(port);
      if (actual === null || !lock || lock.pid !== actual) { out(`강제 종료를 거부한다: 포트 ${port}의 소유 프로세스를 확인하지 못했거나 정보 파일의 pid와 다르다. 직접 확인한다`); return 5; }
      process.kill(actual, "SIGKILL");
      out(`pid ${actual}를 강제 종료했다 — 쓰기 작업은 다음 기동에서 확인 필요로 표시된다`);
      return 0;
    }
    case "logs": {
      const { values } = parseArgs({ args: rest, options: { n: { type: "string", short: "n" } }, strict: true });
      const n = values.n === undefined ? 50 : Number(values.n);
      if (!Number.isInteger(n) || n < 1 || n > 1000) throw new DaemonUsageError("-n은 1~1000");
      out(readLogTail(home, n) || "로그 없음");
      return 0;
    }
    case "release": {
      if (rest.length !== 1) throw new DaemonUsageError("pace daemon release <격리된 워크트리 경로> — 남은 프로세스를 직접 확인한 뒤에만 쓴다");
      const path = resolve(rest[0]!);
      const port = activeInstancePort(home);
      // 꺼져 있는지 확인과 상태 수정을 같은 소유 구간으로 묶는다 — 인스턴스 포트를 잡은 채로만 상태 파일을 고친다
      let instance;
      try { instance = await acquireInstance(home); }
      catch (error) { if (error instanceof InstanceBusyError) return releaseViaGateway(home, path, out); throw error; }
      try {
        const store = StateStore.open(home);
        const key = lockKeyOf(path);
        if (!store.state.quarantine[key]) { out("그 경로는 격리 상태가 아니다"); return 1; }
        delete store.state.quarantine[key];
        store.save();
        out("격리를 해제했다");
        return 0;
      } catch (error) {
        if (error instanceof StateError) { out(error.message); return 2; }
        throw error;
      } finally { await instance.release(); }
    }
    case "telegram": {
      const [action, ...targs] = rest;
      if (action === "init") {
        // 음수 chat id(-100…)는 옵션으로 오해되므로 `--chat-id <값>`을 `--chat-id=<값>`으로 바꿔 파싱한다
        const norm = targs.flatMap((x, i, arr) => (arr[i - 1] === "--chat-id" ? [] : x === "--chat-id" && arr[i + 1] !== undefined ? [`--chat-id=${arr[i + 1]}`] : [x]));
        const { values } = parseArgs({ args: norm, options: { "chat-id": { type: "string" }, "api-base": { type: "string" } }, strict: true });
        if (!values["chat-id"] || !/^-?\d+$/.test(values["chat-id"])) throw new DaemonUsageError("--chat-id <포럼 그룹 chat id(숫자)>가 필요하다");
        if (values["api-base"] !== undefined && !/^https?:\/\//.test(values["api-base"])) throw new DaemonUsageError("--api-base는 http(s) URL");
        // 토큰은 인자·기록에 남기지 않도록 표준 입력 한 줄로만 받는다
        const token = (deps.readStdin ? await deps.readStdin() : readFileSync(0, "utf8")).split(/\r?\n/)[0]?.trim() ?? "";
        if (!/^[0-9]{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new DaemonUsageError("표준 입력 첫 줄에 봇 토큰(형식 123456:ABC…)이 필요하다");
        let prev = null;
        try { prev = readTelegramSecret(home); } catch { /* 덮어쓴다 */ }
        writeTelegramSecret(home, { token, chatId: values["chat-id"], apiBase: values["api-base"], initializedAt: prev?.initializedAt });
        out("Telegram 시크릿을 저장했다(토큰은 표시하지 않는다). 허용 사용자는 config.json의 allowedUsers.telegram에 넣는다");
        return 0;
      }
      if (action === "reset-offset") {
        const { values } = parseArgs({ args: targs, options: { yes: { type: "boolean" } }, strict: true });
        if (!values.yes) { out("offset을 0으로 초기화하면 오래된 update가 다시 올 수 있다(재전달 중복은 코어 수신 기록 범위까지만 막는다). 확인했으면 --yes"); return 0; }
        let owner;
        try { owner = await acquireInstance(home); }
        catch (error) {
          if (error instanceof InstanceBusyError) throw new DaemonUsageError("daemon을 정지한 뒤 offset을 초기화한다");
          throw error;
        }
        try {
          let prev = null;
          try { prev = loadTelegramState(telegramStateFile(home)); } catch { /* 손상 — 토픽 표는 잃는다(/bind로 다시 결속) */ }
          const next = { ...emptyTelegramState(), topics: prev?.topics ?? {}, provisioning: prev?.provisioning ?? {}, held: prev?.held ?? [] };
          saveTelegramState(telegramStateFile(home), next);
        } finally { await owner.release(); }
        out("offset을 초기화했다");
        return 0;
      }
      throw new DaemonUsageError(usage);
    }
    case "install":
    case "uninstall": {
      const { values } = parseArgs({ args: rest, options: { yes: { type: "boolean" }, agents: { type: "string" }, login: { type: "boolean" }, "install-adapters": { type: "boolean" }, start: { type: "boolean" } }, strict: true });
      if (values.start && sub === "uninstall") throw new DaemonUsageError("--start는 install에서만 쓴다");
      const agents = values.agents?.split(",").map((x) => x.trim()).filter(Boolean);
      for (const name of agents ?? []) if (!(SETUP_AGENTS as readonly string[]).includes(name)) throw new DaemonUsageError(`--agents는 ${SETUP_AGENTS.join(",")} 중에서 쉼표로 고른다: ${name}`);
      const env = autostartEnv();
      const interactive = deps.interactive ?? isInteractive();
      const ask = deps.ask ?? askYesNo;
      const chainFile = deps.chainFile !== undefined ? deps.chainFile : profileChainFile(home);
      const setupDeps = terminalSetupDeps(out, { runner: env.runner, platform: env.platform, interactive, ask, askLine: deps.askLine ?? askLine, chainFile, ...deps.setupDeps });
      const runSetup = async (options: SetupOptions) => { try { return await runAgentSetup(setupDeps, options); } catch (error) { if (error instanceof SetupUsageError) throw new DaemonUsageError(error.message); throw error; } };
      return runDaemonInstall({ env, out, interactive, ask, askLine: deps.askLine ?? askLine, readSecret: deps.readSecret ?? readSecretLine, chainFile, runSetup, isRunning: runningProbe,
        makeTelegramApi: (token) => new TelegramApi({ token, redact: makeRedactor([token]), fetchImpl: deps.telegramFetch }), cwd: deps.cwd ?? process.cwd(), hostName: deps.hostName, pollMs: deps.pollMs, pollTries: deps.pollTries },
        { yes: values.yes, uninstall: sub === "uninstall", agents, login: values.login, installAdapters: values["install-adapters"], start: values.start });
    }
    default:
      throw new DaemonUsageError(`${usage}\n${WORKSPACE_USAGE}`);
  }
}

/** daemon이 떠 있으면 Gateway로 격리 해제를 요청한다(상태 파일을 두 프로세스가 쓰지 않도록) */
async function releaseViaGateway(home: string, path: string, out: (line: string) => void): Promise<number> {
  const status = readStatus(home);
  const tokenFile = gatewayTokenFile(home);
  if (!status || !existsSync(tokenFile)) { out("daemon의 Gateway 정보를 찾지 못했다"); return 2; }
  const token = readFileSync(tokenFile, "utf8").trim();
  return new Promise<number>((resolveRelease) => {
    const ws = new WebSocket(`ws://127.0.0.1:${status.gatewayPort}`);
    const timer = setTimeout(() => { out("daemon 응답 시간 초과"); ws.close(); resolveRelease(2); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as { type: string; result?: { ok?: boolean } };
      if (msg.type === "ready") ws.send(JSON.stringify({ type: "release", path, id: "r" }));
      else if (msg.type === "ack") { clearTimeout(timer); out(msg.result?.ok ? "격리를 해제했다" : "그 경로는 격리 상태가 아니다"); ws.close(); resolveRelease(msg.result?.ok ? 0 : 1); }
    };
    ws.onerror = () => { clearTimeout(timer); out("Gateway에 연결하지 못했다"); resolveRelease(2); };
  });
}
