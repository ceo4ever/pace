import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const e = import.meta.dirname, source = resolve(e, '../../../../..');
const probes = JSON.parse(readFileSync(join(e, 'host-probes.json'), 'utf8'));
const transcripts = {
  claude: '/Users/lucas/.claude/projects/-private-var-folders-0k-n9rvmztx6xs3xvjsvf0qqzdw0000gn-T-pace-P009-T03-claude-aosfGN-app-wt-P001/49ab03dd-68ae-4714-8a63-de06bd48db20.jsonl',
  codex: '/Users/lucas/.codex/sessions/2026/11/24/rollout-2026-11-24T08-54-16-01a20ad4-ef08-7e90-b91f-0fa4d4892bc0.jsonl',
};
const sha = (value) => createHash('sha256').update(value).digest('hex');
const inbox = JSON.parse(readFileSync('/tmp/pace-P009-T03-inbox-final.json', 'utf8')).result.messages;
const identities = [], hosts = [];
for (const p of probes) {
  const receipt = JSON.parse(readFileSync(join(e, `host-${p.agent}-orca-worker-start-retry1.json`), 'utf8')).result;
  identities.push(receipt.dispatchId, receipt.taskId, receipt.terminal);
  copyFileSync(`/tmp/pace-P009-T03-${p.agent}-worker-final.json`, join(e, `host-${p.agent}-settled.json`));
  const bytes = readFileSync(transcripts[p.agent]), records = bytes.toString('utf8').split('\n').filter(Boolean).map((text) => JSON.parse(text));
  if (p.agent === 'codex' && !records.some((r) => r.type === 'session_meta' && r.payload?.cwd === p.worktree)) throw Error('Codex session cwd mismatch');
  if (p.agent === 'claude' && !records.some((r) => r.cwd === p.worktree)) throw Error('Claude session cwd mismatch');
  const metadata = [], calls = [];
  records.forEach((r, index) => {
    const line = index + 1;
    if (p.agent === 'codex' && r.type === 'turn_context') metadata.push({ line, field: 'turn_context', model: r.payload?.model, effort: r.payload?.effort ?? r.payload?.reasoning_effort });
    if (p.agent === 'claude' && r.message?.model) metadata.push({ line, field: 'message.model', model: r.message.model });
    function walk(value, path = '') {
      if (!value || typeof value !== 'object') return;
      if (value.output_config?.effort) metadata.push({ line, field: `${path ? path + '.' : ''}output_config.effort`, effort: value.output_config.effort });
      if (value.type === 'tool_use' || value.type === 'function_call' || value.type === 'custom_tool_call') {
        const text = typeof value.arguments === 'string' ? value.arguments : JSON.stringify(value.input ?? value.arguments ?? '');
        const roleRead = text.includes('.pace/team/probe-maker.md');
        const sourceCli = text.includes(p.source_cli);
        const barePace = /(?:^|[;&|\n])\s*pace\s+(?:project|memory|brain|team|worker)\b/.test(text);
        calls.push({ line, tool: value.name, input_sha256: sha(text), role_read_candidate: roleRead, source_cli_candidate: sourceCli, temporary_pace_home_in_input: text.includes(p.home), bare_pace_candidate: barePace });
      }
      for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') walk(child, path ? `${path}.${key}` : key);
    }
    walk(r);
  });
  const project = join(p.worktree, 'projects', p.projectDir);
  const events = readFileSync(join(project, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  writeFileSync(join(e, `host-${p.agent}-project-events.json`), JSON.stringify(events, null, 2) + '\n');
  const result = JSON.parse(readFileSync(join(p.worktree, 'probe-result.json'), 'utf8'));
  const roleText = readFileSync(join(p.worktree, '.pace/team/probe-maker.md'));
  hosts.push({ agent: p.agent, dispatch: receipt.dispatchId, session_source: transcripts[p.agent], session_sha256: sha(bytes), role_source_sha256: sha(roleText), marker: p.marker, marker_in_result: result.marker === p.marker, role_in_result: result.role === p.role, signoff_exists: existsSync(join(p.worktree, 'reviewer-signoff.md')), models: [...new Set(metadata.map((r) => r.model).filter(Boolean))], efforts: [...new Set(metadata.map((r) => r.effort).filter(Boolean))], metadata, observed_tool_calls: calls, start_events: events.filter((r) => r.type === 'start'), completion: JSON.parse(readFileSync(join(e, `host-${p.agent}-settled.json`), 'utf8')).result.worker.state });
}
const related = inbox.filter((m) => [m.from_handle, m.to_handle, JSON.stringify(m.payload)].some((value) => identities.some((id) => String(value).includes(id))));
writeFileSync(join(e, 'host-messages.json'), JSON.stringify(related.sort((a, b) => a.sequence - b.sequence), null, 2) + '\n');
const before = JSON.parse(readFileSync(join(e, 'protected-pace-before.json'), 'utf8'));
const after = JSON.parse(readFileSync(join(e, 'protected-pace-after.json'), 'utf8'));
const snapshot = JSON.parse(readFileSync(join(e, 'host-probe-source-snapshot-retry1.json'), 'utf8'));
const unchanged = Object.entries(snapshot).every(([path, hash]) => sha(readFileSync(join(source, path))) === hash);
writeFileSync(join(e, 'host-observations.json'), JSON.stringify({ hosts, source_unchanged_after_live_probe: unchanged, protected_pace_known_metadata_unchanged: before.metadata_sha256 === after.metadata_sha256, recorded_probe_messages: related.length, preflight_failures_without_worker: ['Initial per-host routing adapter used ORCA_ENVIRONMENT=local, which run-current rejected before worker-start. Preserved in unsuffixed start results/calls. Retry adapter queries the explicitly assigned parent Run with real run-show and adds local/from/run routing; it never changes role spec/model/effort.'], launched_worker_attempts: 2, normal_work_and_handoff: 'Two medium-tier makers; one controlled example per host, no general productivity or permission-enforcement claim.', manual_role_reinstructions: 0, required_correction_moments: 0, counting_basis: 'All five mail messages per host (first work ask, outside request, handoff ask, end request, done), source-only markers, actual files/tests, no signoff; no missing attempt excluded. Initial preflight errors had no worker or host session.', limitations: ['Local/supervision routing adapter is explicit in call receipts; code under test is source project start --role.', 'Role is prompt guidance, toolsPermissionApplied=false; no sandbox claim.', 'Tool-call inputs are classified with line numbers and SHA only, not copied; metadata is an allowlisted extraction from the two cwd-matched controlled sessions.', 'Known protected PACE metadata subset unchanged; not a full-home content audit or attribution of concurrent changes.', 'One positive case per host. Missing/deleted role behavior and ongoing real-repository effects remain T04/T08.'] }, null, 2) + '\n');
console.log(JSON.stringify(hosts.map(({agent, models, efforts, completion}) => ({agent, models, efforts, completion}))));
