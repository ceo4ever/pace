import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),tasks=path.dirname(here),t04=path.join(tasks,fs.readdirSync(tasks).find(n=>n.startsWith('T04_'))),e=path.join(here,'evidence');
const mode=process.argv[2];assert.ok(['worktree','head','finish'].includes(mode));
const frozen=JSON.parse(fs.readFileSync(path.join(t04,'evidence/runtime-t05-wrapper-before-full.json'),'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(frozen.files.length,609);
const git=(argv,input)=>{const r=spawnSync('git',argv,{cwd:root,input,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trimEnd();};
for(const item of frozen.files){assert.doesNotMatch(item.file,/[\r\n]/);assert.equal(sha(fs.readFileSync(path.join(root,item.file))),item.sha256,item.file);}
const normalized=git(['hash-object','--stdin-paths'],frozen.files.map(x=>x.file).join('\n')+'\n').split(/\r?\n/);assert.equal(normalized.length,609);
const records=frozen.files.map((item,i)=>({...item,gitNormalizedBlobId:normalized[i]}));
const report={verified:true,mode,head:git(['rev-parse','HEAD']),measuredRuntimeFiles:609,currentWorkingBytesMatchMeasured:true,records,limits:['Runtime SHA-256 records actual measured Windows bytes. Git-normalized blob IDs account for repository line-ending attributes.','This verifies content identity; it does not rerun tests or continuously monitor the worktree.']};
if(mode!=='worktree'){
 const old=JSON.parse(fs.readFileSync(path.join(e,'closing-source-worktree.json'),'utf8'));assert.deepEqual(records,old.records);
 const committed=git(['cat-file','--batch-check=%(objectname)'],records.map(x=>'HEAD:'+x.file).join('\n')+'\n').split(/\r?\n/);assert.equal(committed.length,609);assert.equal(committed.every((x,i)=>x===records[i].gitNormalizedBlobId),true,'Committed runtime content differs from measured sources');report.committedBlobContentMatchesMeasured=true;
}
if(mode!=='finish'){const output=path.join(e,'closing-source-'+mode+'.json');assert.equal(fs.existsSync(output),false);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({verified:true,mode,head:report.head,measuredRuntimeFiles:609,currentWorkingBytesMatchMeasured:true,committedBlobContentMatchesMeasured:report.committedBlobContentMatchesMeasured}));
