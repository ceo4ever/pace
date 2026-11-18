import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const windowsConcurrency = 4;
const valueOptions = new Set(["--test-concurrency", "--test-name-pattern", "--test-skip-pattern", "--test-reporter", "--test-reporter-destination", "--test-timeout", "--test-shard", "--test-isolation", "--import", "--require", "-r"]);
const booleanOptions = new Set(["--test-only", "--test-force-exit", "--experimental-test-coverage", "--test-update-snapshots", "--experimental-strip-types", "--no-warnings", "--trace-warnings"]);

/** Keep options before files; an explicit concurrency replaces the Windows default. */
export function testArguments(platform: NodeJS.Platform, extra: string[] = []): string[] {
  const options: string[] = [], files: string[] = [];
  let filesOnly = false, separator = false, concurrency = false;
  for (let index = 0; index < extra.length; index++) {
    const arg = extra[index]!;
    if (!filesOnly && arg === "--") { filesOnly = true; separator = true; continue; }
    if (filesOnly || !arg.startsWith("-")) { files.push(arg); continue; }
    const equal = arg.indexOf("="), key = equal < 0 ? arg : arg.slice(0, equal);
    if (key === "--test-concurrency") {
      const value = equal < 0 ? extra[++index] : arg.slice(equal + 1);
      if (concurrency || !value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error("test concurrency must be one positive integer value");
      concurrency = true; options.push(`--test-concurrency=${Number(value)}`); continue;
    }
    if (equal >= 0 || booleanOptions.has(arg)) { options.push(arg); continue; }
    if (valueOptions.has(arg)) {
      const value = extra[++index];
      if (value === undefined || value.startsWith("--")) throw new Error(`Missing option value: ${arg}; use ${arg}=value for a leading dash`);
      options.push(arg, value); continue;
    }
    throw new Error(`Unsupported bare option ${arg}; use --option=value for value options`);
  }
  return ["--test", ...(platform === "win32" && !concurrency ? [`--test-concurrency=${windowsConcurrency}`] : []), ...options, ...(separator ? ["--"] : []), "test/**/*.test.ts", ...files];
}

/** 신호나 실행 오류도 성공으로 보고하지 않는다. */
export function testExitCode(status: number | null): number {
  return status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let child: ChildProcess | undefined;
  const pending: NodeJS.Signals[] = [];
  const send = (signal: NodeJS.Signals) => {
    if (!child) { pending.push(signal); return; }
    try { child.kill(signal); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") process.stderr.write(`테스트 신호 전달 실패: ${(error as Error).message}\n`);
    }
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const handlers = signals.map((signal) => {
    const forward = () => send(signal);
    process.on(signal, forward);
    return { signal, forward };
  });
  const cleanup = () => { for (const { signal, forward } of handlers) process.off(signal, forward); };
  let spawnFailed = false;
  try { child = spawn(process.execPath, testArguments(process.platform, process.argv.slice(2)), { stdio: "inherit" }); }
  catch (error) { cleanup(); process.exitCode = 1; process.stderr.write(`테스트 실행 실패: ${(error as Error).message}\n`); }
  if (child) {
    child.on("error", (error) => { spawnFailed = true; process.exitCode = 1; cleanup(); process.stderr.write(`테스트 실행 실패: ${error.message}\n`); });
    child.on("close", (status, signal) => {
      cleanup();
      if (signal) process.stderr.write(`테스트가 신호로 종료됐다: ${signal}\n`);
      process.exitCode = spawnFailed ? 1 : testExitCode(status);
    });
    for (const signal of pending) send(signal);
  }
}
