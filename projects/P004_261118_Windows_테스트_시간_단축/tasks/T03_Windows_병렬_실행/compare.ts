import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addedNames, counters, currentRunnerName, median, previousRunnerName, readRuns, scopeComparison, skipReasons, sourceFingerprint } from "./observations.ts";

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, "../../../.."), tasks = resolve(here, "..");
const t02 = join(tasks, readdirSync(tasks).find(name => name.startsWith("T02_"))!);
const baseline = join(t02, "evidence", "t02-fixed-2026-11-18T12-44-08-858Z");
const reference = readRuns(baseline)[0]!;
if (process.argv.includes("--self-test")) {
  const expected = reference.run.inventory.map(item => ({ ...item, name: item.name === previousRunnerName ? currentRunnerName : item.name }));
  expected.push(...addedNames.map(name => ({ name, result: "pass", durationMs: 1 })));
  assert.ok(scopeComparison(reference.run.inventory, expected.toReversed()).valid);
  assert.equal(scopeComparison(reference.run.inventory, expected.slice(1)).valid, false);
  const changed = expected.map(item => ({ ...item })); changed[0]!.result = "fail";
  assert.equal(scopeComparison(reference.run.inventory, changed).valid, false);
  assert.deepEqual(counters(expected), counters(expected.toReversed()));
  assert.notDeepEqual(skipReasons(reference.raw), [...skipReasons(reference.raw), "changed reason"].sort());
  assert.equal(median([8, 4]), 6);
  console.log("Comparison self-test: reordered cases accepted, missing/changed cases rejected, skips and median checked");
} else {
  const output = join(here, "evidence", `comparison-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const samples = join(output, "evidence"); mkdirSync(samples, { recursive: true });
  const observations: { step: number; concurrency: number; folder?: string; status: number | null; elapsedMs?: number; comparison?: ReturnType<typeof scopeComparison> }[] = [];
  const toolHashes = Object.fromEntries([fileURLToPath(import.meta.url), join(here, "observations.ts")].map(file => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
  let fingerprint: string | undefined;
  const save = (extra: object) => writeFileSync(join(output, "comparison.json"), JSON.stringify({ order: [4, 8, 8, 4], baseline, toolHashes, observations, rule: "Select 8 only when its median is at least 5% lower; otherwise 4. Both must succeed.", ...extra }, null, 2) + "\n");
  console.log(`Comparison group: ${output}`);
  try {
    for (const [index, concurrency] of [4, 8, 8, 4].entries()) {
      const label = `c${concurrency}-${index + 1}`, log = join(output, `step-${index + 1}.log`);
      writeFileSync(log, "");
      const argv = [resolve(here, "../", readdirSync(tasks).find(name => name.startsWith("T01_"))!, "measure.ts"), "--runs", "1", "--label", label, "--concurrency", String(concurrency), "--evidence-dir", samples];
      const status = await new Promise<number | null>((done) => {
        const child = spawn(process.execPath, argv, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        for (const stream of [child.stdout, child.stderr]) stream.on("data", (data: Buffer) => { appendFileSync(log, data); process.stdout.write(data); });
        child.once("error", error => appendFileSync(log, String(error)));
        child.once("close", done);
      });
      const names = readdirSync(samples).filter(name => name.startsWith(label + "-"));
      const observation = { step: index + 1, concurrency, status, folder: names.length === 1 ? join(samples, names[0]!) : undefined, elapsedMs: undefined as number | undefined, comparison: undefined as ReturnType<typeof scopeComparison> | undefined };
      observations.push(observation); save({ valid: false, state: "collecting" });
      assert.equal(status, 0, "Stop after any failed/incomplete observation; never retry it into success");
      assert.ok(observation.folder);
      const [measured] = readRuns(observation.folder); assert.ok(measured);
      const host = JSON.parse(readFileSync(join(observation.folder, "environment.json"), "utf8")) as Record<string, unknown>;
      assert.equal(host.requestedConcurrency, String(concurrency));
      const current = sourceFingerprint(host); if (fingerprint === undefined) fingerprint = current; else assert.equal(current, fingerprint, "Sources changed; restart a fresh four-run group");
      observation.comparison = scopeComparison(reference.run.inventory, measured.run.inventory);
      assert.ok(observation.comparison.valid, JSON.stringify(observation.comparison));
      assert.deepEqual(skipReasons(measured.raw), skipReasons(reference.raw));
      observation.elapsedMs = measured.run.elapsedMs; save({ valid: false, state: "collecting" });
    }
    const median4 = median(observations.filter(item => item.concurrency === 4).map(item => item.elapsedMs!));
    const median8 = median(observations.filter(item => item.concurrency === 8).map(item => item.elapsedMs!));
    const selected = median8 <= median4 * 0.95 ? 8 : 4;
    save({ valid: true, state: "complete", median4, median8, selected, limitation: "Two samples per setting, operational choice only; not a statistical speedup or final P-6 verdict" });
    console.log(`Comparison complete: 4=${median4}ms, 8=${median8}ms, selected=${selected}; ${output}`);
  } catch (error) {
    save({ valid: false, state: "failed", error: String(error), action: "Preserve originals; diagnose before any new group. Keep default 1 if neither setting is suitable." });
    process.exitCode = 1; console.error(error);
  }
}
