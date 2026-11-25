import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const [workspace, run] = process.argv.slice(2);
const save = (path, value) => writeFileSync(path, JSON.stringify(value));
const hash = (s) => createHash('sha256').update(s).digest('hex');
const results = {};
const add = (name, expected, actual) => { results[name] = {expected, actual, matches: JSON.stringify(expected) === JSON.stringify(actual)}; };
function fixture(name) {
  const root = join(run,name), home = join(root,'pace-home');
  mkdirSync(home,{recursive:true});
  mkdirSync(join(root,'docs'));
  writeFileSync(join(root,'docs/README.md'),'# Synthetic\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n');
  const env = {PATH:process.env.PATH, TMPDIR:process.env.TMPDIR ?? '/tmp', PACE_HOME:home, GIT_CONFIG_GLOBAL:'/dev/null', GIT_CONFIG_NOSYSTEM:'1'};
  const sh = (exe,...args) => {
    const {status,stdout,stderr,error} = spawnSync(exe,args,{cwd:root,env,input:"Synthetic fixture body",encoding:'utf8'});
    if (error) throw error;
    return {status,stdout,stderr};
  };
  const must = (r) => { assert.equal(r.status,0,JSON.stringify(r)); return r; };
  const git = (...args) => must(sh('git',...args));
  const pace = (...args) => sh(process.execPath,join(workspace,'bin/pace.ts'),...args);
  git('init','-q','-b','main');
  git('config','user.name','Synthetic Tester');
  git('config','user.email','synthetic@example.invalid');
  git('add','-A'); git('commit','-qm','setup');
  must(pace('project','new','Independent fixture'));
  const dir = join(root,'projects',readdirSync(join(root,'projects')).find(s=>s.startsWith('P001_')));
  const path = (name)=>join(dir,name);
  const project = readFileSync(path('PROJECT.md'),'utf8').replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/,'| P-1 | Synthetic | Synthetic |');
  const marker = '- 팀 측정: v1';
  const ledger = (rows) => writeFileSync(path('log.jsonl'),rows.map((r)=>JSON.stringify({p:'P001',...r})).join('\n'));
  const input = (v)=>save(path('TEAM-MEASUREMENT.json'),{version:1,...v});
  const stats = () => JSON.parse(must(pace('project','stats','P001','--json')).stdout);
  const receipt = (ref,p,requestId) => {
    const period = p && {start:p.start,end:p.end,unit:p.unit};
    save(path(ref),{version:1,kind:'team-evidence',sourceRef:'fixture:synthetic',hash:hash(JSON.stringify({ref,period,requestId})),period,requestId});
  };
  const head = (str) => writeFileSync(path('PROJECT.md'),project.replace(/^(# [^\n]+)\n/,'$1\n\n'+str+'\n\n'));
  const close = (retro) => writeFileSync(path('PROJECT-CLOSE.md'),[
    '# Synthetic close','','## 기준 대조','','| # | 결과 | 증거 |','|---|---|---|','| P-1 | 통과 | synthetic |','','## 보안','','합성 검사 실행','','## 정본 반영','','| 정본 | 반영 | 비고 |','|---|---|---|','| `docs/README.md` | 해당 없음 | synthetic |','',retro,'','## 지표','','[지표](METRICS.md)','','합성 지표 해석.',''
  ].join('\n'));
  const finish = () => { git('add','-A'); git('commit','-qm','fixture files'); const r=pace('project','finish','P001'); save(join(root,'finish-result.json'),r); return r.status; };
  ledger([]);
  return {root,git,pace,must,path,head,close,finish,ledger,stats,receipt,input,marker};
}
const day = n => '2026-02-'+String(n).padStart(2,'0')+'T00:00:00Z';
const frame = (n,completionRef='completion.json')=>({start:day(n),end:day(n+1),unit:'representative-task',closed:true,completionRef});
const at = (p,n)=>new Date(Date.parse(p.start)+1000*n).toISOString();
const cov = ref=>({status:'complete',reportedBy:'agent:maker',verifiedBy:'coordinator',confirmationRef:ref,refs:[ref]});
const table = '| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 요약 |';
const role = {name:'maker',source:'option',definition:'.pace/team/maker.md',hash:hash('synthetic'),method:'prompt',model:'synthetic',settingsStatus:'planned',toolsPermissionApplied:false,runtimeObserved:false};
const ret = (refs=[])=>({version:1,metricRef:'METRICS.md',unusedRoles:refs.length?[{role:'maker',coverage:'observed-none',refs}]:[],recurringFindings:[],definitionChanges:[],noChangesReasonRef:'completion.json'});
{
  const f=fixture('reach'), p=frame(1), ref=p.completionRef, id='reach-test';
  f.receipt(ref,p,id);
  const question={ts:at(p,2),type:'question',by:'agent',to:'owner',requestId:id,msg:'Synthetic question'};
  const answer=(by,t)=>({ts:at(p,t),type:'answer',by,requestId:id,ref,msg:'Synthetic answer'});
  f.input({period:p,request_coverage:cov(ref)});
  for(const [label,t,expected] of [['owner-precedes',1,[0,null]],['owner-follows',3,[1,1]]]) {
    f.ledger([answer('user',t),question]); const a=f.stats().team.requests;
    add(label,expected,[a.ownerReply,a.reachedTotal]);
  }
  f.input({period:p,request_coverage:cov(ref),coordinator_answers:[{requestId:id,coverage:cov(ref)}]});
  for(const [label,t,expected] of [['coordinator-precedes',1,[null,1]],['coordinator-follows',3,[0,0]]]) {
    f.ledger([answer('coordinator',t),{...question,to:'coordinator'}]); const a=f.stats().team.requests;
    add(label,expected,[a.reachedTotal,a.comparisonUnconfirmed]);
  }
}
{
  const f=fixture('quality'), p=frame(3), ref=p.completionRef;
  f.receipt(ref,p); f.receipt('other.json',frame(1));
  f.ledger([{ts:at(p,86401),type:'note',by:'agent',msg:'Outside selected period'}]);
  const measure = (log_coverage)=>{f.input({period:p,request_coverage:cov(ref),log_coverage}); const {blockingLogged,gateFailures}=f.stats().team.quality;return [blockingLogged,gateFailures];};
  add('request-coverage-alone',[null,null],measure(undefined));
  add('wrong-interval-log-coverage',[null,null],measure(cov('other.json')));
  add('matching-log-coverage',[0,0],measure(cov(ref)));
  const data={blocking:0,should_fix:0,reviewer:1,tester:0,pass:0,fail:1};
  const review = (msg) => {f.ledger([{ts:at(p,2),type:'review',by:'agent',msg,data}]); return measure(cov(ref))[0];};
  add('review-message-data-mismatch',null,review('reviewer fail blocking 2 should_fix 0'));
  add('canonical-review',0,review('reviewer fail blocking 0 should_fix 0'));
  add('review-fractional-count',null,review('reviewer fail blocking 0.5 should_fix 0'));
}
for(const [name,retro,kind,expected] of [
  ['canonical-retro','## 회고\n\n'+table,'none',0],
  ['indented-next-heading','## 회고\n\n없음\n\n   ## 참고\n\n'+table,'none',1],
  ['cdata-retro','## 회고\n\n<![CDATA[\n'+table+'\n]]>','none',1],
  ['malformed-retro-heading','## 회고###\n\n'+table,'none',1],
  ['wrong-range-role','## 회고\n\n'+table,'prior',1],
  ['participating-role','## 회고\n\n'+table,'active',1],
  ['eligible-unused-role','## 회고\n\n'+table,'eligible',0],
]) {
  const f=fixture(name), p=frame(5), ref=p.completionRef;
  f.head(f.marker); f.close(retro); f.receipt(ref,p); f.receipt('other.json',frame(3));
  if(kind!=='none') f.must(f.pace('team','new','maker','--role','maker'));
  if(kind==='active') {
    f.ledger([{ts:at(p,5),type:'start',by:'cli',role,msg:'Synthetic role start'}]);
    f.input({period:p,role_observations:[{role:'maker',workMs:1000,outputTokens:[{tool:'Codex',output:50}],coverage:{status:'partial',reportedBy:'agent:maker',refs:[ref]}}]});
  } else f.input({period:p});
  f.pace('team','list');
  if(kind!=='none') {
    // Store role definition as committed setup, independent of the fixture's finish check.
    const git = (...args)=>spawnSync('git',['-C',join(run,name),...args],{encoding:'utf8'});
    assert.equal(git('add','.pace/team').status,0); assert.equal(git('commit','-qm','synthetic role definition').status,0);
  }
  save(f.path('TEAM-RETROSPECTIVE.json'),ret(kind==='none'?[]:[kind==='prior'?'other.json':ref]));
  const s=f.stats();
  if(kind==='active') add('active-role-stats',[1000,50,0],[s.team.roles[0].workMs,s.team.roles[0].outputTokens[0].output,s.team.unusedRoleCandidates.length]);
  add(name,expected,f.finish());
}
for(const [name,body,expected] of [
  ['pre-example','<pre>\n- 팀 측정: v1\n</pre>',[false,0]],
  ['attribute-comment-before-real-marker','<pre data-example="<!--">\nexample\n</pre>\n\n- 팀 측정: v1',[true,1]],
]) {
  const f=fixture(name);
  f.head(body); f.close('## 회고\n\n없음'); add(name,expected,[!!f.stats().team,f.finish()]);
}
{
  const f=fixture('comparisons');
  const args=(b,a,kind='team-adoption')=>['project','compare-team','--before',f.path(b),'--after',f.path(a),'--kind',kind,'--json'];
  const samples=(after,days,edit,variant)=>{
    return {version:1,samples:days.map((d,i)=>{
      const p=frame(d,'receipt-'+variant+'-'+after+'-'+i+'.json');
      if(variant==='future') {p.start=p.start.replace('2026','2099');p.end=p.end.replace('2026','2099');}
      f.receipt(p.completionRef,p);
      const counts={owner_file_edits:edit,owner_command_runs:0,owner_manual_role_corrections:0,coordinator_extra_instructions:0};
      f.ledger(variant.startsWith('gate-compare')?[{ts:at(p,2),type:'gate',by:'cli',msg:'check: checks',ok:false,data:{check:1,...(after&&variant==='gate-compare-invalid'?{finish:2}:{})}}]:variant==='failure-change'&&after?[{ts:at(p,2),type:'review',by:'agent',msg:'reviewer fail blocking 0 should_fix 0',data:{blocking:0,should_fix:0,reviewer:1,tester:0,pass:0,fail:1}}]:variant==='fraction'&&after?[{ts:at(p,2),type:'review',by:'agent',msg:'reviewer fail blocking 0.5 should_fix 0',data:{blocking:0,should_fix:0,reviewer:1,tester:0,pass:0,fail:1}}]:[]);
      const comparison={study:'team-adoption',conditionCode:after?'team':'no-team',definition:'reach-v1',unit:p.unit,workType:'feature',sizeBand:'small',host:'codex',recordingBoundary:'closed-task',qualitySource:'event-log',qualityScopeHash:hash('same scope')};
      if(variant==='future') return {version:1,repository:'Synthetic',comparison,period:p,counts,unknown:{request_events:0}};
      f.input({period:p,comparison,counts,coverage:Object.fromEntries(Object.keys(counts).map(k=>[k,cov(p.completionRef)])),request_coverage:cov(p.completionRef),log_coverage:cov(p.completionRef),quality_audit:{blocking_sum:0,rereviews_after_fail:0,coverage:cov(p.completionRef)}});
      return f.stats().team.snapshot;
    })};
  };
  for(const [variant,b,a,x,y,expected] of [
    ['gate-compare-invalid',[1,3],[6,8],5,2,'unknown'],['gate-compare-control',[1,3],[6,8],5,2,'observed-burden-improvement'],
    ['improvement',[1,3],[6,8],5,2,'observed-burden-improvement'],
    ['worsening',[1,3],[6,8],2,5,'observed-burden-worsening'],
    ['reversed',[6,8],[1,3],5,2,'unknown'],
    ['future',[1,3],[6,8],5,2,2],
    ['fraction',[1,3],[6,8],5,2,'unknown'],['failure-change',[1,3],[6,8],5,2,'unknown'],
  ]) {
    save(f.path('before.json'),samples(false,b,x,variant));save(f.path('after.json'),samples(true,a,y,variant));
    const r=f.pace(...args('before.json','after.json')); save(f.path('result-'+variant+'.json'),r);
    add(variant,expected,r.status===0?JSON.parse(r.stdout).conclusion:r.status);
  }
}
{
  const f=fixture('cli-review-gate'), p=frame(3), ref=p.completionRef;
  f.receipt(ref,p); f.input({period:p,log_coverage:cov(ref)});
  for (const token of ['0.5','-1','0e2','0 blocking 2','0']) {
    const r=f.pace('project','log','P001','--type','review','--msg',`reviewer fail blocking ${token} should_fix 0`);
    add('review-token-'+token,token==='0'?0:1,r.status);
  }
  const quality = (row) => {
    f.ledger([{ts:at(p,2),type:'gate',by:'cli',...row}]);
    return f.stats().team.quality.gateFailures;
  };
  add('gate-failure-valid',1,quality({msg:'check: checks',ok:false,data:{check:1}}));
  add('gate-success-valid',0,quality({msg:'check',ok:true,data:{check:1}}));
  add('gate-ok-contradiction',null,quality({msg:'check: checks',ok:true,data:{check:1}}));
  add('gate-cmd-contradiction',null,quality({msg:'check: checks',ok:false,data:{done:1}}));
  add('gate-mixed-cmd-nonbinary',null,quality({msg:'check: checks',ok:false,data:{check:1,finish:2}}));
}
{
  const f=fixture('handoff-cli'), route=f.path('route.json'), header=f.path('header.json'), proof=f.path('state-proof.json');
  const id='pending-request';
  save(route,{transport:'external',actor:'owner',target:'fixture-human-route',from:'coordinator',sourceRef:'fixture:receipt'});
  const record=(name,kind,requestId)=>{save(header,{protocol:'pace-handoff',v:1,id:name,kind,requestId,from:'coordinator',to:'owner',data:kind==='decision_request'?{interpretation:false}:{}});return f.must(f.pace('team','handoff','record','P001','--file',header,'--body-file','-'));};
  const stat=()=>{let r=f.stats().team.requests; return [r.ownerDelivery,r.failedOnly,r.unconfirmed,r.failedAttemptsObserved];};
  const delivery=(msg,attempt,phase)=>{
    const started=JSON.parse(f.must(f.pace('team','handoff','prepare-external','P001',msg,'--route-file',route,'--attempt-id',attempt)).stdout);
    assert.equal(started.transportInvoked,false);
    save(proof,{phase,reportedBy:'coordinator',sourceRef:'fixture:receipt',...(phase==='sent'?{responseId:'synthetic-receipt',responseHash:hash('fixture:'+attempt)}:{})});
    f.must(f.pace('team','handoff','receipt','P001',attempt,'--file',proof));
  };
  record('progress','status',id); delivery('progress','status-first','failed'); delivery('progress','status-retry','sent');
  record('actual-request','decision_request',id);
  add('status-before-request-does-not-reach',[0,0,1],stat().slice(0,3));
  add('status-failure-does-not-count-as-request-attempt',0,stat()[3]);
  delivery('actual-request','request-first','failed');
  add('request-failure-only-then-status-not-counted',[0,1,0,1],stat());
  delivery('actual-request','request-retry','sent');
  add('request-retry-success-not-double-counted',[1,0,0,1],stat());
  save(f.path('stats-final.json'),f.stats());
}
{
  const f=fixture('orphan-cli'), p=frame(3), ref=p.completionRef, id='orphan-answer';
  f.receipt(ref,p,id); f.input({period:p,request_coverage:cov(ref)});
  const val=()=>{const {requests,snapshot}=f.stats().team;return [requests.reachedTotal,requests.unconfirmed,requests.legacyUnlinkedEvents,snapshot.unknown.request_events];};
  const ans={type:'answer',by:'user',ts:at(p,2),msg:'Synthetic answer',ref};
  f.ledger([{...ans,requestId:id}]); add('linked-orphan-answer',[null,1,0,1],val());
  f.ledger([ans]); add('id-less-orphan-answer-total',null,val()[0]);
  save(f.path('stats-orphan-id-less.json'),f.stats());
}
for(const [name,body,expected] of [
 ['pi-retro','## 회고\n\n<?example\n'+table+'\n?>',1],
 ['valid-closed-atx','## 회고 ###\n\n'+table,0],
 ['html-summary-only','## 회고\n\n'+table.replace('합성 요약','<!-- no visible summary -->'),1],
]) {
  const f=fixture(name), p=frame(5); f.head(f.marker); f.receipt(p.completionRef,p); f.input({period:p}); f.close(body);
  save(f.path('TEAM-RETROSPECTIVE.json'),ret()); add(name,expected,f.finish());
}
{
  const f=fixture('responsibility');
  const p=join(f.root,'.pace','team','builder.md');
  f.must(f.pace('team','new','builder','--role','maker'));
  const modern=readFileSync(p,'utf8'), legacy=modern.replaceAll('사용자 원문','캡틴 원문');
  f.must(f.pace('project','log','P001','--type','question','--to','coordinator','--msg','Synthetic question'));
  for(const [name,body,status] of [['legacy',legacy,0],['modern',modern,0],['weakened',legacy.replace('미확인 해석을 승인된 것으로 바꾸지 않는다.',''),2]]) {
    writeFileSync(p,body);
    add('responsibility-'+name,[status,status===2?1:0], [f.pace('team','list').status,f.pace('project','stats','P001','--json').status]);
  }
}

{
  const f=fixture('r12-id-less-with-ledger'), p=frame(3), ref=p.completionRef;
  f.receipt(ref,p); f.input({period:p,request_coverage:cov(ref)});
  f.ledger([{type:'answer',by:'user',ts:at(p,2),msg:'Synthetic answer',ref}]);
  for (const ledger of [false,true]) {
    if(ledger) writeFileSync(f.path('handoffs.jsonl'),'');
    const {requests,snapshot}=f.stats().team;
    add('id-less-shared-tally-'+ledger,[null,1,1],[requests.reachedTotal,requests.legacyUnlinkedEvents,snapshot.unknown.request_events]);
  }
}
for (const [name,head,expected] of [
  ['inline-comment-marker','- 팀 측정: <!-- explanatory note --> v1',[true,1]],
  ['indented-code-before-marker','    <!--\n\n- 팀 측정: v1\n\n-->',[true,1]],
  ['comment-only-marker','- 팀 측정: <!-- v1 -->',[false,0]],
]) {
  const f=fixture(name); f.head(head); f.close('## 회고\n\n없음');
  add(name,expected,[!!f.stats().team,f.finish()]);
}
for (const [name,body,expected] of [
  ['pipe-setext-equals','## 회고\n\n없음\n\n| 참고 |\n===\n\n'+table,1],
  ['pipe-setext-hyphens','## 회고\n\n없음\n\n| 참고 |\n---\n\n'+table,1],
  ['indented-code-comment-hides-next-heading','## 회고\n\n없음\n\n    <!--\n\n## 참고\n\n-->\n\n'+table,1],
  ['indented-code-with-real-retro-table','## 회고\n\n    <!--\n\n'+table+'\n\n-->',0],
  ['table-thematic-rule-real-retro','## 회고\n\n| 구분 | 항목 | 범위 |\n|---|---|---|\n| 일반 | 합성 | 전체 |\n---\n\n'+table,0],
]) {
  const f=fixture(name), p=frame(5); f.head(f.marker); f.receipt(p.completionRef,p); f.input({period:p}); f.close(body);
  save(f.path('TEAM-RETROSPECTIVE.json'),ret()); add(name,expected,f.finish());
}
{
  const f=fixture('punctuated-review'), p=frame(3), ref=p.completionRef;
  f.receipt(ref,p); f.input({period:p,log_coverage:cov(ref)});
  const msg='reviewer fail blocking 0, should_fix 1.';
  add('punctuated-review-cli',0,f.pace('project','log','P001','--type','review','--msg',msg).status);
  f.ledger([{ts:at(p,2),type:'review',by:'agent',msg,data:{reviewer:1,tester:0,pass:0,fail:1,blocking:0,should_fix:1}}]);
  const q=f.stats().team.quality;
  add('punctuated-review-stats',[0,1],[q.blockingLogged,q.loggedReviewFailures]);
}

console.log(JSON.stringify(results,null,2));
