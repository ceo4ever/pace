import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProcess, buildChildEnv } from '../src/agent/process.ts';
import { tempDir } from './helpers.ts';

test('Windows 동시 부하에서도 소유 잡 회수를 5초 안에 확인한다', { skip: process.platform !== 'win32' ? 'Windows 회수 실측' : false, timeout: 15000 }, async () => {
  const cwd = tempDir(), started = Date.now();
  const script = 'const c=require("child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});setInterval(()=>{},1000)';
  const outcomes = await Promise.all(Array.from({length:4},()=>runProcess({command:process.execPath,args:['-e',script],cwd,env:buildChildEnv(process.env),input:'',timeoutMs:800,graceMs:300})));
  assert.ok(outcomes.every(o=>o.timedOut && o.reaped), JSON.stringify(outcomes.map(o=>({timeout:o.timedOut,reaped:o.reaped,duration:o.durationMs}))));
  assert.ok(Date.now()-started<5000, `4개 동시 회수 ${Date.now()-started}ms`);
});
