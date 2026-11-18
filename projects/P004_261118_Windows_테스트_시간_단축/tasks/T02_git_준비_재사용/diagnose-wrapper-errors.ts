import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync,mkdtempSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,"../../../..");
const out=join(here,"evidence",`wrapper-errors-${new Date().toISOString().replace(/[:.]/g,"-")}`);mkdirSync(out,{recursive:true});
const results=[];
for(const mode of ["failure","limit"]){
  const temp=mkdtempSync(join(tmpdir(),"pace-p004-capture-")),preload=join(temp,"inject.mjs");
  writeFileSync(preload,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
cp.spawnSync=()=>({status:${mode==="limit"?"null":"1"},signal:${mode==="limit"?"'SIGTERM'":"null"},error:${mode==="limit"?"Object.assign(new Error('synthetic capture cap'),{code:'ENOBUFS'})":"undefined"},stdout:'CAPTURE-BEGIN-'+'.'.repeat(3000)+'-CAPTURE-MIDDLE-'+'.'.repeat(3000)+'-CAPTURE-END',stderr:'CAPTURE-STDERR'});syncBuiltinESMExports();\n`);
  const env:NodeJS.ProcessEnv={...process.env,TEMP:temp,TMP:temp,TMPDIR:temp,PACE_HOME:join(temp,"pace-home")};
  for(const key of ["NODE_TEST_CONTEXT","PACE_TEST_TMP_OWNER","PACE_TEST_TMP_PARENT","PACE_KEEP_TEST_TMP","PACE_PROFILE"])delete env[key];
  const argv=["--import",pathToFileURL(preload).href,"--test","--test-reporter=tap",join(root,"test/playbook-maker.test.ts")];
  const run=spawnSync(process.execPath,argv,{cwd:root,env,encoding:"utf8",timeout:10_000,maxBuffer:1024*1024,windowsHide:true});
  const log=run.stdout+run.stderr;writeFileSync(join(out,`${mode}.tap`),log);
  const checks={nonzero:run.status===1,begin:log.includes("CAPTURE-BEGIN"),middle:log.includes("CAPTURE-MIDDLE"),end:log.includes("CAPTURE-END"),stderr:log.includes("CAPTURE-STDERR"),classified:log.includes(mode==="limit"?"capture-limit-exceeded":"nested-result"),metadata:log.includes("maxBuffer=16777216")&&log.includes(mode==="limit"?"signal=SIGTERM":"status=1")};
  results.push({mode,status:run.status,signal:run.signal,argv,checks});
}
writeFileSync(join(out,"result.json"),JSON.stringify(results,null,2)+"\n");
assert.ok(results.every(run=>Object.values(run.checks).every(Boolean)),"Wrapper failure evidence was truncated or misclassified");
console.log(`Wrapper failure diagnostic verified: ${out}`);
