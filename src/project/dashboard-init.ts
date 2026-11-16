import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { writeFileAtomic } from '../core/fsutil.ts';
import { LEGACY_UI, renderDashboardEntry, isGeneratedSharedEntry } from './dashboard-layout.ts';
import { generateDashboard } from './dashboard.ts';
import { assertSafeGitPath } from '../core/paths.ts';

export function isProtectedInitTarget(target: string, home: string): boolean {
  const root = resolve(target);
  return root === dirname(root) || root === resolve(home);
}

function validateSnapshot(path: string): void {
  const source = readFileSync(path, 'utf8');
  // Accept the current generated comment or older plain JSON assignment. No JavaScript is evaluated.
  const match = /^(?:\/\/[^\n]*\n)?window\.PACE_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(source);
  if (!match) throw new Error(`기존 대시보드 자료를 검증할 수 없습니다. 파일을 보존했습니다: ${path}`);
  let value: unknown;
  try { value = JSON.parse(match[1]!); } catch { throw new Error(`기존 대시보드 자료가 손상되었습니다. 파일을 보존했습니다: ${path}`); }
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!record(value)) throw new Error(`기존 대시보드 자료 형식이 잘못되었습니다. 파일을 보존했습니다: ${path}`);
  const data = value;
  const stringMap = (value: unknown) => record(value) && Object.values(value).every(item => typeof item === 'string');
  if (typeof data.generated !== 'string' || !Number.isFinite(Date.parse(data.generated)) || !stringMap(data.files) || !stringMap(data.assets) || !Array.isArray(data.catalog) || !data.catalog.every(item => typeof item === 'string') || !Number.isSafeInteger(data.skipped) || (data.skipped as number) < 0 || !Number.isSafeInteger(data.bytes) || (data.bytes as number) < 0) {
    throw new Error(`기존 대시보드 자료 형식이 잘못되었습니다. 파일을 보존했습니다: ${path}`);
  }
}

/** Install only into vacant paths; a partial installation is always reported. */
export function initDashboard(target: string): string {
  assertSafeGitPath(target);
  const root = realpathSync(resolve(target));
  assertSafeGitPath(root);
  const lock = join(root, '.pace-backlog-init-lock');
  const nonce = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  let lockIdentity: { dev: number; ino: number } | null = null;
  try {
    mkdirSync(lock);
    const created = lstatSync(lock);
    lockIdentity = { dev: created.dev, ino: created.ino };
    writeFileSync(join(lock, 'owner'), nonce, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (lockIdentity) {
      try {
        const current = lstatSync(lock);
        if (current.dev === lockIdentity.dev && current.ino === lockIdentity.ino) {
          const ownerPath = join(lock, 'owner');
          try {
            if (readFileSync(ownerPath, 'utf8') === nonce) unlinkSync(ownerPath);
            else throw new Error('lock ownership changed');
          } catch (ownerError) {
            if ((ownerError as NodeJS.ErrnoException).code !== 'ENOENT') throw ownerError;
          }
          rmdirSync(lock);
        }
      } catch { /* clean only the exact directory created by this call */ }
      throw error;
    }
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      let owner = '확인 불가';
      try { owner = readFileSync(join(lock, 'owner'), 'utf8'); } catch { /* report unknown owner */ }
      throw new Error(`대시보드 초기화 잠금이 있습니다: ${lock} (소유자 ${owner}) — 소유 프로세스가 실행 중이면 기다리세요. 종료 여부가 확실하지 않으면 건드리지 말고, 종료된 작업이 확인되면 이 잠금 경로만 수동 확인·정리한 뒤 재시도하세요.`);
    }
    try { if (readFileSync(join(lock, 'owner'), 'utf8') === nonce) { unlinkSync(join(lock, 'owner')); rmdirSync(lock); } } catch { /* only clean up a lock whose nonce is ours */ }
    throw error;
  }
  const owned: { path: string; dev: number; ino: number }[] = [];
  const dirs: string[] = [];
  const stat = (path: string) => {
    try { return lstatSync(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };
  const directory = (path: string) => {
    let item = stat(path);
    if (!item) { mkdirSync(path); dirs.push(path); item = lstatSync(path); }
    if (!item.isDirectory() || item.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`안전하지 않은 대시보드 경로: ${path}`);
  };
  const claim = (path: string, content: Uint8Array = Buffer.alloc(0)) => {
    const fd = openSync(path, 'wx');
    try {
      const item = fstatSync(fd);
      owned.push({ path, dev: item.dev, ino: item.ino });
      writeFileSync(fd, content);
    } finally { closeSync(fd); }
  };
  let replaced: { path: string; before: string; after: string } | null = null;
  try {
    const html = renderDashboardEntry(); // Verify the shared installation before touching project files.
    const backlog = join(root, 'backlogs');
    const dashboard = join(backlog, 'dashboard');
    directory(backlog);
    const paths = [...LEGACY_UI, 'dashboard/data.js'];
    const existingDir = stat(dashboard);
    if (existingDir && (!existingDir.isDirectory() || existingDir.isSymbolicLink() || realpathSync(dashboard) !== dashboard)) throw new Error(`안전하지 않은 대시보드 경로: ${dashboard}`);
    const found = paths.filter(part => stat(join(backlog, part)) !== null);
    const before = new Map<string, { bytes: Buffer; dev: number; ino: number }>();
    for (const part of found) {
      const path = join(backlog, part), item = lstatSync(path);
      if (!item.isFile() || item.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`안전하지 않은 대시보드 경로: ${path}`);
      before.set(part, { bytes: readFileSync(path), dev: item.dev, ino: item.ino });
    }
    if (found.includes('dashboard/data.js')) validateSnapshot(join(dashboard, 'data.js'));
    const entry = before.get('README.html');
    const shared = entry ? isGeneratedSharedEntry(entry.bytes.toString('utf8')) : false;
    const ui = found.filter(part => part !== 'dashboard/data.js');
    if (entry && !shared) {
      if (found.includes('dashboard/data.js') && (ui.length === 1 || ui.length === LEGACY_UI.length)) return '기존 대시보드의 버전 또는 사용자 변경을 판별할 수 없어 보존했습니다. 공용 참조로 전환하지 않았습니다.';
      throw new Error('부분 대시보드에 PACE 템플릿과 다른 사용자 파일이 있습니다. 원문을 보존했습니다.');
    }
    if (!shared && ui.length) throw new Error('부분 대시보드에 PACE 템플릿과 다른 사용자 파일이 있습니다. 원문을 보존했습니다.');
    directory(dashboard);
    if (!found.includes('dashboard/data.js')) {
      claim(join(dashboard, 'data.js'));
    }
    const entryPath = join(backlog, 'README.html');
    if (!entry) claim(entryPath, Buffer.from(html));
    else if (entry.bytes.toString('utf8') !== html) {
      const current = lstatSync(entryPath);
      if (current.dev !== entry.dev || current.ino !== entry.ino || !readFileSync(entryPath).equals(entry.bytes)) throw new Error('진입 HTML이 변경되어 전환을 중단했습니다.');
      replaced = { path: entryPath, before: entry.bytes.toString('utf8'), after: html };
      writeFileAtomic(entryPath, html);
    }
    if (!found.includes('dashboard/data.js')) {
      generateDashboard(root, false);
      const current = lstatSync(join(dashboard, 'data.js'));
      const created = owned.find(entry => entry.path === join(dashboard, 'data.js'));
      if (created) { created.dev = current.dev; created.ino = current.ino; }
    }
    if (!entry) return '백로그 대시보드를 생성했습니다: backlogs/README.html (PACE 공용 화면 참조)';
    if (replaced && shared) return '공용 설치본 참조 경로를 갱신했습니다. 기존 프로젝트 자료는 보존했습니다.';
    return found.includes('dashboard/data.js') ? '기존 백로그 대시보드를 보존하고 공용 설치본 경로를 확인했습니다.' : '부분 대시보드 복구 완료: 공용 화면과 프로젝트 자료를 연결했습니다.';
  } catch (error) {
    if (replaced) {
      const current = stat(replaced.path);
      if (current?.isFile() && !current.isSymbolicLink() && readFileSync(replaced.path, 'utf8') === replaced.after) writeFileAtomic(replaced.path, replaced.before);
    }
    // Never remove an entry another process has replaced. Data is atomically replaced by refresh.
    for (const entry of owned.reverse()) {
      const current = stat(entry.path);
      if (current && current.dev === entry.dev && current.ino === entry.ino) unlinkSync(entry.path);
    }
    for (const dir of dirs.reverse()) { try { rmdirSync(dir); } catch { /* preserve nonempty directories */ } }
    throw error;
  } finally {
    try { if (readFileSync(join(lock, 'owner'), 'utf8') === nonce) { unlinkSync(join(lock, 'owner')); rmdirSync(lock); } }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
