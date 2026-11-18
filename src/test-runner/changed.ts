import { spawnSync } from "node:child_process";
import { globSync, lstatSync } from "node:fs";
import { matchesGlob, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DEFINITION_FILES, openRepo, runDeclaredCheck, runDeclaredShell } from "../project/harness.ts";
import { config, inside, safePath } from "./map.ts";
import type { Unit } from "./map.ts";
import { fileResults } from "./execute.ts";
import type { Outcome } from "./execute.ts";

const scope = "변경 기준: staged/unstaged/untracked 작업본 · 커밋된 변경 비교 제외\n전체 회귀: 프로젝트 전체 명령 · pace test all/finish는 기존 main 기준\n";
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function git(cwd: string, args: string[]) {
  return spawnSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_LAZY_FETCH: "1" }, encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
}
function readGit(cwd: string, args: string[]): string {
  const r = git(cwd, args);
  if (r.error || r.status !== 0 || r.signal || r.stderr) throw new Error(`Git 조회 불가: ${r.error?.message || r.stderr || r.signal || r.status}`);
  return r.stdout;
}
function commit(cwd: string, ref: string): string {
  const sha = readGit(cwd, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha)) throw new Error("Git commit 확인 불가");
  return sha;
}
function context(cwd: string) {
  const root = readGit(cwd, ["rev-parse", "--show-toplevel"]).replace(/\r?\n$/, "");
  const head = commit(root, "HEAD");
  const repo = openRepo(root);
  for (const label of ["main", "master"]) {
    const r = git(root, ["show-ref", "--verify", "--quiet", `refs/heads/${label}`]);
    if (r.error || r.signal || r.stderr || (r.status !== 0 && r.status !== 1)) throw new Error(`기준 ref 조회 불가: ${r.error?.message ?? r.stderr ?? r.status}`);
    if (r.status === 0) return { root: repo.root, head, revision: commit(root, `refs/heads/${label}`), label };
  }
  return { root: repo.root, head, revision: head, label: "HEAD" };
}
function nulRecords(text: string): string[] {
  if (!text) return [];
  if (!text.endsWith("\0")) throw new Error("Git NUL 목록이 불완전함");
  return text.slice(0, -1).split("\0");
}
function changes(root: string, head: string) {
  const files = new Set<string>(), states = new Map<string, string[]>(); let uncertain = "";
  for (const record of nulRecords(readGit(root, ["ls-files", "-v", "-z"]))) {
    if (!/^[A-Za-z?] /.test(record) || record.length < 3) throw new Error("Git 인덱스 가시성 확인 불가");
    if (/^[a-zS]$/.test(record[0]!)) return { files: [], uncertain: `숨김 인덱스 플래그: ${JSON.stringify(record)}` };
  }
  for (const key of ["core.sparseCheckout", "index.sparse"]) {
    const r = git(root, ["config", "--bool", "--get", key]);
    if (!r.error && !r.signal && !r.stderr && r.status === 1 && !r.stdout) continue;
    if (r.error || r.signal || r.stderr || r.status !== 0 || !/^(true|false)\r?\n?$/.test(r.stdout)) throw new Error(`Git sparse 설정 확인 불가: ${key}`);
    if (r.stdout.trim() === "true") return { files: [], uncertain: `sparse 추적 범위: ${key}` };
  }
  const status = readGit(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none", "--no-renames"]);
  for (const record of nulRecords(status)) {
    if (!/^[ MADRCUT?!]{2} /.test(record) || record.length < 4) throw new Error("Git 상태 레코드 확인 불가");
    const state = record.slice(0, 2), file = record.slice(3);
    if (/[RC]/.test(state)) throw new Error("Git rename 레코드 확인 불가");
    const previous = states.get(file) ?? [];
    if (previous.some(other => (other === "??") !== (state === "??"))) uncertain = "동일 경로의 tracked/untracked 상태 공존";
    states.set(file, [...previous, state]);
    if (state.includes("D")) uncertain = "삭제 상태";
    files.add(file);
    if (state.includes("U") || state === "AA" || state === "DD" || state.includes("T")) uncertain = "충돌 또는 파일 형식 변경";
  }
  for (const extra of [[], ["--cached", head]]) {
    const raw = nulRecords(readGit(root, ["diff", "--raw", "--no-abbrev", "-z", "--no-renames", "--ignore-submodules=none", "--no-ext-diff", ...extra]));
    for (let index = 0; index < raw.length; index += 2) {
      const header = /^:([0-7]{6}) ([0-7]{6}) [a-f0-9]+ [a-f0-9]+ ([A-Z])$/.exec(raw[index]!);
      if (!header || raw[index + 1] === undefined) throw new Error("Git raw 변경 목록 확인 불가");
      files.add(raw[index + 1]!);
      if (header[3] === "D") uncertain = "삭제 상태(raw)";
      if (header[1] === "160000" || header[2] === "160000" || header[3] === "U" || header[3] === "T" || (header[1] !== "000000" && header[2] !== "000000" && header[1] !== header[2])) uncertain = "충돌·모드·형식·submodule 변경";
    }
  }
  return { files: [...files].sort(), uncertain };
}
export function matchChangedPath(file: string, pattern: string, platform: NodeJS.Platform = process.platform): boolean {
  return matchesGlob(platform === "win32" ? file.toLowerCase() : file, platform === "win32" ? pattern.toLowerCase() : pattern);
}
function checks(root: string, data: unknown): { cwd: string; command: string }[] {
  if (!Array.isArray(data)) throw new Error("checks 배열 선언 없음 또는 형식 오류");
  return data.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("checks 객체 필요");
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some(key => key !== "cwd" && key !== "command") || typeof row.cwd !== "string" || typeof row.command !== "string" || !row.command.trim() || row.command.length > 4000 || /[\r\n\0]/.test(row.command)) throw new Error("checks cwd/단일행 command 선언 오류");
    const cwd = inside(root, resolve(root, safePath(row.cwd)));
    if (!lstatSync(cwd).isDirectory()) throw new Error("checks cwd가 디렉터리가 아님");
    return { cwd, command: row.command };
  });
}
function plan(root: string, revision: string, files: string[]) {
  const map = config(root);
  const committed = readGit(root, ["ls-tree", "--name-only", "-z", revision, "--", ".pace/test-map.json"]);
  if (committed !== ".pace/test-map.json\0") throw new Error("기준 commit의 test-map 없음");
  const baseline: unknown = JSON.parse(readGit(root, ["show", `${revision}:.pace/test-map.json`]));
  if (!isDeepStrictEqual(map.data, baseline)) throw new Error("작업본 map이 기준 commit과 다름");
  const declared = checks(root, (baseline as Record<string, unknown>).checks);
  const selected = new Map<string, { unit: Unit; reasons: string[]; files: string[] }>();
  for (const file of files) {
    safePath(file);
    if ([".pace/test-map.json", ...DEFINITION_FILES].some(control => matchChangedPath(file, control))) throw new Error(`검사 선언/구성 변경: ${JSON.stringify(file)}`);
    if (map.common.some(pattern => matchChangedPath(file, pattern))) throw new Error(`공통 경로: ${JSON.stringify(file)}`);
    const stat = lstatSync(resolve(root, file));
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`삭제/링크/디렉터리 경로: ${JSON.stringify(file)}`);
    inside(root, resolve(root, file));
    const units = map.units.filter(unit => [...unit.sources, ...unit.tests].some(pattern => matchChangedPath(file, pattern)));
    if (!units.length) throw new Error(`미분류: ${JSON.stringify(file)}`);
    for (const unit of units) {
      if (unit.requires.length || unit.runner.config || !["node-test", "python-unittest"].includes(unit.runner.kind)) throw new Error(`미지원 러너/설정/전제: ${unit.id}`);
      const entry = selected.get(unit.id) ?? { unit, reasons: [], files: [] };
      entry.reasons.push(file); selected.set(unit.id, entry);
    }
  }
  for (const entry of selected.values()) {
    const seen = new Set<string>();
    for (const pattern of entry.unit.tests) for (const file of globSync(pattern, { cwd: root })) {
      const normalized = file.split(sep).join("/"); const actual = inside(root, resolve(root, normalized));
      if (!lstatSync(actual).isFile()) throw new Error("시험 대상이 파일이 아님");
      const key = process.platform === "win32" ? actual.toLowerCase() : actual;
      if (!seen.has(key)) { seen.add(key); entry.files.push(normalized); }
    }
    if (!entry.files.length) throw new Error(`선택 시험 없음: ${entry.unit.id}`);
    entry.files.sort();
  }
  return { checks: declared, entries: [...selected.values()] };
}

export async function executeChanged(cwd: string, timeout: number): Promise<Outcome> {
  let text = scope;
  const observed = { failed: false, interrupted: false };
  try {
    let ctx: ReturnType<typeof context>;
    try { ctx = context(cwd); }
    catch (error) { return { code: 3, text: scope + `확인 불가: 저장소/HEAD/기준 — ${message(error)}` }; }
    text += `선언 기준: ${ctx.label} ${ctx.revision}\n`;
    const full = (reason: string): Outcome => {
      text += `전체 검사 전환: ${reason}\n`;
      try {
        for (const file of DEFINITION_FILES) {
          try { lstatSync(resolve(ctx.root, file)); inside(ctx.root, resolve(ctx.root, file)); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        }
        const start = Date.now(), result = runDeclaredCheck(ctx.root, ctx.revision);
        observed.failed ||= result.execution === "failed" || result.execution === "interrupted";
        observed.interrupted ||= result.execution === "interrupted";
        const code = observed.failed ? 1 : result.execution === "passed" ? 0 : 3;
        return { code, interrupted: result.execution === "interrupted", text: text + `전체 검사 · 명령: ${JSON.stringify(result.command)} · 시간: ${Date.now() - start}ms · 실행시작: ${result.started}\n${result.output}\n판정: ${code === 0 ? "전체 검사 통과" : code === 3 ? "전체 검사 확인 불가" : "전체 검사 실패/중단"}` };
      } catch (error) { return { code: observed.failed ? 1 : 3, interrupted: observed.interrupted, text: text + `전체 검사 실행 경계 예외: ${message(error)}` }; }
    };
    let selected: ReturnType<typeof plan>;
    try {
      const changed = changes(ctx.root, ctx.head);
      if (changed.uncertain) return full(changed.uncertain);
      if (!changed.files.length) return { code: 3, text: text + "변경 없음 — 검사 미실행" };
      text += `변경 파일: ${JSON.stringify(changed.files)}\n`;
      selected = plan(ctx.root, ctx.revision, changed.files);
    } catch (error) { return full(message(error)); }
    for (const entry of selected.entries) text += `선택 ${entry.unit.id}: ${JSON.stringify(entry.reasons)} → ${JSON.stringify(entry.files)}\n`;
    for (const check of selected.checks) {
      const start = Date.now(), result = runDeclaredShell(check.cwd, check.command, timeout);
      observed.failed ||= result.execution === "failed" || result.execution === "interrupted";
      observed.interrupted ||= result.execution === "interrupted";
      text += `사전 검사 · cwd: ${JSON.stringify(check.cwd)} · 명령: ${JSON.stringify(check.command)} · 시간: ${Date.now() - start}ms · 상태: ${result.execution}\n${result.output}\n`;
      if (result.execution === "unavailable") return full("사전 검사 시작 불가");
      if (result.execution !== "passed") return { code: 1, interrupted: result.execution === "interrupted", text: text + "판정: 사전 검사 실패/중단" };
    }
    for (const entry of selected.entries) {
      const result = await fileResults(ctx.root, entry.unit, entry.files, timeout, true);
      observed.failed ||= result.code === 1 || result.interrupted === true;
      observed.interrupted ||= result.interrupted === true;
      text += `단위 ${entry.unit.id}:${result.text}\n`;
      if (result.interrupted || result.code === 1) return { code: 1, interrupted: result.interrupted, text: text + "판정: 선택 시험 실패/중단" };
      if (result.code !== 0) return full("선택 시험 결과 확인 불가");
    }
    return { code: observed.failed ? 1 : 0, text: text + (observed.failed ? "판정: 실패/중단 보존" : "판정: 부분 통과 · 전체 회귀 제외") };

  } catch (error) {
    return { code: observed.failed ? 1 : 3, interrupted: observed.interrupted, text: text + `실행 경계 예외: ${message(error)}` };
  }
}
