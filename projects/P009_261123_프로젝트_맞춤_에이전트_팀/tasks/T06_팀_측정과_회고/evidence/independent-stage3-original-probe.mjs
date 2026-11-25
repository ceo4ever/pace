import fs from 'node:fs';
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync, mkdirSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const [workspace, runDir] = process.argv.slice(2);
const digest = (s) => createHash('sha256').update(s).digest('hex');
const save = (p, v) => writeFileSync(p, JSON.stringify(v));
const sh = (cmd, args, cwd, env) => {
  const r = spawnSync(cmd, args, {cwd, env, encoding:'utf8'});
  if (r.error) throw r.error;
  return {status:r.status, stdout:r.stdout, stderr:r.stderr};
};
const checked = (r) => { assert.equal(r.status, 0, JSON.stringify(r)); return r; };
function fixture(name) {
  const root = join(runDir, name), home = join(root, 'pace-home'), repo = join(root, 'repo');
  mkdirSync(home, {recursive:true}); mkdirSync(join(repo, 'docs'), {recursive:true});
  const env = {...process.env, PACE_HOME:home, HOME:home, XDG_CONFIG_HOME:home, GIT_CONFIG_NOSYSTEM:'1'};
  for (const key of Object.keys(env)) if (/^(PACE_PROFILE$|ORCA|CLAUDE|CODEX|GIT_DIR$|GIT_WORK_TREE$)/.test(key)) delete env[key];
  const git = (...args) => checked(sh('git',args,repo,env));
  const cli = (...args) => sh(process.execPath,[join(workspace,'bin/pace.ts'),...args],repo,env);
  git('init','-q','-b','main'); git('config','user.name','Fixture'); git('config','user.email','fixture@example.invalid');
  writeFileSync(join(repo,'docs/README.md'),'# Fixture\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n');
  git('add','-A'); git('commit','-qm','fixture'); checked(cli('project','new','independent synthetic'));
  const dir = join(repo,'projects',readdirSync(join(repo,'projects')).find(x=>x.startsWith('P001_')));
  const path = (p) => join(dir,p), project = path('PROJECT.md'), original = readFileSync(project,'utf8');
  const ledger = (rows) => writeFileSync(path('log.jsonl'),rows.map(row=>JSON.stringify({p:'P001',...row})).join('\n'));
  const stats = () => JSON.parse(checked(cli('project','stats','P001','--json')).stdout);
  const receipt = (p, period, requestId) => {
    const {start,end,unit} = period;
    save(path(p), {version:1, kind:'team-evidence', sourceRef:'fixture:synthetic', hash:digest(JSON.stringify([start,end,unit,requestId])), period:{start,end,unit}, ...(requestId?{requestId}:{})});
  };
  ledger([]);
  return {dir,git,cli,path,project,original,ledger,stats,receipt};
}
const day = (n) => '2026-01-'+String(n).padStart(2,'0')+'T00:00:00.000Z';
const frame = (n,p) => ({start:day(n),end:day(n+1),unit:'representative-task',closed:true,completionRef:p});
const timestamp = (p, bySeconds) => new Date(Date.parse(p.start)+bySeconds*1000).toISOString();
const cov = (ref) => ({status:'complete',reportedBy:'agent:maker',verifiedBy:'coordinator',confirmationRef:ref,refs:[ref]});
const role = {name:'maker',source:'option',definition:'.pace/team/maker.md',hash:digest('synthetic role'),method:'prompt',model:'synthetic',settingsStatus:'planned',toolsPermissionApplied:false,runtimeObserved:false};
const writeInput = (f,input) => save(f.path('TEAM-MEASUREMENT.json'),{version:1,...input});
const results = {};
{
 const f = fixture('samples');
 const compare = (variant) => {
   const groups=[[],[]];
   for (let side=0;side<2;side++) for(let i=0;i<2;i++) {
     const p=frame((variant==='reversed'?1-side:side)*8+i*2+1, 'r'+variant+side+i+'.json');
     const requestId='test-request', ref=p.completionRef;
     f.receipt(ref,p,requestId);
     const rows=[];
     if (variant==='review' && side) rows.push({ts:timestamp(p,2),type:'review',by:'agent',msg:'reviewer fail blocking 2 should_fix 1',data:{reviewer:1,tester:0,pass:1,fail:0,blocking:0,should_fix:0}});
     if (variant==='early-owner' && !side) {
       rows.push({ts:timestamp(p,1),type:'answer',by:'user',requestId,ref,msg:'synthetic earlier owner answer'});
       rows.push({ts:timestamp(p,2),type:'question',by:'agent',to:'owner',requestId,msg:'synthetic later question'});
     }
     f.ledger(rows);
     const counts={owner_file_edits: variant==='early-owner'?0:(side?1:2), owner_command_runs:0, owner_manual_role_corrections:0, coordinator_extra_instructions:0};
     writeInput(f,{period:p,comparison:{study:'team-adoption',conditionCode:side?'team':'no-team',definition:'reach-v1',unit:p.unit,workType:'feature',sizeBand:'small',host:'codex',recordingBoundary:'closed-task',qualitySource:'event-log',qualityScopeHash:digest('scope')},request_coverage:cov(ref),counts,coverage:Object.fromEntries(Object.keys(counts).map(k=>[k,cov(ref)])),quality_audit:{blocking_sum:0,rereviews_after_fail:0,coverage:cov(ref)}});
     const s=f.stats(); groups[side].push(s.team.snapshot); save(f.path('stats-'+variant+'-'+side+'-'+i+'.json'),s);
   }
   const paths=['before','after'].map((k,i)=>{const p=f.path(k+'-'+variant+'.json'); save(p,{version:1,samples:groups[i]}); return p;});
   const out=JSON.parse(checked(f.cli('project','compare-team','--before',paths[0],'--after',paths[1],'--kind','team-adoption','--json')).stdout);
   save(f.path('compare-'+variant+'.json'),out);
   return {conclusion:out.conclusion,reasons:out.reasons,metrics:out.rows.filter(r=>['owner_questions','owner_file_edits','blocking_sum'].includes(r.metric))};
 };
 for (const variant of ['standard','reversed','review','early-owner']) results[variant]=compare(variant);
}
{
 const f=fixture('coordinator');
 const p=frame(9,'frame.json'), id='test-request';
 f.receipt(p.completionRef,p,id);
 const read=(offset)=> {
   f.ledger([{ts:timestamp(p,offset),type:'answer',by:'coordinator',requestId:id,msg:'synthetic answer'},{ts:timestamp(p,2),type:'question',by:'agent',to:'coordinator',requestId:id,msg:'synthetic question'}]);
   writeInput(f,{period:p,request_coverage:cov(p.completionRef),coordinator_answers:[{requestId:id,coverage:cov(p.completionRef)}]});
   const {reachedTotal,comparisonUnconfirmed}=f.stats().team.requests;
   return {reachedTotal,comparisonUnconfirmed};
 };
 results.coordinator=[read(1),read(3)];
}
{
 const f=fixture('markdown');
 const cases={ordinary:'- 팀 측정: v1\n',preExample:'<pre>\n- 팀 측정: v1\n</pre>\n',fencedExample:'```md\n- 팀 측정: v1\n```\n',preRawComment:'<pre data-example="<!--">\nsynthetic HTML\n</pre>\n\n- 팀 측정: v1\n'};
 results.markdown=Object.fromEntries(Object.entries(cases).map(([name,body])=>{writeFileSync(f.project,f.original.replace(/^(# [^\n]+)\n/,'$1\n\n'+body+'\n'));return [name,Object.hasOwn(f.stats(),'team')];}));
}
{
 const setup=(name,variant)=>{
   const f=fixture(name), now=frame(9,'now.json'), old=frame(1,'old.json');
   f.receipt('now.json',now);f.receipt('old.json',old);
   if (variant==='used') {
     checked(f.cli('team','new','maker','--role','maker'));
     f.ledger([{ts:timestamp(now,1),type:'start',by:'cli',role,msg:'synthetic role start'}]);
   }
   if (variant==='old') checked(f.cli('team','new','maker','--role','maker'));
   writeInput(f,{period:now,...(variant==='used'?{role_observations:[{role:'maker',workMs:1000,outputTokens:[{tool:'Codex',output:50}],coverage:{status:'partial',reportedBy:'agent:maker',refs:['now.json']}}]}:{})});
   writeFileSync(f.project,f.original.replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/,'| P-1 | synthetic | test |'));
   writeFileSync(f.path('PROJECT-CLOSE.md'),'# Synthetic\n\n## 기준 대조\n\n| # | 결과 | 증거 |\n|---|---|---|\n| P-1 | 통과 | 합성 시험 |\n\n## 보안\n\ntrue 실행\n\n## 정본 반영\n\n| 정본 | 반영 | 비고 |\n|---|---|---|\n| `docs/README.md` | 해당 없음 | 합성 |\n\n## 회고\n\n| 구분 | 입력 | 요약 |\n|---|---|---|\n| 팀 | [팀 회고](TEAM-RETROSPECTIVE.json) | 합성 |\n\n## 지표\n\n[지표](METRICS.md)\n\n합성 지표 해석 한 줄.\n');
   save(f.path('TEAM-RETROSPECTIVE.json'),{version:1,metricRef:'METRICS.md',unusedRoles:variant==='none'?[]:[{role:'maker',coverage:'observed-none',refs:[variant==='old'?'old.json':'now.json']}],recurringFindings:[],definitionChanges:[],noChangesReasonRef:'now.json'});
   if (variant.startsWith('marker-')) {
     const heading = variant === 'marker-plain' ? '' : '<pre data-example="<!--">\nsynthetic HTML\n</pre>\n\n';
     const project = readFileSync(f.project,'utf8');
     writeFileSync(f.project,project.replace(/^(# [^\n]+)\n/,'$1\n\n'+heading+'- 팀 측정: v1\n\n'));
     const {unlinkSync} = fs;
     unlinkSync(f.path('TEAM-MEASUREMENT.json'));
     unlinkSync(f.path('TEAM-RETROSPECTIVE.json'));
   }
   const s=f.stats(); save(f.path('pre-finish-stats.json'),s);
   f.git('add','-A');f.git('commit','-qm','synthetic finish fixture');
   const r=f.cli('project','finish','P001');save(join(runDir,name,'finish.json'),r);
   return {exit:r.status,hasTeam:!!s.team,candidates:s.team?.unusedRoleCandidates,roles:s.team?.roles,retrospectiveMessage:r.stdout.split('\n').filter(x=>x.includes('회고')||x.includes('범위 근거'))};
 };
 results.retrospective={oldFrame:setup('finish-old','old'),observedRole:setup('finish-used','used'),normal:setup('finish-normal','none'), plainMarker:setup('finish-plain-marker','marker-plain'), markerAfterRawHtml:setup('finish-raw-html-marker','marker-html')};
}
console.log(JSON.stringify(results,null,2));
