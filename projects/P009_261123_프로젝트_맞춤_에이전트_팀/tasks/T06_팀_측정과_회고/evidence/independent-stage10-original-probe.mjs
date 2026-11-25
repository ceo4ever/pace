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
for (const [name, body, expected] of [
 ['exact-self-closing-block', '## 회고\n\n<div/>\n## 참고\n\n'+table,0],
 ['malformed-slash-prefix', '## 회고\n\n<div/foo>\n## 참고\n\n'+table,1],
 ['atx-real-space-inline-comment', '## <!--comment-->회고\n\n'+table,0],
 ['atx-fake-end-boundary', '## 회고\n\n##<!--comment-->참고\n\n'+table,0],
 ['atx-real-end-boundary', '## 회고\n\n## <!--comment-->참고\n\n'+table,1],
 ['list-nested-retro-title', '## 참고\n\n- 안내\n  ## 회고\n\n'+table,1],
 ['list-nested-end-title', '## 회고\n\n- 안내\n  ## 참고\n\n'+table,0],
 ['escaped-pipe-invalid-header', '## 회고\n\n'+table.replace('| 구분 | 입력 | 요약 |','| 구분 \\| 입력 | 요약 |'),1],
 ['canonical', '## 회고\n\n'+table, 0],
 ['comment-wrong-section', '## 회고\n\n일반 문장 <!--\n\n## 참고\n\n-->\n\n'+table, 1],
 ['inline-html-wrong-section','## 회고\n\n<span>설명</span>\n## 참고\n\n'+table,1],
 ['inline-html-right-section','## 회고\n\n<span>설명</span>\n\n'+table,0],
 ['standalone-generic-ambiguous','## 회고\n\n안내 문단\n<span>\n## 참고\n</span>\n\n'+table,1],
 ['true-comment-hides-heading','## 회고\n\n<!--\n## 참고\n-->\n\n'+table,0],
 ['bare-rule','## 회고\n\n***\n\n'+table,1],
 ['unsupported-dash','## 회고\n\n-\n\n'+table,1],
 ['outside-rule','## 회고\n\n'+table+'\n\n## 참고\n\n***',0],
 ['no-atx-comment-between-hashes-and-text','## 참고\n\n##<!-- 주석 -->회고\n\n'+table,1],
 ['no-atx-no-space-control','## 참고\n\n##회고\n\n'+table,1],
 ['no-atx-in-seven-hashes-control','## 참고\n\n####### 회고\n\n'+table,1],
 ['legacy-no-marker','## 회고\n\n기존 프로젝트 회고',0],
 ['missing-json','## 회고\n\n'+table,1],
 ['wrong-link','## 회고\n\n'+table.replace('](TEAM-RETROSPECTIVE.json)','](../TEAM-RETROSPECTIVE.json)'),1],
 ['empty-summary','## 회고\n\n'+table.replace('합성 요약',''),1],
]) {
 const f=fixture(name), p=frame(5);
 if(name !== 'legacy-no-marker') { f.head(f.marker); f.receipt(p.completionRef,p); f.input({period:p}); }
 if(!['legacy-no-marker','missing-json'].includes(name)) save(f.path('TEAM-RETROSPECTIVE.json'),ret);
 f.close(body);
 if(name==='canonical') {
   f.ledger([{ts:p.start,type:'start',by:'cli',msg:'start',ok:true,role}]);
   add('canonical-role-stats', 'maker', f.stats().team.roles[0]?.name);
   add('canonical-team-stats-text',true,f.must(f.pace('project','stats','P001')).stdout.includes('팀 측정'));
 }
 add(name,expected,f.finish());
 if (name === 'unsupported-dash') { const said=JSON.parse(readFileSync(join(f.root,'finish-result.json'))); add('dash-message-names-empty-list',true,(said.stdout+said.stderr).includes('빈 목록')); }
 if(name==='canonical') add('canonical-metrics',true,readFileSync(f.path('METRICS.md'),'utf8').includes('## 팀'));
}
{
 const f=fixture('native-order'); f.head(f.marker);
 const success=(type,ts)=>({type,ts,by:'cli',ok:true,msg:type});
 for(const [name,events,expected] of [
  ['native-forward',[success('start',day(2)),success('merge',day(3))],[0,true]],
  ['native-inverted',[success('start',day(3)),success('merge',day(2))],[2,'팀 성공 종료 사건이 시작보다 앞선다']],
  ['native-failed',[success('start',day(2)),{...success('merge',day(3)),ok:false}],[0,false]],
  ['native-other-actor',[success('start',day(2)),{...success('merge',day(3)),by:'agent'}],[0,false]],
 ]) {
  f.ledger(events);
  const r=f.pace('project','stats','P001','--json'); save(f.path(name+'.json'),r);
  add(name,expected,[r.status,r.status===0?JSON.parse(r.stdout).team.period.closed:r.stderr.trim().replace(/^pace: /,'')]);
 }
}
{
 const f=fixture('comparison');
 const compare=(tag,source,diff)=>{
  const samples=(after,days)=>({version:1,samples:days.map((day,i)=>{
   const p=frame(day,tag+'-'+after+'-'+i+'.json'); f.receipt(p.completionRef,p);
   const q=(b,t)=>({ts:at(p,t),type:'review',by:'agent',msg:'reviewer fail blocking '+b+', should_fix 1.',data:{blocking:b,should_fix:1,reviewer:1,tester:0,pass:0,fail:1}});
   f.ledger(diff==='overflow'&&after ? [q(Number.MAX_SAFE_INTEGER,2),q(1,3)] : [q(diff==='log'&&after?4:1,2)]);
   const counts={owner_file_edits:after?(diff==='increase'?8:1):5,owner_command_runs:0,owner_manual_role_corrections:0,coordinator_extra_instructions:0};
   f.input({period:p,comparison:{study:'team-adoption',conditionCode:after?'team':'no-team',definition:'reach-v1',unit:p.unit,workType:'feature',sizeBand:'small',host:'codex',recordingBoundary:'closed-task',qualitySource:source,qualityScopeHash:hash('same scope')},counts,coverage:Object.fromEntries(Object.keys(counts).map(k=>[k,cov(p.completionRef)])),request_coverage:cov(p.completionRef),log_coverage:cov(p.completionRef),quality_audit:{blocking_sum:diff==='audit'&&after?3:1,rereviews_after_fail:0,coverage:cov(p.completionRef)}});
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
 add('audited-stable',['observed-burden-improvement',0,0,true],compare('stable','audited-verdicts','none'));
 add('stable-worsening',['observed-burden-worsening',0,0,true],compare('worse','audited-verdicts','increase'));
 add('audited-log-changed',['unknown',6,0,true],compare('log','audited-verdicts','log'));
 add('audited-log-missing-on-one-side',['unknown',null,0,true],compare('overflow','audited-verdicts','overflow'));
 add('logged-audit-changed',['unknown',0,4,true],compare('audit','event-log','audit'));
}
{
 const f=fixture('owner-log'), p=frame(10);
 f.head(f.marker); f.receipt(p.completionRef,p);
 f.receipt('reply.json',p,'req-reply');
 f.input({period:p});
 f.ledger([
  {ts:p.start,type:'start',by:'cli',msg:'start',ok:true,role},
  {ts:at(p,2),type:'question',by:'agent',to:'owner',msg:'synthetic intended only',requestId:'req-intent'},
  {ts:at(p,3),type:'question',by:'agent',to:'coordinator',msg:'synthetic answer route',requestId:'req-reply'},
  {ts:at(p,4),type:'escalation',by:'coordinator',to:'owner',msg:'synthetic relay',requestId:'req-reply'},
  {ts:at(p,5),type:'answer',by:'user',msg:'synthetic confirmed',requestId:'req-reply',ref:'reply.json'},
  {ts:at(p,6),type:'question',by:'agent',msg:'synthetic legacy'}
 ]);
 const s=f.stats().team; save(f.path('observed.json'),s);
 const {requests:r}=s;
 add('owner-and-user-role-stats',[2,1,1,1,1,1,null,'maker',null],[r.linked,r.reached,r.ownerReply,r.unconfirmed,r.legacyUnlinkedEvents,r.recipientUnknownEvents,s.manual.fileEdits.total,s.roles[0]?.name,s.roles[0]?.workMs]);
 add('old-captain-id-rejected',1,f.pace('project','log','P001','--type','question','--msg','synthetic','--to','captain').status);
 add('new-owner-id-accepted',0,f.pace('project','log','P001','--type','question','--msg','synthetic','--to','owner').status);
}
{
 const f=fixture('marker-synthetic-heading');
 f.head('##<!-- 주석 -->안내\n\n'+f.marker);
 const s=f.stats(); add('surface-non-heading-does-not-hide-marker',true,!!s.team);
 f.close('## 회고\n\n회고 입력을 아직 쓰지 않음');
 add('marker-manufactured-boundary-cannot-skip-retrospective',1,f.finish());
 const yes=fixture('marker-real-heading'); yes.head('## <!--comment-->안내\n\n'+yes.marker);
 add('actual-heading-ends-metadata',false,!!yes.stats().team);
}
{
 const f=fixture('legacy-baselines');
 const root=join(workspace,'projects');
 const project=readdirSync(root).find(x=>x.startsWith('P009_'));
 const tdir=join(root,project,'tasks');
 const task=readdirSync(tdir).find(x=>x.startsWith('T01_'));
 for(const [file,kind,expected] of [
  ['baseline-roblox.json','role-automation',['unknown',null,31,48]],
  ['baseline-ai-sql-client.json','team-adoption',['unknown',null,null,0]],
 ]) {
  const src=join(tdir,task,'evidence',file), before=readFileSync(src), copy=f.path(file);
  writeFileSync(copy,before);
  const r=f.must(f.pace('project','compare-team','--before',copy,'--after',copy,'--kind',kind,'--json'));
  const out=JSON.parse(r.stdout); save(f.path(file+'.result.json'),out);
  const b=out.sources.before;
  add(file,expected,[out.conclusion,b.counts.owner_questions,file.includes('roblox')?b.counts.blocking_sum_stats_events:b.counts.owner_file_edits??null,file.includes('roblox')?b.counts.blocking_sum_audited:b.observed.owner_file_edits]);
  assert.deepEqual(readFileSync(src),before);
 }
}
console.log(JSON.stringify(results,null,2));
