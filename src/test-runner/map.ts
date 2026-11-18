import { globSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, relative, sep } from "node:path";

export type Runner = { kind: string; cwd: string; config?: string };
export type Unit = { id: string; sources: string[]; tests: string[]; runner: Runner; requires: string[] };
export type MapFile = { version: number; units: Unit[]; common: string[]; data: Record<string, unknown> };
const bad = (message: string): never => { throw new Error(message); };
export function paths(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) return bad(`${name}: 문자열 배열 필요`);
  return value as string[];
}
export function safePath(p: string): string {
  if (!p || p.includes("\0") || p.includes("\\") || isAbsolute(p) || p.split("/").includes("..") || p.startsWith("-")) return bad(`안전하지 않은 경로: ${p}`);
  return p;
}
export function inside(root: string, path: string): string {
  const actual = realpathSync(path); const rel = relative(realpathSync(root), actual);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return bad(`프로젝트 밖 경로: ${path}`);
  return actual;
}
export function config(root: string): MapFile {
  const path = join(root, ".pace/test-map.json"); inside(root, path);
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!raw || typeof raw !== "object") return bad("구성 객체 필요");
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.units) || o.units.length === 0) return bad("구성 버전 또는 단위 오류");
  const ids = new Set<string>();
  const units = o.units.map((item: unknown): Unit => {
    if (!item || typeof item !== "object") return bad("단위 객체 필요");
    const u = item as Record<string, unknown>; const r = u.runner as Record<string, unknown> | undefined;
    if (typeof u.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(u.id) || ids.has(u.id)) return bad("단위 ID 오류 또는 중복");
    ids.add(u.id);
    if (!r || typeof r.kind !== "string" || typeof r.cwd !== "string" || (r.config !== undefined && typeof r.config !== "string")) return bad("러너 설정 오류");
    const sources = paths(u.sources, "sources").map(safePath); const tests = paths(u.tests, "tests").map(safePath);
    if (!sources.length || !tests.length) return bad(`빈 단위: ${u.id}`);
    const cwd = safePath(r.cwd); if (!statSync(inside(root, resolve(root, cwd))).isDirectory()) return bad("러너 cwd가 디렉터리가 아니다");
    const runner: Runner = { kind: r.kind, cwd };
    if (typeof r.config === "string") { runner.config = safePath(r.config); inside(root, resolve(root, runner.config)); }
    return { id: u.id, sources, tests, runner, requires: paths(u.requires, "requires") };
  });
  const common = paths(o.common, "common").map(safePath);
  for (const pattern of [...common, ...units.flatMap((u) => [...u.sources, ...u.tests])]) {
    const found = globSync(pattern, { cwd: root });
    if (!found.length) return bad(`일치 0건 패턴: ${pattern}`);
    for (const file of found) inside(root, resolve(root, file));
  }
  return { version: 1, units, common, data: o };
}
