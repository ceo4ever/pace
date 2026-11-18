import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { install, uninstall } from '../src/setup/install.ts';
import { packageRoot } from '../src/core/paths.ts';
import { sessionFreeEnv, tempDir } from './helpers.ts';

test('Windows 설치는 Git Bash 래퍼를 만들고 재설치와 제거에서 관리한다', () => {
  const home = join(tempDir(), "한글 space '$&()"); mkdirSync(home);
  const options = { home, repo: packageRoot, platform: 'win32' as const };
  const wrapper = join(home, '.pace', 'bin', 'pace');
  assert.ok(install({ ...options, dryRun: true }).some(a => a.path === wrapper && a.kind === 'write'));
  assert.equal(existsSync(wrapper), false);
  install(options);
  assert.ok(existsSync(wrapper), '확장자 없는 래퍼가 있어야 한다');
  const before = readFileSync(wrapper, 'utf8');
  assert.match(before, /^#!\/bin\/sh\n/);
  assert.doesNotMatch(before, /\r/);
  install(options);
  assert.equal(readFileSync(wrapper, 'utf8'), before);
  uninstall(options);
  assert.equal(existsSync(wrapper), false);
});

test('Windows 관리 래퍼 재설치와 dry-run, 사용자 충돌 보존', () => {
  const home = tempDir(), options = { home, repo: packageRoot, platform: 'win32' as const };
  const wrapper = join(home, '.pace', 'bin', 'pace');
  install(options);
  const current = readFileSync(wrapper, 'utf8');
  const dryRemove = uninstall({ ...options, dryRun: true });
  assert.ok(dryRemove.some(a => a.path === wrapper && a.kind === 'move'));
  assert.equal(readFileSync(wrapper, 'utf8'), current);
  install(options);
  assert.equal(readFileSync(wrapper, 'utf8'), current);
  const userFile = '#!/bin/sh\n# PACE Git Bash wrapper v1\necho user\n';
  writeFileSync(wrapper, userFile);
  const installActions = install(options);
  assert.equal(readFileSync(wrapper, 'utf8'), userFile);
  assert.ok(installActions.some(a => a.path === wrapper && a.kind === 'skip'));
  const removeActions = uninstall(options);
  assert.equal(readFileSync(wrapper, 'utf8'), userFile);
  assert.ok(removeActions.some(a => a.path === wrapper && a.kind === 'skip'));
});

test('Windows 래퍼 위치의 폴더와 정션은 대상과 함께 보존한다', () => {
  for (const kind of ['directory', 'junction'] as const) {
    const home = tempDir(), options = { home, repo: packageRoot, platform: 'win32' as const };
    const wrapper = join(home, '.pace', 'bin', 'pace'), target = join(home, 'target');
    mkdirSync(join(home, '.pace', 'bin'), { recursive: true });
    mkdirSync(target); writeFileSync(join(target, 'keep'), 'user');
    if (kind === 'directory') mkdirSync(wrapper);
    else symlinkSync(target, wrapper, process.platform === 'win32' ? 'junction' : 'dir');
    assert.ok(install(options).some(a => a.path === wrapper && a.kind === 'skip'));
    assert.ok(uninstall(options).some(a => a.path === wrapper && a.kind === 'skip'));
    assert.equal(readFileSync(join(target, 'keep'), 'utf8'), 'user');
    assert.ok(existsSync(wrapper));
  }
});

test('Windows 래퍼 위치의 파일 링크는 대상과 함께 보존한다', (t) => {
  const home = tempDir(), options = { home, repo: packageRoot, platform: 'win32' as const };
  const wrapper = join(home, '.pace', 'bin', 'pace'), target = join(home, 'user-script');
  mkdirSync(join(home, '.pace', 'bin'), { recursive: true });
  writeFileSync(target, 'user');
  try { symlinkSync(target, wrapper, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('파일 심볼릭 링크 권한 없음'); return; }
    throw error;
  }
  assert.ok(install(options).some(a => a.path === wrapper && a.kind === 'skip'));
  assert.ok(uninstall(options).some(a => a.path === wrapper && a.kind === 'skip'));
  assert.equal(readFileSync(target, 'utf8'), 'user');
  assert.ok(existsSync(wrapper));
});

test('Antigravity 사용자 훅 참조가 남으면 Windows 래퍼와 설치본을 보존한다', () => {
  const home = tempDir(), options = { home, repo: packageRoot, platform: 'win32' as const };
  mkdirSync(join(home, '.gemini', 'config'), { recursive: true });
  install(options);
  const hooks = join(home, '.gemini', 'config', 'hooks.json');
  const json = JSON.parse(readFileSync(hooks, 'utf8')); json.user_hook = { command: 'pace boot --host plain' };
  writeFileSync(hooks, JSON.stringify(json));
  const actions = uninstall(options), wrapper = join(home, '.pace', 'bin', 'pace');
  assert.ok(existsSync(wrapper));
  assert.ok(existsSync(join(home, '.pace', 'bin', 'pace.cmd')));
  assert.ok(existsSync(join(home, '.pace', 'app', 'bin', 'pace.ts')));
  assert.ok(actions.some(a => a.path === wrapper && a.kind === 'skip' && /수동 확인/.test(a.detail)));
});

test('Antigravity 훅 설정을 읽을 수 없으면 Windows 래퍼와 설치본을 보존한다', () => {
  const home = tempDir(), options = { home, repo: packageRoot, platform: 'win32' as const };
  mkdirSync(join(home, '.gemini', 'config'), { recursive: true });
  install(options);
  const hooks = join(home, '.gemini', 'config', 'hooks.json');
  writeFileSync(hooks, '{broken');
  const actions = uninstall(options), wrapper = join(home, '.pace', 'bin', 'pace');
  assert.equal(readFileSync(hooks, 'utf8'), '{broken');
  assert.ok(existsSync(wrapper));
  assert.ok(existsSync(join(home, '.pace', 'bin', 'pace.cmd')));
  assert.ok(existsSync(join(home, '.pace', 'app', 'bin', 'pace.ts')));
  assert.ok(actions.some(a => a.path === wrapper && a.kind === 'skip'));
});

test('실제 Windows Git Bash에서 래퍼와 커밋 훅이 동작한다', { skip: process.platform !== 'win32' ? 'Windows Git Bash 실측' : false }, () => {
  const home = join(tempDir(), "한글 space '$&()"); mkdirSync(home);
  const options = { home, repo: packageRoot, platform: 'win32' as const };
  install(options);
  const gitExec = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  assert.equal(gitExec.status, 0, gitExec.stderr);
  const bash = join(gitExec.stdout.trim(), '..', '..', '..', 'bin', 'bash.exe');
  assert.ok(existsSync(bash), 'Git Bash 설치 경로가 필요하다');
  const bin = join(home, '.pace', 'bin');
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, PACE_HOME: join(home, '.pace'), P034_BIN: bin };
  const run = (script: string, cwd = home) => spawnSync(bash, ['-c', script], { cwd, env, encoding: 'utf8', timeout: 30000 });
  const version = run('PATH="$(cygpath -u "$P034_BIN"):$PATH" && actual="$(command -v pace)" && printf "pace wrapper lookup: %s\\n" "$actual" >&2 && cygpath -aw "$actual" && pace --version');
  assert.equal(version.status, 0, version.stderr);
  const resolvedWrapper = version.stdout.trim().split(/\r?\n/)[0];
  assert.ok(resolvedWrapper, version.stderr);
  const expectedWrapper = join(bin, 'pace');
  assert.equal(lstatSync(resolvedWrapper).isFile(), true, version.stderr);
  assert.equal(realpathSync.native(dirname(resolvedWrapper)), realpathSync.native(bin), version.stderr);
  assert.equal(realpathSync.native(resolvedWrapper), realpathSync.native(expectedWrapper), version.stderr);
  const resolvedInfo = statSync(resolvedWrapper, { bigint: true }), expectedInfo = statSync(expectedWrapper, { bigint: true });
  assert.equal(expectedInfo.isFile(), true);
  assert.equal(resolvedInfo.dev, expectedInfo.dev, version.stderr);
  assert.equal(resolvedInfo.ino, expectedInfo.ino, version.stderr);
  const direct = spawnSync(process.execPath, [join(home, '.pace', 'app', 'bin', 'pace.ts'), '--version'], { env, encoding: 'utf8' });
  assert.equal(version.stdout.trim().split(/\r?\n/).at(-1), direct.stdout.trim());
  const repo = join(home, 'repo'); mkdirSync(repo);
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
  assert.equal(spawnSync('git', ['-C', repo, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { env }).status, 0);
  assert.equal(spawnSync('git', ['-C', repo, 'checkout', '-qb', 'project/P999'], { env }).status, 0);
  const hook = join(repo, '.git', 'hooks', 'commit-msg');
  const harness = readFileSync(join(packageRoot, 'src', 'project', 'harness.ts'), 'utf8');
  const body = harness.match(/const COMMIT_HOOK = COMMIT_HOOK_MARKER \+ String\.raw`([\s\S]*?)`;/)?.[1];
  assert.ok(body, '실제 PACE 훅 템플릿이 있어야 한다');
  writeFileSync(hook, '#!/bin/sh\n# PACE commit gate v1\n' + body);
  writeFileSync(join(repo, 'file'), 'fixture');
  assert.equal(spawnSync('git', ['-C', repo, 'add', 'file'], { env }).status, 0);
  const cleanPath = (process.env.PATH ?? process.env.Path ?? '').split(';').filter(p => !/[\\/]\.pace[\\/]bin[\\/]?$/i.test(p)).join(';');
  const gitEnv: NodeJS.ProcessEnv = { ...env, PATH: `${bin};${cleanPath}` };
  delete gitEnv.Path;
  const commit = spawnSync('git', ['-C', repo, '-c', 'core.hooksPath=.git/hooks', '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fix(P999/T01): fixture'], { env: gitEnv, encoding: 'utf8' });
  assert.notEqual(commit.status, 0, '존재하지 않는 태스크 검사는 커밋을 거부해야 한다');
  assert.match(commit.stderr, /P999|프로젝트/);
  assert.doesNotMatch(commit.stderr, /pace를 찾지 못해/);
  writeFileSync(join(bin, 'node'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$P034_ARGS"\n');
  const argsFile = join(home, 'args.txt'); env.P034_ARGS = argsFile;
  const args = run('PATH="$(cygpath -u "$P034_BIN"):$PATH"; pace "space & dollar $ and quote \'"');
  assert.equal(args.status, 0, args.stderr);
  const forwarded = readFileSync(argsFile, 'utf8').trim().split(/\r?\n/);
  assert.equal(forwarded[0]?.replaceAll('\\', '/'), join(home, '.pace', 'app', 'bin', 'pace.ts').replaceAll('\\', '/'));
  assert.equal(forwarded.at(-1), "space & dollar $ and quote '");
});

test('PowerShell 5.1 격리 설치·재설치·제거는 한 줄로 보고하고 사용자 래퍼를 보존한다', { skip: process.platform !== 'win32' ? 'Windows PowerShell 실측' : false }, () => {
  const home = tempDir(), source = join(packageRoot, 'scripts', 'install.ps1');
  const bytes = readFileSync(source); assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const script = join(home, 'install-test.ps1');
  const original = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const sandboxed = original.replace('[Environment]::GetEnvironmentVariable("Path", "User")', '$PaceBinDir');
  assert.notEqual(sandboxed, original, '사용자 PATH 레지스트리 조회만 격리한다');
  writeFileSync(script, '\uFEFF' + sandboxed, 'utf8');
  const env = { ...sessionFreeEnv(), USERPROFILE: home, HOME: home, PACE_HOME: join(home, '.pace'), PSModuleAnalysisCachePath: join(home, 'module-analysis-cache') };
  const run = () => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Repo', packageRoot, '-Yes'], { env, cwd: home, encoding: 'utf8', timeout: 120000 });
  const first = run(); assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(first.stdout.trim().split(/\r?\n/).length, 1, first.stdout);
  const wrapper = join(home, '.pace', 'bin', 'pace'); assert.ok(existsSync(wrapper));
  const second = run(); assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.equal(second.stdout.trim().split(/\r?\n/).length, 1, second.stdout);
  const removeManaged = spawnSync(process.execPath, [join(packageRoot, 'bin', 'pace.ts'), 'uninstall'], { env, encoding: 'utf8', timeout: 120000 });
  assert.equal(removeManaged.status, 0, removeManaged.stderr);
  assert.equal(existsSync(wrapper), false);
  const reinstall = run(); assert.equal(reinstall.status, 0, reinstall.stdout + reinstall.stderr);
  writeFileSync(wrapper, '#!/bin/sh\necho user\n');
  const conflict = run(); assert.equal(conflict.status, 0, conflict.stdout + conflict.stderr);
  assert.equal(conflict.stdout.trim().split(/\r?\n/).length, 1, conflict.stdout);
  assert.match(conflict.stdout, /Git Bash/);
  const removed = spawnSync(process.execPath, [join(packageRoot, 'bin', 'pace.ts'), 'uninstall'], { env, encoding: 'utf8', timeout: 120000 });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(readFileSync(wrapper, 'utf8'), '#!/bin/sh\necho user\n');
});

test('원격 설치 입구 get.ps1은 ASCII·BOM 없이 두고 README가 그것을 가리킨다 (irm | iex는 BOM이 붙은 install.ps1을 해석하지 못한다)', () => {
  const get = readFileSync(join(packageRoot, 'scripts', 'get.ps1'));
  assert.ok([...get].every((b) => b < 0x80), 'get.ps1은 ASCII만 쓴다 — BOM·한글이 없어야 iex가 해석한다');
  const text = get.toString('utf8');
  assert.match(text, /-File \$file/, 'install.ps1은 임시 파일로 받아 -File로 실행한다');
  assert.match(text, /^& \{/m, '변수가 사용자 셸에 새지 않게 스크립트 블록 안에서 실행한다');
  assert.doesNotMatch(text, /^\s*exit\b/m, 'iex 안의 exit은 사용자 셸을 닫는다');
  const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8');
  assert.match(readme, /raw\.githubusercontent\.com\/ceo4ever\/pace\/main\/scripts\/get\.ps1 \| iex/);
  assert.doesNotMatch(readme, /scripts\/install\.ps1 \| iex/);
});

test('get.ps1을 iex로 실행하면 BOM 있는 install.ps1을 받아 설치하고 사용자 셸은 살아 있다', { skip: process.platform !== 'win32' ? 'Windows PowerShell 실측' : false }, () => {
  const home = tempDir();
  const original = readFileSync(join(packageRoot, 'scripts', 'install.ps1'), 'utf8').replace(/^\uFEFF/, '');
  const sandboxed = original
    .replace('[Environment]::GetEnvironmentVariable("Path", "User")', '$PaceBinDir')
    .replace('[Environment]::SetEnvironmentVariable(', '[void]("sandbox")#')
    // PACE_REPO가 이 저장소라 업데이트 분기(fetch·checkout·pull)가 개발 저장소를 건드린다 — 입구 경로만 시험한다
    .replace('(Test-Path ([IO.Path]::Combine($Repo, ".git")))', '$false');
  assert.notEqual(sandboxed, original);
  assert.ok(original.includes('(Test-Path ([IO.Path]::Combine($Repo, ".git")))') && !sandboxed.includes('(Test-Path ([IO.Path]::Combine($Repo, ".git")))'), '업데이트 분기를 막아야 한다');
  const script = join(home, 'install-sandbox.ps1');
  writeFileSync(script, '\uFEFF' + sandboxed, 'utf8');
  const env = { ...sessionFreeEnv(), USERPROFILE: home, HOME: home, PACE_HOME: join(home, '.pace'), PACE_REPO: packageRoot, PACE_INSTALL_URL: pathToFileURL(script).href, PSModuleAnalysisCachePath: join(home, 'module-analysis-cache') };
  const command = `Get-Content -Raw '${join(packageRoot, 'scripts', 'get.ps1').replaceAll("'", "''")}' | iex; 'shell-alive'`;
  const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { env, cwd: home, encoding: 'utf8', timeout: 180000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /shell-alive/);
  assert.ok(existsSync(join(home, '.pace', 'install.json')), run.stdout + run.stderr);
});
