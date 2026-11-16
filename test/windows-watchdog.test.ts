import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageRoot } from '../src/core/paths.ts';
import { sessionFreeEnv, tempDir } from './helpers.ts';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const exists = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('Windows 부모 신원은 PID와 생성 순서가 모두 맞을 때만 통과한다', { skip: process.platform !== 'win32' ? 'Windows 핸들 실측' : false }, () => {
  const dir = tempDir(), ps = join(dir, 'identity.ps1');
  const source = join(packageRoot, 'src', 'agent', 'windows-job.cs').replaceAll("'", "''");
  writeFileSync(ps, `Add-Type -Path '${source}'\n[PaceWindowsJob]::ValidParent(1,1,2,2,10,20,30)\n[PaceWindowsJob]::ValidParent(1,9,2,2,10,20,30)\n[PaceWindowsJob]::ValidParent(1,1,2,9,10,20,30)\n[PaceWindowsJob]::ValidParent(1,1,2,2,21,20,30)\n[PaceWindowsJob]::ValidParent(1,1,2,2,10,31,30)\n[PaceWindowsJob]::ValidParent(1,1,2,2,20,20,30)\n[PaceWindowsJob]::ValidParent(1,1,2,2,10,30,30)\n`);
  const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-File',ps], { cwd: dir, encoding:'utf8', timeout:15000, env: { ...process.env, PSModuleAnalysisCachePath: join(dir, 'module-analysis-cache') } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), ['True','False','False','False','False','False','False']);
});

test('Windows 부모 강제 종료 뒤 감시자가 자손을 회수하고 무관 프로세스를 보존한다', { skip: process.platform !== 'win32' ? 'Windows 감시자 실측' : false, timeout: 30000 }, async () => {
  const dir = tempDir(), idsFile = join(dir, 'pids.json'), readyFile = join(dir, 'ready'), watcherFile = join(dir, 'watcher');
  const agent = join(dir, 'agent.mjs'), parent = join(dir, 'parent.mjs');
  writeFileSync(agent, `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';\nconst child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),12000)'],{stdio:'ignore',detached:true});writeFileSync(${JSON.stringify(idsFile)},JSON.stringify({root:process.pid,child:child.pid}));setTimeout(()=>process.exit(0),12000);`);
  const entry = pathToFileURL(join(packageRoot, 'src', 'agent', 'process.ts')).href;
  const jobEntry = pathToFileURL(join(packageRoot, 'src', 'agent', 'windows-job.ts')).href;
  writeFileSync(parent, `import {runProcess} from ${JSON.stringify(entry)};import {windowsJobStats} from ${JSON.stringify(jobEntry)};import {writeFileSync} from 'node:fs';\nconst t=setInterval(()=>{if(windowsJobStats.lastPid){writeFileSync(${JSON.stringify(watcherFile)},String(windowsJobStats.lastPid));clearInterval(t)}},10);t.unref();writeFileSync(${JSON.stringify(readyFile)},'ready');await runProcess({command:process.execPath,args:[${JSON.stringify(agent)}],cwd:${JSON.stringify(dir)},env:process.env,input:'',timeoutMs:60000});`);
  const env = sessionFreeEnv(), sentinel = spawn(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),15000)'], { env, stdio: 'ignore' });
  const owner = spawn(process.execPath, [parent], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  owner.stdout?.resume(); owner.stderr?.resume();
  const hostClosed = new Promise<boolean>(resolve => owner.once('close', () => resolve(true)));
  try {
    for(let i=0;i<160&&!existsSync(idsFile);i++) await pause(50);
    assert.ok(existsSync(readyFile) && existsSync(idsFile) && existsSync(watcherFile), '감시자와 에이전트 자손이 시작돼야 한다');
    const watcher = Number(readFileSync(watcherFile, 'utf8'));
    const ids = JSON.parse(readFileSync(idsFile, 'utf8')) as {root:number; child:number};
    assert.ok(exists(ids.root) && exists(ids.child) && sentinel.pid && exists(sentinel.pid));
    const start = Date.now(); owner.kill('SIGKILL');
    assert.ok(exists(watcher), '독립 감시자는 부모 강제 종료 직후 살아 있어야 한다');
    assert.equal(await Promise.race([hostClosed, pause(5000).then(() => false)]), true, '호스트 출력 핸들이 5초 안에 닫혀야 한다');
    while(Date.now()-start<5000 && (exists(ids.root)||exists(ids.child))) await pause(50);
    assert.ok(!exists(ids.root) && !exists(ids.child), `5초 뒤 자손이 남음 root=${exists(ids.root)} child=${exists(ids.child)}`);
    assert.ok(exists(sentinel.pid!), '무관한 프로세스는 살아 있어야 한다');
    console.log(`parent-death watcher=${watcher} root=${ids.root} child=${ids.child} unrelated=${sentinel.pid} reaped_ms=${Date.now()-start} host_closed=true unrelated_alive=true`);
  } finally {
    if (owner.exitCode === null) owner.kill('SIGKILL');
    sentinel.kill('SIGKILL');
    await pause(12500); // 실패 변형에서 남은 테스트 자손은 스스로 종료한다.
  }
});

test('Windows 감시자 준비 실패는 에이전트 생성 전에 종료한다', { skip: process.platform !== 'win32' ? 'Windows 감시자 실측' : false, timeout: 25000 }, async () => {
  const dir = tempDir(), marker = join(dir, 'must-not-run'), old = process.env.SystemRoot;
  const { runProcess, buildChildEnv } = await import('../src/agent/process.ts');
  try {
    process.env.SystemRoot = dir;
    await assert.rejects(runProcess({ command: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`], cwd: dir, env: buildChildEnv(process.env), input: '', timeoutMs: 5000 }), /감시자 준비 실패/);
    assert.equal(existsSync(marker), false, '준비가 실패하면 에이전트는 시작되지 않는다');
  } finally { if(old === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = old; }
});

test('Windows 감시자 자체가 죽어도 잡 자손만 종료한다', { skip: process.platform !== 'win32' ? 'Windows 감시자 실측' : false, timeout: 30000 }, async () => {
  const dir = tempDir(), idsFile = join(dir, 'pids.json'), watcherFile = join(dir, 'watcher');
  const agent = join(dir, 'agent.mjs'), parent = join(dir, 'parent.mjs');
  writeFileSync(agent, `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const c=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),12000)'],{stdio:'ignore',detached:true});writeFileSync(${JSON.stringify(idsFile)},JSON.stringify({root:process.pid,child:c.pid}));setTimeout(()=>process.exit(0),12000);`);
  const entry = pathToFileURL(join(packageRoot, 'src', 'agent', 'process.ts')).href;
  const jobEntry = pathToFileURL(join(packageRoot, 'src', 'agent', 'windows-job.ts')).href;
  writeFileSync(parent, `import {runProcess} from ${JSON.stringify(entry)};import {windowsJobStats} from ${JSON.stringify(jobEntry)};import {writeFileSync} from 'node:fs';const t=setInterval(()=>{if(windowsJobStats.lastPid){writeFileSync(${JSON.stringify(watcherFile)},String(windowsJobStats.lastPid));clearInterval(t)}},10);t.unref();process.on('message',()=>windowsJobStats.lastChild?.kill('SIGKILL'));try{await runProcess({command:process.execPath,args:[${JSON.stringify(agent)}],cwd:${JSON.stringify(dir)},env:process.env,input:'',timeoutMs:60000})}catch{}process.exit(0);`);
  const env = sessionFreeEnv(), sentinel = spawn(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),15000)'], { env, stdio: 'ignore' });
  const owner = spawn(process.execPath, [parent], { env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  try {
    for(let i=0;i<160&&(!existsSync(idsFile)||!existsSync(watcherFile));i++) await pause(50);
    assert.ok(existsSync(idsFile) && existsSync(watcherFile));
    const ids = JSON.parse(readFileSync(idsFile, 'utf8')) as {root:number; child:number};
    const start = Date.now(); owner.send('stop-watcher');
    while(Date.now()-start<5000 && (exists(ids.root)||exists(ids.child))) await pause(50);
    assert.ok(!exists(ids.root) && !exists(ids.child), '감시자가 죽으면 잡 소속 자손이 종료돼야 한다');
    assert.ok(sentinel.pid && exists(sentinel.pid), '무관한 프로세스는 살아 있어야 한다');
    console.log(`watcher-death root=${ids.root} child=${ids.child} unrelated=${sentinel.pid} reaped_ms=${Date.now()-start} unrelated_alive=true`);
  } finally {
    if (owner.exitCode === null) owner.kill('SIGKILL');
    sentinel.kill('SIGKILL');
    await pause(12500);
  }
});

test('Windows 부모가 정상 종료해도 독립 감시자가 자손을 회수한다', { skip: process.platform !== 'win32' ? 'Windows 감시자 실측' : false, timeout:30000 }, async () => {
  const dir=tempDir(), idsFile=join(dir,'pids.json'), agent=join(dir,'agent.mjs'), parent=join(dir,'parent.mjs');
  writeFileSync(agent, `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const c=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),12000)'],{stdio:'ignore',detached:true});writeFileSync(${JSON.stringify(idsFile)},JSON.stringify({root:process.pid,child:c.pid}));setTimeout(()=>process.exit(0),12000);`);
  const entry=pathToFileURL(join(packageRoot,'src','agent','process.ts')).href;
  writeFileSync(parent, `import {runProcess} from ${JSON.stringify(entry)};process.on('message',()=>process.exit(0));await runProcess({command:process.execPath,args:[${JSON.stringify(agent)}],cwd:${JSON.stringify(dir)},env:process.env,input:'',timeoutMs:60000});`);
  const owner=spawn(process.execPath,[parent],{env:sessionFreeEnv(),stdio:['ignore','ignore','ignore','ipc']});
  try {
    for(let i=0;i<160&&!existsSync(idsFile);i++) await pause(50);
    assert.ok(existsSync(idsFile));
    const ids=JSON.parse(readFileSync(idsFile,'utf8')) as {root:number;child:number};
    const started=Date.now(); owner.send('exit');
    while(Date.now()-started<5000 && (exists(ids.root)||exists(ids.child))) await pause(50);
    assert.ok(!exists(ids.root)&&!exists(ids.child), '정상 종료 뒤 자손이 남지 않아야 한다');
    console.log(`normal-parent-exit root=${ids.root} child=${ids.child} reaped_ms=${Date.now()-started}`);
  } finally { if(owner.exitCode===null) owner.kill('SIGKILL'); await pause(12500); }
});

test('Windows ACP 부모 종료와 시간 초과는 자손을 회수하고 무관 프로세스를 보존한다', { skip: process.platform !== 'win32' ? 'Windows ACP 감시자 실측' : false, timeout: 90000 }, async () => {
  const dir = tempDir(), rootFile = join(dir, 'root'), childFile = join(dir, 'child');
  const agent = join(dir, 'fake-acp.mjs'), parent = join(dir, 'owner.mjs'), resultFile = join(dir, 'result');
  const fake = readFileSync(join(packageRoot, 'test', 'fake-acp-agent.mjs'), 'utf8');
  assert.ok(fake.includes('setInterval(()=>{},1000)'), 'The test child must have a bounded lifetime');
  writeFileSync(agent, `import {writeFileSync as recordRoot} from 'node:fs';recordRoot(${JSON.stringify(rootFile)},String(process.pid));\n` + fake.replace('setInterval(()=>{},1000)', 'setTimeout(()=>process.exit(0),12000)'));
  const executor = pathToFileURL(join(packageRoot, 'src', 'agent', 'acp-executor.ts')).href;
  const contract = pathToFileURL(join(packageRoot, 'src', 'agent', 'contract.ts')).href;
  const env = sessionFreeEnv();
  for (const mode of ['kill', 'exit', 'timeout']) {
    for (const file of [rootFile, childFile, resultFile]) if (existsSync(file)) writeFileSync(file, '');
    writeFileSync(parent, `import {createAcpExecutor,claudeAcp} from ${JSON.stringify(executor)};import {runAgent} from ${JSON.stringify(contract)};import {writeFileSync} from 'node:fs';process.on('message',()=>process.exit(0));const ex=createAcpExecutor({...claudeAcp,readOnlyVersions:['9.9.9']},{command:process.execPath,args:[${JSON.stringify(agent)},'stubborn','',${JSON.stringify(childFile)}],graceMs:300});try{await runAgent(ex,{agent:'claude',mode:'acp',prompt:'test',cwd:${JSON.stringify(dir)},timeoutMs:${mode === 'timeout' ? 2500 : 60000}})}catch(e){writeFileSync(${JSON.stringify(resultFile)},String(e.code))};setTimeout(()=>process.exit(0),10000);`);
    const sentinel = spawn(process.execPath, ['-e', 'setTimeout(()=>process.exit(0),15000)'], { env, stdio: 'ignore' });
    const owner = spawn(process.execPath, [parent], { env, stdio: ['ignore','ignore','ignore','ipc'] });
    try {
      for (let i=0;i<200;i++) { if (existsSync(rootFile) && existsSync(childFile) && readFileSync(rootFile,'utf8').trim() && readFileSync(childFile,'utf8').trim()) break; await pause(50); }
      const root = Number(readFileSync(rootFile,'utf8')), child = Number(readFileSync(childFile,'utf8'));
      assert.ok(root && child && exists(root) && exists(child) && sentinel.pid && exists(sentinel.pid), `${mode}: ACP와 자손이 살아 있어야 한다`);
      const started = Date.now();
      if (mode === 'kill') owner.kill('SIGKILL');
      if (mode === 'exit') owner.send('exit');
      while (Date.now()-started < 5000 && (exists(root) || exists(child))) await pause(50);
      assert.ok(!exists(root) && !exists(child), `${mode}: ACP 자손이 5초 안에 종료돼야 한다`);
      assert.ok(exists(sentinel.pid!), `${mode}: 무관 프로세스가 살아 있어야 한다`);
      if (mode === 'timeout') {
        for (let i=0;i<40&&(!existsSync(resultFile)||!readFileSync(resultFile,'utf8').trim());i++) await pause(50);
        assert.equal(readFileSync(resultFile,'utf8'), 'timeout', 'ACP must report a timeout');
      }
      console.log(`acp-${mode} root=${root} child=${child} unrelated=${sentinel.pid} reaped_ms=${Date.now()-started} unrelated_alive=true`);
    } finally {
      if (owner.exitCode === null) owner.kill('SIGKILL');
      sentinel.kill('SIGKILL');
      await pause(12500);
    }
  }
});
