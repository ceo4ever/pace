import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {runDeclaredShell} from '../../../../src/project/harness.ts';
const here=path.dirname(fileURLToPath(import.meta.url)),owned=fs.mkdtempSync(path.join(os.tmpdir(),'pace-p004-execution-'));
const interrupted=runDeclaredShell(owned,'kill -TERM $$');
assert.equal(interrupted.started,true);assert.ok(['failed','interrupted'].includes(interrupted.execution));assert.equal(interrupted.ok,false);
const originalPath=process.env.PATH;let unavailable;
try{process.env.PATH=owned;unavailable=runDeclaredShell(owned,'unused-command');}
finally{if(originalPath===undefined)delete process.env.PATH;else process.env.PATH=originalPath;}
assert.equal(unavailable.execution,'unavailable');assert.equal(unavailable.started,false);assert.equal(unavailable.ok,false);
const result={verified:true,platform:process.platform,interrupted,unavailable,expectedChangedCodes:{interrupted:1,unavailable:3},limitations:['The signal is sent by the owned child shell to itself. No unrelated PID is signaled.','Windows Git sh may encode a signal as a nonzero status rather than a Node signal field; both represent an execution that started and failed.','This auxiliary observation ran after the full regression, outside its timing.']};
fs.writeFileSync(path.join(here,'evidence/execution-observation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
