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
const table = (header = '구분', summary = '표시 내용') =>
  ['| '+header+' | 입력 | 요약 |', '|---|---|---|', '| 팀 | [회고](TEAM-RETROSPECTIVE.json) | '+summary+' |'].join('\n');
const section = (header, summary) => '## 회고\n\n'+table(header,summary);
const probe = (label,block,expected,eol) => {
  const r = f.finish(label,block,{},eol);
  const fixture = fs.readFileSync(f.p('PROJECT-CLOSE.md'));
  const original = fs.readFileSync(path.join(f.base,label+'.md'));
  check(label, {status:expected, bytesUnchanged:true, gate:expected===1},
    {status:r.status, bytesUnchanged:fixture.equals(original), gate:/PROJECT-CLOSE 회고에 팀 행/.test(r.stdout+r.stderr)});
};
const f = fixture('projection');
for (const [tag,eol] of [['cr','\r'],['crlf','\r\n'],['lf','\n']]) {
  probe(tag+'-next-section', '## 회고\n\n없음'+eol+'## 참고\n\n'+table(),1);
  probe(tag+'-valid-table', section(),0,eol);
  probe(tag+'-fenced-table', '~~~md\n'+section()+'\n~~~',1,eol);
}
for (const [tag,value] of [['direct','[\u3164](details.md)'],['reference','[\u2800][ref]'],['emphasized','[**\u115f**](details.md)']]) {
  const definition = tag==='reference' ? '\n\n[ref]: details.md' : '';
  probe(tag+'-header',section(value)+definition,1);
  probe(tag+'-summary',section(undefined,value)+definition,1);
}
probe('filler-with-decoration',section('**\u3164**','_\u2800_'),1);
probe('visible-links',section('[한글](details.md)','A<B [범위](<https://example.invalid/scope>) [중첩](https://example.invalid/a_(b(c)))'),0);

// The label regex also scans inside destinations/titles and ignores escapes.
probe('visible-link-with-title',section(undefined,'[범위](details.md "[\u2800](sample.md)")'),0);
probe('visible-literal-escaped-bracket',section(undefined,'비교 \\[\u2800](details.md)'),0);

const s = fixture('formatter');
fs.writeFileSync(s.p('PROJECT-CLOSE.md'),'# 합성 마감\n\n'+section()+'\n\n## 지표\n\n[지표](METRICS.md)\n');
const period={start:'2025-08-01T00:00:00Z',end:'2025-08-02T00:00:00Z',unit:'representative-task',closed:true,completionRef:'frame.json'};
s.receipt('frame.json',period,'fixture-request');
s.json('TEAM-MEASUREMENT.json',{version:1,period,request_coverage:{status:'complete',reportedBy:'agent:maker',verifiedBy:'coordinator',confirmationRef:'frame.json',refs:['frame.json']}});
for(const [tag,at,count,total] of [['zero','2025-08-01T00:00:00Z',0,'1'],['nonzero','2025-07-31T23:59:59Z',1,'미확인']]) {
  s.log([{ts:at,type:'question',by:'agent',to:'owner',requestId:'fixture-request',msg:'synthetic question'},{ts:'2025-08-01T00:00:01Z',type:'answer',by:'user',requestId:'fixture-request',ref:'frame.json',msg:'synthetic answer'}]);
  const txt=s.pace('project','stats','P001');
  const write=s.pace('project','stats','P001','--write');
  const metrics=read(s.p('METRICS.md'));
  fs.writeFileSync(path.join(s.base,tag+'.stats.txt'),txt.stdout);
  fs.writeFileSync(path.join(s.base,tag+'.METRICS.md'),metrics);
  const output = source => ({boundary:Number(/구간 밖 최초 요청의 구간 내 활동: (\d+)건/.exec(source)?.[1]??-1),hold:/미확인에 포함, 총량\/방향 보류/.test(source), total:/요청 ID별: 도달 관측 \d+ \/ 총량 (\S+)/.exec(source)?.[1]});
  const expected={boundary:count,hold:!!count,total};
  check(tag+'-hold-note',{statuses:[0,0],stats:expected,metrics:expected},{statuses:[txt.status,write.status],stats:output(txt.stdout),metrics:output(metrics)});
}
console.log(JSON.stringify({matched:results.filter(r=>r.matched).length,total:results.length,failures:results.filter(r=>!r.matched)},null,2));
if(results.some(r=>!r.matched)) process.exitCode=1;
