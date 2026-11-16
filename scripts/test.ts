import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Node 기본 동시성은 그대로 두고 Windows에서만 테스트 파일을 순차 실행한다. */
export function testArguments(platform: NodeJS.Platform, extra: string[] = []): string[] {
  return ["--test", ...(platform === "win32" ? ["--test-concurrency=1"] : []), "test/**/*.test.ts", ...extra];
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
