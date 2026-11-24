import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const out = join(import.meta.dirname, 'actual-hosts'), f = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
const rows = [];
for (const kind of ['unloaded', 'read-denied']) {
  const actual = JSON.parse(readFileSync(join(out, `${kind}-codex-native.json`), 'utf8')), cwd = actual.cwd;
  const configs = ['-c', 'permissions.p009probe.extends=":read-only"', '-c', `permissions.p009probe.filesystem={${JSON.stringify(f.root)}="deny"}`];
  const checks = [];
  const targets = [['source', ['/bin/cat', join(f.root, '.pace/team', f.members[0].name + '.md')]], ['control', ['/bin/cat', join(cwd, 'control-read.txt')]], ['write', ['/usr/bin/touch', join(cwd, 'native-profile-write-must-not-exist')]]];
  if (kind === 'read-denied') targets.push(['alias', ['/bin/cat', join(cwd, '.pace/team', f.members[0].name + '.md')]]);
  for (const [check, command] of targets) {
    const args = ['sandbox', '-P', 'p009probe', ...configs, '--', ...command];
    const r = spawnSync('codex', args, { cwd, encoding: 'utf8', timeout: 10000 });
    checks.push({ check, args, code: r.status, stdout: r.stdout, stderr: r.stderr });
  }
  rows.push({ kind, native_session: `${kind}-codex-native.json`, same_policy_definition: actual.profile_configs.includes(configs[1]) && actual.profile_configs.includes(configs[3]), checks, write_exists: existsSync(join(cwd, 'native-profile-write-must-not-exist')), limitation: 'These denied commands are direct Codex sandbox probes using the same profile, not model-issued command events. Model-session successful control reads are recorded separately; model policy refusal is not misreported as an executed failed command.' });
}
writeFileSync(join(out, 'codex-native-path-proof.json'), JSON.stringify({ at: new Date().toISOString(), added_model_calls: 0, rows }, null, 2) + '\n');
console.log(JSON.stringify(rows.map(r => ({ kind: r.kind, samePolicy: r.same_policy_definition, checks: r.checks.map(c => ({ kind: c.check, code: c.code })), write: r.write_exists }))));
if (rows.some(r => !r.same_policy_definition || r.write_exists || r.checks.some(c => c.check === 'control' ? c.code !== 0 : c.code === 0))) process.exitCode = 1;
