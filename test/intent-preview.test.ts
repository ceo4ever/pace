import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { createPreview, normalizeInlineScript, verifyPreview, type PreviewOptions } from '../src/intent/preview.ts';
import { intentSkillDir } from '../src/intent/lens.ts';
import { PACE_BIN, preserveTestTemp, runPace, sessionFreeEnv, spawnTestChild, tempDir } from './helpers.ts';
import { cleanOwnedProfile, OwnedTempObserver } from './preview-owned.ts';
// The sealed Canvas bundle is JavaScript without TypeScript declarations.
// @ts-expect-error bundled runtime has no declarations
import { ChromeError, findChrome } from '../skills/pace-canvas-skills/runtime/chrome.mjs';

/** The real CLI cannot start until its Windows CIM observer has initialized. */
const GATED_PREVIEW = `
  import { pathToFileURL } from 'node:url';
  const nonce = process.env.PACE_PREVIEW_TEST_GATE_NONCE;
  const token = await new Promise((resolve, reject) => {
    let input = '';
    const timer = setTimeout(() => { cleanup(); reject(new Error('preview gate timed out')); }, 20000);
    const cleanup = () => { clearTimeout(timer); process.stdin.off('data', data); process.stdin.off('end', ended); process.stdin.pause(); };
    const ended = () => { cleanup(); reject(new Error('preview gate closed before GO')); };
    const data = (chunk) => {
      input += chunk;
      if (input.length > 256) { cleanup(); reject(new Error('invalid preview GO')); }
      else if (input.includes('\\n')) { cleanup(); resolve(input.trim()); }
    };
    process.stdin.setEncoding('utf8'); process.stdin.on('data', data); process.stdin.once('end', ended);
  });
  if (!nonce || token !== nonce) throw new Error('invalid preview GO nonce');
  const [entry, ...args] = process.argv.slice(1);
  process.argv = [process.execPath, entry, ...args];
  await import(pathToFileURL(entry).href);
`;

function waitForMonitorReady(monitor: ChildProcess, child: ChildProcess, nonce: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const finish = (error?: Error) => {
      clearTimeout(timer);
      monitor.stdout!.off('data', data);
      monitor.off('close', monitorClosed); monitor.off('error', failed);
      child.off('close', childClosed); child.off('error', failed);
      if (error) reject(error); else resolve();
    };
    const failed = (error: Error) => finish(error);
    const monitorClosed = () => finish(new Error('Chrome observer exited before READY'));
    const childClosed = () => finish(new Error('preview child exited before READY'));
    const data = (chunk: Buffer) => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (!line.startsWith('READY ')) continue;
        const prefix = `READY ${nonce} root=${child.pid} created=`;
        const dates = line.startsWith(prefix) ? line.slice(prefix.length).split(' at=') : [];
        if (dates.length !== 2 || dates.some((value) => !Number.isFinite(Date.parse(value)))) {
          finish(new Error('invalid Chrome observer READY nonce or root')); return;
        }
        finish(); return;
      }
    };
    const timer = setTimeout(() => finish(new Error('Chrome observer READY timed out')), timeoutMs);
    monitor.stdout!.on('data', data);
    monitor.once('close', monitorClosed); monitor.once('error', failed);
    child.once('close', childClosed); child.once('error', failed);
    if (monitor.exitCode !== null || monitor.signalCode !== null) monitorClosed();
    else if (child.exitCode !== null || child.signalCode !== null) childClosed();
  });
}

test('Chrome observer READY gate rejects invalid nonce, early exits and timeout before rendering', async (t) => {
  for (const mode of ['wrong-nonce', 'monitor-exit', 'child-exit', 'timeout'] as const) {
    await t.test(mode, async () => {
      const out = tempDir('pace-preview-gate-');
      const entry = join(out, 'entry.mjs'), marker = join(out, 'rendered');
      writeFileSync(entry, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started');`);
      const nonce = randomBytes(16).toString('hex');
      const child = spawnTestChild(process.execPath, mode === 'child-exit' ? ['-e', 'process.exit(0)'] : ['--input-type=module', '-e', GATED_PREVIEW, entry], {
        env: { ...sessionFreeEnv(), PACE_PREVIEW_TEST_GATE_NONCE: nonce }, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
      });
      const childClosed = new Promise((resolve) => child.once('close', resolve));
      const script = mode === 'wrong-nonce'
        ? `console.log('READY wrong root=${child.pid} created='+new Date().toISOString()+' at='+new Date().toISOString()); setInterval(()=>{},1000)`
        : mode === 'monitor-exit' ? 'process.exit(0)' : 'setInterval(()=>{},1000)';
      const monitor = spawnTestChild(process.execPath, ['-e', script], { env: sessionFreeEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const monitorClosed = new Promise((resolve) => monitor.once('close', resolve));
      try {
        await assert.rejects(waitForMonitorReady(monitor, child, nonce, mode === 'timeout' ? 50 : 5000), /nonce|exited before READY|READY timed out/);
        assert.equal(existsSync(marker), false, 'renderer entry must remain behind the gate');
      } finally {
        child.kill(); monitor.kill();
        await Promise.all([childClosed, monitorClosed]);
      }
    });
  }
});

function fixture() {
  const out = tempDir('pace-preview-'); mkdirSync(join(out, 'canvas'));
  const plan = JSON.parse(readFileSync(join(intentSkillDir, 'templates/_example/canvas-plan.json'), 'utf8'));
  plan.canvas[0].links.push({ element: 'not-linked', unlinked: true });
  writeFileSync(join(out, 'plan.json'), JSON.stringify(plan));
  cpSync('skills/pace-canvas-skills/document/examples/two-screens.canvas.json', join(out, 'canvas/ui.canvas.json'));
  return out;
}
function png(w: number, h: number) { const b = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.write('IHDR', 12); b.writeUInt32BE(w,16); b.writeUInt32BE(h,20); return b; }
function fake(change?: (show: Record<string, unknown>) => void): NonNullable<PreviewOptions['run']> {
  return (tool, args) => {
    if (tool.endsWith('read.mjs')) {
      const show = { base: { id: args[2], type: 'frame', name: 'Screen' }, rows: [
        { id: args[2], type: 'frame', name: 'Screen', depth: 0, place: { x: 0, y: 0, w: 100, h: 100, rotation: 0 }, source: 'stored', clip: true },
        { id: 'button-1', type: 'rect', name: 'Go', depth: 1, place: { x: 10, y: 20, w: 30, h: 40, rotation: 0 }, source: 'stored' },
        { id: 'not-linked', type: 'rect', name: 'Pending', depth: 1, place: { x: 50, y: 20, w: 20, h: 20, rotation: 0 }, source: 'stored' },
      ], omitted: 0, warnings: [] };
      change?.(show); return JSON.stringify(show);
    }
    const scale = Number(args[args.indexOf('--scale') + 1]); const dir = args[args.indexOf('--out') + 1]!;
    const file = join(dir, 'result.png'); writeFileSync(file, png(100 * scale, 100 * scale));
    return JSON.stringify({ node: { id: args[1], name: 'Screen', w: 100, h: 100, rotation: 0 }, scale, pixels: { w: 100 * scale, h: 100 * scale }, box: { x: 0, y: 0, w: 100, h: 100 }, imageOrigin: { x: 0, y: 0 }, files: { png: file }, warnings: [] });
  };
}

test('생성·검증·stale 재생성은 연결과 미연결 및 두 배율 경계를 보존한다', () => {
  const out = fixture(); createPreview(out, { run: fake(), scale: 1 }); verifyPreview(out);
  const first = JSON.parse(readFileSync(join(out, 'preview-map.json'), 'utf8'));
  assert.equal(first.screens[0].links[0].x, 10); assert.equal(first.screens[0].links[0].w, 30);
  assert.equal(first.screens[0].links[1].unlinked, true);
  createPreview(out, { run: fake(), scale: 2 }); verifyPreview(out);
  const second = JSON.parse(readFileSync(join(out, 'preview-map.json'), 'utf8'));
  assert.equal(second.screens[0].links[0].x, first.screens[0].links[0].x);
  assert.equal(second.screens[0].links[0].w, first.screens[0].links[0].w);
  writeFileSync(join(out, 'plan.json'), readFileSync(join(out, 'plan.json'), 'utf8') + ' ');
  assert.throws(() => verifyPreview(out), /stale/);
  createPreview(out, { run: fake() }); verifyPreview(out);
});

test('기존 화면 근거는 출력 폴더가 아닌 지정한 제품 저장소에서 확인한다', () => {
  const out = fixture(), product = tempDir('pace-product-');
  const planPath = join(out, 'plan.json'), plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.screens[0].status = '변경'; plan.screens[0].evidence = 'evidence.txt:1';
  writeFileSync(planPath, JSON.stringify(plan)); writeFileSync(join(product, 'evidence.txt'), '제품 근거\n');
  assert.throws(() => createPreview(out, { root: out, run: fake() }), /existing-evidence/);
  createPreview(out, { root: product, run: fake() }); verifyPreview(out);
});

test('preview CLI는 --root를 계획 근거 검사에 전달한다', () => {
  const out = fixture(), home = tempDir('pace-home-'), product = tempDir('pace-product-');
  const planPath = join(out, 'plan.json'), plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.screens.forEach((screen: { data: boolean }) => { screen.data = false; });
  plan.screens[0].status = '기존'; plan.screens[0].evidence = 'evidence.txt:1';
  plan.canvas = [{ screen: plan.screens[0].id, document: 'canvas/ui.canvas.json', frame: 'screen1', state: '기본', refs: [], links: [] }];
  writeFileSync(planPath, JSON.stringify(plan)); writeFileSync(join(product, 'evidence.txt'), '제품 근거\n');
  const env = { CHROME_PATH: join(home, 'missing-chrome') };
  const missing = runPace(['intent', 'preview', out], { home, cwd: home, env });
  assert.equal(missing.status, 1); assert.match(missing.stderr, /existing-evidence/);
  const found = runPace(['intent', 'preview', out, '--root', product], { home, cwd: home, env });
  assert.equal(found.status, 1); assert.match(found.stderr, /Chrome 실행 경로/);
});

test('잠금 생성의 권한 오류는 기존 잠금으로 오인하지 않고 원인을 보존한다', () => {
  const out = fixture(), original = Object.assign(new Error(`denied ${out}`), { code: 'EACCES' });
  assert.throws(() => createPreview(out, { run: fake(), openLock: () => { throw original; } }), (error: unknown) => {
    const e = error as Error & { code?: string; cause?: unknown };
    assert.equal(e.code, 'EACCES'); assert.equal(e.cause, original); assert.ok(!e.message.includes(out));
    return true;
  });
});

test('CSP 스크립트 해시는 브라우저의 HTML 줄바꿈 정규화와 일치한다', () => {
  assert.equal(normalizeInlineScript('\uFEFFone\r\ntwo\rthree\n'), 'one\ntwo\nthree\n');
  const out = fixture(); createPreview(out, { run: fake() });
  const html = readFileSync(join(out, 'preview.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const expected = html.match(/script-src 'sha256-([^']+)'/)?.[1];
  assert.ok(script); assert.ok(expected); assert.equal(script.includes('\r'), false);
  assert.equal(createHash('sha256').update(script.replace(/\r\n?/g, '\n')).digest('base64'), expected);
});

test('CRLF 템플릿 사본도 브라우저가 계산할 CSP 해시로 미리보기를 생성한다', async () => {
  const root = tempDir('pace-csp-checkout-');
  for (const path of ['src', 'skills/pace-intent', 'skills/pace-canvas-skills', 'templates/intent-preview', 'package.json']) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); cpSync(path, join(root, path), { recursive: true });
  }
  const template = join(root, 'templates/intent-preview/preview.js');
  const lf = readFileSync(template, 'utf8').replace(/\r\n?/g, '\n');
  writeFileSync(template, lf.replace(/\n/g, '\r\n'));
  const isolated = await import(pathToFileURL(join(root, 'src/intent/preview.ts')).href);
  const out = fixture(); isolated.createPreview(out, { run: fake() }); isolated.verifyPreview(out);
  const html = readFileSync(join(out, 'preview.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const expected = html.match(/script-src 'sha256-([^']+)'/)?.[1];
  assert.ok(script); assert.ok(expected); assert.equal(script.includes('\r'), false);
  assert.equal(createHash('sha256').update(script.replace(/\r\n?/g, '\n')).digest('base64'), expected);
});

test('사용자 파일·부분 결과·변조는 보존하고 충돌로 실패한다', () => {
  const out = fixture(); writeFileSync(join(out, 'preview.html'), 'user');
  assert.throws(() => createPreview(out, { run: fake() }), /conflict/);
  assert.equal(readFileSync(join(out, 'preview.html'), 'utf8'), 'user'); rmSync(join(out, 'preview.html'));
  createPreview(out, { run: fake() });
  const map = join(out, 'preview-map.json'); writeFileSync(map, readFileSync(map, 'utf8') + ' ');
  // whitespace alone does not change canonical map; a value change does.
  const obj = JSON.parse(readFileSync(map, 'utf8')); obj.marker = 'changed'; writeFileSync(map, JSON.stringify(obj));
  assert.throws(() => createPreview(out, { run: fake() }), /conflict/);
  assert.equal(JSON.parse(readFileSync(map, 'utf8')).marker, 'changed');
});

test('누락 요소·회전·불완전 출력·렌더 실패는 기존 결과를 보존한다', () => {
  const out = fixture(); createPreview(out, { run: fake() });
  const before = readFileSync(join(out, 'preview.html'));
  const cases = [
    fake((s) => { (s as { omitted: number }).omitted = 1; }),
    fake((s) => { (s as { warnings: string[] }).warnings = ['font "x" is not installed here; text is drawn with a fallback font']; }),
    fake((s) => { (s as { rows: { place: { rotation: number } }[] }).rows[1]!.place.rotation = 20; }),
    fake((s) => { (s as { rows: { id: string }[] }).rows[1]!.id = 'missing'; }),
    fake((s) => { (s as { rows: { source: string }[] }).rows[1]!.source = 'computed'; }),
    fake((s) => { (s as { rows: { place: { x: number } }[] }).rows[1]!.place.x = 99; }),
    fake((s) => { const rows = (s as { rows: { clip?: boolean; place: { x: number } }[] }).rows; rows[0]!.clip = false; rows[1]!.place.x = 99; }),
    () => { throw new Error('Chrome unavailable'); },
  ];
  for (const run of cases) { assert.throws(() => createPreview(out, { run })); assert.deepEqual(readFileSync(join(out, 'preview.html')), before); }
});

test('clip 없는 프레임 밖 요소는 이미지 확장 영역 안에 있어도 거부한다', () => {
  const out = fixture();
  const base = fake((s) => {
    const rows = (s as { rows: { clip?: boolean; place: { x: number; w: number } }[] }).rows;
    rows[0]!.clip = false; rows[1]!.place.x = 90; rows[1]!.place.w = 20;
  });
  const run: NonNullable<PreviewOptions['run']> = (tool, args, cwd) => {
    const result = base(tool, args, cwd); if (tool.endsWith('read.mjs')) return result;
    const render = JSON.parse(result); render.imageOrigin = { x: -10, y: -10 };
    render.box = { x: -10, y: -10, w: 120, h: 120 };
    render.pixels = { w: 120 * render.scale, h: 120 * render.scale };
    writeFileSync(render.files.png, png(render.pixels.w, render.pixels.h)); return JSON.stringify(render);
  };
  assert.throws(() => createPreview(out, { run }), /프레임 밖/);
});

test('설명 레이어가 직속인 보드는 제품 프레임으로 렌더하지 않는다', () => {
  const out = fixture();
  const run = fake((s) => { (s as { rows: { name: string }[] }).rows[1]!.name = '설명 패널'; });
  assert.throws(() => createPreview(out, { run }), /보드는 제품 프레임이 아니다/);
  assert.equal(existsSync(join(out, 'preview.html')), false);
});

test('글꼴 대체 경고만 보존하고 나머지 렌더 경고를 거부한다', () => {
  const warning = (name: string) => `font "${name}" is not installed here; text is drawn with a fallback font`;
  const withWarnings = (warnings: unknown): NonNullable<PreviewOptions['run']> => {
    const base = fake(); return (tool, args, cwd) => {
      const result = base(tool, args, cwd); if (tool.endsWith('read.mjs')) return result;
      const render = JSON.parse(result); render.warnings = warnings; return JSON.stringify(render);
    };
  };
  const out = fixture(); createPreview(out, { run: withWarnings([warning('Apple SD Gothic Neo'), warning('<img src=x>')]) });
  verifyPreview(out);
  const map = JSON.parse(readFileSync(join(out, 'preview-map.json'), 'utf8'));
  assert.deepEqual(map.screens[0].fontWarnings.map((w: { font: string }) => w.font), ['Apple SD Gothic Neo', '<img src=x>']);
  assert.deepEqual(map.renderEnvironment, { platform: process.platform, arch: process.arch, node: process.version });
  const html = readFileSync(join(out, 'preview.html'), 'utf8');
  assert.ok(!html.includes('<img src=x>')); assert.match(html, /글꼴이 대체되어 표시됩니다/);
  const before = readFileSync(join(out, 'preview.html'));
  for (const warnings of [[warning('ok'), 'image abcdef123456 is missing; it is drawn empty'], [null], 'bad', [warning('a\nb')], [warning('a\u0085b')], [warning('a"b')], ['prefix' + warning('a')], [warning('a') + 'suffix'], [warning('a') + '\n'], [warning('a'.repeat(201))], Array(65).fill(warning('a'))]) {
    assert.throws(() => createPreview(out, { run: withWarnings(warnings) }), /지원하지 않는 렌더 경고/);
    assert.deepEqual(readFileSync(join(out, 'preview.html')), before);
  }
  createPreview(out, { run: withWarnings(Array(64).fill(warning('a'.repeat(200)))) });
  assert.equal(JSON.parse(readFileSync(join(out, 'preview-map.json'), 'utf8')).screens[0].fontWarnings.length, 64);
  for (const change of ['show-warning', 'size', 'clip']) {
    const base = withWarnings([warning('Apple SD Gothic Neo')]);
    const run: NonNullable<PreviewOptions['run']> = (tool, args, cwd) => {
      const result = base(tool, args, cwd); const data = JSON.parse(result);
      if (tool.endsWith('read.mjs')) {
        if (change === 'show-warning') data.warnings = ['warning'];
        if (change === 'clip') {
          data.rows[1].depth = 2;
          data.rows.splice(1, 0, { id: 'clip-parent', type: 'frame', name: 'Clip', depth: 1, place: { x: 10, y: 10, w: 20, h: 60, rotation: 0 }, source: 'stored', clip: true });
        }
      } else if (change === 'size') data.node.w++;
      return JSON.stringify(data);
    };
    const expected = change === 'clip' ? /클리핑된 요소/ : change === 'size' ? /렌더 크기가 읽기 결과와 다르다/ : /Canvas 읽기 출력이 불완전하거나 경고가 있다/;
    assert.throws(() => createPreview(out, { run }), expected);
  }
  createPreview(out, { run: withWarnings([]) });
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'preview-map.json'), 'utf8')).screens[0].fontWarnings, []);
});

test('이미지·HTML 변경, 사용자 충돌과 원본 생성 중 변경을 구분해 보존한다', () => {
  const out = fixture(); createPreview(out, { run: fake() });
  const image = join(out, 'canvas/renders/screen-0001.png');
  const original = readFileSync(image); writeFileSync(image, Buffer.concat([original, Buffer.from('changed')]));
  assert.throws(() => verifyPreview(out), /conflict/);
  assert.throws(() => createPreview(out, { run: fake() }), /conflict/);
  writeFileSync(image, original);
  const html = join(out, 'preview.html'); const htmlBytes = readFileSync(html);
  writeFileSync(html, Buffer.concat([htmlBytes, Buffer.from('changed')]));
  assert.throws(() => verifyPreview(out), /conflict/); writeFileSync(html, htmlBytes);
  const runner = fake(); let changed = false;
  assert.throws(() => createPreview(out, { run: (tool, args, cwd) => { const result = runner(tool, args, cwd); if (!changed) { changed = true; writeFileSync(join(out, 'plan.json'), readFileSync(join(out, 'plan.json'), 'utf8') + ' '); } return result; } }), /stale/);
  assert.deepEqual(readFileSync(html), htmlBytes);
});

test('Canvas 문자열은 실행되지 않고 템플릿 표지를 다시 치환하지 않는다', () => {
  const out = fixture();
  const name = '</script>@@SCRIPT@@ $\' $` <meta name="pace-preview-map-sha256" content="x">';
  createPreview(out, { run: fake((s) => { (s as { rows: { name: string }[] }).rows[1]!.name = name; }) });
  const html = readFileSync(join(out, 'preview.html'), 'utf8');
  assert.ok(html.includes('@@SCRIPT@@'));
  assert.ok(!html.includes('</script>@@SCRIPT@@'));
  assert.equal((html.match(/<meta name="pace-preview-map-sha256"/g) ?? []).length, 1);
  const data = /<script type="application\/json" id="preview-data">(.*?)<\/script>/s.exec(html);
  assert.ok(data); assert.equal(JSON.parse(data[1]!).screens[0].links[0].name, name);
  verifyPreview(out);
});

test('화면을 줄였다가 다시 늘려도 이전 소유 이미지를 보존하고 재사용한다', () => {
  const out = fixture(); createPreview(out, { run: fake() });
  const path = join(out, 'plan.json'), initial = readFileSync(path, 'utf8');
  const plan = JSON.parse(initial); plan.screens.forEach((s: { data: boolean }) => { s.data = false; });
  plan.canvas = [plan.canvas[0]]; plan.canvas[0].links = [];
  writeFileSync(path, JSON.stringify(plan)); createPreview(out, { run: fake() });
  assert.ok(existsSync(join(out, 'canvas/renders/screen-0003.png'))); verifyPreview(out);
  writeFileSync(path, initial); createPreview(out, { run: fake() }); verifyPreview(out);
});

test('경로 링크와 사용자 이름 충돌은 외부 파일을 변경하지 않는다', () => {
  const out = fixture(), outside = tempDir('pace-preview-outside-');
  const external = join(outside, 'outside.canvas.json'); writeFileSync(external, 'untouched');
  const planPath = join(out, 'plan.json'); const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.canvas.forEach((c: { document: string }) => { c.document = 'canvas/link.canvas.json'; });
  writeFileSync(planPath, JSON.stringify(plan));
  try { symlinkSync(external, join(out, 'canvas/link.canvas.json'), 'file'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') return; throw error; }
  assert.throws(() => createPreview(out, { run: fake() }), /링크/);
  assert.equal(readFileSync(external, 'utf8'), 'untouched');
});

async function withLockedFile(path: string, check: () => void): Promise<void> {
  const script = '$f=[IO.File]::Open($env:PACE_PREVIEW_TEST_LOCK,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); [Console]::WriteLine("ready"); [Console]::ReadLine() | Out-Null; $f.Dispose()';
  const locker = spawnTestChild('powershell.exe', ['-NoProfile', '-Command', script], { env: { ...sessionFreeEnv(), PACE_PREVIEW_TEST_LOCK: path }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { locker.kill(); reject(new Error('잠금 준비 시간 초과')); }, 10_000);
    locker.stdout!.once('data', () => { clearTimeout(timer); resolve(); });
    locker.once('error', (error) => { clearTimeout(timer); reject(error); });
    locker.once('exit', (code) => { clearTimeout(timer); reject(new Error(`잠금 프로세스 종료: ${code}`)); });
  });
  const closed = new Promise<number | null>((resolve) => locker.once('close', resolve));
  try { await ready; check(); }
  finally { locker.stdin!.end('\n'); await closed; }
}

test('Windows에서 열려 있는 기존 결과가 교체를 막으면 이전 결과를 보존한다', async () => {
  if (process.platform !== 'win32') return;
  const out = fixture(); createPreview(out, { run: fake() });
  const html = join(out, 'preview.html'), before = readFileSync(html);
  await withLockedFile(html, () => assert.throws(() => createPreview(out, { run: fake() }), /EPERM|EBUSY/));
  assert.deepEqual(readFileSync(html), before); verifyPreview(out);
});

test('잠긴 map은 오류 코드와 원인을 보존하고 CLI에서 경로를 노출하지 않는다', async () => {
  if (process.platform !== 'win32') return;
  const out = fixture(); createPreview(out, { run: fake() });
  const map = join(out, 'preview-map.json'), before = readFileSync(map);
  await withLockedFile(map, () => {
    assert.throws(() => verifyPreview(out), (error: unknown) => {
      const e = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
      assert.equal(e.code, 'EBUSY'); assert.equal(e.cause?.code, 'EBUSY');
      assert.doesNotMatch(e.message, /[A-Za-z]:[\\/]/); return true;
    });
    const result = runPace(['intent', 'preview', out, '--verify'], { home: tempDir('pace-preview-cli-') });
    assert.equal(result.status, 1); assert.match(result.stderr, /EBUSY/);
    assert.ok(!result.stderr.includes(out));
  });
  assert.deepEqual(readFileSync(map), before); verifyPreview(out);
});

test('잠긴 HTML과 PNG 읽기 오류도 코드와 원인을 보존하며 경로를 숨긴다', async () => {
  if (process.platform !== 'win32') return;
  const out = fixture(); createPreview(out, { run: fake() });
  for (const path of [join(out, 'preview.html'), join(out, 'canvas/renders/screen-0001.png')]) {
    const before = readFileSync(path);
    await withLockedFile(path, () => {
      assert.throws(() => verifyPreview(out), (error: unknown) => {
        const e = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
        assert.equal(e.code, 'EBUSY'); assert.equal(e.cause?.code, 'EBUSY');
        assert.ok(!e.message.includes(out)); return true;
      });
      const result = runPace(['intent', 'preview', out, '--verify'], { home: tempDir('pace-preview-cli-') });
      assert.equal(result.status, 1); assert.match(result.stderr, /EBUSY/); assert.ok(!result.stderr.includes(out));
    });
    assert.deepEqual(readFileSync(path), before);
  }
  verifyPreview(out);
});

test('잠긴 plan과 Canvas는 생성·검증에서 경로 없이 코드와 원인을 전달한다', async () => {
  if (process.platform !== 'win32') return;
  const out = fixture(); createPreview(out, { run: fake() });
  for (const path of [join(out, 'plan.json'), join(out, 'canvas/ui.canvas.json')]) {
    const before = readFileSync(path), html = readFileSync(join(out, 'preview.html'));
    await withLockedFile(path, () => {
      for (const action of [() => verifyPreview(out), () => createPreview(out, { run: fake() })]) assert.throws(action, (error: unknown) => {
        const e = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
        assert.equal(e.code, 'EBUSY'); assert.equal(e.cause?.code, 'EBUSY'); assert.ok(!e.message.includes(out)); return true;
      });
      const result = runPace(['intent', 'preview', out, '--verify'], { home: tempDir('pace-preview-cli-') });
      assert.equal(result.status, 1); assert.match(result.stderr, /EBUSY/); assert.ok(!result.stderr.includes(out));
    });
    assert.deepEqual(readFileSync(path), before); assert.deepEqual(readFileSync(join(out, 'preview.html')), html);
  }
  verifyPreview(out);
});

test('Chrome 경로 오류는 도구 사유를 요약하고 입력 경로를 노출하지 않는다', () => {
  const out = fixture(), planPath = join(out, 'plan.json');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  plan.screens.forEach((s: { data: boolean }) => { s.data = false; });
  plan.canvas = [{ screen: plan.screens[0].id, document: 'canvas/ui.canvas.json', frame: 'screen1', state: '기본', refs: [], links: [] }];
  writeFileSync(planPath, JSON.stringify(plan));
  const hiddenPath = join(out, 'private-chrome-missing.exe');
  const result = runPace(['intent', 'preview', out], { home: tempDir('pace-preview-cli-'), env: { CHROME_PATH: hiddenPath }, timeout: 30_000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /Canvas 도구 실패 \(5\).*Chrome 실행 경로/);
  assert.ok(!result.stderr.includes(out)); assert.ok(!result.stderr.includes(hiddenPath));
  assert.ok(!existsSync(join(out, 'preview.html')));
});

test('교체 중 실패는 역순 복원하고 사용자가 둔 추가 이미지를 보존한다', () => {
  const out = fixture(); createPreview(out, { run: fake() });
  const before = readFileSync(join(out, 'preview.html'));
  writeFileSync(join(out, 'canvas/renders/user.png'), 'mine');
  let count = 0;
  assert.throws(() => createPreview(out, { run: fake(), rename: (from, to) => {
    const staged = [from, to].find((p) => p.includes('.pace-preview-work-'))!;
    const journal = join(dirname(staged), 'journal.json');
    assert.ok(existsSync(journal), '각 rename 전에 journal이 기록돼야 한다');
    if (++count === 4) throw Object.assign(new Error('private path'), { code: 'EBUSY' }); requireRename(from, to);
  } }), (error: unknown) => {
    const e = error as NodeJS.ErrnoException & { cause?: Error }; assert.equal(e.code, 'EBUSY'); assert.equal(e.cause?.message, 'private path'); assert.ok(!e.message.includes('private path')); return true;
  });
  assert.deepEqual(readFileSync(join(out, 'preview.html')), before); verifyPreview(out);
  assert.equal(readFileSync(join(out, 'canvas/renders/user.png'), 'utf8'), 'mine');
});

test('교체와 복원이 모두 실패하면 양쪽 원인과 복구 자료를 보존한다', () => {
  const out = fixture(); createPreview(out, { run: fake() }); let count = 0;
  assert.throws(() => createPreview(out, { run: fake(), rename: (from, to) => {
    count++; if (count === 4 || count === 5) throw Object.assign(new Error(`private ${count}`), { code: 'EBUSY' });
    requireRename(from, to);
  } }), (error: unknown) => {
    const e = error as Error & { cause?: AggregateError }; assert.match(e.message, /교체 및 복원 실패/);
    assert.ok(!e.message.includes(out)); assert.equal(e.cause?.errors.length, 2); return true;
  });
  const work = readdirSync(out).find((name) => name.startsWith('.pace-preview-work-'));
  assert.ok(work); assert.ok(existsSync(join(out, work, 'journal.json'))); assert.ok(existsSync(join(out, '.pace-preview.lock')));
  assert.throws(() => createPreview(out, { run: fake() }), /잠금/);
});
import { renameSync as requireRename } from 'node:fs';

test('실제 Canvas 도구로 프레임을 렌더하고 소유 Chrome과 프로필을 회수한다', async (t) => {
  try { findChrome(sessionFreeEnv()); }
  catch (error) {
    if (process.env.CHROME_PATH || !(error instanceof ChromeError)) throw error;
    t.skip('Chrome이 없어 실제 렌더·프로필 회수는 미검증'); return;
  }
  const out = fixture();
  const plan = JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8'));
  plan.screens.forEach((s: { data: boolean }) => { s.data = false; });
  const documentPath = join(out, 'canvas/ui.canvas.json');
  const doc = JSON.parse(readFileSync(documentPath, 'utf8'));
  const kit = JSON.parse(readFileSync('skills/pace-canvas-skills/document/examples/basic-kit.canvas.json', 'utf8'));
  const button = { ...kit.doc.nodes['basic-tokens-light-primary-swatch'], id: 'action', name: 'action', parentId: 'screen1', x: 20, y: 30, w: 80, h: 40 };
  delete button.bindings; button.fills = [{ type: 'solid', id: 'action-fill', color: '#2563EB', opacity: 1, visible: true }];
  doc.doc.nodes.action = button; doc.doc.nodes.screen1.children = ['action'];
  writeFileSync(documentPath, JSON.stringify(doc));
  plan.canvas = [{ screen: plan.screens[0].id, document: 'canvas/ui.canvas.json', frame: 'screen1', state: '기본', refs: [], links: [{ element: 'action', unlinked: true }] }];
  writeFileSync(join(out, 'plan.json'), JSON.stringify(plan));
  const chromeTemp = join(out, 'owned-chrome-temp'); mkdirSync(chromeTemp);
  const observerTemp = join(out, 'observer-temp'); mkdirSync(observerTemp);
  const testRoot = process.env.PACE_TEST_TMP_OWNER!;
  const observer = new OwnedTempObserver(testRoot, out, chromeTemp, observerTemp);
  let captureError: unknown;
  const capture = () => {
    try { observer.scan(); } catch (error) { captureError = error; }
  };
  const env = { ...sessionFreeEnv(), TMP: chromeTemp, TEMP: chromeTemp, TMPDIR: chromeTemp };
  const observerEnv = { ...sessionFreeEnv(), TMP: observerTemp, TEMP: observerTemp, TMPDIR: observerTemp };
  const gateNonce = randomBytes(16).toString('hex');
  const windows = process.platform === 'win32';
  const child = spawnTestChild(process.execPath, windows ? ['--input-type=module', '-e', GATED_PREVIEW, PACE_BIN, 'intent', 'preview', out] : [PACE_BIN, 'intent', 'preview', out], { env: { ...env, PACE_PREVIEW_TEST_GATE_NONCE: gateNonce }, windowsHide: true, stdio: [windows ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  const closed = (p: ChildProcess) => new Promise<number | null>((resolve) => p.once('close', resolve));
  const childClosed = closed(child);
  const captureTimer = setInterval(capture, 50);
  let stderr = ''; child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.stdin?.on('error', (error) => { stderr += `preview stdin: ${error.message}\n`; });
  if (!child.pid) { clearInterval(captureTimer); preserveTestTemp(); throw new Error('미리보기 자식 PID가 없다'); }
  writeFileSync(join(out, 'test-owner.json'), JSON.stringify({ testRoot, output: out, chromeTemp, observerTemp, childPid: child.pid, startedAt: new Date().toISOString() }, null, 2));
  if (process.platform !== 'win32') {
    const status = await childClosed;
    try { await observer.waitForFiles(20_000); if (captureError || status !== 0 || readdirSync(chromeTemp).length) throw new Error(`렌더/프로필 정리 실패: ${status}; ${stderr}; ${String(captureError ?? '')}`); }
    catch (error) { preserveTestTemp(); throw error; }
    finally { clearInterval(captureTimer); }
    verifyPreview(out); assert.ok(existsSync(join(out, 'canvas/renders/screen-0001.png')));
    return;
  }
  const script = `
    $RootPid=[int]$env:PACE_PREVIEW_TEST_ROOT_PID; $ProfileRoot=$env:PACE_PREVIEW_TEST_CHROME_TEMP
    $seen=@{}; $deadline=(Get-Date).AddSeconds(40); $goneAt=$null
    function Visit([int]$Parent,[bool]$Owned) {
      $children=@(Get-CimInstance Win32_Process -Filter "ParentProcessId = $Parent" -ErrorAction SilentlyContinue)
      foreach($p in $children) {
        $dirs=@(Get-ChildItem -LiteralPath $ProfileRoot -Directory -Filter 'canvas-tools-chrome-*' -ErrorAction SilentlyContinue | Where-Object { $p.CommandLine -and $p.CommandLine.Contains($_.FullName) })
        $isOwner=($p.Name -ieq 'chrome.exe' -and $p.CommandLine -and $p.CommandLine -like '*--canvas-skills-owner=*' -and $dirs.Count -eq 1)
        $belongs=$Owned -or $isOwner
        if($p.Name -ieq 'chrome.exe' -and $belongs) {
          $key=[string]$p.ProcessId
          if(-not $script:seen.ContainsKey($key)) {
            $script:seen[$key]=$p.CreationDate.ToString('o')
            $profile=if($dirs.Count -eq 1) { $dirs[0].FullName } else { '(unresolved)' }
            [Console]::WriteLine("observed pid=$key created=$($script:seen[$key]) profile=$profile owner-marker=$isOwner parent=$Parent at=$((Get-Date).ToUniversalTime().ToString('o'))")
          }
        }
        Visit ([int]$p.ProcessId) $belongs
      }
    }
    try {
      $root=@(Get-CimInstance Win32_Process -Filter "ProcessId = $RootPid" -ErrorAction Stop)
      if($root.Count -ne 1 -or -not $root[0].CreationDate) { throw 'preview root identity unavailable' }
      $rootCreated=$root[0].CreationDate.ToString('o')
      Visit $RootPid $false
      [Console]::WriteLine("READY $env:PACE_PREVIEW_TEST_GATE_NONCE root=$RootPid created=$rootCreated at=$((Get-Date).ToUniversalTime().ToString('o'))")
      [Console]::Out.Flush()
    } catch { [Console]::Error.WriteLine("Chrome observer initialization failed: $_"); exit 1 }
    $deadline=(Get-Date).AddSeconds(40)
    while((Get-Process -Id $RootPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Visit $RootPid $false; Start-Sleep -Milliseconds 100 }
    if($seen.Count -eq 0) { [Console]::Error.WriteLine('owned Chrome not observed'); exit 1 }
    $deadline=(Get-Date).AddSeconds(20)
    do {
      foreach($key in @($seen.Keys)) {
        $p=Get-CimInstance Win32_Process -Filter "ProcessId = $key" -ErrorAction SilentlyContinue
        if($p -and $p.CreationDate.ToString('o') -eq $seen[$key]) { Visit ([int]$key) $true }
      }
      $alive=@($seen.Keys | Where-Object { $p=Get-CimInstance Win32_Process -Filter "ProcessId = $_" -ErrorAction SilentlyContinue; $p -and $p.CreationDate.ToString('o') -eq $seen[$_] })
      $profiles=@(Get-ChildItem -LiteralPath $ProfileRoot -Force -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer })
      if($alive.Count -eq 0 -and $profiles.Count -eq 0) { Write-Output "owned Chrome observed=$($seen.Count); processes and profiles gone"; exit 0 }
      if($alive.Count -eq 0) {
        if(-not $goneAt) { $goneAt=Get-Date }
        elseif(((Get-Date)-$goneAt).TotalSeconds -ge 2) { Write-Output "owned Chrome observed=$($seen.Count); processes gone; upstream profiles remaining=$($profiles.Count)"; exit 0 }
      } else { $goneAt=$null }
      Start-Sleep -Milliseconds 200
    } while((Get-Date) -lt $deadline)
    [Console]::Error.WriteLine("owned Chrome/profile cleanup timed out: processes=$($alive.Count), profiles=$($profiles.Count), profileRoot=$ProfileRoot at=$((Get-Date).ToUniversalTime().ToString('o'))"); exit 1
  `;
  const monitor = spawnTestChild('powershell.exe', ['-NoProfile', '-Command', script], { env: { ...observerEnv, PACE_PREVIEW_TEST_ROOT_PID: String(child.pid), PACE_PREVIEW_TEST_CHROME_TEMP: chromeTemp, PACE_PREVIEW_TEST_GATE_NONCE: gateNonce }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const monitorClosed = closed(monitor);
  let monitorOutput = ''; monitor.stdout!.on('data', (chunk: Buffer) => { monitorOutput += chunk.toString(); }); monitor.stderr!.on('data', (chunk: Buffer) => { monitorOutput += chunk.toString(); });
  let releasedAt: string;
  try {
    await waitForMonitorReady(monitor, child, gateNonce);
    releasedAt = new Date().toISOString();
    await new Promise<void>((resolve, reject) => child.stdin!.end(`${gateNonce}\n`, (error?: Error | null) => error ? reject(error) : resolve()));
  } catch (error) {
    child.kill(); monitor.kill();
    await Promise.all([childClosed, monitorClosed]);
    clearInterval(captureTimer); preserveTestTemp();
    writeFileSync(join(out, 'test-monitor.log'), `gate failed at=${new Date().toISOString()}; ${String(error)}\n${stderr}\n${monitorOutput}`);
    throw error;
  }
  const [status, monitorStatus] = await Promise.all([childClosed, monitorClosed]);
  monitorOutput += `renderer GO at=${releasedAt}\n`;
  capture();
  writeFileSync(join(out, 'test-monitor.log'), `childClose=${status}; monitorClose=${monitorStatus}; observedAt=${new Date().toISOString()}\n${stderr}\n${monitorOutput}`);
  if (status !== 0 || monitorStatus !== 0 || captureError) { clearInterval(captureTimer); preserveTestTemp(); throw new Error(`실제 렌더/회수 실패: ${status}, ${monitorStatus}; 테스트 루트=${testRoot}; 출력=${out}; 프로필 루트=${chromeTemp}; ${stderr}; ${monitorOutput}; ${String(captureError ?? '')}`); }
  const observed = [...monitorOutput.matchAll(/observed pid=(\d+) created=([^ ]+) profile=(.+?) owner-marker=(True|False)/g)].map((m) => ({ pid: Number(m[1]), created: m[2]!, profile: m[3]!, owner: m[4] === 'True' }));
  const owners = observed.filter((p) => p.owner);
  if (owners.length !== 1 || observed.length === 0) { clearInterval(captureTimer); preserveTestTemp(); throw new Error(`소유 Chrome 식별 실패; 출력=${out}; ${monitorOutput}`); }
  const checkProcesses = async (): Promise<boolean> => {
    const check = `
      $items=ConvertFrom-Json $env:PACE_PREVIEW_TEST_PROCESSES
      $filter=($items | ForEach-Object { "ProcessId = $($_.pid)" }) -join ' OR '
      try { $found=@(Get-CimInstance Win32_Process -Filter $filter -ErrorAction Stop) }
      catch { [Console]::Error.WriteLine($_); exit 6 }
      foreach($item in $items) { if($found | Where-Object { $_.ProcessId -eq $item.pid -and $_.CreationDate.ToString('o') -eq $item.created }) { exit 5 } }
      exit 0
    `;
    const proc = spawnTestChild('powershell.exe', ['-NoProfile', '-Command', check], { env: { ...observerEnv, PACE_PREVIEW_TEST_PROCESSES: JSON.stringify(observed) }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = ''; proc.stderr!.on('data', (chunk: Buffer) => { error += chunk.toString(); });
    const timeout = setTimeout(() => proc.kill(), 6000);
    const code = await closed(proc); clearTimeout(timeout);
    if (code === 0) return true;
    if (code === 5) return false;
    throw new Error(`소유 PID 확인 실패: ${code}; ${error}`);
  };
  let cleanup = 'upstream profiles remaining=0; harness attempts=0';
  try {
    await observer.waitForFiles(10_000);
    if (captureError) throw captureError;
    const remaining = readdirSync(chromeTemp);
    if (remaining.length) {
      const ownerPath = owners[0]!.profile;
      const samePath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
      const guard = [...observer.profiles].find(([path]) => samePath(path, ownerPath))?.[1];
      if (remaining.length !== 1 || !guard || !samePath(join(chromeTemp, remaining[0]!), ownerPath)) throw new Error('소유 프로필 신원 불명');
      const result = await cleanOwnedProfile(guard, async () => {
        await observer.waitForFiles(10_000);
        if (captureError) throw captureError;
        const names = readdirSync(chromeTemp);
        if (names.some((n) => !samePath(join(chromeTemp, n), ownerPath))) throw new Error('새 프로필이 발견됐다');
        return checkProcesses();
      });
      cleanup = `upstream profiles remaining=${remaining.length}; harness attempts=${result.attempts}; clearedAt=${new Date().toISOString()}`;
    } else if (!await checkProcesses()) throw new Error('소유 프로세스가 다시 발견됐다');
    await observer.waitForFiles(10_000);
    if (captureError || readdirSync(chromeTemp).length || readdirSync(observerTemp).length) throw new Error(`정리 뒤 임시 항목이 남았다: ${String(captureError ?? '')}`);
  } catch (error) {
    preserveTestTemp();
    writeFileSync(join(out, 'test-monitor.log'), `childClose=${status}; monitorClose=${monitorStatus}; ${cleanup}\n${stderr}\n${monitorOutput}\n${JSON.stringify(observer.events, null, 2)}`);
    throw new Error(`소유 프로필 회수 실패; 테스트 루트=${testRoot}; 프로필 루트=${chromeTemp}; ${(error as Error).message}; ${monitorOutput}`);
  } finally { clearInterval(captureTimer); }
  writeFileSync(join(out, 'test-monitor.log'), `childClose=${status}; monitorClose=${monitorStatus}; ${cleanup}\n${stderr}\n${monitorOutput}\n${JSON.stringify(observer.events, null, 2)}`);
  verifyPreview(out);
  assert.ok(existsSync(join(out, 'canvas/renders/screen-0001.png')));
  const rendered = JSON.parse(readFileSync(join(out, 'preview-map.json'), 'utf8'));
  assert.equal(rendered.screens[0].links[0].bounds.x, 20);
  assert.equal(rendered.screens[0].links[0].unlinked, true);
  console.log(`${monitorOutput.trim()}\n${cleanup}\ntemporary-file-events=${JSON.stringify(observer.events)}`);
});
