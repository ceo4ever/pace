import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { spawn, spawnSync, type ChildProcess, type SpawnSyncReturns } from "node:child_process";
import { packageRoot } from "../src/core/paths.ts";
import type { ProfileInput } from "../src/profile/profile.ts";

// A helper-importing child owns a sibling root, so its parent can exit first.
const inheritedTemp = realpathSync.native(tmpdir());
const inheritedOwner = process.env.PACE_TEST_TMP_OWNER;
const inheritedParent = process.env.PACE_TEST_TMP_PARENT;
let tempParent = inheritedTemp;
if (inheritedOwner && inheritedParent) {
  try {
    const owner = lstatSync(inheritedOwner);
    const withinOwner = relative(inheritedOwner, inheritedTemp);
    if (owner.isDirectory() && !owner.isSymbolicLink() && basename(inheritedOwner).startsWith("pace-test-run-") &&
        dirname(inheritedOwner) === inheritedParent && realpathSync.native(inheritedOwner) === inheritedOwner &&
        realpathSync.native(inheritedParent) === inheritedParent && !isAbsolute(withinOwner) &&
        withinOwner !== ".." && !withinOwner.startsWith(`..${sep}`)) tempParent = inheritedParent;
  } catch { /* A stale or untrusted inheritance cannot redirect cleanup. */ }
}
const tempRoot = mkdtempSync(join(tempParent, "pace-test-run-"));
const rootIdentity = lstatSync(tempRoot);
for (const key of ["TMPDIR", "TMP", "TEMP"]) process.env[key] = tempRoot;
// 테스트가 환경이나 기본 홈을 상속하더라도 실제 PACE 데이터를 쓰지 않는다.
process.env.PACE_HOME = join(tempRoot, "default-pace-home");
delete process.env.PACE_PROFILE;
process.env.PACE_TEST_TMP_OWNER = tempRoot;
process.env.PACE_TEST_TMP_PARENT = tempParent;

let childTimedOut = false;
const activeChildren = new Set<ChildProcess>();

/** 현재 테스트가 소유한 증거를 보존해야 할 때만 사용한다. 실패 판정은 호출자가 책임진다. */
export function preserveTestTemp(): void { childTimedOut = true; process.exitCode = 1; }

process.once("exit", () => {
  if (activeChildren.size > 0) {
    process.exitCode = 1;
    console.error("An active test child remains; preserving the temporary root");
    return;
  }
  if (process.env.PACE_KEEP_TEST_TMP === "1" || childTimedOut) return;
  try {
    let current: ReturnType<typeof lstatSync>;
    try { current = lstatSync(tempRoot); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== rootIdentity.dev || current.ino !== rootIdentity.ino ||
        dirname(tempRoot) !== tempParent || realpathSync.native(tempRoot) !== tempRoot || !basename(tempRoot).startsWith("pace-test-run-")) {
      throw new Error("Temporary test root was replaced; refusing cleanup");
    }
    rmSync(tempRoot, { recursive: true });
  } catch (error) {
    process.exitCode = 1;
    throw error;
  }
});

// Only children explicitly created by these tests are managed. Never scan or kill unrelated processes.
export function registerTestChild<T extends ChildProcess>(child: T, timeoutMs = 45_000): T {
  activeChildren.add(child);
  child.ref();
  const timer = setTimeout(() => {
    childTimedOut = true;
    process.exitCode = 1;
    console.error("Test child did not exit; preserving the temporary root");
    child.unref();
    for (const stream of child.stdio) stream?.destroy();
  }, timeoutMs);
  child.once("close", () => { activeChildren.delete(child); clearTimeout(timer); });
  child.once("error", () => { childTimedOut = true; process.exitCode = 1; clearTimeout(timer); });
  return child;
}

export const spawnTestChild: typeof spawn = ((...args: Parameters<typeof spawn>) =>
  registerTestChild(spawn(...args))) as typeof spawn;

export function tempDir(prefix = "pace-test-"): string {
  if (!prefix.startsWith("pace-") || basename(prefix) !== prefix || prefix.includes("\\")) throw new Error("Invalid test temporary directory prefix");
  return mkdtempSync(join(tempRoot, prefix));
}

/** 파일 프로세스/형태별 원본 한 번, 첫 호출을 포함한 모든 대상에 독립 파일 복사. */
export function reusableGitFixture(prepare: (source: string, firstDestination: string) => void): (destination: string) => void {
  let source: string | undefined;
  return (destination) => {
    const checkDestination = () => {
      const actual = realpathSync.native(destination), within = relative(tempRoot, actual);
      if (!within || isAbsolute(within) || within === ".." || within.startsWith(`..${sep}`) || lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isDirectory() || readdirSync(destination).length) throw new Error("Git fixture destination must be an empty owned directory");
    };
    checkDestination();
    let prepared = source;
    if (!prepared) {
      const candidate = tempDir("pace-git-seed-");
      prepare(candidate, destination);
      const gitDir = join(candidate, ".git");
      if (!existsSync(gitDir) || !lstatSync(gitDir).isDirectory() || lstatSync(gitDir).isSymbolicLink()) throw new Error("Git fixture must have its own .git directory");
      const plainTree = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isSymbolicLink()) throw new Error("Git fixture seed must not contain symlinks");
          if (entry.isDirectory()) plainTree(path);
          else if (!entry.isFile()) throw new Error("Git fixture seed must contain regular files only");
        }
      };
      plainTree(candidate);
      if (existsSync(join(gitDir, "worktrees")) || existsSync(join(gitDir, "objects/info/alternates")) || /^\s*(?:worktree|hooksPath|fsmonitor)\s*=|^\s*\[include(?:If)?\b/im.test(readFileSync(join(gitDir, "config"), "utf8"))) throw new Error("Git fixture seed must be self-contained");
      const env: NodeJS.ProcessEnv = { ...sessionFreeEnv(), HOME: candidate, USERPROFILE: candidate };
      for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) delete env[key];
      const head = spawnSync("git", ["-C", candidate, "rev-parse", "--verify", "HEAD"], { env, encoding: "utf8", timeout: 5000 });
      if (head.status !== 0) throw new Error(`Git fixture seed must be committed: ${head.stderr ?? head.error?.message ?? "unknown failure"}`);
      prepared = candidate;
    }
    checkDestination();
    // cpSync performs independent copies; do not use clone, alternates or hardlinks.
    cpSync(prepared, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
    source = prepared;
  };
}

export const ALTU: ProfileInput = {
  name: "default",
  displayName: "알투",
  alias: "R2D2",
  ownerName: "캡틴",
  tone: "존댓말 + 친근",
  personality: "꼼꼼하고 솔직하며 차분하다",
  language: "ko",
};

export const PACE_BIN = join(packageRoot, "bin", "pace.ts");

export function runPace(
  args: string[],
  options: { home: string; cwd?: string; input?: string; env?: NodeJS.ProcessEnv; timeout?: number },
): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [PACE_BIN, ...args], {
    cwd: options.cwd ?? options.home,
    input: options.input,
    encoding: "utf8",
    timeout: options.timeout ?? 10_000,
    env: { ...sessionFreeEnv(), HOME: options.home, USERPROFILE: options.home, PACE_PROFILE: "", ...options.env, PACE_HOME: options.home },
  });
}

/**
 * 테스트가 세션 환경을 물려받아 실제 터미널·설정에 쓰지 않게 세션 변수를 뺀 환경.
 * (v1 사고: ORCA_TERMINAL_HANDLE로 사용자 터미널에 입력, CLAUDE_CONFIG_DIR로 실제 CLAUDE.md에 씀)
 */
export function sessionFreeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (/^(ORCA_|CLAUDE_|CODEX_|GEMINI_|CURSOR_)/.test(upper) || ["PACE_PROFILE", "TERM_PROGRAM", "CLAUDECODE"].includes(upper)) continue;
    env[upper === "PATH" ? "PATH" : key] = value;
  }
  return env;
}

/** Adapts the older verify fixtures to the structured prompt when they exercise a managed stage. */
export function scopedReviewFixture(prompt: string, text: string): string {
  const category = /```pace-review\n[^\n]*"category":"([^"]+)"/.exec(prompt)?.[1];
  const verdict = /\b(pass|fail)$/.exec(text.trim())?.[1];
  if (!category || !verdict) return text;
  const scenario = /\[blocking\]\s*([^\r\n]+)/.exec(text)?.[1] ?? "관측한 실패";
  const findings = verdict === "fail" ? [{
    id: "F1", severity: "blocking", category, location: "fixture.ts:1",
    scenario, reproduction: "고정 입력으로 기존 동작을 실행한다", confidence: "high",
  }] : [];
  return [text, "```pace-review", JSON.stringify({ version: 1, findings }), "```", verdict].join("\n");
}
