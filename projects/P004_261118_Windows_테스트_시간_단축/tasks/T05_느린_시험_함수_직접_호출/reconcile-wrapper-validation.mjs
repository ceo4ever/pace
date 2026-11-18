import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {actualWrapperAudit} from './wrapper-source-audit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'evidence/wrapper-validation');
const sha=b=>createHash('sha256').update(b).digest('hex');
const records=JSON.parse(fs.readFileSync(path.join(out,'records.json'),'utf8'));assert.equal(records.length,2);
const evidence=[];
for(const [index,mode]of ['file-full','wrong-file'].entries()){
 const record=records[index],source=fs.readFileSync(path.join(out,mode+'.test.ts.txt'),'utf8'),raw=fs.readFileSync(path.join(out,mode+'.log'),'utf8');
 assert.equal(record.mode,mode);assert.equal(record.sourceSha256,sha(source));assert.equal(record.status,index===0?0:1);assert.equal(record.signal,null);assert.equal(record.error,undefined);
 assert.match(raw,new RegExp('tests '+(index===0?10:1)+'\\r?\\n'));assert.match(raw,new RegExp('pass '+(index===0?10:0)+'\\r?\\n'));assert.match(raw,new RegExp('fail '+(index===0?0:1)+'\\r?\\n'));assert.match(raw,/cancelled 0\r?\n/);assert.match(raw,/skipped 0\r?\n/);
 const checked={mode,status:record.status,sourceSha256:sha(source),logSha256:sha(raw),elapsedMs:record.elapsedMs};
 if(index===1){
  const expression='assert.equal(realpathSync.native(dirname(resolvedWrapper)), realpathSync.native(bin), version.stderr);';
  const line=source.split(/\r?\n/).findIndex(s=>s.trim()===expression)+1;assert.equal(line,124);
  assert.ok(raw.includes(pathToFileURL(record.argv.at(-1)).href+':'+line+':10)'));
  assert.match(raw,/ERR_ASSERTION/);assert.match(raw,/pace wrapper lookup: \/tmp\//);assert.match(raw,/generatedMessage: false/);assert.match(raw,/operator: 'strictEqual'/);assert.doesNotMatch(raw,/SyntaxError|TypeError|ERR_MODULE_NOT_FOUND/);
  const positive=fs.readFileSync(path.join(out,'file-full.test.ts.txt'),'utf8');assert.equal(source,positive.replace('cygpath -aw "$actual" && pace --version','cygpath -aw "$P034_BIN/../app/bin/pace.ts" && pace --version'));
  checked.failedAssertion={line,expression};checked.failedBeforeInodeComparison=true;
 }
 evidence.push(checked);
}
const executed=fs.readFileSync(path.join(here,'validate-wrapper.mjs'));fs.writeFileSync(path.join(out,'executed-validator.mjs.txt'),executed);
const report={verifiedFromPreservedRuns:true,newTestExecutions:0,audit:actualWrapperAudit(),records:evidence,originalValidator:{exitCode:1,sha256:sha(executed),toolError:'Expected the source expression in an assertion message. A custom stderr message suppresses that expression (generatedMessage:false). Both requested test executions had already completed and were saved.',correctedBy:'Read-only exact executed source SHA and stack line comparison; no test rerun.'},limits:['Wrong-file fails at the bin-parent path assertion, before native file/inode checks; it does not independently test inode-only rejection.','Historical full-failure cause remains unknown.','Focused fixture results are not new full-project/P6 measurements.']};
fs.writeFileSync(path.join(out,'reconciled-manifest.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({verifiedFromPreservedRuns:true,newTestExecutions:0,records:evidence.map(x=>({mode:x.mode,status:x.status,failedAssertion:x.failedAssertion}))}));
