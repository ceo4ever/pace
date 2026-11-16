import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tempDir, sessionFreeEnv, spawnTestChild as spawn } from './helpers.ts';

test('test helper isolates inherited product homes', () => {
  const outside = tempDir('pace-external-home-');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const script = `await import(${JSON.stringify(helper)}); console.log(JSON.stringify({pace:process.env.PACE_HOME}));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...sessionFreeEnv(), PACE_HOME: outside },
  });
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout) as { pace: string };
  assert.notEqual(result.pace, outside);
});

for (const mode of ['pass', 'fail', 'keep'] as const) {
  test(`temporary directory lifecycle: ${mode}`, () => {
    const parent = tempDir('pace-lifecycle-parent-');
    const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
    const script = `import { test } from 'node:test'; import { tempDir } from ${JSON.stringify(helper)}; const dir = tempDir(); console.log('PATH:' + dir); test('child', () => { ${mode === 'fail' ? "throw Error('intentional failure')" : ''} });`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: mode === 'keep' ? '1' : '' },
    });
    assert.equal(child.status, mode === 'fail' ? 1 : 0, child.stderr);
    const path = /PATH:(.+)/.exec(child.stdout)?.[1];
    assert.ok(path, child.stdout);
    assert.equal(existsSync(path), mode === 'keep');
  });
}

test('prefixes cannot escape the owned root', () => {
  for (const prefix of ['../escape-', 'pace-../../escape-', '/pace-outside-', 'pace-\\escape-']) {
    assert.throws(() => tempDir(prefix));
  }
});

test('a replaced root is not followed or deleted', () => {
  const parent = tempDir('pace-lifecycle-swap-');
  const external = tempDir('pace-lifecycle-external-');
  const sentinel = join(external, 'sentinel');
  writeFileSync(sentinel, 'safe');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const script = `import { test } from 'node:test'; import { renameSync, symlinkSync } from 'node:fs'; import { tempDir } from ${JSON.stringify(helper)};
    test('swap', () => { const root = process.env.TMPDIR; tempDir(); renameSync(root, root + '-original'); symlinkSync(${JSON.stringify(external)}, root, 'dir'); });`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: '' },
  });
  assert.equal(child.status, 1, child.stdout + child.stderr);
  assert.match(child.stdout + child.stderr, /refusing cleanup/);
  assert.equal(readFileSync(sentinel, 'utf8'), 'safe');
});


test('links inside an owned root do not delete their targets', () => {
  const parent = tempDir('pace-lifecycle-link-parent-');
  const external = tempDir('pace-lifecycle-link-target-');
  const sentinel = join(external, 'sentinel');
  writeFileSync(sentinel, 'safe');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const script = `import { test } from 'node:test'; import { symlinkSync } from 'node:fs'; import { join } from 'node:path'; import { tempDir } from ${JSON.stringify(helper)}; test('link', () => { symlinkSync(${JSON.stringify(external)}, join(tempDir(), 'link'), 'dir'); });`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: '' },
  });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.equal(readFileSync(sentinel, 'utf8'), 'safe');
});

test('one test process cannot clean another process root', () => {
  const parent = tempDir('pace-lifecycle-isolation-');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const script = `import { test } from 'node:test'; import { tempDir } from ${JSON.stringify(helper)}; const dir = tempDir(); console.log('PATH:' + dir); test('child', () => {});`;
  const run = (keep: string) => spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: keep },
  });
  const first = run('1');
  const path = /PATH:(.+)/.exec(first.stdout)?.[1];
  assert.equal(first.status, 0, first.stderr);
  assert.ok(path);
  const second = run('');
  assert.equal(second.status, 0, second.stderr);
  assert.ok(existsSync(path));
});


test('overlapping test processes keep their own roots', async () => {
  const parent = tempDir('pace-lifecycle-parallel-');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const env = { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: '' };
  const script = `import { test } from 'node:test'; import { tempDir } from ${JSON.stringify(helper)}; console.log('PATH:' + tempDir()); test('child', async () => { await new Promise(resolve => process.stdin.once('data', resolve)); });`;
  const first = spawn(process.execPath, ['--input-type=module', '-e', script], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  const completed = new Promise<number | null>((resolve, reject) => { first.once('error', reject); first.once('close', resolve); });
  const path = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { first.kill(); reject(new Error('child did not announce its root')); }, 5000);
    first.stdout.on('data', (chunk: Buffer) => {
      const match = /PATH:([^\r\n]+)/.exec(chunk.toString());
      if (match) { clearTimeout(timer); resolve(match[1]!); }
    });
    first.once('error', reject);
  });
  const second = spawnSync(process.execPath, ['--input-type=module', '-e', `import { test } from 'node:test'; import { tempDir } from ${JSON.stringify(helper)}; tempDir(); test('child', () => {});`], { env, encoding: 'utf8' });
  try {
    assert.equal(second.status, 0, second.stderr);
    assert.ok(existsSync(path));
  } finally { first.stdin.end('done'); }
  assert.equal(await completed, 0);
  assert.equal(existsSync(path), false);
});

test('a different directory substituted for the root is preserved', () => {
  const parent = tempDir('pace-lifecycle-replacement-');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const script = `import { test } from 'node:test'; import { mkdirSync, renameSync, writeFileSync } from 'node:fs'; import { join } from 'node:path'; import { tempDir } from ${JSON.stringify(helper)};
    test('replace', () => { const root = process.env.TMPDIR; tempDir(); renameSync(root, root + '-original'); mkdirSync(root); writeFileSync(join(root, 'sentinel'), 'safe'); console.log('REPLACED:' + root); });`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: '' },
  });
  assert.equal(child.status, 1, child.stdout + child.stderr);
  const replacement = /REPLACED:(.+)/.exec(child.stdout)?.[1];
  assert.ok(replacement);
  assert.equal(readFileSync(join(replacement, 'sentinel'), 'utf8'), 'safe');
});

test('a surviving child owns its temporary root independently of its parent', async () => {
  const control = tempDir('pace-lifecycle-detached-control-');
  const ready = join(control, 'ready');
  const release = join(control, 'release');
  const finished = join(control, 'finished');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const childScript = `import { existsSync, writeFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { tempDir } from ${JSON.stringify(helper)};
    const dir = tempDir(); const root = dirname(dir); writeFileSync(join(dir, 'sentinel'), 'safe'); writeFileSync(${JSON.stringify(ready)}, dir);
    process.once('exit', () => writeFileSync(${JSON.stringify(finished)}, String(existsSync(root))));
    const interval = setInterval(() => { if (existsSync(${JSON.stringify(release)})) clearInterval(interval); }, 20);`;
  const parentScript = `import { existsSync } from 'node:fs'; import { spawn } from 'node:child_process'; import { tempDir } from ${JSON.stringify(helper)};
    tempDir(); const child = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(childScript)}], { detached: true, stdio: 'ignore' }); child.unref();
    const interval = setInterval(() => { if (existsSync(${JSON.stringify(ready)})) clearInterval(interval); }, 20);`;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', parentScript], {
    env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_KEEP_TEST_TMP: '' }, stdio: 'ignore',
  });
  const status = await new Promise<number | null>((resolve, reject) => { parent.once('error', reject); parent.once('close', resolve); });
  assert.equal(status, 0);
  const dir = readFileSync(ready, 'utf8');
  const sentinel = join(dir, 'sentinel');
  const observed = existsSync(sentinel) ? readFileSync(sentinel, 'utf8') : undefined;
  writeFileSync(release, 'done');
  const deadline = Date.now() + 10000;
  while (!existsSync(finished) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(existsSync(finished), 'detached child did not finish');
  assert.equal(observed, 'safe');
  assert.equal(readFileSync(finished, 'utf8'), 'false');
  assert.equal(existsSync(dir), false);
});


test('dashboard diagnostic files survive an explicit keep run', () => {
  const parent = tempDir('pace-lifecycle-dashboard-keep-');
  const child = spawnSync(process.execPath, ['--test', '--test-name-pattern=dashboard snapshot collects allowed documents', join(import.meta.dirname, 'backlog-dashboard.test.ts')], {
    encoding: 'utf8', env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: '1' },
  });
  assert.equal(child.status, 0, child.stdout + child.stderr);
  assert.match(child.stdout, /pass 1/);
  const root = readdirSync(parent).find(name => name.startsWith('pace-test-run-'));
  assert.ok(root);
  const dashboard = readdirSync(join(parent, root)).find(name => name.startsWith('pace-dashboard-'));
  assert.ok(dashboard);
  assert.ok(existsSync(join(parent, root, dashboard, 'backlogs/BL1/BACKLOG.md')));
});

test('a surviving ordinary child keeps inherited temporary files until it exits', async () => {
  const control = tempDir('pace-lifecycle-ordinary-control-');
  const ready = join(control, 'ready');
  const release = join(control, 'release');
  const finished = join(control, 'finished');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const childScript = `import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
    const dir = mkdtempSync(join(tmpdir(), 'pace-child-')); writeFileSync(join(dir, 'sentinel'), 'safe'); writeFileSync(${JSON.stringify(ready)}, dir);
    const interval = setInterval(() => { if (existsSync(${JSON.stringify(release)})) { clearInterval(interval); rmSync(dir, { recursive: true, force: true }); writeFileSync(${JSON.stringify(finished)}, 'done'); } }, 20);`;
  const parentScript = `import { existsSync } from 'node:fs'; import { spawn } from 'node:child_process'; import { tempDir, registerTestChild } from ${JSON.stringify(helper)};
    tempDir(); const child = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(childScript)}], { detached: true, stdio: 'ignore' }); child.unref(); registerTestChild(child);
    const interval = setInterval(() => { if (existsSync(${JSON.stringify(ready)})) clearInterval(interval); }, 20);`;
  const parent = spawn(process.execPath, ['--input-type=module', '-e', parentScript], {
    env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_KEEP_TEST_TMP: '' }, stdio: 'ignore',
  });
  const closed = new Promise<number | null>((resolve, reject) => { parent.once('error', reject); parent.once('close', resolve); });
  const readyDeadline = Date.now() + 10000;
  while (!existsSync(ready) && Date.now() < readyDeadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(existsSync(ready), 'ordinary child did not start');
  const parentWasAlive = parent.exitCode === null;
  const dir = readFileSync(ready, 'utf8');
  const sentinel = join(dir, 'sentinel');
  const observed = existsSync(sentinel) ? readFileSync(sentinel, 'utf8') : undefined;
  writeFileSync(release, 'done');
  const deadline = Date.now() + 10000;
  while (!existsSync(finished) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(existsSync(finished));
  assert.equal(await closed, 0);
  assert.ok(parentWasAlive, 'parent exited before its registered child');
  assert.equal(observed, 'safe');
  assert.equal(existsSync(dir), false);
});

test('a timed out registered child leaves its temporary root intact', async () => {
  const parent = tempDir('pace-lifecycle-timeout-');
  const ready = join(parent, 'ready');
  const finished = join(parent, 'finished');
  const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
  const childScript = `import { writeFileSync } from 'node:fs'; setTimeout(() => writeFileSync(${JSON.stringify(finished)}, 'done'), 500);`;
  const parentScript = `import { writeFileSync } from 'node:fs'; import { spawn } from 'node:child_process'; import { tempDir, registerTestChild } from ${JSON.stringify(helper)};
    const dir = tempDir(); writeFileSync(${JSON.stringify(ready)}, dir); const child = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(childScript)}], { detached: true, stdio: 'ignore' }); child.unref(); registerTestChild(child, 100);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', parentScript], {
    encoding: 'utf8', env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: '' },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /preserving the temporary root/);
  const dir = readFileSync(ready, 'utf8');
  assert.ok(existsSync(dir));
  const deadline = Date.now() + 10000;
  while (!existsSync(finished) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(existsSync(finished), 'test child did not exit');
  assert.ok(existsSync(dir));
});

for (const mode of ['evaluation exception', 'explicit exit'] as const) {
  test(`active registered child is protected on ${mode}`, async () => {
    const parent = tempDir('pace-lifecycle-abrupt-');
    const ready = join(parent, 'ready');
    const release = join(parent, 'release');
    const finished = join(parent, 'finished');
    const fixture = join(parent, 'fixture.test.mjs');
    const helper = pathToFileURL(join(import.meta.dirname, 'helpers.ts')).href;
    const childScript = `import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
      const dir = mkdtempSync(join(tmpdir(), 'pace-child-')); const sentinel = join(dir, 'sentinel'); writeFileSync(sentinel, 'safe'); writeFileSync(${JSON.stringify(ready)}, dir);
      const interval = setInterval(() => { if (existsSync(${JSON.stringify(release)})) { clearInterval(interval); writeFileSync(${JSON.stringify(finished)}, String(existsSync(sentinel))); } }, 20);`;
    const ending = mode === 'evaluation exception' ? "throw new Error('intentional evaluation failure');" : 'process.exit(0);';
    writeFileSync(fixture, `import { existsSync } from 'node:fs'; import { spawn } from 'node:child_process'; import { tempDir, registerTestChild } from ${JSON.stringify(helper)};
      tempDir(); const child = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(childScript)}], { detached: true, stdio: 'ignore' }); child.unref(); registerTestChild(child, 5000);
      while (!existsSync(${JSON.stringify(ready)})) await new Promise(resolve => setTimeout(resolve, 20)); ${ending}`);
    const result = spawnSync(process.execPath, ['--test', fixture], {
      encoding: 'utf8', timeout: 10000, env: { ...sessionFreeEnv(), NODE_TEST_CONTEXT: undefined, PACE_TEST_TMP_OWNER: undefined, PACE_TEST_TMP_PARENT: undefined, TMPDIR: parent, TMP: parent, TEMP: parent, PACE_KEEP_TEST_TMP: '' },
    });
    assert.ok(existsSync(ready), result.stdout + result.stderr);
    const dir = readFileSync(ready, 'utf8');
    const sentinel = join(dir, 'sentinel');
    const observed = existsSync(sentinel) ? readFileSync(sentinel, 'utf8') : undefined;
    writeFileSync(release, 'done');
    const deadline = Date.now() + 10000;
    while (!existsSync(finished) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(existsSync(finished), 'detached child did not finish');
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.equal(observed, 'safe');
    assert.equal(readFileSync(finished, 'utf8'), 'true');
    assert.match(result.stdout + result.stderr, /active test child.*preserving/i);
  });
}
