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
for (const [name,body,want] of [
  ['hangul-filler-summary',table.replace('합성 요약','\u3164'),1],
  ['hangul-filler-evidence-label',table.replace('[회고]','[\u3164]'),1],
  ['hangul-filler-header',table.replace('구분','\u3164'),1],
  ['hangul-visible-syllable',table.replace('합성 요약','한').replace('[회고]','[글]').replace('구분','항목'),0],
  ['default-ignorable-letter-plus-visible',table.replace('합성 요약','한\u3164'),0]
]) {
  const f=fixture(name); f.head(f.marker); f.receipt('proof.json'); save(f.path('TEAM-RETROSPECTIVE.json'),ret);
  f.close('## 회고\n\n'+body); add(name,want,f.finish());
}
console.log(JSON.stringify(results,null,2));
console.error(JSON.stringify({codePoint:'U+3164',letter:/\p{L}/u.test('\u3164'),defaultIgnorable:/\p{Default_Ignorable_Code_Point}/u.test('\u3164')}));
