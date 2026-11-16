import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { brainDir } from "./brain.ts";
import { agentKind } from "./agent-definition.ts";

/**
 * 세션을 연 위치가 어떤 상황인지 판별한다. 부트가 이 사실을 넘기고, 첫 멘트는 에이전트가 판단해 쓴다.
 * - pace: AGENTS.md·.pace/memory·.pace/AGENT.md·브레인 중 하나가 있는 프로젝트
 * - undefined: git 저장소지만 PACE 정의가 없다
 * - new: 거의 빈 폴더
 * - outside: 그 밖 (홈 폴더 포함)
 */
export type Situation = "pace" | "undefined" | "new" | "outside";

export interface GitSnapshot {
  branch: string;
  dirty: number | null;
  recent: string[];
}

export interface ProjectInfo {
  situation: Situation;
  root: string | null;
  name: string | null;
  hasAgents: boolean;
  hasBrain: boolean;
  hasMemory: boolean;
  agentInvalid: boolean;
  git: GitSnapshot | null;
}

/** 새 프로젝트로 볼 때 무시하는 파일 */
const SCAFFOLD = new Set([".git", ".DS_Store", ".gitignore", "README.md", "LICENSE", ".pace", ".claude", ".codex", ".vscode", ".idea"]);

export function analyzeProject(cwd: string, home: string = homedir(), gitDeadline?: number, includeGit = true): ProjectInfo {
  const start = resolve(cwd);
  const homeDir = resolve(home);
  const paceRoot = walkUp(start, homeDir, (dir) => existsSync(join(dir, "AGENTS.md")) || existsSync(join(dir, ".pace", "memory")) || agentKind(dir) !== "absent" || existsSync(join(brainDir(dir), "SCHEMA.md")));
  const gitRoot = walkUp(start, homeDir, (dir) => existsSync(join(dir, ".git")));
  // 둘 다 있으면 더 가까운(깊은) 쪽 — 모노레포 하위 프로젝트를 존중한다.
  let root = [paceRoot, gitRoot].filter((r): r is string => r !== null).sort((a, b) => b.length - a.length)[0] ?? null;
  let situation: Situation;
  if (root !== null && root !== paceRoot && paceRoot === null && isNearlyEmpty(root)) situation = "new";
  else if (paceRoot !== null && root === paceRoot) situation = "pace";
  else if (root !== null) situation = "undefined";
  else if (start !== homeDir && isNearlyEmpty(start)) {
    situation = "new";
    root = start;
  } else situation = "outside";

  return {
    situation,
    root,
    name: root ? basename(root) : null,
    hasAgents: root ? existsSync(join(root, "AGENTS.md")) : false,
    hasBrain: root ? existsSync(join(brainDir(root), "SCHEMA.md")) : false,
    hasMemory: root ? existsSync(join(root, ".pace", "memory")) : false,
    agentInvalid: root ? agentKind(root) === "invalid" : false,
    git: gitRoot && includeGit ? gitSnapshot(gitRoot, gitDeadline) : null,
  };
}

/** 프로젝트 메모리를 쓸 위치: PACE 정의가 있는 곳 → git 루트 → cwd. 홈 폴더는 거부한다. */
export function projectRootForMemory(cwd: string, home: string = homedir()): string {
  const info = analyzeProject(cwd, home);
  const root = info.root ?? resolve(cwd);
  if (root === resolve(home)) throw new Error("홈 폴더는 프로젝트가 아니다 — 프로젝트 폴더에서 실행하거나 프로필 메모리를 쓴다");
  return root;
}

function walkUp(start: string, home: string, test: (dir: string) => boolean): string | null {
  let dir = start;
  for (;;) {
    // 홈 폴더(~/.pace 등 도구 설정이 있는 곳)와 그 위는 프로젝트로 보지 않는다.
    if (dir === home) return null;
    if (test(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isNearlyEmpty(dir: string): boolean {
  try {
    return readdirSync(dir).filter((name) => !SCAFFOLD.has(name)).length === 0;
  } catch {
    return false;
  }
}

function gitSnapshot(root: string, outerDeadline?: number): GitSnapshot | null {
  const deadline = Math.min(outerDeadline ?? Infinity, Date.now() + 2000);
  const git = (...args: string[]) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: Math.max(1, deadline - Date.now()), env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" } });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch === null) return null;
  const status = git("status", "--porcelain");
  const log = git("log", "-3", "--format=%h %s (%cr)") ?? "";
  return {
    branch,
    dirty: status === null ? null : status === "" ? 0 : status.split("\n").length,
    recent: log === "" ? [] : log.split("\n"),
  };
}
