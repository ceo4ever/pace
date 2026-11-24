import { existsSync, lstatSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw Error('metadata label required');
const output = join(import.meta.dirname, `protected-pace-${label}.json`);
if (existsSync(output)) throw Error('기존 관측을 덮어쓰지 않는다');
const root = process.env.PACE_HOME || join(homedir(), '.pace'), rows = [];
function scan(rel) {
  const path = join(root, rel);
  if (!existsSync(path)) return;
  const s = lstatSync(path);
  rows.push([rel, s.mode, s.size, s.mtimeMs]);
  if (s.isDirectory() && !s.isSymbolicLink()) for (const name of readdirSync(path).sort()) scan(join(rel, name));
}
for (const path of ['worker-settings.json', 'worker-tiers.json', 'install.json', 'projects', 'profiles/default/memory']) scan(path);
writeFileSync(output, JSON.stringify({ root, at: new Date().toISOString(), entries: rows.length, metadata_sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), scope: 'Known PACE settings/registry/default-profile memory metadata only; no file contents, authentication files or session transcripts read. Concurrent changes cannot be attributed to probes from this hash alone.' }, null, 2) + '\n');
