import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),project=path.resolve(here,'../..'),tasks=path.join(project,'tasks'),task=n=>path.join(tasks,fs.readdirSync(tasks).find(x=>x.startsWith(n+'_'))),t01=task('T01'),t03=task('T03'),t04=task('T04');
const label='t05-integrated-final-v2',freezeLabel='t05-integrated-v2',evidence=path.join(here,'evidence'),sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const run=(exe,argv,allowFailure=false)=>{const r=spawnSync(exe,argv,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});if(!allowFailure)assert.equal(r.status,0,r.stdout+r.stderr);return r;},git=(...args)=>run('git',args).stdout.trimEnd();
for(const key of ['NODE_OPTIONS','NODE_V8_COVERAGE','NODE_TEST_CONTEXT','NODE_INSPECT_RESUME_ON_START','PACE_PROJECT_CALL_TRACE'])assert.ok(!process.env[key],key);
assert.equal(git('rev-parse','main'),'35d0da642059f7a89215c605f282d307d0addf2e');run('git',['merge-base','--is-ancestor','main','HEAD']);
fs.mkdirSync(evidence,{recursive:true});assert.equal(fs.existsSync(path.join(here,'final-launch-v2.json')),false);assert.equal(fs.readdirSync(evidence).some(x=>x.startsWith(label+'-')),false);
const input=json(path.join(here,'preflight-source.json'));assert.equal(input.files.length,610);for(const f of input.files)assert.equal(sha(path.join(root,f.file)),f.sha256,f.file);
run(process.execPath,[path.join(t04,'freeze-runtime.mjs'),'capture',freezeLabel]);const before=json(path.join(t04,'evidence/runtime-'+freezeLabel+'-before-full.json'));assert.equal(before.files.length,610);
const toolFiles=[path.join(t01,'measure.ts'),path.join(t01,'reporter.ts'),path.join(project,'report.ts'),path.join(project,'measurement-data.ts'),path.join(t03,'observations.ts'),path.join(t04,'freeze-runtime.mjs'),...['integration-proof.mjs','preflight-source.json','run-final.mjs'].map(f=>path.join(here,f))];
const tools=toolFiles.map(file=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:sha(file)})),argv=[path.join(t01,'measure.ts'),'--runs','3','--label',label,'--evidence-dir',evidence];
const launch={created:new Date().toISOString(),head:git('rev-parse','HEAD'),main:git('rev-parse','main'),gitStatus:git('status','--porcelain=v1','-z'),freezeLabel,sourceFiles:610,tools,argv,limits:['Only this new set is eligible for integrated P6 acceptance.','Snapshots are not continuous monitoring or host load isolation.','No tests/diagnostics or runtime/tool edits overlap; reading and progress verification may occur.']};fs.writeFileSync(path.join(here,'final-launch-v2.json'),JSON.stringify(launch,null,2)+'\n');
console.log(JSON.stringify({starting:true,label,sourceFiles:610,tools:tools.length,argv}));
const status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,argv,{cwd:root,windowsHide:true,stdio:'inherit'});child.once('error',reject);child.once('close',(status,signal)=>resolve({status,signal}));});
const freeze=run(process.execPath,[path.join(t04,'freeze-runtime.mjs'),'verify',freezeLabel],true);fs.writeFileSync(path.join(here,'freeze-after-v2.log'),freeze.stdout+freeze.stderr);
const folders=fs.readdirSync(evidence).filter(x=>x.startsWith(label+'-'));assert.equal(folders.length,1);const folder=path.join(evidence,folders[0]),summary=json(path.join(folder,'summary.json')),results=json(path.join(folder,'results.json'));
const binding={created:new Date().toISOString(),status,folder,head:git('rev-parse','HEAD'),main:git('rev-parse','main'),headSame:git('rev-parse','HEAD')===launch.head,mainSame:git('rev-parse','main')===launch.main,gitStatus:git('status','--porcelain=v1','-z'),sourceComparison:json(path.join(t04,'evidence/runtime-'+freezeLabel+'-comparison.json')),toolsSame:tools.every(x=>sha(path.join(root,x.file))===x.sha256),summary,resultsSha256:sha(path.join(folder,'results.json')),rawLogs:results.map(x=>({file:x.log,sha256:sha(x.log)})),totals:results.map(x=>x.totals)};fs.writeFileSync(path.join(here,'final-binding-v2.json'),JSON.stringify(binding,null,2)+'\n');
assert.equal(binding.headSame,true);assert.equal(binding.mainSame,true);assert.equal(binding.toolsSame,true);assert.equal(binding.sourceComparison.verified,true);assert.equal(freeze.status,0);
if(status.status===0&&summary.valid===true){const proof=run(process.execPath,[path.join(here,'integration-proof.mjs'),'verify',folder,freezeLabel],true);fs.writeFileSync(path.join(here,'final-verification-v2.log'),proof.stdout+proof.stderr);console.log(proof.stdout+proof.stderr);process.exitCode=proof.status??1;}
else{process.exitCode=1;console.log(JSON.stringify({valid:false,stopped:true,status,summary,totals:binding.totals,folder}));}
