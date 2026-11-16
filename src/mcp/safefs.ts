import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";

// 고정 루트 안에서만 읽는다 — 링크·하드링크·교체된 루트를 호출 시점마다 거부한다.
// 보장 범위: 호출 이전에 존재하던 이탈은 거부, 호출 중 변화는 앞뒤 scan 비교로 탐지(복원된 변화는 놓칠 수 있음). 원자적 격리는 아니다.

export class BoundaryError extends Error {}

export const SCAN_LIMITS = { maxEntries: 5000, maxFileBytes: 1_000_000, maxTotalBytes: 20_000_000, maxDepth: 8, deadlineMs: 5000 } as const;
export type ScanLimits = { -readonly [K in keyof typeof SCAN_LIMITS]: number };

/** 기동 때 확정한 루트 — 이후 호출마다 같은 실경로·같은 파일 식별자인지 확인한다 */
export interface RootPin {
  path: string;
  real: string;
  dev: number;
  ino: number;
}

const fold = (p: string): string => (process.platform === "win32" ? p.toLowerCase() : p);

export function pinRoot(path: string): RootPin {
  let real: string;
  try { real = realpathSync.native(resolve(path)); } catch { throw new BoundaryError(`루트가 없다: ${path}`); }
  const st = statSync(real);
  if (!st.isDirectory()) throw new BoundaryError(`루트가 폴더가 아니다: ${path}`);
  return { path: resolve(path), real, dev: Number(st.dev), ino: Number(st.ino) };
}

export function checkPinned(pin: RootPin): void {
  let real: string;
  let st;
  try { real = realpathSync.native(pin.path); st = statSync(real); } catch { throw new BoundaryError("고정한 루트가 사라졌다"); }
  if (fold(real) !== fold(pin.real) || Number(st.dev) !== pin.dev || Number(st.ino) !== pin.ino) throw new BoundaryError("고정한 루트가 교체됐다");
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(fold(parent), fold(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && !rel.startsWith(`..${sep}`));
}

export interface ScanResult {
  exists: boolean;
  /** 루트 기준 상대 경로 → 지문(size:mtime:ino) */
  entries: Map<string, string>;
  files: string[];
}

export interface ScanOptions {
  limits?: Partial<ScanLimits>;
  now?: () => number;
}

/** boundary 안에서 root를 훑는다. 링크·하드링크·상한 초과는 BoundaryError. 없는 root는 가장 가까운 기존 상위가 안전할 때만 빈 상태. */
export function scan(root: string, boundary: RootPin, options: ScanOptions = {}): ScanResult {
  const limits = { ...SCAN_LIMITS, ...options.limits };
  const now = options.now ?? Date.now;
  const deadline = now() + limits.deadlineMs;
  checkPinned(boundary);
  const abs = resolve(root);
  if (!isInside(boundary.path, abs)) throw new BoundaryError("루트가 경계 밖이다");
  // 루트까지의 각 구성요소: 링크 금지, 존재하면 실경로가 경계 안
  const parts = relative(boundary.path, abs).split(sep).filter(Boolean);
  let cursor = boundary.path;
  for (const part of parts) {
    cursor = join(cursor, part);
    let st;
    try { st = lstatSync(cursor); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, entries: new Map(), files: [] };
      throw new BoundaryError(`경로를 확인하지 못했다: ${(error as Error).message}`);
    }
    if (st.isSymbolicLink()) throw new BoundaryError("경로 중간에 링크가 있다");
    if (!st.isDirectory()) throw new BoundaryError("경로 중간이 폴더가 아니다");
    if (!isInside(boundary.real, realpathSync.native(cursor))) throw new BoundaryError("실경로가 경계 밖이다");
  }
  const entries = new Map<string, string>();
  const files: string[] = [];
  let total = 0;
  const walk = (dir: string, rel: string, depth: number): void => {
    if (depth > limits.maxDepth) throw new BoundaryError(`깊이 상한(${limits.maxDepth}) 초과`);
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      if (now() > deadline) throw new BoundaryError("탐색 시간 상한 초과");
      if (entries.size >= limits.maxEntries) throw new BoundaryError(`항목 상한(${limits.maxEntries}) 초과`);
      const path = join(dir, dirent.name);
      const key = rel ? `${rel}/${dirent.name}` : dirent.name;
      const st = lstatSync(path);
      if (st.isSymbolicLink()) throw new BoundaryError(`링크가 있다: ${key}`);
      if (st.isDirectory()) { entries.set(key, `dir:${Number(st.ino)}`); walk(path, key, depth + 1); continue; }
      if (!st.isFile()) throw new BoundaryError(`일반 파일이 아니다: ${key}`);
      if (st.nlink > 1) throw new BoundaryError(`하드링크 파일이다: ${key}`);
      if (st.size > limits.maxFileBytes) throw new BoundaryError(`파일 크기 상한 초과: ${key}`);
      total += st.size;
      if (total > limits.maxTotalBytes) throw new BoundaryError("루트 총 크기 상한 초과");
      entries.set(key, `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${Number(st.ino)}`);
      files.push(key);
    }
  };
  const rootStat = lstatSync(abs);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new BoundaryError("루트가 링크이거나 폴더가 아니다");
  walk(abs, "", 0);
  return { exists: true, entries, files };
}

/** 두 scan의 차이 — 추가·삭제·변경된 항목 이름 */
export function diffScans(before: ScanResult, after: ScanResult): string[] {
  const names = new Set([...before.entries.keys(), ...after.entries.keys()]);
  return [...names].filter((k) => before.entries.get(k) !== after.entries.get(k)).sort();
}

/** 읽은 직후 실경로가 경계 안인지 다시 확인한다(파일·폴더 하나) */
export function recheckInside(path: string, boundary: RootPin): void {
  let real: string;
  try { real = realpathSync.native(path); } catch { throw new BoundaryError("읽은 뒤 경로를 확인하지 못했다"); }
  if (!isInside(boundary.real, real)) throw new BoundaryError("읽은 뒤 실경로가 경계 밖이다");
  if (lstatSync(path).isSymbolicLink()) throw new BoundaryError("읽은 뒤 링크로 바뀌었다");
}

export function parentOf(p: string): string {
  return dirname(p);
}

/** 사용자가 준 경로가 pin과 같은 폴더(실경로)인지 */
export function realpathCompare(path: string, pin: RootPin): boolean {
  try { return fold(realpathSync.native(resolve(path))) === fold(pin.real); } catch { return false; }
}
