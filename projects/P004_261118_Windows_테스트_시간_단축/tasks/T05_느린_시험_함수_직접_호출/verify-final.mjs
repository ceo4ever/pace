import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..'),tasks=path.dirname(here);
const t04=path.join(tasks,fs.readdirSync(tasks).find(n=>n.startsWith('T04_'))),t03=path.join(tasks,fs.readdirSync(tasks).find(n=>n.startsWith('T03_')));
const {readRuns,median}=await import(pathToFileURL(path.join(t03,'observations.ts')).href);
const folder=path.resolve(process.argv[2]),mode=process.argv[3];assert.ok(['smoke','final'].includes(mode));
const freezeLabel=process.argv[4];if(mode==='final')assert.match(freezeLabel??'',/^t05-[a-z0-9-]+$/);
const outputName=process.argv[5]||mode+'-views';assert.match(outputName,/^[a-z0-9-]+$/);
const output=path.join(here,'evidence',outputName);assert.equal(fs.existsSync(output),false,'Never overwrite earlier verification');fs.mkdirSync(output,{recursive:true});
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const runs=readRuns(folder),results=json(path.join(folder,'results.json')),summary=json(path.join(folder,'summary.json'));
assert.equal(runs.length,mode==='smoke'?1:3);assert.equal(summary.valid,true);assert.equal(summary.runs,runs.length);
assert.equal(summary.medianMs,median(results.map(r=>r.elapsedMs)));const caseSource=path.join(root,'test/changed-test.test.ts'),records=[];
for(let i=0;i<runs.length;i++){
 const {run}=runs[i];for(const [k,v]of Object.entries({tests:mode==='final'?996:995,pass:mode==='final'?987:986,fail:0,cancelled:0,skipped:9,todo:0}))assert.equal(run.totals[k],v,k);
 const view=path.join(output,'run-'+(i+1));fs.mkdirSync(view);assert.equal(path.isAbsolute(results[i].log),true);assert.equal(fs.existsSync(results[i].log),true);
 fs.copyFileSync(path.join(folder,'environment.json'),path.join(view,'environment.json'));fs.writeFileSync(path.join(view,'results.json'),JSON.stringify([results[i]],null,2)+'\n');
 const comparator=path.join(mode==='final'?here:t04,'compare-regression.mjs');
 const report=path.join(output,'comparison-run-'+(i+1)+'.json');const child=spawnSync(process.execPath,[comparator,view,caseSource,report],{cwd:root,encoding:'utf8'});
 fs.writeFileSync(path.join(output,'comparison-run-'+(i+1)+'.log'),child.stdout+child.stderr);assert.equal(child.status,0,child.stdout+child.stderr);const compared=json(report);assert.equal(compared.verified,true);
 if(mode==='smoke')assert.deepEqual(compared,json(path.join(folder,'t03-regression-comparison.json')));
 records.push({originalRun:i+1,originalLog:results[i].log,originalLogSha256:sha(results[i].log),view,viewResultsSha256:sha(path.join(view,'results.json')),environmentSha256:sha(path.join(view,'environment.json')),caseSourceSha256:sha(caseSource),comparison:report,comparisonSha256:sha(report)});
}
const report={verified:true,mode,originalFolder:folder,originalResultsSha256:sha(path.join(folder,'results.json')),originalEnvironmentSha256:sha(path.join(folder,'environment.json')),originalSummarySha256:sha(path.join(folder,'summary.json')),sharedEnvironment:true,verifierSha256:sha(fileURLToPath(import.meta.url)),records};
if(mode==='final'){
 const t01=path.join(tasks,fs.readdirSync(tasks).find(n=>n.startsWith('T01_'))),e=path.join(t01,'evidence');
 const candidates=fs.readdirSync(e).filter(n=>/^baseline-\d{4}-/.test(n)&&fs.existsSync(path.join(e,n,'summary.json'))).map(n=>path.join(e,n,'summary.json')).filter(f=>json(f).valid===true&&json(f).runs===3&&!json(f).reusedBaseline);
 assert.equal(candidates.length,1,'One original uninstrumented valid three-run baseline');const baseline=candidates[0],baselineRuns=readRuns(path.dirname(baseline));assert.equal(baselineRuns.length,3);assert.equal(json(baseline).medianMs,median(baselineRuns.map(x=>x.run.elapsedMs)),'Baseline median must match raw stored run values');
 const freezeFile=path.join(t04,'evidence/runtime-'+freezeLabel+'-comparison.json'),freeze=json(freezeFile);assert.equal(freeze.verified,true);assert.equal(freeze.fileCount,609);
 report.freezeComparisonSha256=sha(freezeFile);report.freezeLabel=freezeLabel;report.baseline={file:baseline,sha256:sha(baseline),medianMs:json(baseline).medianMs};report.medianMs=summary.medianMs;report.percentOfBaseline=summary.medianMs/report.baseline.medianMs*100;report.goalMet=summary.medianMs*2<=report.baseline.medianMs;
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verified:true,mode,runs:runs.length,goalMet:report.goalMet,medianMs:report.medianMs,output}));
