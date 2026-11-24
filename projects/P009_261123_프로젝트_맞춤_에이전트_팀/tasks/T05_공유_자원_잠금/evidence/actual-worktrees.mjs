import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../../../..');
const label = process.argv[2] ?? '';
if (label && !/^[a-z0-9-]+$/.test(label)) throw Error('잘못된 관측 라벨');
const output = join(import.meta.dirname, `actual-worktrees${label ? '-' + label : ''}.json`);
if (existsSync(output)) throw Error('이전 실제 관측을 덮어쓰지 않는다');
const { ResourceLock } = await import(join(root, 'src/team/resource-lock.ts'));
const base = mkdtempSync(join(realpathSync(tmpdir()), 'pace-P009-T05-actual-'));
const home = join(base, 'home'); mkdirSync(home);
const env = { ...process.env, PACE_HOME: home, GIT_CONFIG_GLOBAL: join(base, 'git-config'), GIT_CONFIG_SYSTEM: join(base, 'git-config') };
writeFileSync(env.GIT_CONFIG_GLOBAL, '');
for (const key of Object.keys(env)) if (key.startsWith('ORCA_') || key === 'NODE_TEST_CONTEXT') delete env[key];
const git = (cwd, args) => { const r = spawnSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const repo = join(base, 'repo'), other = join(base, 'other-repo'), wt = join(base, 'worktree');
for (const p of [repo, other]) { mkdirSync(p); git(p, ['init', '-q', '-b', 'main']); git(p, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']); }
git(repo, ['worktree', 'add', '-qb', 'second', wt]);
const declare = (cwd, name, scope) => { mkdirSync(join(cwd, '.pace/team'), { recursive: true }); writeFileSync(join(cwd, '.pace/team/resources.md'), '# 임시 자원\n```json\n' + JSON.stringify({ version: 1, resources: [{ name, capacity: 1, scope, description: '실제 CLI 직렬화 시험용', probe: [process.execPath, '-e', 'process.exit(0)'] }] }) + '\n```\n'); };
const pause = ms => new Promise(done => setTimeout(done, ms));
const wait = async (test, ms = 10000) => { const end = Date.now() + ms; while (!test() && Date.now() < end) await pause(25); assert.ok(test(), 'actual deadline'); };
const invoke = (cwd, name, label, script) => {
  const argv = [join(root, 'bin/pace.ts'), 'team', 'lock', name, '--by', label, '--', process.execPath, '-e', script];
  const child = spawn(process.execPath, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const result = new Promise((done, reject) => { child.once('error', reject); child.once('close', (code, signal) => done({ cwd, argv, code, signal, stdout, stderr })); });
  return { child, result };
};
const cases = [];
try {
  for (const [scope, name, firstRoot, secondRoot] of [['repo', 'studio', repo, wt], ['machine', 'device', repo, other]]) {
    declare(firstRoot, name, scope); declare(secondRoot, name, scope);
    const ready = join(base, `${scope}-ready`), gate = join(base, `${scope}-gate`), denied = join(base, `${scope}-forbidden`), events = join(base, `${scope}-events.jsonl`);
    const firstScript = `const f=require('fs'); f.appendFileSync(${JSON.stringify(events)},JSON.stringify({event:'first-start',at:Date.now()})+'\\n');f.writeFileSync(${JSON.stringify(ready)},'ready');const t=setInterval(()=>{if(f.existsSync(${JSON.stringify(gate)})){clearInterval(t);f.appendFileSync(${JSON.stringify(events)},JSON.stringify({event:'first-end',at:Date.now()})+'\\n')}},20)`;
    const first = invoke(firstRoot, name, 'P009', firstScript);
    await wait(() => existsSync(ready));
    const lock = new ResourceLock(firstRoot, name, { home }), secondLock = new ResourceLock(secondRoot, name, { home });
    assert.equal(lock.stateDir, secondLock.stateDir);
    const lease = lock.status().lease;
    assert.equal(lease.phase, 'started');
    const rejected = await invoke(secondRoot, name, 'P010', `require('fs').writeFileSync(${JSON.stringify(denied)},'bad')`).result;
    const rejection = JSON.parse(rejected.stdout.trim().split('\n').at(-1));
    assert.equal(rejected.code, 1); assert.equal(rejection.outcome, 'busy'); assert.equal(rejection.owner, 'alive'); assert.equal(rejection.ownerCheck, 'same-start');
    assert.equal(existsSync(denied), false);
    await wait(() => JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), 'utf8')).heartbeat > lease.heartbeat, 10000);
    const renewed = JSON.parse(readFileSync(join(lock.stateDir, lock.stateName), 'utf8'));
    writeFileSync(gate, 'release');
    const firstResult = await first.result; assert.equal(firstResult.code, 0, firstResult.stdout + firstResult.stderr);
    const second = await invoke(secondRoot, name, 'P010', `require('fs').appendFileSync(${JSON.stringify(events)},JSON.stringify({event:'second-start',at:Date.now()})+'\\n')`).result;
    assert.equal(second.code, 0, second.stdout + second.stderr);
    const timeline = readFileSync(events, 'utf8').trim().split('\n').map(x => JSON.parse(x));
    assert.deepEqual(timeline.map(x => x.event), ['first-start', 'first-end', 'second-start']);
    assert.ok(timeline[1].at <= timeline[2].at);
    const raceGate = join(base, `${scope}-race-gate`), markerA = join(base, `${scope}-race-A`), markerB = join(base, `${scope}-race-B`);
    const raceScript = marker => `const f=require('fs');f.writeFileSync(${JSON.stringify(marker)},'entered');const t=setInterval(()=>{if(f.existsSync(${JSON.stringify(raceGate)}))clearInterval(t)},20)`;
    const a = invoke(firstRoot, name, 'P011', raceScript(markerA)), b = invoke(secondRoot, name, 'P012', raceScript(markerB));
    let raceTimer;
    const lost = await Promise.race([a.result, b.result, new Promise((_, reject) => { raceTimer = setTimeout(() => reject(Error('동시 획득 배타 조건이 성립하지 않음')), 12000); })]).finally(() => clearTimeout(raceTimer));
    assert.ok([1, 2].includes(lost.code));
    await wait(() => existsSync(markerA) || existsSync(markerB));
    assert.equal(Number(existsSync(markerA)) + Number(existsSync(markerB)), 1);
    const winner = lost.cwd === firstRoot ? b : a;
    writeFileSync(raceGate, 'release');
    const won = await winner.result; assert.equal(won.code, 0, won.stdout + won.stderr);
    cases.push({ scope, name, firstRoot, secondRoot, stateDir: lock.stateDir, initial: lease, renewed, rejected, first: firstResult, second, timeline, race: { a: won.cwd === firstRoot ? won : lost, b: won.cwd === secondRoot ? won : lost, entered: { a: existsSync(markerA), b: existsSync(markerB) }, simultaneousStarts: 1 }, final: lock.status() });
  }
  const sources = ['src/team/resources.ts', 'src/team/resource-lock.ts', 'src/team/resource-process.ts', 'src/team/resource-cli.ts', 'src/team/resource-child.ts', 'src/team/store.ts', 'src/cli.ts'];
  writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), kind: 'actual-source-cli-temporary-resources', modelCalls: 0, base, cases, sourceHashes: Object.fromEntries(sources.map(p => [p, createHash('sha256').update(readFileSync(join(root, p))).digest('hex')])), limitation: '시험용 자원과 참여 호출만 검증. 실제 Studio MCP/비참여 호출·Windows 실증은 아님.' }, null, 2) + '\n');
  console.log(JSON.stringify({ cases: cases.length, all: 'passed', output }));
} catch (error) {
  for (const scope of ['repo', 'machine']) writeFileSync(join(base, `${scope}-gate`), 'release-on-experiment-failure');
  for (const scope of ['repo', 'machine']) writeFileSync(join(base, `${scope}-race-gate`), 'release-on-experiment-failure');
  writeFileSync(join(import.meta.dirname, `actual-worktrees${label ? '-' + label : ''}-failure.json`), JSON.stringify({ base, cases, error: String(error) }, null, 2)); throw error;
}
