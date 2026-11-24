import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const e = import.meta.dirname, source = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
const label = process.argv[2] ?? '';
if (label && !/^[a-z0-9-]+$/.test(label)) throw Error('Invalid evidence label');
const target = join(out, `normal-fixed-replay${label ? '-' + label : ''}.json`);
if (existsSync(target)) throw Error('Do not overwrite a prior reassessment');
const { evaluateRoleAnswer } = await import(join(source, 'src/team/verify.ts'));
const fixture = JSON.parse(readFileSync(join(out, 'fixture.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(join(out, 'source-snapshot-fixed.json'), 'utf8')).source;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const before = readFileSync(join(out, 'normal-fixed-source-before-evaluator-fix.txt'), 'utf8'), after = readFileSync(join(source, 'src/team/verify.ts'), 'utf8');
assert.equal(sha(before), snapshot['src/team/verify.ts']);
for (const name of ['VERIFY_QUESTIONS', 'VERIFY_LOAD_NOTICE', 'VERIFY_LIMITATION']) {
  const start = text => text.indexOf('export const ' + name + ' = ');
  const definition = text => text.slice(start(text), text.indexOf(';\n', start(text)) + 1);
  assert.ok(start(before) >= 0); assert.equal(definition(before), definition(after));
}
const promptFunction = text => /^export function verificationPrompt.*$/m.exec(text)?.[0];
assert.equal(promptFunction(before), promptFunction(after));
for (const path of ['src/team/worker-role.ts', 'src/cli.ts']) assert.equal(sha(readFileSync(join(source, path))), snapshot[path]);
let creationBinding = null;
if (existsSync(join(out, 'creation-only-binding.json'))) {
  creationBinding = JSON.parse(readFileSync(join(out, 'creation-only-binding.json'), 'utf8'));
  assert.equal(creationBinding.before_template_sha256, snapshot['templates/team/member.md']);
  assert.equal(creationBinding.after_template_sha256, sha(readFileSync(join(source, 'templates/team/member.md'))));
  assert.equal(creationBinding.after_store_sha256, sha(readFileSync(join(source, 'src/team/store.ts'))));
  assert.equal(creationBinding.live_calls_added, 0);
} else assert.equal(sha(readFileSync(join(source, 'templates/team/member.md'))), snapshot['templates/team/member.md']);
const rows = [];
for (const agent of ['claude', 'codex']) {
  const file = `normal-fixed-${agent}-report.json`, bytes = readFileSync(join(out, file)), report = JSON.parse(bytes);
  assert.equal(report.rows.length, 3);
  for (const row of report.rows) {
    const member = fixture.members.find(m => m.name === row.member);
    assert.ok(member); assert.equal(row.observed.source, 'reported'); assert.ok(row.response);
    assert.equal(sha(readFileSync(join(fixture.root, '.pace/team', member.name + '.md'))), member.hash);
    const evaluation = evaluateRoleAnswer(member.name, member.markers, row.response);
    rows.push({ agent, member: member.name, live_report: file, live_report_sha256: sha(bytes), original_status: row.status, response_sha256: sha(row.response), evaluation });
    assert.equal(evaluation.status, 'pass', agent + '/' + member.name);
  }
}
const result = { kind: 'deterministic_reassessment_not_new_live_run', at: new Date().toISOString(), live_calls_added: 0, source_before_sha256: sha(before), source_after_sha256: sha(after), common_role_module_cli_unchanged: true, creation_binding: creationBinding ? 'creation-only-binding.json' : null, exact_questions_notice_prompt_builder_unchanged: true, rows, limitation: 'Original live reports and statuses retained; no new live run of final source bytes. A future-role creation template change, if present, is separately bound to unchanged active original files and unchanged store read functions.' };
writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ added_live_calls: 0, rows: rows.length, pass: rows.filter(r => r.evaluation.status === 'pass').length }));
