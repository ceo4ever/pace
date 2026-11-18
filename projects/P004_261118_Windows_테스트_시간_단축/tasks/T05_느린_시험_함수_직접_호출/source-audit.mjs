import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {auditHarness} from './transform-harness.mjs';
import {readHarnessBefore} from './source-fixture.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const marker=Buffer.from('test("구현 후 리뷰 1차: /bind');
export function auditBlock(before,after){
 const split=b=>{const start=b.indexOf(marker);assert.ok(start>0);const end=b.indexOf(Buffer.from('\ntest('),start+1);assert.ok(end>start);return {prefix:b.subarray(0,start),body:b.subarray(start,end).toString(),suffix:b.subarray(end)};};
 const a=split(before),b=split(after);assert.deepEqual(b.prefix,a.prefix,'Other preceding tests changed');assert.deepEqual(b.suffix,a.suffix,'Other following tests changed');
 const assertions=a.body.split(/\r?\n/).filter(line=>line.trim().startsWith('assert.'));
 for(const line of assertions)assert.ok(b.body.includes(line),'Original assertion removed: '+line.trim());
 return {beforeSha256:sha(before),afterSha256:sha(after),outsideBlockByteIdentical:true,originalAssertions:assertions.length,originalAssertionsRetained:true};
}
export function actualAudit(){
 const before=fs.readFileSync(path.join(here,'evidence/telegram-flow-before.ts.txt')),after=fs.readFileSync(path.resolve(here,'../../../../test/telegram-flow.test.ts')),expected=JSON.parse(fs.readFileSync(path.join(here,'evidence/source-change.json')));
 const report=auditBlock(before,after);assert.equal(report.beforeSha256,expected.beforeSha256);assert.equal(report.afterSha256,expected.afterSha256);return report;
}
export function actualHarnessAudit(){
 const before=readHarnessBefore(),after=fs.readFileSync(path.resolve(here,'../../../../test/project-harness.test.ts'),'utf8'),expected=JSON.parse(fs.readFileSync(path.join(here,'evidence/harness-source-change.json'))),report=auditHarness(before,after);assert.equal(report.beforeSha256,expected.beforeSha256);assert.equal(report.afterSha256,expected.afterSha256);return report;
}
export function sourcesMatch(oldSources,newSources,audit,harness,wrapper){
 return oldSources.every(old=>newSources.some(now=>now.file===old.file&&(old.file==='test/telegram-flow.test.ts'?old.sha256===audit.beforeSha256&&now.sha256===audit.afterSha256:harness&&old.file==='test/project-harness.test.ts'?old.sha256===harness.beforeSha256&&now.sha256===harness.afterSha256:wrapper&&old.file==='test/install-windows-wrapper.test.ts'?old.sha256===wrapper.beforeSha256&&now.sha256===wrapper.afterSha256:now.sha256===old.sha256)));
}
