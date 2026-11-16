import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageRoot } from '../core/paths.ts';
import { writeFileAtomic } from '../core/fsutil.ts';
import { computeContext, formatErrors, planSchema, type CanvasEntry, type Plan } from './plan.ts';
import { validate } from './schema.ts';
import { IntentError } from './lens.ts';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonical = (v: unknown): string => JSON.stringify(sort(v));
function sort(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]));
  return v;
}
const digest = (v: Record<string, unknown>) => { const { selfHash: _ignored, ...body } = v; return sha(canonical(body)); };
const placeholder = '__PACE_MAP_HASH__';
const markerPrefix = '<meta name="pace-preview-map-sha256" content="';
const markerPattern = /<meta name="pace-preview-map-sha256" content="([a-f0-9]{64}|__PACE_MAP_HASH__)">/g;
const templateRoot = join(packageRoot, 'templates', 'intent-preview');
const bundleRoot = join(packageRoot, 'skills', 'pace-canvas-skills');
const generator = fileURLToPath(import.meta.url);
const maxDocument = 100 * 1024 * 1024;
function pathExists(path: string): boolean { try { lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }

type Row = { id: string; type: string; name: string; depth: number; place: { x: number; y: number; w: number; h: number; rotation?: number }; source?: string; visible?: boolean; opacity?: number; clip?: boolean };
type Show = { base: { id: string; type: string; name: string }; rows: Row[]; omitted: number; warnings: unknown[] };
type Render = { skillsVersion: string; node: { id: string; name: string; w: number; h: number; rotation: number }; scale: number; pixels: { w: number; h: number }; box: { x: number; y: number; w: number; h: number }; imageOrigin: { x: number; y: number }; files: { png: string }; warnings: unknown[] };
type Hit = { element: string; name: string; bounds: { x: number; y: number; w: number; h: number }; x: number; y: number; w: number; h: number; target?: number; unlinked?: true };
type FontWarning = { font: string; message: string };
type Screen = { screen: string; state: string; document: string; documentVersion: number; frame: string; frameName: string; image: string; width: number; height: number; scale: number; origin: { x: number; y: number }; links: Hit[]; fontWarnings: FontWarning[] };
type PreviewMap = { version: number; marker: string; planHash: string; documents: Record<string, string>; tools: Record<string, string>; images: Record<string, string>; renderEnvironment: { platform: string; arch: string; node: string }; htmlHash: string; screens: Screen[]; selfHash: string };
export interface PreviewOptions { root?: string; run?: (tool: string, args: string[], cwd: string) => string; rename?: (from: string, to: string) => void; openLock?: (path: string) => number; scale?: number }

function fail(message: string): never { throw new IntentError(message); }
function safeCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,20}$/.test(code) ? code : 'IO_ERROR';
}
function safeBoundary(error: unknown): never {
  if (error instanceof IntentError) throw error;
  const primary = error instanceof AggregateError ? error.errors[0] : error;
  const code = safeCode(primary);
  const description = error instanceof AggregateError ? '미리보기 작업 및 정리 실패' : '미리보기 파일 작업 실패';
  throw Object.assign(new IntentError(`${description} (${code})`, { cause: error }), { code });
}
function checkedRoot(input: string): string {
  const root = resolve(input);
  let part = root;
  while (true) {
    if (!pathExists(part) || lstatSync(part).isSymbolicLink()) fail('안전하지 않은 출력 경로');
    const parent = dirname(part); if (parent === part) break; part = parent;
  }
  if (!lstatSync(root).isDirectory()) fail('출력 폴더가 아니다');
  return realpathSync.native(root);
}
function validRelative(path: string): boolean {
  if (!path || isAbsolute(path) || path.startsWith('/') || /[\\:\x00-\x1f\x7f]/.test(path)) return false;
  return path.split('/').every((p) => p && p !== '.' && p !== '..' && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(p));
}
function safePath(root: string, rel: string, mustExist = false): string {
  if (!validRelative(rel)) fail('안전하지 않은 상대 경로');
  let current = root;
  for (const part of rel.split('/')) {
    current = join(current, part);
    if (pathExists(current) && lstatSync(current).isSymbolicLink()) fail('링크 경로는 허용하지 않는다');
  }
  if (mustExist && (!pathExists(current) || !lstatSync(current).isFile())) fail('필요한 파일이 없다');
  if (existsSync(current)) {
    const r = relative(root, realpathSync.native(current));
    if (!r || r === '..' || r.startsWith('..' + sep) || isAbsolute(r)) fail('출력 폴더 밖 경로');
  }
  return current;
}
function ensureDir(root: string, rel: string): string {
  let current = root;
  for (const part of rel.split('/')) {
    current = join(current, part);
    if (!pathExists(current)) mkdirSync(current);
    if (lstatSync(current).isSymbolicLink() || !lstatSync(current).isDirectory()) fail('안전하지 않은 폴더');
  }
  return current;
}
function readBounded(path: string): Buffer {
  if (lstatSync(path).size > maxDocument) fail('입력 파일이 너무 크다');
  return readFileSync(path);
}
function pngSize(bytes: Buffer): { w: number; h: number } {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii',12,16) !== 'IHDR') fail('유효한 PNG가 아니다');
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
  if (!w || !h) fail('PNG 크기가 잘못됐다');
  return { w, h };
}
function toolsHash(): Record<string, string> {
  const manifestPath = join(bundleRoot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { format: string; skillsVersion: string; files: Record<string, string> };
  if (manifest.format !== 'canvas-skills' || !manifest.files || !Object.keys(manifest.files).length) fail('Canvas 묶음 manifest 오류');
  const found: string[] = [];
  const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isSymbolicLink()) fail('Canvas 묶음에 링크가 있다'); if (entry.isDirectory()) walk(path); else found.push(relative(bundleRoot, path).split(sep).join('/')); } };
  walk(bundleRoot);
  const actual = found.filter((f) => f !== 'manifest.json').sort();
  if (canonical(actual) !== canonical(Object.keys(manifest.files).sort())) fail('Canvas 묶음 파일 목록이 다르다');
  for (const [file, hash] of Object.entries(manifest.files)) if (!validRelative(file) || sha(readFileSync(join(bundleRoot, ...file.split('/')))) !== hash) fail('Canvas 묶음 해시가 다르다');
  return { manifest: sha(readFileSync(manifestPath)), version: manifest.skillsVersion, generator: sha(readFileSync(generator)), html: sha(readFileSync(join(templateRoot, 'preview.html'))), script: sha(readFileSync(join(templateRoot, 'preview.js'))) };
}
function invoke(tool: string, args: string[], cwd: string): string {
  const result = spawnSync(process.execPath, [tool, ...args], { cwd, shell: false, windowsHide: true, encoding: 'utf8', timeout: 330000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const status = result.status ?? safeCode(result.error);
    const stderr = result.stderr ?? '';
    const reason = /CHROME_PATH|Chrome not found/i.test(stderr) ? 'Chrome 실행 경로를 찾지 못했다'
      : /timed?\s*out|timeout/i.test(stderr) ? '도구 응답 시간이 초과됐다'
        : /invalid document/i.test(stderr) ? 'Canvas 문서 형식 오류'
          : /no node with id/i.test(stderr) ? 'Canvas ID가 없다'
            : ({ 2: '문서 읽기 실패', 3: '문서 유효성 실패', 4: 'ID 없음', 5: 'Chrome 시작 실패', 6: '렌더 실패' } as Record<number, string>)[result.status ?? -1] ?? '실행 실패';
    throw new IntentError(`Canvas 도구 실패 (${status}): ${reason}`, { cause: result.error ?? { status: result.status, stderr } });
  }
  return result.stdout;
}
function normalizedHtml(html: string): string {
  const matches = [...html.matchAll(markerPattern)];
  if (matches.length !== 1 || (html.match(new RegExp(markerPrefix, 'g')) ?? []).length !== 1) fail('미리보기 표지가 없거나 여러 개다');
  return html.replace(markerPattern, `${markerPrefix}${placeholder}">`);
}
export function normalizeInlineScript(script: string): string { return script.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); }
function htmlFor(map: PreviewMap): string {
  const template = readFileSync(join(templateRoot, 'preview.html'), 'utf8').replace(/^\uFEFF/, '');
  // HTML parsing normalizes CRLF and CR to LF before CSP hashes the inline script.
  const script = normalizeInlineScript(readFileSync(join(templateRoot, 'preview.js'), 'utf8'));
  const scriptHash = createHash('sha256').update(script).digest('base64');
  const data = JSON.stringify({ screens: map.screens }).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const values: Record<string, string> = { '@@SCRIPT_HASH@@': scriptHash, '@@DATA@@': data, '@@SCRIPT@@': script };
  const result = template.replace(/@@SCRIPT_HASH@@|@@DATA@@|@@SCRIPT@@/g, (key) => values[key]!);
  if (normalizedHtml(result) !== result) fail('템플릿 표지가 잘못됐다');
  return result;
}
function readOutput(root: string, path: string, label: string): Buffer {
  try { return readBounded(safePath(root, path, true)); }
  catch (error) {
    if (error instanceof IntentError) throw new IntentError(`conflict: ${label}을 확인할 수 없다`, { cause: error });
    const code = safeCode(error);
    throw Object.assign(new IntentError(`conflict: ${label} 읽기 실패 (${code})`, { cause: error }), { code });
  }
}
function readMap(root: string): PreviewMap {
  const bytes = readOutput(root, 'preview-map.json', 'preview-map');
  let map: PreviewMap;
  try { map = JSON.parse(bytes.toString('utf8')) as PreviewMap; }
  catch (error) { throw new IntentError('conflict: preview-map JSON이 잘못됐다', { cause: error }); }
  if (!map || map.version !== 1 || map.marker !== 'pace-intent-preview-v1' || !Array.isArray(map.screens) || !map.documents || !map.images || !map.tools || typeof map.selfHash !== 'string' || digest(map as unknown as Record<string, unknown>) !== map.selfHash) fail('conflict: preview-map이 변경됐다');
  const html = readOutput(root, 'preview.html', 'preview.html').toString('utf8');
  const matches = [...html.matchAll(markerPattern)];
  if (matches.length !== 1 || matches[0]![1] !== map.selfHash || sha(normalizedHtml(html)) !== map.htmlHash) fail('conflict: preview.html이 변경됐다');
  for (const [rel, hash] of Object.entries(map.images)) {
    if (!rel.startsWith('canvas/renders/')) fail('conflict: 이미지 경로가 잘못됐다');
    const image = readOutput(root, rel, '이미지');
    if (sha(image) !== hash) fail('conflict: 이미지가 변경됐다');
    pngSize(image);
  }
  for (const screen of map.screens) {
    if (!screen || typeof screen.image !== 'string' || !(screen.image in map.images) || !Number.isInteger(screen.width) || !Number.isInteger(screen.height)) fail('conflict: 이미지 출처가 잘못됐다');
    const size = pngSize(readOutput(root, screen.image, '이미지'));
    if (size.w !== screen.width || size.h !== screen.height) fail('conflict: 이미지 크기가 다르다');
  }
  return map;
}
function verifyPreviewImpl(out: string): void {
  const root = checkedRoot(out);
  const map = readMap(root);
  if (sha(readBounded(safePath(root, 'plan.json', true))) !== map.planHash) fail('stale: plan.json이 변경됐다');
  for (const [path, hash] of Object.entries(map.documents)) if (sha(readBounded(safePath(root, path, true))) !== hash) fail('stale: Canvas가 변경됐다');
  if (canonical(map.tools) !== canonical(toolsHash())) fail('stale: 도구 또는 템플릿이 변경됐다');
}
export function verifyPreview(out: string): void { try { verifyPreviewImpl(out); } catch (error) { safeBoundary(error); } }
function inspect(show: Show, render: Render, entry: CanvasEntry, entries: CanvasEntry[], image: string, png: Buffer, documentVersion: number): Screen {
  if (!show || !Array.isArray(show.rows) || show.omitted !== 0 || !Array.isArray(show.warnings) || show.warnings.length || !show.rows.length) fail('Canvas 읽기 출력이 불완전하거나 경고가 있다');
  const root = show.rows[0]!;
  if (root.id !== entry.frame || root.type !== 'frame' || /^(설명 패널|화면 제목|화면 머리|이전·다음)$/.test(root.name)) fail('제품 프레임이 아니다');
  if (show.rows.some((row) => row.depth === 1 && /^(설명 패널|화면 제목|화면 머리|이전·다음)$/.test(row.name))) fail('설명 레이어를 포함한 보드는 제품 프레임이 아니다');
  if (root.visible === false || root.opacity === 0 || root.source !== 'stored' || (root.place.rotation ?? 0) % 360 !== 0 || render.node.rotation % 360 !== 0) fail('지원하지 않는 프레임 변환·가시성');
  const size = pngSize(png);
  if (size.w !== render.pixels.w || size.h !== render.pixels.h || Math.abs(root.place.w - render.node.w) > .5 || Math.abs(root.place.h - render.node.h) > .5 || Math.abs(render.box.w * render.scale - size.w) > 1 || Math.abs(render.box.h * render.scale - size.h) > 1) fail('렌더 크기가 읽기 결과와 다르다');
  if (!Array.isArray(render.warnings) || render.warnings.length > 64) fail('지원하지 않는 렌더 경고');
  const fontWarnings: FontWarning[] = render.warnings.map((message) => {
    if (typeof message !== 'string') return fail('지원하지 않는 렌더 경고');
    const match = /^font "([^"\x00-\x1f\x7f-\x9f]{1,200})" is not installed here; text is drawn with a fallback font(?![\s\S])/.exec(message);
    if (!match) return fail('지원하지 않는 렌더 경고');
    return { font: match[1]!, message };
  });
  const parents: Row[][] = [], stack: Row[] = [];
  for (const row of show.rows) { while (stack.length > row.depth) stack.pop(); parents.push([...stack]); stack.push(row); }
  const links: Hit[] = entry.links.map((link) => {
    const index = show.rows.findIndex((r) => r.id === link.element);
    if (index <= 0 || show.rows.filter((r) => r.id === link.element).length !== 1) fail('요소가 없거나 모호하다');
    const row = show.rows[index]!, chain = [...parents[index]!, row];
    if (chain.some((r) => r.visible === false || r.opacity === 0 || r.source !== 'stored' || ((r.place.rotation ?? 0) % 360 !== 0))) fail('지원하지 않는 요소 변환·가시성');
    if (row.place.x < 0 || row.place.y < 0 || row.place.x + row.place.w > root.place.w || row.place.y + row.place.h > root.place.h) fail('요소 경계가 프레임 밖이다');
    for (const ancestor of parents[index]!) if (ancestor.clip && (row.place.x < ancestor.place.x || row.place.y < ancestor.place.y || row.place.x + row.place.w > ancestor.place.x + ancestor.place.w || row.place.y + row.place.h > ancestor.place.y + ancestor.place.h)) fail('클리핑된 요소');
    const x = (row.place.x - render.imageOrigin.x) * render.scale / size.w * 100, y = (row.place.y - render.imageOrigin.y) * render.scale / size.h * 100;
    const w = row.place.w * render.scale / size.w * 100, h = row.place.h * render.scale / size.h * 100;
    if (![x,y,w,h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > 100.01 || y+h > 100.01) fail('요소 경계가 이미지 밖이다');
    const bounds = { x: row.place.x, y: row.place.y, w: row.place.w, h: row.place.h };
    if ('unlinked' in link) return { element: link.element, name: row.name, bounds, x, y, w, h, unlinked: true };
    const target = entries.findIndex((e) => e.screen === link.to.screen && e.state === link.to.state);
    if (target < 0) fail('이동 대상이 없다');
    return { element: link.element, name: row.name, bounds, x, y, w, h, target };
  });
  return { screen: entry.screen, state: entry.state, document: entry.document, documentVersion, frame: entry.frame, frameName: root.name, image, width: size.w, height: size.h, scale: render.scale, origin: render.imageOrigin, links, fontWarnings };
}
function createPreviewImpl(out: string, options: PreviewOptions = {}): void {
  const root = checkedRoot(out), lockPath = join(root, '.pace-preview.lock');
  let lock: number;
  try { lock = options.openLock ? options.openLock(lockPath) : openSync(lockPath, 'wx'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return fail('conflict: 미리보기 잠금이 있다; 수동 확인'); throw error; }
  let work = '', keep = false, pendingError: unknown;
  try {
    if (readdirSync(root).some((n) => n.startsWith('.pace-preview-work-'))) fail('conflict: 이전 복구 자료가 남았다; 수동 확인');
    const oldMap = pathExists(join(root, 'preview-map.json')), oldHtml = pathExists(join(root, 'preview.html'));
    if (oldMap !== oldHtml) fail('conflict: 미리보기 일부만 있다');
    const old = oldMap ? readMap(root) : null;
    const oldHashes = new Map<string, string>();
    if (old) for (const rel of ['preview-map.json', 'preview.html', ...Object.keys(old.images)]) oldHashes.set(rel, sha(readBounded(safePath(root, rel, true))));
    const planPath = safePath(root, 'plan.json', true), planBytes = readBounded(planPath);
    let parsed: unknown;
    try { parsed = JSON.parse(planBytes.toString('utf8')); } catch { return fail('plan.json을 읽을 수 없다'); }
    const errors = validate(parsed, planSchema());
    if (errors.length) fail(`plan.json이 schema와 다르다:\n${formatErrors(errors)}`);
    const plan = parsed as Plan;
    const failed = (computeContext(plan, options.root ?? process.cwd()).checks as { id: string; ok: boolean; detail: string }[]).filter((c) => !c.ok);
    if (failed.length) fail(`계획 검사 실패: ${failed.map((c) => c.id).join('; ')}`);
    const entries = plan.canvas ?? []; if (!entries.length) fail('Canvas 화면이 없다');
    const toolHashes = toolsHash();
    const aliases = new Set<string>();
    const docs = new Map<string, Buffer>();
    for (const entry of entries) {
      const path = safePath(root, entry.document, true), real = realpathSync.native(path);
      const alias = process.platform === 'win32' ? real.toLowerCase() : real;
      const key = `${alias}\0${entry.frame}`;
      if (aliases.has(key)) fail('Canvas 프레임이 중복된다'); aliases.add(key);
      if (!docs.has(entry.document)) docs.set(entry.document, readBounded(path));
    }
    work = mkdtempSync(join(root, '.pace-preview-work-'));
    const scale = options.scale ?? 2;
    if (!Number.isFinite(scale) || scale <= 0 || scale > 8) fail('렌더 배율이 잘못됐다');
    const runner = options.run ?? invoke, screens: Screen[] = [], images: Record<string, string> = { ...(old?.images ?? {}) }, staged: { dest: string; source: string }[] = [];
    let index = 0;
    for (const entry of entries) {
      const snapshot = join(work, `document-${index}.canvas.json`), dir = join(work, `render-${index}`); mkdirSync(dir);
      writeFileSync(snapshot, docs.get(entry.document)!);
      const readTool = join(bundleRoot, 'canvas-read', 'tools', 'read.mjs'), renderTool = join(bundleRoot, 'canvas-read', 'tools', 'render.mjs');
      let show: Show, render: Render;
      try {
        show = JSON.parse(runner(readTool, [snapshot, 'show', entry.frame, '--depth', '99', '--max', '100000', '--json'], work)) as Show;
        render = JSON.parse(runner(renderTool, [snapshot, entry.frame, '--scale', String(scale), '--out', dir, '--timeout', '300', '--json'], work)) as Render;
      } catch (error) { if (error instanceof IntentError) throw error; throw new IntentError('Canvas 출력 오류', { cause: error }); }
      const actual = resolve(render.files.png), r = relative(dir, actual);
      if (render.scale !== scale) fail('렌더 배율이 요청과 다르다');
      if (!r || r === '..' || r.startsWith('..' + sep) || isAbsolute(r) || lstatSync(actual).isSymbolicLink() || !lstatSync(actual).isFile()) fail('렌더 출력 경로가 안전하지 않다');
      const png = readBounded(actual), image = `canvas/renders/screen-${String(index + 1).padStart(4, '0')}.png`;
      let documentVersion: number;
      try { documentVersion = JSON.parse(docs.get(entry.document)!.toString('utf8')).version as number; } catch { return fail('Canvas 문서를 읽을 수 없다'); }
      if (!Number.isInteger(documentVersion)) fail('Canvas 문서 버전이 없다');
      screens.push(inspect(show, render, entry, entries, image, png, documentVersion)); images[image] = sha(png);
      const stagedPng = join(work, `image-${index}.png`); writeFileSync(stagedPng, png); staged.push({ dest: image, source: stagedPng }); index++;
    }
    const documents = Object.fromEntries([...docs].map(([path, bytes]) => [path, sha(bytes)]));
    const map: PreviewMap = { version: 1, marker: 'pace-intent-preview-v1', planHash: sha(planBytes), documents, tools: toolHashes, images, renderEnvironment: { platform: process.platform, arch: process.arch, node: process.version }, htmlHash: '', screens, selfHash: '' };
    const html = htmlFor(map); map.htmlHash = sha(html); map.selfHash = digest(map as unknown as Record<string, unknown>);
    const finalHtml = html.replace(`${markerPrefix}${placeholder}">`, `${markerPrefix}${map.selfHash}">`);
    const mapFile = join(work, 'map.json'), htmlFile = join(work, 'preview.html');
    writeFileSync(mapFile, canonical(map) + '\n'); writeFileSync(htmlFile, finalHtml);
    staged.push({ dest: 'preview-map.json', source: mapFile }, { dest: 'preview.html', source: htmlFile });
    if (sha(readBounded(planPath)) !== map.planHash || [...docs].some(([path, bytes]) => sha(readBounded(safePath(root, path, true))) !== sha(bytes))) fail('stale: 생성 중 원본이 변경됐다');
    ensureDir(root, 'canvas'); ensureDir(root, 'canvas/renders');
    for (const item of staged) {
      const dest = safePath(root, item.dest);
      if (pathExists(dest) && !lstatSync(dest).isFile()) fail(`conflict: 파일이 아닌 출력 경로: ${item.dest}`);
      if (existsSync(dest) && !['preview-map.json','preview.html'].includes(item.dest) && (!old || !(item.dest in old.images))) fail(`conflict: 사용자 파일이 있다: ${item.dest}`);
      if (oldHashes.has(item.dest) && (!pathExists(dest) || sha(readBounded(dest)) !== oldHashes.get(item.dest))) fail(`conflict: 생성 중 결과가 변경됐다: ${item.dest}`);
    }
    const move = options.rename ?? renameSync, journal: { dest: string; source: string; backup?: string; installed: boolean }[] = [];
    const writeJournal = () => writeFileAtomic(join(work, 'journal.json'), `${JSON.stringify(journal, null, 2)}\n`);
    try {
      for (const [i, item] of staged.entries()) {
        const dest = safePath(root, item.dest), rec: { dest: string; source: string; backup?: string; installed: boolean } = { dest, source: item.source, installed: false }; journal.push(rec);
        if (oldHashes.has(item.dest) && (!pathExists(dest) || sha(readBounded(dest)) !== oldHashes.get(item.dest))) fail(`conflict: 교체 중 결과가 변경됐다: ${item.dest}`);
        if (!oldHashes.has(item.dest) && pathExists(dest)) fail(`conflict: 교체 중 파일이 생겼다: ${item.dest}`);
        if (existsSync(dest)) { rec.backup = join(work, `backup-${i}`); writeJournal(); move(dest, rec.backup); }
        writeJournal(); move(item.source, dest); rec.installed = true; writeJournal();
      }
    } catch (error) {
      const failures: unknown[] = [];
      for (const rec of journal.reverse()) {
        try {
          if (rec.installed && existsSync(rec.dest)) { rmSync(rec.dest); rec.installed = false; writeJournal(); }
          if (rec.backup && existsSync(rec.backup)) { move(rec.backup, rec.dest); rec.backup = undefined; writeJournal(); }
        } catch (e) { failures.push(e); }
      }
      if (failures.length) {
        keep = true; try { writeJournal(); } catch (journalError) { failures.push(journalError); }
        throw Object.assign(new IntentError(`교체 및 복원 실패 (${[error, ...failures].map(safeCode).join(', ')}); 복구 자료: ${basename(work)}`, { cause: new AggregateError([error, ...failures], '교체 및 복원 실패') }), { code: safeCode(error) });
      }
      throw error;
    }
  } catch (error) {
    pendingError = error; throw error;
  } finally {
    try {
      closeSync(lock);
      if (work && !keep) rmSync(work, { recursive: true, force: true });
      if (!keep) rmSync(lockPath, { force: true });
    } catch (cleanupError) {
      if (pendingError) throw new AggregateError([pendingError, cleanupError], '미리보기 작업과 정리 실패');
      throw cleanupError;
    }
  }
}
export function createPreview(out: string, options: PreviewOptions = {}): void { try { createPreviewImpl(out, options); } catch (error) { safeBoundary(error); } }
