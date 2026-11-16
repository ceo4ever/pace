import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { testArguments, testExitCode } from "../scripts/test.ts";
import { sessionFreeEnv, tempDir } from "./helpers.ts";

test("기본 테스트 명령은 Windows에서만 파일을 순차 실행하고 추가 인자를 전달한다", () => {
  const extra = ["--test-name-pattern=예시", "test/추가.test.ts"];
  assert.deepEqual(testArguments("win32", extra), ["--test", "--test-concurrency=1", "test/**/*.test.ts", ...extra]);
  for (const platform of ["linux", "darwin"] as const) assert.deepEqual(testArguments(platform, extra), ["--test", "test/**/*.test.ts", ...extra]);
  assert.equal(testExitCode(0), 0);
  assert.equal(testExitCode(7), 7);
  assert.notEqual(testExitCode(null), 0, "신호·실행 실패는 성공이 아니다");
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
