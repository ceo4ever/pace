import { lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

type Identity = { path: string; real: string; dev: number; ino: number };
const normalized = (p: string) => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);
function identity(path: string): Identity {
  const absolute = resolve(path), stat = lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`소유 폴더가 아니거나 링크: ${absolute}`);
  const real = realpathSync.native(absolute);
  if (normalized(real) !== normalized(absolute)) throw new Error(`폴더 실경로가 다르다: ${absolute}`);
  return { path: absolute, real, dev: stat.dev, ino: stat.ino };
}
function same(id: Identity): void {
  const current = identity(id.path);
  if (current.dev !== id.dev || current.ino !== id.ino || normalized(current.real) !== normalized(id.real)) throw new Error(`소유 폴더가 교체됐다: ${id.path}`);
}
function below(parent: string, child: string): boolean {
  const rel = relative(parent, child); return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
function noLinks(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`프로필에 링크가 있다: ${path}`);
    if (stat.isDirectory()) noLinks(path);
  }
}
export type OwnedGuard = { root: Identity; output: Identity; container: Identity; profile: Identity };
export function captureOwnedProfile(root: string, output: string, container: string, profile: string): OwnedGuard {
  const guard = { root: identity(root), output: identity(output), container: identity(container), profile: identity(profile) };
  if (!below(guard.root.real, guard.output.real) || !below(guard.output.real, guard.container.real) || normalized(dirname(guard.profile.real)) !== normalized(guard.container.real) || !guard.profile.path.split(sep).at(-1)!.startsWith('canvas-tools-chrome-')) throw new Error('프로필 소유 경로가 일치하지 않는다');
  return guard;
}
export function verifyOwnedProfile(guard: OwnedGuard): void {
  same(guard.root); same(guard.output); same(guard.container); same(guard.profile);
}

export type TempEvent = { path: string; kind: 'file'; event: 'seen' | 'gone'; at: string };
/** 감시 중 일반 파일은 기록만 하고, 실행 후 자연 소멸을 확인한다. */
export class OwnedTempObserver {
  readonly profiles = new Map<string, OwnedGuard>();
  readonly events: TempEvent[] = [];
  private files = new Set<string>();
  private rootId: Identity;
  private outputId: Identity;
  private chromeId: Identity;
  private observerId: Identity;
  private root: string;
  private output: string;
  private chromeTemp: string;
  private observerTemp: string;
  constructor(root: string, output: string, chromeTemp: string, observerTemp: string) {
    this.root = root; this.output = output; this.chromeTemp = chromeTemp; this.observerTemp = observerTemp;
    this.rootId = identity(root); this.outputId = identity(output); this.chromeId = identity(chromeTemp); this.observerId = identity(observerTemp);
    if (!below(this.rootId.real, this.outputId.real) || !below(this.outputId.real, this.chromeId.real) || !below(this.outputId.real, this.observerId.real) || normalized(this.chromeId.real) === normalized(this.observerId.real)) throw new Error('임시 감시 경로가 겹치거나 소유 루트 밖이다');
  }
  scan(): string[] {
    same(this.rootId); same(this.outputId); same(this.chromeId); same(this.observerId);
    const current = new Set<string>();
    for (const [dir, allowProfiles] of [[this.chromeTemp, true], [this.observerTemp, false]] as const) {
      for (const entry of readdirSync(dir)) {
        const path = resolve(dir, entry);
        let stat: ReturnType<typeof lstatSync>;
        try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        if (stat.isSymbolicLink()) throw new Error(`임시 경로에 링크: ${path}`);
        if (stat.isFile()) { current.add(path); if (!this.files.has(path)) this.events.push({ path, kind: 'file', event: 'seen', at: new Date().toISOString() }); continue; }
        if (!stat.isDirectory() || !allowProfiles || !entry.startsWith('canvas-tools-chrome-')) throw new Error(`알 수 없는 임시 항목: ${path}`);
        const guard = this.profiles.get(path);
        try { if (guard) verifyOwnedProfile(guard); else this.profiles.set(path, captureOwnedProfile(this.root, this.output, this.chromeTemp, path)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
    }
    for (const path of this.files) if (!current.has(path)) this.events.push({ path, kind: 'file', event: 'gone', at: new Date().toISOString() });
    this.files = current;
    return [...current];
  }
  async waitForFiles(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let files = this.scan();
    while (files.length && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 100)); files = this.scan(); }
    if (files.length) throw new Error(`일시 파일이 남았다: ${files.join(', ')}`);
  }
}
export async function cleanOwnedProfile(guard: OwnedGuard, processesGone: () => Promise<boolean>): Promise<{ attempts: number }> {
  let last: unknown;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      same(guard.root); same(guard.output); same(guard.container); same(guard.profile); noLinks(guard.profile.path);
      if (!await processesGone()) throw new Error('소유 프로세스가 남아 있다');
      // 비동기 프로세스 확인 이후에도 모든 신원을 다시 확인한다.
      same(guard.root); same(guard.output); same(guard.container); same(guard.profile); noLinks(guard.profile.path);
      rmSync(guard.profile.path, { recursive: true });
      await new Promise((r) => setTimeout(r, 500));
      same(guard.root); same(guard.output); same(guard.container);
      try { lstatSync(guard.profile.path); throw new Error('정리한 프로필이 재생성됐다'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (!await processesGone()) throw new Error('정리 뒤 소유 프로세스가 발견됐다');
      return { attempts: attempt };
    } catch (error) {
      last = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error;
      if (attempt < 8) await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  throw last;
}
