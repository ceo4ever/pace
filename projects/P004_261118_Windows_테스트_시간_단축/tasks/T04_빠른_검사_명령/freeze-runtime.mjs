import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../../..');
if(!['capture','verify'].includes(process.argv[2]))throw Error('Usage: freeze-runtime.mjs capture|verify [label]');
const label=process.argv[3]||'';if(label&&!/^[a-z0-9-]+$/.test(label))throw Error('Invalid snapshot label');
const prefix=label?'runtime-'+label:'runtime';
const files=[];
const walk=file=>{const info=fs.lstatSync(file);assert.ok(!info.isSymbolicLink(),'Runtime source link: '+file);if(info.isDirectory()){for(const name of fs.readdirSync(file))walk(path.join(file,name));return;}const bytes=fs.readFileSync(file);files.push({file:path.relative(root,file).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex')});};
for(const part of ['bin','src','scripts','test','templates','skills','docs','package.json','package-lock.json','tsconfig.json','README.md','AGENTS.md','.pace/test-map.json'])walk(path.join(root,part));
files.sort((a,b)=>a.file.localeCompare(b.file));
const output=path.join(here,'evidence',prefix+(process.argv[2]==='capture'?'-before-full.json':'-after-full.json'));
const report={captured:new Date().toISOString(),node:process.version,files,verifierSha256:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),limitations:['Before/after byte snapshots do not continuously monitor edits and reversions. Project evidence, backlog snapshots and brain/memory records are outside this runtime source manifest.']};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(process.argv[2]==='verify'){const before=JSON.parse(fs.readFileSync(path.join(here,'evidence',prefix+'-before-full.json'),'utf8'));const checks={files:JSON.stringify(report.files)===JSON.stringify(before.files),node:report.node===before.node,verifier:report.verifierSha256===before.verifierSha256};const changedKeys=Object.keys({...before,...report}).filter(key=>JSON.stringify(before[key])!==JSON.stringify(report[key]));const comparison={verified:Object.values(checks).every(Boolean),checks,fileCount:files.length,fullyEqual:changedKeys.length===0,metadataDifferences:changedKeys.filter(key=>key!=='files').map(key=>({key,before:before[key],after:report[key]})),sourceTreeSha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};fs.writeFileSync(path.join(here,'evidence',prefix+'-comparison.json'),JSON.stringify(comparison,null,2)+'\n');assert.equal(comparison.verified,true);}
console.log(JSON.stringify({mode:process.argv[2],files:files.length,verified:true,output}));
