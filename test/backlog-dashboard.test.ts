import { tempDir, spawnTestChild as spawn } from "./helpers.ts";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, symlink, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateDashboard } from '../src/project/dashboard.ts';

test('dashboard snapshot collects allowed documents, skips symlinks and sensitive paths, and escapes script data', async () => {
  const root = tempDir('pace-dashboard-');
  {
    for (const dir of ['scripts', 'backlogs/dashboard', 'backlogs/BL1', 'projects/P1', 'projects/P1/.private', 'projects/P1/node_modules']) await mkdir(join(root, dir), { recursive: true });
    spawnSync('git', ['init', '-q', root]);
    await writeFile(join(root, '.gitignore'), 'backlogs/*/sources/\n*.local.md\n');
    await mkdir(join(root, 'backlogs/BL1/sources'));
    await mkdir(join(root, 'backlogs/backup/BL2/sources'), { recursive: true });
    await writeFile(join(root, 'backlogs/backup/BL2/sources/raw.md'), 'ARCHIVED_RAW_SOURCE');
    await mkdir(join(root, 'projects/P1/evidence/sources'), { recursive: true });
    await writeFile(join(root, 'projects/P1/evidence/sources/public.md'), '공개 증거');
    await writeFile(join(root, 'backlogs/BL1/sources/a.md'), '무시된 자료');
    await writeFile(join(root, 'projects/P1/a.local.md'), '무시된 자료');
    assert.equal(spawnSync('git', ['-C', root, 'add', '-f', 'projects/P1/a.local.md']).status, 0);
    await writeFile(join(root, 'backlogs/README.html'), '<p>dashboard</p>');
    await writeFile(join(root, 'backlogs/dashboard/data.js'), 'old');
    await writeFile(join(root, 'backlogs/BL1/BACKLOG.md'), '# 안전\n</script><script>bad()</script>');
    await writeFile(join(root, 'backlogs/BL1/report.html'), '<p>보고서</p><script>bad()</script>');
    await writeFile(join(root, 'backlogs/BL1/image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64'));
    await writeFile(join(root, 'projects/P1/PROJECT.md'), '# 프로젝트');
    await writeFile(join(root, 'projects/P1/secret.md'), '감춰진 내용');
    await writeFile(join(root, 'projects/P1/.private/a.md'), '감춰진 내용');
    await writeFile(join(root, 'projects/P1/node_modules/a.md'), '감춰진 내용');
    await symlink(join(root, 'projects/P1/secret.md'), join(root, 'backlogs/BL1/link.md'));
    assert.ok(generateDashboard(root));
    const output = await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8');
    assert.ok(output.includes('backlogs/BL1/BACKLOG.md'));
    assert.ok(output.includes('공개 증거'));
    assert.ok(!output.includes('감춰진 내용'));
    assert.ok(!output.includes('무시된 자료'));
    assert.ok(!output.includes('link.md'));
    assert.ok(!output.includes('ARCHIVED_RAW_SOURCE'));
    assert.ok(!output.includes('</script>'));
    const vm = await import('node:vm');
    const snapshot = vm.runInNewContext(output + ';window.PACE_DATA', { window: {} }) as { files: Record<string, string>; assets: Record<string, string> };
    assert.match(snapshot.files['backlogs/BL1/report.html']!, /보고서/);
    assert.match(snapshot.assets['backlogs/BL1/image.png']!, /^data:image\/png;base64,/);
  }
});

test('dashboard rendering, project evidence and broken activity stay safe', async () => {
  const vm = await import('node:vm');
  const code = await readFile(resolve('src/dashboard/backlog/core.js'), 'utf8');
  const sandbox: Record<string, unknown> = { URL };
  vm.runInNewContext(code, sandbox);
  type TreeNode = { files: string[]; children: Map<string, TreeNode> };
  const core = sandbox.dashboardCore as {
    resolvePath(base: string, rel: string): string | null;
    safePath(path: string): boolean;
    briefPaths(catalog: string[], root: string): string[];
    humanName(value: string): string;
    isCompactHeader(value: string): boolean;
    isCompactValue(value: string): boolean;
    clampColumnWidth(value: number): number;
    taskStatus(files: Record<string, string>, path: string): string;
    selectedSections(text: string): string;
    projectsForBrief(files: Record<string, string>, root: string, brief: string): string[];
    treeFor(paths: string[], root: string): TreeNode;
    tasksForBrief(files: Record<string, string>, root: string, brief: string, related: string[]): string[];
    markdown(text: string, base: string, imageFor?: (path: string) => string): string;
    status(text: string): string;
    backlogFilters: string[];
    backlogLabel(value: string): string;
    projectsFor(files: Record<string, string>, root: string): string[];
    eventsFor(files: Record<string, string>, paths: string[]): { text: string }[];
  };
  const base = 'backlogs/BL1/BACKLOG.md';
  assert.equal(core.safePath(base), true);
  assert.equal(core.safePath('backlogs/BL1/sources/a.md'), false);
  assert.equal(core.safePath('backlogs/BL1/memo.local.md'), false);
  assert.equal(core.safePath('backlogs/BL1/new.md'), true);
  assert.equal(core.safePath('projects/P001/evidence/sources/web.md'), true);
  for (const path of ['javascript:alert(1)', 'data:text/html,x', '//example.com/x', '../../../etc/passwd', '%2e%2e/%2e%2e/%2e%2e/x', '../../.git/config', '%2fetc/passwd']) assert.equal(core.resolvePath(base, path), null, path);
  const html = core.markdown('# <img onerror=bad()>\n| <img onerror=bad()> |\n- <script>bad()</script>\n[x](javascript:bad)\n[웹](https://example.com/?q=%22)', base);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  const table = core.markdown('| ID | 유형 | 긴 설명 |\n|---|---|---|\n| T-1 | unit | 긴 내용 |', base);
  assert.match(table, /<div class="table-frame">/);
  assert.match(table, /<th scope="col">ID<\/th>/);
  assert.match(table, /<td>T-1<\/td>/);
  for (const header of ['#','ID','유형','검증 기준']) assert.equal(core.isCompactHeader(header), true);
  assert.equal(core.isCompactHeader('긴 설명'), false);
  assert.equal(core.isCompactValue('T-1'), true);
  assert.equal(core.isCompactValue('unit'), true);
  assert.equal(core.isCompactValue('긴 셀은 정상 줄바꿈'), false);
  assert.equal(core.clampColumnWidth(20), 72);
  assert.equal(core.clampColumnWidth(200), 200);
  assert.equal(core.clampColumnWidth(2000), 1200);
  const hostile = core.markdown('<img onerror=bad()> [a](BR.md) `<b>`\n- [ ] <img onerror=bad()>\n![<img onerror=bad()>](x.png)\n[x](javascript://%0aalert(1))', base, () => 'blob:fixture');
  assert.ok(!hostile.includes('<img onerror'));
  assert.ok(!hostile.includes('<b>'));
  assert.ok(!hostile.includes('javascript:'));
  assert.ok(hostile.includes('&lt;img onerror=bad()&gt;'));
  assert.ok(hostile.includes('&lt;b&gt;'));
  assert.ok(hostile.includes('alt="&lt;img onerror=bad()&gt;"'));
  assert.ok(hostile.includes('type="checkbox" disabled'));

  const extra = core.markdown('**<img onerror=bad()>**\n[<img onerror=bad()>](BR.md)\n```\n<img onerror=bad()>\n```', base);
  assert.ok(!extra.includes('<img onerror'));
  assert.equal((extra.match(/&lt;img onerror=bad\(\)&gt;/g)||[]).length, 3);
  const sampleDir = 'backlogs/BL261026_01_샘플_백로그/';
  const actual = { catalog: [
    `${sampleDir}BACKLOG.md`,
    ...[1, 2, 3, 4, 5, 6, 7, 8].map(n => `${sampleDir}BR0${n}_브리프_${n}.md`),
    'backlogs/BL261027_01_다른_백로그/BR01_다른.md',
    'projects/P001_샘플/tasks/T01_조사/evidence/r1/BR01_인용.md',
  ] };
  assert.equal(core.humanName('BR08_2차_확장_후보.md'), '2차 확장 후보');
  assert.equal(core.humanName('BL261022_01 개인비서 에이전트 재구축 — 개요와 진행 현황'), '개인비서 에이전트 재구축');
  // Keep BR-to-task and project-table checks independent of repository history.
  // Archived locations are covered separately with an explicit backlog root.
  const fixtureRoot = 'backlogs/BL261022_01_fixture/BACKLOG.md';
  const fixtureBrief = 'backlogs/BL261022_01_fixture/BR08_후보.md';
  const fixtureTask = 'projects/P001_fixture/tasks/T08_후보/README.md';
  const fixtureFiles = {
    [fixtureRoot]: '## 진행 현황\n| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |\n|---|---|---|---|---|\n| BR08 | 완료 | — | P001/T08 | — |',
    [fixtureBrief]: '- 상태: 완료\n## 목표\n후보',
    'projects/P001_fixture/PROJECT.md': '| T08 | 후보 | 보류 | — |',
    [fixtureTask]: '- 상태: 완료',
  };
  assert.equal(core.status(fixtureFiles[fixtureBrief]), '완료');
  const b08Tasks = core.tasksForBrief(fixtureFiles, fixtureRoot, fixtureBrief, ['projects/P001_fixture/tasks/T07_미끼/TASK.md', fixtureTask]);
  assert.deepEqual([...b08Tasks], [fixtureTask]);
  assert.equal(core.taskStatus(fixtureFiles, b08Tasks[0]!), '보류');
  assert.match(core.selectedSections(fixtureFiles[fixtureBrief]), /## 목표/);
  const actualRoot = actual.catalog.find(p => /^backlogs\/BL261026_01_[^/]+\/BACKLOG\.md$/.test(p))!;
  const nestedFixtures = ['backlogs/BL1/BR01_real.md', 'backlogs/BL1/nested/BR02_example.md', 'projects/P001/tasks/T01/evidence/BR01_example.md'];
  assert.deepEqual([...core.briefPaths(nestedFixtures, base)], [nestedFixtures[0]]);
  const actualBriefs = core.briefPaths(actual.catalog, actualRoot);
  assert.equal(actualBriefs.length, 8);
  assert.ok(actualBriefs.some(p => /BR08_/.test(p)));
  assert.ok(actual.catalog.some(p => /projects\/.*\/evidence\/.*\/BR01_.*\.md$/.test(p)));
  assert.ok(actualBriefs.every(p => p.startsWith(actualRoot.slice(0, actualRoot.lastIndexOf('/') + 1))));
  assert.deepEqual([...core.backlogFilters].map(core.backlogLabel), ['발의','진행','완료','보류','기타','전체']);
  assert.equal(core.status('- 상태: 대기'), '대기');
  assert.equal(core.backlogLabel(core.status('- 상태: 대기')), '발의');
  assert.equal(core.status('- 상태: 완료 예정'), '기타');
  assert.equal(core.status('- 상태: 완료'), '완료');
  assert.equal(core.status('- 상태: 완료 (검증)'), '완료');
  assert.equal(core.status('- 상태: 진행 — 검토'), '진행');
  const files = {
    [base]: '# BL1\n## 진행 현황\n| 브리프 | 상태 | 선행 | 프로젝트 | 비고 |\n| BR01 | 완료 | — | P001/T01 | — |\n## 기록\n',
    'projects/P001_test/PROJECT.md': '# P001\n- 출처: 다른 항목',
    'projects/P002_test/PROJECT.md': '# P002\n- 출처: unrelated\n본문에서 BL1 언급',
    'projects/P003_test/PROJECT.md': '# P003\n- 출처: BL1',
    'projects/P001_test/log.jsonl': '{"ts":7,"msg":"bad"}\n{"ts":"2026-11-07T00:00:00Z","msg":"good"}\nnull',
  };
  const hierarchy = core.treeFor(['projects/P001_test/PROJECT.md','projects/P001_test/tasks/T01_a/TASK.md','projects/P001_test/tasks/T01_a/evidence/result.md','projects/P002_test/PROJECT.md'], 'projects/P001_test');
  assert.deepEqual([...hierarchy.files], ['projects/P001_test/PROJECT.md']);
  assert.ok(hierarchy.children.has('tasks'));
  const taskDir = hierarchy.children.get('tasks')!.children.get('T01_a')!;
  assert.deepEqual([...taskDir.files], ['projects/P001_test/tasks/T01_a/TASK.md']);
  assert.ok(taskDir.children.has('evidence'));
  const tasks = ['projects/P001_test/tasks/T01_a/TASK.md', 'projects/P003_test/tasks/T01_b/TASK.md', 'projects/P002_test/tasks/T01_c/TASK.md'];
  assert.deepEqual([...core.tasksForBrief(files, base, 'BR01_x.md', tasks)], [tasks[0]]);
  assert.deepEqual([...core.projectsFor(files, base)], ['projects/P001_test/PROJECT.md', 'projects/P003_test/PROJECT.md']);
  const reordered = { ...files, [base]: '# BL1\n## 진행 현황\n| 프로젝트 | 비고 | 브리프 |\n| P002/T01 | x | BR01 |\n' };
  assert.ok(core.projectsFor(reordered, base).includes('projects/P002_test/PROJECT.md'));
  assert.deepEqual([...core.tasksForBrief(reordered, base, 'BR01_x.md', tasks)], [tasks[2]]);
  const multiple = { ...files, [base]: '# BL1\n## 진행 현황\n| 브리프 | 프로젝트 |\n| BR01 | P001·P002 |\n' };
  assert.deepEqual([...core.tasksForBrief(multiple, base, 'BR01_x.md', tasks)], []);
  assert.deepEqual([...core.projectsForBrief(multiple, base, 'BR01_x.md')], ['P001','P002']);
  const single = { ...files, [base]: '# BL1\n## 진행 현황\n| 브리프 | 프로젝트 |\n| BR01 | P001 |\n' };
  assert.deepEqual([...core.tasksForBrief(single, base, 'BR01_x.md', tasks)], [tasks[0]]);
  const events = core.eventsFor(files, ['projects/P001_test/log.jsonl']);
  assert.equal(events.length, 3);
  assert.match(events[0]!.text, /good/);
  assert.match(events[1]!.text, /오류/);
  assert.match(events[2]!.text, /오류/);
});


test('dashboard opens generated data without a directory input', async () => {
  const { renderDashboardEntry } = await import('../src/project/dashboard-layout.ts');
  const html = renderDashboardEntry();
  const app = await readFile(resolve('src/dashboard/backlog/app.js'), 'utf8');
  assert.doesNotMatch(html, /webkitdirectory|id="folder"|id="connect"/i);
  assert.doesNotMatch(app, /webkitRelativePath|showDirectoryPicker|\$\('#folder'\)/);
  assert.match(app, /새로고침은 생성 자료를 다시 엽니다/);
});

test('CLI refresh targets the current repository and successful backlog changes refresh only active dashboards', async () => {
  const { runPace, tempDir } = await import('./helpers.ts');
  const root = tempDir('pace-dashboard-cli-');
  const home = tempDir('pace-dashboard-home-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init', '--allow-empty']).status, 0);
  const run = (...args: string[]) => runPace(['backlog', ...args], { home, cwd: root });
  assert.equal(run('init').status, 0);
  const created = run('new', '첫 백로그');
  assert.equal(created.status, 0);
  const backlog = created.stdout.trim().split('/').at(-1)!;
  let snapshot = await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  assert.match(snapshot, /첫 백로그/);
  assert.equal(run('brief', backlog, '첫 단계').status, 0);
  snapshot = await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  assert.match(snapshot, /첫 단계/);
  assert.equal(run('brief', '없는 백로그', '실패').status, 1);
  assert.equal(await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8'), snapshot);
  const gitRefresh = run('refresh');
  assert.equal(gitRefresh.status, 0);
  assert.match(gitRefresh.stdout, /Git 무시 파일 제외/);
  assert.equal(await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8'), snapshot);
  const other = tempDir('pace-dashboard-other-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', other]).status, 0);
  assert.equal(spawnSync('git', ['-C', other, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init', '--allow-empty']).status, 0);
  assert.equal(runPace(['backlog', 'new', '다른 곳'], { home, cwd: other }).status, 0);
  assert.equal(await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8'), snapshot);
  const skipped = runPace(['backlog', 'refresh'], { home, cwd: other });
  assert.equal(skipped.status, 0);
  assert.match(skipped.stdout, /건너뛰었습니다/);
  assert.match(skipped.stdout, /pace backlog init/);
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(join(other, 'backlogs/README.html')), false);
  assert.equal(existsSync(join(other, 'backlogs/dashboard/data.js')), false);
});

test('unsafe output link leaves external data intact and reports automatic refresh failure', async () => {
  const { runPace, tempDir } = await import('./helpers.ts');
  const root = tempDir('pace-dashboard-link-');
  const home = tempDir('pace-dashboard-home-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init', '--allow-empty']).status, 0);
  assert.equal(runPace(['backlog', 'init'], { home, cwd: root }).status, 0);
  const external = join(home, 'outside');
  await writeFile(external, 'untouched');
  await unlink(join(root, 'backlogs/dashboard/data.js'));
  await symlink(external, join(root, 'backlogs/dashboard/data.js'));
  const result = runPace(['backlog', 'new', '경고'], { home, cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /경고.*pace backlog (?:refresh|init)/);
  assert.equal(await readFile(external, 'utf8'), 'untouched');
});

test('automatic refresh reports partial installation and preserves existing files', async () => {
  const { runPace, tempDir } = await import('./helpers.ts');
  const root = tempDir('pace-dashboard-partial-auto-');
  const home = tempDir('pace-dashboard-home-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init', '--allow-empty']).status, 0);
  await mkdir(join(root, 'backlogs/dashboard'), { recursive: true });
  const app = join(root, 'backlogs/dashboard/app.js');
  await writeFile(app, 'USER_APP_MUST_SURVIVE');
  const result = runPace(['backlog', 'new', 'partial dashboard'], { home, cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /부분 설치.*pace backlog init/);
  assert.equal(await readFile(app, 'utf8'), 'USER_APP_MUST_SURVIVE');
  assert.equal(await readFile(join(root, 'backlogs/README.html')).catch(() => null), null);
});

test('concurrent refreshes publish complete parseable snapshots and leave no temporary files', async () => {
  const { readdir } = await import('node:fs/promises');
  const root = tempDir('pace-dashboard-parallel-');
  await mkdir(join(root, 'backlogs/dashboard'), { recursive: true });
  await writeFile(join(root, 'backlogs/README.html'), 'dashboard');
  await writeFile(join(root, 'backlogs/dashboard/data.js'), 'old');
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  const moduleUrl = new URL('../src/project/dashboard.ts', import.meta.url).href;
  const runs = Array.from({ length: 6 }, () => new Promise<number | null>((resolveRun) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import { generateDashboard } from ${JSON.stringify(moduleUrl)}; generateDashboard(process.argv[1]);`, root], { stdio: 'ignore' });
    child.on('close', resolveRun);
  }));
  assert.deepEqual(await Promise.all(runs), [0, 0, 0, 0, 0, 0]);
  const output = await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  const snapshot = (await import('node:vm')).runInNewContext(output + ';window.PACE_DATA', { window: {} });
  assert.equal(typeof snapshot.generated, 'string');
  assert.deepEqual((await readdir(join(root, 'backlogs/dashboard'))).filter((name) => name.endsWith('.tmp')), []);
});

test('a slow earlier writer cannot publish stale content after a later refresh', async () => {
  const { runPace, tempDir, PACE_BIN, sessionFreeEnv } = await import('./helpers.ts');
  const root = tempDir('pace-dashboard-order-');
  const home = tempDir('pace-dashboard-home-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init', '--allow-empty']).status, 0);
  assert.equal(runPace(['backlog', 'init'], { home, cwd: root }).status, 0);
  await mkdir(join(root, 'backlogs/BL1'), { recursive: true });
  const doc = join(root, 'backlogs/BL1/BACKLOG.md');
  await writeFile(doc, 'EARLIER');
  const marker = join(home, 'paused');
  const hook = join(home, 'hook.mjs');
  await writeFile(hook, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const old=fs.renameSync; fs.renameSync=(a,b)=>{ if(String(a).includes('.pace-data-')) { fs.writeFileSync(process.env.TEST_PAUSED, 'yes'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1500); } return old(a,b); }; syncBuiltinESMExports();`);
  const slow = spawn(process.execPath, [PACE_BIN, 'backlog', 'refresh'], { cwd: root, env: { ...sessionFreeEnv(), HOME: home, PACE_HOME: home, NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`, TEST_PAUSED: marker }, stdio: 'ignore' });
  const finished = new Promise<number | null>((resolveRun) => slow.on('close', resolveRun));
  const { existsSync } = await import('node:fs');
  for (let i = 0; i < 300 && !existsSync(marker); i++) await new Promise((done) => setTimeout(done, 10));
  assert.ok(existsSync(marker));
  await writeFile(doc, 'LATEST');
  const fast = runPace(['backlog', 'refresh'], { home, cwd: root, timeout: 10000 });
  assert.equal(fast.status, 0, fast.stderr);
  assert.equal(await finished, 0);
  const output = await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  assert.match(output, /LATEST/);
  assert.doesNotMatch(output, /EARLIER/);
});

test('legacy script remains usable from its own checkout', async () => {
  const { cp, readdir } = await import('node:fs/promises');
  const root = tempDir('pace-dashboard-script-');
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, 'src/project'), { recursive: true });
  await mkdir(join(root, 'backlogs/dashboard'), { recursive: true });
  await cp(resolve('scripts/backlog-dashboard.ts'), join(root, 'scripts/backlog-dashboard.ts'));
  await cp(resolve('src/project/dashboard.ts'), join(root, 'src/project/dashboard.ts'));
  await mkdir(join(root, 'src/core'), { recursive: true });
  await cp(resolve('src/project/dashboard-layout.ts'), join(root, 'src/project/dashboard-layout.ts'));
  await cp(resolve('src/core/paths.ts'), join(root, 'src/core/paths.ts'));
  await cp(resolve('src/core/fsutil.ts'), join(root, 'src/core/fsutil.ts'));
  await writeFile(join(root, 'backlogs/README.html'), 'dashboard');
  await writeFile(join(root, 'backlogs/dashboard/data.js'), 'old');
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  const run = spawnSync(process.execPath, [join(root, 'scripts/backlog-dashboard.ts')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /자료 생성/);
  assert.match(await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8'), /window\.PACE_DATA/);
  assert.deepEqual((await readdir(join(root, 'backlogs/dashboard'))).filter((name) => name.endsWith('.tmp')), []);
});

test('a terminated writer leaves the previous snapshot and the next writer recovers its lock', async () => {
  const { runPace, tempDir, PACE_BIN, sessionFreeEnv } = await import('./helpers.ts');
  const { existsSync } = await import('node:fs');
  const root = tempDir('pace-dashboard-killed-'); const home = tempDir('pace-dashboard-home-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init', '--allow-empty']).status, 0);
  const initialized = runPace(['backlog', 'init'], { home, cwd: root });
  assert.equal(initialized.status, 0, initialized.stderr);
  const data = join(root, 'backlogs/dashboard/data.js');
  const previous = await readFile(data, 'utf8');
  await mkdir(join(root, 'backlogs/BL1'));
  await writeFile(join(root, 'backlogs/BL1/BACKLOG.md'), 'LATEST_AFTER_START');
  const marker = join(home, 'paused'); const hook = join(home, 'hook.mjs');
  await writeFile(hook, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const old=fs.renameSync; fs.renameSync=(a,b)=>{ if(String(a).includes('.pace-data-')) { fs.writeFileSync(process.env.TEST_PAUSED, 'yes'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000); } return old(a,b); }; syncBuiltinESMExports();`);
  const child = spawn(process.execPath, [PACE_BIN, 'backlog', 'refresh'], { cwd: root, env: { ...sessionFreeEnv(), HOME: home, PACE_HOME: home, NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`, TEST_PAUSED: marker }, stdio: 'ignore' });
  const finished = new Promise<void>((done) => child.on('close', () => done()));
  for (let i = 0; i < 300 && !existsSync(marker); i++) await new Promise((done) => setTimeout(done, 10));
  assert.ok(existsSync(marker)); child.kill('SIGKILL'); await finished;
  assert.equal(await readFile(data, 'utf8'), previous);
  const retry = runPace(['backlog', 'refresh'], { home, cwd: root, timeout: 10000 });
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(await readFile(data, 'utf8'), /LATEST_AFTER_START/);
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual((await readdir(join(root, 'backlogs/dashboard'))).filter(name => name.startsWith('.pace-')), []);
});

test('indexed snapshot uses index modes and blobs, skips large files, and ignores working-tree deletions', async () => {
  const { tempDir } = await import('./helpers.ts');
  const { unlink, readFile: read, symlink: makeLink } = await import('node:fs/promises');
  const root = tempDir('pace-dashboard-index-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  await mkdir(join(root, 'backlogs/dashboard'), { recursive: true });
  await mkdir(join(root, 'backlogs/BL1'), { recursive: true });
  await mkdir(join(root, 'projects/P1/evidence'), { recursive: true });
  await writeFile(join(root, 'backlogs/README.html'), 'dashboard');
  await writeFile(join(root, 'backlogs/dashboard/data.js'), 'old');
  await writeFile(join(root, 'backlogs/BL1/BACKLOG.md'), 'INDEX CONTENT');
  await writeFile(join(root, 'backlogs/BL1/staged-delete.md'), 'STAGED DELETE');
  await writeFile(join(root, 'projects/P1/evidence/large.png'), Buffer.alloc(9_000_000, 1));
  await makeLink('/outside', join(root, 'backlogs/BL1/link.md'));
  assert.equal(spawnSync('git', ['-C', root, 'add', '-A']).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init']).status, 0);
  await unlink(join(root, 'backlogs/BL1/BACKLOG.md'));
  await unlink(join(root, 'backlogs/BL1/staged-delete.md'));
  assert.equal(spawnSync('git', ['-C', root, 'add', '-u']).status, 0);
  assert.equal(spawnSync('git', ['-C', root, 'restore', '--staged', 'backlogs/BL1/BACKLOG.md']).status, 0);
  await writeFile(join(root, 'backlogs/BL1/untracked.md'), 'UNTRACKED');
  assert.ok(generateDashboard(root, true));
  const output = await read(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  const snap = (await import('node:vm')).runInNewContext(output + ';window.PACE_DATA', { window: {} });
  assert.equal(snap.files['backlogs/BL1/BACKLOG.md'], 'INDEX CONTENT');
  assert.equal(snap.files['backlogs/BL1/staged-delete.md'], undefined);
  assert.equal(snap.files['backlogs/BL1/untracked.md'], undefined);
  assert.equal(snap.files['backlogs/BL1/link.md'], undefined);
  assert.equal(snap.assets['projects/P1/evidence/large.png'], undefined);
  assert.ok(snap.skipped >= 1);
});

test('simultaneous stale-lock recovery serializes writers without leaving generated files', async () => {
  const { readdir } = await import('node:fs/promises');
  const root = tempDir('pace-dashboard-recovery-');
  await mkdir(join(root, 'backlogs/dashboard'), { recursive: true });
  await writeFile(join(root, 'backlogs/README.html'), 'dashboard');
  await writeFile(join(root, 'backlogs/dashboard/data.js'), 'old');
  await writeFile(join(root, 'backlogs/dashboard/.pace-refresh-lock'), '2147483647:dead');
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  const moduleUrl = new URL('../src/project/dashboard.ts', import.meta.url).href;
  const runs = Array.from({ length: 8 }, () => new Promise<number | null>((done) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `import { generateDashboard } from ${JSON.stringify(moduleUrl)}; generateDashboard(process.argv[1]);`, root], { stdio: 'ignore' });
    child.on('close', done);
  }));
  assert.deepEqual(await Promise.all(runs), Array(8).fill(0));
  assert.deepEqual((await readdir(join(root, 'backlogs/dashboard'))).filter(name => name.startsWith('.pace-')), []);
  const output = await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  assert.equal(typeof (await import('node:vm')).runInNewContext(output + ';window.PACE_DATA', { window: {} }).generated, 'string');
});

test('legacy ownerless lock is reported promptly with a safe recovery instruction', async () => {
  const { tempDir } = await import('./helpers.ts');
  const root = tempDir('pace-dashboard-legacy-lock-');
  await mkdir(join(root, 'backlogs/dashboard/.pace-refresh-lock'), { recursive: true });
  await writeFile(join(root, 'backlogs/README.html'), 'dashboard');
  await writeFile(join(root, 'backlogs/dashboard/data.js'), 'old');
  assert.equal(spawnSync('git', ['init', '-q', root]).status, 0);
  const start = Date.now();
  assert.throws(() => generateDashboard(root), /실행 중인 PACE이 없으면.*잠금을 제거/);
  assert.ok(Date.now() - start < 3000);
  assert.equal(await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8'), 'old');
});

test('termination before publishing a lock leaves no lock and a later writer removes the candidate', async () => {
  const { runPace, tempDir, PACE_BIN, sessionFreeEnv } = await import('./helpers.ts');
  const { existsSync } = await import('node:fs');
  const { readdir } = await import('node:fs/promises');
  const root = tempDir('pace-dashboard-early-kill-'); const home = tempDir('pace-dashboard-home-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init', '--allow-empty']).status, 0);
  const initialized = runPace(['backlog', 'init'], { home, cwd: root });
  assert.equal(initialized.status, 0, initialized.stderr);
  await mkdir(join(root, 'backlogs/BL1'));
  await writeFile(join(root, 'backlogs/BL1/BACKLOG.md'), 'LATEST_AFTER_RETRY');
  const marker = join(home, 'paused'); const hook = join(home, 'hook.mjs');
  await writeFile(hook, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module'; const old=fs.linkSync; fs.linkSync=(a,b)=>{ if(String(b).endsWith('.pace-refresh-lock')) { fs.writeFileSync(process.env.TEST_PAUSED, 'yes'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000); } return old(a,b); }; syncBuiltinESMExports();`);
  const child = spawn(process.execPath, [PACE_BIN, 'backlog', 'refresh'], { cwd: root, env: { ...sessionFreeEnv(), HOME: home, PACE_HOME: home, NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`, TEST_PAUSED: marker }, stdio: 'ignore' });
  const finished = new Promise<void>((done) => child.on('close', () => done()));
  for (let i = 0; i < 300 && !existsSync(marker); i++) await new Promise((done) => setTimeout(done, 10));
  assert.ok(existsSync(marker)); child.kill('SIGKILL'); await finished;
  assert.equal(existsSync(join(root, 'backlogs/dashboard/.pace-refresh-lock')), false);
  const retry = runPace(['backlog', 'refresh'], { home, cwd: root, timeout: 10000 });
  assert.equal(retry.status, 0, retry.stderr);
  assert.deepEqual((await readdir(join(root, 'backlogs/dashboard'))).filter(name => name.startsWith('.pace-')), []);
});

test('internal lock files do not change skipped counts or cause repeated output changes', async () => {
  const { tempDir } = await import('./helpers.ts');
  const root = tempDir('pace-dashboard-no-churn-');
  assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', root]).status, 0);
  await mkdir(join(root, 'backlogs/dashboard'), { recursive: true });
  await writeFile(join(root, 'backlogs/README.html'), 'dashboard');
  await writeFile(join(root, 'backlogs/dashboard/data.js'), 'old');
  assert.equal(spawnSync('git', ['-C', root, 'add', '-A']).status, 0);
  assert.equal(spawnSync('git', ['-C', root, '-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init']).status, 0);
  assert.ok(generateDashboard(root, true));
  const before = await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8');
  assert.ok(generateDashboard(root));
  assert.equal(await readFile(join(root, 'backlogs/dashboard/data.js'), 'utf8'), before);
});

test('backlog-specific project roots survive backlog and project archival', async () => {
  const vm = await import('node:vm');
  const context: Record<string, any> = { URL };
  vm.runInNewContext(await readFile(resolve('src/dashboard/backlog/core.js'), 'utf8'), context);
  const core = context.dashboardCore;
  const backlog = 'backlogs/backup/BL261108_99_archive/BACKLOG.md';
  const brief = 'backlogs/backup/BL261108_99_archive/BR01_a.md';
  const archived = 'projects/backup/P901_sample/PROJECT.md';
  const task = 'projects/backup/P901_sample/tasks/T01_example/TASK.md';
  const files = {
    [backlog]: '# archive\n- 프로젝트 기준 경로: projects/backup/\n## 진행 현황\n| 브리프 | 프로젝트 |\n| BR01 | P901/T01 |',
    [brief]: '# brief',
    [archived]: '# P901\n- 출처: BL261108_99_archive\n| T01 | example | 완료 | |',
    [task]: '# task\n- 상태: 진행',
    'projects/P901_sample/PROJECT.md': '# decoy\n- 출처: BL261108_99_archive',
    'projects/backup/P902_other/tasks/T01_a/evidence/P901_copy/PROJECT.md': '# decoy',
    'backlogs/BL261108_98_active/BACKLOG.md': '# active',
  };
  assert.deepEqual([...core.backlogPaths(files)].sort(), [backlog, 'backlogs/BL261108_98_active/BACKLOG.md'].sort());
  assert.deepEqual([...core.projectsFor(files, backlog)], [archived]);
  assert.deepEqual([...core.tasksForBrief(files, backlog, brief, Object.keys(files))], [task]);
  assert.equal(core.taskStatus(files, task), '완료');
  assert.equal(core.projectId(archived), 'P901');
  assert.equal(core.backlogId(backlog), 'BL261108_99');
  assert.equal(core.projectRoot(files, backlog), 'projects/backup/');
  assert.equal(core.projectRoot(files, 'backlogs/BL261108_98_active/BACKLOG.md'), 'projects/');
  assert.equal(core.resolveDocumentPath(files, brief, '../../projects/P901_sample/PROJECT.md', backlog), archived);
  assert.equal(core.resolveDocumentPath(files, archived, '../../backlogs/BL261108_99_archive/BR01_a.md', backlog), brief);
  for (const bad of ['../outside/', '/tmp/projects/', 'https://example.com/', 'projects/../outside/', 'projects/.private/']) {
    const invalid = { ...files, [backlog]: `- 프로젝트 기준 경로: ${bad}\n## 진행 현황\n| 브리프 | 프로젝트 |\n| BR01 | P901 |` };
    assert.equal(core.projectRoot(invalid, backlog), null, bad);
    assert.deepEqual([...core.projectsFor(invalid, backlog)], []);
  }
  assert.equal(core.safePath('backlogs/backup/BL1/sources/raw.md'), false);
  assert.equal(core.resolveDocumentPath(files, archived, 'https://example.com/a', backlog), null);
});


test('shared screen reports missing project data without discarding recovery guidance', async () => {
  const vm = await import('node:vm');
  const document = { body: { innerHTML: 'loading' } };
  vm.runInNewContext(await readFile(resolve('src/dashboard/backlog/app.js'), 'utf8'), { window: {}, document });
  assert.match(document.body.innerHTML, /role="alert"/);
  assert.match(document.body.innerHTML, /pace backlog init.*pace backlog refresh/);
});

test('dashboard implementation status stays compact for multiple linked tasks', async () => {
  const vm = await import('node:vm');
  const code = await readFile(resolve('src/dashboard/backlog/core.js'), 'utf8');
  const sandbox: Record<string, unknown> = { URL };
  vm.runInNewContext(code, sandbox);
  const core = sandbox.dashboardCore as { implementationStatus(states: string[], linked: boolean): string };
  assert.equal(core.implementationStatus(Array(5).fill('완료'), true), '완료');
  assert.equal(core.implementationStatus(Array(20).fill('완료'), true), '완료');
  assert.equal(core.implementationStatus(['진행', '진행'], true), '진행');
  assert.equal(core.implementationStatus(['완료', '대기'], true), '상태 혼합');
  assert.equal(core.implementationStatus(['진행', '보류', '완료'], true), '상태 혼합');
  assert.equal(core.implementationStatus([], true), '작업 미지정');
  assert.equal(core.implementationStatus([], false), '미연결');
});
