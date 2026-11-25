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
const [NBSP, LS, PS] = ["\u00a0", "\u2028", "\u2029"];
const canonical = (body=table) => '## 회고\n\n'+body;
const cases = [
 ['tilde-nbsp-close','~~~md\n~~~'+NBSP+'\n'+canonical(),1],
 ['backtick-nbsp-close','\x60\x60\x60markdown\n\x60\x60\x60'+NBSP+'\n'+canonical(),1],
 ['tilde-ascii-close','~~~md\nExample\n~~~ \t\n'+canonical(),0],
 ['backtick-ascii-close','\x60\x60\x60markdown\n\x60\x60\x60\t \n'+canonical(),0],
 ['html-nbsp-line','<div>\n'+NBSP+'\n## 회고\n'+table,1],
 ['html-ascii-blank','<div>Example</div>\n \t\n'+canonical(),0],
 ['html-real-blank-after-nbsp','<div>\n'+NBSP+'\n\n'+canonical(),0],
 ['nbsp-heading-separator','##'+NBSP+'회고\n\n'+table,1],
 ['nbsp-heading-trailing','## 회고'+NBSP+'\n\n'+table,1],
 ['ascii-heading-separator','## \t회고\t ## \t\n\n'+table,0],
 ['nbsp-table-separator-cell',canonical(table.replace('|---|','|---'+NBSP+'|')),1],
 ['nbsp-table-end',canonical(table.replace('요약 |','요약 |'+NBSP)),1],
 ['nbsp-before-team-label',canonical(table.replace('| 팀 |','| '+NBSP+'팀 |')),1],
 ['nbsp-header-only',canonical(table.replace('구분',NBSP)),1],
 ['ascii-table-cell-trim',canonical(table.replace('팀 |','팀\t |').replace('|---|','|\t--- \t|')),0],
 ['empty-reference-summary',canonical(table.replace('합성 요약','[][report]'))+'\n\n[report]: details.md',1],
 ['empty-label-plus-text',canonical(table.replace('합성 요약','[](details.md) 실제 요약')),1],
 ['only-combining-hidden',canonical(table.replace('합성 요약','\u034f')),1],
 ['control-label',canonical(table.replace('[회고]','[\u2060]')),1],
 ['html-label-with-text',canonical(table.replace('[회고]','[회고 <b>증거</b>]')),1],
 ['inline-code-header',canonical(table.replace('구분','\x60구분\x60')),1],
 ['raw-comparison',canonical(table.replace('합성 요약','전후 A<B 구간을 비교함').replace('[회고]','[A<B]')),0],
 ['angle-link-summary',canonical(table.replace('합성 요약','[범위](<https://example.invalid/scope>)')),0],
 ['visible-reference-summary',canonical(table.replace('합성 요약','[범위][report]'))+'\n\n[report]: details.md',0],
 ['actual-heading-with-nbsp-other-text','## 회고\n\n'+NBSP+'\n\n'+table,0],
 ['ls-fake-root-heading','ordinary paragraph'+LS+canonical(),1],
 ['ps-fake-heading-end','## 회고'+PS+'later text\n\n'+table,1],
 ['ls-fake-end-of-retro','## 회고\n\nordinary paragraph'+LS+'## 일반 본문\n\n'+table,0],
 ['nbsp-before-canonical-table','## 회고\n\n'+NBSP+'\n'+table,1],
];
for (const [name,body,want] of cases) {
  const f=fixture(name); f.head(f.marker); f.receipt('proof.json'); save(f.path('TEAM-RETROSPECTIVE.json'),ret);
  f.close(body);
  add(name,want,f.finish());
}
for (const [name,metadata,want] of [
 ['marker-hidden-in-nbsp-fence','~~~md\n~~~'+NBSP+'\n'+ '- 팀 측정: v1\n~~~',false],
 ['marker-after-ascii-fence','~~~md\nexample\n~~~ \t\n- 팀 측정:\t v1 \t',true],
 ['marker-hidden-in-nbsp-html','<div>\n'+NBSP+'\n- 팀 측정: v1\n\n',false],
 ['marker-after-ascii-html','<div>\nexample\n \t\n- 팀 측정: v1',true],
 ['marker-after-nbsp-atx','##'+NBSP+'본문\n- 팀 측정: v1',true],
 ['marker-after-ascii-atx','##\t본문\n- 팀 측정: v1',false],
 ['marker-nbsp-after-list-dash','-'+NBSP+'팀 측정: v1',false],
 ['marker-nested-metadata','- list\n  ## 보류\n\n- 팀 측정: v1',2],
 ['marker-after-real-blank','<div>\n'+NBSP+'\n\n- 팀 측정: v1',true],
]) {
 const f=fixture(name); f.head(metadata);
 const r=f.pace('project','stats','P001','--json');
 save(join(f.root,'stats-result.json'),r);
 add(name,want,r.status===0 ? !!JSON.parse(r.stdout).team : r.status);
}
console.log(JSON.stringify(results,null,2));
