// Diagnostic only: insert a known directory between the guard's two snapshots.
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const original=fs.readdirSync;
let injected=false;
fs.readdirSync=function(dir,...args){
  const entries=original.call(this,dir,...args);
  if(!injected&&resolve(String(dir))===resolve(tmpdir())){
    injected=true;
    const root=process.env.PACE_GUARD_INJECTION==='own'?tmpdir():process.env.PACE_GUARD_SHARED_TMP;
    if(!root)throw new Error('Diagnostic shared root missing');
    const target=join(root,`pace-playbook-diagnostic-${process.pid}`);
    const child=spawnSync(process.execPath,['--input-type=module','-e',"import fs from 'node:fs';fs.mkdirSync(process.argv[1]);",target],{encoding:'utf8',windowsHide:true});
    if(child.status!==0)throw new Error(`Diagnostic peer failed: ${child.stderr}`);
    fs.writeFileSync(process.env.PACE_GUARD_TRACE,JSON.stringify({mode:process.env.PACE_GUARD_INJECTION,guardPid:process.pid,peerPid:child.pid,guardTmp:tmpdir(),sharedTmp:process.env.PACE_GUARD_SHARED_TMP,target,injected:true},null,2)+'\n');
  }
  return entries;
};
syncBuiltinESMExports();
