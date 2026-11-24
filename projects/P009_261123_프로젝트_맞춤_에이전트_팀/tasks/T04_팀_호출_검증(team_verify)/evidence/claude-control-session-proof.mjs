import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const e = import.meta.dirname, out = join(e, 'actual-hosts');
const sources = {
  unloaded: '/Users/lucas/.claude/projects/-private-var-folders-0k-n9rvmztx6xs3xvjsvf0qqzdw0000gn-T-pace-P009-T04-actual-CPd7Zv-claude-unloaded/24e40d15-49ca-42ea-9edc-2bf3da1ef745.jsonl',
  'read-denied': '/Users/lucas/.claude/projects/-private-var-folders-0k-n9rvmztx6xs3xvjsvf0qqzdw0000gn-T-pace-P009-T04-actual-CPd7Zv-claude-read-denied/dcef1eb7-92aa-485a-a2c0-57f0100ef19b.jsonl',
};
const results = [];
for (const [kind, source] of Object.entries(sources)) {
  const evidence = JSON.parse(readFileSync(join(out, `${kind}-claude.json`), 'utf8'));
  const bytes = readFileSync(source), rows = bytes.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
  if (!rows.some(r => r.cwd === evidence.cwd)) throw Error('Controlled session cwd mismatch');
  const tools = new Map(), observations = [];
  rows.forEach((r, index) => {
    for (const item of Array.isArray(r.message?.content) ? r.message.content : []) {
      if (item.type === 'tool_use') tools.set(item.id, { file: item.input?.file_path ?? '', tool: item.name });
      if (item.type === 'tool_result') {
        const target = tools.get(item.tool_use_id); if (!target || target.tool !== 'Read') continue;
        const text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
        const control = target.file.endsWith('/control-read.txt'), denied = target.file.endsWith('/denied-sentinel.txt'), role = target.file.includes('.pace/team/');
        observations.push({ line: index + 1, tool_use_id: item.tool_use_id, control, denied, role, is_error: item.is_error === true, control_value_observed: control && text.includes(evidence.control_value), result_sha256: createHash('sha256').update(text).digest('hex') });
      }
    }
  });
  const valid = observations.some(r => r.control && r.control_value_observed && !r.is_error) && observations.some(r => r.denied && r.is_error);
  results.push({ kind, session_source: source, session_sha256: createHash('sha256').update(bytes).digest('hex'), cwd: evidence.cwd, observations, same_session_control_read_and_denied_error: valid, original_capture: `${kind}-claude.json`, limitation: 'Allowlisted tool-result metadata only; original transcript is not copied. The old English-only collector flag stays false; these actual session error flags supply the missing evidence.' });
}
writeFileSync(join(out, 'claude-controls-session-proof.json'), JSON.stringify({ at: new Date().toISOString(), added_live_calls: 0, results }, null, 2) + '\n');
console.log(JSON.stringify(results.map(r => ({ kind: r.kind, valid: r.same_session_control_read_and_denied_error, observations: r.observations }))));
if (results.some(r => !r.same_session_control_read_and_denied_error)) process.exitCode = 1;
