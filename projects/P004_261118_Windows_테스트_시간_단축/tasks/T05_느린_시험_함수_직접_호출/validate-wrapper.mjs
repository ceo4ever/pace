import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {actualWrapperAudit} from './wrapper-source-audit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),output=path.join(here,'evidence','wrapper-validation');
assert.equal(fs.existsSync(output),false,'One file-full and one negative execution');fs.mkdirSync(output);
const owned=fs.mkdtempSync(path.join(os.tmpdir(),'pace-p004-wrapper-validation-')),copy=path.join(owned,'source');
const git=(cwd,...args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout;};
git(owned,'clone','--no-hardlinks','--no-checkout','--quiet',root,copy);git(copy,'read-tree','HEAD');git(copy,'update-ref','refs/heads/main',git(root,'rev-parse','main').trim());
const walk=f=>{const info=fs.lstatSync(f);assert.equal(info.isSymbolicLink(),false);if(info.isDirectory()){for(const n of fs.readdirSync(f))walk(path.join(f,n));}else{const to=path.join(copy,path.relative(root,f));fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(f,to);}};
for(const part of ['bin','src','scripts','test','templates','skills','docs','package.json','package-lock.json','tsconfig.json','README.md','AGENTS.md','.pace/test-map.json'])walk(path.join(root,part));
const target=path.join(copy,'test/install-windows-wrapper.test.ts'),current=fs.readFileSync(target,'utf8'),records=[],sha=b=>createHash('sha256').update(b).digest('hex');
const audit=actualWrapperAudit();
for(const mode of ['file-full','wrong-file']){
 let body=current;
 if(mode==='wrong-file'){const from='cygpath -aw "$actual" && pace --version',to='cygpath -aw "$P034_BIN/../app/bin/pace.ts" && pace --version';assert.equal(body.split(from).length,2);body=body.replace(from,to);}
 fs.writeFileSync(target,body);
 const temp=path.join(owned,mode);fs.mkdirSync(temp);const env={...process.env,TMP:temp,TEMP:temp,TMPDIR:temp,PACE_HOME:path.join(temp,'pace')};delete env.NODE_TEST_CONTEXT;
 const argv=['--test',...(mode==='wrong-file'?['--test-name-pattern=Windows Git Bash']:[]),target];
 const began=performance.now(),r=spawnSync(process.execPath,argv,{cwd:copy,env,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:32*1024*1024}),raw=(r.stdout??'')+(r.stderr??''),elapsedMs=performance.now()-began;
 fs.writeFileSync(path.join(output,mode+'.log'),raw);
 const record={mode,argv,status:r.status,signal:r.signal,error:r.error?.message,elapsedMs,sourceSha256:sha(body),sourceReference:{rawPath:target,sha256:sha(body)}};records.push(record);
 fs.writeFileSync(path.join(output,'records.json'),JSON.stringify(records,null,2)+'\n');
 // Retain exact executed sources separately; they contain no secret fixtures.
 fs.writeFileSync(path.join(output,mode+'.test.ts.txt'),body);
 assert.equal(r.error,undefined,raw);
 assert.equal(r.status,mode==='file-full'?0:1,raw);
 if(mode==='file-full'){assert.match(raw,/fail 0\r?\n/);assert.match(raw,/cancelled 0\r?\n/);}
 else{assert.match(raw,/tests 1\r?\n/);assert.match(raw,/fail 1\r?\n/);assert.match(raw,/ERR_ASSERTION/);assert.match(raw,/realpathSync\.native\(dirname\(resolvedWrapper\)\)/);assert.doesNotMatch(raw,/SyntaxError|TypeError|ERR_MODULE_NOT_FOUND/);}
 console.log(JSON.stringify({mode,status:r.status,elapsedMs}));
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({verified:true,owned,copy,audit,records,limits:['File-full runs actual Windows wrapper/install fixture boundaries; no actual user installation or settings changes.','Wrong-file fails at the bin-parent path assertion, before the inode comparison; it is not a separate inode-only failure proof.','These focused executions are not full-project timing samples; historical failure cause remains unknown.']},null,2)+'\n');
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(output,'executed-validator.mjs.txt'));
