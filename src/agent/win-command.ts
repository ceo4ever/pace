import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { assertSafeGitPath } from '../core/paths.ts';

/** Windows PATH의 상대 항목과 작업 폴더는 실행 파일 검색에서 제외한다. */
function findExecutable(name: string, env: NodeJS.ProcessEnv): string | null {
  const rooted = (p: string) => /^[A-Za-z]:[\\/]/.test(p) || /^\\\\(?![?.]\\)[^\\]+\\[^\\]+/.test(p);
  const safeFile = (path: string) => {
    try { lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (/\.cmd$/i.test(path) && lstatSync(path).isSymbolicLink()) throw new Error('배치 shim 링크는 허용하지 않는다. 공식 설치를 확인한다.');
    if (!statSync(path).isFile()) return null;
    const resolved = realpathSync.native(path);
    const ext = (p: string) => /\.[^.\\/]+$/.exec(p)?.[0].toLowerCase() ?? '';
    if (ext(path) !== ext(resolved)) throw new Error('실행 파일 링크의 확장자가 다르다. 공식 설치를 확인한다.');
    return resolved;
  };
  if (isAbsolute(name)) return rooted(name) ? safeFile(name) : null;
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null;
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH');
  for (const raw of (key ? env[key] ?? '' : '').split(';')) {
    const dir = raw.replace(/^"(.*)"$/, '$1');
    if (!rooted(dir)) continue;
    for (const suffix of /\.[^.]+$/.test(name) ? [''] : ['.exe', '.cmd']) {
      const candidate = join(dir, name + suffix);
      const resolved = safeFile(candidate);
      if (resolved) return resolved;
    }
  }
  return null;
}

/** 표준 npm .cmd만 파싱한다. 임의 배치 코드는 절대 실행하지 않는다. */
export function resolveWindowsCommand(command: string, args: string[], env: NodeJS.ProcessEnv): { command: string; args: string[] } {
  const found = findExecutable(command, env);
  if (!found) throw Object.assign(new Error('Windows 실행 파일을 찾지 못했다. 공식 설치와 절대 PATH를 확인한다.'), { code: 'ENOENT' });
  assertSafeGitPath(found);
  if (/\.exe$/i.test(found)) return { command: found, args };
  if (!/\.cmd$/i.test(found)) throw new Error('임의 배치는 실행할 수 없다. 공식 npm 설치를 확인한다.');
  const body = readFileSync(found, 'utf8').replace(/\r\n/g, '\n');
  const pattern = /^@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT \/b\n:start\nSETLOCAL\nCALL :find_dp0\n\nIF EXIST "%dp0%\\node\.exe" \(\n  SET "_prog=%dp0%\\node\.exe"\n\) ELSE \(\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;\.JS;=;%\n\)\n\nendLocal & goto #_undefined_# 2>NUL \|\| title %COMSPEC% & "%_prog%"  "%dp0%\\(node_modules\\[^"\r\n]+\.js)" %\*\n?$/i;
  const match = pattern.exec(body);
  if (!match || /[\/:%]/.test(match[1]!) || match[1]!.split('\\').some(p => p === '..' || p === '.')) throw new Error('검증되지 않은 배치 shim이다. 공식 npm 설치를 확인한다.');
  const root = realpathSync.native(dirname(found));
  let script: string;
  try { script = realpathSync.native(join(root, ...match[1]!.split('\\'))); }
  catch { throw new Error('npm shim 스크립트를 찾지 못했다. 공식 설치를 확인한다.'); }
  const modulesRoot = realpathSync.native(join(root, 'node_modules'));
  const modulesRel = relative(root, modulesRoot);
  if (!modulesRel || isAbsolute(modulesRel) || modulesRel === '..' || modulesRel.startsWith('..' + sep)) throw new Error('npm 설치 폴더가 shim 경계를 벗어난다. 공식 설치를 확인한다.');
  const rel = relative(modulesRoot, script);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) throw new Error('npm shim 스크립트가 설치 경계를 벗어난다. 공식 설치를 확인한다.');
  assertSafeGitPath(script);
  const localNode = join(root, 'node.exe');
  if (existsSync(localNode) && lstatSync(localNode).isSymbolicLink()) throw new Error('Node 실행 파일 링크는 허용하지 않는다. 공식 설치를 확인한다.');
  const node = existsSync(localNode) && statSync(localNode).isFile() ? realpathSync.native(localNode) : findExecutable('node.exe', env);
  if (!node) throw new Error('Node 실행 파일을 찾지 못했다. 공식 Node 설치와 절대 PATH를 확인한다.');
  assertSafeGitPath(node);
  return { command: node, args: [script, ...args] };
}
