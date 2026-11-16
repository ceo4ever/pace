import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageRoot } from '../core/paths.ts';

export const DASHBOARD_ENTRY = 'backlogs/README.html';
export const DASHBOARD_DATA = 'backlogs/dashboard/data.js';
export const SHARED_MARKER = '<!-- pace:backlog-shared:1 -->';
export const LEGACY_UI = ['README.html', 'dashboard/style.css', 'dashboard/core.js', 'dashboard/app.js'];
export type DashboardState = 'absent' | 'partial' | 'complete';

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
  if (entry && data && realpathSync(join(root, DASHBOARD_ENTRY)) === join(root, DASHBOARD_ENTRY) && readFileSync(join(root, DASHBOARD_ENTRY), 'utf8').startsWith(SHARED_MARKER)) return 'complete';
  if (entry && data && (legacy === 0 || legacy === 3)) return 'complete';
  return 'partial';
}

export function renderDashboardEntry(): string {
  const dir = join(packageRoot, 'src', 'dashboard', 'backlog');
  const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  let html = readFileSync(join(dir, 'page.html'), 'utf8');
  for (const [key, file] of [['style', 'style.css'], ['core', 'core.js'], ['app', 'app.js']]) {
    const path = join(dir, file!);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`공통 대시보드 파일을 확인하세요: ${path}`);
    html = html.replace(`{{${key}}}`, attribute(pathToFileURL(path).href));
  }
  return html;
}

/** 배포 경로만 다를 수 있다. */
export function isGeneratedSharedEntry(source: string): boolean {
  const normalize = (value: string) => value.replace(/file:[^"\r\n]*\/(style\.css|core\.js|app\.js)/g, 'pace-shared:$1');
  const current = normalize(renderDashboardEntry());
  return source.startsWith(SHARED_MARKER) && normalize(source) === current;
}
