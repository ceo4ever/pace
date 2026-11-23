import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const repo = resolve(import.meta.dirname, '../../../../..');
const out = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dirname, '../evidence');
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'pace-p008-doc-negative-'));
try {
  mkdirSync(join(work, 'skills')); mkdirSync(join(work, 'test'));
  cpSync(join(repo, 'skills/pace-project-dev'), join(work, 'skills/pace-project-dev'), { recursive: true });
  cpSync(join(repo, 'test/project-dev-skill.test.ts'), join(work, 'test/project-dev-skill.test.ts'));
  cpSync(join(repo, 'package.json'), join(work, 'package.json'));
  const run = () => spawnSync(process.execPath, ['--test', '--test-name-pattern=반복 실패는 영향 분류', 'test/project-dev-skill.test.ts'], { cwd: work, encoding: 'utf8' });
  const good = run(); assert.equal(good.status, 0); assert.match(good.stdout, /tests 1\b/);
  writeFileSync(join(out, 'doc-negative-baseline.txt'), good.stdout + good.stderr);
  const file = join(work, 'skills/pace-project-dev/SKILL.md');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n진단 뒤에도 fail이면 사용자 결정\n');
  const bad = run(); assert.equal(bad.status, 1); assert.match(bad.stdout, /AssertionError/);
  writeFileSync(join(out, 'doc-negative-detected.txt'), bad.stdout + bad.stderr);
  console.log('stale unconditional user route detected');
} finally { rmSync(work, { recursive: true, force: true }); }
