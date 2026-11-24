import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const e = import.meta.dirname, out = join(e, 'actual-hosts'), source = resolve(e, '../../../../..');
const read = file => JSON.parse(readFileSync(join(out, file), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const { evaluateRoleAnswer, verifyKeywords, VERIFY_QUESTIONS } = await import(join(source, 'src/team/verify.ts'));
const { loadTeamMember } = await import(join(source, 'src/team/store.ts'));
const { parseTeamSource } = await import(join(source, 'src/team/model.ts'));
const { roleInstruction } = await import(join(source, 'src/team/worker-role.ts'));
const f = read('fixture.json'), replay = read('normal-fixed-replay-unique.json'), binding = read('creation-only-binding.json');
const liveFixture = existsSync(f.root), sources = new Map(); let liveSessions = 0;
for (const item of binding.active_originals_unchanged) {
  const archived = readFileSync(join(out, item.archive)); assert.equal(sha(archived), item.hash);
  if (liveFixture) assert.deepEqual(readFileSync(join(f.root, '.pace/team', item.name + '.md')), archived);
  sources.set(item.name, parseTeamSource(archived.toString('utf8'), item.name));
}
const snapshot = read('source-snapshot-fixed.json').source;
for (const path of ['src/team/worker-role.ts', 'src/cli.ts']) assert.equal(sha(readFileSync(join(source, path))), snapshot[path]);
assert.equal(sha(readFileSync(join(source, 'templates/team/member.md'))), binding.after_template_sha256);
const oldStore = readFileSync(join(out, 'store-before-unique.txt'), 'utf8'), currentStore = readFileSync(join(source, 'src/team/store.ts'), 'utf8');
assert.equal(sha(oldStore), binding.before_store_sha256); assert.equal(sha(currentStore), binding.after_store_sha256);
const extract = (body, name) => { const start = body.indexOf('export function ' + name + '('); assert.ok(start >= 0); const end = body.indexOf('\nexport function ', start + 1); return body.slice(start, end < 0 ? undefined : end); };
for (const [name, hashes] of Object.entries(binding.unchanged_read_functions)) { assert.equal(sha(extract(oldStore, name)), hashes.before); assert.equal(sha(extract(currentStore, name)), hashes.after); assert.equal(hashes.before, hashes.after); }
assert.equal(replay.live_calls_added, 0); assert.equal(replay.rows.length, 6);
assert.equal(sha(readFileSync(join(source, 'src/team/verify.ts'))), replay.source_after_sha256);
for (const row of replay.rows) {
  const bytes = readFileSync(join(out, row.live_report)); assert.equal(sha(bytes), row.live_report_sha256);
  const original = JSON.parse(bytes).rows.find(r => r.member === row.member);
  assert.equal(sha(original.response), row.response_sha256);
  const member = f.members.find(m => m.name === row.member);
    assert.equal(sources.get(member.name).hash, member.hash);
  assert.equal(evaluateRoleAnswer(member.name, member.markers, original.response).status, 'pass');
}
const claude = read('claude-controls-session-proof.json');
const archivedEvents = read('claude-control-events-archive.json');
assert.equal(archivedEvents.source_packet_sha256, sha(readFileSync(join(out, 'claude-controls-session-proof.json'))));
assert.equal(claude.added_live_calls, 0);
for (const entry of claude.results) {
  const lines = existsSync(entry.session_source) ? (() => { const bytes = readFileSync(entry.session_source); assert.equal(sha(bytes), entry.session_sha256); liveSessions++; return bytes.toString('utf8').split('\n').filter(Boolean).map(JSON.parse); })() : null;
  if (lines) assert.equal(lines.some(r => r.cwd === entry.cwd), true);
  const capture = read(entry.original_capture);
  const archived = archivedEvents.results.find(r => r.kind === entry.kind); assert.equal(archived.session_sha256, entry.session_sha256);
  for (const [index, observation] of entry.observations.entries()) {
    const saved = archived.events[index]; assert.equal(saved.result_sha256, observation.result_sha256); assert.equal(saved.is_error, observation.is_error);
    const text = saved.text;
    if (lines) {
      const item = lines[observation.line - 1].message.content.find(c => c.type === 'tool_result' && c.tool_use_id === observation.tool_use_id);
      assert.ok(item); assert.equal(item.is_error === true, observation.is_error);
      assert.equal(typeof item.content === 'string' ? item.content : JSON.stringify(item.content), text);
    }
    assert.equal(sha(text), observation.result_sha256);
    if (observation.control_value_observed) assert.equal(text.includes(capture.control_value), true);
  }
  assert.equal(entry.same_session_control_read_and_denied_error, true);
  assert.equal(capture.trace.returned, true);
  assert.equal(capture.prompt.includes(VERIFY_QUESTIONS), true);
  if (entry.kind === 'read-denied') assert.equal(capture.prompt.startsWith(roleInstruction({ member: sources.get(f.members[0].name), source: 'option', settings: capture.row.requested })), true);
  else assert.equal(capture.prompt.includes(f.members[0].name), false);
  assert.equal(evaluateRoleAnswer(f.members[0].name, f.members[0].markers, capture.row.response).status, 'fail');
  if (entry.kind === 'unloaded') for (const marker of f.members[0].markers) assert.equal(capture.row.response.includes(marker), false);
}
const native = read('codex-native-path-proof.json'); assert.equal(native.added_model_calls, 0);
for (const entry of native.rows) {
  const capture = read(entry.native_session);
  assert.equal(entry.same_policy_definition, true); assert.equal(entry.write_exists, false);
  for (const check of entry.checks) {
    assert.equal(check.check === 'control' ? check.code === 0 : check.code === 1, true);
    if (check.check !== 'control') assert.match(check.stderr, /Operation not permitted/);
    for (const config of capture.profile_configs.filter(v => v.startsWith('permissions.'))) assert.equal(check.args.includes(config), true);
  }
  assert.equal(capture.trace.completed, true);
  assert.equal(capture.trace.commands.some(c => c.control_output && c.exit_code === 0), true);
  assert.equal(capture.row.observed.source, 'requested');
  assert.equal(capture.prompt.includes(VERIFY_QUESTIONS), true);
  if (entry.kind === 'read-denied') assert.equal(capture.prompt.startsWith(roleInstruction({ member: sources.get(f.members[0].name), source: 'option', settings: capture.row.requested })), true);
  else assert.equal(capture.prompt.includes(f.members[0].name), false);
  assert.equal(evaluateRoleAnswer(f.members[0].name, f.members[0].markers, capture.row.response).status, 'fail');
  assert.equal(capture.trace.commands.some(c => c.denied && c.read_denied_output), false, 'Do not invent a model-issued denied command');
  if (entry.kind === 'unloaded') for (const marker of f.members[0].markers) assert.equal(capture.row.response.includes(marker), false);
}
const legacyDeleted = read('legacy-deleted-summary.json');
assert.equal(legacyDeleted.deleted_source_restored_identically, true); assert.equal(legacyDeleted.legacy_source_unchanged, true);
assert.equal(verifyKeywords(sources.get('legacy-maker')).length, 0);
for (const agent of ['claude', 'codex']) {
  const deleted = read(`deleted-${agent}-report.json`), legacy = read(`legacy-${agent}-report.json`);
  assert.equal(read(`deleted-${agent}-receipt.json`).code, 1); assert.equal(deleted.status, 'fail'); assert.equal(deleted.rows[0].observed, null); assert.equal(deleted.rows[0].response, null);
  assert.equal(read(`legacy-${agent}-receipt.json`).code, 2); assert.equal(legacy.status, '확인 필요'); assert.equal(legacy.rows[0].observed.source, 'reported');
  assert.equal(evaluateRoleAnswer('legacy-maker', [], legacy.rows[0].response).status, '확인 필요');
  assert.equal(read(`normal-${agent}-report.json`).rows.length, 3);
  assert.equal(read(`normal-fixed-${agent}-report.json`).rows.length, 3);
  assert.equal(read(`unloaded-${agent}.json`).validity, 'unconfirmed');
  assert.equal(read(`read-denied-${agent}.json`).validity, 'unconfirmed');
}
assert.equal(existsSync(join(e, 'coordinator-controls-decision.md')), true);
console.log(JSON.stringify({ pass: true, added_model_calls: 0, live_fixture_reaudited: liveFixture, live_session_sources_reaudited: liveSessions, archived_control_events_checked: true, limitation: 'If volatile sources are gone, archives are checked and raw-source reaudit is explicitly not claimed. Run against the T04 source snapshot; later source changes require that checkout.' }));
