import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const e = import.meta.dirname, source = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
const fixture = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
const { hasSecret } = await import(join(source, 'src/project/secrets.ts'));
const snapshotPath = join(out, 'source-snapshot-fixed.json');
if (existsSync(snapshotPath)) throw Error('The one permitted corrected normal measurement already exists');
const snapshot = Object.fromEntries(Object.keys(fixture.source_snapshot).map(path => [path, createHash('sha256').update(readFileSync(join(source, path))).digest('hex')]));
writeFileSync(snapshotPath, JSON.stringify({ source: snapshot, same_fixture: true, changed_definitions: false, changed_settings: false, reason: 'Concrete readonly Claude self-hash tool gap; coordinator A decision and R4 pre-review pass. Common roleInstruction unchanged; caller responsibility notice and pre/post source guards added.', started: new Date().toISOString() }, null, 2) + '\n');
for (const m of fixture.members) if (createHash('sha256').update(readFileSync(join(fixture.root, '.pace/team', m.name + '.md'))).digest('hex') !== m.hash) throw Error('Fixture changed');
await Promise.all(['claude', 'codex'].map(agent => new Promise(done => {
  const args = [join(source, 'bin/pace.ts'), 'team', 'verify', '--all', '--agent', agent];
  const start = new Date().toISOString();
  const child = spawn(process.execPath, args, { cwd: fixture.root, env: { ...process.env, PACE_HOME: fixture.home }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => { stderr += String(error); });
  child.on('close', (code, signal) => {
    const unsafe = hasSecret(stdout) || hasSecret(stderr), match = /^Report: (\.pace\/team\/verify\/[a-z0-9-]+\.json)$/m.exec(stdout);
    let report;
    if (match && !unsafe) {
      const bytes = readFileSync(join(fixture.root, match[1]));
      if (hasSecret(bytes.toString('utf8'))) throw Error('Unsafe result withheld');
      writeFileSync(join(out, `normal-fixed-${agent}-report.json`), bytes); report = JSON.parse(bytes);
    }
    writeFileSync(join(out, `normal-fixed-${agent}-receipt.json`), JSON.stringify({ args: ['node', ...args], cwd: fixture.root, pace_home: fixture.home, start, end: new Date().toISOString(), code, signal, stdout: unsafe ? '[withheld]' : stdout, stderr: unsafe ? '[withheld]' : stderr, withheld: unsafe, report_path: match?.[1] ?? null }, null, 2) + '\n');
    console.log(JSON.stringify({ agent, code, status: report?.status, rows: report?.rows.map(r => ({ member: r.member, status: r.status, model: r.observed })) }));
    if (code !== 0 || report?.rows.length !== 3 || report?.status !== 'pass') process.exitCode = 1;
    done();
  });
})));
