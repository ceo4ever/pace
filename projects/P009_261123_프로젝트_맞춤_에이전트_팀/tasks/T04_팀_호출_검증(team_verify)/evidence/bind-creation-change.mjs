import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const e = import.meta.dirname, root = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
const target = join(out, 'creation-only-binding.json');
if (existsSync(target)) throw Error('Existing binding must be retained');
const sha = x => createHash('sha256').update(x).digest('hex');
const f = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
const oldStore = readFileSync(join(out, 'store-before-unique.txt'), 'utf8'), currentStore = readFileSync(join(root, 'src/team/store.ts'), 'utf8');
const git = spawnSync('git', ['show', 'HEAD:src/team/store.ts'], { cwd: root, encoding: 'utf8' }); assert.equal(git.status, 0); assert.equal(sha(git.stdout), sha(oldStore));
const functions = ['teamRoot', 'safeTeamPath', 'readTeamFile', 'teamFiles', 'loadTeamMember', 'loadTeam'];
const extract = (body, name) => { const start = body.indexOf('export function ' + name + '('); assert.ok(start >= 0); const end = body.indexOf('\nexport function ', start + 1); return body.slice(start, end < 0 ? undefined : end); };
const readers = Object.fromEntries(functions.map(name => { const a = sha(extract(oldStore, name)), b = sha(extract(currentStore, name)); assert.equal(a, b, name); return [name, { before: a, after: b }]; }));
const archives = join(out, 'source-archive'); mkdirSync(archives);
const originals = [];
for (const m of [...f.members, { name: 'legacy-maker', hash: JSON.parse(readFileSync(join(out, 'legacy-deleted-summary.json'), 'utf8')).legacy_hash }]) {
  const bytes = readFileSync(join(f.root, '.pace/team', m.name + '.md')); assert.equal(sha(bytes), m.hash);
  writeFileSync(join(archives, m.name + '.md'), bytes); originals.push({ name: m.name, hash: m.hash, archive: 'source-archive/' + m.name + '.md' });
}
const beforeTemplate = readFileSync(join(out, 'template-before-unique.md')), afterTemplate = readFileSync(join(root, 'templates/team/member.md'));
const snapshot = JSON.parse(readFileSync(join(out, 'source-snapshot-fixed.json'), 'utf8')).source;
assert.equal(sha(beforeTemplate), snapshot['templates/team/member.md']);
writeFileSync(target, JSON.stringify({ kind: 'creation-only change, not captured role-loading protocol', at: new Date().toISOString(), before_template_sha256: sha(beforeTemplate), after_template_sha256: sha(afterTemplate), before_store_sha256: sha(oldStore), after_store_sha256: sha(currentStore), unchanged_read_functions: readers, active_originals_unchanged: originals, changed_paths: ['createTeamMember new-marker generation', 'new source template placeholders'], live_calls_added: 0, limitation: 'The creation template changed for future new roles. The captured model calls read existing nonce-bearing original files, which remain byte-identical. No new live sample of the default generator is claimed; uniqueness and lexical handling are unit-tested.' }, null, 2) + '\n');
console.log('pass: active originals and all store reading functions unchanged; only future creation markers changed');
