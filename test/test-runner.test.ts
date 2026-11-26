import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, symlinkSync, readFileSync, existsSync, chmodSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { executeTest } from "../src/test-runner/runner.ts";
import { PACE_BIN, runPace, sessionFreeEnv, spawnTestChild, tempDir } from "./helpers.ts";

function fixture() {
  const root = tempDir("pace-runner-");
  const write = (file: string, body: string) => { mkdirSync(join(root, file, ".."), { recursive: true }); writeFileSync(join(root, file), body); };
  const git = (...args: string[]) => { const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };
  git("init", "-q", "-b", "main"); git("config", "user.name", "test"); git("config", "user.email", "test@example.com");
  write("docs/README.md", "# app\n\n- 검사: `node -e \"process.exit(0)\"`\n");
  write("src/a.ts", "export const a = 1;\n"); write("src/shared.ts", "export const shared = 1;\n");
  write("test/pass.test.mjs", "import {test} from 'node:test'; test('works',()=>{});\n");
  write("test/empty.test.mjs", ""); write("test/skip.test.mjs", "import {test} from 'node:test'; test.skip('skip',()=>{});\n");
  write("test/fail.test.mjs", "import {test} from 'node:test'; test('bad',()=>{throw Error('bad')});\n");
  write("pkg/__init__.py", "VALUE = 7\n");
  write("test/test_pass.py", "import unittest\nimport pkg\nclass Sample(unittest.TestCase):\n def test_ok(self): self.assertEqual(pkg.VALUE, 7)\n");
  write("test/test_skip.py", "import unittest\nclass Sample(unittest.TestCase):\n @unittest.skip('x')\n def test_skip(self): pass\n");
  const unit = (id: string, tests: string[], kind = "node-test") => ({ id, sources: ["src/a.ts"], tests, runner: { kind, cwd: "." }, requires: [] as string[] });
  const map = { version: 1, common: ["src/shared.ts"], units: [unit("good", ["test/pass.test.mjs"]), unit("empty", ["test/empty.test.mjs"]), unit("skip", ["test/skip.test.mjs"]), unit("fail", ["test/fail.test.mjs"]), unit("py", ["test/test_pass.py"], "python-unittest"), unit("py-skip", ["test/test_skip.py"], "python-unittest")] };
  const save = () => write(".pace/test-map.json", JSON.stringify(map)); save(); git("add", "docs/README.md"); git("commit", "-qm", "init");
  return {root, write, git, map, save};
}

function signalWorktree() {
  const f = fixture(), home = tempDir("pace-test-signal-home-");
  const env = sessionFreeEnv();
  const git = (root: string, ...args: string[]) => {
    const result = spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  f.map.units = [
    { id: "selected", sources: ["src/a.ts"], tests: ["test/fail.test.mjs", "test/pass.test.mjs"],
      runner: { kind: "node-test", cwd: "." }, requires: [] },
    { id: "python", sources: ["pkg/__init__.py"], tests: ["test/test_pass.py"],
      runner: { kind: "python-unittest", cwd: "." }, requires: [] },
  ];
  f.write("docs/README.md", "# app\n\n## 환경\n\n- 검사: `node -e \"console.log('full fallback executed'); process.exit(7)\"`\n");
  f.write(".pace/test-map.json", JSON.stringify({ ...f.map, checks: [] }));
  f.git("add", "-A"); f.git("commit", "-qm", "test mapping");
  const run = (cwd: string, ...args: string[]) => runPace(args, { cwd, home, env });
  assert.equal(run(f.root, "project", "new", "test signal").status, 0);
  const start = run(f.root, "project", "start", "P001", "--no-launch", "--agent", "codex");
  assert.equal(start.status, 0, start.stderr);
  const worktree = `${f.root}.wt/P001`;
  git(worktree, "add", "projects"); git(worktree, "commit", "-qm", "clean starting worktree");
  const history = join(git(worktree, "rev-parse", "--absolute-git-dir"), "pace/test-signals/log.jsonl");
  const rows = () => readFileSync(history, "utf8").trim().split("\n").map((line) => JSON.parse(line));
  return { root: f.root, worktree, history, rows, git, run };
}

const signalNotice = /문제 해결 호출 권고: (.+)/;
const fixtureFailure = "import { test } from 'node:test'; test('known failure', () => { throw Error('fixture'); });\n";
const fixturePass = "import { test } from 'node:test'; test('known success', () => {});\n";

test("test signals: changed stays selective after recording and a dirty project can use an explicit file", () => {
  const f = signalWorktree();
  writeFileSync(join(f.worktree, "src/a.ts"), "export const a = 2;\n");
  const before = f.git(f.worktree, "status", "--porcelain");
  const run = (...args: string[]) => f.run(f.worktree, "test", ...args);
  const first = run("changed");
  assert.equal(first.status, 1, first.stderr);
  assert.doesNotMatch(first.stdout, signalNotice);
  assert.equal(f.rows().length, 1);
  assert.equal(f.git(f.worktree, "status", "--porcelain"), before);
  const env = sessionFreeEnv();
  delete env.NODE_TEST_CONTEXT;
  const external = spawnSync(process.execPath, ["--test", "test/fail.test.mjs"], { cwd: f.worktree, env });
  assert.equal(external.status, 1);
  assert.equal(f.rows().length, 1);
  const second = run("changed");
  assert.equal(second.status, 1, second.stderr);
  assert.doesNotMatch(second.stdout, /전체 검사 전환/);
  const secondSignal = JSON.parse(signalNotice.exec(second.stdout)![1]!);
  assert.deepEqual(secondSignal, {
    kind: "test_failures", unit: { kind: "test_file", ref: "test/fail.test.mjs" },
    evidence: f.rows().map((row) => row.data.testAttempt),
  });
  assert.doesNotMatch(run("changed").stdout, signalNotice);
  assert.equal(f.rows().length, 3);
  const task = runPace(["project", "task", "P001", "sample"], { cwd: f.worktree, home: tempDir(), env: sessionFreeEnv() });
  assert.equal(task.status, 0, task.stderr);
  const fallback = run("changed");
  assert.equal(fallback.status, 1);
  assert.match(fallback.stdout, /전체 검사 전환/);
  assert.match(fallback.stdout, /full fallback executed[\s\S]*판정: 전체 검사 실패/);
  assert.doesNotMatch(fallback.stdout, signalNotice);
  assert.equal(f.rows().length, 3);
  writeFileSync(join(f.worktree, "test/fail.test.mjs"), fixturePass);
  assert.equal(run("file", "test/fail.test.mjs").status, 0);
  writeFileSync(join(f.worktree, "test/fail.test.mjs"), fixtureFailure);
  assert.doesNotMatch(run("file", "test/fail.test.mjs").stdout, signalNotice);
  assert.match(run("file", "test/fail.test.mjs").stdout, signalNotice);
  assert.doesNotMatch(f.run(f.root, "test", "file", "test/fail.test.mjs").stdout, signalNotice);
  const stats = f.run(f.worktree, "project", "stats", "P001", "--json");
  assert.equal(stats.status, 0, stats.stderr);
  assert.equal(JSON.parse(stats.stdout).team, undefined);
});

test("test signals: a file skipped by stopEarly preserves its streak and timeout is unverified", async () => {
  const f = signalWorktree(), selected = "test/pass.test.mjs";
  writeFileSync(join(f.worktree, selected), fixtureFailure);
  const run = (...args: string[]) => f.run(f.worktree, "test", ...args);
  assert.doesNotMatch(run("file", selected).stdout, signalNotice);
  const other = run("changed");
  assert.equal(other.status, 1, other.stderr);
  assert.deepEqual(f.rows().map((row) => row.ref), [selected, "test/fail.test.mjs"]);
  assert.match(run("file", selected).stdout, signalNotice);
  writeFileSync(join(f.worktree, selected), "import {test} from 'node:test'; test('timeout', () => new Promise(() => { setInterval(() => {}, 100); }));\n");
  for (let i = 0; i < 2; i++) {
    const timeout = await executeTest(f.worktree, ["file", selected], 550);
    assert.equal(timeout.code, 1);
    assert.doesNotMatch(timeout.text, signalNotice);
  }
  assert.deepEqual(f.rows().slice(-2).map((row) => row.data.testResult), [3, 3]);
  writeFileSync(join(f.worktree, selected), fixtureFailure);
  assert.doesNotMatch(run("file", selected).stdout, signalNotice);
  assert.match(run("file", selected).stdout, signalNotice);
});

test("test signals: Python failures are observed and empty or skipped Node files remain unverified", () => {
  const f = signalWorktree(), pythonFile = "test/test_pass.py", nodeFile = "test/pass.test.mjs";
  const run = (file: string) => f.run(f.worktree, "test", "file", file);
  writeFileSync(join(f.worktree, pythonFile), "import unittest\nclass Case(unittest.TestCase):\n def test_fails(self): self.fail('fixture')\n");
  const first = run(pythonFile), second = run(pythonFile);
  assert.equal(first.status, 1);
  assert.equal(second.status, 1);
  assert.doesNotMatch(first.stdout, signalNotice);
  assert.match(second.stdout, signalNotice);
  for (const content of ["", "import {test} from 'node:test'; test.skip('skip', () => {});\n"]) {
    writeFileSync(join(f.worktree, nodeFile), content);
    const unverified = run(nodeFile);
    assert.equal(unverified.status, 1);
    assert.doesNotMatch(unverified.stdout, signalNotice);
  }
  assert.deepEqual(f.rows().map((row) => [row.ref, row.data.testResult]), [[pythonFile, 2], [pythonFile, 2], [nodeFile, 3], [nodeFile, 3]]);
});

test("test signals: unsafe local history never alters a linked destination or the test result", { skip: process.platform === "win32" }, () => {
  const f = signalWorktree(), file = "test/fail.test.mjs";
  assert.equal(f.run(f.worktree, "test", "file", file).status, 1);
  const outside = join(tempDir("pace-signal-outside-"), "destination");
  writeFileSync(outside, "preserve raw test history\n");
  renameSync(f.history, f.history + ".original");
  symlinkSync(outside, f.history);
  const denied = f.run(f.worktree, "test", "file", file);
  assert.equal(denied.status, 1);
  assert.doesNotMatch(denied.stdout, signalNotice);
  assert.equal(readFileSync(outside, "utf8"), "preserve raw test history\n");
});

test("실제 Node·Python 테스트의 성공, 빈 파일, 전체 skip 및 실패를 구분한다", async () => {
  const {root} = fixture();
  for (const name of ["good", "py"]) { const r = (await executeTest(root, ["unit", name])); assert.equal(r.code, 0, r.text); assert.match(r.text, /부분 통과/); }
  for (const name of ["empty", "skip", "fail", "py-skip"]) { const r = (await executeTest(root, ["unit", name])); assert.equal(r.code, 1, `${name}: ${r.text}`); }
  const r = (await executeTest(root, ["file", "test/pass.test.mjs"])); assert.equal(r.code, 0, r.text); assert.doesNotMatch(r.text, /test\/skip.test.mjs/);
});

test("공통·미분류·전제와 잘못된 패턴 및 외부 경로를 오인하지 않는다", async () => {
  const f = fixture(); f.write("src/other.ts", "");
  assert.equal((await executeTest(f.root,["file","src/shared.ts"])).code,3);
  assert.equal((await executeTest(f.root,["file","src/other.ts"])).code,3);
  assert.equal((await executeTest(f.root,["file","../outside"])).code,1);
  assert.equal((await executeTest(f.root,["unit","missing"])).code,1);
  f.map.units[0]!.requires.push("DB"); f.save(); assert.equal((await executeTest(f.root,["unit","good"])).code,3);
  f.map.units[0]!.tests = ["test/missing*.mjs"]; f.save(); assert.equal((await executeTest(f.root,["unit","good"])).code,1);
  f.map.units[0]!.tests = ["test/pass.test.mjs"]; f.save(); const outside = tempDir("pace-outside-"); f.write("src/a.ts", "safe"); symlinkSync(outside, join(f.root,"escape")); assert.equal((await executeTest(f.root,["file","escape/x"])).code,1);
});

test("전체 검사는 base 선언을 사용하고 CLI는 결과를 전달한다", async () => {
  const f = fixture(); f.write("docs/README.md", "# app\n- 검사: `false`\n");
  const result = runPace(["test","all"], {home:tempDir("pace-home-"),cwd:f.root}); assert.equal(result.status,0,result.stderr + result.stdout); assert.match(result.stdout,/전체 검사/);
  const no = runPace(["test","unit","none"], {home:tempDir("pace-home-"),cwd:f.root}); assert.equal(no.status,1);
});

test("미지원 구성과 여러 소속의 실패 우선 및 테스트·소스 겹침을 구분한다", async () => {
  const f=fixture();
  f.map.units[0]!.runner.kind="other"; f.save(); assert.equal((await executeTest(f.root,["unit","good"])).code,3);
  f.map.units[0]!.runner.kind="node-test"; f.map.units[0]!.requires.push("DB"); f.save();
  const multi=(await executeTest(f.root,["file","src/a.ts"])); assert.equal(multi.code,1,multi.text); assert.match(multi.text,/확인 불가/); assert.match(multi.text,/단위 fail/);
  f.map.units[0]!.requires=[]; f.map.units[3]!.sources=["test/pass.test.mjs"]; f.save();
  const overlap=(await executeTest(f.root,["file","test/pass.test.mjs"])); assert.equal(overlap.code,1,overlap.text); assert.match(overlap.text,/단위 fail/);
  assert.equal((await executeTest(f.root,["file","-x"])).code,1);
});

test("실제 외부 파일과 밖을 가리키는 구성 경로는 실경로에서 거부한다", async () => {
  const f=fixture(); const outside=tempDir("pace-outside-"); writeFileSync(join(outside,"actual.mjs"),"export {};\n"); symlinkSync(outside,join(f.root,"external"));
  const file=(await executeTest(f.root,["file","external/actual.mjs"])); assert.equal(file.code,1); assert.match(file.text,/프로젝트 밖/);
  f.map.units[0]!.tests=["external/*.mjs"]; f.save(); const pattern=(await executeTest(f.root,["unit","good"])); assert.equal(pattern.code,1); assert.match(pattern.text,/프로젝트 밖/);
});

test("Python 0건과 실패, Node 시그널 및 타임아웃은 실패한다", async () => {
  const f=fixture(); f.write("test/test_zero.py","value = 1\n"); f.write("test/test_bad.py","import unittest\nclass Case(unittest.TestCase):\n def test_bad(self): self.fail()\n");
  f.map.units[4]!.tests=["test/test_zero.py"]; f.save(); assert.equal((await executeTest(f.root,["unit","py"])).code,1);
  f.map.units[4]!.tests=["test/test_bad.py"]; f.save(); assert.equal((await executeTest(f.root,["unit","py"])).code,1);
  f.write("test/signal.test.mjs","process.kill(process.pid, 'SIGTERM')\n"); f.map.units[0]!.tests=["test/signal.test.mjs"]; f.save(); assert.equal((await executeTest(f.root,["unit","good"])).code,1);
  if (process.platform !== "win32") {
    const pidfile=join(f.root,"child.pid"); f.write("test/hang.test.mjs",`import {writeFileSync} from 'node:fs'; import {test} from 'node:test'; test('hang', async () => { writeFileSync(${JSON.stringify(pidfile)}, String(process.pid)); await new Promise(()=>{}); });\n`);
    f.map.units[0]!.tests=["test/hang.test.mjs"]; f.save(); const hung=(await executeTest(f.root,["unit","good"],1500)); assert.equal(hung.code,1,hung.text);
    const pid=Number(readFileSync(pidfile, "utf8")); assert.ok(pid>0); let alive=true; for (let attempt=0; attempt<40 && alive; attempt++) { try { process.kill(pid,0); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); } catch(e) { if ((e as NodeJS.ErrnoException).code==='ESRCH') alive=false; else throw e; } } assert.equal(alive,false,`남은 테스트 PID ${pid}`);
  }
});

test("전체 검사 선언 부재와 base 조회 실패는 작업본 선언으로 성공하지 않는다", async () => {
  const f=fixture(); f.write("docs/README.md", "# app\n"); f.git("add","docs/README.md"); f.git("commit","-qm","remove declaration");
  assert.equal((await executeTest(f.root,["all"])).code,3);
  f.write("docs/README.md", "# app\n- 검사: `true`\n");
  f.git("branch","-m","main","other");
  const missing=(await executeTest(f.root,["all"])); assert.equal(missing.code,1); assert.doesNotMatch(missing.text,/전체 검사 · 명령: true/);
});

test("T02 다중 패키지 시범 구성은 스키마로 읽고 로컬 vitest가 없으면 확인 불가로 처리한다", async () => {
  const f=fixture(); const sample=readFileSync(new URL("./fixtures/sample-test-map.json",import.meta.url),"utf8");
  for (const part of ["core","backend","frontend"]) { f.write(`workspace/${part}/src/sample.ts`,""); f.write(`workspace/${part}/test/sample.test.ts`,""); }
  f.write("workspace/desktop/src/sample.ts",""); f.write("workspace/desktop/test/sample.spec.ts",""); f.write("workspace/test/e2e/sample.spec.ts","");
  for (const file of ["workspace/package.json","workspace/pnpm-lock.yaml","workspace/vitest.config.ts","workspace/tsconfig.base.json","workspace/playwright.config.ts","workspace/desktop/playwright.config.ts"]) f.write(file,"");
  f.write(".pace/test-map.json",sample); const result=(await executeTest(f.root,["unit","frontend"])); assert.equal(result.code,3,result.text); assert.match(result.text,/로컬 vitest 없음/);
  f.write(".pace/test-map.json",sample.replace('workspace/frontend/test/**/*.test.ts','workspace/frontend/test/missing*.ts'));
  const invalid=(await executeTest(f.root,["unit","frontend"])); assert.equal(invalid.code,1); assert.match(invalid.text,/구성 오류.*일치 0건/);
});

test("외부 SIGTERM으로 중단해도 선택 테스트 자식이 남지 않는다", async () => {
  if (process.platform === "win32") return;
  const f=fixture(); const pidfile=join(f.root,"interrupted.pid");
  f.write("test/hang.test.mjs",`import {writeFileSync} from 'node:fs'; import {test} from 'node:test'; test('hang', async () => { writeFileSync(${JSON.stringify(pidfile)}, String(process.pid)); await new Promise(()=>{}); });\n`);
  f.map.units[0]!.tests=["test/hang.test.mjs"]; f.save();
  const child=spawnTestChild(process.execPath,[PACE_BIN,"test","unit","good"],{cwd:f.root,env:{...sessionFreeEnv(),PACE_HOME:tempDir("pace-home-")},stdio:"ignore"});
  const closed=new Promise<number | null>((resolve) => child.once("close",resolve));
  for(let i=0;i<100&&!existsSync(pidfile);i++) await new Promise((resolve)=>setTimeout(resolve,50));
  assert.ok(existsSync(pidfile),"테스트 프로세스 시작"); const pid=Number(readFileSync(pidfile,"utf8")); child.kill("SIGTERM"); assert.notEqual(await closed,0);
  let alive=true; for(let i=0;i<40&&alive;i++) { try { process.kill(pid,0); await new Promise((resolve)=>setTimeout(resolve,50)); } catch(e) { if((e as NodeJS.ErrnoException).code==="ESRCH") alive=false; else throw e; } }
  assert.equal(alive,false,`중단 뒤 남은 테스트 PID ${pid}`);
});

test("공통은 등록된 단위보다 우선하고 파일 선택은 지정된 테스트만 실행하며 실행 정보가 나온다", async () => {
  const f=fixture(); f.map.common.push("src/a.ts"); f.save();
  const common=await executeTest(f.root,["file","src/a.ts"]); assert.equal(common.code,3,common.text); assert.match(common.text,/공통 경로/); assert.doesNotMatch(common.text,/대상:/);
  f.map.common.pop(); f.map.units[0]!.tests=["test/pass.test.mjs","test/fail.test.mjs"]; f.save();
  const result=await executeTest(f.root,["file","test/pass.test.mjs"]); assert.equal(result.code,0,result.text); assert.match(result.text,/명령:/); assert.match(result.text,/시간: \d+ms/); assert.match(result.text,/대상: test\/pass.test.mjs/); assert.doesNotMatch(result.text,/대상: test\/fail.test.mjs/);
  assert.equal((await executeTest(f.root,["unit","good"])).code,1);
});

test("미지원 러너 설정과 결과를 읽지 못하는 실행은 확인 불가다", async () => {
  const f=fixture(); f.write("runner.config","config"); Object.assign(f.map.units[0]!.runner,{config:"runner.config"}); f.save();
  const configured=await executeTest(f.root,["unit","good"]); assert.equal(configured.code,3,configured.text);
  delete (f.map.units[0]!.runner as {config?:string}).config; f.save();
  if (process.platform === "win32") return;
  const bin=tempDir("pace-bin-"); const fake=join(bin,"python3"); writeFileSync(fake,"#!/bin/sh\nexit 0\n"); chmodSync(fake,0o755);
  const before=process.env.PATH; process.env.PATH=`${bin}:${before ?? ""}`;
  try { const unknown=await executeTest(f.root,["unit","py"]); assert.equal(unknown.code,3,unknown.text); assert.match(unknown.text,/확인 불가/); }
  finally { if (before===undefined) delete process.env.PATH; else process.env.PATH=before; }
});

// 가짜 로컬 vitest: 각 테스트 파일 본문의 JSON({tests, failed, skipped, todo, omit})으로 보고서를 쓰고, 호출 인자를 calls.log에 남긴다
const FAKE_VITEST = String.raw`import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2); appendFileSync(resolve('calls.log'), JSON.stringify(args) + '\n');
const out = args.find((a) => a.startsWith('--outputFile='))?.slice(13);
const ci = args.indexOf('--config'); const files = args.filter((a, i) => i > 0 && !a.startsWith('--') && (ci < 0 || i !== ci + 1));
if (files.some((f) => readFileSync(f, 'utf8').includes('noreport'))) process.exit(1);
const results = []; const n = { tests: 0, failed: 0, skipped: 0, todo: 0 };
for (const f of files) { const s = JSON.parse(readFileSync(f, 'utf8')); if (s.omit) continue; for (const k in n) n[k] += s[k] ?? 0;
  const failed = Array.from({ length: s.failed ?? 0 }, (_, i) => ({ status: 'failed', fullName: 'bad case ' + i, failureMessages: ['\n  AssertionError: boom ' + i + '\n    at x'] }));
  results.push({ name: resolve(f).split('\\').join('/'), status: s.failed || s.loadError ? 'failed' : 'passed', message: s.loadError, assertionResults: failed }); }
writeFileSync(out, JSON.stringify({ numTotalTests: n.tests, numFailedTests: n.failed, numPendingTests: n.skipped, numTodoTests: n.todo, numFailedTestSuites: 0, success: n.failed === 0, testResults: results }));
process.exit(n.failed ? 1 : 0);
`;

function vitestFixture() {
  const f = fixture();
  f.write("app/node_modules/vitest/package.json", JSON.stringify({ name: "vitest", bin: { vitest: "./vitest.mjs" } }));
  f.write("app/node_modules/vitest/vitest.mjs", FAKE_VITEST);
  f.write("app/vitest.config.mts", "export default {};\n");
  const cases: Record<string, object> = { "a.test.ts": { tests: 2 }, "b.test.ts": { tests: 1 }, "fail.test.ts": { tests: 1, failed: 1 }, "skip.test.ts": { tests: 1, skipped: 1 }, "zero.test.ts": { tests: 0 }, "omit.test.ts": { omit: true }, "load.test.ts": { loadError: "SyntaxError: bad import\nstack" } };
  for (const [name, body] of Object.entries(cases)) f.write(`app/src/${name}`, JSON.stringify(body));
  f.write("app/src/noreport.test.ts", '"noreport"');
  const vunit = (id: string, tests: string[]) => ({ id, sources: ["src/a.ts"], tests, runner: { kind: "vitest", cwd: "app", config: "app/vitest.config.mts" }, requires: [] as string[] });
  f.map.units.push(vunit("vt", ["app/src/a.test.ts", "app/src/b.test.ts"]), vunit("vt-fail", ["app/src/a.test.ts", "app/src/fail.test.ts"]), vunit("vt-skip", ["app/src/skip.test.ts"]), vunit("vt-zero", ["app/src/zero.test.ts"]), vunit("vt-omit", ["app/src/a.test.ts", "app/src/omit.test.ts"]), vunit("vt-noreport", ["app/src/noreport.test.ts"]), vunit("vt-load", ["app/src/a.test.ts", "app/src/load.test.ts"]));
  f.save();
  const calls = () => existsSync(join(f.root, "app/calls.log")) ? readFileSync(join(f.root, "app/calls.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]) : [];
  return { ...f, calls };
}

test("vitest: 단위의 파일을 한 번에 로컬 vitest로 돌리고 설정 파일을 넘긴다", async () => {
  const f = vitestFixture();
  const r = await executeTest(f.root, ["unit", "vt"]); assert.equal(r.code, 0, r.text); assert.match(r.text, /테스트 3 · skip 0 · 실패 0/);
  const calls = f.calls(); assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.slice(0, 2), ["run", "--reporter=json"]);
  assert.match(calls[0]![calls[0]!.indexOf("--config") + 1]!, /vitest\.config\.mts$/);
  assert.deepEqual(calls[0]!.slice(-2), ["src/a.test.ts", "src/b.test.ts"]);
  const one = await executeTest(f.root, ["file", "app/src/b.test.ts"]); assert.equal(one.code, 0, one.text);
  assert.deepEqual(f.calls()[1]!.slice(-1), ["src/b.test.ts"]); assert.equal(f.calls().length, 2);
});

test("vitest: 실패·전체 skip·0건·보고서에 빠진 파일은 실패, 보고서 없음·vitest 없음은 확인 불가", async () => {
  const f = vitestFixture();
  for (const id of ["vt-fail", "vt-skip", "vt-zero", "vt-omit"]) { const r = await executeTest(f.root, ["unit", id]); assert.equal(r.code, 1, `${id}: ${r.text}`); }
  assert.match((await executeTest(f.root, ["unit", "vt-omit"])).text, /실행되지 않은 파일: src\/omit\.test\.ts/);
  // 실패 테스트는 한 번만 세고(파일 실패와 이중으로 세지 않음) 파일 › 이름 — 첫 줄을 남긴다
  const failed = await executeTest(f.root, ["unit", "vt-fail"]);
  assert.match(failed.text, /실패 1\n/); assert.match(failed.text, /- src\/fail\.test\.ts › bad case 0 — AssertionError: boom 0\n/);
  const load = await executeTest(f.root, ["unit", "vt-load"]); assert.equal(load.code, 1, load.text);
  assert.match(load.text, /실패 1\n/); assert.match(load.text, /- src\/load\.test\.ts — 파일 실패: SyntaxError: bad import\n/);
  const noreport = await executeTest(f.root, ["unit", "vt-noreport"]); assert.equal(noreport.code, 3, noreport.text); assert.match(noreport.text, /vitest 보고서 없음/);
  rmSync(join(f.root, "app/node_modules"), { recursive: true, force: true });
  const missing = await executeTest(f.root, ["unit", "vt"]); assert.equal(missing.code, 3, missing.text); assert.match(missing.text, /로컬 vitest 없음/);
});

test("설정 파일은 vitest만 받고 다른 러너는 확인 불가로 둔다", async () => {
  const f = vitestFixture();
  f.map.units[0]!.runner = { kind: "node-test", cwd: ".", config: "app/vitest.config.mts" } as never; f.save();
  assert.equal((await executeTest(f.root, ["unit", "good"])).code, 3);
});
