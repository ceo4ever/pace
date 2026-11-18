import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reusableGitFixture, sessionFreeEnv, tempDir } from "../../../../test/helpers.ts";

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, "evidence", `fixture-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(output, { recursive: true });
const home = tempDir("pace-bench-home-");
let mode: "direct" | "cached" = "direct";
const counters = { direct: { callbacks: 0, callbackGitCalls: 0 }, cached: { callbacks: 0, callbackGitCalls: 0 } };
function prepare(root: string) {
  counters[mode].callbacks++;
  const git = (...args: string[]) => {
    counters[mode].callbackGitCalls++;
    const result = spawnSync("git", ["-C", root, ...args], { env: { ...sessionFreeEnv(), HOME: home, USERPROFILE: home }, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "test"); git("config", "user.email", "test@example.invalid"); git("config", "core.autocrlf", "false");
  writeFileSync(join(root, "AGENTS.md"), "# app\n"); mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs/README.md"), "# app\n\n## env\n\nfixture\n");
  git("add", "-A"); git("commit", "-qm", "init");
}
const copy = reusableGitFixture(prepare);
const samples: { pair: number; mode: string; elapsedMs: number; cold: boolean }[] = [];
for (let pair = 0; pair < 10; pair++) {
  for (const selected of (pair % 2 ? ["cached", "direct"] : ["direct", "cached"]) as ("cached" | "direct")[]) {
    mode = selected;
    const target = tempDir("pace-bench-destination-");
    const begin = performance.now();
    if (mode === "direct") prepare(target); else copy(target);
    samples.push({ pair: pair + 1, mode, elapsedMs: performance.now() - begin, cold: mode === "cached" && pair === 0 });
  }
}
const median = (numbers: number[]) => {
  const sorted = numbers.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const result = {
  node: process.version, sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], { cwd: resolve(here, "../../../.."), encoding: "utf8" }).stdout.trim(),
  git: spawnSync("git", ["--version"], { encoding: "utf8" }).stdout.trim(), samples, counters,
  medianMs: { direct: median(samples.filter((sample) => sample.mode === "direct").map((sample) => sample.elapsedMs)), cachedAll: median(samples.filter((sample) => sample.mode === "cached").map((sample) => sample.elapsedMs)), cachedWarm: median(samples.filter((sample) => sample.mode === "cached" && !sample.cold).map((sample) => sample.elapsedMs)) },
  limits: "Small committed fixture preparation only; alternating order, 10 per mode. Cached cold cost included and shown separately. Callback Git count excludes the helper's one readonly HEAD check; its time is included. This is not the whole-suite improvement rate.",
};
writeFileSync(join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ output, counters, medianMs: result.medianMs }));
