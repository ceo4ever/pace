import { spawn, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inside } from "./map.ts";
import type { Unit } from "./map.ts";
export type Outcome = { code: number; text: string; interrupted?: boolean };
export type TestObservation = { file: string; verdict: "passed" | "failed" | "unknown" };
export async function fileResults(root: string, unit: Unit, files: string[], timeout: number, stopEarly = false,
  observe?: (observation: TestObservation) => void): Promise<Outcome> {
  const kind = unit.runner.kind;
  if (unit.requires.length || !["node-test", "python-unittest", "vitest"].includes(kind) || (unit.runner.config && kind !== "vitest")) return { code: 3, text: `확인 불가: ${unit.id} — 미지원 러너·설정 또는 전제` };
  const driver = fileURLToPath(new URL(kind === "node-test" ? "./node-driver.mjs" : kind === "vitest" ? "./vitest-driver.mjs" : "./python-driver.py", import.meta.url));
  let failures = 0; let unknown = 0; let log = ""; let interrupted = false;
  // Vitest는 단위의 파일을 한 프로세스로 실행하고 묶음 전체에 시간 제한을 적용한다.
  const batches = kind === "vitest" ? [files] : files.map((file) => [file]);
  for (const batch of batches) {
    const file = batch.join(", ");
    const executable = kind === "python-unittest" ? (process.platform === "win32" ? "python" : "python3") : process.execPath;
    const targets = batch.map((file) => inside(root, resolve(root, file)));
    const argv = kind === "vitest" ? [driver, realpathSync(root), unit.runner.config ? inside(root, resolve(root, unit.runner.config)) : "", ...targets] : [driver, ...targets]; const start = Date.now();
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null; output: string[]; error: Error | null; started: boolean }>((done) => {
      const child = spawn(executable, argv, { env, cwd: resolve(root, unit.runner.cwd), detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe", "pipe"] });
      const output = ["", "", "", ""]; let error: Error | null = null; let ended = false;
      for (const index of [1, 2, 3]) child.stdio[index]?.on("data", (chunk: Buffer) => { output[index] += chunk.toString(); if (output[index]!.length > 16 * 1024 * 1024) { error = new Error("출력 상한 초과"); stop(); } });
      const stop = () => { try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else if (kind === "vitest" && child.pid) { spawnSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); child.kill("SIGKILL"); } else child.kill("SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") error = e as Error; } };
      const signals: NodeJS.Signals[] = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];
      const interrupted = (signal: NodeJS.Signals) => { error = new Error(`중단: ${signal}`); stop(); };
      for (const signal of signals) process.on(signal, interrupted);
      const timer = setTimeout(() => { error = new Error("시간 초과"); stop(); }, timeout);
      child.on("error", (e) => { error = e; });
      child.on("close", (status, signal) => { if (ended) return; ended = true; clearTimeout(timer); for (const name of signals) process.off(name, interrupted); done({ status, signal, output, error, started: (child.pid ?? 0) > 0 }); });
    });
    log += `\n대상: ${file}\n명령: ${JSON.stringify([executable, ...argv])}\n시간: ${Date.now() - start}ms · 종료: ${result.status ?? result.signal ?? "오류"}\n${result.output[1] ?? ""}${result.output[2] ?? ""}`;
    let verdict: TestObservation["verdict"] = "unknown";
    try {
      if (stopEarly && !result.started && result.error) { unknown++; log += "실행 시작 확인 불가\n"; break; }
      if (result.error || result.signal || result.status !== 0) { failures++; if (result.error?.message.startsWith("중단:")) interrupted = true; if (interrupted || stopEarly) break; continue; }
      let data: unknown; try { data = JSON.parse(String(result.output[3] ?? "")); } catch { unknown++; if (stopEarly) break; continue; }
      if (data === null && kind === "node-test") { failures++; log += "0건 실패\n"; if (stopEarly) break; continue; }
      if (!data || typeof data !== "object") { unknown++; if (stopEarly) break; continue; }
      const record = data as Record<string, unknown>;
      if (typeof record.unavailable === "string") { unknown++; log += `확인 불가: ${record.unavailable}\n`; if (stopEarly) break; continue; }
      const counts = (kind === "python-unittest" ? record : record.counts) as Record<string, unknown> | undefined;
      if (!counts || typeof counts.tests !== "number" || typeof counts.skipped !== "number" || typeof counts.failed !== "number" || typeof record.success !== "boolean") { unknown++; if (stopEarly) break; continue; }
      const todo = typeof counts.todo === "number" ? counts.todo : 0;
      log += `테스트 ${counts.tests} · skip ${counts.skipped} · 실패 ${counts.failed}\n`;
      const ran = counts.tests - counts.skipped - todo;
      if ([counts.tests, counts.skipped, counts.failed, todo].every((count) => Number.isSafeInteger(count) && count >= 0) &&
          ran > 0 && counts.failed <= ran && record.success === (counts.failed === 0)) {
        verdict = record.success ? "passed" : "failed";
      }
      if (!record.success || counts.failed > 0 || counts.tests === 0 || counts.tests <= counts.skipped + todo) { failures++; if (stopEarly) break; }
    } finally {
      if (kind !== "vitest") observe?.({ file: batch[0]!, verdict });
    }
  }
  return { code: failures ? 1 : unknown ? 3 : 0, text: log, interrupted };
}
