import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { cpus, freemem, release, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { testArguments } from "../../../../scripts/test.ts";
import { report } from "../../report.ts";
import { parseText, checkInventory, compareItems } from "../../measurement-data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1] ?? fallback : fallback;
const label = flag("--label", "baseline");
const runs = Number(flag("--runs", "3"));
const profileOnlyInput = flag("--profile-only", "");
const profileOnly = profileOnlyInput ? resolve(profileOnlyInput) : "";
const wantsProfile = args.includes("--profile") || Boolean(profileOnly);
if (!/^[a-z0-9-]+$/.test(label) || !Number.isInteger(runs) || runs < 1 || runs > 20) throw new Error("Invalid label/runs");
// Never remove tracing silently: an inherited profiler invalidates the baseline.
for (const key of ["NODE_OPTIONS", "NODE_V8_COVERAGE", "NODE_TEST_CONTEXT", "NODE_INSPECT_RESUME_ON_START"]) {
  if (process.env[key]) throw new Error(`Baseline environment must not contain ${key}`);
}
const output = join(here, "evidence", `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(output, { recursive: true });
const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const profileArguments = (base: string[]) => [`--test-reporter=${pathToFileURL(join(here, "reporter.ts")).href}`, ...base];
const median = (values: number[]) => {
  const ordered = values.toSorted((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length === 0 ? undefined : ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
};
const command = (exe: string, argv: string[]) => {
  const result = spawnSync(exe, argv, { cwd: root, encoding: "utf8", timeout: 20000, windowsHide: true });
  return { status: result.status, stdout: result.stdout?.trim(), stderr: result.stderr?.trim(), error: result.error?.message };
};
const npm = process.platform === "win32" ? [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run check"]] as const : ["npm", ["run", "check"]] as const;
const envFor = (dir: string) => ({ ...process.env, TMP: dir, TEMP: dir, TMPDIR: dir, PACE_HOME: join(dir, "pace-home") });
type Result = { status: number | null; signal: string | null; error?: string; elapsedMs: number; started: string; ended: string; log: string; temp: string };
async function execute(exe: string, argv: readonly string[], dir: string, name: string): Promise<Result> {
  const log = join(output, `${name}.log`);
  writeFileSync(log, "");
  const started = new Date().toISOString();
  const begin = performance.now();
  console.log(`${started} ${name}: ${exe} ${argv.join(" ")}`);
  return await new Promise((resolveResult) => {
    const child = spawn(exe, [...argv], { cwd: root, env: envFor(dir), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let error: string | undefined;
    child.stdout.on("data", (data: Buffer) => appendFileSync(log, data));
    child.stderr.on("data", (data: Buffer) => appendFileSync(log, data));
    child.on("error", (e) => { error = e.message; });
    child.on("close", (status, signal) => {
      const result = { status, signal, error, elapsedMs: performance.now() - begin, started, ended: new Date().toISOString(), log, temp: dir };
      json(join(output, `${name}.json`), result);
      console.log(`${result.ended} ${name}: exit ${status} ${Math.round(result.elapsedMs / 1000)}s`);
      resolveResult(result);
    });
  });
}
function parse(log: string) {
  return parseText(readFileSync(log, "utf8"));
}
function validResult(result: Result, parsed: ReturnType<typeof parse>): boolean {
  return result.status === 0 && !result.signal && !result.error && parsed.complete && (parsed.totals.pass ?? 0) > 0 && parsed.totals.fail === 0 && parsed.totals.cancelled === 0;
}
const ownsTemp = (name: string) => mkdtempSync(join(tmpdir(), `pace-p004-${name}-`));
const preflight = ownsTemp("preflight");
writeFileSync(join(preflight, "target"), "symlink probe\n");
symlinkSync(join(preflight, "target"), join(preflight, "link"), "file");
mkdirSync(join(preflight, "target-dir"));
symlinkSync(join(preflight, "target-dir"), join(preflight, "dir-link"), "dir");
assert.equal(readFileSync(join(preflight, "link"), "utf8"), "symlink probe\n");
const powershell = (script: string) => command("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
const host = {
  node: process.version, npm: command(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/c", "npm --version"] : ["--version"]),
  git: command("git", ["--version"]), python: command("python", ["--version"]),
  commit: command("git", ["rev-parse", "HEAD"]), diff: command("git", ["diff", "--stat"]),
  gitStatus: command("git", ["status", "--porcelain=v1", "--untracked-files=all"]),
  toolHashes: Object.fromEntries([fileURLToPath(import.meta.url), resolve(here, "../../report.ts"), resolve(here, "../../measurement-data.ts"), join(here, "reporter.ts"), join(here, "diagnose-nested.ts")].map((path) => [path.slice(root.length + 1), createHash("sha256").update(readFileSync(path)).digest("hex")])),
  os: { platform: process.platform, release: release(), cpu: cpus()[0]?.model, cores: cpus().length, totalMemory: totalmem() },
  power: command("powercfg", ["/getactivescheme"]),
  defender: powershell("try { Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled | ConvertTo-Json -Compress } catch { Write-Output 'unconfirmed' }"),
  command: "npm run check", instrumentation: "none in baseline; optional explicit-argv auxiliary profile", preflight,
};
json(join(output, "environment.json"), host);

if (args.includes("--self-test") || wantsProfile) {
  assert.equal(median([30, 10, 20]), 20);
  assert.equal(median([10, 30]), 20);
  const dir = ownsTemp("fixture");
  for (const [name, body, exit] of [["pass", "", 0], ["fail", "throw new Error('injected failure');", 1], ["skip", "", 0]] as const) {
    const fixture = join(dir, `${name}.test.cjs`);
    writeFileSync(fixture, `require('node:test')('${name}', {skip:${name === "skip"}}, () => { ${body} });`);
    const result = await execute(process.execPath, ["--test", fixture], dir, `fixture-${name}`);
    assert.equal(result.status, exit);
    const parsed = parse(result.log);
    assert.ok(parsed.complete);
    assert.equal(parsed.totals.fail, exit);
    assert.ok(parsed.inventory.some((item) => item.name === name));
    assert.equal(validResult(result, parsed), name === "pass");
    if (name === "pass") {
      const original = readFileSync(result.log, "utf8");
      const missing = original.split(/\r?\n/).filter((line) => !/^\s*✔ pass \(/.test(line)).join("\n");
      assert.equal(parseText(missing).inventory.length, 0);
      assert.equal(parseText(missing).complete, false);
      assert.equal(validResult(result, parseText(missing)), false);
      assert.equal(parseText(original.replace(/^ℹ pass 1$/m, "ℹ pass 2")).complete, false);
      writeFileSync(join(output, "missing-case-row.log"), missing);
    }
  }
  const childOutput = join(dir, "child-output.txt");
  const nested = join(dir, "nested.test.cjs");
  const outer = join(dir, "outer.test.cjs");
  writeFileSync(nested, "require('node:test')('nested sentinel',()=>{});");
  writeFileSync(outer, `require('node:test')('outer sentinel',()=>{const r=require('node:child_process').spawnSync(process.execPath,['--test',${JSON.stringify(nested)}],{encoding:'utf8',env:{...process.env,NODE_TEST_CONTEXT:''}});require('node:assert/strict').equal(r.status,0);require('node:fs').writeFileSync(${JSON.stringify(childOutput)},r.stdout);});`);
  const result = await execute(process.execPath, profileArguments(["--test", outer]), dir, "fixture-profile");
  assert.equal(result.status, 0);
  const outerEvents = readFileSync(result.log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(outerEvents.some((event) => event.name === "outer sentinel"));
  assert.ok(!readFileSync(childOutput, "utf8").includes('"type":"test:pass"'));
  writeFileSync(join(output, "incomplete.log"), "partial execution\n");
  assert.equal(parse(join(output, "incomplete.log")).complete, false);
  const two = join(dir, "report-two.test.cjs");
  writeFileSync(two, "const {test}=require('node:test');test('report sentinel a',()=>{});test('report sentinel b',()=>{});");
  const baseResult = await execute(process.execPath, ["--test", two], dir, "fixture-report-baseline");
  const profileResult = await execute(process.execPath, profileArguments(["--test", two]), dir, "fixture-report-events");
  assert.equal(baseResult.status, 0); assert.equal(profileResult.status, 0);
  const baseText = readFileSync(baseResult.log, "utf8"), eventText = readFileSync(profileResult.log, "utf8");
  const cases = ["good", "missing-default-row", "missing-stored-row", "missing-profile-event", "wrong-profile-total", "truncated-json", "missing-stored-duration", "wrong-stored-duration"];
  const reportChecks = [];
  for (const mode of cases) {
    const caseDir = join(output, `report-${mode}`); mkdirSync(caseDir);
    const baselineLog = join(caseDir, "baseline.log");
    writeFileSync(baselineLog, mode === "missing-default-row" ? baseText.split(/\r?\n/).filter((line) => !/^\s*✔ report sentinel a \(/.test(line)).join("\n") : baseText);
    const parsed = parseText(baseText);
    const recorded = { ...baseResult, ...parsed, log: baselineLog, inventory: mode === "missing-stored-row" ? parsed.inventory.slice(1) : parsed.inventory };
    if (mode === "missing-stored-duration") delete recorded.inventory[0]!.durationMs;
    if (mode === "wrong-stored-duration") recorded.inventory[0]!.durationMs = 654321;
    json(join(caseDir, "results.json"), [recorded]);
    json(join(caseDir, "summary.json"), { valid: true, runs: 1, medianMs: baseResult.elapsedMs, minMs: baseResult.elapsedMs, maxMs: baseResult.elapsedMs, fixture: true });
    const events = eventText.trim().split("\n").map((line) => JSON.parse(line));
    let selected = events;
    if (mode === "missing-profile-event") selected = events.filter((event) => !(event.type === "test:pass" && event.name === "report sentinel a"));
    if (mode === "wrong-profile-total") {
      selected = structuredClone(events);
      selected.find((event) => event.type === "test:summary" && !event.file).counts.tests = 3;
    }
    writeFileSync(join(caseDir, "profile.log"), selected.map((event) => JSON.stringify(event)).join("\n") + "\n" + (mode === "truncated-json" ? '{"type":"test:pass"' : ""));
    json(join(caseDir, "profile-summary.json"), { typecheck: { status: 0, elapsedMs: 0, fixture: true }, profile: profileResult });
    json(join(caseDir, "profile-arguments.json"), { argv: profileArguments(["--test", two]), fixture: true });
    const checked = await execute(process.execPath, [resolve(here, "../../report.ts"), caseDir], dir, `fixture-report-${mode}`);
    assert.equal(checked.status, mode === "good" ? 0 : 1, mode);
    const analysis = JSON.parse(readFileSync(join(caseDir, "profile-analysis.json"), "utf8"));
    assert.equal(analysis.valid, mode === "good", mode);
    if (mode === "missing-profile-event") { assert.equal(analysis.inventory.length, 1); assert.equal(analysis.totals.tests, 2); }
    if (mode === "truncated-json") assert.equal(analysis.diagnostics.length, 1);
    if (mode === "missing-stored-duration" || mode === "wrong-stored-duration") {
      const baseline = JSON.parse(readFileSync(join(caseDir, "baseline-revalidation.json"), "utf8"));
      assert.equal(baseline.valid, false);
      assert.equal(baseline.checks[0].timingDifferences.length, 1);
      assert.equal(JSON.parse(readFileSync(join(caseDir, "baseline-test-times.json"), "utf8")).length, 0);
    }
    reportChecks.push({ mode, expectedExit: mode === "good" ? 0 : 1, actualExit: checked.status });
  }
  json(join(output, "report-integrity-checks.json"), reportChecks);
  json(join(output, "self-test.json"), { pass: true, checks: ["odd/even medians", "pass exit 0", "injected fail exit 1", "all-skip rejected", "summary/inventory", "missing default row rejected", "incomplete rejected", "reporter not inherited", ...cases.map((name) => `report ${name}`)] });
  console.log(`Self-test passed: ${output}`);
}
if (!args.includes("--self-test")) {
  const results = profileOnly ? JSON.parse(readFileSync(join(resolve(profileOnly), "results.json"), "utf8")) : [];
  if (profileOnly) {
    const previous = JSON.parse(readFileSync(join(resolve(profileOnly), "summary.json"), "utf8"));
    assert.equal(previous.valid, true, "Auxiliary profile requires a complete valid baseline");
    assert.equal(previous.runs, runs);
    for (const result of results) {
      const raw = parse(result.log);
      assert.ok(validResult(result, raw), "Raw baseline must remain complete and successful");
      assert.equal(result.complete, true);
      assert.ok(checkInventory(result.totals, result.inventory).complete);
      assert.equal(compareItems(raw.inventory, result.inventory).length, 0);
      assert.ok(Object.keys(raw.totals).every((key) => raw.totals[key] === result.totals[key]));
    }
    json(join(output, "results.json"), results);
  }
  for (let index = 1; !profileOnly && index <= runs; index++) {
    const state = { freeMemory: freemem(), load: powershell("Get-Process | Sort-Object CPU -Descending | Select-Object -First 8 ProcessName,CPU,WorkingSet64 | ConvertTo-Json -Compress") };
    json(join(output, `run-${index}-host.json`), state);
    const measured = await execute(npm[0], npm[1], ownsTemp(`run-${index}`), `run-${index}`);
    const parsed = parse(measured.log);
    results.push({ ...measured, ...parsed });
    json(join(output, "results.json"), results);
    if (!validResult(measured, parsed)) {
      process.exitCode = 1;
      console.error("Invalid baseline attempt retained; stop and escalate before more attempts.");
      break;
    }
  }
  const times = results.map((result: Result) => result.elapsedMs).sort((a: number, b: number) => a - b);
  json(join(output, "summary.json"), { kind: "baseline-summary", scope: "baseline-only; auxiliary result is separate", valid: !process.exitCode && results.length === runs, runs: results.length, medianMs: median(times), minMs: times[0], maxMs: times.at(-1), reusedBaseline: profileOnly || undefined });
  // --profile is optional. It uses the same source argument builder and never contributes to the baseline median.
  if (!process.exitCode && wantsProfile) {
    const dir = ownsTemp("profile");
    const typecheck = await execute(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/c", "npm run typecheck"] : ["run", "typecheck"], dir, "profile-typecheck");
    // Node stops parsing options at its first file argument. Keep reporter before the base glob.
    const argv = profileArguments(testArguments(process.platform));
    json(join(output, "profile-arguments.json"), { argv, base: testArguments(process.platform), files: command("git", ["ls-files", "test/*.test.ts", "test/**/*.test.ts"]) });
    const profile = await execute(process.execPath, argv, dir, "profile");
    json(join(output, "profile-summary.json"), { typecheck, profile, auxiliaryOnly: true });
    if (profile.status !== 0 || typecheck.status !== 0) process.exitCode = 1;
  }
  if (!report(output)) process.exitCode = 1;
  console.log(`Measurement evidence: ${output}`);
}
