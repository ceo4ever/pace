import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'evidence','wrapper-alias-comparison');
assert.equal(fs.existsSync(out),false,'One approved alias comparison only');
fs.mkdirSync(out);
const owned=fs.mkdtempSync(path.join(os.tmpdir(),'pace-p004-wrapper-alias-'));
const home=path.join(owned,"\uD55C\uAE00 space '$&()"),bin=path.join(home,'.pace','bin');
fs.mkdirSync(bin,{recursive:true});
const expected=path.join(bin,'pace'),other=path.join(bin,'other');
fs.writeFileSync(expected,'#!/bin/sh\nprintf "fixture\\n"\n');
fs.writeFileSync(other,'#!/bin/sh\nprintf "other\\n"\n');
const git=spawnSync('git',['--exec-path'],{encoding:'utf8',windowsHide:true});
assert.equal(git.status,0,git.stderr);
const bash=path.resolve(git.stdout.trim(),'../../../bin/bash.exe');
const env={...process.env,HOME:home,TMP:owned,TEMP:owned,TMPDIR:owned};
delete env.NODE_TEST_CONTEXT;
const driveAlias=p=>{assert.match(p,/^[A-Za-z]:\\/);return '/'+p[0].toLowerCase()+p.slice(2).replaceAll('\\','/');};
const calls=[];
const run=(script,args)=>{const argv=['-c',script,'p004-alias',...args];const r=spawnSync(bash,argv,{cwd:home,env,encoding:'utf8',windowsHide:true,timeout:30000});calls.push({argv,status:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,stderr:r.stderr});assert.equal(r.status,0,r.stderr);return r.stdout.trim().split(/\r?\n/);};
const identity=input=>{const st=fs.statSync(input,{bigint:true});assert.equal(st.isFile(),true);return {input,native:fs.realpathSync.native(input),dev:String(st.dev),ino:String(st.ino)};};
const same=(a,b)=>a.native.toLowerCase()===b.native.toLowerCase()&&a.dev===b.dev&&a.ino===b.ino;
let result;
try {
  const first=run('PATH="$(cygpath -u "$1"):$PATH"; actual="$(command -v pace)"; printf "%s\\n" "$actual"; cygpath -aw "$actual"',[bin]);
  assert.equal(first.length,2);
  assert.match(first[0],/^\/tmp\//,'Actual command-v must exercise /tmp alias');
  const second=run('printf "%s\\n" "$1"; cygpath -aw "$1"; printf "%s\\n" "$2"; cygpath -aw "$2"',[driveAlias(expected),driveAlias(other)]);
  assert.equal(second.length,4);
  assert.match(second[0],/^\/c\//i);
  assert.match(second[2],/^\/c\//i);
  const expectedIdentity=identity(expected),firstIdentity=identity(first[1]),secondIdentity=identity(second[1]),negativeIdentity=identity(second[3]);
  assert.equal(same(firstIdentity,expectedIdentity),true);
  assert.equal(same(secondIdentity,expectedIdentity),true);
  assert.notEqual(first[0],second[0]);
  assert.equal(same(negativeIdentity,expectedIdentity),false,'A different file using the same alias format must be rejected');
  result={status:'pass',firstAlias:first[0],secondAlias:second[0],negativeAlias:second[2],expectedIdentity,firstIdentity,secondIdentity,negativeIdentity,positiveMatches:true,negativeRejected:true};
} catch(error) {result={status:'fail',error:{name:error.name,message:error.message,stack:error.stack}};process.exitCode=1;}
finally {
  const scriptBytes=fs.readFileSync(fileURLToPath(import.meta.url));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({owned,bash,cwd:home,env:{HOME:env.HOME,TMP:env.TMP,TEMP:env.TEMP,TMPDIR:env.TMPDIR},calls,result,scriptSha256:createHash('sha256').update(scriptBytes).digest('hex'),limits:['One owned fixture comparison; no install or settings changes.','Different aliases are deliberately selected, not a reproduction of the historical failing schedule.','Only the observed file identities are established; historical cause remains unknown.']},null,2)+'\n');
  fs.writeFileSync(path.join(out,'executed-comparison.mjs.txt'),scriptBytes);
  console.log(JSON.stringify(result,null,2));
}
