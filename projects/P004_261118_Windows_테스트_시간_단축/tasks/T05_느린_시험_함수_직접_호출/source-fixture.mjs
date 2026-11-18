import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export function readHarnessBefore(){
 const meta=JSON.parse(fs.readFileSync(path.join(here,'evidence/harness-before-source-ref.json'))),r=spawnSync('git',['cat-file','blob',meta.gitObject],{cwd:path.resolve(here,'../../../..'),encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_OPTIONAL_LOCKS:'0'}});assert.equal(r.status,0,r.stderr);
 const normalized=r.stdout.replace(/\r\n/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex');assert.equal(hash(normalized),meta.normalizedSha256);const parts=normalized.split('\n');assert.equal(parts.length-1,meta.newlineCRLF.length);const text=parts.map((line,i)=>line+(i<parts.length-1?(meta.newlineCRLF[i]?'\r\n':'\n'):'')).join('');assert.equal(hash(text),meta.sha256);return text;
}
