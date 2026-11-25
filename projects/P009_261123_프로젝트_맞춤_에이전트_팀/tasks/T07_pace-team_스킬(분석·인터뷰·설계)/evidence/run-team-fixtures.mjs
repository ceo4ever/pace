import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const evidence = import.meta.dirname, root = resolve(evidence,'../../../../..');
const pace = join(root,'bin/pace.ts');
const definitions = JSON.parse(readFileSync(join(evidence,'fixtures-roles.json'),'utf8'));
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
  for (const [name,kind,duty] of roles) {
    run(cwd,'team','new',name,'--role',kind);
    const file = join(cwd,'.pace','team',name+'.md'), original = readFileSync(file,'utf8');
    writeFileSync(file,original.replace('## 맡는 일\n\n', `## 맡는 일\n\n- ${duty}\n\n`));
  }
  run(cwd,'team','sync');
  const sync = JSON.parse(run(cwd,'team','sync','--check','--json'));
  assert.equal(sync.ok,true);
  assert.equal(sync.differences.length,0);
  const roleFiles = Object.fromEntries(roles.flatMap(([name])=>[
    `.pace/team/${name}.md`, `.claude/agents/${name}.md`, `.codex/agents/${name}.toml`,
  ]).map((file)=>[file,digest(readFileSync(join(cwd,file)))]));
  const initial = {label,roleCount:roles.length,sync,roleFiles};
  writeFileSync(join(evidence,`synthetic-${label}-sync.json`),JSON.stringify(initial,null,2)+'\n');
  for (const host of ['claude','codex']) runs.push({label,cwd,host});
}
function live({ label, cwd, host }) {
  return new Promise((done) => {
    const child = spawn(process.execPath,[pace,'team','verify','--all','--agent',host],{cwd,env});
    let text = '', error = '';
    child.stdout.setEncoding('utf8').on('data', (chunk)=>text+=chunk);
    child.stderr.setEncoding('utf8').on('data', (chunk)=>error+=chunk);
    child.on('error', (problem)=>{error += String(problem);});
    child.on('close',(exitCode)=>{
      const ref = /^Report: (.+)$/m.exec(text)?.[1];
      const report = ref && /^\.pace\/team\/verify\/[a-z0-9-]+\.json$/.test(ref) ? JSON.parse(readFileSync(join(cwd,ref),'utf8')) : null;
      const result = {label,host,exitCode,report,text,error};
      writeFileSync(join(evidence,`synthetic-${label}-${host}-verify.json`),JSON.stringify(result,null,2)+'\n');
      process.stdout.write(`${label}/${host}: ${exitCode} ${report?.status ?? 'unobserved'}\n`);
      done(result);
    });
  });
}
const results = await Promise.all(runs.map(live));
const afterGit = gitState(), afterConfig = configState();
const report = {beforeGit,afterGit,configKeys:Object.keys(protectedFiles),unchangedConfigs:JSON.stringify(beforeConfig)===JSON.stringify(afterConfig),unchangedGit:JSON.stringify(beforeGit)===JSON.stringify(afterGit),reports:results.map(({label,host,exitCode,report})=>({label,host,exitCode,rows:report?.rows.length ?? null,status:report?.status ?? null}))};
writeFileSync(join(evidence,'synthetic-boundary-summary.json'),JSON.stringify(report,null,2)+'\n');
assert.ok(report.unchangedGit && report.unchangedConfigs);
assert.ok(results.every(({exitCode,report})=>exitCode===0&&report?.status==='pass'));
