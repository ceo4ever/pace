// Observation only. Keep original retries, errors, assertions, URLs and fixtures.
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {appendFileSync} from 'node:fs';
const trace=process.env.PACE_HEAL_TRACE;
if(!trace)throw new Error('Missing owned diagnostic trace');
const record=value=>appendFileSync(trace,JSON.stringify(value)+'\n');
const prefix="import {appendFileSync as __diagAppend} from 'node:fs';const __diag=v=>__diagAppend(process.env.PACE_HEAL_TRACE,JSON.stringify(v)+'\\n');\n";
const change=(source,from,to)=>{if(source.split(from).length!==2)throw new Error('Diagnostic patch target not unique');return source.replace(from,to);};
registerHooks({load(url,context,nextLoad){
  const loaded=nextLoad(url,context);
  if(!url.endsWith('/test/playbook/healer-e2e.test.mjs')&&!url.endsWith('/skills/pace-playbook-maker/tools/orca-adapter.mjs'))return loaded;
  const original=typeof loaded.source==='string'?loaded.source:Buffer.from(loaded.source).toString('utf8');let source=original;
  if(url.endsWith('/healer-e2e.test.mjs')){
    source=change(source,'JSON.stringify(first.heals)','JSON.stringify({status:first.status,reason:first.reason,step:first.step,healCalls:first.healCalls,heals:first.heals,counts:first.counts})');
  }else{
    source=change(source,'if(r.error)throw r.error;',"if(r.error){__diag({kind:'spawn-error',command:args[0],code:r.error.code??'unknown',status:r.status,signal:r.signal});throw r.error;}");
    source=change(source,'catch{throw new Error(`orca ${args[0]} 출력 해석 실패`);}',"catch{__diag({kind:'stdout-json-error',command:args[0],status:r.status,signal:r.signal});throw new Error(`orca ${args[0]} 출력 해석 실패`);}");
    source=change(source,'if(!j.ok)throw new Error(',"if(!j.ok){const c=String(j.error?.code??'error');__diag({kind:'rpc-error',command:args[0],code:/^[a-zA-Z0-9_:-]{1,80}$/.test(c)?c:'unclassified'});}if(!j.ok)throw new Error(");
    source=change(source,'return JSON.parse(r.result);',"try{return JSON.parse(r.result);}catch(e){__diag({kind:'result-json-error',code:e.name,resultType:typeof r.result});throw e;}");
    source=prefix+source;
  }
  record({kind:'observed-module',url,originalSha256:createHash('sha256').update(original).digest('hex'),observedSha256:createHash('sha256').update(source).digest('hex')});
  return {...loaded,source};
}});
