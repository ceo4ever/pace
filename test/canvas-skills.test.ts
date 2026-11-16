import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tempDir } from './helpers.ts';
import { install, uninstall } from '../src/setup/install.ts';

const bundleRoot = resolve('skills/pace-canvas-skills');
const manifest = JSON.parse(readFileSync(join(bundleRoot, 'manifest.json'), 'utf8')) as { skillsVersion: string; skills: Record<string, { description: string }>; files: Record<string, string> };
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hash = (p: string) => sha(readFileSync(p));
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

const READ = 'console.log(1)\n';
const INDEX = 'export {}\n';

/** 가짜 묶음: 두 하위 스킬 + runtime + manifest(해시 포함)와 일반 스킬 하나. */
function fakeRepo(): string {
  const repo = tempDir('pace-bundle-repo-');
  const bundle = join(repo, 'skills/pace-canvas-skills');
  const files: Record<string, string> = {
    'canvas-read/SKILL.md': '---\nname: canvas-read\n---\n읽기\n',
    'canvas-read/tools/read.mjs': READ,
    'canvas-wireframe/SKILL.md': '---\nname: canvas-wireframe\n---\n와이어프레임\n',
    'runtime/app/index.js': INDEX,
  };
  const hashes: Record<string, string> = {};
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(bundle, file, '..'), { recursive: true });
    writeFileSync(join(bundle, file), text);
    hashes[file] = sha(text);
  }
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify({ format: 'canvas-skills', skillsVersion: '9.9.9', skills: { 'canvas-read': { description: '읽기: 설명 "따옴표" — 대시' }, 'canvas-wireframe': { description: '와이어프레임' } }, files: hashes }));
  mkdirSync(join(repo, 'skills/plain'), { recursive: true });
  writeFileSync(join(repo, 'skills/plain/SKILL.md'), '---\nname: plain\ndescription: x\n---\n');
  return repo;
}

test('저장소 묶음은 manifest(2.0.1)와 파일 목록·해시가 정확히 같다', () => {
  assert.equal(manifest.skillsVersion, '2.0.1');
  const actual = walk(bundleRoot).map((p) => relative(bundleRoot, p).split(sep).join('/')).filter((f) => f !== 'manifest.json').sort();
  assert.deepEqual(actual, Object.keys(manifest.files).sort());
  for (const [file, h] of Object.entries(manifest.files)) assert.equal(hash(join(bundleRoot, file)), h, file);
  assert.deepEqual(Object.keys(manifest.skills).sort(), ['canvas-read', 'canvas-wireframe']);
  assert.ok(!existsSync(resolve('skills/canvas-skills')));
  assert.equal((manifest as { format?: string }).format, 'canvas-skills');
});

test('설치: app에 묶음 통째, 도구 폴더에는 두 입구만 — 정본 경로를 가리키고 본문은 복제하지 않는다', () => {
  const home = tempDir('pace-bundle-home-');
  mkdirSync(join(home, '.claude'), { recursive: true });
  install({ home, repo: resolve('.') });
  const appBundle = join(home, '.pace/app/skills/pace-canvas-skills');
  for (const [file, h] of Object.entries(manifest.files)) assert.equal(hash(join(appBundle, file)), h, file);
  assert.ok(existsSync(join(appBundle, 'manifest.json')));
  const output = execFileSync(process.execPath, [join(appBundle, 'canvas-read/tools/read.mjs'), join(appBundle, 'document/examples/minimal.canvas.json'), 'toc', '--json'], { encoding: 'utf8' });
  assert.ok(JSON.parse(output).pages > 0);
  for (const root of [join(home, '.agents/skills'), join(home, '.claude/skills')]) {
    assert.ok(!existsSync(join(root, 'pace-canvas-skills')), '묶음 폴더는 도구 폴더에 올리지 않는다');
    for (const [name, info] of Object.entries(manifest.skills)) {
      const text = readFileSync(join(root, name, 'SKILL.md'), 'utf8');
      assert.ok(text.startsWith(`---\nname: ${name}\ndescription: ${JSON.stringify(info.description)}\n---\n`));
      assert.ok(text.includes(join(appBundle, name, 'SKILL.md')));
      assert.ok(text.includes(join(appBundle, name, 'tools')));
      assert.ok(text.length < 1500, '입구는 얇다');
      assert.deepEqual(readdirSync(join(root, name)).sort(), ['.pace-managed', 'SKILL.md']);
    }
  }
});

test('옛 묶음 설치를 새 이름으로 전환하고 사용자 스킬은 제거까지 보존한다', () => {
  const repo = fakeRepo();
  const home = tempDir('pace-bundle-rename-');
  const next = join(repo, 'skills/pace-canvas-skills');
  const old = join(repo, 'skills/canvas-skills');
  renameSync(next, old);
  install({ home, repo });
  const skills = join(home, '.agents/skills');
  const entrance = join(skills, 'canvas-read/SKILL.md');
  assert.ok(readFileSync(entrance, 'utf8').includes(join(home, '.pace/app/skills/canvas-skills')));
  mkdirSync(join(skills, 'user-skill'), { recursive: true });
  writeFileSync(join(skills, 'user-skill/SKILL.md'), 'user content');
  renameSync(old, next);
  const before = readFileSync(entrance, 'utf8');
  const actions = install({ home, repo, dryRun: true });
  assert.ok(existsSync(join(home, '.pace/app/skills/canvas-skills')));
  assert.ok(!existsSync(join(home, '.pace/app/skills/pace-canvas-skills')));
  assert.equal(readFileSync(entrance, 'utf8'), before);
  assert.ok(actions.some((action) => action.kind === 'copy'));
  install({ home, repo });
  assert.ok(!existsSync(join(home, '.pace/app/skills/canvas-skills')));
  assert.ok(readFileSync(entrance, 'utf8').includes(join(home, '.pace/app/skills/pace-canvas-skills')));
  assert.ok(!install({ home, repo }).some((a) => a.kind === 'copy'));
  uninstall({ home, repo });
  assert.ok(!existsSync(entrance));
  assert.equal(readFileSync(join(skills, 'user-skill/SKILL.md'), 'utf8'), 'user content');
});

test('묶음 manifest의 누락·손상·형식 변경과 중복 스킬은 설치 전 거부한다', () => {
  const repo = fakeRepo();
  const home = tempDir('pace-bundle-manifest-');
  install({ home, repo });
  const file = join(repo, 'skills/pace-canvas-skills/manifest.json');
  const original = readFileSync(file, 'utf8');
  for (const value of [null, '{', JSON.stringify({ format: 'unknown' })]) {
    if (value === null) rmSync(file); else writeFileSync(file, value);
    assert.throws(() => install({ home, repo }), /manifest/);
    assert.ok(existsSync(join(home, '.pace/app/skills/pace-canvas-skills/manifest.json')));
    writeFileSync(file, original);
  }
  const rootSkill = join(repo, 'skills/pace-canvas-skills/SKILL.md');
  writeFileSync(rootSkill, 'unexpected');
  assert.throws(() => install({ home, repo }), /루트 SKILL/);
  assert.ok(existsSync(join(home, '.pace/app/skills/pace-canvas-skills/manifest.json')));
  rmSync(rootSkill);
  renameSync(join(repo, 'skills/pace-canvas-skills'), join(repo, 'skills/other-bundle'));
  const otherRootSkill = join(repo, 'skills/other-bundle/SKILL.md');
  writeFileSync(otherRootSkill, 'unexpected');
  assert.throws(() => install({ home, repo }), /루트 SKILL/);
  rmSync(otherRootSkill);
  renameSync(join(repo, 'skills/other-bundle'), join(repo, 'skills/pace-canvas-skills'));
  renameSync(join(repo, 'skills/pace-canvas-skills'), join(repo, 'skills/canvas-skills'));
  const second = fakeRepo();
  cpSync(join(second, 'skills/pace-canvas-skills'), join(repo, 'skills/pace-canvas-skills'), { recursive: true });
  assert.throws(() => install({ home, repo }), /중복/);
});

test('중단된 app 교체의 이전 설치본을 보존하고 수동 복구를 요구한다', () => {
  const repo = fakeRepo();
  const home = tempDir('pace-bundle-recovery-');
  install({ home, repo });
  const app = join(home, '.pace/app');
  renameSync(app, `${app}.old`);
  assert.throws(() => install({ home, repo }), /임시 폴더/);
  assert.ok(existsSync(join(`${app}.old`, 'skills/pace-canvas-skills/manifest.json')));
});

test('app 교체 실패는 이전 설치본을 복원하고 교체 후 정리 실패는 입구 갱신을 계속한다', () => {
  const repo = fakeRepo();
  const home = tempDir('pace-bundle-rename-fail-');
  install({ home, repo });
  writeFileSync(join(repo, 'skills/plain/SKILL.md'), 'changed');
  const moduleUrl = pathToFileURL(resolve('src/setup/install.ts')).href;
  const script = `
    import fs from 'node:fs';
    import path from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';
    import assert from 'node:assert/strict';
    const [repo, home, url] = process.argv.slice(1);
    const { install } = await import(url);
    const app = path.join(home, '.pace', 'app');
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => { if (String(from) === app + '.new') throw new Error('injected rename'); return rename(from, to); };
    syncBuiltinESMExports();
    assert.throws(() => install({home, repo}), /injected rename/);
    assert.ok(fs.existsSync(app + '/skills/pace-canvas-skills/manifest.json'));
    fs.renameSync = rename;
    assert.ok(fs.existsSync(app + '.new'), '실패한 임시본은 보존한다');
    fs.rmSync(app + '.new', { recursive: true });
    const remove = fs.rmSync;
    fs.rmSync = (path, options) => { if (String(path) === app + '.old') throw new Error('injected cleanup'); return remove(path, options); };
    syncBuiltinESMExports();
    const actions = install({home, repo});
    assert.ok(actions.some(a => a.kind === 'skip' && a.path === app + '.old'));
    assert.ok(fs.readFileSync(home + '/.agents/skills/plain/SKILL.md', 'utf8').includes('changed'));
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', script, repo, home.replaceAll('\\', '/'), moduleUrl]);
});

test('재설치: 바뀐 것이 없으면 복사하지 않고, 묶음이 바뀌면 app을 통째 교체해 낡은 파일이 남지 않는다', () => {
  const repo = fakeRepo();
  const home = tempDir('pace-bundle-reinstall-');
  install({ home, repo });
  assert.ok(!install({ home, repo }).some((a) => a.kind === 'copy'), '변경 없음');
  const bundle = join(repo, 'skills/pace-canvas-skills');
  const m = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'));
  rmSync(join(bundle, 'runtime/app/index.js'));
  delete m.files['runtime/app/index.js'];
  writeFileSync(join(bundle, 'canvas-read/tools/read.mjs'), 'console.log(2)\n');
  m.files['canvas-read/tools/read.mjs'] = sha('console.log(2)\n');
  writeFileSync(join(bundle, 'manifest.json'), JSON.stringify(m));
  install({ home, repo });
  const app = join(home, '.pace/app/skills/pace-canvas-skills');
  assert.ok(!existsSync(join(app, 'runtime/app/index.js')));
  assert.equal(readFileSync(join(app, 'canvas-read/tools/read.mjs'), 'utf8'), 'console.log(2)\n');
});

test('manifest와 다른 묶음(바뀐·남는·빠진 파일)은 아무것도 바꾸기 전에 설치를 거부해 기존 설치를 지킨다', () => {
  const repo = fakeRepo();
  const home = tempDir('pace-bundle-tamper-');
  install({ home, repo });
  const appFile = join(home, '.pace/app/skills/pace-canvas-skills/canvas-read/tools/read.mjs');
  const entrance = join(home, '.agents/skills/canvas-read/SKILL.md');
  const entranceBefore = readFileSync(entrance, 'utf8');
  const bundle = join(repo, 'skills/pace-canvas-skills');
  const cases: [() => void, () => void][] = [
    [() => writeFileSync(join(bundle, 'canvas-read/tools/read.mjs'), 'process.exit(9)\n'), () => writeFileSync(join(bundle, 'canvas-read/tools/read.mjs'), READ)],
    [() => writeFileSync(join(bundle, 'extra.mjs'), 'x\n'), () => rmSync(join(bundle, 'extra.mjs'))],
    [() => rmSync(join(bundle, 'runtime/app/index.js')), () => writeFileSync(join(bundle, 'runtime/app/index.js'), INDEX)],
  ];
  for (const [mutate, restore] of cases) {
    mutate();
    assert.throws(() => install({ home, repo }), /manifest와 다르다/);
    assert.equal(readFileSync(appFile, 'utf8'), READ);
    assert.equal(readFileSync(entrance, 'utf8'), entranceBefore);
    restore();
  }
  install({ home, repo });
});

test('병존: 다른 도구 스킬과 같은 이름의 사용자 스킬도 원래 위치에 보존한다', () => {
  const repo = fakeRepo();
  const home = tempDir('pace-bundle-migrate-');
  const skills = join(home, '.agents/skills');
  mkdirSync(join(skills, 'other-canvas/references'), { recursive: true });
  writeFileSync(join(skills, 'other-canvas/.other-managed'), 'x');
  writeFileSync(join(skills, 'other-canvas/SKILL.md'), 'old');
  mkdirSync(join(skills, 'my-canvas'), { recursive: true });
  writeFileSync(join(skills, 'my-canvas/SKILL.md'), 'mine');
  mkdirSync(join(skills, 'canvas-read'), { recursive: true });
  writeFileSync(join(skills, 'canvas-read/SKILL.md'), 'user-made');
  install({ home, repo });
  assert.equal(readFileSync(join(skills, 'other-canvas/SKILL.md'), 'utf8'), 'old');
  assert.equal(readFileSync(join(skills, 'my-canvas/SKILL.md'), 'utf8'), 'mine');
  assert.equal(readFileSync(join(skills, 'canvas-read/SKILL.md'), 'utf8'), 'user-made');
});
