import { lstatSync, realpathSync, readFileSync, writeFileSync, renameSync, unlinkSync, linkSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { dashboardState } from './dashboard-layout.ts';
import { assertSafeGitPath } from '../core/paths.ts';

export function generateDashboard(target: string, trackedOnly = false): string | null {
assertSafeGitPath(target);
const root = realpathSync(resolve(target));
assertSafeGitPath(root);
const output = join(root, 'backlogs', 'dashboard', 'data.js');
for (const part of ['backlogs', 'backlogs/dashboard', 'backlogs/dashboard/data.js', 'backlogs/README.html']) {
  const path = join(root, part);
  let stat;
  try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`안전하지 않은 대시보드 경로: ${part}`);
  if (part.endsWith('.js') || part.endsWith('.html') ? !stat.isFile() : !stat.isDirectory()) throw new Error(`잘못된 대시보드 경로: ${part}`);
}
const dir = join(root, 'backlogs', 'dashboard');
const lock = join(dir, '.pace-refresh-lock');
const recovery = join(dir, '.pace-refresh-reaper');
const nonce = randomBytes(16).toString('hex');
const candidate = join(dir, `.pace-owner-${process.pid}-${nonce}.tmp`);
const identity = `${process.pid}:${nonce}`;
writeFileSync(candidate, identity, { flag: 'wx', mode: 0o600 });
const deadline = Date.now() + 30000;
try {
  for (;;) {
    try { linkSync(candidate, lock); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let stat;
      try { stat = lstatSync(lock); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`기존 잠금 경로를 확인하세요: ${lock} — 실행 중인 PACE이 없으면 해당 잠금을 제거한 뒤 재시도`);
      let contents: string;
      try { contents = readFileSync(lock, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
      const owner = Number(contents.split(':')[0]);
      let dead = false;
      if (Number.isSafeInteger(owner) && owner > 0) {
        try { process.kill(owner, 0); } catch (probe) { dead = (probe as NodeJS.ErrnoException).code === 'ESRCH'; }
      }
      if (dead) {
        let held = false;
        try { linkSync(candidate, recovery); held = true; }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
        if (held) {
          try {
            try {
              const current = lstatSync(lock);
              if (current.dev === stat.dev && current.ino === stat.ino && readFileSync(lock, 'utf8') === contents) unlinkSync(lock);
            } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
          } finally { unlinkSync(recovery); }
          continue;
        }
      }
      if (Date.now() >= deadline) throw new Error(`대시보드 잠금 대기 시간 초과: ${lock} — 실행 중인 PACE이 없으면 이 잠금과 ${recovery}를 확인·제거한 뒤 재시도`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
} finally { unlinkSync(candidate); }
try {
// 잠금을 가진 프로세스만 자신과 이전에 중단된 생성기의 임시 파일을 정리한다.
for (const name of readdirSync(dir)) {
  if (/^\.pace-data-[a-f0-9]{24}\.tmp$/.test(name)) {
    try { unlinkSync(join(dir, name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const ownerName = /^\.pace-owner-([0-9]+)-[a-f0-9]{32}\.tmp$/.exec(name);
  if (ownerName) {
    const path = join(dir, name);
    try {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const owner = Number(ownerName[1]);
      if (Number.isSafeInteger(owner) && owner > 0) {
        try { process.kill(owner, 0); } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
            const current = lstatSync(path);
            if (current.dev === stat.dev && current.ino === stat.ino) unlinkSync(path);
          }
        }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
let paths: string[];
let ignoredPaths: Set<string>;
{
  const list = spawnSync('git', ['ls-files', '-z', '--cached', ...(trackedOnly ? [] : ['--others', '--exclude-standard']), '--', 'backlogs', 'projects'], { cwd: root, encoding: 'utf8', maxBuffer: 20_000_000 });
  if (list.status !== 0 || list.stderr.trim()) throw new Error(`Git 파일 목록을 완전히 읽지 못했습니다${list.stderr.trim() ? `: ${list.stderr.trim()}` : ''}. snapshot을 보존했습니다.`);
  paths = [...new Set(list.stdout.split('\0').filter(Boolean))].sort();
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], { cwd: root, input: paths.join('\0')+'\0', encoding: 'utf8', maxBuffer: 20_000_000 });
  if (ignored.status !== 0 && ignored.status !== 1) throw new Error('Git 무시 규칙을 확인하지 못했습니다.');
  ignoredPaths = new Set(ignored.stdout.split('\0').filter(Boolean));
}
const realRoot = realpathSync(root);
const indexedFiles = new Map<string, { oid: string; size: number; data?: Buffer }>();
if (trackedOnly) {
  const index = spawnSync('git', ['ls-files', '--stage', '-z', '--', 'backlogs', 'projects'], { cwd: root, encoding: 'utf8', maxBuffer: 20_000_000 });
  if (index.status !== 0) throw new Error('Git 인덱스를 읽지 못했습니다.');
  for (const entry of index.stdout.split('\0').filter(Boolean)) {
    const match = /^(100644|100755) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(entry);
    if (match) indexedFiles.set(match[3]!, { oid: match[2]!, size: 0 });
  }
  const entries = [...indexedFiles.values()];
  if (entries.length) {
    const info = spawnSync('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { cwd: root, input: entries.map(e => e.oid).join('\n') + '\n', encoding: 'utf8', maxBuffer: 20_000_000 });
    if (info.status !== 0) throw new Error('Git 객체 크기를 읽지 못했습니다.');
    const rows = info.stdout.trimEnd().split('\n');
    if (rows.length !== entries.length) throw new Error('Git 객체 목록이 올바르지 않습니다.');
    entries.forEach((entry, i) => {
      const match = /^([0-9a-f]+) blob ([0-9]+)$/.exec(rows[i]!);
      if (!match || match[1] !== entry.oid) throw new Error('Git 객체 크기가 올바르지 않습니다.');
      entry.size = Number(match[2]);
    });
    const eligible = (path: string) => !ignoredPaths.has(path) && !path.split('/').some(part => part.startsWith('.') || part === 'node_modules' || /\.local\./i.test(part) || /(secret|credential|token|private|\.env)/i.test(part)) && !/^backlogs\/(?:backup\/)?[^/]+\/sources(?:\/|$)/i.test(path);
    const selected: { path: string; oid: string; size: number }[] = [];
    let textBytes = 0, pictureBytes = 0;
    for (const path of paths) {
      const entry = indexedFiles.get(path);
      if (!entry || !eligible(path) || !/\.(md|jsonl|html)$/i.test(path) || entry.size > 500_000 || textBytes + entry.size > 8_000_000) continue;
      selected.push({ path, ...entry }); textBytes += entry.size;
    }
    for (const path of paths) {
      const entry = indexedFiles.get(path);
      if (!entry || !eligible(path) || !/\.(png|jpe?g|gif|webp)$/i.test(path) || entry.size > 500_000 || pictureBytes + entry.size > 2_000_000 || textBytes + pictureBytes + entry.size > 8_000_000) continue;
      selected.push({ path, ...entry }); pictureBytes += entry.size;
    }
    if (selected.length) {
      const batch = spawnSync('git', ['cat-file', '--batch'], { cwd: root, input: selected.map(e => e.oid).join('\n') + '\n', maxBuffer: 12_000_000 });
      if (batch.status !== 0) throw new Error('Git 객체를 읽지 못했습니다.');
      let offset = 0;
      for (const entry of selected) {
        const end = batch.stdout.indexOf(10, offset);
        if (end < 0 || batch.stdout.subarray(offset, end).toString() !== `${entry.oid} blob ${entry.size}`) throw new Error('Git 객체 응답이 올바르지 않습니다.');
        offset = end + 1;
        const content = batch.stdout.subarray(offset, offset + entry.size);
        if (content.length !== entry.size || batch.stdout[offset + entry.size] !== 10) throw new Error('Git 객체 내용이 잘렸습니다.');
        indexedFiles.get(entry.path)!.data = content;
        offset += entry.size + 1;
      }
    }
  }
}
const files: Record<string, string> = Object.create(null) as Record<string, string>;
const catalog: string[] = [];
const assets: Record<string, string> = Object.create(null) as Record<string, string>;
const images: { path: string; data: Buffer }[] = [];
let imageBytes = 0;
let skipped = 0, bytes = 0;
for (const path of paths) {
  if (/^backlogs\/dashboard\/.pace-(?:refresh-(?:lock|reaper)|data-[a-f0-9]+\.tmp|owner-[0-9]+-[a-f0-9]+\.tmp)(?:\/|$)/.test(path)) continue;
  if (ignoredPaths.has(path)) { skipped++; continue; }
  if (path.split('/').some(part => part.startsWith('.') || part === 'node_modules' || /\.local\./i.test(part) || /(secret|credential|token|private|\.env)/i.test(part)) || /^backlogs\/(?:backup\/)?[^/]+\/sources(?:\/|$)/i.test(path)) { skipped++; continue; }
  if (!/\.(md|jsonl|html|png|jpe?g|gif|webp)$/i.test(path)) continue;
  let data: Buffer;
  if (trackedOnly) {
    const entry = indexedFiles.get(path);
    if (!entry) { skipped++; continue; }
    catalog.push(path);
    if (!entry.data) { skipped++; continue; }
    data = entry.data;
  } else {
    let stat;
    try { stat = lstatSync(join(root, path)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { skipped++; continue; } throw new Error(`Git에서 찾은 자료를 읽을 수 없습니다: ${path}`); }
    if (!stat.isFile() || realpathSync(join(root, path)) !== join(realRoot, path)) { skipped++; continue; }
    catalog.push(path);
    if (stat.size > 500_000) { skipped++; continue; }
    data = readFileSync(join(root, path));
  }
  if (/\.(png|jpe?g|gif|webp)$/i.test(path)) { images.push({ path, data }); continue; }
  if (data.length > 500_000 || bytes + data.length > 8_000_000) { skipped++; continue; }
  files[path] = data.toString('utf8'); bytes += data.length;
}
for (const image of images) {
  if (image.data.length > 500_000 || imageBytes + image.data.length > 2_000_000 || bytes + image.data.length > 8_000_000) { skipped++; continue; }
  const ext = image.path.split('.').pop()!.toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  assets[image.path] = `data:image/${mime};base64,${image.data.toString('base64')}`;
  imageBytes += image.data.length; bytes += image.data.length;
}
const data = JSON.stringify({ generated: new Date().toISOString(), files, assets, catalog, skipped, bytes }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const content = `// 생성 산출물 — pace backlog refresh 로 갱신; 직접 편집하지 마세요.\nwindow.PACE_DATA = ${data};\n`;
const previous = readFileSync(output, 'utf8');
const withoutTime = (value: string) => value.replace(/"generated":"[^"]*"/, '"generated":""');
if (withoutTime(previous) !== withoutTime(content)) {
  const temp = join(root, 'backlogs', 'dashboard', `.pace-data-${randomBytes(12).toString('hex')}.tmp`);
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: lstatSync(output).mode & 0o777 });
    renameSync(temp, output);
  } finally {
    try { unlinkSync(temp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
return `백로그 대시보드 자료 생성: ${Object.keys(files).length}개, ${bytes}바이트, 제외 ${skipped}개 (Git 무시 파일 제외)`;
} finally {
  try { if (readFileSync(lock, 'utf8') === identity) unlinkSync(lock); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
}

export function refreshDashboard(root: string, trackedOnly = false): boolean {
  try {
    const state = dashboardState(root);
    if (state === 'absent') return false;
    if (state === 'partial') {
      process.stderr.write('pace: 경고: 대시보드 부분 설치라 갱신하지 않았습니다. 기존 파일을 보존했습니다. `pace backlog init`으로 복구를 확인하세요.\n');
      return false;
    }
    return generateDashboard(root, trackedOnly) !== null;
  } catch (error) { process.stderr.write(`pace: 경고: 대시보드 갱신 실패: ${error instanceof Error ? error.message : String(error)} — 확인 후 pace backlog refresh를 재시도하세요\n`); return false; }
}
