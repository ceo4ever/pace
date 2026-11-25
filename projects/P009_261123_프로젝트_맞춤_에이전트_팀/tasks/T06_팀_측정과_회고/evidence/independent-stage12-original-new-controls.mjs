import {appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
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
    appendFileSync(run+'-commands.jsonl', JSON.stringify({exe,args,cwd:root,status,stdout,stderr})+'\n');
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
  const finish = () => { writeFileSync(join(root,'input-close.md'),readFileSync(path('PROJECT-CLOSE.md'))); git('add','-A'); git('commit','-qm','fixture files'); const r=pace('project','finish','P001'); save(join(root,'finish-result.json'),r); return r.status; };
  ledger([]);
  return {root,git,pace,must,path,head,close,finish,ledger,stats,receipt,input,marker};
}
const day = n => '2026-02-'+String(n).padStart(2,'0')+'T00:00:00Z';
const frame = (n,completionRef='proof.json')=>({start:day(n),end:day(n+1),unit:'representative-task',closed:true,completionRef});
const at = (p,n)=>new Date(Date.parse(p.start)+1000*n).toISOString();
const cov = ref=>({status:'complete',reportedBy:'agent:maker',verifiedBy:'coordinator',confirmationRef:ref,refs:[ref]});
const role = {name:'maker',source:'option',definition:'.pace/team/maker.md',hash:hash('synthetic'),method:'prompt',model:'synthetic',settingsStatus:'planned',toolsPermissionApplied:false,runtimeObserved:false};
const table = '| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [회고](TEAM-RETROSPECTIVE.json) | 합성 요약 |';
const ret = {version:1,metricRef:'METRICS.md',unusedRoles:[],recurringFindings:[],definitionChanges:[],noChangesReasonRef:'proof.json'};
const out=(f,name,value)=>save(f.path(name+'.json'),value);
for (const [name,summary,want] of [
 ['plain-summary','합성 요약',0],
 ['labeled-markdown-link','[합성 요약](details.md)',0],
 ['comment-summary','<!-- note -->',1],
 ['hidden-html-summary','<span hidden>note</span>',1],
 ['entity-summary','&#x200B;',1],
 ['empty-link-summary','[](details.md)',1],
 ['whitespace-link-summary','[ ](details.md)',1],
 ['zero-width-summary','\u200B',1],
 ['empty-link-plus-text','[](details.md) 합성 요약',0],
 ['comment-in-header',null,1],
 ['comment-in-link-label',null,1],
 ['wide-unprefixed-short-separator',null,1],
 ['wide-mixed-prefix',null,1],
 ['wide-separated-after-unprefixed',null,0],
]) {
  const f=fixture(name); f.head(f.marker); f.receipt('proof.json'); save(f.path('TEAM-RETROSPECTIVE.json'),ret);
  const body = summary!==null?table.replace('합성 요약',summary):({
    'comment-in-header': table.replace('구분','구분 <!-- note -->'),
    'comment-in-link-label': table.replace('[회고]','[<!-- note -->]'),
    'wide-unprefixed-short-separator': 'A | B | C | D\n- | - | - | -\n'+table,
    'wide-mixed-prefix': '| A | B | C | D\n---|---|---|---\n'+table,
    'wide-separated-after-unprefixed': 'A | B | C | D\n---|---|---|---\n\n'+table
  })[name];
  f.close('## 회고\n\n'+body); add(name,want,f.finish());
}
{
 const f=fixture('failed-attempt-and-answers'); f.head(f.marker);
 const cli=(...args)=>f.must(f.pace(...args));
 const h=(...args)=>cli('team','handoff',...args);
 const event=(type,...args)=>cli('project','log','P001','--type',type,'--msg','Independent synthetic event',...args);
 const requestId='attempt-check';
 const route={transport:'external',actor:'owner',target:'synthetic-human',from:'coordinator',sourceRef:'fixture:route'};
 out(f,'route',route);
 event('question','--to','owner','--request-id',requestId);
 out(f,'header',{protocol:'pace-handoff',v:1,id:'request-header',kind:'decision_request',from:'coordinator',to:'owner',requestId,data:{interpretation:false}});
 h('record','P001','--file',f.path('header.json'),'--body-file','-');
 h('prepare-external','P001','request-header','--route-file',f.path('route.json'),'--attempt-id','attempt-failed');
 out(f,'failed-receipt',{phase:'failed',reportedBy:'coordinator',sourceRef:route.sourceRef});
 h('receipt','P001','attempt-failed','--file',f.path('failed-receipt.json'));
 const observe=(tag,want)=>{
   const p={start:new Date(Date.now()-60000).toISOString(),end:new Date().toISOString(),unit:'representative-task',closed:true,completionRef:'complete.json'};
   f.receipt('complete.json',p); f.input({period:p,request_coverage:cov('complete.json')});
   out(f,tag+'-input',{period:p,log:readFileSync(f.path('log.jsonl'),'utf8')});
   const s=f.stats(), r=s.team.requests; out(f,tag+'-stats',s);
   add(tag,want,[r.reached,r.failedOnly,r.unconfirmed,r.failedAttemptsObserved,r.reachedTotal,s.team.snapshot.counts.owner_questions,s.handoffs.requests.items[0]?.reach]);
 };
 observe('failure-only',[0,1,0,1,0,0,'failed_only']);
 event('answer','--by','user','--request-id',requestId);
 observe('failure-and-unproven',[0,0,1,1,null,null,'failed_only']);
 f.receipt('wrong-answer.json',undefined,'other-request');
 event('answer','--by','user','--request-id',requestId,'--ref','wrong-answer.json');
 observe('failure-and-wrong-request-ref',[0,0,1,1,null,null,'owner_reply']);
 f.receipt('typed-answer.json',undefined,requestId);
 event('answer','--by','user','--request-id',requestId,'--ref','typed-answer.json');
 observe('failure-and-proven',[1,0,0,1,1,1,'owner_reply']);
}
{
 const f=fixture('grade-punctuation');
 const variants=[
   ['adjacent-comma','blocking 0,should_fix 0',0],
   ['adjacent-fullwidth','blocking 0，should_fix 0',0],
   ['adjacent-semicolon','blocking 2;should_fix 3',0],
   ['adjacent-period','blocking 0.should_fix 0',0],
   ['decimal','blocking 0.5,should_fix 0',1],
   ['decimal-comma','blocking 0,5 should_fix 0',1],
   ['positive-exponent','blocking 0e+5,should_fix 0',1],
   ['should-fix-exponent','blocking 0,should_fix 0e-5',1],
   ['duplicate-blocking','blocking 0,blocking 0,should_fix 0',1],
   ['duplicate-should-fix','blocking 0,should_fix 0,should_fix 0',1],
 ];
 for(const [tag,s,want] of variants) {
   const r=f.pace('project','log','P001','--type','review','--msg','reviewer pass '+s);
   add(tag,want,r.status); out(f,tag,r);
 }
 const s=f.stats(); out(f,'legacy-stats',s);
 add('legacy-stats-stays-non-team',false,!!s.team);
 const events=readFileSync(f.path('log.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 add('grades-stored-exactly',[[0,0],[0,0],[2,3],[0,0]],events.map(e=>[e.data.blocking,e.data.should_fix]));
}
{
 const f=fixture('quality-and-origin'); f.head(f.marker);
 const sample=(n,after,blocking,burden)=>{
   const p=frame(n,'end-'+n+'.json'); f.receipt(p.completionRef,p);
   const counts={owner_file_edits:burden,owner_command_runs:0,owner_manual_role_corrections:0,coordinator_extra_instructions:0};
   const review={ts:at(p,1),type:'review',by:'agent',msg:'reviewer fail blocking '+blocking+',should_fix 1',data:{blocking,should_fix:1,reviewer:1,tester:0,pass:0,fail:1}};
   f.ledger([review]); f.input({period:p, comparison:{study:'team-adoption',conditionCode:after?'team':'no-team',definition:'reach-v1',unit:p.unit,workType:'feature',sizeBand:'small',host:'codex',recordingBoundary:'closed-task',qualitySource:'event-log',qualityScopeHash:hash('independent scope')},counts,coverage:Object.fromEntries(Object.keys(counts).map(k=>[k,cov(p.completionRef)])),request_coverage:cov(p.completionRef),log_coverage:cov(p.completionRef),quality_audit:{blocking_sum:1,rereviews_after_fail:0,coverage:cov(p.completionRef)}});
   const full=f.stats(); out(f,'source-'+n+'-'+blocking+'-'+burden,full); return full.team.snapshot;
 };
 const b=[sample(1,false,1,5),sample(4,false,1,5)];
 const stable=[sample(8,true,1,2),sample(11,true,1,2)];
 const high=[sample(8,true,1,8),sample(11,true,1,8)];
 const variable=[sample(8,true,0,2),sample(11,true,2,2)];
 const priorVariable=[sample(1,false,0,5),sample(4,false,2,5)];
 const independent=xs=>xs.map(({measurementKind,...s})=>s);
 const cases=[
 ['uniform-stats-improves',b,stable,'observed-burden-improvement',false,false],
 ['uniform-stats-worsens',b,high,'observed-burden-worsening',false,false],
 ['equal-sum-quality-varies',b,variable,'unknown',true,false],
 ['identical-variable-distribution',priorVariable,variable,'unknown',true,false],
 ['different-origin',b,independent(stable),'unknown',false,true],
 ['mixed-origin',[b[0],independent(b)[1]],stable,'unknown',false,true],
 ['both-mixed-origin',[b[0],independent(b)[1]],[stable[0],independent(stable)[1]],'unknown',false,true],
 ['uniform-independent-improves',independent(b),independent(stable),'observed-burden-improvement',false,false],
 ];
 for(const [tag,bx,ax,want,q,o] of cases) {
   out(f,tag+'-before',{version:1,samples:bx}); out(f,tag+'-after',{version:1,samples:ax});
   const args=['project','compare-team','--kind','team-adoption','--before',f.path(tag+'-before.json'),'--after',f.path(tag+'-after.json')];
   const cli=f.must(f.pace(...args,'--json')), r=JSON.parse(cli.stdout);
   out(f,tag+'-result',r);
   const bs=bx.map(s=>s.counts.blocking_sum_stats_events), as=ax.map(s=>s.counts.blocking_sum_stats_events);
   add(tag,[want,bs,as,q,o,q,o],[r.conclusion,r.sources.before.qualitySamples.map(s=>s.blocking_sum_stats_events),r.sources.after.qualitySamples.map(s=>s.blocking_sum_stats_events),r.reasons.some(s=>s.includes('표본별 품질')),r.reasons.some(s=>s.includes('수집 출처')),r.additionalSamplePlan.some(s=>s.includes('표본별 품질')),r.additionalSamplePlan.some(s=>s.includes('수집 경로'))]);
   if(q || o) {
     const t=f.must(f.pace(...args)); writeFileSync(f.path(tag+'.md'),t.stdout);
     add(tag+'-rendered-reasons',true,t.stdout.includes('판정: unknown')&&(!q||t.stdout.includes('표본별 품질'))&&(!o||t.stdout.includes('수집 출처')));
   }
 }
}
console.log(JSON.stringify(results,null,2));
