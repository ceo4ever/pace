import { randomBytes } from "node:crypto";
import { loadConfig, DaemonConfigError, type DaemonConfig } from "./config.ts";
import { Daemon, type DaemonOptions } from "./core.ts";
import { ensureGatewayToken, Gateway } from "./gateway.ts";
import { acquireInstance, clearStopRequest, InstanceBusyError, makeLogger, removeLockInfo, stopRequested, writeLockInfo, writeStatus } from "./instance.ts";
import { createChainRunner } from "./runner.ts";
import { StateError, StateStore } from "./store.ts";
import { createTelegramAdapter, makeTelegramRedactor, promoteStoredLegacyBinding, readTelegramSecret, type TelegramAdapter, type TelegramSecret } from "./telegram/index.ts";
import { forumProof, topicIsBound } from "./telegram/provisioning.ts";
import { workspaceLinkStatus } from "./workspace.ts";
import type { ChannelAdapter, Runner, Task } from "./types.ts";

// `pace daemon run` 본체 — 인스턴스 포트 → 설정·상태 → 코어 → Gateway. 정지 요청 파일·시그널을 받으면 drain으로 끝난다.

export interface RunDaemonOptions {
  home: string;
  runner?: Runner;
  adapters?: ChannelAdapter[];
  config?: DaemonConfig;
  reap?: DaemonOptions["reap"];
  /** 시험용: 시그널 핸들러를 달지 않는다 */
  noSignals?: boolean;
  /** 시험용 코어 옵션 덮어쓰기 */
  coreExtra?: Partial<DaemonOptions>;
  out?: (line: string) => void;
}

/** 이전 기동에서 남은 실행의 회수 확인 — 저장된 pid가 모두 사라졌다고 입증될 때만 confirmed. 식별 정보가 없거나 Windows면 증명할 수 없어 unconfirmed */
export async function defaultReap(task: Task): Promise<"confirmed" | "unconfirmed"> {
  if (task.procs.length === 0) return "unconfirmed";
  if (process.platform === "win32") return "unconfirmed"; // Job Object 회수는 best-effort-unverified — 자손 소멸을 입증하지 못한다
  for (const p of task.procs) {
    for (const target of [p.pid, -p.pid]) {
      try { process.kill(target, 0); return "unconfirmed"; } catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return "unconfirmed"; }
    }
  }
  return "confirmed";
}

export async function runDaemon(o: RunDaemonOptions): Promise<number> {
  const out = o.out ?? ((line: string) => { process.stderr.write(`${line}\n`); });
  const home = o.home;
  let instance;
  try { instance = await acquireInstance(home); }
  catch (error) {
    if (error instanceof InstanceBusyError) { out(`pace: ${error.message}`); return 2; }
    throw error;
  }
  const bootId = randomBytes(8).toString("hex");
  const log = makeLogger(home);
  let gateway: Gateway | null = null;
  let daemon: Daemon | null = null;
  let telegram: TelegramAdapter | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let poll: NodeJS.Timeout | null = null;
  const startedAt = Date.now();
  try {
    let config: DaemonConfig;
    let store: StateStore;
    try { config = o.config ?? loadConfig(home); store = StateStore.open(home); }
    catch (error) {
      if (error instanceof DaemonConfigError || error instanceof StateError) { out(`pace: ${error.message}`); await instance.release(); return 2; }
      throw error;
    }
    // Telegram 시크릿 — 비밀 제거기는 기동 복구보다 먼저 만들어 코어·저장소·런너·어댑터에 같은 인스턴스로 주입한다
    let secret: TelegramSecret | null = null;
    try { secret = readTelegramSecret(home); } catch (error) { out(`pace: Telegram 시크릿을 쓰지 않는다 — ${(error as Error).message}`); }
    const redact = makeTelegramRedactor(secret);
    writeLockInfo(home, { pid: process.pid, startedAt, bootId, port: instance.port });
    clearStopRequest(home); // 이전 기동의 정지 요청이 남아 있어도 이번 기동을 멈추지 않는다
    daemon = new Daemon({ home, config, store, runner: o.runner ?? createChainRunner({ home, redact }), bootId, redact, reap: o.reap ?? defaultReap, log, ...o.coreExtra });
    for (const entry of config.workspaces) {
      if (!entry.registryId) continue;
      const link = workspaceLinkStatus(home, entry);
      if (link !== "활성 등록") out(`워크스페이스 ${entry.name} 제외 — ${link}`);
    }
    await daemon.start();
    gateway = new Gateway({
      daemon, token: ensureGatewayToken(home), port: config.gateway.port, log,
      workspaceAdd: async (request, forum) => {
        const entry = await daemon!.registerWorkspace(request, (legacy) => {
          if (telegram) telegram.promoteLegacyWorkspace(legacy.name, request.registryId);
          else promoteStoredLegacyBinding(home, legacy.name, request.registryId);
        });
        const bound = telegram?.isWorkspaceBound(entry) ?? false;
        if (forum === undefined) return { bound };
        if (!telegram || telegram.status !== "running" || !secret) return { bound, topic: "unavailable" };
        let current: TelegramSecret | null = null;
        try { current = readTelegramSecret(home); } catch { /* 확인되지 않은 포럼에는 생성하지 않는다 */ }
        if (!current || forum !== forumProof(secret) || forum !== forumProof(current)) {
          return { bound, topic: "unconfirmed-forum" };
        }
        const topic = await telegram.ensureWorkspaceTopic(entry, true);
        return { bound: topicIsBound(topic), topic };
      },
    });
    await gateway.listen();
    await daemon.addAdapter(gateway.adapter);
    for (const adapter of o.adapters ?? []) await daemon.addAdapter(adapter);
    if (secret) {
      try {
        const adapter = createTelegramAdapter({ daemon, home, config, secret, redact, log });
        await daemon.addAdapter(adapter);
        telegram = adapter;
        log("telegram_started", {});
        out("Telegram 어댑터 시작");
      }
      catch (error) { log("telegram_start_failed", { error: redact(String((error as Error).message)).slice(0, 300) }); out(`pace: Telegram 어댑터를 시작하지 못했다 — ${redact(String((error as Error).message)).slice(0, 300)}`); }
    }
    const status = (state: "running" | "stopping" | "stopped") => {
      const c = daemon!.counts();
      try { writeStatus(home, { pid: process.pid, bootId, startedAt, heartbeat: Date.now(), device: config.device, gatewayPort: gateway!.port, running: c.running, queued: c.queued, quarantined: c.quarantined, state }); } catch { /* 표시용 */ }
    };
    status("running");
    heartbeat = setInterval(() => status(daemon!.isStopping ? "stopping" : "running"), 5000);
    heartbeat.unref();
    log("started", { bootId, pid: process.pid, gateway: gateway.port });
    out(`pace daemon 시작 — 기기 ${config.device} · Gateway 127.0.0.1:${gateway.port}`);

    await new Promise<void>((resolve) => {
      let done = false;
      const finish = (why: string) => { if (done) return; done = true; log("stop_requested", { why }); resolve(); };
      poll = setInterval(() => { if (stopRequested(home)) finish("file"); }, 1000);
      if (!o.noSignals) {
        process.once("SIGINT", () => finish("SIGINT"));
        process.once("SIGTERM", () => finish("SIGTERM"));
      }
    });
    status("stopping");
    await daemon.stop({ drain: true });
    status("stopped");
    return 0;
  } finally {
    if (poll) clearInterval(poll);
    if (heartbeat) clearInterval(heartbeat);
    try { await gateway?.close(); } catch { /* 종료 중 */ }
    clearStopRequest(home);
    removeLockInfo(home, bootId);
    await instance.release();
  }
}
