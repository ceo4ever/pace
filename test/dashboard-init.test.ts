import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, toNamespacedPath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageRoot } from '../src/core/paths.ts';
import { initDashboard, isProtectedInitTarget } from '../src/project/dashboard-init.ts';
import { renderDashboardEntry } from '../src/project/dashboard-layout.ts';
import { openRepo } from '../src/project/harness.ts';
import { spawnSync } from 'node:child_process';
import { runPace, tempDir, spawnTestChild as spawn } from './helpers.ts';

function repo() {
  const root = tempDir();
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  return root;
}

function treeSnapshot(root: string): string {
  const rows: string[] = [];
  const walk = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, rel);
      else if (entry.isSymbolicLink()) rows.push(`${rel}:symlink`);
      else rows.push(`${rel}:${readFileSync(path).toString('base64')}`);
    }
  };
  walk(root);
  return rows.sort().join('\n');
}

function siblingSpaceRepos(suffix = ' '): { parent: string; neighbor: string; target: string; home: string } {
  const parent = tempDir(), neighbor = join(parent, 'root-space'), target = join(parent, `root-space${suffix}`), home = tempDir();
  mkdirSync(neighbor); mkdirSync(target);
  for (const root of [neighbor, target]) {
    assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
    mkdirSync(join(root, 'backlogs/BL1'), { recursive: true });
    writeFileSync(join(root, 'backlogs/BL1/BACKLOG.md'), `# ${root === target ? 'TARGET' : 'NEIGHBOR'}\n`);
    assert.equal(spawnSync('git', ['-C', root, 'config', 'user.name', 'test']).status, 0);
    assert.equal(spawnSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']).status, 0);
    assert.equal(spawnSync('git', ['-C', root, 'add', '-A']).status, 0);
    assert.equal(spawnSync('git', ['-C', root, 'commit', '-qm', 'fixture']).status, 0);
  }
  return { parent, neighbor, target, home };
}

function rejectAmbiguousWindowsPath(command: 'init' | 'refresh', suffix = ' ', junction = false): void {
  const parent = tempDir(), neighbor = join(parent, 'root-space');
  const target = toNamespacedPath(join(parent, `root-space${suffix}`));
  mkdirSync(neighbor); mkdirSync(target);
  writeFileSync(join(neighbor, 'neighbor.txt'), 'NEIGHBOR');
  writeFileSync(join(target, 'target.txt'), 'TARGET');
  assert.equal(spawnSync('git', ['init', '-q', neighbor]).status, 0);
  assert.equal(spawnSync('git', ['-C', neighbor, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'fixture']).status, 0);
  const beforeNeighbor = treeSnapshot(neighbor), beforeTarget = treeSnapshot(target);
  const selected = junction ? join(parent, 'link') : target;
  if (junction) symlinkSync(target, selected, 'junction');
  assert.throws(() => openRepo(selected), /끝 공백.*다른 폴더/);
  assert.doesNotThrow(() => openRepo(neighbor), 'Git이 요청한 형제를 정확히 찾으면 허용한다');
  const result = runPace(['backlog', command], { cwd: selected, home: tempDir() });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, junction ? /끝 공백.*다른 폴더/ : /형제 경로가 충돌.*형제 이름을 변경하거나 확장 접두어 없는 일반 경로/);
  assert.equal(treeSnapshot(neighbor), beforeNeighbor);
  assert.equal(treeSnapshot(target), beforeTarget);
}

test('init generates target snapshot and preserves an existing dashboard', () => {
  const root = repo(), home = tempDir();
  mkdirSync(join(root, 'backlogs/BL261108_01_테스트'), { recursive: true });
  const source = join(root, 'backlogs/BL261108_01_테스트/BACKLOG.md');
  writeFileSync(source, '# 실제 대상\n');
  const first = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(first.status, 0, first.stderr);
  assert.match(readFileSync(join(root, 'backlogs/dashboard/data.js'), 'utf8'), /실제 대상/);
  const html = join(root, 'backlogs/README.html');
  writeFileSync(html, '사용자 변경');
  const second = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(readFileSync(html, 'utf8'), '사용자 변경');
});

test("끝 마침표 경로와 정션은 안전하게 처리한다", () => {
  if (process.platform === 'win32') {
    rejectAmbiguousWindowsPath('init', '.');
    rejectAmbiguousWindowsPath('refresh', '.', true);
  } else {
    const { neighbor, target } = siblingSpaceRepos('.');
    const before = treeSnapshot(neighbor);
    initDashboard(target);
    assert.equal(treeSnapshot(neighbor), before);
  }
});

test('Git이 같은 저장소를 가리키는 정상 정션과 경로 별칭은 허용한다', () => {
  const parent = tempDir(), target = join(parent, 'normal-repo');
  mkdirSync(target);
  assert.equal(spawnSync('git', ['init', '-q', target]).status, 0);
  assert.equal(spawnSync('git', ['-C', target, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'fixture']).status, 0);
  const sibling = process.platform === 'win32' ? toNamespacedPath(join(parent, 'normal-repo.')) : join(parent, 'normal-repo.');
  mkdirSync(sibling);
  writeFileSync(join(sibling, 'preserve.txt'), '다른 폴더');
  const link = join(parent, 'normal-link');
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const expected = realpathSync.native(target).toLowerCase();
  const git = spawnSync('git', ['-C', link, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  assert.equal(realpathSync.native(git.stdout.trim()).toLowerCase(), expected, 'Git이 요청한 저장소와 같은 실제 폴더를 찾는다');
  assert.equal(realpathSync.native(openRepo(link).root).toLowerCase(), expected);
  initDashboard(link);
  const cli = runPace(['backlog', 'refresh'], { cwd: link, home: tempDir() });
  assert.equal(cli.status, 0, cli.stderr + cli.stdout);
  if (process.platform === 'win32') {
    assert.equal(realpathSync.native(openRepo(toNamespacedPath(link)).root).toLowerCase(), expected);
    const temp = process.env.TEMP;
    assert.ok(temp);
    const shortPath = join(temp, relative(realpathSync.native(temp), target));
    if (temp.toLowerCase() !== realpathSync.native(temp).toLowerCase()) assert.notEqual(shortPath.toLowerCase(), target.toLowerCase(), '실제 짧은 경로 별칭을 사용한다');
    assert.equal(realpathSync.native(openRepo(shortPath).root).toLowerCase(), expected);
    assert.equal(realpathSync.native(openRepo(target.toUpperCase()).root).toLowerCase(), expected);
    const isolated = repo();
    assert.equal(spawnSync('git', ['-C', isolated, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'fixture']).status, 0);
    assert.equal(realpathSync.native(openRepo(toNamespacedPath(isolated)).root).toLowerCase(), realpathSync.native(isolated).toLowerCase(), '충돌 없는 확장 경로는 허용한다');
  }
  assert.equal(readFileSync(join(sibling, 'preserve.txt'), 'utf8'), '다른 폴더');
});

test('상위 정션 아래 모호한 cwd도 형제 저장소를 바꾸지 않는다', () => {
  const parent = tempDir(), actual = join(parent, 'actual'), link = join(parent, 'parent-link');
  mkdirSync(actual);
  symlinkSync(actual, link, process.platform === 'win32' ? 'junction' : 'dir');
  const neighbor = join(actual, 'repo');
  const target = process.platform === 'win32' ? toNamespacedPath(join(actual, 'repo.')) : join(actual, 'repo.');
  mkdirSync(neighbor); mkdirSync(target);
  assert.equal(spawnSync('git', ['init', '-q', neighbor]).status, 0);
  assert.equal(spawnSync('git', ['-C', neighbor, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'fixture']).status, 0);
  writeFileSync(join(neighbor, 'preserve.txt'), '다른 폴더');
  writeFileSync(join(target, 'target.txt'), '대상');
  const before = treeSnapshot(neighbor);
  const selected = process.platform === 'win32' ? toNamespacedPath(join(link, 'repo.')) : join(link, 'repo.');
  if (process.platform === 'win32') {
    for (const command of ['init', 'refresh']) {
      const result = runPace(['backlog', command], { cwd: selected, home: tempDir() });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /형제 경로가 충돌.*형제 이름을 변경하거나 확장 접두어 없는 일반 경로/);
    }
    const safeAmbiguous = runPace(['backlog', 'init'], { cwd: toNamespacedPath(join(link, 'repo')), home: tempDir() });
    assert.notEqual(safeAmbiguous.status, 0, '구별 불가능한 정상 확장 cwd도 안전하게 거부한다');
    assert.match(safeAmbiguous.stderr, /형제 경로가 충돌.*형제 이름을 변경하거나 확장 접두어 없는 일반 경로/);
    const slashAlias = toNamespacedPath(join(link, 'repo')).replaceAll('\\', '/');
    assert.throws(() => openRepo(slashAlias), /형제 경로가 충돌/, '슬래시 확장 경로 별칭도 거부한다');
    assert.doesNotThrow(() => openRepo(neighbor), '일반 경로는 사용할 수 있다');
  } else {
    assert.equal(spawnSync('git', ['init', '-q', target]).status, 0);
    initDashboard(selected);
  }
  assert.equal(treeSnapshot(neighbor), before);
  assert.equal(readFileSync(join(target, 'target.txt'), 'utf8'), '대상');
});

test('user README and app in a partial dashboard fail without modifying any path', () => {
  const root = repo(), home = tempDir();
  mkdirSync(join(root, 'backlogs/dashboard'), { recursive: true });
  const html = join(root, 'backlogs/README.html'), app = join(root, 'backlogs/dashboard/app.js');
  writeFileSync(html, '사용자 README'); writeFileSync(app, '사용자 app');
  const result = runPace(['backlog', 'init'], { cwd: root, home });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /사용자 파일|템플릿/);
  assert.deepEqual(readFileSync(html), Buffer.from('사용자 README'));
  assert.deepEqual(readFileSync(app), Buffer.from('사용자 app'));
  assert.deepEqual(readdirSync(join(root, 'backlogs/dashboard')), ['app.js']);
  const other = repo(), outside = tempDir();
  symlinkSync(outside, join(other, 'backlogs'));
  assert.notEqual(runPace(['backlog', 'init'], { cwd: other, home }).status, 0);
});

test('empty repository and held initialization lock report correct results', () => {
  const root = repo(), home = tempDir();
  mkdirSync(join(root, '.pace-backlog-init-lock'));
  const locked = runPace(['backlog', 'init'], { cwd: root, home });
  assert.notEqual(locked.status, 0);
  assert.match(locked.stderr, /잠금/);
  const empty = repo();
  const created = runPace(['backlog', 'init'], { cwd: empty, home });
  assert.equal(created.status, 0, created.stderr);
  assert.match(readFileSync(join(empty, 'backlogs/dashboard/data.js'), 'utf8'), /window\.PACE_DATA/);
  assert.doesNotMatch(readFileSync(join(empty, 'backlogs/dashboard/data.js'), 'utf8'), /BL2610/);
});


test('missing installation asset fails and rolls back only newly created files', () => {
  const root = repo(), home = tempDir(), app = tempDir();
  cpSync(join(packageRoot, 'bin'), join(app, 'bin'), { recursive: true });
  cpSync(join(packageRoot, 'src'), join(app, 'src'), { recursive: true });
  cpSync(join(packageRoot, 'package.json'), join(app, 'package.json'));
  unlinkSync(join(app, 'src/dashboard/backlog/style.css'));
  const result = spawnSync(process.execPath, [join(app, 'bin/pace.ts'), 'backlog', 'init'], { cwd: root, encoding: 'utf8', env: { ...process.env, PACE_HOME: home } });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(root, 'backlogs/dashboard/style.css')), false);
  assert.equal(existsSync(join(root, 'backlogs/README.html')), false);
});

test('existing but empty dashboard data is rejected and preserved byte-for-byte', () => {
  const root = repo(), home = tempDir();
  const initialized = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(initialized.status, 0, initialized.stderr);
  const data = join(root, 'backlogs/dashboard/data.js');
  writeFileSync(data, '');
  const before = readFileSync(data);
  const rerun = runPace(['backlog', 'init'], { cwd: root, home });
  assert.notEqual(rerun.status, 0);
  assert.equal(readFileSync(data).compare(before), 0);
});

test('all expected dashboard paths with malformed data are rejected without edits', () => {
  const root = repo(), home = tempDir();
  const initialized = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(initialized.status, 0, initialized.stderr);
  const data = join(root, 'backlogs/dashboard/data.js');
  writeFileSync(data, 'window.PACE_DATA = {broken');
  const before = readFileSync(data);
  const rerun = runPace(['backlog', 'init'], { cwd: root, home });
  assert.notEqual(rerun.status, 0);
  assert.equal(readFileSync(data).compare(before), 0);
});

test('nested consumer fields must match the supported JSON types', () => {
  const root = repo(), home = tempDir();
  assert.equal(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
  const data = join(root, 'backlogs/dashboard/data.js');
  const good = JSON.parse(readFileSync(data, 'utf8').match(/window\.PACE_DATA = (.*);/)![1]!);
  for (const broken of [
    { ...good, files: { 'backlogs/BL1/BACKLOG.md': { text: 'bad' } } },
    { ...good, assets: { 'backlogs/a.png': null } },
    { ...good, catalog: [null] },
    { ...good, skipped: Number.NaN },
  ]) {
    writeFileSync(data, `window.PACE_DATA = ${JSON.stringify(broken)};\n`);
    const before = readFileSync(data);
    assert.notEqual(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
    assert.equal(readFileSync(data).compare(before), 0);
  }
});

test('older JSON assignment without the generated comment is accepted without execution', () => {
  const root = repo(), home = tempDir();
  assert.equal(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
  const data = join(root, 'backlogs/dashboard/data.js');
  const original = readFileSync(data, 'utf8').match(/window\.PACE_DATA = (.*);/)![1]!;
  writeFileSync(data, `window.PACE_DATA = ${original};\n`);
  const before = readFileSync(data);
  const result = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(data).compare(before), 0);
});

test('recognized partial install restores missing snapshot only', () => {
  const root = repo(), home = tempDir();
  assert.equal(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
  const data = join(root, 'backlogs/dashboard/data.js');
  unlinkSync(data);
  const result = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /부분 대시보드 복구 완료/);
  assert.match(readFileSync(data, 'utf8'), /window\.PACE_DATA/);
});


test('concurrent init never overwrites user paths and leaves a valid dashboard', async () => {
  const root = repo(), home = tempDir();
  const run = () => new Promise<{ code: number | null; out: string; err: string }>(resolve => {
    const child = spawn(process.execPath, [join(packageRoot, 'bin/pace.ts'), 'backlog', 'init'], { cwd: root, env: { ...process.env, PACE_HOME: home } });
    let out = '', err = '';
    child.stdout.setEncoding('utf8').on('data', chunk => out += chunk);
    child.stderr.setEncoding('utf8').on('data', chunk => err += chunk);
    child.on('close', code => resolve({ code, out, err }));
  });
  const results = await Promise.all([run(), run()]);
  assert.ok(results.some(result => result.code === 0), JSON.stringify(results));
  const retry = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(retry.status, 0, retry.stderr);
  const data = readFileSync(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  assert.match(data, /^\/\/ 생성 산출물/);
});

test('existing data symlink is rejected before reading or repairing its target', () => {
  const root = repo(), home = tempDir(), external = join(tempDir(), 'external.js');
  assert.equal(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
  const target = join(root, 'backlogs/dashboard/data.js');
  unlinkSync(target);
  writeFileSync(external, 'external user data');
  symlinkSync(external, target);
  const before = readFileSync(external);
  assert.notEqual(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
  assert.equal(readFileSync(external).compare(before), 0);
});


test("init creates Git in a plain folder without commit or remote and refreshes data", () => {
  const root = tempDir(), home = tempDir(), globalConfig = join(home, "gitconfig");
  mkdirSync(join(root, "backlogs/BL1"), { recursive: true });
  mkdirSync(join(root, "backlogs/BL_IGNORED"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "backlogs/BL_IGNORED/\n");
  writeFileSync(join(root, "backlogs/BL1/BACKLOG.md"), "# SAFE_SOURCE\n");
  writeFileSync(join(root, "backlogs/BL1/.env"), "SECRET_SENTINEL");
  writeFileSync(join(root, "backlogs/BL_IGNORED/BACKLOG.md"), "IGNORE_SENTINEL");
  const outside = join(tempDir(), "linked.md"); writeFileSync(outside, "SYMLINK_SENTINEL");
  symlinkSync(outside, join(root, "backlogs/BL1/linked.md"));
  const init = runPace(["backlog", "init"], { cwd: root, home, env: { GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(init.status, 0, init.stderr);
  const snapshot = readFileSync(join(root, "backlogs/dashboard/data.js"), "utf8");
  assert.match(snapshot, /SAFE_SOURCE/);
  assert.doesNotMatch(snapshot, /SECRET_SENTINEL|IGNORE_SENTINEL|SYMLINK_SENTINEL/);
  assert.equal(existsSync(join(root, ".git")), true);
  assert.equal(spawnSync("git", ["-C", root, "rev-parse", "--verify", "HEAD"], { encoding: "utf8" }).status, 128);
  assert.equal(spawnSync("git", ["-C", root, "remote"], { encoding: "utf8" }).stdout.trim(), "");
  assert.equal(existsSync(globalConfig), false);
  writeFileSync(join(root, "backlogs/BL1/BACKLOG.md"), "# UPDATED_SOURCE\n");
  const refresh = runPace(["backlog", "refresh"], { cwd: root, home, env: { GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: "1" } });
  assert.equal(refresh.status, 0, refresh.stderr);
  assert.match(readFileSync(join(root, "backlogs/dashboard/data.js"), "utf8"), /UPDATED_SOURCE/);
  assert.equal(spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" }).stdout.includes("A  "), false);
});

test("init uses parent worktree root and Git ignore and info-exclude", () => {
  const parent = repo(), child = join(parent, "plain-project"), home = tempDir();
  mkdirSync(child);
  mkdirSync(join(parent, "backlogs/BL1/drafts"), { recursive: true });
  writeFileSync(join(parent, ".gitignore"), "backlogs/BL1/drafts/\n");
  writeFileSync(join(parent, ".git/info/exclude"), "backlogs/BL1/personal.md\n");
  writeFileSync(join(parent, "backlogs/BL1/drafts/notes.md"), "PARENT_IGNORE_SENTINEL");
  writeFileSync(join(parent, "backlogs/BL1/personal.md"), "INFO_EXCLUDE_SENTINEL");
  const result = runPace(["backlog", "init"], { cwd: child, home });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(join(realpathSync(parent), 'backlogs/README.html').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const data = readFileSync(join(parent, "backlogs/dashboard/data.js"), "utf8");
  assert.doesNotMatch(data, /PARENT_IGNORE_SENTINEL|INFO_EXCLUDE_SENTINEL/);
  assert.equal(existsSync(join(child, ".git")), false);
});

test("refresh without Git skips without creating Git or dashboard", () => {
  const root = tempDir(), home = tempDir();
  const result = runPace(["backlog", "refresh"], { cwd: root, home });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Git 저장소가 없어/);
  assert.equal(existsSync(join(root, ".git")), false);
  assert.equal(existsSync(join(root, "backlogs")), false);
});

test("Git executable missing, broken Git marker, and query failure do not trigger git init", () => {
  const home = tempDir(), missing = tempDir();
  const noGit = runPace(["backlog", "init"], { cwd: missing, home, env: { PATH: "/nonexistent" } });
  assert.notEqual(noGit.status, 0);
  assert.match(noGit.stderr, /Git을 실행할 수 없습니다/);
  assert.equal(existsSync(join(missing, ".git")), false);
  const broken = tempDir(); mkdirSync(join(broken, ".git"));
  writeFileSync(join(broken, ".git/invalid"), "preserve");
  const brokenResult = runPace(["backlog", "init"], { cwd: broken, home });
  assert.notEqual(brokenResult.status, 0);
  assert.match(brokenResult.stderr, /Git 저장소 조회에 실패/);
  assert.equal(existsSync(join(broken, "backlogs")), false);
  const query = tempDir();
  const queryResult = runPace(["backlog", "init"], { cwd: query, home, env: { GIT_DIR: join(query, "missing-git-dir") } });
  assert.notEqual(queryResult.status, 0);
  assert.match(queryResult.stderr, /Git 저장소 조회에 실패/);
  assert.equal(existsSync(join(query, ".git")), false);
});

test("refresh fails closed on partial dashboard and preserves user files in Git repository", () => {
  const home = tempDir(), partial = repo(), app = join(partial, "backlogs/dashboard/app.js");
  mkdirSync(join(partial, "backlogs/dashboard"), { recursive: true });
  writeFileSync(app, "USER_APP_MUST_SURVIVE");
  const rejected = runPace(["backlog", "refresh"], { cwd: partial, home });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /부분/);
  assert.match(rejected.stderr, /pace backlog init/);
  assert.equal(readFileSync(app, "utf8"), "USER_APP_MUST_SURVIVE");
});


test("trailing-space Git root init stays on exact target and leaves its sibling tree byte-identical", () => {
  if (process.platform === 'win32') { rejectAmbiguousWindowsPath('init'); return; }
  const { neighbor, target, home } = siblingSpaceRepos();
  assert.equal(openRepo(target).root, realpathSync(target));
  const before = treeSnapshot(join(neighbor, 'backlogs'));
  const result = runPace(['backlog', 'init'], { cwd: target, home });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(target, 'backlogs/dashboard/data.js')), true);
  assert.equal(treeSnapshot(join(neighbor, 'backlogs')), before);
});

test("trailing-space Git root refresh updates exact target and leaves its sibling tree byte-identical", () => {
  if (process.platform === 'win32') { rejectAmbiguousWindowsPath('refresh'); return; }
  const { neighbor, target, home } = siblingSpaceRepos();
  initDashboard(neighbor);
  initDashboard(target);
  writeFileSync(join(target, 'backlogs/BL1/BACKLOG.md'), '# TARGET_LATEST\n');
  const before = treeSnapshot(join(neighbor, 'backlogs'));
  const result = runPace(['backlog', 'refresh'], { cwd: target, home });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(target, 'backlogs/dashboard/data.js'), 'utf8'), /TARGET_LATEST/);
  assert.equal(treeSnapshot(join(neighbor, 'backlogs')), before);
});

test("Git ls-files warning with success status fails refresh and preserves the previous snapshot", () => {
  const root = repo(), home = tempDir();
  assert.equal(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
  const snapshot = join(root, 'backlogs/dashboard/data.js');
  writeFileSync(join(root, 'backlogs/BL_WARN.md'), 'BEFORE_WARNING\n');
  const changed = runPace(['backlog', 'refresh'], { cwd: root, home }); assert.equal(changed.status, 0, changed.stderr);
  writeFileSync(join(root, 'backlogs/BL_WARN.md'), 'AFTER_WARNING\n');
  const before = readFileSync(snapshot);
  const hook = join(tempDir(), 'git-warning.mjs');
  writeFileSync(hook, `import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module'; const original=cp.spawnSync; cp.spawnSync=(file,args,options)=>{ const result=original(file,args,options); if(file==='git' && args[0]==='ls-files' && result.status===0) result.stderr += "warning: Permission denied"; return result; }; syncBuiltinESMExports();`);
  const result = runPace(['backlog', 'refresh'], { cwd: root, home, env: { NODE_OPTIONS: `--import=${pathToFileURL(hook).href}` } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Git.*목록|Permission denied/i);
  assert.equal(readFileSync(snapshot).compare(before), 0);
});

test("init failure after Git creation reports actual root and safe retry while preserving the new Git repo", () => {
  const root = tempDir(), home = tempDir(), outside = tempDir();
  writeFileSync(join(outside, 'keep.md'), 'PRESERVE');
  symlinkSync(outside, join(root, 'backlogs'));
  const result = runPace(['backlog', 'init'], { cwd: root, home });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(realpathSync(root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stderr, /pace backlog init/);
  assert.equal(existsSync(join(root, '.git')), true);
  assert.equal(readFileSync(join(outside, 'keep.md'), 'utf8'), 'PRESERVE');
});

test("new Git initialization rejects the HOME and filesystem root boundaries before writing", () => {
  const home = tempDir();
  assert.equal(isProtectedInitTarget(home, home), true);
  assert.equal(isProtectedInitTarget('/', home), true);
  assert.equal(isProtectedInitTarget(join(home, 'project'), home), false);
  const result = runPace(['backlog', 'init'], { cwd: home, home, env: { TMPDIR: home } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOME|초기화할 수 없습니다/);
  assert.equal(existsSync(join(home, '.git')), false);
});

test('shared dashboard init keeps only project entry and data, and shares one runtime', () => {
  const one = repo(), two = repo(), home = tempDir();
  for (const root of [one, two]) assert.equal(runPace(['backlog', 'init'], { cwd: root, home }).status, 0);
  const html = readFileSync(join(one, 'backlogs/README.html'), 'utf8');
  assert.match(html, /pace:backlog-shared:1/);
  assert.match(html, /file:.*src\/dashboard\/backlog\/app\.js/);
  assert.equal(html, readFileSync(join(two, 'backlogs/README.html'), 'utf8'));
  assert.deepEqual(readdirSync(join(one, 'backlogs/dashboard')), ['data.js']);
  assert.deepEqual(readdirSync(join(two, 'backlogs/dashboard')), ['data.js']);
});

function copiedDashboard(root: string, custom = false): Buffer {
  const ui = JSON.parse(readFileSync(join(packageRoot, 'test/fixtures/backlog-dashboard-copy.json'), 'utf8')) as Record<string, string>;
  mkdirSync(join(root, 'backlogs/dashboard'), { recursive: true });
  for (const [path, text] of Object.entries(ui)) writeFileSync(join(root, 'backlogs', path), text + (custom && path.endsWith('app.js') ? '\n// user customization\n' : ''));
  const data = Buffer.from(`window.PACE_DATA = ${JSON.stringify({ generated: new Date().toISOString(), files: { 'backlogs/BL1/BACKLOG.md': '# own original' }, assets: {}, catalog: ['backlogs/BL1/BACKLOG.md'], skipped: 0, bytes: 14 })};\n`);
  writeFileSync(join(root, 'backlogs/dashboard/data.js'), data);
  return data;
}

test('unknown dashboard UI copy is preserved and not replaced', () => {
  const root = repo(), home = tempDir();
  copiedDashboard(root, true);
  const before = treeSnapshot(root);
  const result = runPace(['backlog', 'init'], { cwd: root, home });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /전환하지 않았습니다/);
  assert.equal(treeSnapshot(root), before);
});

function runtimeCopy(name: string): string {
  const app = join(tempDir(), name);
  mkdirSync(app);
  for (const part of ['bin', 'src', 'package.json']) cpSync(join(packageRoot, part), join(app, part), { recursive: true });
  return app;
}

test('installed runtime URLs escape special paths and can rebind without touching project data', async () => {
  const { pathToFileURL } = await import('node:url');
  const first = runtimeCopy('PACE space # & 한글'), next = runtimeCopy('PACE next'), root = repo(), home = tempDir();
  const run = (app: string) => spawnSync(process.execPath, [join(app, 'bin/pace.ts'), 'backlog', 'init'], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: home, PACE_HOME: home } });
  assert.equal(run(first).status, 0);
  const entry = join(root, 'backlogs/README.html'), data = join(root, 'backlogs/dashboard/data.js');
  assert.ok(readFileSync(entry, 'utf8').includes(pathToFileURL(join(first, 'src/dashboard/backlog/app.js')).href.replace(/&/g, '&amp;')));
  const original = readFileSync(data);
  const rebound = run(next);
  assert.equal(rebound.status, 0);
  assert.match(rebound.stdout, /참조 경로를 갱신/);
  assert.ok(readFileSync(entry, 'utf8').includes(pathToFileURL(join(next, 'src/dashboard/backlog/app.js')).href));
  assert.deepEqual(readFileSync(data), original);
  const edited = readFileSync(entry, 'utf8') + '<!-- user note -->';
  writeFileSync(entry, edited);
  assert.equal(run(first).status, 0);
  assert.equal(readFileSync(entry, 'utf8'), edited);
});
