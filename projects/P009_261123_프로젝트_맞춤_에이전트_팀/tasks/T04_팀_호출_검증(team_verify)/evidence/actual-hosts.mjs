import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const e = import.meta.dirname, source = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
mkdirSync(out, { recursive: true });
const { createTeamMember } = await import(join(source, 'src/team/store.ts'));
const { hasSecret } = await import(join(source, 'src/project/secrets.ts'));
const phase = process.argv[2];
if (phase !== 'normal') throw Error('This runner currently handles the normal phase only');
const manifestPath = join(out, 'fixture.json');
if (existsSync(manifestPath)) throw Error('Existing actual attempt is retained; do not blindly retry');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'pace-P009-T04-actual-'))), root = join(base, 'repo'), home = join(base, 'pace-home');
mkdirSync(root); mkdirSync(home);
const git = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' });
if (git.status !== 0) throw Error(git.stderr);
writeFileSync(join(home, 'worker-tiers.json'), JSON.stringify(Object.fromEntries(['claude', 'codex'].map(agent => [agent, { high: { effort: 'low' }, medium: { effort: 'low' }, low: { effort: 'low' } }]))) + '\n');
const members = [];
for (const role of ['lead', 'maker', 'reviewer']) {
  const name = `vfy-${role}-${randomUUID().slice(0, 8)}`, member = createTeamMember(root, name, role);
  const markers = [0, 1].map(() => 'vfy-' + randomUUID().slice(0, 8));
  if (markers.some(hasSecret)) throw Error('Unsafe synthetic marker');
  const path = join(root, member.source);
  writeFileSync(path, readFileSync(path, 'utf8').replace('`미배정`', '`' + markers[0] + '`').replace('`검토독립`', '`' + markers[1] + '`'));
  members.push({ name, role, markers, hash: createHash('sha256').update(readFileSync(path)).digest('hex') });
}
const env = { ...process.env, PACE_HOME: home };
const sync = spawnSync(process.execPath, [join(source, 'bin/pace.ts'), 'team', 'sync'], { cwd: root, env, encoding: 'utf8' });
if (sync.status !== 0) throw Error(sync.stderr);
writeFileSync(join(out, 'sync.txt'), sync.stdout + sync.stderr);
const snapshot = Object.fromEntries(['src/team/verify.ts', 'src/team/worker-role.ts', 'src/cli.ts', 'templates/team/member.md', 'test/team-verify.test.ts'].map(path => [path, createHash('sha256').update(readFileSync(join(source, path))).digest('hex')]));
writeFileSync(manifestPath, JSON.stringify({ base, root, home, members, source_snapshot: snapshot, created: new Date().toISOString(), retry_policy: 'First all per host; no response-only retry. At most one new measurement after a concrete code/environment correction, all prior attempts retained.' }, null, 2) + '\n');
await Promise.all(['claude', 'codex'].map(agent => new Promise(done => {
  const args = [join(source, 'bin/pace.ts'), 'team', 'verify', '--all', '--agent', agent];
  const start = new Date().toISOString();
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => { stderr += String(error); });
  child.on('close', (code, signal) => {
    const unsafe = hasSecret(stdout) || hasSecret(stderr);
    const match = /^Report: (\.pace\/team\/verify\/[a-z0-9-]+\.json)$/m.exec(stdout);
    let report;
    if (match && !unsafe) {
      const bytes = readFileSync(join(root, match[1]));
      if (hasSecret(bytes.toString('utf8'))) throw Error('Unsafe result withheld');
      writeFileSync(join(out, `normal-${agent}-report.json`), bytes);
      report = JSON.parse(bytes);
    }
    writeFileSync(join(out, `normal-${agent}-receipt.json`), JSON.stringify({ args: ['node', ...args], cwd: root, pace_home: home, start, end: new Date().toISOString(), code, signal, stdout: unsafe ? '[withheld: secret candidate]' : stdout, stderr: unsafe ? '[withheld: secret candidate]' : stderr, withheld: unsafe, report_path: match?.[1] ?? null }, null, 2) + '\n');
    console.log(JSON.stringify({ agent, code, status: report?.status, rows: report?.rows.map(r => ({ member: r.member, status: r.status, model: r.observed })) }));
    if (code !== 0 || report?.rows.length !== 3 || report?.status !== 'pass') process.exitCode = 1;
    done();
  });
})));
