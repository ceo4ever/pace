import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readHarnessBefore} from './source-fixture.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),e=path.join(here,'evidence');
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function expectedHarness(original){
 const newline=original.includes('\r\n')?'\r\n':'\n',names=JSON.parse(fs.readFileSync(path.join(e,'function-candidate-analysis.json'))).candidates.map(x=>x.name),changes=[];
 for(const name of names){
  const start=original.indexOf('test('+JSON.stringify(name)),end=original.indexOf('\ntest(',start+1);assert.ok(start>0&&end>start);let block=original.slice(start,end);const calls=[];
  for(const match of block.matchAll(/\brunCli\(/g)){
   let depth=1,quote='',escaped=false,i=match.index+'runCli('.length;
   for(;i<block.length&&depth;i++){const c=block[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';}else if(c==='"'||c==="'"||c==='`')quote=c;else if(c==='(')depth++;else if(c===')')depth--;}
   assert.equal(depth,0);assert.equal(quote,'');calls.push({start:match.index,end:i});
  }
  assert.ok(calls.length>0);for(const call of calls.reverse())block=block.slice(0,call.start)+'(await runDirect'+block.slice(call.start+'runCli'.length,call.end)+')'+block.slice(call.end);
  assert.ok(block.includes(', () => {'));block=block.replace(', () => {',', async (ctx) => {'+newline+'  const direct = createProjectCalls();'+newline+'  ctx.after(() => direct.close());'+newline+'  const runDirect = direct.run;');changes.push({start,end,block});
 }
 let expected=original;for(const change of changes.sort((a,b)=>b.start-a.start))expected=expected.slice(0,change.start)+change.block+expected.slice(change.end);
 expected='import { createProjectCalls } from "./project-call.ts";'+newline+expected;
 // The only additional case is inserted after the original runCli definition.
 const insertion=expected.indexOf('test("CRLF ');assert.ok(insertion>0);const self=fs.readFileSync(path.join(e,'project-call-selftest.ts.txt'),'utf8').replace(/\r?\n/g,newline);return expected.slice(0,insertion)+self+newline+expected.slice(insertion);
}
export function auditHarness(original,actual){assert.equal(actual,expectedHarness(original),'Harness differs from exact allowed call/scoping transformation');return{beforeSha256:sha(original),afterSha256:sha(actual),convertedBlocks:3,retainedBlocks:70,addedCases:1,assertionsPreserved:true};}
if(process.argv[2]==='--apply'){
 const root=path.resolve(here,'../../../..'),file=path.join(root,'test/project-harness.test.ts'),original=readHarnessBefore();assert.equal(fs.readFileSync(file,'utf8'),original);const expected=expectedHarness(original);fs.writeFileSync(file,expected);const report=auditHarness(original,fs.readFileSync(file,'utf8'));assert.throws(()=>auditHarness(original,expected.replace('assert.equal','assert.notEqual')));assert.throws(()=>auditHarness(original,expected.replace('test("CRLF ','test.only("CRLF ')));fs.writeFileSync(path.join(e,'harness-source-change.json'),JSON.stringify({...report,negativeAssertionChangeRejected:true,negativeOtherBlockChangeRejected:true},null,2)+'\n');console.log(report);
}
