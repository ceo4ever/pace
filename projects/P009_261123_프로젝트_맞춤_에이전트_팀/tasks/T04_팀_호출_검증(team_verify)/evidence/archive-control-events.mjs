import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const e = import.meta.dirname, root = resolve(e, '../../../../..'), out = join(e, 'actual-hosts');
const target = join(out, 'claude-control-events-archive.json');
if (existsSync(target)) throw Error('Archive already exists');
const { hasSecret } = await import(join(root, 'src/project/secrets.ts'));
const original = readFileSync(join(out, 'claude-controls-session-proof.json'));
const packet = JSON.parse(original), sha = x => createHash('sha256').update(x).digest('hex');
const results = packet.results.map(entry => {
  const bytes = readFileSync(entry.session_source); assert.equal(sha(bytes), entry.session_sha256);
  const rows = bytes.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
  return { kind: entry.kind, session_sha256: entry.session_sha256, events: entry.observations.map(observation => {
    const item = rows[observation.line - 1].message.content.find(c => c.type === 'tool_result' && c.tool_use_id === observation.tool_use_id);
    const text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
    assert.equal(sha(text), observation.result_sha256); assert.equal(hasSecret(text), false); assert.ok(text.length <= 8192);
    assert.ok(observation.control || observation.is_error);
    return { ...observation, text };
  }) };
});
writeFileSync(target, JSON.stringify({ at: new Date().toISOString(), source_packet_sha256: sha(original), full_transcripts_copied: false, allowed_content: 'Only already-observed control-file Read results and denied target/role Read error results; no auth files or other transcript content', results }, null, 2) + '\n');
console.log('pass: bounded controlled tool-result excerpts archived; full sessions not copied');
