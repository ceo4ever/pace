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
const f=fixture('request-four-way');
f.head(f.marker);
const cmd=(...a)=>f.must(f.pace(...a));
const log=(type,...a)=>cmd('project','log','P001','--type',type,'--msg','synthetic',...a);
const receiptPath=f.path('answer-proof.json');
f.receipt('answer-proof.json',undefined,'reply-case');
for(const requestId of ['reply-case','retry-case','failed-case','intent-case']) log('question','--request-id',requestId,'--to','owner');
log('question');
log('answer','--by','user','--request-id','reply-case','--ref','answer-proof.json');
const handoff=(...a)=>cmd('team','handoff',...a);
const route={transport:'external',actor:'owner',target:'fixture-human-route',from:'coordinator',sourceRef:'fixture:route'};
const routePath=f.path('route.json'); save(routePath,route);
for(const requestId of ['retry-case','failed-case']) {
 const id='q-'+requestId;
 const header=f.path('header.json');
 save(header,{protocol:'pace-handoff',v:1,id,kind:'decision_request',from:'coordinator',to:'owner',requestId,data:{interpretation:false}});
 handoff('record','P001','--file',header,'--body-file','-');
 for(const phase of requestId==='retry-case'?['failed','sent']:['failed']){
   const attempt='a-'+requestId+'-'+phase;
   handoff('prepare-external','P001',id,'--route-file',routePath,'--attempt-id',attempt);
   const result=f.path('receipt-'+attempt+'.json');
   save(result,{phase,reportedBy:'coordinator',sourceRef:route.sourceRef,...(phase==='sent'?{responseHash:hash('synthetic receipt'),responseId:'synthetic-response'}:{})});
   handoff('receipt','P001',attempt,'--file',result);
 }
}
const stats=f.stats();
const r=stats.team.requests;
add('reply-delivery-failure-intent-and-legacy',[4,2,1,1,1,1,2,1],[r.linked,r.reached,r.ownerReply,r.ownerDelivery,r.failedOnly,r.unconfirmed,r.failedAttemptsObserved,r.legacyUnlinkedEvents]);
const classes=Object.fromEntries(stats.handoffs.requests.items.map(x=>[x.requestId,x.reach]));
add('one-class-per-request',{ 'failed-case':'failed_only','intent-case':'unconfirmed','reply-case':'owner_reply','retry-case':'owner_delivery'},classes);
console.log(JSON.stringify({checks:results, requests:r, classes},null,2));
