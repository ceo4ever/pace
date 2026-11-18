import { main, UsageError } from "../src/cli.ts";
import { paceHome } from "../src/core/paths.ts";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

const cliUrl = new URL("../src/cli.ts", import.meta.url).href;
const generation = randomUUID();
let busy = false;

function send(message: unknown): void {
  if (!process.send) throw new Error("Project call process needs IPC");
  process.send(message, (error) => {
    if (error) { process.exitCode = 1; process.disconnect?.(); }
  });
}

process.on("message", async (message: unknown) => {
  const request = message as { type?: string; id?: number; cwd?: string; env?: NodeJS.ProcessEnv; args?: string[] };
  if (request.type === "close" && !busy) { process.disconnect?.(); return; }
  if (busy || request.type !== "call" || !Number.isSafeInteger(request.id) || !request.cwd || !request.env || !Array.isArray(request.args)) {
    send({ type: "infrastructure-error", id: request.id, message: "Invalid or overlapping project call" });
    return;
  }
  busy = true;
  const saved = { cwd: process.cwd(), env: { ...process.env }, stdout: process.stdout.write, stderr: process.stderr.write, exitCode: process.exitCode };
  let stdout = "", stderr = "", stdoutBytes = 0, stderrBytes = 0, overflow = false;
  let result: unknown, failure: string | undefined;
  const capture = (stream: "stdout" | "stderr") => ((chunk: string | Uint8Array, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean => {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, typeof encoding === "string" ? encoding : "utf8") : Buffer.from(chunk);
    if (stream === "stdout") stdoutBytes += bytes.length; else stderrBytes += bytes.length;
    if (stdoutBytes > 1024 * 1024 || stderrBytes > 1024 * 1024) { overflow = true; throw new Error("Project call output limit exceeded"); }
    if (stream === "stdout") stdout += bytes.toString("utf8"); else stderr += bytes.toString("utf8");
    const done = typeof encoding === "function" ? encoding : callback;
    if (done) queueMicrotask(() => done());
    return true;
  }) as typeof process.stdout.write;
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, request.env);
    process.chdir(request.cwd);
    process.stdout.write = capture("stdout");
    process.stderr.write = capture("stderr");
    const context = { cwd: realpathSync.native(process.cwd()), home: process.env.HOME, paceHome: paceHome(), cliUrl };
    let status: number;
    try { status = await main(["project", ...request.args]); }
    catch (error) {
      if (overflow) throw error;
      process.stderr.write(`pace: ${(error as Error).message}\n`);
      status = error instanceof UsageError ? 2 : 1;
    }
    if (overflow) throw new Error("Project call output limit exceeded");
    if (!Number.isInteger(status)) throw new Error("Project main returned an invalid status");
    result = { status, stdout, stderr, signal: null, pid: process.pid, generation, context };
  } catch (error) { failure = (error as Error).message; }
  finally {
    process.stdout.write = saved.stdout;
    process.stderr.write = saved.stderr;
    try {
      process.chdir(saved.cwd);
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, saved.env);
      process.exitCode = saved.exitCode;
    } catch (error) { failure = `Project context restoration failed: ${(error as Error).message}`; }
  }
  const restored = process.cwd() === saved.cwd && process.stdout.write === saved.stdout && process.stderr.write === saved.stderr && process.exitCode === saved.exitCode &&
    Object.keys(process.env).length === Object.keys(saved.env).length && Object.keys(saved.env).every(key => process.env[key] === saved.env[key]);
  busy = false;
  if (failure || !restored) send({ type: "infrastructure-error", id: request.id, message: failure ?? "Project context was not restored" });
  else send({ type: "result", id: request.id, result: { ...(result as object), restored } });
});

send({ type: "ready", pid: process.pid, generation, cliUrl, cwd: realpathSync.native(process.cwd()), home: process.env.HOME, paceHome: paceHome() });
