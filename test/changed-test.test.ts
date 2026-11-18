import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { sessionFreeEnv, spawnTestChild, tempDir } from "./helpers.ts";
import { executeTest } from "../src/test-runner/runner.ts";
import { matchChangedPath } from "../src/test-runner/changed.ts";
import { runDeclaredCheck, runDeclaredShell } from "../src/project/harness.ts";
import { shellState } from "../src/project/shell-result.ts";

const source = fileURLToPath(new URL("../", import.meta.url));
let app: string | undefined;
function installed() {
  if (app) return app;
  app = join(tempDir("pace-installed-changed-"), "installed home", "app");
  mkdirSync(app, { recursive: true });
  for (const part of ["bin", "src", "templates", "skills", "package.json"]) cpSync(join(source, part), join(app, part), { recursive: true });
  return app;
}
function fixture(branch = "main") {
  const root = tempDir("pace-changed-sample-"), trace = join(tempDir("pace-changed-trace-"), "events.jsonl"), home = tempDir("pace-changed-home-");
  const globalConfig = join(home, "gitconfig"); writeFileSync(globalConfig, "");
  const env: NodeJS.ProcessEnv = { ...sessionFreeEnv(), HOME: home, USERPROFILE: home, PACE_HOME: home, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1", PACE_SAMPLE_TRACE: trace };
  delete env.NODE_TEST_CONTEXT;
  const write = (file: string, body: string) => { mkdirSync(resolve(root, file, ".."), { recursive: true }); writeFileSync(join(root, file), body); };
  const git = (...args: string[]) => { const r = spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  git("init", "-q", "-b", branch); git("config", "user.name", "test"); git("config", "user.email", "test@example.com"); git("config", "core.autocrlf", "false");
  const mark = (name: string) => `require('node:fs').appendFileSync(process.env.PACE_SAMPLE_TRACE,JSON.stringify(${JSON.stringify(name)})+'\\n');`;
  write("full.cjs", mark("full")); write("check.cjs", mark("check"));
  write(".gitignore", "__pycache__/\n");
  write("docs/README.md", "# sample\n\n- 검사: `node full.cjs`\n");
  for (const name of ["a", "b", "common"]) write(`src/${name}.ts`, "export const value = 1;\n");
  for (const name of ["a", "b"]) write(`test/${name}.test.mjs`, `import {test} from 'node:test';import fs from 'node:fs';test('${name}',()=>fs.appendFileSync(process.env.PACE_SAMPLE_TRACE,JSON.stringify('${name}')+'\\n'));\n`);
  const unit = (id: string) => ({ id, sources: [`src/${id}.ts`], tests: [`test/${id}.test.mjs`], runner: { kind: "node-test", cwd: "." }, requires: [] as string[] });
  const map = { version: 1, checks: [{ cwd: ".", command: "node check.cjs" }], common: ["src/common.ts"], units: [unit("a"), unit("b")] };
  const save = () => write(".pace/test-map.json", JSON.stringify(map));
  const commit = () => { save(); git("add", "."); git("commit", "-qm", "sample"); };
  commit();
  const run = (args = ["test", "changed"], extra: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, [join(installed(), "bin/pace.ts"), ...args], { cwd: root, env: { ...env, ...extra }, encoding: "utf8", timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  const events = () => { try { return readFileSync(trace, "utf8").split(/\r?\n|\\n/).filter(Boolean).map(line => JSON.parse(line) as string); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } };
  return { root, home, trace, env, map, write, git, save, commit, run, events, mark };
}

test("changed CLI uses the installed app and the external repository map", () => {
  const f = fixture(); f.write("src/a.ts", "export const value = 2;\n");
  const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(f.events(), ["check", "a"]);
  assert.match(r.stdout, /src\/a\.ts/); assert.match(r.stdout, /test\/a\.test\.mjs/);
  assert.doesNotMatch(r.stdout, /대상: test\/b\.test\.mjs/);
});

test("changed includes staged, unstaged and nested untracked files once per unit", () => {
  const f = fixture(); f.write("src/nested/seed.ts", "export {};\n");
  f.map.units[0]!.sources.push("src/nested/**/*.ts"); f.commit();
  f.write("src/a.ts", "export const value = 2;\n"); f.git("add", "src/a.ts");
  f.write("src/b.ts", "export const value = 3;\n"); f.write("src/nested/new/new.ts", "export {};\n");
  const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(f.events(), ["check", "a", "b"]); assert.match(r.stdout, /src\/nested\/new\/new\.ts/);
});

test("changed runs every related unit and preserves a related failure over a successful full command", () => {
  const f = fixture(); f.write("src/shared.ts", "export {};\n");
  for (const u of f.map.units) u.sources.push("src/shared.ts");
  f.write("test/b.test.mjs", "import {test} from 'node:test';test('related-failure',()=>{throw Error('RELATED_FAILURE')});\n"); f.commit();
  f.write("src/shared.ts", "export {}; // changed\n");
  const r = f.run(); assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /단위 b/); assert.deepEqual(f.events(), ["check", "a"]); assert.doesNotMatch(r.stdout, /전체 검사 통과/);
});

test("changed test files select the entire unit with overlapping test globs deduplicated", () => {
  const f = fixture(); f.write("test/a-extra.test.mjs", "import {test} from 'node:test';import fs from 'node:fs';test('extra',()=>fs.appendFileSync(process.env.PACE_SAMPLE_TRACE,'\"extra\"\\n'));\n");
  f.map.units[0]!.tests.push("test/a*.mjs"); f.commit();
  f.write("test/a.test.mjs", readFileSync(join(f.root, "test/a.test.mjs"), "utf8") + "\n");
  const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(f.events(), ["check", "extra", "a"]);
});

test("changed stops remaining files inside the same unit after an actual failure", () => {
  const f = fixture(); f.write("test/0-fail.test.mjs", "import {test} from 'node:test';test('first',()=>{throw Error('FIRST_FAILURE')});\n");
  f.write("test/z-after.test.mjs", "import {test} from 'node:test';import fs from 'node:fs';test('after',()=>fs.appendFileSync(process.env.PACE_SAMPLE_TRACE,'\"after\"\\n'));\n");
  f.map.units[0]!.tests = ["test/0-fail.test.mjs", "test/z-after.test.mjs"]; f.commit(); f.write("src/a.ts", "export {};\n");
  const r = f.run(); assert.equal(r.status, 1, r.stdout + r.stderr); assert.deepEqual(f.events(), ["check"]);
});

test("changed common, unknown, deleted, renamed and control paths execute the committed full declaration", () => {
  for (const change of ["common", "unknown", "deleted", "renamed", "map", "definition"]) {
    const f = fixture();
    if (change === "common") f.write("src/common.ts", "export {};\n");
    if (change === "unknown") f.write("new-folder/unknown.md", "unknown\n");
    if (change === "deleted") f.git("rm", "src/a.ts");
    if (change === "renamed") f.git("mv", "src/a.ts", "src/renamed.ts");
    if (change === "map") { f.map.checks[0]!.command = "node untrusted.cjs"; f.save(); }
    if (change === "definition") f.write("docs/README.md", "# changed\n- 검사: `node untrusted.cjs`\n");
    const r = f.run(); assert.equal(r.status, 0, change + r.stdout + r.stderr);
    assert.deepEqual(f.events(), ["full"], change); assert.match(r.stdout, /전체 검사 전환/); assert.match(r.stdout, /전체 검사 통과/);
  }
});

test("changed conflict, executable mode and gitlink states cannot become a partial success", () => {
  for (const kind of ["conflict", "mode", "gitlink"]) {
    const f = fixture();
    if (kind === "mode") f.git("update-index", "--chmod=+x", "src/a.ts");
    if (kind === "gitlink") { mkdirSync(join(f.root, "module")); f.git("update-index", "--add", "--cacheinfo", `160000,${f.git("rev-parse", "HEAD").trim()},module`); }
    if (kind === "conflict") {
      f.git("checkout", "-qb", "topic"); f.write("src/a.ts", "export const value = 2;\n"); f.commit();
      f.git("checkout", "-q", "main"); f.write("src/a.ts", "export const value = 3;\n"); f.commit();
      const merged = spawnSync("git", ["-C", f.root, "merge", "topic"], { env: f.env, encoding: "utf8" }); assert.notEqual(merged.status, 0);
    }
    const r = f.run(); assert.equal(r.status, 0, kind + r.stdout + r.stderr); assert.deepEqual(f.events(), ["full"]);
    assert.match(r.stdout, /충돌|모드|submodule/);
  }
});

test("changed preserves staged deletion when the same working path remains untracked", () => {
  const f = fixture(); f.git("rm", "--cached", "--", "src/a.ts");
  assert.ok(existsSync(join(f.root, "src/a.ts")));
  const status = f.git("status", "--porcelain=v1", "-z", "--untracked-files=all"), raw = f.git("diff", "--cached", "--raw", "-z", "--no-renames");
  assert.ok(status.includes("D  src/a.ts\0") && status.includes("?? src/a.ts\0"));
  const index = readFileSync(join(f.root, ".git/index")), r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["full"], JSON.stringify({ status, raw, output: r.stdout }));
  assert.match(r.stdout, /전체 검사 전환/); assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
});

test("changed treats assume-unchanged and skip-worktree as uncertain without mutating flags", () => {
  const observed = [];
  for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
    const f = fixture();
    f.write("test/b.test.mjs", "import {test} from 'node:test';import assert from 'node:assert/strict';import {value} from '../src/b.ts';test('hidden B must fail',()=>assert.equal(value,1));\n");
    f.write("full.cjs", f.mark("full") + "const r=require('node:child_process').spawnSync(process.execPath,['--test','test/a.test.mjs','test/b.test.mjs'],{stdio:'inherit'});process.exitCode=r.status??1;\n");
    f.commit(); f.git("update-index", flag, "src/b.ts"); f.write("src/b.ts", "export const value = 2;\n"); f.write("src/a.ts", "export const value = 2;\n");
    assert.equal(f.run(["test", "unit", "b"]).status, 1, "the hidden related B test actually fails");
    const flags = f.git("ls-files", "-v", "-z"), index = readFileSync(join(f.root, ".git/index")), r = f.run();
    assert.equal(f.git("ls-files", "-v", "-z"), flags); assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
    observed.push({ flag, status: r.status, fullExecuted: f.events().includes("full"), partialPassed: r.stdout.includes("판정: 부분 통과"), output: r.stdout });
  }
  assert.ok(observed.every(item => item.status === 1 && item.fullExecuted && !item.partialPassed), JSON.stringify(observed));
});

test("changed sparse checkout and sparse-index policies execute full without rewriting the index", () => {
  for (const kind of ["configured-sparse", "sparse-index", "actual-sparse"]) {
    const f = fixture();
    if (kind === "configured-sparse") f.git("config", "core.sparseCheckout", "true");
    if (kind === "sparse-index") f.git("config", "index.sparse", "true");
    if (kind === "actual-sparse") { f.git("sparse-checkout", "init", "--cone"); f.git("sparse-checkout", "set", "src", "test"); }
    f.write("src/a.ts", "export const value = 2;\n");
    const flags = f.git("ls-files", "-v", "-z"), index = readFileSync(join(f.root, ".git/index")), r = f.run();
    assert.equal(r.status, 0, kind + r.stdout + r.stderr); assert.deepEqual(f.events(), ["full"]);
    assert.match(r.stdout, /숨김 인덱스|sparse 추적/); assert.equal(f.git("ls-files", "-v", "-z"), flags); assert.deepEqual(readFileSync(join(f.root, ".git/index")), index);
  }
});

test("changed converts a post-check selected-path exception to unavailable without a success retry", () => {
  const f = fixture(); f.write("remove-test.cjs", f.mark("check") + "require('node:fs').unlinkSync('test/a.test.mjs');\n");
  f.map.checks = [{ cwd: ".", command: "node remove-test.cjs" }]; f.commit(); f.write("src/a.ts", "export {};\n");
  const r = f.run(); assert.equal(r.status, 3, r.stdout + r.stderr); assert.deepEqual(f.events(), ["check"]);
});

test("changed supports master and HEAD fallbacks while legacy all keeps its main boundary", () => {
  for (const branch of ["master", "trunk"]) {
    const f = fixture(branch); f.write("unknown.md", "unknown\n");
    const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["full"]);
    assert.match(r.stdout, branch === "master" ? /선언 기준: master/ : /선언 기준: HEAD/);
    const old = f.run(["test", "all"]); assert.equal(old.status, 1, "legacy all still requires its main declaration");
    assert.deepEqual(f.events(), ["full"]);
  }
});

test("changed never adopts committed feature-branch checks over the selected main map", () => {
  const f = fixture(); f.git("checkout", "-qb", "feature");
  f.write("new-check.cjs", f.mark("unreviewed-check")); f.map.checks[0]!.command = "node new-check.cjs"; f.commit();
  f.write("src/a.ts", "export {};\n"); const r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["full"]); assert.match(r.stdout, /작업본 map이 기준 commit과 다름/);
});

test("changed distinguishes no changes, unborn, outside Git, missing Git and damaged refs", () => {
  const clean = fixture(); assert.equal(clean.run().status, 3); assert.deepEqual(clean.events(), []);
  const unborn = fixture(); unborn.git("checkout", "--orphan", "empty"); assert.equal(unborn.run().status, 3); assert.deepEqual(unborn.events(), []);
  const outside = fixture(); const r = spawnSync(process.execPath, [join(installed(), "bin/pace.ts"), "test", "changed"], { cwd: tempDir("pace-outside-git-"), env: outside.env, encoding: "utf8" });
  assert.equal(r.status, 3, r.stdout + r.stderr); assert.deepEqual(outside.events(), []);
  const noGit = fixture(); assert.equal(noGit.run(undefined, { PATH: tempDir("pace-empty-path-") }).status, 3); assert.deepEqual(noGit.events(), []);
  const damaged = fixture("master"); damaged.write(".git/refs/heads/main", "not-a-hash\n");
  assert.equal(damaged.run().status, 3); assert.deepEqual(damaged.events(), []);
});

test("changed missing or unsupported map/checks falls back and full absence/failure remains distinct", () => {
  for (const kind of ["checks-missing", "checks-empty", "runner", "config", "requires"]) {
    const f = fixture();
    if (kind === "checks-missing") delete (f.map as { checks?: unknown }).checks;
    if (kind === "checks-empty") f.map.checks = [];
    if (kind === "runner") f.map.units[0]!.runner.kind = "unsupported";
    if (kind === "config") { f.write("runner.config", "config\n"); Object.assign(f.map.units[0]!.runner, { config: "runner.config" }); }
    if (kind === "requires") f.map.units[0]!.requires.push("service");
    f.commit(); f.write("src/a.ts", "export {};\n");
    const r = f.run(); assert.equal(r.status, 0, kind + r.stdout + r.stderr);
    assert.deepEqual(f.events(), kind === "checks-empty" ? ["a"] : ["full"]);
  }
  const absent = fixture(); absent.write("docs/README.md", "# no declaration\n"); absent.commit(); absent.write("unknown.md", "x");
  assert.equal(absent.run().status, 3); assert.deepEqual(absent.events(), []);
  const failed = fixture(); failed.write("full.cjs", failed.mark("full") + "process.exitCode=7;"); failed.commit(); failed.write("unknown.md", "x");
  assert.equal(failed.run().status, 1); assert.deepEqual(failed.events(), ["full"]);
  for (const kind of ["missing-map", "malformed-map"]) {
    const f = fixture();
    if (kind === "missing-map") f.git("rm", ".pace/test-map.json"); else { f.write(".pace/test-map.json", "{ invalid JSON"); f.git("add", ".pace/test-map.json"); }
    f.git("commit", "-qm", kind); f.write("src/a.ts", "export {};\n");
    const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["full"]);
  }
});

test("changed shell checks use the declared cwd and Git sh syntax and stop on failure", () => {
  const f = fixture(); f.write("tools/check.cjs", f.mark("nested-check"));
  const command = 'PACE_SH_SENTINEL=ok; test "$PACE_SH_SENTINEL" = ok && node check.cjs';
  f.map.checks = [{ cwd: "tools", command }]; f.commit(); f.write("src/a.ts", "export {};\n");
  const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["nested-check", "a"]);
  if (process.platform === "win32") {
    const wrong = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", command], { cwd: join(f.root, "tools"), env: f.env, encoding: "utf8" });
    assert.notEqual(wrong.status, 0, "cmd cannot satisfy the POSIX shell sentinel"); assert.deepEqual(f.events(), ["nested-check", "a"]);
  }
  const bad = fixture(); bad.write("check.cjs", bad.mark("check") + "process.exitCode=7;");
  bad.map.checks.push({ cwd: ".", command: "node full.cjs" }); bad.commit(); bad.write("src/a.ts", "export {};\n");
  const failed = bad.run(); assert.equal(failed.status, 1, failed.stdout + failed.stderr); assert.deepEqual(bad.events(), ["check"]);
});

test("changed rejects escaping cwd/tests and handles special paths without shell interpolation", () => {
  for (const kind of ["cwd", "tests", "typechange"]) {
    const f = fixture(), outside = tempDir("pace-changed-external-");
    writeFileSync(join(outside, "outside.test.mjs"), "throw Error('OUTSIDE_MUST_NOT_RUN');\n");
    symlinkSync(outside, join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
    if (kind === "cwd") f.map.checks[0]!.cwd = "linked";
    if (kind === "tests") f.map.units[0]!.tests = ["linked/*.mjs"];
    f.commit();
    if (kind === "typechange") { f.git("rm", "src/a.ts"); symlinkSync(join(outside, "outside.test.mjs"), join(f.root, "src/a.ts"), "file"); }
    else f.write("src/a.ts", "export {};\n");
    const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["full"]);
    assert.match(readFileSync(join(outside, "outside.test.mjs"), "utf8"), /OUTSIDE_MUST_NOT_RUN/);
  }
  const f = fixture(), name = "src/a space;한글.ts"; f.write(name, "export {};\n"); f.map.units[0]!.sources.push(name); f.commit(); f.write(name, "export {}; // changed\n");
  const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["check", "a"]);
});

test("changed Windows matching is conservative across case while POSIX stays case sensitive", () => {
  assert.equal(matchChangedPath("SRC/A.TS", "src/*.ts", "win32"), true);
  assert.equal(matchChangedPath("SRC/A.TS", "src/*.ts", "linux"), false);
  if (process.platform !== "win32") return;
  const f = fixture(); f.map.units[0]!.sources = ["SRC/A.TS"]; f.commit(); f.write("src/a.ts", "export {};\n");
  const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["check", "a"]);
});

test("changed does not read an escaping working definition during full fallback", () => {
  const f = fixture(), outside = tempDir("pace-external-definition-");
  writeFileSync(join(outside, "README.md"), "# external\n- 검사: `node outside.cjs`\n");
  f.git("rm", "docs/README.md"); mkdirSync(join(f.root, "docs"), { recursive: true }); symlinkSync(join(outside, "README.md"), join(f.root, "docs/README.md"), "file");
  const r = f.run(); assert.equal(r.status, 3, r.stdout + r.stderr); assert.deepEqual(f.events(), []);
});

test("changed empty/all-skip tests fail and unknown Python results trigger the actual full check", () => {
  for (const body of ["", "import {test} from 'node:test';test.skip('skip',()=>{});\n"]) {
    const f = fixture(); f.write("test/a.test.mjs", body); f.commit(); f.write("src/a.ts", "export {};\n");
    const r = f.run(); assert.equal(r.status, 1, r.stdout + r.stderr); assert.deepEqual(f.events(), ["check"]);
  }
  const f = fixture(); f.write("pkg/__init__.py", ""); f.write("pkg/value.py", "VALUE = 1\n");
  f.write("test/test_sample.py", "import unittest\nimport os, json\nfrom pkg.value import VALUE\nclass Sample(unittest.TestCase):\n def test_value(self):\n  self.assertEqual(VALUE, 1)\n  with open(os.environ['PACE_SAMPLE_TRACE'], 'a') as stream: stream.write(json.dumps('py')+'\\n')\n");
  f.map.units.push({ id: "py", sources: ["pkg/value.py"], tests: ["test/test_sample.py"], runner: { kind: "python-unittest", cwd: "." }, requires: [] });
  f.commit(); f.write("pkg/value.py", "VALUE = 1 # changed\n"); const good = f.run(); assert.equal(good.status, 0, good.stdout + good.stderr); assert.deepEqual(f.events(), ["check", "py"]);
  writeFileSync(f.trace, ""); const site = tempDir("pace-python-unknown-"); writeFileSync(join(site, "sitecustomize.py"), "import os\nos._exit(0)\n");
  const unknown = f.run(undefined, { PYTHONPATH: site }); assert.equal(unknown.status, 0, unknown.stdout + unknown.stderr);
  assert.deepEqual(f.events(), ["check", "full"], unknown.stdout + unknown.stderr); assert.match(unknown.stdout, /선택 시험 결과 확인 불가/); assert.match(unknown.stdout, /전체 검사 통과/);
});

test("Windows changed missing Python start falls back while legacy unit keeps its failure", { skip: process.platform !== "win32" ? "Windows PATH and Git sh fixture" : false }, () => {
  const f = fixture(); f.write("pkg/value.py", "VALUE=1\n"); f.write("test/test_missing.py", "import unittest\nclass Sample(unittest.TestCase):\n def test_ok(self): self.assertTrue(True)\n");
  f.map.units.push({ id: "py", sources: ["pkg/value.py"], tests: ["test/test_missing.py"], runner: { kind: "python-unittest", cwd: "." }, requires: [] });
  f.commit(); f.write("pkg/value.py", "VALUE=1 # changed\n");
  const gitRoot = resolve(f.git("--exec-path").trim(), "../../..");
  const gitBin = [join(gitRoot, "cmd"), join(gitRoot, "bin")].find(folder => existsSync(join(folder, "git.exe"))); assert.ok(gitBin);
  const env = { PATH: [gitBin, dirname(process.execPath)].join(delimiter) };
  const old = f.run(["test", "unit", "py"], env); assert.equal(old.status, 1); assert.deepEqual(f.events(), []);
  const r = f.run(undefined, env); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["check", "full"]);
  assert.match(r.stdout, /실행 시작 확인 불가/); assert.match(r.stdout, /전체 검사 통과/);
});

test("shell execution state distinguishes real timeout/overflow and missing executables", async () => {
  const f = fixture(); f.write("wait.cjs", "require('node:fs').writeFileSync('wait.pid',String(process.pid));setTimeout(()=>{},200);\n");
  const timed = runDeclaredShell(f.root, "node wait.cjs", 60);
  assert.equal(timed.execution, "failed"); assert.equal(timed.started, true); assert.equal(timed.errorCode, "ETIMEDOUT");
  const overflow = runDeclaredShell(f.root, 'node -e "require(\'node:fs\').writeFileSync(\'overflow.pid\',String(process.pid));setTimeout(()=>process.exit(0),250);process.stdout.write(String.fromCharCode(120).repeat(18*1024*1024))"');
  assert.equal(overflow.execution, "failed"); assert.equal(overflow.started, true); assert.equal(overflow.errorCode, "ENOBUFS");
  const missing = spawnSync(join(f.root, "not-an-executable"), [], { encoding: "utf8" });
  assert.equal((missing.error as NodeJS.ErrnoException).code, "ENOENT"); assert.deepEqual(shellState(missing), { execution: "unavailable", started: false });
  assert.deepEqual(shellState({ pid: 10, status: null, signal: "SIGTERM" }), { execution: "interrupted", started: true });
  assert.throws(() => runDeclaredCheck(f.root, "--invalid-revision"), /commit SHA/);
  for (const file of ["wait.pid", "overflow.pid"]) {
    if (!existsSync(join(f.root, file))) continue;
    const pid = Number(readFileSync(join(f.root, file), "utf8")); assert.ok(pid > 0);
    let alive = true;
    for (let attempt = 0; attempt < 100 && alive; attempt++) {
      try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 20)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; else throw error; }
    }
    assert.equal(alive, false, `finite test-owned child ${pid} must exit before temporary cleanup`);
  }
});

test("changed check timeout and parent OS termination never continue into tests or full fallback", async () => {
  const f = fixture(); f.write("check.cjs", "setTimeout(()=>{},200);\n"); f.commit(); f.write("src/a.ts", "export {};\n");
  const timed = await executeTest(f.root, ["changed"], 60); assert.equal(timed.code, 1, timed.text); assert.deepEqual(f.events(), []);
  await new Promise(resolve => setTimeout(resolve, 250));
  const parent = fixture(); parent.write("check.cjs", parent.mark("started") + "require('node:fs').writeFileSync('parent-check.pid',String(process.pid));setTimeout(()=>{},700);\n"); parent.commit(); parent.write("src/a.ts", "export {};\n");
  const child = spawnTestChild(process.execPath, [join(installed(), "bin/pace.ts"), "test", "changed"], { cwd: parent.root, env: parent.env, stdio: "ignore" });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  for (let count = 0; count < 150 && !existsSync(parent.trace); count++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(existsSync(parent.trace), "check started"); child.kill("SIGTERM");
  const result = await closed; assert.ok(result.code !== 0 || result.signal);
  const pid = Number(readFileSync(join(parent.root, "parent-check.pid"), "utf8")); assert.ok(pid > 0);
  let alive = true;
  for (let attempt = 0; attempt < 100 && alive; attempt++) {
    try { process.kill(pid, 0); await new Promise(resolve => setTimeout(resolve, 20)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; else throw error; }
  }
  assert.equal(alive, false, "finite parent-termination fixture child must exit");
  assert.deepEqual(parent.events(), ["started"]);
});

test("installed Windows entry and copied real Node/Python drivers execute outside the checkout", () => {
  const f = fixture(); f.write("pkg/value.py", "VALUE = 1\n");
  f.write("test/test_copy.py", "import unittest, os, json\nclass Sample(unittest.TestCase):\n def test_copy(self):\n  with open(os.environ['PACE_SAMPLE_TRACE'],'a') as stream: stream.write(json.dumps('py')+'\\n')\n");
  f.map.units.push({ id: "py", sources: ["pkg/value.py"], tests: ["test/test_copy.py"], runner: { kind: "python-unittest", cwd: "." }, requires: [] });
  f.commit(); f.write("src/a.ts", "export {};\n"); f.write("pkg/value.py", "VALUE = 1 # changed\n");
  const pristine = f.run(); assert.equal(pristine.status, 0, pristine.stdout + pristine.stderr); assert.deepEqual(f.events(), ["check", "py", "a"]);
  assert.equal(existsSync(join(installed(), "node_modules")), false);
  const copied = ["node-driver.mjs", "python-driver.py"].map(name => {
    const original = readFileSync(join(source, "src/test-runner", name)), target = join(installed(), "src/test-runner", name);
    assert.deepEqual(readFileSync(target), original);
    return { name, original, target, sha256: createHash("sha256").update(original).digest("hex") };
  });
  try {
    writeFileSync(copied[0]!.target, Buffer.concat([Buffer.from('process.stderr.write("COPIED_NODE_DRIVER " + import.meta.url + "\\n");\n'), copied[0]!.original]));
    writeFileSync(copied[1]!.target, Buffer.concat([Buffer.from('import sys\nsys.stderr.write("COPIED_PY_DRIVER " + __file__ + "\\n")\n'), copied[1]!.original]));
    writeFileSync(f.trace, ""); const observed = f.run(); assert.equal(observed.status, 0, observed.stdout + observed.stderr);
    assert.match(observed.stdout, /COPIED_NODE_DRIVER file:/); assert.ok(observed.stdout.includes(copied[1]!.target));
    assert.deepEqual(f.events(), ["check", "py", "a"]);
    if (process.platform === "win32") {
      const bin = resolve(installed(), "../bin"); mkdirSync(bin, { recursive: true }); const shim = join(bin, "pace.cmd");
      writeFileSync(shim, `@echo off\r\nnode "${join(installed(), "bin/pace.ts")}" %*\r\n`);
      writeFileSync(f.trace, "");
      const result = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `""${shim}" test changed"`], { cwd: join(f.root, "src"), env: f.env, encoding: "utf8", timeout: 30000, windowsVerbatimArguments: true });
      assert.equal(result.status, 0, result.stdout + result.stderr); assert.deepEqual(f.events(), ["check", "py", "a"]);
    }
    console.log(JSON.stringify({ installedEntry: join(installed(), "bin/pace.ts"), runtimeDependencies: false, pristineAndObservedPassed: true, copiedDrivers: copied.map(({ name, sha256, target }) => ({ name, sha256, target })), posixShimExecuted: false }));
  } finally { for (const item of copied) writeFileSync(item.target, item.original); }
});

test("the user README map example runs unchanged through the installed CLI", () => {
  const text = readFileSync(join(source, "README.md"), "utf8");
  const example = /<!-- pace:changed-example -->\r?\n```json\r?\n([\s\S]*?)\r?\n```/.exec(text); assert.ok(example);
  const f = fixture(); f.write("package.json", JSON.stringify({ scripts: { typecheck: "node check.cjs" } }));
  f.write("tsconfig.json", "{}\n"); f.write("src/shared.ts", "export {};\n"); f.write("src/feature/value.ts", "export const value = 1;\n");
  f.write("test/feature.test.mjs", "import {test} from 'node:test';import fs from 'node:fs';test('feature',()=>fs.appendFileSync(process.env.PACE_SAMPLE_TRACE,'\"feature\"\\n'));\n");
  f.write(".pace/test-map.json", example[1]!); f.git("add", "."); f.git("commit", "-qm", "documented map"); f.write("src/feature/value.ts", "export const value = 2;\n");
  const r = f.run(); assert.equal(r.status, 0, r.stdout + r.stderr); assert.deepEqual(f.events(), ["check", "feature"]);
});
