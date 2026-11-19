import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..');
const git=(args,allowFailure=false)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,env:{...process.env,GIT_EDITOR:'true'}});if(!allowFailure)assert.equal(r.status,0,r.stdout+r.stderr);return r;};
assert.equal(git(['rev-parse','main']).stdout.trim(),'35d0da642059f7a89215c605f282d307d0addf2e');
const allowed=['src/test-runner/runner.ts','docs/README.md','skills/pace-project-init/references/test-map.md','.pace/brain/log.md','backlogs/dashboard/data.js'];
const conflicts=git(['diff','--name-only','--diff-filter=U','-z']).stdout.split('\0').filter(Boolean);assert.ok(conflicts.length);assert.equal(conflicts.every(f=>allowed.includes(f)),true,'Unexpected conflict: '+conflicts.join(','));
const owned=fs.mkdtempSync(path.join(os.tmpdir(),'pace-p004-rebase-stages-')),records=[];
for(const file of conflicts)for(const stage of [1,2,3]){const r=spawnSync('git',['show',':'+stage+':'+file],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});assert.equal(r.status,0);const to=path.join(owned,stage+'-'+file.replaceAll('/','__'));fs.writeFileSync(to,r.stdout);records.push({file,stage,rawPath:to,sha256:createHash('sha256').update(r.stdout).digest('hex')});}
const number=fs.readdirSync(here).filter(n=>/^conflict-stages-\d+\.json$/.test(n)).length+1;
fs.writeFileSync(path.join(here,'conflict-stages-'+number+'.json'),JSON.stringify({main:'35d0da6',recoveryRef:'p004-before-main-integration-20261119',conflicts,records},null,2)+'\n');
if(conflicts.some(f=>!['.pace/brain/log.md','backlogs/dashboard/data.js'].includes(f))){console.log(JSON.stringify({codeResolutionRequired:true,conflicts,owned}));process.exit(0);}
for(const file of conflicts){
 if(file==='.pace/brain/log.md'){
  const ours=git(['show',':2:'+file]).stdout,theirs=git(['show',':3:'+file]).stdout,parts=s=>s.split(/(?=^## \[)/m);const a=parts(ours),b=parts(theirs);assert.equal(a[0].trim(),b[0].trim());const entries=[...new Set([...a.slice(1),...b.slice(1)].map(x=>x.trim()))];fs.writeFileSync(path.join(root,file),a[0].trimEnd()+'\n\n'+entries.join('\n\n')+'\n');
 }else{
  fs.writeFileSync(path.join(root,file),git(['show',':2:'+file]).stdout);
  const r=spawnSync(process.execPath,['bin/pace.ts','backlog','refresh'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
 }
 git(['add','--',file]);
}
const next=git(['rebase','--continue'],true);fs.writeFileSync(path.join(owned,'continue.log'),next.stdout+next.stderr);console.log(JSON.stringify({recordsMerged:conflicts,rebaseStatus:next.status,log:path.join(owned,'continue.log'),summary:next.stdout.split(/\r?\n/)[0],stderr:next.stderr.split(/\r?\n/).filter(x=>/Rebasing|Could not|Successfully/.test(x))}));
if(next.status!==0){const remaining=git(['diff','--name-only','--diff-filter=U','-z']).stdout.split('\0').filter(Boolean);assert.ok(remaining.length,'Non-conflict rebase failure');assert.equal(remaining.every(f=>allowed.includes(f)),true,'Unexpected conflict after continue: '+remaining.join(','));}
