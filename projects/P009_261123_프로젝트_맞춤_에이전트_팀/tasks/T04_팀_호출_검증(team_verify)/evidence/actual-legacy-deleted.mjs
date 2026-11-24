import { existsSync, lstatSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const e = import.meta.dirname, source = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
const f = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
if (realpathSync(f.base) !== f.base || !f.base.startsWith(join(realpathSync(tmpdir()), 'pace-P009-T04-actual-')) || realpathSync(f.root) !== join(f.base, 'repo')) throw Error('Only the owned temporary fixture may change');
const { hasSecret } = await import(join(source, 'src/project/secrets.ts'));
const { fillTemplate } = await import(join(source, 'src/core/fsutil.ts'));
const { loadTeamMember } = await import(join(source, 'src/team/store.ts'));
if (existsSync(join(out, 'legacy-deleted-started.json'))) throw Error('Existing actual cases must not be overwritten');
writeFileSync(join(out, 'legacy-deleted-started.json'), JSON.stringify({ at: new Date().toISOString(), scope: 'Owned temporary fixture only; no actual application repository changed' }, null, 2) + '\n');
async function call(agent, name, label) {
  const args = [join(source, 'bin/pace.ts'), 'team', 'verify', name, '--agent', agent];
  return new Promise(done => {
    const child = spawn(process.execPath, args, { cwd: f.root, env: { ...process.env, PACE_HOME: f.home }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', x => { stdout += x; }); child.stderr.on('data', x => { stderr += x; });
    child.on('error', error => { stderr += String(error); });
    child.on('close', code => {
      if (hasSecret(stdout + stderr)) throw Error('Unsafe actual case output withheld');
      const match = /^Report: (\.pace\/team\/verify\/[a-z0-9-]+\.json)$/m.exec(stdout);
      let report;
      if (match) {
        const bytes = readFileSync(join(f.root, match[1])); if (hasSecret(bytes.toString('utf8'))) throw Error('Unsafe report withheld');
        writeFileSync(join(out, `${label}-${agent}-report.json`), bytes); report = JSON.parse(bytes);
      }
      writeFileSync(join(out, `${label}-${agent}-receipt.json`), JSON.stringify({ args: ['node', ...args], code, stdout, stderr, at: new Date().toISOString(), report_path: match?.[1] ?? null }, null, 2) + '\n');
      console.log(JSON.stringify({ label, agent, code, status: report?.status, observed: report?.rows[0]?.observed }));
      done({ code, report });
    });
  });
}
const removed = join(f.root, '.pace/team', f.members[0].name + '.md'), original = readFileSync(removed);
const stat = lstatSync(removed);
if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || createHash('sha256').update(original).digest('hex') !== f.members[0].hash) throw Error('Unsafe deletion fixture');
let deleted;
try {
  unlinkSync(removed);
  deleted = await Promise.all(['claude', 'codex'].map(agent => call(agent, f.members[0].name, 'deleted')));
} finally { writeFileSync(removed, original, { flag: 'wx' }); }
if (deleted.some(r => r.code !== 1 || r.report?.status !== 'fail' || r.report.rows[0].observed !== null || r.report.rows[0].response !== null)) process.exitCode = 1;
const old = spawnSync('git', ['show', '8238355:templates/team/member.md'], { cwd: source, encoding: 'utf8' });
if (old.status !== 0) throw Error(old.stderr);
writeFileSync(join(out, 'legacy-template-original.md'), old.stdout);
const legacyText = fillTemplate(old.stdout, { name: 'legacy-maker', role: 'maker', tier: 'medium', duties: '배정된 범위를 구현하고 관련 검사를 실행해 결과와 한계를 보고한다.' });
const legacyPath = join(f.root, '.pace/team/legacy-maker.md'); writeFileSync(legacyPath, legacyText, { flag: 'wx' });
const member = loadTeamMember(f.root, 'legacy-maker');
const legacy = await Promise.all(['claude', 'codex'].map(agent => call(agent, 'legacy-maker', 'legacy')));
if (legacy.some(r => r.code !== 2 || r.report?.status !== '확인 필요' || !r.report.rows[0].observed || !r.report.rows[0].response)) process.exitCode = 1;
writeFileSync(join(out, 'legacy-deleted-summary.json'), JSON.stringify({ at: new Date().toISOString(), deleted_source_restored_identically: readFileSync(removed).equals(original), legacy_source_unchanged: readFileSync(legacyPath, 'utf8') === legacyText, legacy_hash: member.hash, deleted: deleted.map(r => ({ code: r.code, status: r.report?.status })), legacy: legacy.map(r => ({ code: r.code, status: r.report?.status })), limitation: 'Deletion is named preflight failure with no host invocation. All scans only the current source roster; missing managed originals are also diagnosed by sync --check.' }, null, 2) + '\n');
