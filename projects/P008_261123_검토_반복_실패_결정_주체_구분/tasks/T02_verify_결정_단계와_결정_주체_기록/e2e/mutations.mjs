import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const repo = resolve(import.meta.dirname, '../../../../..');
const evidence = resolve(import.meta.dirname, '../evidence');
const work = mkdtempSync(join(tmpdir(), 'pace-p008-mutation-'));
try {
  cpSync(join(repo, 'src'), join(work, 'src'), { recursive: true });
  mkdirSync(join(work, 'test'));
  for (const file of ['test/helpers.ts', 'test/agent-review-log.test.ts', 'package.json']) cpSync(join(repo, file), join(work, file));
  const log = join(work, 'src/agent/review-log.ts'), cli = join(work, 'src/agent/verify-cli.ts');
  const originalLog = readFileSync(log, 'utf8'), originalCli = readFileSync(cli, 'utf8');
  const run = name => {
    const r = spawnSync(process.execPath, ['--test', '--test-name-pattern=결정 주체 pm/user', 'test/agent-review-log.test.ts'], { cwd: work, env: { ...process.env, PACE_HOME: join(work, 'home') }, encoding: 'utf8' });
    writeFileSync(join(evidence, `mutation-${name}.txt`), `status=${r.status}\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /tests 1\b/);
    return r;
  };
  assert.equal(run('baseline').status, 0);
  const mutants = [
    ['legacy-as-user', log, "last.by ?? 'unknown'", "last.by ?? 'user'"],
    ['legacy-rejected', log, "v.by === undefined || v.by === 'pm' || v.by === 'user'", "v.by === 'pm' || v.by === 'user'"],
    ['missing-by-default', cli, 'const by = req(values.by, REVIEW_NOTE_USAGE);', "const by = values.by ?? 'user';"],
    ['actor-not-stored', cli, 'target: name, by, choice', 'target: name, choice'],
  ];
  for (const [name, file, before, after] of mutants) {
    writeFileSync(log, originalLog); writeFileSync(cli, originalCli);
    const source = readFileSync(file, 'utf8'); assert.ok(source.includes(before));
    writeFileSync(file, source.replace(before, after));
    const r = run(name);
    assert.equal(r.status, 1); assert.match(r.stdout, /AssertionError|검토 원장이 손상/);
    console.log(`${name}: detected`);
  }
} finally { rmSync(work, { recursive: true, force: true }); }
