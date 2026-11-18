import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..');
const owned=fs.mkdtempSync(path.join(os.tmpdir(),'pace-p004-t05-diag-')),copy=path.join(owned,'source');fs.mkdirSync(copy);
for(const name of ['bin','src','test','scripts','templates','skills','docs','package.json','tsconfig.json','README.md','AGENTS.md'])fs.cpSync(path.join(root,name),path.join(copy,name),{recursive:true});
const target=path.join(copy,'test/telegram-flow.test.ts'),original=fs.readFileSync(target,'utf8'),marker='test("\uAD6C\uD604 \uD6C4 \uB9AC\uBDF0 1\uCC28: /bind';
const start=original.indexOf(marker),end=original.indexOf('\ntest(',start+1);assert.ok(start>0&&end>start);const segment=original.slice(start,end);
const save='a.save = () => { if (fail2++ === 1) throw new Error("\uB514\uC2A4\uD06C"); real(); };';assert.ok(segment.includes(save));
const output=path.join(here,'evidence','telegram-diagnostic-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(output);
const sha=text=>createHash('sha256').update(text).digest('hex'),records=[];
const mockFile=path.join(copy,'test/telegram-mock.ts'),mockOriginal=fs.readFileSync(mockFile,'utf8');
for(const mode of ['original','delayed-bind','delayed-bind-semantic']){
 fs.writeFileSync(mockFile,mode==='original'?mockOriginal:mockOriginal.replace('case "sendMessage": reply','case "sendMessage": if(String(params.text).includes("\\uC800\\uC7A5\\uD558\\uC9C0 \\uBABB\\uD574 \\uACB0\\uC18D\\uD558\\uC9C0 \\uC54A\\uC558\\uB2E4")) await new Promise(r=>setTimeout(r,200)); reply'));
 let modified=segment;
 if(mode!=='original'){
  const semantic=mode==='delayed-bind-semantic';
  modified=modified.replace(save,`a.save = () => { const stage = Object.values(t.adapter.state.topics).includes("n3") ? "topic-table" : t.adapter.state.provisioning.n3 ? "intent" : "bind-offset"; const count=fail2++; const inject = ${semantic?'stage === "topic-table" && !injected':'count === 1'}; if(inject)injected=true; console.log("DIAG_SAVE "+JSON.stringify({stage,count,inject,offset:t.adapter.state.offset})); if(inject)throw new Error("disk-injected");real(); };`);
  modified=modified.replace('let fail2 = 0;','let fail2 = 0; let injected=false;');
  modified=modified.replace('await until(() => mock.texts().some((x) => x.includes("\uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uB2E4") && x.includes("/bind n3")), 6000, "/new \uC800\uC7A5 \uC2E4\uD328");','try { await until(() => mock.texts().some((x) => x.includes("\uC800\uC7A5\uD558\uC9C0 \uBABB\uD588\uB2E4") && x.includes("/bind n3")), 6000, "/new \uC800\uC7A5 \uC2E4\uD328"); } finally { console.log("DIAG_FINAL "+JSON.stringify({texts:mock.texts(),methods:mock.calls.map(c=>c.method),offset:t.adapter.state.offset,topics:t.adapter.state.topics,provisioning:t.adapter.state.provisioning})); }');
 }
 const source=original.slice(0,start)+modified+original.slice(end);fs.writeFileSync(target,source);fs.writeFileSync(path.join(output,mode+'-test-segment.txt'),modified);
 const runHome=path.join(owned,mode);fs.mkdirSync(runHome);const env={...process.env,TMP:runHome,TEMP:runHome,TMPDIR:runHome,PACE_HOME:path.join(runHome,'pace')};delete env.NODE_TEST_CONTEXT;
 const argv=['--test','--test-name-pattern=/bind.*\\uC800\\uC7A5 \\uC2E4\\uD328\\uB294',target];
 const result=spawnSync(process.execPath,argv,{cwd:copy,env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:16*1024*1024});fs.writeFileSync(path.join(output,mode+'.log'),(result.stdout??'')+(result.stderr??''));records.push({mode,status:result.status,signal:result.signal,error:result.error?.message,argv,originalSourceSha256:sha(original),diagnosticSourceSha256:sha(source),mockSourceSha256:sha(fs.readFileSync(mockFile))});console.log(mode,result.status);
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({owned,copy,originalSourceSha256:sha(original),worktreeUnchanged:sha(fs.readFileSync(path.join(root,'test/telegram-flow.test.ts'),'utf8'))===sha(original),records,limits:['Only copied source and local mock server were used. This is a controlled ordering diagnostic, not proof that the historical full failure had that exact schedule. No full load was repeated.']},null,2)+'\n');console.log(output);
