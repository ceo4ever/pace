import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseText, type Item, type Totals } from "../../measurement-data.ts";

export const previousRunnerName = "기본 테스트 명령은 Windows에서만 파일을 순차 실행하고 추가 인자를 전달한다";
export const currentRunnerName = "기본 테스트 명령의 Windows 동시성과 추가 옵션·파일 전달을 보존한다";
export const addedNames = [
  "runner options: mixed files, split values, separator and unique concurrency override",
  "runner npm: actual overlap is RED at one, GREEN at two, with filter and failure forwarding",
];
export type Run = { status: number | null; signal?: string | null; error?: string; elapsedMs: number; inventory: Item[]; totals: Totals; log: string };
export function counters(items: Item[], withTime = false): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = JSON.stringify([item.name, item.result, ...(withTime ? [item.durationMs] : [])]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map([...counts].sort(([a], [b]) => a.localeCompare(b)));
}
export function scopeComparison(reference: Item[], candidate: Item[]) {
  const expected = reference.map(item => ({ ...item, name: item.name === previousRunnerName ? currentRunnerName : item.name }));
  expected.push(...addedNames.map(name => ({ name, result: "pass" })));
  const before = counters(expected), after = counters(candidate);
  const differences = [...new Set([...before.keys(), ...after.keys()])].filter(key => before.get(key) !== after.get(key)).map(key => ({ key, expected: before.get(key) ?? 0, observed: after.get(key) ?? 0 }));
  return { valid: differences.length === 0, differences };
}
export function skipReasons(log: string): string[] {
  return log.split(/\r?\n/).filter(line => /^\s*﹣ /.test(line)).map(line => line.trim().replace(/ \([\d.]+ms\)(?= #|$)/, "")).sort();
}
export function readRuns(folder: string): { run: Run; raw: string }[] {
  const runs = JSON.parse(readFileSync(join(folder, "results.json"), "utf8")) as Run[];
  assert.ok(runs.length > 0, "No observations");
  return runs.map((run, index) => {
    const log = existsSync(run.log) ? run.log : join(folder, `run-${index + 1}.log`);
    const raw = readFileSync(log, "utf8"), parsed = parseText(raw);
    assert.ok(parsed.complete, parsed.problems.join("; "));
    assert.equal(run.status, 0, "Failed full observation must remain failed");
    assert.ok(!run.signal && !run.error && Number.isFinite(run.elapsedMs) && run.elapsedMs > 0);
    for (const key of ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"]) assert.equal(run.totals[key], parsed.totals[key], key);
    assert.equal(parsed.totals.fail, 0); assert.equal(parsed.totals.cancelled, 0);
    assert.deepEqual(counters(run.inventory, true), counters(parsed.inventory, true), "Stored cases/times differ from raw log");
    return { run, raw };
  });
}
export function sourceFingerprint(host: Record<string, unknown>): string {
  assert.ok(Array.isArray(host.testSources) && host.testSources.length > 0, "Missing source manifest");
  assert.ok(host.runnerSha256 && host.helpersSha256 && host.toolHashes, "Missing source/tool hashes");
  return JSON.stringify({ tests: host.testSources, runner: host.runnerSha256, helpers: host.helpersSha256, tools: host.toolHashes });
}
export function median(values: number[]): number {
  assert.ok(values.length > 0);
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return values.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
