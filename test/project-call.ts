import { fork, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerTestChild, sessionFreeEnv } from "./helpers.ts";

export interface ProjectCallResult {
  status: number;
  stdout: string;
  stderr: string;
  signal: null;
  error: undefined;
  pid: number;
  generation: string;
  restored: boolean;
  context: { cwd: string; home: string; paceHome: string; cliUrl: string };
}

export class ProjectCallInfrastructureError extends Error {
  constructor(message: string) { super(message); this.name = "ProjectCallInfrastructureError"; }
}

type Pending = { id: number; resolve(value: ProjectCallResult): void; reject(error: Error): void };
interface Slot {
  child: ChildProcess;
  home: string;
  ready: Promise<void>;
  rejectReady(error: Error): void;
  closed: Promise<void>;
  isReady: boolean;
  closing: boolean;
  pending?: Pending;
  generation?: string;
}

/** A scope belongs to one test block. A HOME transition closes the preceding child first. */
export function createProjectCalls(): { run(home: string, cwd: string, ...args: string[]): Promise<ProjectCallResult>; close(): Promise<void> } {
  let slot: Slot | undefined, poisoned: Error | undefined, active = false, closed = false, sequence = 0;
  const cliUrl = new URL("../src/cli.ts", import.meta.url).href;
  const fail = (current: Slot, message: string) => {
    const error = poisoned ??= new ProjectCallInfrastructureError(message);
    current.rejectReady(error);
    current.pending?.reject(error);
    current.child.kill();
  };
  const start = (home: string, cwd: string): Slot => {
    const child = registerTestChild(fork(fileURLToPath(new URL("./project-call-process.ts", import.meta.url)), [], {
      cwd, env: { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, PACE_PROFILE: "", PACE_HOME: home },
      execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
    }), 2 * 60 * 60_000);
    let resolveReady!: () => void, rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const current: Slot = { child, home, ready, rejectReady, closed: Promise.resolve(), isReady: false, closing: false };
    current.closed = new Promise<void>((resolve) => child.once("close", (code, signal) => {
      if (!current.closing || code !== 0 || signal) fail(current, `Unexpected project process exit: ${code}/${signal}`);
      resolve();
    }));
    child.once("error", error => fail(current, `Project process error: ${error.message}`));
    for (const [name, stream] of [["stdout", child.stdout], ["stderr", child.stderr]] as const) stream!.on("data", (chunk: Buffer) => {
      const phase = current.isReady ? current.pending ? "raw-during-request" : "raw-outside-request" : "raw-before-ready";
      fail(current, `${phase} ${name}: ${chunk.toString("utf8")}`);
    });
    child.on("message", (message: unknown) => {
      const value = message as { type?: string; id?: number; pid?: number; generation?: string; cliUrl?: string; cwd?: string; home?: string; paceHome?: string; message?: string; result?: ProjectCallResult };
      if (value.type === "ready" && !current.isReady && value.pid === child.pid && value.cliUrl === cliUrl && value.home === home && value.paceHome === home && value.cwd === realpathSync.native(cwd) && typeof value.generation === "string") {
        current.isReady = true; current.generation = value.generation; resolveReady(); return;
      }
      const pending = current.pending;
      if (value.type === "result" && pending && value.id === pending.id && value.result?.restored && value.result.pid === child.pid && value.result.generation === current.generation && value.result.context.cliUrl === cliUrl) {
        current.pending = undefined; pending.resolve({ ...value.result, error: undefined }); return;
      }
      fail(current, value.type === "infrastructure-error" ? `Project call infrastructure: ${value.message}` : "Unexpected project IPC message");
    });
    return current;
  };
  const stop = async (current: Slot): Promise<void> => {
    current.closing = true;
    if (current.child.connected && !poisoned) current.child.send({ type: "close" }, error => { if (error) fail(current, `Project close IPC: ${error.message}`); });
    else current.child.kill();
    const timer = setTimeout(() => fail(current, "Project process did not close"), 5000);
    try { await current.closed; } finally { clearTimeout(timer); }
  };
  return {
    async run(home, cwd, ...args) {
      if (closed || poisoned || active) throw poisoned ?? new ProjectCallInfrastructureError("Closed or overlapping project call scope");
      active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        const error = poisoned ??= new ProjectCallInfrastructureError("Project call exceeded 60000ms");
        if (slot) fail(slot, error.message);
        reject(error);
      }, 60_000); });
      try {
        const operation = async () => {
          if (slot && slot.home !== home) { await stop(slot); slot = undefined; }
          if (poisoned) throw poisoned;
          slot ??= start(home, cwd);
          const current = slot;
          await current.ready;
          if (poisoned) throw poisoned;
          const result = await new Promise<ProjectCallResult>((resolve, reject) => {
            current.pending = { id: ++sequence, resolve, reject };
            current.child.send({ type: "call", id: sequence, cwd, env: { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, PACE_PROFILE: "", PACE_HOME: home }, args }, error => { if (error) fail(current, `Project request IPC: ${error.message}`); });
          });
          if (result.context.cwd !== realpathSync.native(cwd) || result.context.home !== home || result.context.paceHome !== home) { fail(current, "Project call context mismatch"); throw poisoned; }
          if (process.env.PACE_PROJECT_CALL_TRACE === "1") console.log("DIRECT_PROJECT_CALL " + JSON.stringify({ method: "main", argv: ["project", ...args], cwd, home, pid: result.pid, generation: result.generation, cliUrl: result.context.cliUrl, status: result.status }));
          // Match the existing runCli compatibility treatment for pre-v1 fixture tasks.
          if (args[0] === "task" && result.status === 0) {
            const file = result.stdout.trim().split(": ").at(-1);
            if (file && existsSync(file)) writeFileSync(file, readFileSync(file, "utf8").replace(/^- 사전 검토: v1\r?\n/m, ""));
          }
          return result;
        };
        return await Promise.race([operation(), timeout]);
      } finally { clearTimeout(timer); active = false; }
    },
    async close() {
      if (closed) return;
      closed = true;
      if (slot) await stop(slot);
      if (poisoned) throw poisoned;
    },
  };
}
