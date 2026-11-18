import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), source = resolve(here, "../../../..");
for (const key of ["NODE_OPTIONS", "NODE_V8_COVERAGE", "NODE_TEST_CONTEXT"]) assert.ok(!process.env[key], key);
const output = join(here, "evidence", `fast-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(output, { recursive: true });
const owned = mkdtempSync(join(tmpdir(), "pace-p004-fast-")), app = join(owned, "installed home", "app"), sample = join(owned, "pace-sample"), home = join(owned, "home"), temp = join(owned, "tmp");
for (const folder of [app, sample, home, temp]) mkdirSync(folder, { recursive: true });
const env: NodeJS.ProcessEnv = {};
for (const [key, value] of Object.entries(process.env)) if (!/^(ORCA_|CLAUDE_|CODEX_|GEMINI_|CURSOR_)/i.test(key) && !["PACE_PROFILE", "TERM_PROGRAM", "CLAUDECODE"].includes(key.toUpperCase())) env[key.toUpperCase() === "PATH" ? "PATH" : key] = value;
Object.assign(env, { HOME: home, USERPROFILE: home, PACE_HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: join(home, "gitconfig"), npm_config_cache: join(temp, "npm-cache") });
writeFileSync(env.GIT_CONFIG_GLOBAL!, "");
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const manifest: { destination: string; file: string; sha256: string }[] = [];
function copy(part: string, destination: string) {
  const from = join(source, part), target = join(destination, part);
  mkdirSync(dirname(target), { recursive: true }); cpSync(from, target, { recursive: true, dereference: true });
  const walk = (file: string) => {
    if (lstatSync(file).isDirectory()) { for (const name of readdirSync(file)) walk(join(file, name)); return; }
    const rel = relative(destination, file), original = readFileSync(join(source, rel)), bytes = readFileSync(file);
    assert.deepEqual(bytes, original); manifest.push({ destination: destination === app ? "installed-app" : "pace-sample", file: rel.replaceAll("\\", "/"), sha256: hash(bytes) });
  };
  walk(target);
}
const setupStart = performance.now();
for (const part of ["bin", "src", "templates", "skills", "package.json"]) copy(part, app);
for (const part of ["bin", "src", "templates", "skills", "test", "scripts", "package.json", "package-lock.json", "tsconfig.json", ".gitignore", ".pace/test-map.json", "README.md", "docs/README.md", "AGENTS.md"]) copy(part, sample);
assert.equal(existsSync(join(app, "node_modules")), false);
symlinkSync(join(source, "node_modules"), join(sample, "node_modules"), process.platform === "win32" ? "junction" : "dir");
function git(...args: string[]) {
  const r = spawnSync("git", args, { cwd: sample, env, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }); assert.equal(r.status, 0, r.stderr); return r.stdout;
}
git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@example.com"); git("config", "core.autocrlf", "false");
git("add", "."); git("commit", "-qm", "PACE source snapshot with adopted checks map");
const adoptedCommit = git("rev-parse", "HEAD").trim();
assert.deepEqual(JSON.parse(git("show", "HEAD:.pace/test-map.json")), JSON.parse(readFileSync(join(sample, ".pace/test-map.json"), "utf8")));
const target = join(sample, "src/scout/card.ts"), original = readFileSync(target);
writeFileSync(target, Buffer.concat([original, Buffer.from("\n// P004 representative working-tree change.\n")]));
assert.equal(git("status", "--porcelain=v1").trim(), "M src/scout/card.ts");
const setupMs = performance.now() - setupStart, argv = [join(app, "bin/pace.ts"), "test", "changed"];
const metadata = { node: process.version, platform: process.platform, source, owned, app, sample, entry: argv[0], argv, adoptedCommit, setupMs, originalCardSha256: hash(original), changedCardSha256: hash(readFileSync(target)), manifest, environment: { npmCache: env.npm_config_cache, compileCache: env.NODE_COMPILE_CACHE ?? "unset", instrumentation: false }, limits: ["This is an installed app copy and an independent Git copy of current PACE sources, not the original worktree with its pending project changes.", "The adopted checks map was committed to the sample main before measurement. Before merge the original P004 worktree falls back to its original main declaration.", "The sample links existing development node_modules for actual TypeScript; the installed runtime app has no node_modules.", "Setup is measured separately; only the installed changed commands contribute to the fast command median.", "Selected tests are a strict subset. Comparison to full checks describes development workflow latency, not equivalent-scope speed or P-6 achievement.", "The owned sample is retained for independent inspection; no user installation or global Git setting was changed."] };
writeFileSync(join(output, "environment.json"), JSON.stringify(metadata, null, 2) + "\n");
const results = [];
for (let run = 1; run <= 3; run++) {
  const start = performance.now(), r = spawnSync(process.execPath, argv, { cwd: sample, env, encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  const elapsedMs = performance.now() - start;
  writeFileSync(join(output, `run-${run}.log`), `${r.stdout ?? ""}${r.stderr ?? ""}`);
  const stdout = r.stdout ?? "", counts = [...stdout.matchAll(/^테스트 (\d+) · skip (\d+) · 실패 (\d+)$/gm)].map(match => ({ tests: Number(match[1]), skipped: Number(match[2]), failed: Number(match[3]) }));
  const result = { run, status: r.status, signal: r.signal, error: r.error?.message, elapsedMs, counts, partialPassed: stdout.includes("판정: 부분 통과"), fullFallback: stdout.includes("전체 검사 전환"), actualTypecheck: stdout.includes("tsc -p tsconfig.json"), selectedBothFiles: stdout.includes("test/cli.test.ts") && stdout.includes("test/scout-ideas.test.ts") };
  results.push(result); writeFileSync(join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`); assert.equal(result.partialPassed, true); assert.equal(result.fullFallback, false); assert.equal(result.actualTypecheck, true); assert.equal(result.selectedBothFiles, true);
  assert.equal(counts.length, 2); assert.ok(counts.every(count => count.failed === 0 && count.tests > count.skipped));
  assert.equal(git("rev-parse", "HEAD").trim(), adoptedCommit); assert.equal(git("status", "--porcelain=v1").trim(), "M src/scout/card.ts");
  console.log(`fast-${run}: ${elapsedMs.toFixed(3)}ms, exit ${r.status}`);
}
const times = results.map(result => result.elapsedMs).sort((a, b) => a - b), medianMs = times[1]!;
const summary = { valid: true, runs: 3, medianMs, minMs: times[0], maxMs: times[2], setupMs, originalFullBaselineMs: 1425464.3327, recentT03FullMedianMs: 680918.0485, percentOfOriginalFull: medianMs / 1425464.3327 * 100, percentOfRecentFull: medianMs / 680918.0485 * 100, comparisonsHaveDifferentTestScope: true };
writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ output, ...summary }, null, 2));
