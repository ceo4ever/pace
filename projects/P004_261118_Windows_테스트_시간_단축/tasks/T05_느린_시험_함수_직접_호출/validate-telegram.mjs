import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sha,actualAudit} from './source-audit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),owned=fs.mkdtempSync(path.join(os.tmpdir(),'pace-p004-t05-validation-')),copy=path.join(owned,'source');fs.mkdirSync(copy);
for(const name of ['bin','src','test','scripts','templates','skills','docs','package.json','tsconfig.json','README.md','AGENTS.md'])fs.cpSync(path.join(root,name),path.join(copy,name),{recursive:true});
const testFile=path.join(copy,'test/telegram-flow.test.ts'),adapterFile=path.join(copy,'src/daemon/telegram/adapter.ts'),mockFile=path.join(copy,'test/telegram-mock.ts');
const current=fs.readFileSync(testFile,'utf8'),before=fs.readFileSync(path.join(here,'evidence/telegram-flow-before.ts.txt'),'utf8'),adapter=fs.readFileSync(adapterFile,'utf8'),mock=fs.readFileSync(mockFile,'utf8');
const output=path.join(here,'evidence','telegram-validation-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(output);
const restore='this.state.topics = snap.topics; this.state.provisioning = snap.provisioning; this.state.held = snap.held;';assert.ok(adapter.includes(restore));const records=[];
for(const [mode,expected]of [['current',0],['delayed',0],['old-delayed',1],['bind-rollback-removed',1],['new-rollback-removed',1]]){
 let body=mode==='old-delayed'?before:current;
 body=body.replaceAll('a.save = () => {','a.save = () => { console.log("DIAG_SAVE "+JSON.stringify({boundA2:t.adapter.state.topics["55"]==="a2",provisionA2:t.adapter.state.provisioning.a2,hasN3:Object.values(t.adapter.state.topics).includes("n3"),intentN3:t.adapter.state.provisioning.n3,offset:t.adapter.state.offset}));');
 body=body.replace('injected++;','injected++; console.log("DIAG_INJECT "+JSON.stringify({injected,persistedIntent:loadTelegramState(stateFile(t.home))!.provisioning.n3,memoryIntent:t.adapter.state.provisioning.n3,hasN3:Object.values(t.adapter.state.topics).includes("n3")}));');
 fs.writeFileSync(testFile,body);
 let product=adapter;if(mode==='bind-rollback-removed')product=product.replace(restore,'if(this.state.topics["55"]!=="a2") { '+restore+' }');if(mode==='new-rollback-removed')product=product.replace(restore,'if(!Object.values(this.state.topics).includes("n3")) { '+restore+' }');fs.writeFileSync(adapterFile,product);
 fs.writeFileSync(mockFile,mode==='current'?mock:mock.replace('case "sendMessage": reply','case "sendMessage": if(String(params.text).includes("\\uC800\\uC7A5\\uD558\\uC9C0 \\uBABB\\uD574 \\uACB0\\uC18D\\uD558\\uC9C0 \\uC54A\\uC558\\uB2E4")) await new Promise(r=>setTimeout(r,200)); reply'));
 const temp=path.join(owned,mode);fs.mkdirSync(temp);const env={...process.env,TMP:temp,TEMP:temp,TMPDIR:temp,PACE_HOME:path.join(temp,'pace')};delete env.NODE_TEST_CONTEXT;
 const argv=['--test','--test-name-pattern=/bind.*\\uC800\\uC7A5 \\uC2E4\\uD328\\uB294',testFile],r=spawnSync(process.execPath,argv,{cwd:copy,env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:16*1024*1024}),raw=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(output,mode+'.log'),raw);assert.match(raw,/tests 1\r?\n/);assert.equal(r.status,expected,raw);records.push({mode,expected,status:r.status,argv,testSha256:sha(body),adapterSha256:sha(product),mockSha256:sha(fs.readFileSync(mockFile))});console.log(mode,r.status);
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({owned,copy,audit:actualAudit(),records,verifierSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),limits:['Only owned source copies and loopback mock were mutated. Historical full-failure scheduling is unknown. These runs are not final timing samples.']},null,2)+'\n');fs.copyFileSync(fileURLToPath(import.meta.url),path.join(output,'executed-validator.mjs.txt'));console.log(output);
