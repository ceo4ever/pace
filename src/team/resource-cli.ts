import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { hasSecret } from "../project/secrets.ts";
import { ResourceLock, type Confirmation, type LockResult } from "./resource-lock.ts";
import { projectResourceSink } from "./handoff-resources.ts";
import { processIdentity, observeProcess, type ProcessIdentity } from "./resource-process.ts";
import { loadTeamMember, safeTeamPath, teamRoot } from "./store.ts";
import { safeResourceText } from "./resources.ts";

const usage = "pace team lock <자원> --by <구성원|P###> [-- <명령> ...] | unlock <자원> --token <획득토큰> [--confirmed-by coordinator|captain --evidence <근거>] | status <자원>";
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const out = (data: unknown) => process.stdout.write(JSON.stringify(data) + "\n");

/** Only the live wrapper may signal the bridge identity it created in memory. */
function signalChild(child: ChildProcess, identity: ProcessIdentity | null, signal: NodeJS.Signals): boolean {
  if (!child.pid || child.pid <= 1 || !identity || identity.pid !== child.pid || observeProcess(identity) !== "alive" || process.platform === "win32") return false;
  try { process.kill(-child.pid, signal); return true; } catch { return false; }
}
export async function retryResourceGuard(operation: () => LockResult, timeoutMs = 10000): Promise<LockResult> {
  const deadline = Date.now() + timeoutMs;
  let result = operation();
  while (result.guardBusy && Date.now() < deadline) { await pause(50); result = operation(); }
  return result;
}

export async function runResourceCommand(lock: ResourceLock, by: string, argv: string[], heartbeatMs = 5000): Promise<number> {
  if (argv.length && process.platform === "win32") {
    out({ outcome: "hold", reason: "Windows 자식 그룹 전체 종료 확인이 지원되지 않아 명령 실행 보류", participation: "참여 호출만 보호" });
    return 2;
  }
  const acquired = await retryResourceGuard(() => lock.acquire(by, argv.length ? "command" : "manual")); out(acquired);
  if (acquired.code !== 0 || !acquired.lease) return acquired.code;
  const acquisitionId = acquired.lease.acquisitionId;
  let child: ChildProcess | null = null, childIdentity: ProcessIdentity | null = null;
  let interrupted: NodeJS.Signals | null = null, renewalFailed = false, timer: NodeJS.Timeout | null = null;
  let finishManual: (() => void) | null = null;
  const stop = (signal: NodeJS.Signals) => {
    interrupted = signal;
    if (child) signalChild(child, childIdentity, signal);
    finishManual?.();
  };
  const sigint = () => stop("SIGINT"), sigterm = () => stop("SIGTERM"), sighup = () => stop("SIGHUP");
  process.on("SIGINT", sigint); process.on("SIGTERM", sigterm); process.on("SIGHUP", sighup);
  try {
    let renewedAt = Date.now();
    timer = setInterval(() => {
      if (Date.now() - renewedAt < heartbeatMs) return;
      try {
        const renewed = lock.renew(acquisitionId);
        // A short read operation may own the guard. Contention is not a lost token.
        if (renewed.guardBusy) return;
        if (renewed.code === 0) { renewedAt = Date.now(); return; }
      } catch { /* partial I/O keeps its operation guard */ }
      renewalFailed = true;
      stop("SIGTERM");
    }, Math.min(250, heartbeatMs));
    let childExitCode: number | null = null, childSignal: NodeJS.Signals | null = null;
    if (!argv.length) {
      await new Promise<void>((done) => { finishManual = done; if (interrupted) done(); });
    } else {
      child = spawn(process.execPath, [fileURLToPath(new URL("./resource-child.ts", import.meta.url))], { cwd: lock.root, env: process.env, stdio: ["inherit", "inherit", "inherit", "ipc"], detached: true });
      const bridge = child;
      let ready = false, exitSeen = false;
      const finished = new Promise<void>((done) => {
        bridge.once("error", () => { childExitCode = 127; done(); });
        bridge.once("exit", (code, signal) => { exitSeen = true; childExitCode = code; childSignal = signal; done(); });
      });
      bridge.on("message", (message: unknown) => {
        if (message && typeof message === "object" && (message as { type?: unknown }).type === "READY") ready = true;
      });
      const deadline = Date.now() + 5000;
      while (!ready && !exitSeen && Date.now() < deadline) await pause(10);
      childIdentity = bridge.pid ? processIdentity(bridge.pid) : null;
      if (!ready || !childIdentity || interrupted) {
        signalChild(bridge, childIdentity, "SIGTERM");
        if (!childIdentity) bridge.kill("SIGTERM"); // only our directly-created pre-START child; no user command has run
        bridge.disconnect();
        out({ outcome: "hold", reason: "bridge 시작 식별/준비 확인 실패; START 전송 안 함", lease: acquired.lease });
        return 2;
      }
      const recorded = await retryResourceGuard(() => lock.started(acquisitionId, childIdentity!));
      if (recorded.code !== 0) {
        signalChild(bridge, childIdentity, "SIGTERM");
        if (bridge.connected) bridge.disconnect();
        out(recorded); return 2;
      }
      if (interrupted || exitSeen) {
        signalChild(bridge, childIdentity, "SIGTERM");
        if (bridge.connected) bridge.disconnect();
        out({ outcome: "hold", reason: "START 전 중단; 명령 실행 안 함·잠금 보존" }); return 2;
      }
      bridge.send({ type: "START", argv });
      await finished;
      // The leader may exit while grandchildren survive. Never free on child exit alone.
      for (let i = 0; i < 20 && lock.deps.group(childIdentity.pid) === "alive"; i++) await pause(25);
    }
    if (timer) { clearInterval(timer); timer = null; }
    if (renewalFailed) { out({ outcome: "hold", reason: "자동 갱신 실패; 잠금 보존", childExitCode, signal: childSignal ?? interrupted }); return 2; }
    const released: LockResult = await retryResourceGuard(() => lock.release(acquisitionId, { internal: true }));
    const code = released.code !== 0 ? released.code : childExitCode !== null && childExitCode !== 0 || interrupted ? 1 : 0;
    out({ ...released, outcome: released.code !== 0 ? "hold" : code === 0 ? "completed" : "child_failed", childExitCode, signal: childSignal ?? interrupted });
    return code;
  } catch {
    if (child) {
      signalChild(child, childIdentity, "SIGTERM");
      if (child.connected) child.disconnect();
    }
    out({ outcome: "hold", reason: "자원 작업 중 안전 확인 실패; 잠금 보존·코디네이터 확인 요청" }); return 2;
  } finally {
    if (timer) clearInterval(timer);
    process.removeListener("SIGINT", sigint); process.removeListener("SIGTERM", sigterm); process.removeListener("SIGHUP", sighup);
  }
}

export async function resourceCommand(args: string[]): Promise<number> {
  try {
    const split = args.indexOf("--"), argv = split < 0 ? [] : args.slice(split + 1), head = split < 0 ? args : args.slice(0, split);
    const { values, positionals } = parseArgs({ args: head, options: { project: { type: "string" }, by: { type: "string" }, token: { type: "string" }, "confirmed-by": { type: "string" }, evidence: { type: "string" } }, allowPositionals: true, strict: true });
    const [sub, name] = positionals;
    if (positionals.length !== 2 || !name || !["lock", "unlock", "status"].includes(sub!) || split >= 0 && (!argv.length || sub !== "lock")) throw new Error(usage);
    if (sub === "lock" && (!values.by || values.token !== undefined || values["confirmed-by"] !== undefined || values.evidence !== undefined) ||
        sub === "unlock" && (!values.token || values.by !== undefined || !!values["confirmed-by"] !== !!values.evidence) ||
        sub === "status" && Object.keys(values).some((key) => key !== "project")) throw new Error(usage);
    let confirmation: Confirmation | undefined;
    if (values["confirmed-by"]) {
      if (!["coordinator", "captain"].includes(values["confirmed-by"]) || !safeResourceText(values.evidence)) throw new Error("자원 확인 주체/근거 오류");
      confirmation = { by: values["confirmed-by"] as Confirmation["by"], evidence: values.evidence! };
    }
    const root = teamRoot(process.cwd()), lock = new ResourceLock(root, name, values.project ? { events: projectResourceSink(root, values.project) } : {});
    if (sub === "lock") {
      // A known team member must declare the resource. P###/other caller labels are coordination identities, not authentication.
      if (values.by && /^[a-z][a-z0-9-]*$/.test(values.by) && existsSync(safeTeamPath(root, `.pace/team/${values.by}.md`))) {
        if (!loadTeamMember(root, values.by).resources.includes(name)) throw new Error("지정한 팀 구성원의 resources에 없는 자원");
      }
      return await runResourceCommand(lock, values.by!, argv);
    }
    const result = sub === "status" ? lock.status() : await retryResourceGuard(() => lock.release(values.token!, { confirmation }));
    out(result); return result.code;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "자원 명령 실패";
    process.stderr.write(`team resource: ${hasSecret(raw) ? "입력 안전 검사 실패" : raw}\n`);
    return 2;
  }
}
