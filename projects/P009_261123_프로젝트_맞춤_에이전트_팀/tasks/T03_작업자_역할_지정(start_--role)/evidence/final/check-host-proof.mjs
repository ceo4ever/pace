import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const e = import.meta.dirname;
const read = (file) => JSON.parse(readFileSync(join(e, file), 'utf8'));
const observations = read('host-observations.json'), probes = read('host-probes.json'), messages = read('host-messages.json');
assert.equal(observations.source_unchanged_after_live_probe, true);
assert.equal(observations.protected_pace_known_metadata_unchanged, true);
assert.equal(messages.length, 10);
for (const p of probes) {
  const receipt = read(`host-${p.agent}-orca-worker-start-current.json`), h = observations.hosts.find((row) => row.agent === p.agent);
  // Check the allowlisted extraction against the actual controlled session.
  // No transcript content is emitted or copied by this check.
  const sessionBytes = readFileSync(h.session_source);
  assert.equal(createHash('sha256').update(sessionBytes).digest('hex'), h.session_sha256);
  const session = sessionBytes.toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(session.some((row) => (row.type === 'session_meta' ? row.payload?.cwd : row.cwd) === p.worktree), true);
  for (const meta of h.metadata) {
    const row = session[meta.line - 1];
    if (meta.field === 'turn_context') {
      assert.equal(row.type, 'turn_context'); assert.equal(row.payload.model, meta.model);
      assert.equal(row.payload.effort ?? row.payload.reasoning_effort, meta.effort);
    } else {
      const actual = meta.field.split('.').reduce((value, key) => value?.[key], row);
      assert.equal(actual, meta.model ?? meta.effort);
    }
  }
  assert.equal(receipt.ok, true); assert.equal(h.completion, 'succeeded');
  assert.equal(h.marker_in_result, true); assert.equal(h.role_in_result, true); assert.equal(h.signoff_exists, false);
  const resultDir = read(`host-results/${p.agent}/location.json`).cwd;
  const actualResult = JSON.parse(readFileSync(join(resultDir, 'probe-result.json'), 'utf8'));
  assert.equal(actualResult.marker, p.marker); assert.equal(actualResult.role, p.role);
  for (const file of ['score.ts', 'score.test.ts', 'probe-result.json']) {
    assert.deepEqual(readFileSync(join(e, 'host-results', p.agent, file)), readFileSync(join(resultDir, file)));
  }
  const roles = h.start_events.map((row) => row.role);
  assert.deepEqual(roles.map((row) => row.settingsStatus), ['planned', 'arguments']);
  assert.equal(roles.at(-1).hash, createHash('sha256').update(readFileSync(join(p.worktree, '.pace/team/probe-maker.md'))).digest('hex'));
  assert.deepEqual(h.models, [receipt.result.model]); assert.deepEqual(h.efforts, [receipt.result.effort]);
  assert.equal(h.observed_tool_calls.some((row) => row.role_read_candidate), true);
  assert.equal(h.observed_tool_calls.some((row) => row.bare_pace_candidate), false);
  assert.equal(h.observed_tool_calls.filter((row) => row.source_cli_candidate).every((row) => row.temporary_pace_home_in_input), true);

  assert.equal(receipt.result.effort, 'low');
  const actualEvents = readFileSync(join(p.worktree, 'projects', p.projectDir, 'log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(h.start_events, actualEvents.filter(row => row.type === 'start'));
  const calls = readFileSync(join(e, 'host-' + p.agent + '-orca-calls-current.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const launches = calls.filter(row => row.sourceArgs[1] === 'worker-start');
  assert.equal(launches.length, 1);
  const args = launches[0].sourceArgs;
  const arg = key => args[args.indexOf(key) + 1];
  assert.equal(arg('--model'), receipt.result.model); assert.equal(arg('--effort'), 'low');
  const lastRole = h.start_events.at(-1).role;
  assert.equal(lastRole.model, receipt.result.model); assert.equal(lastRole.effort, 'low');
  assert.equal(arg('--spec').includes(lastRole.definition), true);
  assert.equal(arg('--spec').includes(lastRole.hash), true);
  assert.equal(arg('--spec').includes('CRLF를 LF로'), true);

  const q = messages.filter((m) => m.type === 'question' && m.from_handle === `dispatch:${receipt.result.dispatchId}`);
  assert.equal(q.length, 2); assert.ok(q[0].body.includes(p.marker));
  assert.ok(q[1].body.includes(`HANDOFF: reviewer | marker=${p.marker}`));
  const replies = messages.filter((m) => m.type === 'status' && m.to_handle === `dispatch:${receipt.result.dispatchId}`);
  assert.equal(replies.length, 2);
  assert.equal(replies[0].body.trim(), readFileSync(join(e, 'host-outside-request.txt'), 'utf8').trim());
  assert.equal(replies[1].body.trim(), readFileSync(join(e, 'host-end-request.txt'), 'utf8').trim());
  assert.equal(messages.filter((m) => m.type === 'worker_done' && m.from_handle === receipt.result.terminal).length, 1);
  assert.equal(existsSync(join(resultDir, 'reviewer-signoff.md')), false);
  const env = { ...process.env };
  // Nested node --test must not inherit the parent's binary test protocol.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', 'score.test.ts'], { cwd: resultDir, encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stdout + result.stderr); assert.match(result.stdout, /tests [13]/); assert.match(result.stdout, /pass [13]/);
}
console.log('pass: two real host artifacts/tests, source-only markers, actual runtime models/effort, all 10 messages, handoffs/no signoff, settled outcomes and nondefault low effort');
