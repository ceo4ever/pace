import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [workspace, out] = process.argv.slice(2);
const hash = v => createHash('sha256').update(v).digest('hex');
const save = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const read = p => fs.readFileSync(p, 'utf8');
const results = [];
function check(name, expected, observed) {
  let matched = true;
  try { assert.deepStrictEqual(observed, expected); } catch { matched = false; }
  results.push({ name, matched, expected, observed });
  save(path.join(out, 'results.json'), results);
}
function fixture(name, role = false) {
  const base = path.join(out, name), main = path.join(base, 'repo'), home = path.join(base, 'pace-home');
  for (const dir of [path.join(main, 'docs'), home]) fs.mkdirSync(dir, { recursive: true });
  const env = {PATH: process.env.PATH, HOME: home, USERPROFILE: home, PACE_HOME: home, TMPDIR: out, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0'};
  let cwd = main;
  const run = (exe, ...args) => {
    const {status, stdout, stderr, error, signal} = spawnSync(exe, args, {cwd, env, encoding:'utf8'});
    fs.appendFileSync(path.join(out, 'commands.jsonl'), JSON.stringify({name, cwd, exe, args, status, stdout, stderr, signal, error: error?.message}) + '\n');
    if (error) throw error;
    return {status, stdout, stderr};
  };
  const ok = (r) => { assert.equal(r.status, 0, JSON.stringify(r)); return r; };
  const git = (...args) => ok(run('git', '-c', 'core.hooksPath=/dev/null', ...args));
  const pace = (...args) => run(process.execPath, path.join(workspace, 'bin/pace.ts'), ...args);
  const commit = msg => { git('add','-A'); git('commit','--allow-empty','-qm',msg); };
  git('init','-q','-b','main');
  git('config','core.hooksPath','/dev/null');
  git('config','user.name','Synthetic T06');
  git('config','user.email','fixture@example.invalid');
  fs.writeFileSync(path.join(main,'docs/README.md'), '# Synthetic\n\n## 환경\n\n- 검사: `true`\n- 보안 검사: `true`\n');
  commit('synthetic baseline');
  ok(pace('project','new','R21 independent fixture'));
  const project = fs.readdirSync(path.join(main,'projects')).find(s => s.startsWith('P001_'));
  if (role) {
    ok(pace('team','new','maker','--role','maker'));
    commit('synthetic role definition');
    ok(pace('project','start','P001','--role','maker','--agent','codex','--no-launch'));
    cwd = main + '.wt/P001';
  }
  const p = file => path.join(cwd, 'projects', project, file);
  const json = (file,v) => save(p(file),v);
  const log = rows => fs.writeFileSync(p('log.jsonl'), rows.map(row=>JSON.stringify({p:'P001',...row})+'\n').join(''));
  if (!role) log([]);
  const projectText = read(p('PROJECT.md')).replace(/\| P-1 \| <!--.*?--> \| <!--.*?--> \|/, '| P-1 | Synthetic criteria | Synthetic evidence |');
  fs.writeFileSync(p('PROJECT.md'), projectText.includes('- 팀 측정: v1') ? projectText : projectText.replace(/\n/, '\n\n- 팀 측정: v1\n'));
  const receipt = (name, period, requestId) => json(name,{version:1,kind:'team-evidence',sourceRef:'fixture:independent-r21',hash:hash(name),...(period && {period:{start:period.start,end:period.end,unit:period.unit}}),...(requestId && {requestId})});
  const stats = label => {
    const r = ok(pace('project','stats','P001','--json'));
    fs.writeFileSync(path.join(base,label+'.json'),r.stdout);
    return JSON.parse(r.stdout);
  };
  const finish = (label, block, retro = {}, eol = '\n') => {
    const close = ['# Synthetic close','','## 기준 대조','','| # | 결과 | 증거 |','|---|---|---|','| P-1 | 통과 | synthetic |','','## 보안','','합성 검사 실행','','## 정본 반영','','| 정본 | 반영 | 비고 |','|---|---|---|','| `docs/README.md` | 해당 없음 | synthetic |','',block,'','## 지표','','[지표](METRICS.md)','','합성 지표 해석.',''].join('\n').replaceAll('\n',eol);
    fs.writeFileSync(p('PROJECT-CLOSE.md'),close);
    fs.writeFileSync(path.join(base,label+'.md'),close);
    receipt('proof.json');
    json('TEAM-RETROSPECTIVE.json',{version:1,metricRef:'METRICS.md',unusedRoles:[],recurringFindings:[],definitionChanges:[],noChangesReasonRef:'proof.json',...retro});
    commit('synthetic close '+label);
    const r = pace('project','finish','P001');
    save(path.join(base,label+'.finish.json'),r);
    return r;
  };
  return {base,p,json,log,receipt,stats,finish,pace,ok,git};
}
const periods = day => ({start:new Date(Date.UTC(2025,8,day,7)).toISOString(),end:new Date(Date.UTC(2025,8,day,8)).toISOString(),closed:true,unit:'representative-task',completionRef:'window-'+day+'.json'});
const at = (period, seconds) => new Date(Date.parse(period.start)+seconds*1000).toISOString();
const coverage = name => ({status:'complete',reportedBy:'agent:maker',verifiedBy:'coordinator',confirmationRef:name,refs:[name]});
const manual = ['owner_manual_role_corrections','owner_file_edits','owner_command_runs','coordinator_extra_instructions'];
function measurement(f, period, conditionCode, extra = {}) {
  const c = coverage(period.completionRef);
  f.receipt(period.completionRef,period);
  f.json('TEAM-MEASUREMENT.json',{version:1,period,request_coverage:c,log_coverage:c,counts:Object.fromEntries(manual.map(key=>[key,0])),coverage:Object.fromEntries(manual.map(key=>[key,c])),
    quality_audit:{blocking_sum:0,rereviews_after_fail:0,coverage:c},
    comparison:{study:'team-adoption',conditionCode,definition:'r21-independent',unit:period.unit,workType:'feature',sizeBand:'small',host:'codex',sampleCount:1,recordingBoundary:'closed-task',qualitySource:'event-log',qualityScopeHash:hash('equal-scope')},...extra});
}
const q = (p,t,id,to='owner',type='question') => ({ts:at(p,t),type,by:'agent',to,requestId:id,msg:'synthetic request'});
const a = (p,t,id,by='user') => ({ts:at(p,t),type:'answer',by,requestId:id,...(by==='user' && {ref:id+'.proof.json'}),msg:'synthetic answer'});
function ownerProof(f,p,id) { f.receipt(id+'.proof.json',p,id); }
const view = s => {
  const t=s.team,r=t.requests;
  return [t.period.closed,r.linked,r.crossBoundaryObserved,r.ownerReply,r.ownerDelivery,r.reached,r.reachedTotal,r.failedOnly,r.unconfirmed,r.comparisonUnconfirmed,t.snapshot.unknown.request_events,t.snapshot.counts.owner_questions,t.snapshot.observed_counts.owner_questions];
};
const expected = (linked,cross,reached,total,unconfirmed,cUnknown) => [true,linked,cross,reached,0,reached,total,0,unconfirmed,cUnknown,cUnknown,total,reached];
const f = fixture('requests');
const before=[], boundary=[], clean=[];
for (const [day, mode] of [[2,'before'],[4,'before'],[7,'boundary'],[9,'boundary']]) {
  const p = periods(day), id='task-'+day;
  ownerProof(f,p,id);
  measurement(f,p,mode==='before'?'no-team':'team');
  if (mode==='before') {
    const second = id+'-second'; ownerProof(f,p,second);
    f.log([q(p,0,id),a(p,30,id),q(p,60,second),a(p,3600,second)]);
    const s=f.stats(id+'-before');
    check(id+'-closed-edge-positive',expected(2,0,2,2,0,0),view(s));
    before.push(s.team.snapshot);
  } else {
    f.log([q(p,-1,id),a(p,0,id),q(p,3,id,'owner','escalation'),a(p,4,id)]);
    const s=f.stats(id+'-boundary');
    check(id+'-old-root-typed-answer-dedup',expected(1,1,0,null,1,1),view(s));
    check(id+'-legacy-global', {total:1,owner_reply:1,owner_delivery:0,failed_only:0,unconfirmed:0,unlinkedLogEvents:0,items:[{requestId:id,reach:'owner_reply'}]},s.handoffs.requests);
    check(id+'-legacy-shape',[false,false],[Object.hasOwn(s.handoffs,'crossBoundaryRequests'),Object.hasOwn(s.handoffs,'failedRequestAttempts')]);
    boundary.push(s.team.snapshot);
    f.log([q(p,0,id),a(p,3600,id),a(p,3601,id)]);
    const valid=f.stats(id+'-clean');
    check(id+'-same-period-dedup-ignores-later-answer',expected(1,0,1,1,0,0),view(valid));
    clean.push(valid.team.snapshot);
  }
}
const p=periods(13);
measurement(f,p,'team');
ownerProof(f,p,'later-answer');
f.log([q(p,3600,'later-answer'),a(p,3601,'later-answer')]);
check('answer-after-end-stays-unconfirmed',expected(1,0,0,null,1,1),view(f.stats('answer-after')));
ownerProof(f,p,'future-root');
f.log([a(p,3540,'future-root'),q(p,3601,'future-root')]);
check('root-after-end-with-in-period-typed-answer',expected(1,1,0,null,1,1),view(f.stats('future-root')));
ownerProof(f,p,'old-replied');
f.log([q(p,-60,'old-replied'),a(p,-30,'old-replied')]);
check('wholly-outside-request-does-not-taint-period',expected(0,0,0,0,0,0),view(f.stats('wholly-outside')));
for (const id of ['old-coordinator','inside-coordinator','inside-user']) ownerProof(f,p,id);
const own = ['inside-coordinator','old-coordinator'].map(requestId=>({requestId,coverage:coverage(requestId+'.proof.json')}));
measurement(f,p,'team',{coordinator_answers:own});
const insideOnly=[q(p,3,'inside-coordinator','coordinator'),a(p,4,'inside-coordinator','coordinator'),q(p,5,'inside-user'),a(p,6,'inside-user')];
f.log(insideOnly);
const absorbed=f.stats('same-period-coordinator');
check('same-period-coordinator-confirmed-absorption',expected(2,0,1,1,1,0),view(absorbed));
check('same-period-coordinator-count',1,absorbed.team.requests.coordinatorOwnAnswerObserved);
f.log([q(p,-2,'old-coordinator','coordinator'),...insideOnly,a(p,7,'old-coordinator','coordinator'),a(p,8,'old-coordinator','coordinator')]);
const mixed=f.stats('older-coordinator-plus-in-period');
check('adjacent-confirmed-absorption-cannot-zero-boundary',expected(3,1,1,null,2,1),view(mixed));
check('outside-root-coordinator-answer-not-absorbed',1,mixed.team.requests.coordinatorOwnAnswerObserved);
for (const [name, samples] of [['before',before],['boundary',boundary],['clean',clean]]) f.json(name+'.json',{version:1,samples});
function compare(after, wanted) {
  const r=JSON.parse(f.ok(f.pace('project','compare-team','--before',f.p('before.json'),'--after',f.p(after+'.json'),'--kind','team-adoption','--json')).stdout);
  save(path.join(f.base,'compare-'+after+'.json'),r);
  const reach=r.rows.find(row=>row.metric==='owner_questions');
  check('compare-'+after,wanted,[r.conclusion,r.sources.before.sampleCountActual,r.sources.after.sampleCountActual,r.sources.before.unknownRequests,r.sources.after.unknownRequests,reach.before,reach.after,reach.delta,r.reasons.some(s=>s.includes('요청 도달 누락')),r.additionalSamplePlan.length>0]);
}
compare('boundary',['unknown',2,2,0,2,4,null,null,true,true]);
compare('clean',['observed-burden-improvement',2,2,0,0,4,2,-2,false,true]);
const role = fixture('role-flow',true);
const start=read(role.p('log.jsonl')).trim().split('\n').map(JSON.parse).find(v=>v.type==='start');
save(path.join(role.base,'role-start.json'),start);
check('no-launch-observation',['maker',1,false],[start.role.name,start.data.teamMetricsVersion,start.role.runtimeObserved]);
const rs=role.stats('role-stats');
check('no-launch-role-work-unmeasured',null,rs.team.roles.find(r=>r.name==='maker').workMs);
const table = '| 항목 | 근거 | 요약 |\n|---|---|---|\n| 팀 | [회고 근거](TEAM-RETROSPECTIVE.json) | 한글 요약 |';
const section = (t=table) => '## 회고\n\n'+t;
check('role-stats-write',0,role.pace('project','stats','P001','--write').status);
check('role-metrics-section',true,read(role.p('METRICS.md')).includes('## 팀 측정'));
check('role-finish',0,role.finish('role-finish',section()).status);

const ledger = fixture('ledger');
ledger.ok(ledger.pace('team','new','maker','--role','maker'));
const ledgerPeriod=periods(15), oldID='outside-ledger-root';
measurement(ledger,ledgerPeriod,'team');
const bodyPath=path.join(ledger.base,'synthetic-body.md');
fs.writeFileSync(bodyPath,'Synthetic metadata exercise only.\n');
function handoff(id,kind,from,to,requestId,data) {
  const header=path.join(ledger.base,id+'.header.json');
  save(header,{protocol:'pace-handoff',v:1,id,kind,from,to,requestId,data});
  ledger.ok(ledger.pace('team','handoff','record','P001','--file',header,'--body-file',bodyPath));
}
handoff('past-request','decision_request','coordinator','owner',oldID,{interpretation:false});
const route=path.join(ledger.base,'route.json'), failed=path.join(ledger.base,'failed.json');
save(route,{transport:'external',actor:'owner',target:'test-metadata-only',from:'coordinator',sourceRef:'fixture:r21-test-route'});
save(failed,{phase:'failed',reportedBy:'coordinator',sourceRef:'fixture:r21-test-route'});
for(const id of ['attempt-one','attempt-two']) {
  ledger.ok(ledger.pace('team','handoff','prepare-external','P001','past-request','--route-file',route,'--attempt-id',id));
  ledger.ok(ledger.pace('team','handoff','receipt','P001',id,'--file',failed));
}
handoff('active-status','status','agent:maker','coordinator',oldID,{});
const actualRows=read(ledger.p('handoffs.jsonl')).trim().split('\n').map(JSON.parse);
assert.equal(actualRows.length,6);
function setTimeline(times) {
  fs.writeFileSync(ledger.p('handoffs.jsonl'),actualRows.map((row,i)=>JSON.stringify({...row,at:at(ledgerPeriod,times[i])})+'\n').join(''));
}
setTimeline([-90,-60,-30,-15,-10,-5]);
const absent=ledger.stats('all-ledger-rows-outside');
check('ledger-wholly-before-period',[0,0,0,true],[absent.team.requests.crossBoundaryObserved,absent.team.requests.failedAttemptsObserved,absent.team.handoffs.kinds.status ?? 0,absent.team.unusedRoleCandidates.some(x=>x.role==='maker')]);
setTimeline([-90,-1,0,1,2,3]);
const active=ledger.stats('ledger-continued-in-period');
check('ledger-cross-boundary-only',[1,1,0,0,null,1,1],[active.team.requests.crossBoundaryObserved,active.team.requests.linked,active.team.requests.reached,active.team.requests.failedOnly,active.team.requests.reachedTotal,active.team.requests.unconfirmed,active.team.snapshot.unknown.request_events]);
check('ledger-attempts-and-agent-activity',[2,3,1,1,false],[active.team.requests.failedAttemptsObserved,active.team.handoffs.kinds.delivery,active.team.handoffs.kinds.status,active.team.handoffs.agents['agent:maker'].status,active.team.unusedRoleCandidates.some(x=>x.role==='maker')]);
check('ledger-legacy-unwindowed-preserved',[1,1,0,4,1,false],[active.handoffs.requests.total,active.handoffs.requests.failed_only,active.handoffs.requests.unconfirmed,active.handoffs.kinds.delivery,active.handoffs.kinds.status,Object.hasOwn(active.handoffs,'crossBoundaryRequests')]);
const roleHeld=ledger.finish('observed-none-held',section(),{unusedRoles:[{role:'maker',coverage:'observed-none',refs:[ledgerPeriod.completionRef]}]});
check('finish-holds-observed-none-for-cross-boundary-maker',[1,true],[roleHeld.status,/관측\/참여 역할/.test(roleHeld.stdout+roleHeld.stderr)]);
check('finish-passes-accurate-role-retrospective',0,ledger.finish('observations-accepted',section()).status);

const markdownCases=[];
for (const [tag,cp,eol] of [['ls','\u2028','\n'],['ps','\u2029','\r\n']]) {
  markdownCases.push(
    [tag+'-embedded-false-open','## 실례\n\n문장 '+cp+'## 회고\n\n'+table,1,eol],
    [tag+'-heading-full-text','## 회고'+cp+'다른 제목\n\n'+table,1,eol],
    [tag+'-heading-trailing-separator','## 회고'+cp+'\n\n'+table,1,eol],
    [tag+'-embedded-false-close','## 회고\n\n같은 문장 '+cp+'## 다른 제목\n\n'+table,0,eol],
    [tag+'-real-close-after-embedded','## 회고\n\n같은 문장 '+cp+'## 표지 아님\n\n## 실제 다음 절\n\n'+table,1,eol],
    [tag+'-visible-link-and-comparison',section(table.replace('한글 요약','한글 A<B 및 [업무 범위](<https://example.invalid/docs>)')),0,eol]
  );
}
for (const [tag, ink] of [['hangul-u3164','\u3164'],['hangul-u115f','\u115f'],['braille-u2800','\u2800'],['mixed-filler','\u1160\uFFA0 \u2800']]) {
  markdownCases.push(
    [tag+'-header',section(table.replace('항목',ink)),1,'\n'],
    [tag+'-evidence-label',section(table.replace('[회고 근거]','['+ink+']')),1,'\r\n'],
    [tag+'-summary',section(table.replace('한글 요약',ink)),1,'\n']
  );
}
markdownCases.push(
  ['visible-hangul-filler-neighbor',section(table.replace('한글 요약','한\u3164글')),0,'\r\n'],
  ['filler-only-summary-link',section(table.replace('한글 요약','[\u3164](details.md)')),1,'\n'],
  ['filler-only-header-link',section(table.replace('항목','[\u2800](details.md)')),1,'\r\n'],
  ['visible-labeled-summary-link',section(table.replace('한글 요약','[한글](details.md)')),0,'\n']
);
for(const [name,block,exit,eol] of markdownCases) {
  const mf=fixture('md-'+name);
  const res=mf.finish(name,block,{},eol);
  check('markdown-'+name,[exit,exit===1],[res.status,/회고에 팀 행·고정 JSON 링크·보이는 일반 텍스트/.test(res.stdout+res.stderr)]);
}
const counts=Object.groupBy(results,r=>r.matched?'pass':'fail');
console.log(JSON.stringify({total:results.length,pass:counts.pass?.length??0,fail:counts.fail??[]},null,2));
