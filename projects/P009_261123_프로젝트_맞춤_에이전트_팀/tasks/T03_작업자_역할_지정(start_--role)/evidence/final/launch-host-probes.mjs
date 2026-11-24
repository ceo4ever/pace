import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const evidence = import.meta.dirname, source = resolve(evidence, '../../../../../..');
const label = process.argv[2] ?? '';
if (label && !/^[a-z0-9-]+$/.test(label)) throw Error('Invalid attempt label');
const suffix = label ? `-${label}` : '';
const probes = JSON.parse(readFileSync(join(evidence, 'host-probes.json'), 'utf8'));
const { resolveTeamSettings } = await import(join(source, 'src/core/worker-tiers.ts'));
const manifest = {};
for (const path of ['src/project/harness.ts', 'src/project/role-record.ts', 'src/project/event-log.ts', 'src/project/metrics.ts', 'src/team/worker-role.ts', 'src/cli.ts', 'test/project-role.test.ts']) {
  manifest[path] = createHash('sha256').update(readFileSync(join(source, path))).digest('hex');
}
if (existsSync(join(evidence, `host-probe-source-snapshot${suffix}.json`))) throw Error('기존 실측 시도를 덮어쓰지 않는다');
writeFileSync(join(evidence, `host-probe-source-snapshot${suffix}.json`), JSON.stringify(manifest, null, 2) + '\n');
const rows = [];
for (const p of probes) {
  const folder = join(evidence, `host-fixtures${suffix}/${p.agent}`); mkdirSync(folder, { recursive: true });
  copyFileSync(join(p.worktree, '.pace/team/probe-maker.md'), join(folder, 'role.md'));
  copyFileSync(join(p.worktree, 'projects', p.projectDir, 'PROJECT.md'), join(folder, 'PROJECT.md'));
  copyFileSync(join(p.worktree, 'projects', p.projectDir, 'tasks/T01_점수_곱셈_구현/TASK.md'), join(folder, 'TASK.md'));
  const wrapper = join(p.home, `orca-local${suffix}.mjs`), calls = join(evidence, `host-${p.agent}-orca-calls${suffix}.jsonl`);
  writeFileSync(wrapper, `#!/usr/bin/env node\nimport {spawnSync} from 'node:child_process';import fs from 'node:fs';
const sourceArgs=process.argv.slice(2);let args=[...sourceArgs];
// The caller is a dispatched worker, not the Run's coordinator terminal.
// Query the explicitly assigned parent Run instead of binding a new Run.
if(args[1]==='run-current')args=['orchestration','run-show','--id','run_5133381ff64d','--json'];
if(args[1]==='run-create')throw Error('Probe must use its existing parent Run');
if(!args.includes('--environment'))args.push('--environment','local');
if(args[1]==='worker-start'){if(!args.includes('--from'))args.push('--from','term_70f904d2-3a89-4419-be4a-0bff67cc5151');if(!args.includes('--run'))args.push('--run','run_5133381ff64d');}
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({sourceArgs,transportArgs:args})+'\\n');
const env={...process.env};delete env.ORCA_ENVIRONMENT;delete env.ORCA_PAIRING_CODE;delete env.ORCA_CLI_COMMAND;
const r=spawnSync('/usr/local/bin/orca',args,{env,encoding:'utf8'});
fs.writeFileSync(${JSON.stringify(join(evidence, `host-${p.agent}-orca-`))}+args[1]+${JSON.stringify(suffix)}+'.json',r.stdout||'');
if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);process.exitCode=r.status??1;\n`);
  chmodSync(wrapper, 0o755);
  rows.push({ ...p, wrapper, settings: resolveTeamSettings(p.agent, 'medium', { ...process.env, PACE_HOME: p.home }), started_at: new Date().toISOString() });
}
writeFileSync(join(evidence, `host-start-intents${suffix}.json`), JSON.stringify(rows, null, 2) + '\n');
await Promise.all(rows.map((p) => new Promise((done) => {
  const env = { ...process.env, PACE_HOME: p.home, ORCA_CLI_COMMAND: p.wrapper, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  delete env.ORCA_PAIRING_CODE;
  delete env.ORCA_ENVIRONMENT;
  const args = [join(source, 'bin/pace.ts'), 'project', 'start', 'P001', '--role', p.role, '--agent', p.agent, '--launch'];
  const child = spawn(process.execPath, args, { cwd: p.root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', (error) => { stderr += String(error); });
  child.on('close', (code, signal) => {
    writeFileSync(join(evidence, `host-${p.agent}-start-result${suffix}.json`), JSON.stringify({ args: ['node', ...args], code, signal, stdout, stderr, ended_at: new Date().toISOString() }, null, 2) + '\n');
    let receipt; const raw = join(evidence, `host-${p.agent}-orca-worker-start${suffix}.json`);
    if (existsSync(raw)) { try { receipt = JSON.parse(readFileSync(raw, 'utf8')); } catch {} }
    console.log(JSON.stringify({ agent: p.agent, code, receipt: receipt ?? null, stderr, ...(!receipt?.ok ? { diagnostic: stdout.slice(0, 800) } : {}) }));
    done();
  });
} )));
