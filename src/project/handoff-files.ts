import { constants, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { commonGitDirectory } from "../team/resource-lock.ts";
import { safeTeamPath } from "../team/store.ts";
import { hasSecret } from "./secrets.ts";

export class HandoffError extends Error {}
export class HandoffGuardBusy extends HandoffError {}
export const BODY_LIMIT = 2 * 1024 * 1024;
export const HEADER_LIMIT = 16384;
export const LEDGER_LIMIT = 32 * 1024 * 1024;
export const digest = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const hashValue = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
export const shortText = (value: unknown, max = 400): value is string => typeof value === "string" && !!value.trim() && value.length <= max && value.isWellFormed() && !/[\p{Cc}\p{Cf}]/u.test(value) && !hasSecret(value);
export const identifier = (value: unknown): value is string => shortText(value, 96) && /^[a-z][a-z0-9_-]*$/.test(value);
export function fields(value: unknown, allowed: string[], required = allowed): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) throw new HandoffError("소통 객체의 필수/허용 필드 오류");
}
export function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
export function gitRead(cwd: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"]) delete env[key];
  const result = spawnSync("git", ["-c", "core.fsmonitor=false", "-C", cwd, ...args], { encoding: "utf8", timeout: 5000, maxBuffer: LEDGER_LIMIT, env });
  if (result.error || result.signal) throw new HandoffError("소통 Git 경계 확인 실패");
  return result;
}
export function regularBytes(path: string, limit: number): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) throw new HandoffError("소통 파일 종류/링크/크기 오류");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd), current = lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== before.dev || stat.ino !== before.ino || current.dev !== stat.dev || current.ino !== stat.ino || current.isSymbolicLink()) throw new HandoffError("소통 파일이 바뀌었다");
    const buffer = Buffer.alloc(Math.min(limit + 1, stat.size + 1)); let length = 0;
    while (length < buffer.length) { const count = readSync(fd, buffer, length, buffer.length - length, null); if (!count) break; length += count; }
    const after = fstatSync(fd);
    if (length > limit || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new HandoffError("소통 파일 크기/읽기 중 변경 오류");
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}
export function utf8(bytes: Buffer): string {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text).equals(bytes) || text.includes("\0")) throw new HandoffError("소통 본문은 NUL 없는 UTF-8이어야 한다");
  return text;
}
/** Duplicate JSON keys are rejected even if escaped differently; JSON.parse alone loses them. */
export function strictJson(text: string): unknown {
  let i = 0;
  const white = () => { while (/\s/.test(text[i] ?? "") && i < text.length) i++; };
  const string = (): string => {
    const start = i++;
    while (i < text.length) {
      const char = text[i++];
      if (char === "\\") { i++; continue; }
      if (char === '"') return JSON.parse(text.slice(start, i)) as string;
    }
    throw new HandoffError("JSON 문자열 오류");
  };
  const value = (depth: number): void => {
    if (depth > 24) throw new HandoffError("JSON 깊이 초과");
    white(); const char = text[i];
    if (char === "{") {
      i++; white(); const keys = new Set<string>();
      if (text[i] === "}") { i++; return; }
      while (i < text.length) {
        white(); if (text[i] !== '"') throw new HandoffError("JSON 키 오류");
        const key = string(); if (keys.has(key)) throw new HandoffError("중복 JSON 키"); keys.add(key);
        white(); if (text[i++] !== ":") throw new HandoffError("JSON 구분자 오류"); value(depth + 1); white();
        if (text[i] === "}") { i++; return; }
        if (text[i++] !== ",") throw new HandoffError("JSON 객체 오류");
      }
    } else if (char === "[") {
      i++; white(); if (text[i] === "]") { i++; return; }
      while (i < text.length) { value(depth + 1); white(); if (text[i] === "]") { i++; return; } if (text[i++] !== ",") throw new HandoffError("JSON 배열 오류"); }
    } else if (char === '"') { string(); return; }
    else { const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i)); if (match) { i += match[0].length; return; } }
    throw new HandoffError("JSON 값 오류");
  };
  try { value(0); white(); if (i !== text.length) throw new Error(); return JSON.parse(text); }
  catch (error) { if (error instanceof HandoffError) throw error; throw new HandoffError("소통 JSON 오류"); }
}
export function createDir(root: string, rel: string): string {
  const dir = safeTeamPath(root, rel, true); mkdirSync(dir, { recursive: true, mode: 0o700 }); return safeTeamPath(root, rel, true);
}
export function atomicText(root: string, name: string, data: string | Buffer): void {
  const target = safeTeamPath(root, name), tempName = `.write-${randomUUID()}.tmp`, temp = safeTeamPath(root, tempName);
  const fd = openSync(temp, "wx", 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  safeTeamPath(root, name); renameSync(temp, target);
}
/** Git's internal directory is local only; refuse a separate git-dir that another worktree could stage. */
export function localHandoffBase(root: string): string {
  const common = commonGitDirectory(root), parent = gitRead(dirname(common), ["rev-parse", "--show-toplevel"]);
  if (parent.status === 0) {
    const outer = realpathSync.native(parent.stdout.trim()), rel = relative(outer, common).split(sep).join("/");
    if (within(outer, common) && rel !== ".git" && !rel.startsWith(".git/")) throw new HandoffError("Git 추적 가능 separate-git-dir에는 원문을 저장하지 않는다");
  } else if (!/not a git repository|must be run in a work tree/i.test(parent.stderr)) throw new HandoffError("로컬 원문 저장 위치를 확인하지 못했다");
  return safeTeamPath(common, "pace/handoffs", true);
}
