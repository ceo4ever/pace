import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const evidence = import.meta.dirname, root = resolve(evidence,'../../../../..');
const pace = join(root,'bin/pace.ts');
const { parseTeamSource } = await import(resolve(root,'src/team/model.ts'));
const definitions = JSON.parse(readFileSync(join(evidence,'fixtures-detailed-roles.json'),'utf8'));
const work = realpathSync(mkdtempSync(join(tmpdir(),'p009-team-synthetic-')));
const env = { ...process.env, PACE_HOME:join(work,'pace-home') };
const protectedFiles = {
  claudeDefault: join(homedir(),'.claude','settings.json'),
  claudeActive: join(process.env.CLAUDE_CONFIG_DIR || join(homedir(),'.claude'),'settings.json'),
  codexDefault: join(homedir(),'.codex','config.toml'),
  codexActive: join(process.env.CODEX_HOME || join(homedir(),'.codex'),'config.toml'),
  paceWorker: join(process.env.PACE_HOME || join(homedir(),'.pace'),'worker-settings.json'),
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const configState = () => Object.fromEntries(Object.entries(protectedFiles).map(([name,path]) => [name,existsSync(path) ? digest(readFileSync(path)) : null]));
const git = (cwd,...args) => execFileSync('git',args,{cwd,env,encoding:'utf8'}).trim();
const run = (cwd,...args) => execFileSync(process.execPath,[pace,...args],{cwd,env,encoding:'utf8'});
const sources = ['roblox-studio','ai-sql-client'].map((name) => ({ name, cwd:join(root,'..','..',name) }));
const gitState = () => sources.map(({name,cwd})=>({ name, head:git(cwd,'rev-parse','HEAD'), clean:git(cwd,'status','--porcelain')==='' }));
const beforeConfig = configState(), beforeGit = gitState(), runs = [];
for (const [label, roles] of Object.entries(definitions)) {
  const cwd = join(work,label);
  mkdirSync(cwd);
  git(cwd,'init','-q','-b','main');
  const roleNames = new Set(roles.map(({name})=>name));
  const sources = {}, hashes = {};
  for (const role of roles) {
    const {name,kind,stages,duties,prohibited,handoffs}=role;
    assert.ok(stages.length>0 && duties.length>1 && prohibited && handoffs.length>0);
    assert.ok(handoffs.every(([to,what,proof])=>(roleNames.has(to)||to==='owner')&&what&&proof));
    run(cwd,'team','new',name,'--role',kind);
    const path = `.pace/team/${name}.md`, file = join(cwd,path), original = readFileSync(file,'utf8');
    const routes = handoffs.map(([to,what,proof])=>`- HANDOFF: ${to} | ${what} | ${proof}`).join('\n');
    const body=original.replace('stage: []',`stage: [${stages.join(', ')}]`)
      .replace(/## 맡는 일\n\n[\s\S]*?(?=## 하지 않는 일)/,`## 맡는 일\n\n${duties.map((d)=>'- '+d).join('\n')}\n\n`)
      .replace(/(?=## 실행 전 대조)/,`- ${prohibited}\n\n`)
      .replace(/## 인계·결정 요청·완료 보고\n\n[\s\S]*?(?=## 도구 안내)/,`## 인계·결정 요청·완료 보고\n\n${routes}\n\n검증 근거와 보류 사유를 받는 역할에 전달한다. 승인 범위가 필요한 경우 owner의 결정을 기록한다. 소통 원장이 있으면 scope_check와 ready를 확인하고 실제 결과로 종결한다.\n\n`);
    for (const duty of duties) assert.ok(body.includes(duty));
    assert.ok(body.includes(prohibited)&&body.includes(routes)&&!body.includes('HANDOFF: lead'));
    writeFileSync(file,body);
    hashes[name]=parseTeamSource(body,name).hash;
    sources[path]=body;
  }
  writeFileSync(join(evidence,`detailed-${label}-role-sources.json`),JSON.stringify(sources,null,2)+'\n');
  run(cwd,'team','sync');
  const sync = JSON.parse(run(cwd,'team','sync','--check','--json'));
  assert.equal(sync.ok,true);
  assert.equal(sync.differences.length,0);
  const roleFiles = Object.fromEntries(roles.flatMap(({name})=>[
    `.pace/team/${name}.md`, `.claude/agents/${name}.md`, `.codex/agents/${name}.toml`,
  ]).map((file)=>[file,digest(readFileSync(join(cwd,file)))]));
  const initial = {label,roleCount:roles.length,sync,roleFiles,roleHashes:hashes,routeCheck:true};
  writeFileSync(join(evidence,`detailed-${label}-sync.json`),JSON.stringify(initial,null,2)+'\n');
  for (const host of ['claude','codex']) runs.push({label,cwd,host,hashes});
}
function live({ label, cwd, host, hashes }) {
  return new Promise((done) => {
    const child = spawn(process.execPath,[pace,'team','verify','--all','--agent',host],{cwd,env});
    let text = '', error = '';
    child.stdout.setEncoding('utf8').on('data', (chunk)=>text+=chunk);
    child.stderr.setEncoding('utf8').on('data', (chunk)=>error+=chunk);
    child.on('error', (problem)=>{error += String(problem);});
    child.on('close',(exitCode)=>{
      const ref = /^Report: (.+)$/m.exec(text)?.[1];
      const report = ref && /^\.pace\/team\/verify\/[a-z0-9-]+\.json$/.test(ref) ? JSON.parse(readFileSync(join(cwd,ref),'utf8')) : null;
      const hashesMatch = !!report && report.rows.length === Object.keys(hashes).length && report.rows.every((r)=>hashes[r.member]===r.hash);
      const result = {label,host,exitCode,report,text,error,hashesMatch};
      writeFileSync(join(evidence,`detailed-${label}-${host}-verify.json`),JSON.stringify(result,null,2)+'\n');
      process.stdout.write(`${label}/${host}: ${exitCode} ${report?.status ?? 'unobserved'}\n`);
      done(result);
    });
  });
}
const results = await Promise.all(runs.map(live));
const afterGit = gitState(), afterConfig = configState();
const report = {beforeGit,afterGit,configKeys:Object.keys(protectedFiles),unchangedConfigs:JSON.stringify(beforeConfig)===JSON.stringify(afterConfig),unchangedGit:JSON.stringify(beforeGit)===JSON.stringify(afterGit),reports:results.map(({label,host,exitCode,report,hashesMatch})=>({label,host,exitCode,hashesMatch,rows:report?.rows.length ?? null,status:report?.status ?? null}))};
writeFileSync(join(evidence,'detailed-boundary-summary.json'),JSON.stringify(report,null,2)+'\n');
assert.ok(report.unchangedGit && report.unchangedConfigs);
assert.ok(results.every(({exitCode,report,hashesMatch})=>exitCode===0&&report?.status==='pass'&&hashesMatch));
