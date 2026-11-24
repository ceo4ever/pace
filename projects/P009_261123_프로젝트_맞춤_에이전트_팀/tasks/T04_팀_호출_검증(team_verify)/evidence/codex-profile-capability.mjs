import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const out = join(import.meta.dirname, 'actual-hosts'), f = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
const cwd = join(f.base, 'codex-unloaded');
const configs = ['-c', 'permissions.p009probe.extends=":read-only"', '-c', `permissions.p009probe.filesystem={${JSON.stringify(f.root)}="deny"}`];
const rows = [];
for (const [kind, cmd] of [['denied', ['/bin/cat', join(f.root, 'denied-sentinel.txt')]], ['control', ['/bin/cat', join(cwd, 'control-read.txt')]], ['write', ['/usr/bin/touch', join(cwd, 'write-must-not-exist')]]]) {
  const args = ['sandbox', '-P', 'p009probe', ...configs, '--', ...cmd];
  const r = spawnSync('codex', args, { cwd, encoding: 'utf8', timeout: 10000 });
  rows.push({ kind, args, code: r.status, stdout: r.stdout, stderr: r.stderr });
}
writeFileSync(join(out, 'codex-native-profile-capability.json'), JSON.stringify({ rows, write_exists: existsSync(join(cwd, 'write-must-not-exist')) }, null, 2) + '\n');
console.log(JSON.stringify(rows.map(({ kind, code, stdout, stderr }) => ({ kind, code, stdout, stderr })), null, 2));
