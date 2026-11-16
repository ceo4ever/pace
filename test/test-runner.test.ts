import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, symlinkSync, readFileSync, existsSync, chmodSync } from "node:fs";
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

test("T02 다중 패키지 시범 구성은 스키마로 읽고 미지원 Vitest를 확인 불가로 처리한다", async () => {
  const f=fixture(); const sample=readFileSync(new URL("./fixtures/sample-test-map.json",import.meta.url),"utf8");
  for (const part of ["core","backend","frontend"]) { f.write(`workspace/${part}/src/sample.ts`,""); f.write(`workspace/${part}/test/sample.test.ts`,""); }
  f.write("workspace/desktop/src/sample.ts",""); f.write("workspace/desktop/test/sample.spec.ts",""); f.write("workspace/test/e2e/sample.spec.ts","");
  for (const file of ["workspace/package.json","workspace/pnpm-lock.yaml","workspace/vitest.config.ts","workspace/tsconfig.base.json","workspace/playwright.config.ts","workspace/desktop/playwright.config.ts"]) f.write(file,"");
  f.write(".pace/test-map.json",sample); const result=(await executeTest(f.root,["unit","frontend"])); assert.equal(result.code,3,result.text); assert.match(result.text,/미지원/);
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
