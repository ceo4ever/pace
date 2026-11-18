import { lstatSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { packageRoot } from '../core/paths.ts';
import { writeFileAtomic } from '../core/fsutil.ts';

export const DASHBOARD_ENTRY = 'backlogs/README.html';
export const DASHBOARD_DATA = 'backlogs/dashboard/data.js';
/** 이 PC의 공용 설치본 경로 — Git 밖(`backlogs/dashboard/.gitignore`). */
export const DASHBOARD_LOCAL = 'backlogs/dashboard/local.js';
export const DASHBOARD_LOCAL_IGNORE = 'backlogs/dashboard/.gitignore';
/** v2: 진입 HTML에 PC 경로가 없다. 경로는 local.js가 담는다. */
export const SHARED_MARKER = '<!-- pace:backlog-shared:2 -->';
/** v1: 진입 HTML이 설치본 file URL을 직접 담았다 — 판별·전환용으로만 남긴다. */
export const LEGACY_SHARED_MARKER = '<!-- pace:backlog-shared:1 -->';
export const LEGACY_UI = ['README.html', 'dashboard/style.css', 'dashboard/core.js', 'dashboard/app.js'];
export type DashboardState = 'absent' | 'partial' | 'complete';

const LEGACY_TEMPLATE = LEGACY_SHARED_MARKER + '\n<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>백로그 대시보드</title><link rel="stylesheet" href="{{style}}"><script defer src="dashboard/data.js"></script><script defer src="{{core}}"></script><script defer src="{{app}}"></script></head><body><p>PACE 공통 대시보드를 불러오는 중입니다. 화면이 열리지 않으면 PACE 설치를 확인하고 이 프로젝트에서 pace-project-init을 실행하세요.</p></body></html>\n';
const LOCAL_IGNORE_LINE = '/local.js';
/** local.js 첫 줄 — PACE 생성본 판별(소유권). */
const LOCAL_HEADER = '// PACE가 만든 이 PC 전용 파일';
const LOCAL_IGNORE_TEXT = `# PACE: 이 PC의 공용 대시보드 경로 — pace backlog init·refresh가 만든다\n${LOCAL_IGNORE_LINE}\n`;

/** Windows 체크아웃(CRLF)에서도 모든 PC가 같은 바이트를 내도록 줄바꿈을 맞춘다. */
export const lf = (text: string) => text.replace(/\r\n/g, '\n');

export function isSharedEntry(source: string): boolean {
  return source.startsWith(SHARED_MARKER) || source.startsWith(LEGACY_SHARED_MARKER);
}

export function dashboardState(root: string): DashboardState {
  const present = (relative: string): boolean => {
    try { return lstatSync(join(root, relative)).isFile(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  };
  const entry = present(DASHBOARD_ENTRY), data = present(DASHBOARD_DATA);
  const legacy = LEGACY_UI.slice(1).filter(path => present('backlogs/' + path)).length;
  if (!entry && !data && !legacy) {
    // A symlink or directory at a required file path is a collision, never absence.
    for (const path of [DASHBOARD_ENTRY, DASHBOARD_DATA, ...LEGACY_UI.slice(1).map(p => 'backlogs/' + p)]) {
      try { lstatSync(join(root, path)); return 'partial'; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return 'absent';
  }
  if (entry && data && realpathSync(join(root, DASHBOARD_ENTRY)) === join(root, DASHBOARD_ENTRY) && isSharedEntry(readFileSync(join(root, DASHBOARD_ENTRY), 'utf8'))) return 'complete';
  if (entry && data && (legacy === 0 || legacy === 3)) return 'complete';
  return 'partial';
}

/** 실행한 PACE 패키지의 공용 자산 file URL — 설치본을 검증한다. */
function sharedAssetUrls(): { style: string; core: string; app: string } {
  const dir = join(packageRoot, 'src', 'dashboard', 'backlog');
  const url = (file: string) => {
    const path = join(dir, file);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`공통 대시보드 파일을 확인하세요: ${path}`);
    return pathToFileURL(path).href;
  };
  return { style: url('style.css'), core: url('core.js'), app: url('app.js') };
}

/** 커밋되는 진입 HTML — PC 경로가 없어 모든 PC에서 같은 바이트다. */
export function renderDashboardEntry(): string {
  sharedAssetUrls(); // Verify the shared installation before anything is written.
  return lf(readFileSync(join(packageRoot, 'src', 'dashboard', 'backlog', 'page.html'), 'utf8'));
}

/** v1 진입 HTML(설치본 file URL 포함) — 기존 생성본 판별용. */
export function renderLegacyEntry(): string {
  const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const urls = sharedAssetUrls();
  return LEGACY_TEMPLATE.replace('{{style}}', attribute(urls.style)).replace('{{core}}', attribute(urls.core)).replace('{{app}}', attribute(urls.app));
}

/** 이 PC 전용 local.js — 공용 CSS를 붙이고 core → app 순서로 실행한다(data.js는 진입 HTML의 defer 순서상 먼저). */
export function renderLocalLoader(): string {
  const urls = JSON.stringify(sharedAssetUrls());
  return LOCAL_HEADER + ' — Git에 올리지 않는다(.gitignore). pace backlog init·refresh가 다시 만든다.\n'
    + `(function () {\n  var u = ${urls};\n  var d = document, h = d.head;\n  var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = u.style; h.appendChild(l);\n  [u.core, u.app].forEach(function (src) { var s = d.createElement('script'); s.src = src; s.async = false; h.appendChild(s); });\n})();\n`;
}

const RESOURCE_URL = /file:([^"\r\n]*?)\/src\/dashboard\/backlog\/(style\.css|core\.js|app\.js)/g;

/**
 * 배포 경로만 다를 수 있다. v2 원문 또는 수정하지 않은 v1 생성본만 인정한다.
 * v1은 세 리소스가 같은 설치 기반 경로 아래 알려진 구조일 때만 정규화한다 — 리소스 경로만 고친 화면은 사용자 수정이다.
 */
export function isGeneratedSharedEntry(source: string): boolean {
  const text = lf(source);
  if (text === renderDashboardEntry()) return true;
  if (!text.startsWith(LEGACY_SHARED_MARKER) || text.includes('@@res:')) return false;
  const found = [...text.matchAll(RESOURCE_URL)];
  if (found.length !== 3 || new Set(found.map(m => m[1])).size !== 1 || new Set(found.map(m => m[2])).size !== 3) return false;
  const normalize = (value: string) => value.replace(RESOURCE_URL, '@@res:$2');
  return normalize(text) === normalize(renderLegacyEntry());
}

/** 수정하지 않은 v2 진입점 — refresh가 이 PC 연결을 맞출 대상. */
export function isCurrentSharedEntry(source: string): boolean {
  return lf(source) === renderDashboardEntry();
}

/** URL 줄만 다른 PACE 생성 local.js인가(사용자가 고친 파일은 아니다). */
function isGeneratedLocal(source: string): boolean {
  const lines = lf(source).split('\n'), expected = lf(renderLocalLoader()).split('\n');
  const at = expected.findIndex(line => line.startsWith('  var u = '));
  if (lines.length !== expected.length || at < 0) return false;
  // URL 줄은 JSON 객체 하나(style·core·app 세 file URL)만 — 같은 줄에 덧붙인 코드는 JSON이 아니어서 사용자 수정이 된다.
  const line = lines[at]!;
  if (!line.startsWith('  var u = ') || !line.endsWith(';')) return false;
  let urls: unknown;
  try { urls = JSON.parse(line.slice('  var u = '.length, -1)); } catch { return false; }
  if (!urls || typeof urls !== 'object' || Array.isArray(urls)) return false;
  const keys = Object.keys(urls);
  if (keys.length !== 3 || !['style', 'core', 'app'].every(key => typeof (urls as Record<string, unknown>)[key] === 'string' && ((urls as Record<string, string>)[key]!).startsWith('file:'))) return false;
  // 생성 형태 그대로(키 순서·공백·중복 키 없음)여야 한다 — 중복 키로 마지막 값을 바꾼 수정도 사용자 수정이다.
  const { style, core, app } = urls as Record<string, string>;
  if (line !== `  var u = ${JSON.stringify({ style, core, app })};`) return false;
  return lines.every((value, index) => index === at || value === expected[index]);
}

export type LocalLinkBefore = { local: string | null; ignore: string | null; wrote: { local?: string; ignore?: string } };

/**
 * 이 PC의 local.js와 그것을 Git에서 빼는 backlogs/dashboard/.gitignore를 맞춘다. 같으면 쓰지 않는다.
 * - 제외는 그 .gitignore가 실제로 빼는지(`git check-ignore -v`의 출처)로 판단한다 — 이 PC에만 있는 규칙(info/exclude·전역)에 기대지 않는다.
 * - 기존 .gitignore는 고치지 않는다(사용자 규칙 보존). 없을 때만 만든다.
 * - local.js는 없거나 PACE 생성본(URL만 다름)일 때만 쓴다.
 * - 부분 실패는 스스로 되돌린다. 돌려준 값으로 호출자가 이후 실패 때 되돌릴 수 있다.
 * createIgnore=false(refresh)면 Git 변경을 새로 만들지 않는다 — 제외가 이미 될 때만 local.js를 맞추고 아니면 null.
 */
export function ensureLocalLink(root: string, options: { createIgnore?: boolean; writeLocal?: (path: string, text: string) => void } = {}): LocalLinkBefore | null {
  const createIgnore = options.createIgnore ?? true;
  const dir = join(root, 'backlogs', 'dashboard');
  const unsafe = (path: string) => new Error(`안전하지 않은 대시보드 경로: ${path}`);
  const dirStat = lstatSync(dir);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || realpathSync(dir) !== dir) throw unsafe(dir);
  const read = (path: string): string | null => {
    let stat;
    try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw unsafe(path);
    return readFileSync(path, 'utf8');
  };
  const loader = renderLocalLoader();
  const ignorePath = join(dir, '.gitignore'), localPath = join(dir, 'local.js');
  const state: LocalLinkBefore = { ignore: read(ignorePath), local: read(localPath), wrote: {} };
  if (state.local !== null && !isGeneratedLocal(state.local)) throw new Error(`PACE가 만들지 않았거나 고친 ${DASHBOARD_LOCAL}이 있어 보존했습니다 — 이름을 바꾸거나 지운 뒤 pace backlog init을 다시 실행하세요`);
  if (localGit(root, ['ls-files', '--error-unmatch', '--', DASHBOARD_LOCAL]).status === 0) throw new Error(`${DASHBOARD_LOCAL}이 Git에 추적되고 있어 쓰지 않았습니다 — git rm --cached ${DASHBOARD_LOCAL} 뒤 다시 실행하세요`);
  const excludedByRepo = () => {
    // -v는 부정 규칙(!local.js)에 맞아도 0으로 끝난다 — 실제 제외(-q)와 출처·규칙 모양을 함께 본다.
    if (localGit(root, ['check-ignore', '-q', '--', DASHBOARD_LOCAL]).status !== 0) return false;
    const match = /^(.*?):\d+:(.*)\t/.exec(localGit(root, ['check-ignore', '-v', '--', DASHBOARD_LOCAL]).stdout);
    return !!match && match[1] === DASHBOARD_LOCAL_IGNORE && !match[2]!.startsWith('!');
  };
  if (!excludedByRepo()) {
    if (!createIgnore) return null;
    if (state.ignore !== null) throw new Error(`${DASHBOARD_LOCAL_IGNORE}가 ${DASHBOARD_LOCAL}을 빼지 않습니다(규칙 없음·부정 규칙) — 기존 파일은 고치지 않았습니다. ${LOCAL_IGNORE_LINE} 줄을 넣은 뒤 다시 실행하세요`);
  }
  // 제외 규칙 파일 자체가 Git에서 빠지면 새 clone에 규칙이 없다.
  if (localGit(root, ['check-ignore', '-q', '--', DASHBOARD_LOCAL_IGNORE]).status === 0) throw new Error(`${DASHBOARD_LOCAL_IGNORE}가 Git에서 제외되고 있어 다른 PC·clone에 규칙이 전달되지 않습니다 — 제외 설정을 확인하세요`);
  try {
    if (!excludedByRepo()) {
      // .gitignore를 먼저 둬서 local.js가 한순간도 Git 미추적 파일로 보이지 않게 한다.
      writeFileSync(ignorePath, LOCAL_IGNORE_TEXT, { flag: 'wx' });
      state.wrote.ignore = LOCAL_IGNORE_TEXT;
      if (!excludedByRepo()) throw new Error(`${DASHBOARD_LOCAL}을 Git에서 뺄 수 없습니다 — ${DASHBOARD_LOCAL_IGNORE}와 상위 규칙을 확인하세요`);
    }
    if (state.local !== loader) {
      (options.writeLocal ?? writeFileAtomic)(localPath, loader);
      state.wrote.local = loader;
    }
  } catch (error) {
    restoreLocalLink(root, state);
    throw error;
  }
  return state;
}

/** Git 결과(실행 실패는 status -1 — 추적·제외를 확인하지 못한 것으로 본다). */
function localGit(root: string, args: string[]): { status: number; stdout: string } {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  return { status: result.error ? -1 : (result.status ?? -1), stdout: result.stdout ?? '' };
}

/**
 * ensureLocalLink가 이번에 쓴 파일만, 지금 내용이 쓴 그대로일 때만 이전 상태로 되돌린다 — 다른 작업이 바꾼 파일은 건드리지 않는다.
 * 파일마다 따로 시도하고 실패는 경고로 남긴다(호출자의 나머지 복구를 막지 않는다).
 */
export function restoreLocalLink(root: string, state: LocalLinkBefore): void {
  const dir = join(root, 'backlogs', 'dashboard');
  for (const [name, wrote, before] of [['local.js', state.wrote.local, state.local], ['.gitignore', state.wrote.ignore, state.ignore]] as const) {
    if (wrote === undefined) continue;
    const path = join(dir, name);
    try {
      const current = lstatSync(path);
      if (!current.isFile() || current.isSymbolicLink() || readFileSync(path, 'utf8') !== wrote) continue;
      if (before === null) unlinkSync(path);
      else writeFileAtomic(path, before);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      process.stderr.write(`pace: 경고: ${path} 복구 실패: ${error instanceof Error ? error.message : String(error)} — 직접 확인하세요\n`);
    }
  }
}
