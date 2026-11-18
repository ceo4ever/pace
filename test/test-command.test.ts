import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { testArguments, testExitCode } from "../scripts/test.ts";
import { sessionFreeEnv, tempDir } from "./helpers.ts";

test("기본 테스트 명령의 Windows 동시성과 추가 옵션·파일 전달을 보존한다", () => {
  const extra = ["--test-name-pattern=예시", "test/추가.test.ts"];
  assert.deepEqual(testArguments("win32", extra), ["--test", "--test-concurrency=4", extra[0], "test/**/*.test.ts", extra[1]]);
  for (const platform of ["linux", "darwin"] as const) assert.deepEqual(testArguments(platform, extra), ["--test", extra[0], "test/**/*.test.ts", extra[1]]);
  assert.equal(testExitCode(0), 0);
  assert.equal(testExitCode(7), 7);
  assert.notEqual(testExitCode(null), 0, "신호·실행 실패는 성공이 아니다");
});

test("runner options: mixed files, split values, separator and unique concurrency override", () => {
  const actual = testArguments("win32", ["extra.test.ts", "--test-name-pattern", "two words", "--test-concurrency", "2", "--test-only"]);
  assert.deepEqual(actual, ["--test", "--test-name-pattern", "two words", "--test-concurrency=2", "--test-only", "test/**/*.test.ts", "extra.test.ts"]);
  assert.equal(actual.filter(arg => arg.startsWith("--test-concurrency")).length, 1);
  assert.deepEqual(testArguments("linux", ["--test-concurrency=8", "--", "-literal.test.ts"]), ["--test", "--test-concurrency=8", "--", "test/**/*.test.ts", "-literal.test.ts"]);
  for (const extra of [["--test-concurrency=0"], ["--test-concurrency=-2"], ["--test-concurrency=1.5"], ["--test-concurrency"], ["--test-concurrency=2", "--test-concurrency=4"], ["--test-name-pattern"], ["--unknown-split", "value"]]) {
    assert.throws(() => testArguments("win32", extra), /concurrency|value|option/i);
  }
});

test("runner npm: actual overlap is RED at one, GREEN at two, with filter and failure forwarding", () => {
  const runner = fileURLToPath(new URL("../scripts/test.ts", import.meta.url));
  const prepare = () => {
    const root = tempDir(); mkdirSync(join(root, "test")); mkdirSync(join(root, "marks"));
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { check: "node typecheck.cjs && npm test", test: `node ${JSON.stringify(runner.replace(/\\/g, "/"))}` } }));
    writeFileSync(join(root, "typecheck.cjs"), `require('node:fs').writeFileSync(${JSON.stringify(join(root, "typechecked"))},'ok');`);
    const body = `const {test}=require('node:test');const fs=require('node:fs');const path=require('node:path');const root=${JSON.stringify(root)},marks=path.join(root,'marks'),release=path.join(root,'release');
test('overlap-sentinel',async()=>{const entered=Date.now(),marker=path.join(marks,path.basename(__filename));fs.writeFileSync(marker,String(process.pid));try{const deadline=Date.now()+3000;while(!fs.existsSync(release)){if(fs.readdirSync(marks).length===2){fs.writeFileSync(release,'ok');break;}if(Date.now()>deadline)throw Error('OVERLAP_NOT_OBSERVED');await new Promise(r=>setTimeout(r,25));}fs.appendFileSync(path.join(root,'observed.jsonl'),JSON.stringify({pid:process.pid,entered,passedAt:Date.now()})+'\\n');}finally{fs.rmSync(marker,{force:true});}});
test('excluded-sentinel',()=>{fs.writeFileSync(path.join(root,'excluded-executed'),'bad');throw Error('FILTER_SENTINEL_EXECUTED');});`;
    writeFileSync(join(root, "test/a.test.ts"), body + "\ntest('failure-sentinel',()=>{throw Error('EXPECTED_NPM_FAILURE');});\n");
    writeFileSync(join(root, "test/b.test.ts"), body);
    return root;
  };
  const run = (root: string, concurrency: number, pattern: string) => {
    const args = ["run", "check", "--", "--", `--test-concurrency=${concurrency}`, `--test-name-pattern=${pattern}`];
    return spawnSync(process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args, { cwd: root, env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined }, encoding: "utf8", timeout: 20000 });
  };
  const serial = prepare(), red = run(serial, 1, "overlap-sentinel");
  assert.notEqual(red.status, 0);
  assert.match(red.stdout + red.stderr, /OVERLAP_NOT_OBSERVED/);
  const concurrent = prepare(), green = run(concurrent, 2, "overlap-sentinel");
  assert.equal(green.status, 0, green.stdout + green.stderr);
  assert.ok(existsSync(join(concurrent, "typechecked")), "the real check script must run its typecheck step");
  assert.equal(existsSync(join(concurrent, "excluded-executed")), false, "name filtering must reach Node before file arguments");
  const records = readFileSync(join(concurrent, "observed.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as { pid: number; entered: number; passedAt: number });
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map(record => record.pid)).size, 2);
  assert.ok(Math.max(...records.map(record => record.entered)) <= Math.min(...records.map(record => record.passedAt)), "worker intervals must overlap");
  const failed = run(concurrent, 2, "failure-sentinel");
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout + failed.stderr, /EXPECTED_NPM_FAILURE/);
});

test("기본 테스트 실행기는 실제 테스트의 성공과 실패를 전달한다", () => {
  const root = tempDir();
  const dir = join(root, "test"); mkdirSync(dir);
  const fixture = join(dir, "sample.test.ts");
  const runner = fileURLToPath(new URL("../scripts/test.ts", import.meta.url));
  const run = (extra: string[] = []) => spawnSync(process.execPath, [runner, ...extra], { cwd: root, env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined }, encoding: "utf8", timeout: 30000 });
  writeFileSync(fixture, 'import {test} from "node:test"; test("ok",()=>{});\n');
  const passed = run();
  assert.equal(passed.status, 0, passed.stdout + passed.stderr);
  assert.match(passed.stdout, /ok/);
  writeFileSync(join(root, "extra.test.ts"), 'import {test} from "node:test"; test("extra-selected",()=>{});\n');
  const extra = run(["extra.test.ts"]);
  assert.equal(extra.status, 0, extra.stdout + extra.stderr);
  assert.match(extra.stdout, /extra-selected/, "추가 테스트 파일도 실제 러너에 전달된다");
  writeFileSync(fixture, 'import {test} from "node:test"; test("fails",()=>{throw Error("EXPECTED_TEST_FAILURE")});\n');
  const failed = run();
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout + failed.stderr, /EXPECTED_TEST_FAILURE/);
});

test("테스트 러너가 신호로 종료되면 실행기는 실패와 신호를 전달한다", () => {
  const root = tempDir(), preload = join(root, "signal.mjs");
  writeFileSync(preload, 'import cp from "node:child_process"; import {EventEmitter} from "node:events"; import {syncBuiltinESMExports} from "node:module"; cp.spawn=()=>{const child=new EventEmitter();child.pid=0;setImmediate(()=>child.emit("close",null,"SIGTERM"));return child}; syncBuiltinESMExports();');
  const runner = fileURLToPath(new URL("../scripts/test.ts", import.meta.url));
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, runner], { cwd: root, env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SIGTERM/);
});

test("테스트 러너 실행 오류만 발생해도 실행기는 실패한다", () => {
  const root = tempDir(), preload = join(root, "spawn-error.mjs");
  writeFileSync(preload, 'import cp from "node:child_process"; import {EventEmitter} from "node:events"; import {syncBuiltinESMExports} from "node:module"; cp.spawn=()=>{const child=new EventEmitter();setImmediate(()=>child.emit("error",new Error("EXPECTED_SPAWN_ERROR")));return child}; syncBuiltinESMExports();');
  const runner = fileURLToPath(new URL("../scripts/test.ts", import.meta.url));
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, runner], { cwd: root, env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /EXPECTED_SPAWN_ERROR/);
});

test("테스트 자식을 띄우는 중 받은 신호도 자식에 전달한다", () => {
  const root = tempDir(), preload = join(root, "early-signal.mjs"), marker = join(root, "forwarded");
  writeFileSync(preload, `import cp from "node:child_process";import fs from "node:fs";import {EventEmitter} from "node:events";import {syncBuiltinESMExports} from "node:module";
cp.spawn=()=>{const child=new EventEmitter();child.kill=(sig)=>{fs.writeFileSync(${JSON.stringify(marker)},sig);setImmediate(()=>child.emit("close",null,sig));return true};process.emit("SIGTERM");return child};syncBuiltinESMExports();`);
  const runner = fileURLToPath(new URL("../scripts/test.ts", import.meta.url));
  const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, runner], { cwd: root, env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined }, encoding: "utf8", timeout: 5000 });
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(marker, "utf8"), "SIGTERM");
});

test("signal forwarding: 실행기가 신호를 받으면 테스트 자식에도 전달한다", async () => {
  const root = tempDir(), runner = fileURLToPath(new URL("../scripts/test.ts", import.meta.url));
  const env = { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined };
  if (process.platform === "win32") {
    const preload = join(root, "forward.mjs"), marker = join(root, "forwarded");
    writeFileSync(preload, `import cp from "node:child_process";import fs from "node:fs";import {EventEmitter} from "node:events";import {syncBuiltinESMExports} from "node:module";
cp.spawn=()=>{const child=new EventEmitter();child.pid=123;child.kill=(sig)=>{fs.writeFileSync(${JSON.stringify(marker)},sig);setImmediate(()=>child.emit("close",null,sig));return true};setImmediate(()=>process.emit("SIGTERM"));return child};syncBuiltinESMExports();`);
    const result = spawnSync(process.execPath, [`--import=${pathToFileURL(preload).href}`, runner], { cwd: root, env, encoding: "utf8", timeout: 5000 });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(marker, "utf8"), "SIGTERM");
    return;
  }
  const dir = join(root, "test"), marker = join(root, "pids.json"); mkdirSync(dir);
  writeFileSync(join(dir, "hang.test.ts"), `import {test} from "node:test"; import {writeFileSync} from "node:fs";
test("hang",()=>{writeFileSync(${JSON.stringify(marker)},JSON.stringify({runner:process.ppid,worker:process.pid}));setTimeout(()=>process.exit(0),10000);});`);
  const child = spawn(process.execPath, [runner], { cwd: root, env, stdio: "ignore" });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  for (let i = 0; i < 200 && !existsSync(marker); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(existsSync(marker), "테스트 자식이 시작돼야 한다");
  const pids = JSON.parse(readFileSync(marker, "utf8")) as { runner: number; worker: number };
  child.kill("SIGTERM");
  const result = await exited;
  assert.ok(result.signal || result.code !== 0, "신호 종료는 성공이 아니다");
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  for (let i = 0; i < 40 && (alive(pids.runner) || alive(pids.worker)); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(alive(pids.runner), false, "테스트 러너가 남지 않는다");
  assert.equal(alive(pids.worker), false, "테스트 자식이 남지 않는다");

  // 테스트 전용 그룹을 만들고 강제 종료해 기존 POSIX 그룹 종료 계약도 확인한다.
  const marker2 = join(root, "group-pids.json");
  writeFileSync(join(dir, "hang.test.ts"), `import {test} from "node:test"; import {writeFileSync} from "node:fs";
test("hang",()=>{writeFileSync(${JSON.stringify(marker2)},JSON.stringify({runner:process.ppid,worker:process.pid}));setTimeout(()=>process.exit(0),10000);});`);
  const group = spawn(process.execPath, [runner], { cwd: root, env, stdio: "ignore", detached: true });
  const groupExited = new Promise<void>((resolve) => group.on("exit", () => resolve()));
  for (let i = 0; i < 200 && !existsSync(marker2); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(existsSync(marker2), "그룹의 테스트 자식이 시작돼야 한다");
  const grouped = JSON.parse(readFileSync(marker2, "utf8")) as { runner: number; worker: number };
  assert.ok(group.pid);
  process.kill(-group.pid, "SIGKILL");
  await groupExited;
  for (let i = 0; i < 40 && (alive(grouped.runner) || alive(grouped.worker)); i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(alive(grouped.runner), false, "그룹 강제 종료 후 테스트 러너가 남지 않는다");
  assert.equal(alive(grouped.worker), false, "그룹 강제 종료 후 테스트 자식이 남지 않는다");
});
