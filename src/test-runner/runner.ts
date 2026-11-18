import { globSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { isAbsolute, join, matchesGlob, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { openRepo, runDeclaredCheck } from "../project/harness.ts";

type Runner = { kind: string; cwd: string; config?: string };
type Unit = { id: string; sources: string[]; tests: string[]; runner: Runner; requires: string[] };
type MapFile = { version: number; units: Unit[]; common: string[] };
type Outcome = { code: number; text: string; interrupted?: boolean };
const bad = (message: string): never => { throw new Error(message); };
function paths(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) return bad(`${name}: 문자열 배열 필요`);
  return value as string[];
}
function safePath(p: string): string {
  if (!p || p.includes("\0") || p.includes("\\") || isAbsolute(p) || p.split("/").includes("..") || p.startsWith("-")) return bad(`안전하지 않은 경로: ${p}`);
  return p;
}
function inside(root: string, path: string): string {
  const actual = realpathSync(path); const rel = relative(realpathSync(root), actual);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return bad(`프로젝트 밖 경로: ${path}`);
  return actual;
}
function config(root: string): MapFile {
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
  return { version: 1, units, common };
}
async function fileResults(root: string, unit: Unit, files: string[], timeout: number): Promise<Outcome> {
  const kind = unit.runner.kind;
  if (unit.requires.length || !["node-test", "python-unittest", "vitest"].includes(kind) || (unit.runner.config && kind !== "vitest")) return { code: 3, text: `확인 불가: ${unit.id} — 미지원 러너·설정 또는 전제` };
  const driver = fileURLToPath(new URL(kind === "node-test" ? "./node-driver.mjs" : kind === "vitest" ? "./vitest-driver.mjs" : "./python-driver.py", import.meta.url));
  let failures = 0; let unknown = 0; let log = ""; let interrupted = false;
  // vitest는 시작 비용이 커서 단위의 파일을 한 프로세스로 묶어 돌린다 — 시간 제한도 묶음 전체에 한 번
  const batches = kind === "vitest" ? [files] : files.map((file) => [file]);
  for (const batch of batches) {
    const file = batch.join(", ");
    const executable = kind === "python-unittest" ? (process.platform === "win32" ? "python" : "python3") : process.execPath;
    const targets = batch.map((f) => inside(root, resolve(root, f)));
    const argv = kind === "vitest" ? [driver, realpathSync(root), unit.runner.config ? inside(root, resolve(root, unit.runner.config)) : "", ...targets] : [driver, ...targets]; const start = Date.now();
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null; output: string[]; error: Error | null }>((done) => {
      const child = spawn(executable, argv, { env, cwd: resolve(root, unit.runner.cwd), detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe", "pipe"] });
      const output = ["", "", "", ""]; let error: Error | null = null; let ended = false;
      for (const index of [1, 2, 3]) child.stdio[index]?.on("data", (chunk: Buffer) => { output[index] += chunk.toString(); if (output[index]!.length > 16 * 1024 * 1024) { error = new Error("출력 상한 초과"); stop(); } });
      // Windows에서 vitest는 드라이버 → vitest → 워커로 자손이 이어져 드라이버만 죽이면 남는다 — 트리째 끝낸다
      const stop = () => { try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL"); else if (kind === "vitest" && child.pid) { spawnSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); child.kill("SIGKILL"); } else child.kill("SIGKILL"); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ESRCH") error = e as Error; } };
      const signals: NodeJS.Signals[] = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];
      const interrupted = (signal: NodeJS.Signals) => { error = new Error(`중단: ${signal}`); stop(); };
      for (const signal of signals) process.on(signal, interrupted);
      const timer = setTimeout(() => { error = new Error("시간 초과"); stop(); }, timeout);
      child.on("error", (e) => { error = e; });
      child.on("close", (status, signal) => { if (ended) return; ended = true; clearTimeout(timer); for (const name of signals) process.off(name, interrupted); done({ status, signal, output, error }); });
    });
    log += `\n대상: ${file}\n명령: ${JSON.stringify([executable, ...argv])}\n시간: ${Date.now() - start}ms · 종료: ${result.status ?? result.signal ?? "오류"}\n${result.output[1] ?? ""}${result.output[2] ?? ""}`;
    if (result.error || result.signal || result.status !== 0) { failures++; if (result.error?.message.startsWith("중단:")) { interrupted = true; break; } continue; }
    let data: unknown; try { data = JSON.parse(String(result.output[3] ?? "")); } catch { unknown++; continue; }
    if (data === null && kind === "node-test") { failures++; log += "0건 실패\n"; continue; }
    if (!data || typeof data !== "object") { unknown++; continue; }
    const record = data as Record<string, unknown>;
    if (typeof record.unavailable === "string") { unknown++; log += `확인 불가: ${record.unavailable}\n`; continue; }
    const counts = (kind === "python-unittest" ? record : record.counts) as Record<string, unknown> | undefined;
    if (!counts || typeof counts.tests !== "number" || typeof counts.skipped !== "number" || typeof counts.failed !== "number" || typeof record.success !== "boolean") { unknown++; continue; }
    const todo = typeof counts.todo === "number" ? counts.todo : 0;
    log += `테스트 ${counts.tests} · skip ${counts.skipped} · 실패 ${counts.failed}\n`;
    if (!record.success || counts.failed > 0 || counts.tests === 0 || counts.tests <= counts.skipped + todo) failures++;
  }
  return { code: failures ? 1 : unknown ? 3 : 0, text: log, interrupted };
}
export async function executeTest(cwd: string, args: string[], timeout = 30 * 60_000): Promise<Outcome> {
  try {
    const repo = openRepo(cwd); const root = repo.root; const [mode, arg] = args;
    if (mode === "all" && args.length === 1) {
      const start = Date.now(); const result = runDeclaredCheck(root);
      return { code: result.command === null ? 3 : result.ok ? 0 : 1, text: `전체 검사 · 명령: ${result.command ?? "없음"} · 시간: ${Date.now() - start}ms\n${result.output}` };
    }
    if ((mode !== "file" && mode !== "unit") || args.length !== 2 || !arg) return bad("사용법: pace test file <경로> | unit <id> | all");
    let map: MapFile; try { map = config(root); } catch (error) { return bad(`구성 오류: ${(error as Error).message}`); }
    let chosen: Unit[]; let direct: string | undefined;
    if (mode === "file") {
      const target = safePath(arg); const actual = inside(root, resolve(root, target));
      if (!lstatSync(actual).isFile()) return bad("파일이 아니다");
      const rel = relative(root, resolve(root, target)).split(sep).join("/");
      if (map.common.some((p) => matchesGlob(rel, p))) return { code: 3, text: `확인 불가: 공통 경로 ${rel} — 전체 검사 권고` };
      chosen = map.units.filter((u) => [...u.sources, ...u.tests].some((p) => matchesGlob(rel, p)));
      if (!chosen.length) return { code: 3, text: `확인 불가: 미분류 ${rel} — 전체 검사 권고` };
      if (!chosen.some((u) => u.sources.some((p) => matchesGlob(rel, p))) && chosen.some((u) => u.tests.some((p) => matchesGlob(rel, p)))) { direct = rel; chosen = chosen.filter((u) => u.tests.some((p) => matchesGlob(rel, p))); }
    } else { chosen = map.units.filter((u) => u.id === arg); if (!chosen.length) return bad(`없는 단위: ${arg}`); }
    let code = 0; let text = "부분 검사 · 타입·공통·전체 회귀 제외\n";
    for (const unit of chosen) {
      const allFiles = [...new Set(unit.tests.flatMap((p) => globSync(p, { cwd: root }).map((file) => file.split(sep).join("/"))))].sort();
      const files = direct ? allFiles.filter((f) => f === direct) : allFiles;
      if (!files.length) { code = 1; text += `\n${unit.id}: 선택 파일 없음`; continue; }
      const result = await fileResults(root, unit, files, timeout); code = code === 1 || result.code === 1 ? 1 : code === 3 || result.code === 3 ? 3 : 0; text += `\n단위 ${unit.id}: ${result.text}`; if (result.interrupted) break;
    }
    return { code, text: `${text}\n판정: ${code === 0 ? "부분 통과" : code === 3 ? "확인 불가" : "실패"}` };
  } catch (error) { return { code: 1, text: `실패: ${(error as Error).message}` }; }
}
