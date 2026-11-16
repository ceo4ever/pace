import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 변경 스냅샷 — 파일 상태 표시(git status)가 아니라 실제 내용으로 실행 전후를 비교한다.
// 실제 인덱스·작업 트리는 건드리지 않는다(임시 인덱스에 담아 트리를 만든다. 참조 없는 객체가 남을 수 있으나 git gc 대상).
// 관측 범위: Git이 추적·미추적으로 보는 작업 트리 내용, 인덱스, .pace, 무시 경로의 지문(경로·크기·mtime, 폴더는 collapsed 단위).
// 관측 범위 밖: 무시 폴더 안쪽 깊은 변경, 작업 폴더 밖, 셸 자손의 밖 쓰기 — 탐지하지 못한다.

export const OBSERVATION_SCOPE = "관찰 범위: 작업 트리(추적·미추적) 내용·인덱스·HEAD·.pace 내용·Git 무시 경로 지문(경로·크기·mtime, 폴더는 collapsed 단위). 무시 폴더 안쪽 깊은 변경·작업 폴더 밖·셸 자손의 밖 쓰기는 탐지하지 못한다 — 변경 없음은 '관찰한 범위에서 미검출'이다";

export interface Snapshot {
  head: string;
  index: string;
  worktree: string;
  pace: string;
  ignored: string;
}

export class SnapshotError extends Error {}

const MAX_BUFFER = 256 * 1024 * 1024;
const MAX_PACE_BYTES = 64 * 1024 * 1024;
const MAX_IGNORED_ENTRIES = 5000;

interface Options {
  timeoutMs?: number;
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number, allowFail = false): string {
  const r = spawnSync("git", ["-c", "core.quotepath=false", "-C", cwd, ...args], { encoding: "utf8", env, timeout: timeoutMs, maxBuffer: MAX_BUFFER });
  if (r.error) throw new SnapshotError(`git ${args[0]} 실행 실패: ${r.error.message}`);
  if (r.status !== 0) {
    if (allowFail) return "";
    throw new SnapshotError(`git ${args[0]} 오류: ${(r.stderr || "").trim().slice(0, 200)}`);
  }
  return r.stdout;
}

function hashPaceDir(dir: string): string {
  const hash = createHash("sha256");
  let total = 0;
  const walk = (current: string, rel: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(current, entry.name);
      const name = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) { hash.update(`L ${name}\n`); continue; }
      if (entry.isDirectory()) { hash.update(`D ${name}\n`); walk(full, name); continue; }
      if (!entry.isFile()) continue;
      const content = readFileSync(full);
      total += content.length;
      if (total > MAX_PACE_BYTES) throw new SnapshotError(".pace 내용이 크기 한도를 넘어 해시를 만들 수 없다");
      hash.update(`F ${name} ${content.length}\n`);
      hash.update(content);
    }
  };
  walk(dir, "");
  return hash.digest("hex");
}

/** 저장소 루트 기준으로 조회·경로 해석을 통일한다 — 하위 폴더에서 실행해도 같은 파일을 본다 */
function ignoredFingerprint(root: string, env: NodeJS.ProcessEnv, timeoutMs: number): string {
  const listed = git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], env, timeoutMs).split("\0").filter((s) => s !== "");
  if (listed.length > MAX_IGNORED_ENTRIES) throw new SnapshotError(`무시 경로 항목이 ${MAX_IGNORED_ENTRIES}개를 넘어 지문을 만들 수 없다`);
  const hash = createHash("sha256");
  for (const item of listed.sort()) {
    try {
      const st = lstatSync(join(root, item));
      hash.update(`${item}|${st.isDirectory() ? "d" : st.size}|${Math.round(st.mtimeMs)}\n`);
    } catch {
      hash.update(`${item}|gone\n`);
    }
  }
  return hash.digest("hex");
}

/** git 저장소가 아니거나 git 오류·시간 초과·크기 한도면 SnapshotError — 호출자는 판정 불확실로 다룬다 */
export function takeSnapshot(cwd: string, options: Options = {}): Snapshot {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  delete env.GIT_INDEX_FILE;
  const root = git(cwd, ["rev-parse", "--show-toplevel"], env, timeoutMs).trim();
  if (root === "") throw new SnapshotError("git 작업 트리가 아니다");
  const headRaw = spawnSync("git", ["-C", cwd, "rev-parse", "-q", "--verify", "HEAD"], { encoding: "utf8", env, timeout: timeoutMs });
  if (headRaw.error) throw new SnapshotError(`git rev-parse 실행 실패: ${headRaw.error.message}`);
  const head = headRaw.status === 0 ? headRaw.stdout.trim() : "(no-commit)";
  const index = git(cwd, ["write-tree"], env, timeoutMs).trim();
  const temp = mkdtempSync(join(tmpdir(), "pace-snap-"));
  try {
    const realIndex = git(cwd, ["rev-parse", "--path-format=absolute", "--git-path", "index"], env, timeoutMs).trim();
    const tempIndex = join(temp, "index");
    if (existsSync(realIndex)) copyFileSync(realIndex, tempIndex);
    const tempEnv = { ...env, GIT_INDEX_FILE: tempIndex };
    git(cwd, ["add", "-A"], tempEnv, timeoutMs);
    const worktree = git(cwd, ["write-tree"], tempEnv, timeoutMs).trim();
    const paceDir = join(root, ".pace");
    const pace = existsSync(paceDir) ? hashPaceDir(paceDir) : "(none)";
    return { head, index, worktree, pace, ignored: ignoredFingerprint(root, env, timeoutMs) };
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    throw new SnapshotError(error instanceof Error ? error.message : String(error));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function changedParts(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  if (before.head !== after.head) out.push("head");
  if (before.index !== after.index) out.push("index");
  if (before.worktree !== after.worktree) out.push("worktree");
  if (before.pace !== after.pace) out.push("pace");
  if (before.ignored !== after.ignored) out.push("ignored");
  return out;
}

export interface ChangeSummary {
  changed: string[];
  head_before: string;
  head_after: string;
  commits: string[];
  diff_stat: string;
}

/** handoff에 실을 변경 요약 — 커밋 목록과 작업 트리 diff 통계(트리 해시끼리 비교). 요약 실패는 빈 값으로 둔다 */
export function summarizeChange(cwd: string, before: Snapshot, after: Snapshot): ChangeSummary {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  delete env.GIT_INDEX_FILE;
  const safe = (args: string[]): string => {
    try { return git(cwd, args, env, 30_000, true); } catch { return ""; }
  };
  const commits = before.head !== after.head && before.head !== "(no-commit)" && after.head !== "(no-commit)"
    ? safe(["log", "--oneline", `${before.head}..${after.head}`]).split("\n").filter((l) => l.trim() !== "").slice(0, 50)
    : [];
  const stat = before.worktree !== after.worktree ? safe(["diff", "--stat", "--no-color", before.worktree, after.worktree]).trim().slice(0, 4000) : "";
  return { changed: changedParts(before, after), head_before: before.head, head_after: after.head, commits, diff_stat: stat };
}
