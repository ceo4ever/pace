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
{
 const f=fixture('comparison-uncollected');
 const compare=(tag,source,diff)=>{
  const samples=(after,days)=>({version:1,samples:days.map((day,i)=>{
   const p=frame(day,tag+'-'+after+'-'+i+'.json'); f.receipt(p.completionRef,p);
   const q=(b,t)=>({ts:at(p,t),type:'review',by:'agent',msg:'reviewer fail blocking '+b+', should_fix 1.',data:{blocking:b,should_fix:1,reviewer:1,tester:0,pass:0,fail:1}});
   f.ledger(diff==='overflow'&&after ? [q(Number.MAX_SAFE_INTEGER,2),q(1,3)] : [q(diff==='log'&&after?4:1,2)]);
   const counts={owner_file_edits:after?(diff==='increase'?8:1):5,owner_command_runs:0,owner_manual_role_corrections:0,coordinator_extra_instructions:0};
   f.input({period:p,comparison:{study:'team-adoption',conditionCode:after?'team':'no-team',definition:'reach-v1',unit:p.unit,workType:'feature',sizeBand:'small',host:'codex',recordingBoundary:'closed-task',qualitySource:source,qualityScopeHash:hash('same scope')},counts,coverage:Object.fromEntries(Object.keys(counts).map(k=>[k,cov(p.completionRef)])),request_coverage:cov(p.completionRef),log_coverage:diff==='uncollected'&&after?undefined:cov(p.completionRef),quality_audit:{blocking_sum:diff==='audit'&&after?3:1,rereviews_after_fail:0,coverage:cov(p.completionRef)}});
   return f.stats().team.snapshot;
  })});
  const b=samples(false,[1,3]), a=samples(true,[6,8]);
  save(f.path(tag+'-b.json'),b); save(f.path(tag+'-a.json'),a);
  const cli=['project','compare-team','--before',f.path(tag+'-b.json'),'--after',f.path(tag+'-a.json'),'--kind'];
  const r=f.must(f.pace(...cli,'team-adoption','--json')); const out=JSON.parse(r.stdout); save(f.path(tag+'-result.json'),out);
  if(tag==='stable') {
   const md=f.must(f.pace(...cli,'team-adoption')).stdout;
   add('comparison-text',true,md.includes('observed-burden-improvement'));
   add('comparison-studies-separated',2,f.pace(...cli,'definition-change','--json').status);
  }
  return [out.conclusion,out.rows.find(s=>s.metric==='blocking_sum_stats_events').delta,out.rows.find(s=>s.metric==='blocking_sum_audited').delta,out.conclusion==='unknown'?out.reasons.length>0&&out.additionalSamplePlan.length===2:true];
 };
 add('audited-no-log-coverage',['unknown',null,0,true],compare('uncollected','audited-verdicts','uncollected'));
}
{
 const f=fixture('marker-after-nested-heading');
 f.head('- 안내\n  ## 참고\n\n'+f.marker);
 writeFileSync(join(f.root,'input-project.md'),readFileSync(f.path('PROJECT.md')));
 add('nested-heading-does-not-end-project-metadata',true,!!f.stats().team);
 f.close('## 회고\n\n회고 입력을 아직 쓰지 않음');
 add('nested-heading-cannot-disable-retrospective',1,f.finish());
}
console.log(JSON.stringify(results,null,2));
